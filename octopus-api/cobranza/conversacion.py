"""
Conversación de cobranza con un representante: una sola línea de tiempo con
lo que le escribió el bot (motor de Cobranza Inteligente y avisos de mora),
lo que le escribió el personal (cobros por WhatsApp) y lo que pasó con sus
deudas (gestiones, convenios, pausas, takeover, pagos). Solo lectura.

Las respuestas del representante todavía NO llegan: falta el webhook de
WhatsApp entrante (ver NOTAS_TECNICAS.md).
"""
from .gestion import MOTIVO_GESTION_HUMANA, calcular_bandeja
from .models import CicloCobranza, EnvioCobranza, EventoCiclo

LIMITE = 200
# Eventos que ya aparecen como mensaje (NotificacionLog) o que no aportan a la conversación.
EVENTOS_OMITIDOS = {'mensaje_enviado', 'aviso_interno', 'responsable_asignado'}
# Tipos de NotificacionLog que escribe una persona; el resto los escribe el sistema.
TIPOS_PERSONAL = {'cobro_whatsapp'}


def _deuda(ciclo):
    m = ciclo.mensualidad
    return f'{m.alumno.nombre} · {m.get_mes_display()} {m.anio}'


def _mensajes(rep):
    from notificaciones.models import NotificacionLog
    logs = NotificacionLog.objects.filter(
        representante_cedula=rep.cedula, canal__in=('whatsapp', 'email')).order_by('-fecha_envio')[:LIMITE]
    return [{
        'id': f'log-{log.id}', 'clase': 'mensaje',
        'autor': 'personal' if log.tipo in TIPOS_PERSONAL else 'bot',
        'canal': log.canal, 'asunto': log.asunto, 'texto': log.mensaje, 'estado': log.estado,
        'modo': log.modo, 'fecha': log.fecha_envio,
    } for log in logs]


def _simulados(rep):
    envios = (EnvioCobranza.objects.filter(representante=rep, estado=EnvioCobranza.SIMULADO)
              .select_related('regla').order_by('-creado_en')[:LIMITE])
    return [{
        'id': f'envio-{e.id}', 'clase': 'evento', 'tipo': 'mensaje_simulado', 'autor': 'bot',
        'texto': e.regla.nombre, 'canal': e.canal, 'fecha': e.creado_en, 'deudas': [],
    } for e in envios]


def _eventos(ciclos):
    """Agrupa los eventos que una misma acción dejó en varias deudas (uno por ciclo)."""
    por_ciclo = {c.id: c for c in ciclos}
    grupos = {}
    for e in (EventoCiclo.objects.filter(ciclo__in=ciclos).exclude(tipo__in=EVENTOS_OMITIDOS)
              .select_related('usuario').order_by('-creado_en', '-id')[:LIMITE * 3]):
        if e.tipo == 'whatsapp_manual' and e.detalle.get('origen') == 'cobro_whatsapp':
            continue  # ya está como mensaje del personal
        texto = e.detalle.get('texto') or e.detalle.get('motivo') or ''
        clave = (e.tipo, e.usuario_id, texto, e.creado_en.replace(microsecond=0))
        grupo = grupos.get(clave)
        if grupo is None:
            grupo = grupos[clave] = {
                'id': f'evento-{e.id}', 'clase': 'evento', 'tipo': e.tipo,
                'autor': 'personal' if e.usuario_id else 'sistema',
                'usuario': e.usuario.get_username() if e.usuario_id else None,
                'texto': texto, 'detalle': e.detalle, 'fecha': e.creado_en, 'deudas': [],
            }
        grupo['deudas'].append(_deuda(por_ciclo[e.ciclo_id]))
    return list(grupos.values())


def construir_conversacion(rep, ciclos_qs):
    ciclos = list(ciclos_qs.filter(mensualidad__alumno__representante=rep)
                  .select_related('mensualidad__alumno', 'responsable'))
    abiertos = [c for c in ciclos if c.abierto]
    tomados = [c for c in abiertos if c.motivo_pausa == MOTIVO_GESTION_HUMANA]
    fila = next(iter(calcular_bandeja(ciclos_qs.filter(mensualidad__alumno__representante=rep))), None)
    linea = sorted(_mensajes(rep) + _simulados(rep) + _eventos(ciclos), key=lambda i: i['fecha'])[-LIMITE:]
    return {
        'representante': {'id': rep.id, 'nombre': f'{rep.nombre} {rep.apellido}', 'cedula': rep.cedula,
                          'telefono': rep.telefono, 'correo': rep.correo},
        'saldo_total_usd': str(sum((c.mensualidad.monto_usd - c.mensualidad.monto_pagado for c in abiertos), 0)),
        'ciclos_abiertos': [c.id for c in abiertos],
        'deudas_abiertas': [_deuda(c) for c in abiertos],
        'gestion_humana': {
            'activa': bool(tomados),
            'responsable': next((c.responsable.get_username() for c in tomados if c.responsable_id), None),
        },
        'bot_pausado': bool(abiertos) and all(c.estado == CicloCobranza.PAUSADA for c in abiertos),
        'accion_sugerida': fila['accion_sugerida'] if fila else None,
        'razones': fila['razones'] if fila else [],
        'puntaje': fila['puntaje'] if fila else 0,
        'linea_de_tiempo': linea,
    }
