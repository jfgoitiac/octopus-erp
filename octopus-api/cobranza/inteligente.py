"""
Estado del toggle de Cobranza Inteligente (PLAN_COBRANZA_INTELIGENTE.md §3).

Regla única: el flujo anterior de notificaciones y el motor nuevo son
excluyentes por sede. `inteligente_activa_para_sede` es la única fuente de
verdad; el corte global de soporte (settings.COBRANZA_INTELIGENTE_GLOBAL_OFF)
apaga el módulo en todas las sedes sin tocar la base de datos.
"""
from django.conf import settings

from .models import ConfiguracionCobranzaInteligente


def corte_global_activo():
    return bool(getattr(settings, 'COBRANZA_INTELIGENTE_GLOBAL_OFF', False))


def sedes_con_inteligente_activa():
    """Set de sede_id con el módulo efectivamente encendido (None = sin sede)."""
    if corte_global_activo():
        return set()
    return set(
        ConfiguracionCobranzaInteligente.objects.filter(activo=True)
        .values_list('sede_id', flat=True)
    )


def inteligente_activa_para_sede(sede_id):
    return sede_id in sedes_con_inteligente_activa()


def obtener_configuracion(sede_id):
    cfg, _ = ConfiguracionCobranzaInteligente.objects.get_or_create(sede_id=sede_id)
    return cfg
