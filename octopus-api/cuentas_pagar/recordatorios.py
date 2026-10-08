"""Recordatorios de cuentas por pagar.

El canal ``whatsapp`` queda reservado: esta implementación no crea un canal
nuevo ni intenta enviar mensajes por WhatsApp mientras esté desactivado.
"""
from datetime import timedelta

from django.db import IntegrityError, transaction
from django.utils import timezone

from .models import AvisoBandeja, ConfiguracionRecordatorios, CuentaPorPagar, RecordatorioEnviado


def _configuracion():
    return ConfiguracionRecordatorios.objects.get_or_create(pk=1)[0]


def _destinatarios(configuracion, cuenta):
    usuarios = list(configuracion.usuarios_destino.all())
    if not usuarios and cuenta.responsable_id:
        usuarios = [cuenta.responsable]
    return usuarios


def _reservar(cuenta, canal, tipo, hoy, destinatario=''):
    """Reserva idempotentemente un envío antes de realizar efectos externos."""
    try:
        with transaction.atomic():
            RecordatorioEnviado.objects.create(
                cuenta=cuenta, canal=canal, tipo=tipo, fecha_referencia=hoy,
                destinatario=destinatario,
            )
        return True
    except IntegrityError:
        return False


def _mensaje(cuenta, tipo):
    return f'{cuenta.numero}: {cuenta.concepto}. Vence el {cuenta.fecha_vencimiento:%d/%m/%Y} ({tipo.replace("_", " ")}).'


def procesar_recordatorios(hoy=None):
    """Envía recordatorios pendientes. ``hoy`` permite pruebas deterministas."""
    hoy = hoy or timezone.localdate()
    config = _configuracion()
    cuentas = CuentaPorPagar.objects.exclude(estado__in=['pagada', 'anulada']).select_related('responsable', 'proveedor')
    enviados = 0
    for cuenta in cuentas:
        if cuenta.recordatorio_pospuesto_hasta and cuenta.recordatorio_pospuesto_hasta > hoy:
            continue
        dias = (cuenta.fecha_vencimiento - hoy).days
        if dias in set(config.dias_antes or []):
            tipo = 'vence_hoy' if dias == 0 else f'antes_{dias}_dias'
        elif dias < 0 and (-dias) % max(config.frecuencia_vencidas_dias, 1) == 0:
            tipo = 'vencida'
        else:
            continue
        usuarios = _destinatarios(config, cuenta)
        texto = _mensaje(cuenta, tipo)
        if config.bandeja_activa:
            # El registro se reserva por cuenta/canal/tipo/fecha: la bandeja es
            # una alerta institucional, aun cuando no se hayan configurado usuarios.
            if _reservar(cuenta, 'bandeja', tipo, hoy):
                if usuarios:
                    for usuario in usuarios:
                        AvisoBandeja.objects.create(cuenta=cuenta, usuario=usuario, titulo='Cuenta por pagar', mensaje=texto)
                else:
                    AvisoBandeja.objects.create(cuenta=cuenta, titulo='Cuenta por pagar', mensaje=texto)
                enviados += 1
        if config.email_activo:
            for usuario in usuarios:
                email = (usuario.email or '').strip()
                if not email or not _reservar(cuenta, 'email', tipo, hoy, email):
                    continue
                from notificaciones.services import enviar_email
                enviar_email(email, f'Recordatorio CxP: {cuenta.numero}', f'<p>{texto}</p>', texto, tipo='cxp_recordatorio', area='cobranza')
                enviados += 1
    return enviados


def enviar_resumen_diario(hoy=None):
    """Entrega el resumen opcional solamente si hay cuentas relevantes."""
    hoy = hoy or timezone.localdate()
    config = _configuracion()
    if not config.resumen_diario_activo:
        return 0
    limite = hoy + timedelta(days=config.ventana_por_vencer)
    cuentas = list(CuentaPorPagar.objects.exclude(estado__in=['pagada', 'anulada']).filter(fecha_vencimiento__lte=limite))
    if not cuentas:
        return 0
    texto = '\n'.join(f'- {c.numero}: vence {c.fecha_vencimiento:%d/%m/%Y}' for c in cuentas)
    enviados = 0
    if config.email_activo:
        from notificaciones.services import enviar_email
        for usuario in config.usuarios_destino.all():
            if usuario.email:
                enviar_email(usuario.email, 'Resumen diario de CxP', f'<pre>{texto}</pre>', texto, tipo='cxp_resumen', area='cobranza')
                enviados += 1
    return enviados
