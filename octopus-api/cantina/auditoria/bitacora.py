"""
Bitácora de Auditoría de Cantina — ÚNICA puerta de escritura.

Uso típico, dentro de la misma transacción que la operación auditada:

    from cantina.auditoria.bitacora import registrar_evento, snapshot

    antes = snapshot(producto, ['precio', 'costo'])
    producto.precio = nuevo_precio
    producto.save()
    registrar_evento(
        'cambio_precio', objeto=producto, request=request,
        antes=antes, despues=snapshot(producto, ['precio', 'costo']),
        motivo=motivo, area=producto.area,
    )

Cada evento guarda el hash SHA-256 de su contenido más el hash del evento
anterior (cadena). `verificar_cadena()` recorre la bitácora y detecta
cualquier fila alterada o eliminada por fuera de la aplicación.
"""
import hashlib
import json

from django.core.serializers.json import DjangoJSONEncoder
from django.db import connection, transaction
from django.utils import timezone

from cantina.models import EventoAuditoriaCantina

# Clave fija para pg_advisory_xact_lock: serializa la escritura de la cadena.
_LOCK_BITACORA = 7_310_442_001


def _a_json(valor):
    """Normaliza Decimal/fecha/UUID a tipos JSON puros (lo que se guarda es
    exactamente lo que se hashea)."""
    if valor is None:
        return None
    return json.loads(json.dumps(valor, cls=DjangoJSONEncoder))


def snapshot(instancia, campos):
    """Dict {campo: valor} listo para `antes`/`despues`."""
    return _a_json({campo: getattr(instancia, campo) for campo in campos})


def _ip_desde_request(request):
    if request is None:
        return None
    reenviada = request.META.get('HTTP_X_FORWARDED_FOR', '')
    ip = reenviada.split(',')[0].strip() if reenviada else request.META.get('REMOTE_ADDR')
    return ip or None


def _datos_usuario(usuario):
    if usuario is None or not getattr(usuario, 'is_authenticated', False):
        return None, '', ''
    nombre = (usuario.get_full_name() or usuario.get_username())[:150]
    try:
        rol = usuario.perfil.rol or ''
    except Exception:
        rol = 'superusuario' if usuario.is_superuser else ''
    return usuario, nombre, rol


def _contenido_hash(evento):
    return {
        'tipo': evento.tipo,
        'creado_en': evento.creado_en.isoformat(),
        'usuario_id': evento.usuario_id,
        'usuario_nombre': evento.usuario_nombre,
        'usuario_rol': evento.usuario_rol,
        'area': evento.area,
        'objeto_tipo': evento.objeto_tipo,
        'objeto_id': evento.objeto_id,
        'antes': evento.antes,
        'despues': evento.despues,
        'motivo': evento.motivo,
        'ip': evento.ip,
        'hash_anterior': evento.hash_anterior,
    }


def calcular_hash(evento):
    crudo = json.dumps(_contenido_hash(evento), sort_keys=True, ensure_ascii=False, cls=DjangoJSONEncoder)
    return hashlib.sha256(crudo.encode('utf-8')).hexdigest()


def registrar_evento(tipo, *, objeto=None, objeto_tipo=None, objeto_id=None, usuario=None,
                     request=None, antes=None, despues=None, motivo='', area=None):
    """
    Registra un evento en la bitácora y lo devuelve.

    - `objeto`: instancia afectada; si se pasa, objeto_tipo/objeto_id se
      derivan de ella (nombre del modelo en minúsculas y pk).
    - `usuario`: si se omite, se toma de `request.user`.
    - Debe llamarse dentro de la transacción de la operación auditada, para
      que si la operación falla, el evento tampoco quede.
    """
    if tipo not in dict(EventoAuditoriaCantina.TIPOS):
        raise ValueError(f'Tipo de evento de auditoría desconocido: {tipo!r}')
    if objeto is not None:
        objeto_tipo = objeto_tipo or objeto._meta.model_name
        objeto_id = objeto.pk
    if not objeto_tipo or objeto_id is None:
        raise ValueError('registrar_evento requiere `objeto` u `objeto_tipo` + `objeto_id`.')
    if usuario is None and request is not None:
        usuario = request.user
    usuario, nombre, rol = _datos_usuario(usuario)

    with transaction.atomic():
        if connection.vendor == 'postgresql':
            with connection.cursor() as cursor:
                cursor.execute('SELECT pg_advisory_xact_lock(%s)', [_LOCK_BITACORA])
            ultimo = EventoAuditoriaCantina.objects.order_by('-id').only('hash').first()
        else:
            ultimo = EventoAuditoriaCantina.objects.select_for_update().order_by('-id').only('hash').first()

        evento = EventoAuditoriaCantina(
            tipo=tipo,
            creado_en=timezone.now(),
            usuario=usuario,
            usuario_nombre=nombre,
            usuario_rol=rol,
            area=area,
            objeto_tipo=str(objeto_tipo)[:40],
            objeto_id=str(objeto_id)[:40],
            antes=_a_json(antes),
            despues=_a_json(despues),
            motivo=motivo or '',
            ip=_ip_desde_request(request),
            hash_anterior=ultimo.hash if ultimo else '',
        )
        evento.hash = calcular_hash(evento)
        evento.save()
    return evento


def verificar_cadena():
    """
    Recorre la bitácora en orden de creación y valida hash y encadenamiento.
    Devuelve {'ok': bool, 'total': int, 'primer_error_id': int | None,
    'motivo': str}.
    """
    anterior = ''
    total = 0
    for evento in EventoAuditoriaCantina.objects.order_by('id').iterator():
        total += 1
        if evento.hash_anterior != anterior:
            return {'ok': False, 'total': total, 'primer_error_id': evento.id,
                    'motivo': 'Cadena rota: falta o se alteró el evento anterior.'}
        if calcular_hash(evento) != evento.hash:
            return {'ok': False, 'total': total, 'primer_error_id': evento.id,
                    'motivo': 'El contenido del evento fue modificado.'}
        anterior = evento.hash
    return {'ok': True, 'total': total, 'primer_error_id': None, 'motivo': ''}
