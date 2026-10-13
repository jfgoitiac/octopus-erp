"""
Endpoints de la pestaña "Hoy" y de apoyo de Cobranza Inteligente v4 (Fase A):
hoy, tarjetas hechas, contadores, simulación en seco del motor, promesas e
historial unificado de cobros. Mismos permisos y respuesta 409 "apagada" que
los endpoints de gestión.
"""
from datetime import date
from decimal import Decimal, InvalidOperation

from django.db.models import Q
from django.utils import timezone
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from authentication.views import EsPersonalCobranza
from secretaria.models import Representante

from . import ab, control_envios, gestion, hoy as servicio_hoy, perfil_pagador, proyeccion
from .views_gestion import _apagada, _ciclos, _error, _serializar_convenio, sedes_activas_accesibles


def _hoy():
    return date.today()


def _ahora():
    return timezone.now()


class HoyView(APIView):
    """GET /inteligente/hoy/?sede= — resumen, tarjetas de acción, KPIs y actividad automática."""
    permission_classes = [permissions.IsAuthenticated, EsPersonalCobranza]

    def get(self, request):
        sedes = sedes_activas_accesibles(request.user, request.query_params.get('sede'))
        if not sedes:
            return _apagada()
        return Response(servicio_hoy.calcular_hoy(sedes, _hoy(), _ahora()))


class TarjetaHechaView(APIView):
    """POST /inteligente/hoy/tarjetas/<clave>/hecha/ {nota?} — deja un EventoCiclo `tarjeta_hecha`."""
    permission_classes = [permissions.IsAuthenticated, EsPersonalCobranza]

    def post(self, request, clave):
        sedes = sedes_activas_accesibles(request.user)
        if not sedes:
            return _apagada()
        ok = servicio_hoy.marcar_tarjeta_hecha(
            clave, request.user, sedes, _hoy(), _ahora(), request.data.get('nota', ''))
        if not ok:
            return _error('La tarjeta no existe o ya no está vigente.', status.HTTP_404_NOT_FOUND)
        return Response({'clave': clave, 'hecha': True})


class ContadoresView(APIView):
    """GET /inteligente/contadores/ — badge del sidebar (polling liviano)."""
    permission_classes = [permissions.IsAuthenticated, EsPersonalCobranza]

    def get(self, request):
        sedes = sedes_activas_accesibles(request.user, request.query_params.get('sede'))
        if not sedes:
            return _apagada()
        return Response(servicio_hoy.contadores(sedes, _hoy(), _ahora()))


class SimulacionMotorView(APIView):
    """GET /inteligente/motor/simulacion/?fecha=AAAA-MM-DD&sede= — qué saldría ese día (sin crear nada)."""
    permission_classes = [permissions.IsAuthenticated, EsPersonalCobranza]

    def get(self, request):
        sedes = sedes_activas_accesibles(request.user, request.query_params.get('sede'))
        if not sedes:
            return _apagada()
        try:
            fecha = (date.fromisoformat(request.query_params['fecha'])
                     if request.query_params.get('fecha') else _hoy())
        except ValueError:
            return _error('Fecha inválida (use AAAA-MM-DD).')
        return Response(servicio_hoy.simulacion(sedes, fecha, _ahora()))


class PromesasView(APIView):
    """
    POST /inteligente/promesas/ {representante_id, ciclo_ids, fecha, monto?, notas?}
    Promesa de pago = convenio de una sola cuota (tipo='promesa'). Sin `monto`
    promete el saldo completo de las deudas incluidas.
    """
    permission_classes = [permissions.IsAuthenticated, EsPersonalCobranza]

    def post(self, request):
        sedes = sedes_activas_accesibles(request.user)
        if not sedes:
            return _apagada()
        d = request.data
        rep = Representante.objects.filter(pk=d.get('representante_id')).first()
        if rep is None:
            return _error('Representante no encontrado.')
        ids = d.get('ciclo_ids') or []
        ciclos = list(_ciclos(sedes).select_related('mensualidad__alumno').filter(pk__in=ids))
        if not ids or len(ciclos) != len(set(ids)):
            return _error('Alguna deuda no existe o no es accesible.')
        try:
            fecha = date.fromisoformat(str(d.get('fecha')))
            monto = Decimal(str(d['monto'])) if d.get('monto') not in (None, '') else None
        except (ValueError, InvalidOperation, TypeError):
            return _error('Promesa inválida: se necesita fecha (AAAA-MM-DD) y, si se envía, un monto numérico.')
        try:
            convenio = gestion.crear_promesa(rep, ciclos, fecha, request.user, monto,
                                             d.get('notas', ''), _hoy())
        except gestion.AccionInvalida as e:
            return _error(str(e))
        return Response(_serializar_convenio(convenio), status=status.HTTP_201_CREATED)


class HistorialCobrosView(APIView):
    """
    GET /inteligente/representantes/<id>/historial-cobros/
    Todos los mensajes de cobro del representante (motor, Morosos modo A y B,
    avisos anteriores) con su origen y etiqueta.
    """
    permission_classes = [permissions.IsAuthenticated, EsPersonalCobranza]

    def get(self, request, representante_id):
        sedes = sedes_activas_accesibles(request.user)
        if not sedes:
            return _apagada()
        filtro = Q(sede_id__in=[s for s in sedes if s is not None])
        if None in sedes:
            filtro |= Q(sede__isnull=True)
        rep = Representante.objects.filter(pk=representante_id).first()
        if rep is None or not rep.alumnos.filter(filtro).exists():
            return _error('No encontrado.', status.HTTP_404_NOT_FOUND)
        filas = control_envios.historial_cobros(rep)
        return Response({'representante': rep.id, 'count': len(filas), 'results': filas})


class PerfilPagadorView(APIView):
    """
    GET /inteligente/representantes/<id>/perfil-pagador/
    Perfil de pagador del representante y los meses que lo explican (últimos 6).
    Mismo acceso que el historial de cobros (404 si no tiene alumnos en sedes accesibles).
    """
    permission_classes = [permissions.IsAuthenticated, EsPersonalCobranza]

    def get(self, request, representante_id):
        sedes = sedes_activas_accesibles(request.user)
        if not sedes:
            return _apagada()
        filtro = Q(sede_id__in=[s for s in sedes if s is not None])
        if None in sedes:
            filtro |= Q(sede__isnull=True)
        rep = Representante.objects.filter(pk=representante_id).first()
        if rep is None or not rep.alumnos.filter(filtro).exists():
            return _error('No encontrado.', status.HTTP_404_NOT_FOUND)
        return Response({'representante': rep.id, **perfil_pagador.detalle_de(rep.id, _hoy())})


class ProyeccionCajaView(APIView):
    """
    GET /inteligente/proyeccion-caja/?fecha=AAAA-MM-DD&sede=
    Proyección de la semana (lunes a domingo) de `fecha` (por defecto, hoy): promesas y
    cuotas de convenios vigentes ponderadas por el perfil de pagador. Ver cobranza/proyeccion.py.
    """
    permission_classes = [permissions.IsAuthenticated, EsPersonalCobranza]

    def get(self, request):
        sedes = sedes_activas_accesibles(request.user, request.query_params.get('sede'))
        if not sedes:
            return _apagada()
        try:
            fecha = (date.fromisoformat(request.query_params['fecha'])
                     if request.query_params.get('fecha') else None)
        except ValueError:
            return _error('Fecha inválida (use AAAA-MM-DD).')
        return Response(proyeccion.calcular_proyeccion(sedes, _hoy(), fecha))


class ReporteABView(APIView):
    """
    GET /inteligente/ab/reporte/?regla=<id>&desde=AAAA-MM-DD&hasta=AAAA-MM-DD&sede=
    Comparación de las variantes A y B de las plantillas de Meta por regla, con lo
    recuperado a 7 días. `desde`/`hasta` filtran por la fecha del envío. Ver cobranza/ab.py.
    """
    permission_classes = [permissions.IsAuthenticated, EsPersonalCobranza]

    def get(self, request):
        sedes = sedes_activas_accesibles(request.user, request.query_params.get('sede'))
        if not sedes:
            return _apagada()
        p = request.query_params
        try:
            desde = date.fromisoformat(p['desde']) if p.get('desde') else None
            hasta = date.fromisoformat(p['hasta']) if p.get('hasta') else None
            regla = int(p['regla']) if p.get('regla') else None
        except ValueError:
            return _error('Parámetros inválidos (fechas AAAA-MM-DD, regla numérica).')
        return Response(ab.reporte_ab(sedes, _ahora(), regla, desde, hasta))
