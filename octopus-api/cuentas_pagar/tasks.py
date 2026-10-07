"""Tareas Celery idempotentes de Cuentas por Pagar.

El programador existente debe invocar generación recurrente a las 00:15 y
recordatorios/resumen a las horas configuradas; este módulo no altera Beat.
"""
from celery import shared_task

from .recordatorios import enviar_resumen_diario, procesar_recordatorios
from .recurrentes import generar_cuentas_recurrentes


@shared_task(name='cuentas_pagar.tasks.generar_recurrentes_diarias')
def generar_recurrentes_diarias():
    return len(generar_cuentas_recurrentes())


@shared_task(name='cuentas_pagar.tasks.enviar_recordatorios_diarios')
def enviar_recordatorios_diarios():
    return procesar_recordatorios()


@shared_task(name='cuentas_pagar.tasks.enviar_resumen_diario_cxp')
def enviar_resumen_diario_cxp():
    return enviar_resumen_diario()
