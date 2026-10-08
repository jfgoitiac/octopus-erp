"""
Cartera por ciclo y expediente del representante (solo lectura) de
Cobranza Inteligente. Todas las respuestas son 409 "apagada" si ninguna sede
accesible tiene el módulo encendido (PLAN_COBRANZA_INTELIGENTE.md §3).
"""
from datetime import date

from django.db.models import Q
from rest_framework import permissions, status
from rest_framework.generics import ListAPIView
from rest_framework.response import Response
from rest_framework.views import APIView

from config.pagination import StandardResultsPagination
from secretaria.models import Representante

from .ciclos import dias_de_mora
from .inteligente import sedes_con_inteligente_activa
from .models import CicloCobranza, EventoCiclo
from .permissions import sedes_permitidas_ids

MENSAJE_APAGADA = 'Cobranza Inteligente está apagada.'


def _respuesta_apagada():
    return Response({'detail': MENSAJE_APAGADA, 'apagada': True}, status=status.HTTP_409_CONFLICT)


def _filtro_sedes_activas(user, sede_param=None):
    """
    Q sobre `mensualidad__alumno__sede` con las sedes encendidas a las que el
    usuario tiene acceso. Devuelve None si no queda ninguna.
    """
    activas = sedes_con_inteligente_activa()
    permitidas = sedes_permitidas_ids(user)
    if permitidas is not None:
        activas = {s for s in activas if s in permitidas}
    if sede_param:
        try:
            activas = {s for s in activas if s == int(sede_param)}
        except ValueError:
            activas = set()
    if not activas:
        return None
    q = Q(mensualidad__alumno__sede_id__in=[s for s in activas if s is not None])
    if None in activas:
        q |= Q(mensualidad__alumno__sede__isnull=True)
    return q


def serializar_ciclo(ciclo, hoy):
    m = ciclo.mensualidad
    a = m.alumno
    r = a.representante
    dias = dias_de_mora(ciclo.fecha_vencimiento, hoy)
    return {
        'id': ciclo.id,
        'mensualidad_id': m.id,
        'alumno': {'id': a.id, 'nombre': f'{a.nombre} {a.apellido}', 'grado': a.grado_seccion},
        'representante': {'id': r.id, 'nombre': f'{r.nombre} {r.apellido}', 'cedula': r.cedula},
        'periodo': {'mes': m.mes, 'anio': m.anio},
        'saldo_usd': str(m.monto_usd - m.monto_pagado),
        'fecha_vencimiento': ciclo.fecha_vencimiento,
        'dias_mora': max(dias, 0),
        'dias_para_vencer': max(-dias, 0),
        'estado': ciclo.estado,
        'semaforo': ciclo.semaforo,
        'motivo_pausa': ciclo.motivo_pausa,
        'motivo_cierre': ciclo.motivo_cierre,
        'responsable': ciclo.responsable.get_username() if ciclo.responsable_id else None,
        'proxima_accion': ciclo.proxima_accion,
        'proxima_accion_fecha': ciclo.proxima_accion_fecha,
    }


class CarteraCiclosView(ListAPIView):
    """
    GET /api/cobranza/inteligente/cartera/
    Filtros: estado, sede, grado, responsable, buscar (alumno/representante/cédula).
    Solo ciclos abiertos de sedes con el módulo encendido. Paginada.
    """
    permission_classes = [permissions.IsAuthenticated]
    pagination_class = StandardResultsPagination

    def list(self, request, *args, **kwargs):
        filtro = _filtro_sedes_activas(request.user, request.query_params.get('sede'))
        if filtro is None:
            return _respuesta_apagada()

        qs = (
            CicloCobranza.objects.filter(filtro, estado__in=CicloCobranza.ESTADOS_ABIERTOS)
            .select_related('mensualidad__alumno__representante', 'responsable')
        )
        p = request.query_params
        if p.get('estado') in dict(CicloCobranza.ESTADOS):
            qs = qs.filter(estado=p['estado'])
        if p.get('grado'):
            qs = qs.filter(mensualidad__alumno__grado_seccion=p['grado'])
        if p.get('responsable'):
            qs = qs.filter(responsable__username=p['responsable'])
        if p.get('buscar', '').strip():
            t = p['buscar'].strip()
            qs = qs.filter(
                Q(mensualidad__alumno__nombre__icontains=t)
                | Q(mensualidad__alumno__apellido__icontains=t)
                | Q(mensualidad__alumno__representante__nombre__icontains=t)
                | Q(mensualidad__alumno__representante__apellido__icontains=t)
                | Q(mensualidad__alumno__representante__cedula__icontains=t)
            )

        page = self.paginate_queryset(qs.order_by('fecha_vencimiento', 'id'))
        hoy = date.today()
        return self.get_paginated_response([serializar_ciclo(c, hoy) for c in page])


class ExpedienteRepresentanteView(APIView):
    """
    GET /api/cobranza/inteligente/representantes/<id>/expediente/
    Ciclos del representante (abiertos y cerrados) e historial de eventos.
    Solo lectura. 404 si el representante no tiene ciclos en sedes accesibles.
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, representante_id):
        filtro = _filtro_sedes_activas(request.user)
        if filtro is None:
            return _respuesta_apagada()

        ciclos = list(
            CicloCobranza.objects.filter(filtro, mensualidad__alumno__representante_id=representante_id)
            .select_related('mensualidad__alumno__representante', 'responsable')
            .order_by('-fecha_vencimiento')
        )
        if not ciclos:
            return Response({'detail': 'No encontrado.'}, status=status.HTTP_404_NOT_FOUND)

        rep = Representante.objects.get(pk=representante_id)
        hoy = date.today()
        abiertos = [c for c in ciclos if c.abierto]
        eventos = (
            EventoCiclo.objects.filter(ciclo__in=ciclos)
            .select_related('usuario').order_by('-creado_en', '-id')[:50]
        )
        return Response({
            'representante': {'id': rep.id, 'nombre': f'{rep.nombre} {rep.apellido}', 'cedula': rep.cedula},
            'saldo_total_usd': str(sum(c.mensualidad.monto_usd - c.mensualidad.monto_pagado for c in abiertos)),
            'ciclos': [serializar_ciclo(c, hoy) for c in ciclos],
            'eventos': [
                {'id': e.id, 'ciclo_id': e.ciclo_id, 'tipo': e.tipo, 'detalle': e.detalle,
                 'usuario': e.usuario.get_username() if e.usuario_id else None,
                 'creado_en': e.creado_en}
                for e in eventos
            ],
        })
