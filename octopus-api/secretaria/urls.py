from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    AlumnoListView, BienNacionalViewSet, CargarCuotasInscripcionView, ConfiguracionGradoViewSet,
    ConfiguracionSistemaView, ComprobanteInscripcionView,
    ExportarAlumnosExcelView, ExportarRepresentantesExcelView,
    GradosListView, InscripcionListView, MatriculaGradoView,
    ExportarMatriculaGradoExcelView, ExportarMatriculaGradoPDFView,
    ImportarEstudiantesView,
    InscripcionNuevaView, LogAuditoriaListView,
    PlanillaPreinscripcionView, PlanillaPreinscripcionMasivaView,
    PromocionAlumnosView, RepresentanteAlumnosView, RepresentanteViewSet,
    buscar_representante_por_cedula,
)

router = DefaultRouter()
router.register(r'alumnos',               AlumnoListView,          basename='alumno')
router.register(r'bienes',                BienNacionalViewSet,     basename='bien')
router.register(r'configuracion-grados',  ConfiguracionGradoViewSet, basename='config-grado')
router.register(r'representantes',        RepresentanteViewSet,    basename='representante')

urlpatterns = [
    path('', include(router.urls)),

    # Inscripción
    path('inscripcion-nueva/',                    InscripcionNuevaView.as_view(),         name='inscripcion-nueva'),
    path('inscripciones/',                        InscripcionListView.as_view(),          name='inscripciones-lista'),
    path('inscripciones/<int:pk>/comprobante/',   ComprobanteInscripcionView.as_view(),   name='comprobante-inscripcion'),

    # Pre-Inscripción — por Alumno, no por Inscripcion (el estudiante puede
    # no estar inscrito todavía).
    path('alumnos/<int:pk>/preinscripcion/',      PlanillaPreinscripcionView.as_view(),   name='planilla-preinscripcion'),
    path('preinscripcion-masiva/',                PlanillaPreinscripcionMasivaView.as_view(), name='planilla-preinscripcion-masiva'),

    # Representante
    path('representante/<str:cedula>/',           buscar_representante_por_cedula,        name='buscar-representante'),
    path('representante/<str:cedula>/alumnos/',   RepresentanteAlumnosView.as_view(),     name='representante-alumnos'),

    # Configuración del sistema
    path('configuracion/',                        ConfiguracionSistemaView.as_view(),     name='configuracion-sistema'),
    path('promover-alumnos/',                     PromocionAlumnosView.as_view(),         name='promover-alumnos'),
    path('cargar-cuotas-inscripcion/',             CargarCuotasInscripcionView.as_view(),  name='cargar-cuotas-inscripcion'),
    path('importar-estudiantes/',                  ImportarEstudiantesView.as_view(),      name='importar-estudiantes'),

    # Auditoría
    path('auditoria/',                            LogAuditoriaListView.as_view(),         name='auditoria-lista'),

    # Exportaciones Excel
    path('exportar-alumnos-excel/',               ExportarAlumnosExcelView.as_view(),         name='exportar-alumnos-excel'),
    path('exportar-representantes-excel/',        ExportarRepresentantesExcelView.as_view(),  name='exportar-representantes-excel'),

    # Módulo de Grados
    path('grados/',                               GradosListView.as_view(),               name='grados-lista'),
    path('matricula-grado/',                      MatriculaGradoView.as_view(),           name='matricula-grado'),
    path('matricula-grado/exportar-excel/',       ExportarMatriculaGradoExcelView.as_view(), name='matricula-grado-excel'),
    path('matricula-grado/exportar-pdf/',         ExportarMatriculaGradoPDFView.as_view(),   name='matricula-grado-pdf'),
]