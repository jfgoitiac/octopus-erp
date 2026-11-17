"""
Helper neutral para determinar el período escolar activo, sin depender de
ningún app en particular. Vive fuera de `secretaria` y `academico` para que
ambos (y cualquier otro consumidor futuro) puedan importarlo sin crear un
ciclo de imports entre esos dos apps.

Movido desde `academico/services.py::_periodo_escolar_activo` — misma
lógica y mismo fallback, solo con los imports de modelos movidos a nivel de
función (en vez de nivel de módulo) para evitar cualquier ciclo.
"""

from django.db import models


def periodo_escolar_activo():
    """Determina el período escolar a mostrar: la configuración del sistema
    si existe, o el período más reciente con actividad de calificaciones, o el default
    del modelo Lapso como último recurso."""
    from secretaria.models import ConfiguracionSistema
    from academico.models import Lapso

    config = ConfiguracionSistema.objects.first()
    if config and config.periodo_escolar_activo:
        return config.periodo_escolar_activo

    # La fuente canónica puede ser legacy o plan. Consultar Lapso evita que una
    # instalación que ya solo use PlanEvaluacion quede anclada al fallback.
    ultimo_lapso = (
        Lapso.objects.filter(
            models.Q(notas__isnull=False)
            | models.Q(configuraciones_calificacion__isnull=False)
            | models.Q(planes_evaluacion__isnull=False)
        )
        .order_by('-periodo_escolar')
        .first()
    )
    if ultimo_lapso:
        return ultimo_lapso.periodo_escolar

    return '2025-2026'
