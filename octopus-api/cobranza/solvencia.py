"""
Lógica de emisión de la constancia de Solvencia por representante.

Es distinta de `CuotaSolvencia` (un cargo/cuota anual más) y de
`Inscripcion.nro_solvencia` (dato manual de la institución de procedencia).
Esta es un número identificador único e intransferible por representante,
que certifica que al momento de completar inscripción + proyecto de
inversión no tenía deuda pendiente en ninguno de sus alumnos.
"""
from django.db import transaction
from django.utils import timezone

from .mora import annotate_en_mora
from .models import CuotaInscripcion, CuotaProyectoInversion, SolvenciaRepresentante


def periodo_activo():
    from secretaria.models import ConfiguracionSistema
    config = ConfiguracionSistema.objects.first()
    return config.periodo_escolar_activo if config else None


def representante_es_elegible(representante, periodo):
    """
    True si, para el período dado, el representante:
      - tiene el proyecto de inversión de ese período pagado,
      - tiene la inscripción pagada para todos sus alumnos activos que
        tengan cuota de inscripción generada en ese período,
      - y ninguno de sus alumnos activos está en mora.
    """
    if not periodo:
        return False

    proyecto = CuotaProyectoInversion.objects.filter(
        representante=representante, periodo_escolar=periodo
    ).first()
    if not proyecto or not proyecto.pagado:
        return False

    alumnos = representante.alumnos.filter(activo=True)
    if not alumnos.exists():
        return False

    inscripciones_impagas = CuotaInscripcion.objects.filter(
        alumno__in=alumnos, periodo_escolar=periodo, pagado=False
    ).exists()
    if inscripciones_impagas:
        return False

    algun_alumno_en_mora = annotate_en_mora(alumnos).filter(en_mora=True).exists()
    if algun_alumno_en_mora:
        return False

    return True


def _generar_numero(periodo):
    anio = periodo.split('-')[0] if periodo and '-' in periodo else str(timezone.now().year)
    prefijo = f"SLV-{anio}-"
    with transaction.atomic():
        count = (
            SolvenciaRepresentante.objects
            .select_for_update()
            .filter(numero__startswith=prefijo)
            .count()
        )
        return f"{prefijo}{count + 1:04d}"


def generar_o_verificar_solvencia(representante, periodo=None, pago=None):
    """
    Idempotente: si el representante ya tiene solvencia, la devuelve tal
    cual (nunca se reasigna ni regenera). Si no la tiene y cumple el
    criterio de elegibilidad, la crea y la devuelve. Si no es elegible,
    devuelve None.
    """
    existente = SolvenciaRepresentante.objects.filter(representante=representante).first()
    if existente:
        return existente

    periodo = periodo or periodo_activo()
    if not representante_es_elegible(representante, periodo):
        return None

    with transaction.atomic():
        # Re-chequear bajo lock para evitar doble emisión en pagos concurrentes
        existente = (
            SolvenciaRepresentante.objects
            .select_for_update()
            .filter(representante=representante)
            .first()
        )
        if existente:
            return existente

        return SolvenciaRepresentante.objects.create(
            representante=representante,
            numero=_generar_numero(periodo),
            periodo_escolar=periodo,
            origen='automatica',
            pago_generador=pago,
        )


def emitir_solvencia_manual(representante, usuario, periodo=None, observaciones=''):
    """
    Emisión manual, exclusiva del rol Director. No valida elegibilidad —
    es una excepción deliberada que el director asume bajo su criterio.
    Sigue siendo idempotente: si ya existe, la devuelve sin duplicar.
    """
    existente = SolvenciaRepresentante.objects.filter(representante=representante).first()
    if existente:
        return existente, False

    periodo = periodo or periodo_activo()
    with transaction.atomic():
        existente = (
            SolvenciaRepresentante.objects
            .select_for_update()
            .filter(representante=representante)
            .first()
        )
        if existente:
            return existente, False

        nueva = SolvenciaRepresentante.objects.create(
            representante=representante,
            numero=_generar_numero(periodo),
            periodo_escolar=periodo,
            origen='manual',
            emitida_por=usuario,
            observaciones=observaciones or '',
        )
        return nueva, True
