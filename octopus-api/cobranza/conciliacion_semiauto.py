"""
Conciliación semiautomática: cruza una línea del estado de cuenta bancario
contra la base de datos (pagos registrados y comprobantes pendientes del
portal) y deja constancia en un lote de revisión abierto por usuario.

Decisiones (ver PROMPT_MODULO_CONCILIADOR.md):
  - Match por los últimos 4–6 dígitos de la referencia, mismo banco receptor.
  - La unidad conciliable es la OPERACIÓN (operacion_uuid): una transferencia
    puede cubrir a varios hermanos.
  - La diferencia (banco - sistema) se recalcula en el servidor. Si supera la
    tolerancia se exige una observación; igual se puede conciliar.
  - El excedente solo se registra: no se toca ningún saldo.
  - Un comprobante pendiente del portal se aprueba al conciliarlo, con los
    mismos efectos que la aprobación manual (portal.services).
"""
import logging
import re
import uuid
from datetime import date
from decimal import Decimal, InvalidOperation

from django.db import IntegrityError, transaction
from django.db.models import Max, Min
from django.utils import timezone
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import BancoInstitucional, ConciliacionBancaria, LoteRevisionCaja, Pago, TasaCambio
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


def listar_operaciones(user, banco_id, *, sufijo=None, desde=None, hasta=None, solo_no_conciliadas=False):
    """
    Operaciones del banco receptor visibles para `user`: pagos `completado`
    agrupados por operación + comprobantes `pendiente` del portal.

    Fecha de filtro (desde/hasta, inclusivos, en hora local): `Pago.fecha_pago`
    y `ComprobantePago.fecha_subida` (equivalente a la fecha de pago del
    comprobante: el modelo no guarda otra). `sufijo` filtra por referencia
    terminada en esos dígitos.
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
            'representante': f'{rep.nombre} {rep.apellido}'.strip(),
            'alumnos': alumnos,
            'pagos_ids': [p.id for p in items],
            'conciliado': uuid_op in conciliadas,
            'lote_id': conciliadas.get(uuid_op),
            'se_aprobara': False,
        })

    # ── Comprobantes pendientes del portal ──
    from portal.models import ComprobantePago

    filtros = {'banco_receptor_id': banco_id, 'estatus': 'pendiente'}
    if sufijo:
        filtros['referencia_bancaria__endswith'] = sufijo
    if desde:
        filtros['fecha_subida__date__gte'] = desde
    if hasta:
        filtros['fecha_subida__date__lte'] = hasta
    comprobantes = (
        filtrar_por_sede(user, ComprobantePago.objects.filter(**filtros), campo='mensualidad__alumno__sede')
        .select_related('mensualidad__alumno__representante')
        .order_by('-fecha_subida')
    )
    tasa = TasaCambio.objects.order_by('-fecha').first()
    tasa_valor = tasa.valor_bs if tasa else Decimal('1')
    for c in comprobantes:
        alumno = c.mensualidad.alumno
        rep = alumno.representante
        resultados.append({
            'operacion_uuid': None,
            'comprobante_id': c.id,
            'tipo': 'comprobante_pendiente',
            'referencia': c.referencia_bancaria,
            'fecha': timezone.localtime(c.fecha_subida).date().isoformat(),
            'monto_ves': str((c.mensualidad.monto_usd * tasa_valor).quantize(CENT)),
            'representante': f'{rep.nombre} {rep.apellido}'.strip(),
            'alumnos': [f'{alumno.nombre} {alumno.apellido}'.strip()],
            'pagos_ids': [],
            'conciliado': False,
            'lote_id': None,
            'se_aprobara': True,
        })
    return resultados


class CandidatosConciliacionView(APIView):
    """
    GET cobranza/conciliacion/candidatos/?banco=<id>&ref=<4-6 dígitos>[&desde=&hasta=]

    Operaciones candidatas del banco receptor cuya referencia termina en los
    dígitos indicados: pagos `completado` agrupados por operación y
    comprobantes `pendiente` del portal (que se aprobarán al conciliar).

    `desde`/`hasta` (AAAA-MM-DD, inclusivos) filtran por fecha de pago
    (Pago.fecha_pago; comprobante: fecha_subida). `ref` es obligatorio salvo
    que se indique desde y/o hasta.
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
        )
        return Response({'resultados': resultados[:MAX_RESULTADOS]})


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


def conciliar_item(user, banco, *, operacion_uuid, comprobante_id, referencia_banco,
                   fecha_banco, monto_banco, tolerancia, observacion='', archivo=''):
    """
    Concilia UNA operación (o aprueba un comprobante pendiente y lo concilia).
    Lógica única compartida por `conciliar/` y `auto/confirmar/`.

    Atómica por sí misma (savepoint si ya hay una transacción abierta): ante
    cualquier ErrorConciliacion no queda ningún efecto. Devuelve
    (conciliacion, lote, advertencias).
    """
    if bool(operacion_uuid) == bool(comprobante_id):
        raise ErrorConciliacion('Indique operacion_uuid o comprobante_id (solo uno).')
    if operacion_uuid:
        try:
            operacion_uuid = uuid.UUID(str(operacion_uuid))
        except ValueError:
            raise ErrorConciliacion('operacion_uuid inválido.')
    observacion = str(observacion or '').strip()
    archivo = str(archivo or '').strip()[:255]

    # La línea del banco no puede reutilizarse (verificación temprana; la
    # restricción única de la BD cubre la carrera).
    if ConciliacionBancaria.objects.filter(
        banco=banco, referencia_banco=referencia_banco, fecha_banco=fecha_banco,
    ).exists():
        raise ErrorConciliacion('Esa transacción del estado de cuenta ya fue usada en otra conciliación.')

    advertencias = []
    pago_notificar = None
    try:
        with transaction.atomic():
            comprobante = None
            if comprobante_id:
                comprobante, pagos, advertencias, pago_notificar = _aprobar_comprobante(
                    user, banco, comprobante_id,
                )
                operacion_uuid = pagos[0].operacion_uuid
            else:
                pagos = list(filtrar_por_sede(user, Pago.objects.filter(
                    operacion_uuid=operacion_uuid, banco_receptor=banco, estatus='completado',
                ), campo='sede'))
                if not pagos:
                    raise ErrorConciliacion('Operación no encontrada para ese banco.', status.HTTP_404_NOT_FOUND)
                if ConciliacionBancaria.objects.filter(operacion_uuid=operacion_uuid).exists():
                    raise ErrorConciliacion('Esta operación ya fue conciliada.')

            monto_sistema = sum((p.monto_ves for p in pagos), Decimal('0')).quantize(CENT)
            diferencia = (monto_banco - monto_sistema).quantize(CENT)
            fuera = abs(diferencia) > tolerancia
            if fuera and not observacion:
                # Al propagar la excepción se revierte la aprobación del comprobante.
                raise ErrorConciliacion('La diferencia supera la tolerancia: la observación es obligatoria.')

            lote = _obtener_o_crear_lote_abierto(user)
            conciliacion = ConciliacionBancaria.objects.create(
                lote=lote,
                operacion_uuid=operacion_uuid,
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
            )
            lote.pagos.add(*pagos)
            _recalcular_fechas(lote)

            if pago_notificar:
                mensualidad, pago = pago_notificar
                from portal.services import notificar_pago_aprobado
                transaction.on_commit(lambda: notificar_pago_aprobado(mensualidad, pago))
    except IntegrityError:
        raise ErrorConciliacion('La operación o la línea del estado de cuenta ya fue conciliada.')
    return conciliacion, lote, advertencias


def _aprobar_comprobante(user, banco, comprobante_id):
    """Aprueba el comprobante vía servicio. Devuelve
    (comprobante, [pago], advertencias, (mensualidad, pago)) o lanza ErrorConciliacion."""
    from portal.models import ComprobantePago
    from portal.services import ComprobanteNoEncontrado, ComprobanteYaProcesado, aprobar_comprobante

    try:
        comprobante_id = int(comprobante_id)
    except (TypeError, ValueError):
        raise ErrorConciliacion('Comprobante no encontrado.', status.HTTP_404_NOT_FOUND)
    visible = filtrar_por_sede(
        user, ComprobantePago.objects.filter(id=comprobante_id),
        campo='mensualidad__alumno__sede',
    ).first()
    if not visible:
        raise ErrorConciliacion('Comprobante no encontrado.', status.HTTP_404_NOT_FOUND)
    if visible.banco_receptor_id != banco.id:
        raise ErrorConciliacion('El comprobante pertenece a otro banco receptor.')
    try:
        comprobante, pago, mensualidad, advertencias = aprobar_comprobante(
            comprobante_id, user,
            observaciones='Aprobado automáticamente por conciliación bancaria',
        )
    except ComprobanteNoEncontrado:
        raise ErrorConciliacion('Comprobante no encontrado.', status.HTTP_404_NOT_FOUND)
    except ComprobanteYaProcesado as exc:
        raise ErrorConciliacion(f'Este comprobante ya fue procesado (estatus actual: {exc.estatus}).')
    return comprobante, [pago], advertencias, (mensualidad, pago)


class ConciliarOperacionView(APIView):
    """
    POST cobranza/conciliacion/conciliar/

    Body: { operacion_uuid | comprobante_id, banco,
            transaccion: {referencia, fecha, monto},
            tolerancia?, observacion?, archivo? }
    """
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        if not _tiene_permiso(request.user):
            return Response({'error': 'Sin permiso.'}, status=status.HTTP_403_FORBIDDEN)

        data = request.data
        operacion_uuid = data.get('operacion_uuid') or None
        comprobante_id = data.get('comprobante_id') or None
        if bool(operacion_uuid) == bool(comprobante_id):
            return Response(
                {'error': 'Indique operacion_uuid o comprobante_id (solo uno).'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            banco = BancoInstitucional.objects.get(id=int(data.get('banco')))
        except (TypeError, ValueError, BancoInstitucional.DoesNotExist):
            return Response({'error': 'Banco inválido.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            referencia_banco, fecha_banco, monto_banco = parsear_transaccion(data.get('transaccion'))
            tolerancia = parsear_tolerancia(data.get('tolerancia'))
            conciliacion, lote, advertencias = conciliar_item(
                request.user, banco,
                operacion_uuid=operacion_uuid, comprobante_id=comprobante_id,
                referencia_banco=referencia_banco, fecha_banco=fecha_banco,
                monto_banco=monto_banco, tolerancia=tolerancia,
                observacion=data.get('observacion'), archivo=data.get('archivo'),
            )
        except ErrorConciliacion as exc:
            return Response({'error': exc.mensaje}, status=exc.http_status)

        respuesta = {
            'conciliacion': serializar_conciliacion(conciliacion),
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


class PropuestasConciliacionView(APIView):
    """
    POST cobranza/conciliacion/auto/propuestas/  (solo lectura)

    Body: {banco, desde, hasta, tolerancia?, digitos? (4..8, def. 6),
           transacciones: [{referencia, fecha, monto}]}
    Cruza las líneas del estado de cuenta con las operaciones y comprobantes
    pendientes del banco receptor en el rango, aún no conciliadas.
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

        # Líneas ya usadas: se ignoran por completo.
        usadas = set(ConciliacionBancaria.objects.filter(banco=banco).values_list(
            'referencia_banco', 'fecha_banco',
        ))
        lineas = [t for t in transacciones if (t['referencia'], t['fecha']) not in usadas]

        ops = listar_operaciones(
            request.user, banco.id, desde=desde, hasta=hasta, solo_no_conciliadas=True,
        )
        ops.sort(key=lambda o: (o['fecha'], o['tipo'], o['operacion_uuid'] or '', o['comprobante_id'] or 0))
        lineas_con_op = set()
        for op in ops:
            op['_monto'] = Decimal(op['monto_ves'])
            op['_lineas'] = [
                j for j, t in enumerate(lineas) if _refs_coinciden(op['referencia'], t['referencia'], digitos)
            ]
            lineas_con_op.update(op['_lineas'])

        pares, pendientes = _asignar(ops, lineas, tolerancia)

        propuestas = []
        resumen = {
            'total': 0, 'exactas': 0, 'dentro_tolerancia': 0,
            'fuera_tolerancia': 0, 'ambiguas': 0, 'sin_banco': 0,
        }
        clave_resumen = {
            'exacta': 'exactas', 'dentro_tolerancia': 'dentro_tolerancia',
            'fuera_tolerancia': 'fuera_tolerancia', 'ambigua': 'ambiguas', 'sin_banco': 'sin_banco',
        }
        for i, op in enumerate(ops):
            tx, candidatas, dif = None, [], None
            if i in pares:
                t = lineas[pares[i]]
                tx = _tx_json(t)
                d = (t['monto'] - op['_monto']).quantize(CENT)
                dif = str(d)
                estado = 'exacta' if d == 0 else 'dentro_tolerancia' if abs(d) <= tolerancia else 'fuera_tolerancia'
            elif pendientes.get(i):
                estado = 'ambigua'
                candidatas = [_tx_json(lineas[j]) for j in sorted(pendientes[i])]
            else:
                estado = 'sin_banco'
            propuestas.append({
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
                'seleccionada_por_defecto': estado in ('exacta', 'dentro_tolerancia') and op['tipo'] == 'pago',
            })
            resumen['total'] += 1
            resumen[clave_resumen[estado]] += 1

        # Líneas del banco sin ninguna operación asociada (ni siquiera candidata).
        sin_operacion = [_tx_json(t) for j, t in enumerate(lineas) if j not in lineas_con_op]
        return Response({'propuestas': propuestas, 'resumen': resumen, 'sin_operacion': sin_operacion})


class ConfirmarMasivaView(APIView):
    """
    POST cobranza/conciliacion/auto/confirmar/

    Body: {banco, tolerancia?, archivo?, items: [{operacion_uuid | comprobante_id,
           transaccion: {referencia, fecha, monto}, observacion?}]}
    Cada ítem usa `conciliar_item` (misma lógica que `conciliar/`) en su propio
    savepoint: un error no revierte los demás. Máx. 500 ítems.
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

        conciliadas, errores = [], []
        for indice, item in enumerate(items):
            try:
                if not isinstance(item, dict):
                    raise ErrorConciliacion('Ítem inválido.')
                ref, fecha, monto = parsear_transaccion(item.get('transaccion'))
                with transaction.atomic():
                    conciliacion, _lote, advertencias = conciliar_item(
                        request.user, banco,
                        operacion_uuid=item.get('operacion_uuid') or None,
                        comprobante_id=item.get('comprobante_id') or None,
                        referencia_banco=ref, fecha_banco=fecha, monto_banco=monto,
                        tolerancia=tolerancia, observacion=item.get('observacion'), archivo=archivo,
                    )
                entrada = {'indice': indice, 'conciliacion_id': conciliacion.id}
                if advertencias:
                    entrada['advertencias'] = advertencias
                conciliadas.append(entrada)
            except ErrorConciliacion as exc:
                errores.append({'indice': indice, 'error': exc.mensaje})

        lote = _lote_abierto(request.user)
        return Response({
            'conciliadas': conciliadas,
            'errores': errores,
            'lote': {'id': lote.id, 'total_operaciones': lote.conciliaciones.count()} if lote else None,
        })
