"""
Endpoints de gestión de Cobranza Inteligente (Fases 3 y 4): bandeja,
acciones sobre un ciclo, convenios, cola de pagos en revisión, dashboard y
línea base. Todos responden 409 "apagada" si ninguna sede accesible tiene el
módulo encendido.
"""
from datetime import date
from decimal import Decimal, InvalidOperation

from django.contrib.auth import get_user_model
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from authentication.views import EsPersonalCobranza, IsDirector, IsSystemAdminOrDirector
from secretaria.models import Representante

from . import gestion
from .dashboard import calcular_dashboard, q_sedes
from .inteligente import sedes_con_inteligente_activa
from .models import CicloCobranza, ConvenioPago, CuotaConvenio, LineaBaseCobranza
from .permissions import sedes_permitidas_ids

User = get_user_model()


def _apagada():
    return Response({'detail': 'Cobranza Inteligente está apagada.', 'apagada': True},
                    status=status.HTTP_409_CONFLICT)


def sedes_activas_accesibles(user, sede_param=None):
    """Set de sede_id con el módulo encendido a las que el usuario accede."""
    activas = sedes_con_inteligente_activa()
    permitidas = sedes_permitidas_ids(user)
    if permitidas is not None:
        activas = {s for s in activas if s in permitidas}
    if sede_param:
        try:
            activas = {s for s in activas if s == int(sede_param)}
        except ValueError:
            activas = set()
    return activas


def _ciclos(sedes):
    return CicloCobranza.objects.filter(q_sedes(sedes, 'mensualidad__alumno__'))


def _error(detalle, codigo=status.HTTP_400_BAD_REQUEST):
    return Response({'detail': detalle}, status=codigo)


class BandejaView(APIView):
    """GET /inteligente/bandeja/ — "Atención requerida hoy", con puntuación explicable."""
    permission_classes = [permissions.IsAuthenticated, EsPersonalCobranza]

    def get(self, request):
        sedes = sedes_activas_accesibles(request.user, request.query_params.get('sede'))
        if not sedes:
            return _apagada()
        filas = gestion.calcular_bandeja(_ciclos(sedes))
        if request.query_params.get('responsable'):
            filas = [f for f in filas if f['responsable'] == request.query_params['responsable']]
        return Response({'count': len(filas), 'results': filas})


class AccionCicloView(APIView):
    """
    POST /inteligente/ciclos/<id>/acciones/
    accion: llamada | whatsapp_manual | nota | asignar | pausar | reanudar |
            reclamo | cerrar. Cada una deja un EventoCiclo con el usuario.
    """
    permission_classes = [permissions.IsAuthenticated, EsPersonalCobranza]

    def post(self, request, ciclo_id):
        sedes = sedes_activas_accesibles(request.user)
        if not sedes:
            return _apagada()
        ciclo = _ciclos(sedes).select_related('mensualidad__alumno').filter(pk=ciclo_id).first()
        if ciclo is None:
            return _error('No encontrado.', status.HTTP_404_NOT_FOUND)

        d = request.data
        accion = d.get('accion')
        try:
            if accion in gestion.TIPOS_GESTION:
                gestion.registrar_gestion(ciclo, accion, request.user, d.get('texto', ''))
            elif accion == 'asignar':
                responsable = None
                if d.get('responsable'):
                    responsable = User.objects.filter(username=d['responsable'], is_active=True).first()
                    if responsable is None:
                        return _error('Responsable no encontrado.')
                gestion.asignar_responsable(ciclo, responsable, request.user)
            elif accion == 'pausar':
                gestion.pausar_ciclo(ciclo, d.get('motivo', ''), request.user)
            elif accion == 'reanudar':
                gestion.reanudar_ciclo(ciclo, request.user)
            elif accion == 'reclamo':
                gestion.marcar_reclamo(ciclo, request.user, d.get('texto', ''))
            elif accion == 'cerrar':
                motivo = d.get('motivo', '')
                if motivo == 'condonada' and not IsDirector().has_permission(request, self):
                    return _error('Solo el director puede condonar una deuda.', status.HTTP_403_FORBIDDEN)
                gestion.cerrar_ciclo(ciclo, motivo, request.user, d.get('texto', ''))
            else:
                return _error('Acción desconocida.')
        except gestion.AccionInvalida as e:
            return _error(str(e))
        ciclo.refresh_from_db()
        return Response({'id': ciclo.id, 'estado': ciclo.estado, 'motivo_pausa': ciclo.motivo_pausa,
                         'motivo_cierre': ciclo.motivo_cierre,
                         'responsable': ciclo.responsable.get_username() if ciclo.responsable_id else None})


class PagosRevisionView(APIView):
    """GET /inteligente/pagos-revision/ — pagos en revisión y comprobantes pendientes."""
    permission_classes = [permissions.IsAuthenticated, EsPersonalCobranza]

    def get(self, request):
        sedes = sedes_activas_accesibles(request.user, request.query_params.get('sede'))
        if not sedes:
            return _apagada()
        filas = gestion.pagos_en_revision(sedes)
        return Response({'count': len(filas), 'results': filas})


def _serializar_convenio(c):
    return {
        'id': c.id, 'estado': c.estado, 'notas': c.notas, 'creado_en': c.creado_en,
        'representante': c.representante_id,
        'ciclos': list(c.ciclos.values_list('id', flat=True)),
        'cuotas': [{'id': q.id, 'numero': q.numero, 'fecha': q.fecha, 'monto_usd': str(q.monto_usd),
                    'pagada': q.pagada, 'pagada_en': q.pagada_en} for q in c.cuotas.all()],
    }


class ConveniosView(APIView):
    """
    GET  /inteligente/convenios/?representante=<id>
    POST /inteligente/convenios/ {representante_id, ciclo_ids, cuotas:[{fecha, monto}], notas}
    """
    permission_classes = [permissions.IsAuthenticated, EsPersonalCobranza]

    def get(self, request):
        sedes = sedes_activas_accesibles(request.user)
        if not sedes:
            return _apagada()
        qs = ConvenioPago.objects.filter(ciclos__in=_ciclos(sedes)).distinct().prefetch_related('cuotas')
        if request.query_params.get('representante'):
            qs = qs.filter(representante_id=request.query_params['representante'])
        return Response({'results': [_serializar_convenio(c) for c in qs]})

    def post(self, request):
        sedes = sedes_activas_accesibles(request.user)
        if not sedes:
            return _apagada()
        d = request.data
        rep = Representante.objects.filter(pk=d.get('representante_id')).first()
        if rep is None:
            return _error('Representante no encontrado.')
        ciclos = list(_ciclos(sedes).select_related('mensualidad__alumno').filter(pk__in=d.get('ciclo_ids') or []))
        if len(ciclos) != len(set(d.get('ciclo_ids') or [])):
            return _error('Alguna deuda no existe o no es accesible.')
        try:
            cuotas = [(date.fromisoformat(str(q['fecha'])), Decimal(str(q['monto'])))
                      for q in (d.get('cuotas') or [])]
        except (KeyError, ValueError, InvalidOperation, TypeError):
            return _error('Cuotas inválidas: cada una necesita fecha (AAAA-MM-DD) y monto.')
        try:
            convenio = gestion.crear_convenio(rep, ciclos, cuotas, request.user, d.get('notas', ''))
        except gestion.AccionInvalida as e:
            return _error(str(e))
        return Response(_serializar_convenio(convenio), status=status.HTTP_201_CREATED)


class CuotaConvenioPagadaView(APIView):
    """POST /inteligente/convenios/cuotas/<id>/pagar/ — confirma una cuota."""
    permission_classes = [permissions.IsAuthenticated, EsPersonalCobranza]

    def post(self, request, cuota_id):
        sedes = sedes_activas_accesibles(request.user)
        if not sedes:
            return _apagada()
        cuota = CuotaConvenio.objects.select_related('convenio').filter(
            pk=cuota_id, convenio__ciclos__in=_ciclos(sedes)).distinct().first()
        if cuota is None:
            return _error('No encontrado.', status.HTTP_404_NOT_FOUND)
        try:
            gestion.marcar_cuota_pagada(cuota, request.user)
        except gestion.AccionInvalida as e:
            return _error(str(e))
        cuota.convenio.refresh_from_db()
        return Response(_serializar_convenio(cuota.convenio))


class CancelarConvenioView(APIView):
    """POST /inteligente/convenios/<id>/cancelar/"""
    permission_classes = [permissions.IsAuthenticated, EsPersonalCobranza]

    def post(self, request, convenio_id):
        sedes = sedes_activas_accesibles(request.user)
        if not sedes:
            return _apagada()
        convenio = ConvenioPago.objects.filter(
            pk=convenio_id, ciclos__in=_ciclos(sedes)).distinct().first()
        if convenio is None:
            return _error('No encontrado.', status.HTTP_404_NOT_FOUND)
        try:
            gestion.cancelar_convenio(convenio, request.user)
        except gestion.AccionInvalida as e:
            return _error(str(e))
        convenio.refresh_from_db()
        return Response(_serializar_convenio(convenio))


class DashboardInteligenteView(APIView):
    """GET /inteligente/dashboard/ — dashboard del director."""
    permission_classes = [permissions.IsAuthenticated, IsSystemAdminOrDirector]

    def get(self, request):
        sedes = sedes_activas_accesibles(request.user, request.query_params.get('sede'))
        if not sedes:
            return _apagada()
        return Response(calcular_dashboard(sedes))


CAMPOS_LINEA_BASE = ('cobrado_al_vencimiento_pct', 'mora_7_pct', 'mora_15_pct', 'mora_30_pct',
                     'horas_semanales_cobranza', 'periodo_desde', 'periodo_hasta')


class LineaBaseView(APIView):
    """
    GET/PUT /inteligente/linea-base/?sede=<id> — línea base medida en la
    semana 2 del plan. Solo director/sistemas/administrador pueden cargarla.
    """
    permission_classes = [permissions.IsAuthenticated, IsSystemAdminOrDirector]

    def _sede(self, request):
        sede = request.query_params.get('sede') or None
        permitidas = sedes_permitidas_ids(request.user)
        try:
            sede = int(sede) if sede else None
        except ValueError:
            return False, None
        if permitidas is not None and sede not in permitidas:
            return False, None
        return True, sede

    @staticmethod
    def _ser(lb):
        return {c: getattr(lb, c) for c in CAMPOS_LINEA_BASE} | {'sede': lb.sede_id}

    def get(self, request):
        ok, sede = self._sede(request)
        if not ok:
            return _error('No encontrado.', status.HTTP_404_NOT_FOUND)
        lb = LineaBaseCobranza.objects.filter(sede_id=sede).first()
        return Response(self._ser(lb) if lb else None)

    def put(self, request):
        ok, sede = self._sede(request)
        if not ok:
            return _error('No encontrado.', status.HTTP_404_NOT_FOUND)
        d = request.data
        if d.get('cobrado_al_vencimiento_pct') in (None, ''):
            return _error('cobrado_al_vencimiento_pct es obligatorio.')
        valores = {}
        try:
            for campo in CAMPOS_LINEA_BASE:
                v = d.get(campo)
                if v in (None, ''):
                    valores[campo] = None
                elif campo.startswith('periodo_'):
                    valores[campo] = date.fromisoformat(str(v))
                else:
                    valores[campo] = Decimal(str(v))
        except (ValueError, InvalidOperation):
            return _error('Valores inválidos.')
        for campo in ('cobrado_al_vencimiento_pct', 'mora_7_pct', 'mora_15_pct', 'mora_30_pct'):
            if valores[campo] is not None and not (0 <= valores[campo] <= 100):
                return _error(f'{campo} debe estar entre 0 y 100.')
        lb, _ = LineaBaseCobranza.objects.update_or_create(sede_id=sede, defaults=valores)
        return Response(self._ser(lb))
