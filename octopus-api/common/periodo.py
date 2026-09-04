"""
Helper neutral para determinar el período escolar activo, sin depender de
ningún app en particular. Vive fuera de `secretaria` y `academico` para que
ambos (y cualquier otro consumidor futuro) puedan importarlo sin crear un
ciclo de imports entre esos dos apps.

Movido desde `academico/services.py::_periodo_escolar_activo` — misma
lógica y mismo fallback, solo con los imports de modelos movidos a nivel de
función (en vez de nivel de módulo) para evitar cualquier ciclo.
"""


def periodo_escolar_activo():
    """Determina el período escolar a mostrar: la configuración del sistema
    si existe, o el período más reciente con notas cargadas, o el default
    del modelo Lapso como último recurso."""
    from secretaria.models import ConfiguracionSistema
    from academico.models import Nota

    config = ConfiguracionSistema.objects.first()
    if config and config.periodo_escolar_activo:
        return config.periodo_escolar_activo

    ultima_nota = Nota.objects.select_related('lapso').order_by('-lapso__periodo_escolar').first()
    if ultima_nota:
        return ultima_nota.lapso.periodo_escolar

    return '2025-2026'
