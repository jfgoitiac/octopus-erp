from django.urls import path
from .views import (
    HistorialNotaView,
    MateriasView,
    MateriaDetailView,
    LapsosView,
    LapsoDetailView,
    NotasGradoView,
    AsistenciaView,
    ResumenAsistenciaView,
    HorariosView,
    HorarioDetailView,
    BoletinView,
    GenerarHorarioView,
)

urlpatterns = [
    path('materias/',              MateriasView.as_view()),
    path('materias/<int:pk>/',     MateriaDetailView.as_view()),
    path('lapsos/',                LapsosView.as_view()),
    path('lapsos/<int:pk>/',       LapsoDetailView.as_view()),
    path('notas/',                 NotasGradoView.as_view()),
    path('asistencia/',            AsistenciaView.as_view()),
    path('asistencia/resumen/',    ResumenAsistenciaView.as_view()),
    path('horarios/',              HorariosView.as_view()),
    path('horarios/<int:pk>/',     HorarioDetailView.as_view()),
    path('horarios/generar/',      GenerarHorarioView.as_view()),
    path('boletin/',               BoletinView.as_view()),
    path('notas/<int:nota_id>/historial/', HistorialNotaView.as_view()),
]
