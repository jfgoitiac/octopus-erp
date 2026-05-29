from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    AlumnoListView, BienNacionalViewSet, ConfiguracionGradoViewSet,
    ConfiguracionSistemaView, ComprobanteInscripcionView,
    ExportarAlumnosExcelView, ExportarRepresentantesExcelView,
    GradosListView, MatriculaGradoView,
    ExportarMatriculaGradoExcelView, ExportarMatriculaGradoPDFView,
    InscripcionExistenteView, InscripcionNuevaView, LogAuditoriaListView,
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
    path('inscripcion-existente/',                InscripcionExistenteView.as_view(),     name='inscripcion-existente'),
    path('inscripciones/<int:pk>/comprobante/',   ComprobanteInscripcionView.as_view(),   name='comprobante-inscripcion'),

    # Representante
    path('representante/<str:cedula>/',           buscar_representante_por_cedula,        name='buscar-representante'),
    path('representante/<str:cedula>/alumnos/',   RepresentanteAlumnosView.as_view(),     name='representante-alumnos'),

    # Configuración del sistema
    path('configuracion/',                        ConfiguracionSistemaView.as_view(),     name='configuracion-sistema'),
    path('promover-alumnos/',                     PromocionAlumnosView.as_view(),         name='promover-alumnos'),

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