"""
Funciones de contenido para notificaciones de cantina (Fase 6 -- SS5.4 de
cantina.md). No se crea un servicio de envio nuevo: se reutiliza tal cual
`notificaciones/services.py` (mismo email/push que ya usa `cobranza`),
siguiendo el patron exacto de `notificar_mora`/`notificar_pago_exitoso`.
"""
from notificaciones.services import (
    _push_representante,
    _render_email,
    _usuario_portal_de,
    enviar_email,
)

# Tipo de push usado para las notificaciones de cantina. No se agrega un
# tipo nuevo a `SuscripcionPush.tipos_activos`/`_tipos_push_default` (eso
# tocaria notificaciones/models.py, fuera del alcance de esta tarea) -- se
# reutiliza 'factura', el tipo ya existente mas cercano semanticamente
# (avisos de dinero/cobro al representante), consistente con como
# `notificar_mora`/`notificar_pago_exitoso` etiquetan sus propios push.
# Ver reporte final para que el agente de integracion decida si conviene
# agregar 'cantina' a `_tipos_push_default` en una tarea aparte.
TIPO_PUSH_CANTINA = 'factura'


def notificar_recarga_aprobada(recarga):
    tarjeta = recarga.tarjeta
    alumno = tarjeta.alumno
    if not alumno:  # tarjeta de personal u otra persona: sin portal de representante
        return
    rep = alumno.representante

    ctx = {
        'nombre_representante': f'{rep.nombre} {rep.apellido}',
        'nombre_alumno': f'{alumno.nombre} {alumno.apellido}',
        'monto': str(recarga.monto_usd),
        'saldo_actual': str(tarjeta.saldo),
    }

    if rep.correo:
        html = _render_email('cantina_recarga_aprobada.html', ctx)
        enviar_email(
            rep.correo, 'Recarga de cantina aprobada', html,
            tipo='cantina_recarga_aprobada',
            representante_cedula=rep.cedula,
            alumno_nombre=ctx['nombre_alumno'],
        )

    usuario_portal = _usuario_portal_de(rep)
    if usuario_portal:
        _push_representante(
            usuario_portal, TIPO_PUSH_CANTINA, 'Recarga aprobada',
            f'Se acreditaron ${ctx["monto"]} a la tarjeta de {ctx["nombre_alumno"]}',
            url='/portal', tipo_log='cantina_recarga_aprobada',
            representante_cedula=rep.cedula, alumno_nombre=ctx['nombre_alumno'],
        )


def notificar_recarga_anulada(recarga, recarga_corregida=None):
    """Avisa el reverso o la corrección sin bloquear la operación principal."""
    tarjeta = recarga.tarjeta
    alumno = tarjeta.alumno
    if not alumno:
        return
    rep = alumno.representante
    ctx = {
        'nombre_representante': f'{rep.nombre} {rep.apellido}',
        'nombre_alumno': f'{alumno.nombre} {alumno.apellido}',
        'monto': str(recarga.monto_usd),
        'saldo_actual': str(tarjeta.saldo),
        'motivo': recarga.motivo_anulacion,
        'corregida': bool(recarga_corregida),
        'monto_corregido': str(recarga_corregida.monto_usd) if recarga_corregida else '',
    }
    asunto = 'Recarga de cantina corregida' if recarga_corregida else 'Recarga de cantina anulada'
    if rep.correo:
        html = _render_email('cantina_recarga_anulada.html', ctx)
        enviar_email(
            rep.correo, asunto, html, tipo='cantina_recarga_anulada',
            representante_cedula=rep.cedula, alumno_nombre=ctx['nombre_alumno'],
        )
    usuario_portal = _usuario_portal_de(rep)
    if usuario_portal:
        detalle = (
            f'La recarga de ${ctx["monto"]} fue corregida a ${ctx["monto_corregido"]}.'
            if recarga_corregida else f'La recarga de ${ctx["monto"]} fue anulada.'
        )
        _push_representante(
            usuario_portal, TIPO_PUSH_CANTINA, asunto, detalle,
            url='/portal', tipo_log='cantina_recarga_anulada',
            representante_cedula=rep.cedula, alumno_nombre=ctx['nombre_alumno'],
        )


def notificar_saldo_negativo(tarjeta, dias_mora):
    """Al representante del alumno (email + push) o, si la tarjeta es de
    una persona de CxC, a esa persona solo por email (no tiene portal)."""
    rep = tarjeta.alumno.representante if tarjeta.alumno_id else None
    cliente = tarjeta.cliente if not rep and tarjeta.cliente_id else None
    if not (rep or cliente):
        return

    ctx = {
        'nombre_representante': cliente.nombre_completo if cliente else f'{rep.nombre} {rep.apellido}',
        'nombre_alumno': tarjeta.titular_nombre,
        'saldo': str(tarjeta.saldo),
        'dias_mora': dias_mora,
        'es_cliente': bool(cliente),
    }

    correo = cliente.email if cliente else rep.correo
    if correo:
        html = _render_email('cantina_saldo_negativo.html', ctx)
        enviar_email(
            correo, f'Saldo de cantina en negativo -- {ctx["nombre_alumno"]}', html,
            tipo='cantina_saldo_negativo',
            representante_cedula=rep.cedula if rep else '',
            alumno_nombre=ctx['nombre_alumno'],
        )

    usuario_portal = _usuario_portal_de(rep) if rep else None
    if usuario_portal:
        _push_representante(
            usuario_portal, TIPO_PUSH_CANTINA, 'Saldo de cantina negativo',
            f'La tarjeta de {ctx["nombre_alumno"]} esta en ${ctx["saldo"]}',
            url='/portal', tipo_log='cantina_saldo_negativo',
            representante_cedula=rep.cedula, alumno_nombre=ctx['nombre_alumno'],
        )
