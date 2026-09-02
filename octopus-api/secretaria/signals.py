from django.core.cache import cache
from django.db.models.signals import post_save, post_delete
from django.dispatch import receiver
from django.utils import timezone

from .models import Beca, ConfiguracionSistema

CACHE_KEY_CONFIG_COLEGIO_PUBLICA = 'portal_config_colegio_publica'


@receiver(post_save, sender=ConfiguracionSistema)
def invalidar_cache_config_publica(sender, instance, **kwargs):
    """Invalida el cache de ConfiguracionColegioPublicaView (portal) al
    guardar la configuración del sistema desde el panel admin."""
    cache.delete(CACHE_KEY_CONFIG_COLEGIO_PUBLICA)


def _sincronizar_alumno_desde_becas(alumno):
    """
    Recalcula Alumno.porcentaje_beca / estatus_financiero='becado' (caché
    derivada, ver Beca) a partir de la beca activa y vigente hoy del alumno
    para el período escolar activo, y dispara el recálculo de sus
    mensualidades impagas con el nuevo porcentaje.

    'becado' es un estado pegajoso que cobranza/mora.py respeta (no lo
    recalcula): al dejar de ser becado total hay que resetearlo explícitamente
    y luego pedirle a mora.py que recalcule mora/solvente real, si no el
    alumno queda marcado 'becado' para siempre aunque la beca baje a 40%.
    """
    from cobranza.services import configuracion_activa, recalcular_mensualidades_impagas

    config = configuracion_activa()
    periodo = config.periodo_escolar_activo if config else None

    hoy = timezone.now().date()
    beca_activa = None
    if periodo:
        beca_activa = (
            alumno.becas
            .filter(estado='activa', periodo_escolar=periodo, fecha_desde__lte=hoy, fecha_hasta__gte=hoy)
            .order_by('-fecha_desde')
            .first()
        )

    nuevo_porcentaje = beca_activa.porcentaje if beca_activa else 0
    era_becado_total = alumno.estatus_financiero == 'becado'
    es_becado_total = nuevo_porcentaje >= 100

    cambios = set()
    if alumno.porcentaje_beca != nuevo_porcentaje:
        alumno.porcentaje_beca = nuevo_porcentaje
        cambios.add('porcentaje_beca')

    if es_becado_total and not era_becado_total:
        alumno.estatus_financiero = 'becado'
        cambios.add('estatus_financiero')
    elif era_becado_total and not es_becado_total:
        alumno.estatus_financiero = 'solvente'
        cambios.add('estatus_financiero')

    if cambios:
        alumno.save(update_fields=list(cambios))

    if era_becado_total and not es_becado_total:
        from cobranza.mora import sincronizar_estatus_alumno
        sincronizar_estatus_alumno(alumno)

    recalcular_mensualidades_impagas(alumno, periodo_escolar=periodo)


@receiver(post_save, sender=Beca)
@receiver(post_delete, sender=Beca)
def al_guardar_o_borrar_beca(sender, instance, **kwargs):
    _sincronizar_alumno_desde_becas(instance.alumno)
