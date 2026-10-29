"""
Conciliación semiautomática: cruza una línea del estado de cuenta bancario
contra la base de datos (pagos registrados y comprobantes pendientes del
portal) y deja constancia en un lote de revisión abierto por usuario.

Decisiones (ver PROMPT_MODULO_CONCILIADOR.md):
  - Match por los últimos 4–6 dígitos de la referencia, mismo banco receptor.
  - La unidad conciliable es la OPERACIÓN (operacion_uuid): una transferencia
    puede cubrir a varios hermanos.
  - Una línea del banco (MovimientoBancarioConciliado) puede cubrir VARIAS
    operaciones (pago conjunto: caja registró por separado las mensualidades
    de los hermanos). La diferencia se evalúa sobre la suma, y una línea
    conciliada a medias puede completarse después.
  - La diferencia (banco - sistema) se recalcula en el servidor. Si supera la
    tolerancia se exige una observación; igual se puede conciliar.
  - El excedente solo se registra: no se toca ningún saldo.
  - Un comprobante pendiente del portal NO se aprueba al conciliar: aparece
    como candidato `comprobante_por_procesar` y el operador lo procesa en
    caja (POST cobranza/registrar-pago/ con comprobante_portal_id). El pago
    resultante aparece luego como una operación normal (tipo 'pago') y es la
    que se concilia. Un solo camino de aprobación: el de caja.
"""
import logging
import os
import re
import uuid
from collections import Counter
from datetime import date, timedelta
from decimal import Decimal, InvalidOperation
from itertools import combinations

from django.db import IntegrityError, transaction
from django.db.models import Max, Min, Q
from django.utils import timezone
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import (
    BancoInstitucional, ConciliacionBancaria, LoteRevisionCaja, MovimientoBancarioConciliado, Pago,
    TasaCambio,
)
from .permissions import filtrar_por_sede

logger = logging.getLogger(__name__)

ROLES_PERMITIDOS = ('director', 'sistemas', 'administrador', 'cobranza', 'cajero')
TOLERANCIA_DEFECTO = Decimal('200.00')
CENT = Decimal('0.01')
MAX_RESULTADOS = 50


# ─────────────────────────────────────────────────────────────────────────────
# Utilidades
# ─────────────────────────────────────────────────────────────────────────────

def _tiene_permiso(user):
    rol = getattr(getattr(user, 'perfil', None), 'rol', '')
    return user.is_superuser or rol in ROLES_PERMITIDOS


def tolerancia_global():
    from secretaria.models import ConfiguracionSistema
    config = ConfiguracionSistema.objects.first()
    valor = getattr(config, 'tolerancia_conciliacion_ves', None)
    return Decimal(valor) if valor is not None else TOLERANCIA_DEFECTO


def _dec(valor, campo):
    try:
        texto = str(valor).strip()
        if ',' in texto and '.' not in texto:
            texto = texto.replace(',', '.')
        d = Decimal(texto)
    except (InvalidOperation, AttributeError):
        raise ValueError(f'{campo} inválido.')
    if not d.is_finite():
        raise ValueError(f'{campo} inválido.')
    return d.quantize(CENT)


def _fecha(valor):
    if isinstance(valor, date):
        return valor
    try:
        return date.fromisoformat(str(valor)[:10])
    except (TypeError, ValueError):
        raise ValueError('transaccion.fecha inválida (use AAAA-MM-DD).')


def _fecha_pago(pago):
    return timezone.localtime(pago.fecha_pago).date()


def _recalcular_fechas(lote):
    """fecha_inicio/fecha_fin = mín/máx de fecha_pago de los pagos del lote."""
    agg = lote.pagos.aggregate(mn=Min('fecha_pago'), mx=Max('fecha_pago'))
    if agg['mn'] and agg['mx']:
        lote.fecha_inicio = timezone.localtime(agg['mn']).date()
        lote.fecha_fin = timezone.localtime(agg['mx']).date()
        lote.save(update_fields=['fecha_inicio', 'fecha_fin'])


def serializar_conciliacion(c):
    return {
        'id': c.id,
        'lote_id': c.lote_id,
        'operacion_uuid': str(c.operacion_uuid),
        'banco': c.banco.nombre,
        'banco_id': c.banco_id,
        'referencia_banco': c.referencia_banco,
        'fecha_banco': c.fecha_banco.isoformat(),
        'monto_banco_ves': str(c.monto_banco_ves),
        'monto_sistema_ves': str(c.monto_sistema_ves),
        'diferencia_ves': str(c.diferencia_ves),
        'tolerancia_aplicada_ves': str(c.tolerancia_aplicada_ves),
        'fuera_tolerancia': c.fuera_tolerancia,
        'observacion': c.observacion,
        'archivo_estado_cuenta': c.archivo_estado_cuenta,
        'comprobante_aprobado_id': c.comprobante_aprobado_id,
        'movimiento_id': c.movimiento_id,
        'monto_operacion_ves': str(c.monto_operacion_ves),
    }


def serializar_movimiento(m, total_operaciones=None):
    """Línea del banco ya conciliada, con sus agregados (puede cubrir varias operaciones)."""
    return {
        'id': m.id,
        'banco_id': m.banco_id,
        'referencia': m.referencia,
        'fecha': m.fecha.isoformat(),
        'monto_banco_ves': str(m.monto_banco_ves),
        'monto_sistema_ves': str(m.monto_sistema_ves),
        'diferencia_ves': str(m.diferencia_ves),
        'fuera_tolerancia': m.fuera_tolerancia,
        'total_operaciones': (
            m.conciliaciones.count() if total_operaciones is None else total_operaciones
        ),
    }


def serializar_lote(lote, con_conciliaciones=False):
    data = {
        'id': lote.id,
        'estado': lote.estado,
        'fecha_inicio': lote.fecha_inicio.isoformat(),
        'fecha_fin': lote.fecha_fin.isoformat(),
        'total_operaciones': lote.conciliaciones.count(),
    }
    if con_conciliaciones:
        data['conciliaciones'] = [
            serializar_conciliacion(c)
            for c in lote.conciliaciones.select_related('banco').order_by('creado_en')
        ]
    return data


def _lote_abierto(user):
    return LoteRevisionCaja.objects.filter(usuario=user, estado='abierto').first()


def _obtener_o_crear_lote_abierto(user):
    lote = _lote_abierto(user)
    if lote:
        return lote
    hoy = timezone.localdate()
    return LoteRevisionCaja.objects.create(
        usuario=user, estado='abierto', fecha_inicio=hoy, fecha_fin=hoy,
    )


# ─────────────────────────────────────────────────────────────────────────────
# GET candidatos
# ─────────────────────────────────────────────────────────────────────────────

def _parsear_rango(desde, hasta):
    """('yyyy-MM-dd' | None, idem) → (date|None, date|None). Lanza ErrorConciliacion."""
    def una(valor, campo):
        if valor in (None, ''):
            return None
        try:
            return date.fromisoformat(str(valor).strip())
        except ValueError:
            raise ErrorConciliacion(f'{campo} inválida (use AAAA-MM-DD).')
    d, h = una(desde, 'desde'), una(hasta, 'hasta')
    if d and h and d > h:
        raise ErrorConciliacion('desde no puede ser posterior a hasta.')
    return d, h


def listar_operaciones(user, banco_id, *, sufijo=None, desde=None, hasta=None, solo_no_conciliadas=False,
                       fechas_linea=None, request=None):
    """
    Operaciones del banco receptor visibles para `user`: pagos `completado`
    agrupados por operación + comprobantes `pendiente` del portal (tipo
    `comprobante_por_procesar`, ver `listar_comprobantes_por_procesar`).

    Fecha de filtro (desde/hasta, inclusivos, en hora local): `Pago.fecha_pago`
    y `ComprobantePago.fecha_subida` (el comprobante no guarda otra fecha).
    `sufijo` filtra por referencia terminada en esos dígitos; los comprobantes
    sin referencia se filtran por fecha (`fechas_linea`: fechas de las líneas
    del banco buscadas, para la ventana cuando no hay rango).
    """
    resultados = []

    # ── Pagos registrados, agrupados por operación ──
    filtros = {'banco_receptor_id': banco_id, 'estatus': 'completado'}
    if sufijo:
        filtros['referencia__endswith'] = sufijo
    if desde:
        filtros['fecha_pago__date__gte'] = desde
    if hasta:
        filtros['fecha_pago__date__lte'] = hasta
    pagos = list(
        filtrar_por_sede(user, Pago.objects.filter(**filtros), campo='sede')
        .select_related('alumno__representante')
        .order_by('-fecha_pago')
    )
    grupos = {}
    for p in pagos:
        grupos.setdefault(p.operacion_uuid, []).append(p)

    conciliadas = {
        c.operacion_uuid: c.lote_id
        for c in ConciliacionBancaria.objects.filter(operacion_uuid__in=list(grupos))
    }

    for uuid_op, items in grupos.items():
        if solo_no_conciliadas and uuid_op in conciliadas:
            continue
        primero = items[0]
        rep = primero.alumno.representante
        alumnos = []
        for p in items:
            nombre = f'{p.alumno.nombre} {p.alumno.apellido}'.strip()
            if nombre not in alumnos:
                alumnos.append(nombre)
        resultados.append({
            'operacion_uuid': str(uuid_op),
            'comprobante_id': None,
            'tipo': 'pago',
            'referencia': primero.referencia,
            'fecha': _fecha_pago(primero).isoformat(),
            'monto_ves': str(sum((p.monto_ves for p in items), Decimal('0')).quantize(CENT)),
            'representante_id': rep.id,
            'representante': f'{rep.nombre} {rep.apellido}'.strip(),
            'alumnos': alumnos,
            'pagos_ids': [p.id for p in items],
            'conciliado': uuid_op in conciliadas,
            'lote_id': conciliadas.get(uuid_op),
            'se_aprobara': False,
        })

    # ── Comprobantes pendientes del portal (por procesar en caja) ──
    resultados.extend(listar_comprobantes_por_procesar(
        user, banco_id, sufijo=sufijo, desde=desde, hasta=hasta,
        fechas_linea=fechas_linea, request=request,
    ))
    return resultados


# Ventana (en días, a cada lado) alrededor de la fecha de la línea del banco en
# la que se buscan comprobantes SIN referencia cuando la búsqueda es por
# sufijo y no trae rango de fechas. El representante suele subir el
# comprobante el mismo día o pocos días después de transferir; ±5 días cubre
# fines de semana/feriados sin inundar la lista. Sin fecha de línea, la
# ventana se centra en hoy.
VENTANA_COMPROBANTES_DIAS = 5


def _url_archivo_comprobante(request, comprobante):
    """Ruta protegida del archivo (misma que portal.views): /media/ no tiene
    control de acceso real si nginx la sirve estático en producción."""
    if not comprobante.archivo:
        return None
    ruta = f'/media-protegido/comprobantes/{os.path.basename(comprobante.archivo.name)}/'
    return request.build_absolute_uri(ruta) if request is not None else ruta


def _tipo_archivo(archivo):
    if not archivo:
        return None
    extension = os.path.splitext(archivo.name or '')[1].lower()
    if extension == '.pdf':
        return 'pdf'
    if extension in {'.jpg', '.jpeg', '.png', '.gif', '.webp', '.heic', '.heif', '.bmp'}:
        return 'imagen'
    return None


def _tasa_en(fecha, cache_tasas):
    """Tasa BCV (valor_bs) de la fecha, o la última anterior; si no hay
    ninguna, la última registrada; None si no existe ninguna tasa."""
    if fecha in cache_tasas:
        return cache_tasas[fecha]
    from finanzas.monedas import tasa_para_fecha
    try:
        valor = tasa_para_fecha(fecha).valor_bs
    except TasaCambio.DoesNotExist:
        ultima = TasaCambio.objects.order_by('-fecha').first()
        valor = ultima.valor_bs if ultima else None
    cache_tasas[fecha] = valor
    return valor


def listar_comprobantes_por_procesar(user, banco_id, *, sufijo=None, desde=None, hasta=None,
                                     fechas_linea=None, request=None):
    """
    Comprobantes `pendiente` del portal candidatos para una línea del banco.
    Ya no se aprueban al conciliar: se informan como `comprobante_por_procesar`
    para que el operador los procese en caja.

    - Banco: el receptor elegido o ninguno (desde que el representante solo
      sube el archivo, los comprobantes nuevos no traen banco ni referencia).
    - Con `sufijo`: los que tienen referencia deben terminar en él; los que no
      tienen referencia se incluyen por fecha (rango `desde/hasta` o, sin
      rango, ±VENTANA_COMPROBANTES_DIAS alrededor de `fechas_linea`).
    - Sin `sufijo`: todos los del rango de fechas (fecha_subida).
    `monto_ves` es una ESTIMACIÓN: saldo pendiente de la mensualidad
    (monto_usd − monto_pagado) × tasa BCV de la fecha de subida.
    """
    from portal.models import ComprobantePago

    qs = ComprobantePago.objects.filter(estatus='pendiente').filter(
        Q(banco_receptor_id=banco_id) | Q(banco_receptor__isnull=True),
    )
    if desde:
        qs = qs.filter(fecha_subida__date__gte=desde)
    if hasta:
        qs = qs.filter(fecha_subida__date__lte=hasta)
    if sufijo:
        sin_referencia = Q(referencia_bancaria__isnull=True) | Q(referencia_bancaria='')
        if not (desde or hasta):
            fechas = [f for f in (fechas_linea or []) if f] or [timezone.localdate()]
            inicio = min(fechas) - timedelta(days=VENTANA_COMPROBANTES_DIAS)
            fin = max(fechas) + timedelta(days=VENTANA_COMPROBANTES_DIAS)
            sin_referencia &= Q(fecha_subida__date__gte=inicio, fecha_subida__date__lte=fin)
        qs = qs.filter(Q(referencia_bancaria__endswith=sufijo) | sin_referencia)
    comprobantes = (
        filtrar_por_sede(user, qs, campo='mensualidad__alumno__sede')
        .select_related('mensualidad__alumno__representante')
        .order_by('-fecha_subida')
    )
    resultados, cache_tasas = [], {}
    for c in comprobantes:
        mensualidad = c.mensualidad
        alumno = mensualidad.alumno
        rep = alumno.representante
        fecha = timezone.localtime(c.fecha_subida).date()
        saldo_usd = max(
            (mensualidad.monto_usd or Decimal('0')) - (mensualidad.monto_pagado or Decimal('0')),
            Decimal('0'),
        ).quantize(CENT)
        tasa = _tasa_en(fecha, cache_tasas)
        monto_ves = (saldo_usd * tasa).quantize(CENT) if tasa is not None else Decimal('0.00')
        resultados.append({
            'operacion_uuid': None,
            'comprobante_id': c.id,
            'tipo': 'comprobante_por_procesar',
            'referencia': c.referencia_bancaria or '',
            'fecha': fecha.isoformat(),
            'monto_ves': str(monto_ves),
            'monto_estimado': True,
            'saldo_usd': str(saldo_usd),
            'tasa_ves': str(tasa) if tasa is not None else None,
            'banco_receptor_id': c.banco_receptor_id,
            'metodo_pago': c.metodo_pago or None,
            'representante_id': rep.id,
            'representante': f'{rep.nombre} {rep.apellido}'.strip(),
            'cedula_representante': rep.cedula,
            'alumno_id': alumno.id,
            'alumnos': [f'{alumno.nombre} {alumno.apellido}'.strip()],
            'mensualidad': {
                'id': mensualidad.id,
                'mes': mensualidad.mes,
                'anio': mensualidad.anio,
                'nombre': f'{mensualidad.get_mes_display()} {mensualidad.anio}',
                'monto_usd': str(mensualidad.monto_usd),
                'saldo_usd': str(saldo_usd),
            },
            'archivo_url': _url_archivo_comprobante(request, c),
            'archivo_tipo': _tipo_archivo(c.archivo),
            'pagos_ids': [],
            'conciliado': False,
            'lote_id': None,
            'se_aprobara': False,
        })
    return resultados


def _parsear_fechas_linea(valor):
    """'AAAA-MM-DD[,AAAA-MM-DD...]' → [date]. Lanza ErrorConciliacion."""
    fechas = []
    for parte in str(valor or '').split(','):
        parte = parte.strip()
        if not parte:
            continue
        try:
            fechas.append(date.fromisoformat(parte))
        except ValueError:
            raise ErrorConciliacion('fecha inválida (use AAAA-MM-DD).')
    return fechas[:MAX_RESULTADOS]


class CandidatosConciliacionView(APIView):
    """
    GET cobranza/conciliacion/candidatos/?banco=<id>&ref=<4-6 dígitos>[&desde=&hasta=][&fecha=]

    Operaciones candidatas del banco receptor cuya referencia termina en los
    dígitos indicados: pagos `completado` agrupados por operación y
    comprobantes `pendiente` del portal (`comprobante_por_procesar`: se
    procesan en caja, NO se aprueban al conciliar).

    `desde`/`hasta` (AAAA-MM-DD, inclusivos) filtran por fecha de pago
    (Pago.fecha_pago; comprobante: fecha_subida). `ref` es obligatorio salvo
    que se indique desde y/o hasta. `fecha` (una o varias separadas por coma):
    fecha de la(s) línea(s) del banco; sin rango, los comprobantes sin
    referencia se buscan a ±VENTANA_COMPROBANTES_DIAS de ella.
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        if not _tiene_permiso(request.user):
            return Response({'error': 'Sin permiso.'}, status=status.HTTP_403_FORBIDDEN)

        ref = (request.query_params.get('ref') or '').strip()
        try:
            desde, hasta = _parsear_rango(
                request.query_params.get('desde'), request.query_params.get('hasta'),
            )
            fechas_linea = _parsear_fechas_linea(request.query_params.get('fecha'))
        except ErrorConciliacion as exc:
            return Response({'error': exc.mensaje}, status=status.HTTP_400_BAD_REQUEST)
        con_rango = bool(desde or hasta)
        if ref or not con_rango:
            if not re.fullmatch(r'\d{4,6}', ref):
                return Response({'error': 'ref debe tener entre 4 y 6 dígitos.'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            banco_id = int(request.query_params.get('banco'))
        except (TypeError, ValueError):
            return Response({'error': 'banco inválido.'}, status=status.HTTP_400_BAD_REQUEST)
        if not BancoInstitucional.objects.filter(id=banco_id).exists():
            return Response({'error': 'Banco no encontrado.'}, status=status.HTTP_400_BAD_REQUEST)

        resultados = listar_operaciones(
            request.user, banco_id, sufijo=ref or None, desde=desde, hasta=hasta,
            fechas_linea=fechas_linea, request=request,
        )
        return Response({
            'resultados': resultados[:MAX_RESULTADOS],
            'movimientos_previos': listar_movimientos_previos(banco_id, sufijo=ref or None, desde=desde, hasta=hasta),
        })


def listar_movimientos_previos(banco_id, *, sufijo=None, desde=None, hasta=None):
    """
    Líneas del banco ya conciliadas (movimientos) que coinciden con la búsqueda.
    El modal las usa para avisar que, al elegir esa línea, las operaciones se
    AGREGAN al movimiento (completar un pago conjunto) y para calcular la
    diferencia sobre el total del movimiento.
    """
    qs = MovimientoBancarioConciliado.objects.filter(banco_id=banco_id)
    if sufijo:
        qs = qs.filter(referencia__endswith=sufijo)
    if desde:
        qs = qs.filter(fecha__gte=desde)
    if hasta:
        qs = qs.filter(fecha__lte=hasta)
    movimientos = list(qs.order_by('-fecha')[:MAX_RESULTADOS])
    ops = {}
    for c in ConciliacionBancaria.objects.filter(movimiento__in=movimientos).only('movimiento_id', 'operacion_uuid'):
        ops.setdefault(c.movimiento_id, []).append(c.operacion_uuid)
    alumnos_por_op = {}
    for p in Pago.objects.filter(
        operacion_uuid__in=[u for lista in ops.values() for u in lista],
    ).select_related('alumno'):
        alumnos_por_op.setdefault(p.operacion_uuid, set()).add(f'{p.alumno.nombre} {p.alumno.apellido}'.strip())
    resultado = []
    for m in movimientos:
        data = serializar_movimiento(m, total_operaciones=len(ops.get(m.id, [])))
        data['alumnos'] = sorted({a for u in ops.get(m.id, []) for a in alumnos_por_op.get(u, ())})
        resultado.append(data)
    return resultado


# ─────────────────────────────────────────────────────────────────────────────
# POST conciliar
# ─────────────────────────────────────────────────────────────────────────────

class ErrorConciliacion(Exception):
    """Error de negocio al conciliar un ítem (mensaje en español + código HTTP)."""

    def __init__(self, mensaje, http_status=status.HTTP_400_BAD_REQUEST):
        super().__init__(mensaje)
        self.mensaje = mensaje
        self.http_status = http_status


def parsear_transaccion(tx):
    """Valida {referencia, fecha, monto} → (referencia, fecha, monto)."""
    tx = tx if isinstance(tx, dict) else {}
    referencia = str(tx.get('referencia') or '').strip()
    if not referencia:
        raise ErrorConciliacion('transaccion.referencia es requerida.')
    try:
        return referencia, _fecha(tx.get('fecha')), _dec(tx.get('monto'), 'transaccion.monto')
    except ValueError as exc:
        raise ErrorConciliacion(str(exc))


def parsear_tolerancia(valor):
    """Tolerancia explícita (valor absoluto) o la global si viene vacía."""
    if valor in (None, ''):
        return tolerancia_global()
    try:
        return abs(_dec(valor, 'tolerancia'))
    except ValueError as exc:
        raise ErrorConciliacion(str(exc))


MAX_OPERACIONES_POR_MOVIMIENTO = 20
MSG_PROCESAR_EN_CAJA = 'Procese el comprobante en caja antes de conciliarlo.'


def _resolver_operacion(user, banco, operacion_uuid, comprobante_id):
    """
    Resuelve UNA operación a conciliar (dentro de la transacción del llamador).
    Un comprobante del portal ya no se concilia directamente: se procesa en
    caja y se concilia el pago resultante. Devuelve
    (operacion_uuid, pagos, comprobante_del_portal|None).
    """
    if bool(operacion_uuid) == bool(comprobante_id):
        raise ErrorConciliacion('Indique operacion_uuid o comprobante_id (solo uno).')
    if comprobante_id:
        raise ErrorConciliacion(MSG_PROCESAR_EN_CAJA)
    try:
        operacion_uuid = uuid.UUID(str(operacion_uuid))
    except ValueError:
        raise ErrorConciliacion('operacion_uuid inválido.')
    pagos = list(filtrar_por_sede(user, Pago.objects.filter(
        operacion_uuid=operacion_uuid, banco_receptor=banco, estatus='completado',
    ), campo='sede').select_related('alumno'))
    if not pagos:
        raise ErrorConciliacion('Operación no encontrada para ese banco.', status.HTTP_404_NOT_FOUND)
    if ConciliacionBancaria.objects.filter(operacion_uuid=operacion_uuid).exists():
        raise ErrorConciliacion('Esta operación ya fue conciliada.')
    # Trazabilidad: si la operación se registró en caja procesando un
    # comprobante del portal, la conciliación lo referencia.
    from portal.models import ComprobantePago
    comprobante = ComprobantePago.objects.filter(pago__in=pagos).order_by('id').first()
    return operacion_uuid, pagos, comprobante


def conciliar_movimiento(user, banco, *, operaciones, referencia_banco, fecha_banco, monto_banco,
                         tolerancia, observacion='', archivo=''):
    """
    Concilia una línea del estado de cuenta contra UNA O VARIAS operaciones
    (`operaciones`: [{operacion_uuid | comprobante_id}]). Lógica única
    compartida por `conciliar/` y `auto/confirmar/`.

    Caso típico de varias: el representante paga con una sola transferencia
    las mensualidades de dos hijos que caja registró como operaciones
    separadas. La diferencia (banco − sistema) se evalúa sobre la SUMA.

    Si la línea ya había sido conciliada (movimiento existente), las
    operaciones se AGREGAN a ese movimiento y se recalcula la diferencia del
    conjunto: así se completa un pago conjunto conciliado a medias. El monto
    de la línea debe coincidir con el ya registrado.

    Antifraude: si el movimiento mezcla operaciones de representantes
    distintos se exige observación (igual que al superar la tolerancia).

    Un `comprobante_id` se rechaza (400): el comprobante se procesa primero en
    caja y se concilia el pago resultante (operacion_uuid).

    Atómica por sí misma (savepoint si ya hay una transacción abierta): ante
    cualquier ErrorConciliacion no queda ningún efecto.
    Devuelve (conciliaciones_nuevas, lote, advertencias, movimiento).
    """
    if not isinstance(operaciones, list) or not operaciones:
        raise ErrorConciliacion('Indique al menos una operación a conciliar.')
    if len(operaciones) > MAX_OPERACIONES_POR_MOVIMIENTO:
        raise ErrorConciliacion(f'Máximo {MAX_OPERACIONES_POR_MOVIMIENTO} operaciones por transacción del banco.')
    observacion = str(observacion or '').strip()
    archivo = str(archivo or '').strip()[:255]

    advertencias = []
    try:
        with transaction.atomic():
            movimiento = MovimientoBancarioConciliado.objects.select_for_update().filter(
                banco=banco, referencia=referencia_banco, fecha=fecha_banco,
            ).first()
            if movimiento and movimiento.monto_banco_ves != monto_banco:
                raise ErrorConciliacion(
                    f'Esa transacción del estado de cuenta ya fue conciliada con un monto de '
                    f'{movimiento.monto_banco_ves} Bs; el monto enviado ({monto_banco} Bs) no coincide.'
                )
            previas = list(movimiento.conciliaciones.all()) if movimiento else []

            nuevas, vistas = [], {c.operacion_uuid for c in previas}
            for item in operaciones:
                item = item if isinstance(item, dict) else {}
                op_uuid, pagos, comprobante = _resolver_operacion(
                    user, banco, item.get('operacion_uuid') or None, item.get('comprobante_id') or None,
                )
                if op_uuid in vistas:
                    raise ErrorConciliacion('Una misma operación aparece más de una vez en la transacción.')
                vistas.add(op_uuid)
                monto_op = sum((p.monto_ves for p in pagos), Decimal('0')).quantize(CENT)
                nuevas.append((op_uuid, pagos, comprobante, monto_op))

            monto_sistema = (
                sum((c.monto_operacion_ves for c in previas), Decimal('0'))
                + sum((n[3] for n in nuevas), Decimal('0'))
            ).quantize(CENT)
            diferencia = (monto_banco - monto_sistema).quantize(CENT)
            fuera = abs(diferencia) > tolerancia
            if fuera and not observacion:
                raise ErrorConciliacion('La diferencia supera la tolerancia: la observación es obligatoria.')

            representantes = {p.alumno.representante_id for n in nuevas for p in n[1]}
            if previas:
                representantes |= set(Pago.objects.filter(
                    operacion_uuid__in=[c.operacion_uuid for c in previas],
                ).values_list('alumno__representante_id', flat=True))
            if len(representantes) > 1 and not observacion:
                raise ErrorConciliacion(
                    'La transacción cubre pagos de representantes distintos: la observación es obligatoria.'
                )

            agregados = {
                'monto_sistema_ves': monto_sistema, 'diferencia_ves': diferencia,
                'fuera_tolerancia': fuera, 'tolerancia_aplicada_ves': tolerancia,
            }
            if movimiento is None:
                movimiento = MovimientoBancarioConciliado.objects.create(
                    banco=banco, referencia=referencia_banco, fecha=fecha_banco,
                    monto_banco_ves=monto_banco, **agregados,
                )
            else:
                for campo, valor in agregados.items():
                    setattr(movimiento, campo, valor)
                movimiento.save(update_fields=[*agregados, 'actualizado_en'])
                # Las conciliaciones previas guardan copia de los agregados: se sincronizan.
                movimiento.conciliaciones.update(
                    monto_sistema_ves=monto_sistema, diferencia_ves=diferencia, fuera_tolerancia=fuera,
                )

            lote = _obtener_o_crear_lote_abierto(user)
            creadas = []
            for op_uuid, pagos, comprobante, monto_op in nuevas:
                creadas.append(ConciliacionBancaria.objects.create(
                    lote=lote,
                    movimiento=movimiento,
                    operacion_uuid=op_uuid,
                    monto_operacion_ves=monto_op,
                    banco=banco,
                    referencia_banco=referencia_banco,
                    fecha_banco=fecha_banco,
                    monto_banco_ves=monto_banco,
                    monto_sistema_ves=monto_sistema,
                    diferencia_ves=diferencia,
                    tolerancia_aplicada_ves=tolerancia,
                    fuera_tolerancia=fuera,
                    observacion=observacion,
                    archivo_estado_cuenta=archivo,
                    comprobante_aprobado=comprobante,
                    usuario=user,
                ))
                lote.pagos.add(*pagos)
            _recalcular_fechas(lote)
    except IntegrityError:
        raise ErrorConciliacion('La operación o la línea del estado de cuenta ya fue conciliada.')
    return creadas, lote, advertencias, movimiento


def conciliar_item(user, banco, *, operacion_uuid, comprobante_id, referencia_banco,
                   fecha_banco, monto_banco, tolerancia, observacion='', archivo=''):
    """Atajo de `conciliar_movimiento` para una sola operación.
    Devuelve (conciliacion, lote, advertencias)."""
    creadas, lote, advertencias, _mov = conciliar_movimiento(
        user, banco,
        operaciones=[{'operacion_uuid': operacion_uuid, 'comprobante_id': comprobante_id}],
        referencia_banco=referencia_banco, fecha_banco=fecha_banco, monto_banco=monto_banco,
        tolerancia=tolerancia, observacion=observacion, archivo=archivo,
    )
    return creadas[0], lote, advertencias


class ConciliarOperacionView(APIView):
    """
    POST cobranza/conciliacion/conciliar/

    Body: { operaciones: [{operacion_uuid | comprobante_id}, ...]
              (o, compatible: operacion_uuid | comprobante_id),
            banco, transaccion: {referencia, fecha, monto},
            tolerancia?, observacion?, archivo? }

    Varias operaciones = una sola transferencia que cubre varias operaciones
    del sistema (ej. mensualidades de hermanos). Si la línea del banco ya
    estaba conciliada, las operaciones se agregan a ese movimiento.
    """
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        if not _tiene_permiso(request.user):
            return Response({'error': 'Sin permiso.'}, status=status.HTTP_403_FORBIDDEN)

        data = request.data
        operaciones = data.get('operaciones')
        if operaciones is None:
            operacion_uuid = data.get('operacion_uuid') or None
            comprobante_id = data.get('comprobante_id') or None
            if bool(operacion_uuid) == bool(comprobante_id):
                return Response(
                    {'error': 'Indique operacion_uuid o comprobante_id (solo uno).'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            operaciones = [{'operacion_uuid': operacion_uuid, 'comprobante_id': comprobante_id}]
        try:
            banco = BancoInstitucional.objects.get(id=int(data.get('banco')))
        except (TypeError, ValueError, BancoInstitucional.DoesNotExist):
            return Response({'error': 'Banco inválido.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            referencia_banco, fecha_banco, monto_banco = parsear_transaccion(data.get('transaccion'))
            tolerancia = parsear_tolerancia(data.get('tolerancia'))
            creadas, lote, advertencias, movimiento = conciliar_movimiento(
                request.user, banco, operaciones=operaciones,
                referencia_banco=referencia_banco, fecha_banco=fecha_banco,
                monto_banco=monto_banco, tolerancia=tolerancia,
                observacion=data.get('observacion'), archivo=data.get('archivo'),
            )
        except ErrorConciliacion as exc:
            return Response({'error': exc.mensaje}, status=exc.http_status)

        respuesta = {
            'conciliacion': serializar_conciliacion(creadas[0]),
            'conciliaciones': [serializar_conciliacion(c) for c in creadas],
            'movimiento': serializar_movimiento(movimiento),
            'lote': serializar_lote(lote),
        }
        if advertencias:
            respuesta['advertencias'] = advertencias
        return Response(respuesta, status=status.HTTP_201_CREATED)


# ─────────────────────────────────────────────────────────────────────────────
# Lote abierto
# ─────────────────────────────────────────────────────────────────────────────

class LoteAbiertoView(APIView):
    """GET cobranza/conciliacion/lotes/abierto/ → lote abierto del usuario (o null)."""
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        if not _tiene_permiso(request.user):
            return Response({'error': 'Sin permiso.'}, status=status.HTTP_403_FORBIDDEN)
        lote = _lote_abierto(request.user)
        return Response({'lote': serializar_lote(lote, con_conciliaciones=True) if lote else None})


class FinalizarLoteAbiertoView(APIView):
    """POST cobranza/conciliacion/lotes/abierto/finalizar/ → cierra el lote abierto."""
    permission_classes = [permissions.IsAuthenticated]

    @transaction.atomic
    def post(self, request):
        if not _tiene_permiso(request.user):
            return Response({'error': 'Sin permiso.'}, status=status.HTTP_403_FORBIDDEN)
        lote = LoteRevisionCaja.objects.select_for_update().filter(
            usuario=request.user, estado='abierto',
        ).first()
        if not lote:
            return Response({'error': 'No tiene un lote abierto.'}, status=status.HTTP_404_NOT_FOUND)
        if not lote.pagos.exists():
            return Response({'error': 'El lote abierto no tiene operaciones.'}, status=status.HTTP_400_BAD_REQUEST)

        _recalcular_fechas(lote)
        lote.estado = 'finalizado'
        lote.save(update_fields=['estado'])
        return Response(serializar_lote(lote, con_conciliaciones=True))


# ─────────────────────────────────────────────────────────────────────────────
# Conciliación masiva: propuestas (solo lectura) y confirmación en lote
# ─────────────────────────────────────────────────────────────────────────────

MAX_ITEMS_CONFIRMAR = 500
MAX_TRANSACCIONES_PROPUESTAS = 5000


def _solo_digitos(texto):
    return re.sub(r'\D', '', str(texto or ''))


def _refs_coinciden(a, b, digitos):
    """Últimos `digitos` dígitos iguales; si alguna referencia tiene menos
    dígitos que `digitos`, se exige igualdad completa."""
    da, db = _solo_digitos(a), _solo_digitos(b)
    if not da or not db:
        return False
    if len(da) < digitos or len(db) < digitos:
        return da == db
    return da[-digitos:] == db[-digitos:]


def _tx_json(t):
    return {'referencia': t['referencia'], 'fecha': t['fecha'].isoformat(), 'monto': str(t['monto'])}


def _elegir_unica(opciones, tolerancia):
    """
    opciones: [(clave, diferencia_abs)]. Devuelve la clave única que resuelve el
    empate (única opción; o exacta única; o, sin exactas, única dentro de
    tolerancia) o None si es ambiguo.
    """
    if len(opciones) == 1:
        return opciones[0][0]
    exactas = [k for k, d in opciones if d == 0]
    if len(exactas) == 1:
        return exactas[0]
    if exactas:
        return None
    dentro = [k for k, d in opciones if d <= tolerancia]
    return dentro[0] if len(dentro) == 1 else None


def _parsear_transacciones(lista):
    """Valida el arreglo de transacciones → lista de dicts (sin duplicados ref+fecha)."""
    if not isinstance(lista, list):
        raise ErrorConciliacion('transacciones debe ser una lista.')
    if len(lista) > MAX_TRANSACCIONES_PROPUESTAS:
        raise ErrorConciliacion(f'Máximo {MAX_TRANSACCIONES_PROPUESTAS} transacciones por petición.')
    vistas, resultado = set(), []
    for i, tx in enumerate(lista):
        try:
            ref, fecha, monto = parsear_transaccion(tx)
        except ErrorConciliacion as exc:
            raise ErrorConciliacion(f'transacciones[{i}]: {exc.mensaje}')
        if (ref, fecha) in vistas:
            continue  # la unicidad de la BD es banco+referencia+fecha
        vistas.add((ref, fecha))
        resultado.append({'referencia': ref, 'fecha': fecha, 'monto': monto})
    return resultado


def _asignar(ops, lineas, tolerancia):
    """
    Asignación uno-a-uno por rondas de acuerdo mutuo: una operación y una línea
    se emparejan si cada una elige a la otra de forma única. Devuelve
    (pares {i_op: i_linea}, pendientes {i_op: {i_linea,...}} sin resolver).
    """
    ady = {i: set(op['_lineas']) for i, op in enumerate(ops)}
    pares = {}
    while True:
        elige_op = {}
        for i, cand in ady.items():
            if i in pares or not cand:
                continue
            k = _elegir_unica(
                [(j, abs(lineas[j]['monto'] - ops[i]['_monto'])) for j in sorted(cand)], tolerancia,
            )
            if k is not None:
                elige_op[i] = k
        reclaman = {}
        for i, cand in ady.items():
            if i in pares:
                continue
            for j in cand:
                reclaman.setdefault(j, []).append(i)
        nuevos = {}
        for i, j in elige_op.items():
            k = _elegir_unica(
                [(o, abs(lineas[j]['monto'] - ops[o]['_monto'])) for o in sorted(reclaman[j])], tolerancia,
            )
            if k == i:
                nuevos[i] = j
        if not nuevos:
            break
        pares.update(nuevos)
        tomadas = set(nuevos.values())
        for i in ady:
            ady[i] -= tomadas
    return pares, {i: c for i, c in ady.items() if i not in pares}


MAX_OPS_GRUPO = 6  # por representante y línea: acota las combinaciones (2^6)


def _lineas_disponibles(banco, transacciones, tolerancia):
    """
    Líneas del estado de cuenta que todavía pueden conciliarse:
      - las libres (sin movimiento), y
      - las ya conciliadas cuyo movimiento quedó con EXCEDENTE fuera de
        tolerancia (banco > sistema): típicamente un pago conjunto de
        hermanos del que solo se concilió una mensualidad. Se marcan con
        `_previo` (monto ya conciliado) y `_reps_previos` (representantes).
    El resto de las líneas usadas se ignora por completo.
    """
    movimientos = {
        (m.referencia, m.fecha): m
        for m in MovimientoBancarioConciliado.objects.filter(
            banco=banco, fecha__in={t['fecha'] for t in transacciones},
        )
    }
    reps_por_mov = {}
    abiertos = [m.id for m in movimientos.values() if m.diferencia_ves > tolerancia]
    if abiertos:
        ops_por_mov = {}
        for mov_id, op in ConciliacionBancaria.objects.filter(
            movimiento_id__in=abiertos,
        ).values_list('movimiento_id', 'operacion_uuid'):
            ops_por_mov.setdefault(op, mov_id)
        for op, rep in Pago.objects.filter(
            operacion_uuid__in=list(ops_por_mov),
        ).values_list('operacion_uuid', 'alumno__representante_id'):
            reps_por_mov.setdefault(ops_por_mov[op], set()).add(rep)

    lineas = []
    for t in transacciones:
        m = movimientos.get((t['referencia'], t['fecha']))
        if m is None:
            lineas.append(t)
        elif m.id in reps_por_mov and m.monto_banco_ves == t['monto']:
            lineas.append({**t, '_previo': m.monto_sistema_ves, '_reps_previos': reps_por_mov[m.id]})
    return lineas


def _agrupar(ops, lineas, pares, tolerancia):
    """
    Pago conjunto: asigna una línea del banco que no quedó emparejada 1:1 a un
    CONJUNTO de operaciones del MISMO representante cuya suma la cuadra
    (dentro de la tolerancia). En una línea ya conciliada con excedente
    (`_previo`), el conjunto completa lo que falta, puede ser de una sola
    operación y debe ser de un representante que ya está en el movimiento.

    Solo propone resoluciones únicas (`_elegir_unica`) y descarta conjuntos que
    se disputan una misma operación: ante la duda, el operador decide.
    Devuelve {j_linea: (i_op, ...)}.
    """
    ops_libres = [i for i in range(len(ops)) if i not in pares]
    tomadas = set(pares.values())
    elegidos = {}
    for j, t in enumerate(lineas):
        if j in tomadas:
            continue
        con_previo = '_previo' in t
        objetivo = t['monto'] - (t['_previo'] if con_previo else Decimal('0'))
        por_rep = {}
        for i in ops_libres:
            rep = ops[i].get('representante_id')
            if j in ops[i]['_lineas_todas'] and (not con_previo or rep in t['_reps_previos']):
                por_rep.setdefault(rep, []).append(i)
        opciones = []
        for idxs in por_rep.values():
            idxs = idxs[:MAX_OPS_GRUPO]
            for r in range(1 if con_previo else 2, len(idxs) + 1):
                for combo in combinations(idxs, r):
                    d = abs(objetivo - sum((ops[i]['_monto'] for i in combo), Decimal('0')))
                    if d <= tolerancia:
                        opciones.append((combo, d))
        if opciones:
            combo = _elegir_unica(opciones, tolerancia)
            if combo:
                elegidos[j] = combo
    uso = Counter(i for combo in elegidos.values() for i in combo)
    return {j: combo for j, combo in elegidos.items() if all(uso[i] == 1 for i in combo)}


CAMPOS_COMPROBANTE_PROPUESTA = (
    'cedula_representante', 'representante_id', 'alumno_id', 'mensualidad', 'archivo_url',
    'archivo_tipo', 'banco_receptor_id', 'metodo_pago', 'monto_estimado', 'saldo_usd', 'tasa_ves',
)


def _sugerir_comprobantes(ops, lineas, *, ocupadas, tolerancia, digitos):
    """
    Sugerencias "requiere procesar en caja": empareja comprobantes del portal
    con líneas LIBRES (`ocupadas` = tomadas por pagos o candidatas de algún
    pago) cuando el acuerdo es único en ambos sentidos (`_asignar`).
    Criterio por comprobante: monto estimado dentro de la tolerancia y, si
    trae referencia, que coincida; si no, fecha de la línea a
    ±VENTANA_COMPROBANTES_DIAS de la fecha de subida.
    Devuelve {i_op: j_linea}.
    """
    indices = [i for i, op in enumerate(ops) if op['tipo'] != 'pago']
    if not indices:
        return {}
    ventana = timedelta(days=VENTANA_COMPROBANTES_DIAS)
    sub = []
    for i in indices:
        op = ops[i]
        fecha = date.fromisoformat(op['fecha'])
        candidatas = []
        for j, t in enumerate(lineas):
            if j in ocupadas or '_previo' in t:
                continue
            if abs(t['monto'] - op['_monto']) > tolerancia:
                continue
            if op['referencia']:
                if not _refs_coinciden(op['referencia'], t['referencia'], digitos):
                    continue
            elif abs(t['fecha'] - fecha) > ventana:
                continue
            candidatas.append(j)
        sub.append({'_lineas': candidatas, '_monto': op['_monto']})
    pares, _pendientes = _asignar(sub, lineas, tolerancia)
    return {indices[k]: j for k, j in pares.items()}


class PropuestasConciliacionView(APIView):
    """
    POST cobranza/conciliacion/auto/propuestas/  (solo lectura)

    Body: {banco, desde, hasta, tolerancia?, digitos? (4..8, def. 6),
           transacciones: [{referencia, fecha, monto}]}
    Cruza las líneas del estado de cuenta con las operaciones y comprobantes
    pendientes del banco receptor en el rango, aún no conciliadas.

    Los comprobantes del portal (`comprobante_por_procesar`) NUNCA se emparejan
    automáticamente ni son confirmables (`confirmable: false`): si una línea
    libre (sin ningún pago candidato) coincide de forma única con uno de ellos
    por monto estimado (dentro de la tolerancia) y fecha (±VENTANA_COMPROBANTES_DIAS
    de la subida; o por referencia si el comprobante la trae), sale como
    sugerencia `requiere_caja` con esa línea, para procesarlo en caja.
    """
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        if not _tiene_permiso(request.user):
            return Response({'error': 'Sin permiso.'}, status=status.HTTP_403_FORBIDDEN)
        data = request.data
        try:
            try:
                banco = BancoInstitucional.objects.get(id=int(data.get('banco')))
            except (TypeError, ValueError):
                raise ErrorConciliacion('Banco inválido.')
            except BancoInstitucional.DoesNotExist:
                raise ErrorConciliacion('Banco no encontrado.', status.HTTP_404_NOT_FOUND)
            desde, hasta = _parsear_rango(data.get('desde'), data.get('hasta'))
            if not desde or not hasta:
                raise ErrorConciliacion('desde y hasta son requeridos.')
            tolerancia = parsear_tolerancia(data.get('tolerancia'))
            try:
                digitos = 6 if data.get('digitos') in (None, '') else int(data.get('digitos'))
            except (TypeError, ValueError):
                raise ErrorConciliacion('digitos inválido (4 a 8).')
            if not 4 <= digitos <= 8:
                raise ErrorConciliacion('digitos inválido (4 a 8).')
            transacciones = _parsear_transacciones(data.get('transacciones'))
        except ErrorConciliacion as exc:
            return Response({'error': exc.mensaje}, status=exc.http_status)

        lineas = _lineas_disponibles(banco, transacciones, tolerancia)

        ops = listar_operaciones(
            request.user, banco.id, desde=desde, hasta=hasta, solo_no_conciliadas=True, request=request,
        )
        ops.sort(key=lambda o: (o['fecha'], o['tipo'], o['operacion_uuid'] or '', o['comprobante_id'] or 0))
        lineas_con_op = set()
        for op in ops:
            op['_monto'] = Decimal(op['monto_ves'])
            # Los comprobantes del portal quedan fuera del emparejamiento
            # automático (1:1 y pago conjunto): se sugieren aparte.
            op['_lineas_todas'] = [] if op['tipo'] != 'pago' else [
                j for j, t in enumerate(lineas) if _refs_coinciden(op['referencia'], t['referencia'], digitos)
            ]
            # El emparejamiento 1:1 solo usa líneas libres; las ya conciliadas
            # (con excedente) solo se completan en la pasada de pago conjunto.
            op['_lineas'] = [j for j in op['_lineas_todas'] if '_previo' not in lineas[j]]
            lineas_con_op.update(op['_lineas_todas'])

        pares, pendientes = _asignar(ops, lineas, tolerancia)
        grupos = _agrupar(ops, lineas, pares, tolerancia)
        grupo_de = {i: j for j, combo in grupos.items() for i in combo}
        tomadas_por_grupo = set(grupos)
        sugerencias = _sugerir_comprobantes(
            ops, lineas, ocupadas=set(pares.values()) | tomadas_por_grupo | lineas_con_op,
            tolerancia=tolerancia, digitos=digitos,
        )
        lineas_con_op.update(sugerencias.values())

        propuestas = []
        resumen = {
            'total': 0, 'exactas': 0, 'dentro_tolerancia': 0,
            'fuera_tolerancia': 0, 'ambiguas': 0, 'sin_banco': 0, 'requiere_caja': 0,
        }
        clave_resumen = {
            'exacta': 'exactas', 'dentro_tolerancia': 'dentro_tolerancia',
            'fuera_tolerancia': 'fuera_tolerancia', 'ambigua': 'ambiguas', 'sin_banco': 'sin_banco',
            'requiere_caja': 'requiere_caja',
        }
        for i, op in enumerate(ops):
            tx, candidatas, dif, grupo, por_defecto = None, [], None, None, op['tipo'] == 'pago'
            if i in sugerencias:
                t = lineas[sugerencias[i]]
                tx = _tx_json(t)
                dif = str((t['monto'] - op['_monto']).quantize(CENT))
                estado = 'requiere_caja'
            elif op['tipo'] != 'pago':
                estado = 'sin_banco'
            elif i in pares or i in grupo_de:
                j = pares[i] if i in pares else grupo_de[i]
                t = lineas[j]
                tx = _tx_json(t)
                monto_sistema = op['_monto']
                if i in grupo_de:
                    combo = grupos[j]
                    previo = t.get('_previo') or Decimal('0')
                    monto_sistema = previo + sum((ops[k]['_monto'] for k in combo), Decimal('0'))
                    grupo = {
                        'clave': f"{t['referencia']}|{t['fecha'].isoformat()}",
                        'operaciones': len(combo),
                        'monto_sistema_ves': str(monto_sistema.quantize(CENT)),
                        'monto_previo_ves': str(previo.quantize(CENT)) if '_previo' in t else None,
                    }
                    # Un pago conjunto se marca entero o no se marca.
                    por_defecto = all(ops[k]['tipo'] == 'pago' for k in combo)
                d = (t['monto'] - monto_sistema).quantize(CENT)
                dif = str(d)
                estado = 'exacta' if d == 0 else 'dentro_tolerancia' if abs(d) <= tolerancia else 'fuera_tolerancia'
            else:
                restantes = (pendientes.get(i) or set()) - tomadas_por_grupo
                if restantes:
                    estado = 'ambigua'
                    candidatas = [_tx_json(lineas[j]) for j in sorted(restantes)]
                else:
                    estado = 'sin_banco'
            propuesta = {
                'id': i,
                'estado': estado,
                'tipo': op['tipo'],
                'operacion_uuid': op['operacion_uuid'],
                'comprobante_id': op['comprobante_id'],
                'representante': op['representante'],
                'alumnos': op['alumnos'],
                'fecha': op['fecha'],
                'referencia_sistema': op['referencia'],
                'monto_sistema_ves': op['monto_ves'],
                'transaccion': tx,
                'candidatas': candidatas,
                'diferencia_ves': dif,
                'grupo': grupo,
                'confirmable': op['tipo'] == 'pago',
                'seleccionada_por_defecto': estado in ('exacta', 'dentro_tolerancia') and por_defecto,
            }
            if op['tipo'] != 'pago':
                propuesta.update({k: op.get(k) for k in CAMPOS_COMPROBANTE_PROPUESTA})
            propuestas.append(propuesta)
            resumen['total'] += 1
            resumen[clave_resumen[estado]] += 1
        resumen['pagos_conjuntos'] = len(grupos)

        # Líneas libres del banco sin ninguna operación asociada (ni siquiera candidata).
        sin_operacion = [
            _tx_json(t) for j, t in enumerate(lineas) if j not in lineas_con_op and '_previo' not in t
        ]
        return Response({'propuestas': propuestas, 'resumen': resumen, 'sin_operacion': sin_operacion})


class ConfirmarMasivaView(APIView):
    """
    POST cobranza/conciliacion/auto/confirmar/

    Body: {banco, tolerancia?, archivo?, items: [{operacion_uuid | comprobante_id,
           transaccion: {referencia, fecha, monto}, observacion?}]}
    Los ítems con la misma transacción (referencia + fecha) se concilian juntos
    como un pago conjunto vía `conciliar_movimiento` (misma lógica que
    `conciliar/`), cada grupo en su propio savepoint: un error no revierte los
    demás grupos. Máx. 500 ítems.
    """
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        if not _tiene_permiso(request.user):
            return Response({'error': 'Sin permiso.'}, status=status.HTTP_403_FORBIDDEN)
        data = request.data
        try:
            banco = BancoInstitucional.objects.get(id=int(data.get('banco')))
        except (TypeError, ValueError):
            return Response({'error': 'Banco inválido.'}, status=status.HTTP_400_BAD_REQUEST)
        except BancoInstitucional.DoesNotExist:
            return Response({'error': 'Banco no encontrado.'}, status=status.HTTP_404_NOT_FOUND)
        items = data.get('items')
        if not isinstance(items, list) or not items:
            return Response({'error': 'items debe ser una lista no vacía.'}, status=status.HTTP_400_BAD_REQUEST)
        if len(items) > MAX_ITEMS_CONFIRMAR:
            return Response(
                {'error': f'Máximo {MAX_ITEMS_CONFIRMAR} ítems por petición.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            tolerancia = parsear_tolerancia(data.get('tolerancia'))
        except ErrorConciliacion as exc:
            return Response({'error': exc.mensaje}, status=status.HTTP_400_BAD_REQUEST)
        archivo = data.get('archivo')

        # Los ítems que apuntan a la MISMA línea del banco (referencia + fecha)
        # forman un pago conjunto: se concilian juntos y la diferencia se
        # evalúa sobre su suma. Cada grupo va en su propio savepoint.
        conciliadas, errores = [], []
        grupos = {}
        for indice, item in enumerate(items):
            try:
                if not isinstance(item, dict):
                    raise ErrorConciliacion('Ítem inválido.')
                ref, fecha, monto = parsear_transaccion(item.get('transaccion'))
            except ErrorConciliacion as exc:
                errores.append({'indice': indice, 'error': exc.mensaje})
                continue
            grupos.setdefault((ref, fecha), []).append((indice, item, monto))

        for (ref, fecha), miembros in grupos.items():
            indices = [m[0] for m in miembros]
            try:
                montos = {m[2] for m in miembros}
                if len(montos) > 1:
                    raise ErrorConciliacion('Los ítems de una misma transacción del banco traen montos distintos.')
                observaciones = []
                for _i, item, _m in miembros:
                    obs = str(item.get('observacion') or '').strip()
                    if obs and obs not in observaciones:
                        observaciones.append(obs)
                with transaction.atomic():
                    creadas, _lote, advertencias, _mov = conciliar_movimiento(
                        request.user, banco,
                        operaciones=[
                            {'operacion_uuid': item.get('operacion_uuid') or None,
                             'comprobante_id': item.get('comprobante_id') or None}
                            for _i, item, _m in miembros
                        ],
                        referencia_banco=ref, fecha_banco=fecha, monto_banco=montos.pop(),
                        tolerancia=tolerancia, observacion=' | '.join(observaciones), archivo=archivo,
                    )
            except ErrorConciliacion as exc:
                errores.extend({'indice': i, 'error': exc.mensaje} for i in indices)
                continue
            for i, conciliacion in zip(indices, creadas):
                entrada = {'indice': i, 'conciliacion_id': conciliacion.id}
                if advertencias:
                    entrada['advertencias'] = advertencias
                conciliadas.append(entrada)
        conciliadas.sort(key=lambda c: c['indice'])
        errores.sort(key=lambda e: e['indice'])

        lote = _lote_abierto(request.user)
        return Response({
            'conciliadas': conciliadas,
            'errores': errores,
            'lote': {'id': lote.id, 'total_operaciones': lote.conciliaciones.count()} if lote else None,
        })
