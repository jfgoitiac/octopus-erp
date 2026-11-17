from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from portal.authentication import PortalJWTAuthentication
from secretaria.models import Alumno

from .models import ConfiguracionCalificacion, NotaItemEvaluacion, PlanEvaluacion
from .calificaciones import calcular_calificacion
from .services import calcular_rendimiento_alumno


class RendimientoAlumnoPortalView(APIView):
    """GET — rendimiento de un hijo del representante autenticado.
    Solo devuelve datos si el alumno pertenece a ese representante."""
    authentication_classes = [PortalJWTAuthentication]
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, alumno_id):
        rep = request.user.representante_portal.representante
        try:
            alumno = Alumno.objects.get(pk=alumno_id, representante=rep)
        except Alumno.DoesNotExist:
            return Response(
                {'error': 'Este alumno no está disponible para tu cuenta.'},
                status=status.HTTP_404_NOT_FOUND
            )
        return Response(calcular_rendimiento_alumno(alumno))


class PlanesEvaluacionAlumnoPortalView(APIView):
    """GET — planes y calificaciones del propio representado, solo lectura."""
    authentication_classes = [PortalJWTAuthentication]
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, alumno_id):
        rep = request.user.representante_portal.representante
        try:
            alumno = Alumno.objects.get(pk=alumno_id, representante=rep)
        except Alumno.DoesNotExist:
            return Response(
                {'error': 'Este alumno no está disponible para tu cuenta.'},
                status=status.HTTP_404_NOT_FOUND
            )

        # El plan es visible para el representante únicamente cuando fue
        # activado como fuente canónica. Un plan coexistente, vacío o dejado
        # como sombra de rollback no debe filtrar su estructura ni sus notas.
        pares_plan_activos = set(
            ConfiguracionCalificacion.objects.filter(
                materia__grado_seccion=alumno.grado_seccion,
                materia__sede_id=alumno.sede_id,
                materia__activa=True,
                motor='plan',
            ).values_list('materia_id', 'lapso_id')
        )
        planes = [plan for plan in
            PlanEvaluacion.objects.filter(
                materia__grado_seccion=alumno.grado_seccion,
                materia__sede_id=alumno.sede_id,
                materia__activa=True,
            ).select_related('materia', 'lapso').prefetch_related('bloques__items')
            if (plan.materia_id, plan.lapso_id) in pares_plan_activos
        ]
        item_ids = [item.id for plan in planes for bloque in plan.bloques.all() for item in bloque.items.all()]
        notas = {
            nota.item_id: nota
            for nota in NotaItemEvaluacion.objects.filter(item_id__in=item_ids, alumno=alumno)
        }

        data = []
        for plan in planes:
            resultado = calcular_calificacion(alumno, plan.materia, plan.lapso)
            data.append({
                'plan_id': plan.id,
                'materia_id': plan.materia_id,
                'materia': plan.materia.nombre,
                'tipo_evaluacion': plan.materia.tipo_evaluacion,
                'lapso_id': plan.lapso_id,
                'lapso': plan.lapso.nombre,
                'resultado': resultado,
                'bloques': [{
                    'id': bloque.id,
                    'nombre': bloque.nombre,
                    'modo': bloque.modo,
                    'total_puntos': bloque.total_puntos,
                    'items': [{
                        'id': item.id,
                        'nombre': item.nombre,
                        'fecha': item.fecha,
                        'valor_maximo': item.valor_maximo,
                        'valor_numerico': notas[item.id].valor_numerico if item.id in notas else None,
                        'valor_letra': notas[item.id].valor_letra if item.id in notas else None,
                    } for item in bloque.items.all()],
                } for bloque in plan.bloques.all()],
            })

        calificaciones = []
        configuraciones = ConfiguracionCalificacion.objects.filter(
            materia__grado_seccion=alumno.grado_seccion,
            materia__sede_id=alumno.sede_id,
            materia__activa=True,
        ).select_related('materia', 'lapso')
        for config in configuraciones:
            calificaciones.append(calcular_calificacion(alumno, config.materia, config.lapso))

        return Response({
            'alumno': {'id': alumno.id, 'nombre': alumno.nombre, 'apellido': alumno.apellido},
            'planes': data,
            'calificaciones': calificaciones,
        })
