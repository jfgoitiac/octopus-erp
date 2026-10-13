"""
CRUD de las reglas del motor de Cobranza Inteligente (v4 fase D, pestaña
Automatizaciones): GET/POST `inteligente/reglas/` y PATCH `inteligente/reglas/<id>/`.

Decisiones:
  - NO responden 409 "apagada": las reglas se pueden preparar con el módulo apagado
    (igual que la configuración).
  - No hay DELETE: `EnvioCobranza.regla` es PROTECT y las reglas son parte del
    historial. Para retirar una regla se desactiva (`activa: false`).
  - Las reglas propias de una sede REEMPLAZAN a las globales (ver motor._reglas_de_sede).
    Por eso el primer POST en una sede que solo hereda las globales las copia antes
    de crear la nueva: así la sede no pierde sin querer el resto de la línea de tiempo.
  - Lectura: personal de cobranza. Escritura: director / administrador / sistemas.
"""
from decimal import Decimal, InvalidOperation

from django.db import transaction
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from authentication.views import EsPersonalCobranza, IsSystemAdminOrDirector
from usuarios.models import LogAuditoria

from .models import ReglaCobranza
from .motor import PLANTILLAS_TEXTO
from .permissions import sedes_permitidas_ids

DIA_MIN, DIA_MAX = -30, 90
CAMPOS_ESCRIBIBLES = (
    'nombre', 'etapa', 'dia_relativo', 'canal', 'plantilla', 'plantilla_meta',
    'saldo_minimo', 'destinatario', 'activa', 'recordatorio_extra_paga_tarde',
)


def _error(detalle, codigo=status.HTTP_400_BAD_REQUEST):
    return Response({'detail': detalle}, status=codigo)


def serializar_regla(r, heredada=False):
    return {
        'id': r.id, 'sede': r.sede_id, 'heredada': heredada,
        'nombre': r.nombre, 'etapa': r.etapa, 'dia_relativo': r.dia_relativo,
        'canal': r.canal, 'plantilla': r.plantilla, 'plantilla_meta': r.plantilla_meta,
        'saldo_minimo': str(r.saldo_minimo), 'destinatario': r.destinatario, 'activa': r.activa,
        'recordatorio_extra_paga_tarde': r.recordatorio_extra_paga_tarde,
    }


class ErrorRegla(Exception):
    pass


def _sede_de(request):
    """(sede_id, error). Sin `?sede=` = reglas globales (sede nula), como la configuración."""
    bruto = request.query_params.get('sede') or None
    sede_id = None
    if bruto is not None:
        try:
            sede_id = int(bruto)
        except ValueError:
            return None, _error('Sede inválida.')
    permitidas = sedes_permitidas_ids(request.user)
    if permitidas is not None and sede_id not in permitidas:
        return None, _error('No encontrado.', status.HTTP_404_NOT_FOUND)
    return sede_id, None


def _validar(datos, parcial, actual=None):
    """Devuelve los campos ya convertidos o lanza ErrorRegla con el texto para el usuario."""
    limpio = {}
    desconocidos = set(datos) - set(CAMPOS_ESCRIBIBLES) - {'sede', 'id', 'heredada'}
    if desconocidos:
        # Campos que el frontend pueda mandar de más se ignoran; no es un error.
        pass
    for campo in CAMPOS_ESCRIBIBLES:
        if campo not in datos:
            if not parcial and campo in ('nombre', 'etapa', 'dia_relativo', 'canal', 'plantilla'):
                raise ErrorRegla(f'Falta el campo «{campo}».')
            continue
        valor = datos[campo]
        if campo == 'nombre':
            valor = str(valor or '').strip()
            if not valor or len(valor) > 100:
                raise ErrorRegla('El nombre es obligatorio (máximo 100 caracteres).')
        elif campo in ('etapa', 'canal', 'destinatario'):
            validos = [c[0] for c in getattr(ReglaCobranza, {
                'etapa': 'ETAPAS', 'canal': 'CANALES', 'destinatario': 'DESTINATARIOS'}[campo])]
            if valor not in validos:
                raise ErrorRegla(f'«{campo}» debe ser uno de: {", ".join(validos)}.')
        elif campo == 'dia_relativo':
            if isinstance(valor, bool):
                raise ErrorRegla('El día relativo debe ser un número entero.')
            try:
                valor = int(valor)
            except (TypeError, ValueError):
                raise ErrorRegla('El día relativo debe ser un número entero.')
            if not DIA_MIN <= valor <= DIA_MAX:
                raise ErrorRegla(f'El día relativo debe estar entre {DIA_MIN} y {DIA_MAX}.')
        elif campo == 'plantilla':
            if valor not in PLANTILLAS_TEXTO:
                raise ErrorRegla(f'Plantilla de texto desconocida. Válidas: {", ".join(PLANTILLAS_TEXTO)}.')
        elif campo == 'plantilla_meta':
            valor = str(valor or '').strip()
            if len(valor) > 100:
                raise ErrorRegla('El nombre de la plantilla de Meta admite máximo 100 caracteres.')
        elif campo == 'saldo_minimo':
            try:
                valor = Decimal(str(valor)).quantize(Decimal('0.01'))
            except (InvalidOperation, ValueError):
                raise ErrorRegla('El saldo mínimo debe ser un número.')
            if valor < 0 or valor > Decimal('99999999.99'):
                raise ErrorRegla('El saldo mínimo debe ser mayor o igual a 0.')
        elif campo in ('activa', 'recordatorio_extra_paga_tarde'):
            if not isinstance(valor, bool):
                raise ErrorRegla(f'«{campo}» debe ser verdadero o falso.')
        limpio[campo] = valor
    return limpio


def _validar_extra(sede_id, final, excluir_id=None):
    """`final`: valores resultantes de la regla (los enviados más los que ya tenía)."""
    if not final.get('recordatorio_extra_paga_tarde'):
        return
    if final.get('destinatario', 'representante') != 'representante' or final.get('canal') == 'interno':
        raise ErrorRegla('El recordatorio extra solo aplica a reglas para el representante por WhatsApp o email.')
    otras = ReglaCobranza.objects.filter(sede_id=sede_id, recordatorio_extra_paga_tarde=True)
    if excluir_id:
        otras = otras.exclude(pk=excluir_id)
    if otras.exists():
        raise ErrorRegla('Ya hay otra regla con el recordatorio extra para quienes pagan tarde; solo puede haber una.')


def _clonar_globales_si_hereda(sede_id):
    """Copia las reglas globales a una sede que aún no tiene propias. Devuelve cuántas copió."""
    if sede_id is None or ReglaCobranza.objects.filter(sede_id=sede_id).exists():
        return 0
    globales = list(ReglaCobranza.objects.filter(sede__isnull=True))
    for g in globales:
        g.pk, g.sede_id = None, sede_id
    ReglaCobranza.objects.bulk_create(globales)
    return len(globales)


def _auditar(usuario, accion, regla, antes=None):
    LogAuditoria.objects.create(
        usuario=usuario, accion=accion, modulo='COBRANZA',
        detalles={'regla': regla.id, 'sede': regla.sede_id, 'antes': antes,
                  'despues': serializar_regla(regla)})


def _dia_ocupado(sede_id, dia, excluir_id=None):
    qs = ReglaCobranza.objects.filter(sede_id=sede_id, dia_relativo=dia)
    if excluir_id:
        qs = qs.exclude(pk=excluir_id)
    return qs.exists()


class ReglasView(APIView):
    """
    GET  /inteligente/reglas/?sede=&todas=1  -> {count, results:[regla]} ordenado por día.
         Sin `todas=1` solo las activas. Si la sede no tiene reglas propias devuelve las
         globales con `heredada: true`.
    POST /inteligente/reglas/?sede=          -> 201 regla. Campos: nombre, etapa, dia_relativo,
         canal, plantilla (obligatorios); plantilla_meta, saldo_minimo, destinatario, activa.
    """

    def get_permissions(self):
        clases = [EsPersonalCobranza] if self.request.method == 'GET' else [IsSystemAdminOrDirector]
        return [permissions.IsAuthenticated(), *(c() for c in clases)]

    def get(self, request):
        sede_id, error = _sede_de(request)
        if error:
            return error
        reglas = ReglaCobranza.objects.filter(sede_id=sede_id)
        heredada = False
        if sede_id is not None and not reglas.exists():
            reglas, heredada = ReglaCobranza.objects.filter(sede__isnull=True), True
        if request.query_params.get('todas') not in ('1', 'true', 'True'):
            reglas = reglas.filter(activa=True)
        filas = [serializar_regla(r, heredada) for r in reglas.order_by('dia_relativo', 'id')]
        return Response({'count': len(filas), 'results': filas})

    def post(self, request):
        sede_id, error = _sede_de(request)
        if error:
            return error
        try:
            datos = _validar(request.data, parcial=False)
            _validar_extra(sede_id, {'destinatario': 'representante', **datos})
            with transaction.atomic():
                clonadas = _clonar_globales_si_hereda(sede_id)
                if _dia_ocupado(sede_id, datos['dia_relativo']):
                    raise ErrorRegla(f'Ya existe una regla para el día {datos["dia_relativo"]:+d}.')
                regla = ReglaCobranza.objects.create(sede_id=sede_id, **datos)
                _auditar(request.user, 'COBRANZA_REGLA_CREADA', regla)
        except ErrorRegla as e:
            return _error(str(e))
        cuerpo = serializar_regla(regla)
        cuerpo['reglas_copiadas_de_globales'] = clonadas
        return Response(cuerpo, status=status.HTTP_201_CREATED)


class ReglaDetalleView(APIView):
    """PATCH /inteligente/reglas/<id>/ — edición parcial. `sede` no se puede cambiar."""
    permission_classes = [permissions.IsAuthenticated, IsSystemAdminOrDirector]

    def patch(self, request, pk):
        regla = ReglaCobranza.objects.filter(pk=pk).first()
        permitidas = sedes_permitidas_ids(request.user)
        if regla is None or (permitidas is not None and regla.sede_id not in permitidas):
            return _error('No encontrado.', status.HTTP_404_NOT_FOUND)
        try:
            datos = _validar(request.data, parcial=True)
            nuevo_dia = datos.get('dia_relativo', regla.dia_relativo)
            if nuevo_dia != regla.dia_relativo and _dia_ocupado(regla.sede_id, nuevo_dia, regla.pk):
                raise ErrorRegla(f'Ya existe una regla para el día {nuevo_dia:+d}.')
            _validar_extra(regla.sede_id, {
                'destinatario': regla.destinatario, 'canal': regla.canal,
                'recordatorio_extra_paga_tarde': regla.recordatorio_extra_paga_tarde, **datos}, regla.pk)
        except ErrorRegla as e:
            return _error(str(e))
        antes = serializar_regla(regla)
        for campo, valor in datos.items():
            setattr(regla, campo, valor)
        regla.save()
        _auditar(request.user, 'COBRANZA_REGLA_EDITADA', regla, antes)
        return Response(serializar_regla(regla))
