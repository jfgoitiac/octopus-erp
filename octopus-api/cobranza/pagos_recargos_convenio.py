"""Imputación auditada de ingresos de caja existentes a una penalidad."""
from django.db import transaction
from django.utils import timezone

from .gestion import AccionInvalida, _evento
from .models import Pago, RecargoConvenio


@transaction.atomic
def aplicar_pago_recargo(recargo_id, pago_id, usuario):
    # Se serializa por pago para impedir usar un ingreso en dos penalidades.
    try:
        pago = Pago.objects.select_for_update().get(pk=pago_id)
        recargo = RecargoConvenio.objects.select_for_update(of=('self',)).select_related('pago', 'convenio').get(pk=recargo_id)
    except (Pago.DoesNotExist, RecargoConvenio.DoesNotExist):
        raise AccionInvalida('No se encontró el pago o la penalidad.')
    if recargo.estado == RecargoConvenio.ANULADO:
        raise AccionInvalida('La penalidad está anulada.')
    if pago.estatus != 'completado' or pago.concepto != 'multa':
        raise AccionInvalida('Seleccione un pago completado de caja con concepto Multa.')
    if recargo.pago_id == pago.pk and recargo.estado == RecargoConvenio.PAGADO:
        return recargo  # Reintento idempotente de la misma imputación.
    if recargo.pago_id and recargo.pago.estatus == 'completado':
        raise AccionInvalida('La penalidad ya tiene un pago completado.')
    if pago.monto_usd != recargo.monto_recargo_usd or pago.excedente_usd or pago.excedente_ves or pago.vuelto_usd or pago.vuelto_ves:
        raise AccionInvalida('El pago debe cubrir exactamente esta penalidad, sin vuelto ni excedente.')
    if not recargo.convenio.ciclos.filter(
        mensualidad__alumno_id=pago.alumno_id,
        mensualidad__alumno__representante_id=recargo.convenio.representante_id,
        mensualidad__alumno__sede_id=pago.sede_id,
    ).exists():
        raise AccionInvalida('El pago debe pertenecer a un estudiante y sede del convenio.')
    if RecargoConvenio.objects.filter(pago=pago).exclude(pk=recargo.pk).exists():
        raise AccionInvalida('Ese pago ya está aplicado a otra penalidad.')
    if (pago.mensualidades_pagadas.exists() or pago.cuotas_inscripcion_pagadas.exists()
            or pago.cuotas_solvencia_pagadas.exists() or pago.proyectos_inversion_pagados.exists()
            or pago.aplicaciones.exists()):
        raise AccionInvalida('Ese pago ya está aplicado a otra deuda.')
    anterior_id = recargo.pago_id
    recargo.pago = pago
    recargo.estado = RecargoConvenio.PAGADO
    recargo.pagado_en = timezone.now()
    recargo.pagado_por = usuario
    recargo.save(update_fields=['pago', 'estado', 'pagado_en', 'pagado_por', 'updated_at'])
    for ciclo in recargo.convenio.ciclos.all():
        _evento(ciclo, 'recargo_convenio_pagado', usuario, convenio=recargo.convenio_id,
                recargo=recargo.pk, pago=pago.pk, pago_anterior=anterior_id,
                monto_usd=str(recargo.monto_recargo_usd))
    return recargo
