import logging
from celery import shared_task
from django.db import transaction
from django.core.cache import cache
from decimal import Decimal, InvalidOperation
from .utils import _obtener_tasa_por_scraping_bcv, _obtener_tasa_por_pydolar, _obtener_tasa_de_emergencia_db
from secretaria.models import Alumno
from django.contrib.auth import get_user_model
from .models import Mensualidad, TasaCambio, ParametroGlobal
from usuarios.models import LogAuditoria
from datetime import date, datetime

logger = logging.getLogger(__name__)

@shared_task
def sincronizar_tasa_con_blindaje():
    try:
        tasa_extraida = None

        # Fuente 1: scraping directo BCV
        try:
            tasa_extraida = _obtener_tasa_por_scraping_bcv()
        except Exception as e_scrap:
            logger.warning(f"Scraping BCV falló: {e_scrap}. Intentando pyDolar...")

        # Fuente 2: pyDolarVenezuela
        if not tasa_extraida or tasa_extraida <= 0:
            try:
                tasa_extraida = _obtener_tasa_por_pydolar()
            except Exception as e_py:
                logger.warning(f"pyDolar falló: {e_py}. Usando último valor en BD...")

        # Fuente 3: último valor conocido en BD (solo lectura, no crea nuevo registro)
        db_fallback = False
        if not tasa_extraida or tasa_extraida <= 0:
            try:
                tasa_extraida = _obtener_tasa_de_emergencia_db()
                db_fallback = True
            except Exception as e_db:
                logger.error(f"Fallback de BD también falló: {e_db}")

        if not tasa_extraida or tasa_extraida <= 0:
            logger.error("Todas las fuentes retornaron valor inválido o cero.")
            return None

        # CORRECCIÓN: order_by('-id') para garantizar el registro más reciente
        ultima_tasa_reg = TasaCambio.objects.order_by('-id').first()

        if ultima_tasa_reg:
            # CORRECCIÓN: el early return solo aplica a TasaCambio,
            # pero igual verifica que ParametroGlobal esté actualizado
            if ultima_tasa_reg.valor_bs == tasa_extraida:
                # Asegura consistencia: aunque no haya cambio en TasaCambio,
                # ParametroGlobal puede estar en 0 por corrupción de datos
                param = ParametroGlobal.objects.filter(clave="TASA_BCV_ACTUAL").first()
                try:
                    param_valor = Decimal(param.valor) if param and param.valor else Decimal('0')
                except (InvalidOperation, TypeError):
                    param_valor = Decimal('0')
                    logger.warning("Valor de TASA_BCV_ACTUAL no era numérico. Reiniciando a 0.")

                if param_valor != tasa_extraida:
                    logger.warning(
                        f"Inconsistencia detectada: TasaCambio tiene {tasa_extraida} "
                        f"pero ParametroGlobal tenía {param_valor}. Corrigiendo..."
                    )
                    ParametroGlobal.objects.update_or_create(
                        clave="TASA_BCV_ACTUAL",
                        defaults={
                            "valor": str(tasa_extraida),
                            "descripcion": f"Corregido por inconsistencia el {datetime.now()}"
                        }
                    )
                    cache.delete('TASA_BCV_ACTUAL_CACHE')

                return tasa_extraida  # Sin escritura innecesaria en TasaCambio

            valor_anterior = ultima_tasa_reg.valor_bs
            max_permitido = valor_anterior * Decimal('3.0')
            min_permitido = valor_anterior * Decimal('0.5')

            if not (min_permitido <= tasa_extraida <= max_permitido):
                logger.critical(
                    f"BLOQUEO DE SEGURIDAD: Tasa {tasa_extraida} VES anómala "
                    f"(Última válida: {valor_anterior}). Operación cancelada."
                )
                return None

        with transaction.atomic():
            # No crear nuevo registro si el valor vino de BD (sería un duplicado falso)
            if not db_fallback:
                TasaCambio.objects.create(valor_bs=tasa_extraida, fuente='BCV_AUTOMATICO')

            ParametroGlobal.objects.update_or_create(
                clave="TASA_BCV_ACTUAL",
                defaults={
                    "valor": str(tasa_extraida),
                    "descripcion": f"Actualizado automáticamente por Celery el {datetime.now()}"
                }
            )

            cache.delete('TASA_BCV_ACTUAL_CACHE')

            User = get_user_model()
            system_user = User.objects.filter(is_superuser=True).first()
            tasa_anterior_log = ultima_tasa_reg.valor_bs if ultima_tasa_reg else Decimal('0')

            if system_user:
                LogAuditoria.objects.create(
                    usuario=system_user,
                    accion="SINCRONIZACION_AUTOMATICA_TASAS",
                    modulo="COBRANZA",
                    detalles=(
                        f"¡Cambio detectado en BCV! "
                        f"Actualizado de {tasa_anterior_log} a {tasa_extraida} VES."
                    )
                )

        logger.warning(
            f"¡Cambio de tasa detectado en BCV! "
            f"Actualizado de {tasa_anterior_log} a {tasa_extraida}"
        )
        return tasa_extraida

    except Exception as e:
        logger.error(f"Fallo crítico en sincronizar_tasa_con_blindaje: {str(e)}")
        return None

@shared_task(bind=True, max_retries=3)
def actualizar_tasa_bcv_automatica(self):
    """
    Tarea que utiliza la función de servicio para obtener la tasa oficial
    y registrar el evento en la auditoría.
    """
    logger.info("Iniciando tarea programada de actualización de tasa BCV...")
    try:
        # Paso A: Obtener tasa externa (importada al inicio del archivo)
        tasa_bcv = _obtener_tasa_por_scraping_bcv()

        # Paso B: Obtener tasa interna actual de referencia [NUEVO]
        # Usamos order_by('-id') para asegurar que obtenemos la más reciente, no la primera creada
        ultima_tasa_reg = TasaCambio.objects.order_by('-id').first()
        tasa_interna = ultima_tasa_reg.valor_bs if ultima_tasa_reg else Decimal('0')

        # Paso C: Comparar y actuar [NUEVO]
        if tasa_bcv and tasa_bcv > 0:
            if tasa_bcv != tasa_interna:
                # Ejecuta la lógica centralizada de persistencia y blindaje
                resultado = sincronizar_tasa_con_blindaje()
                if resultado:
                    # Invalida caché si existe una llave definida para la tasa [NUEVO]
                    cache.delete('TASA_BCV_ACTUAL_CACHE')
                    logger.warning(f"¡Cambio de tasa detectado en BCV! Actualizado de {tasa_interna} a {tasa_bcv}")
            else:
                # Trazabilidad sin escritura [NUEVO]
                logger.debug(f"Sincronización omitida: Tasa BCV permanece en {tasa_bcv}")
        else:
            # Error: la fuente retornó un valor no usable [NUEVO]
            logger.error(f"No se pudo actualizar: La fuente BCV retornó un valor inválido ({tasa_bcv})")
            
    except Exception as e:
        logger.error(f"Fallo crítico en tarea de comparación BCV: {str(e)}")
        return None

@shared_task
def verificar_solvencia_estudiantil_automatica():
    """
    Se ejecuta diariamente para marcar como 'En Mora' a quienes no han pagado
    la mensualidad correspondiente al mes actual.
    """
    print(f"[{datetime.now()}] Iniciando verificación de solvencia estudiantil...")
    hoy = date.today()
    User = get_user_model()
    
    # CORRECCIÓN: Manejo de system_user para evitar fallos en bulk_create si no hay usuarios
    system_user = User.objects.filter(is_superuser=True).first()

    with transaction.atomic():
        # CORRECCIÓN N+1: prefetch solo las mensualidades del mes actual
        # así el .filter() posterior opera en Python sobre el caché,
        # sin disparar queries adicionales por cada alumno
        from django.db.models import Prefetch

        mensualidades_mes = Mensualidad.objects.filter(
            mes=hoy.month,
            anio=hoy.year
        )

        alumnos = Alumno.objects.prefetch_related(
            Prefetch(
                'mensualidades',
                queryset=mensualidades_mes,
                to_attr='mensualidades_mes_actual'  # caché con nombre específico
            )
        ).all()

        # Acumular logs para insertar en bulk al final
        # evita 1 INSERT por alumno que cambia de estatus
        logs_pendientes = []

        # Acumular alumnos para actualización masiva (Evita DB Locks por múltiples saves)
        alumnos_a_actualizar = []

        for alumno in alumnos:
            # Leer desde el caché — sin query adicional
            mensualidad_actual = next(
                iter(alumno.mensualidades_mes_actual), None
            )

            # SEGURIDAD: dia_limite_pago puede ser None. Usamos 5 como default para evitar TypeError
            dia_limite = getattr(alumno, 'dia_limite_pago', None) or 5
            debe_estar_en_mora = (
                hoy.day > dia_limite and
                (not mensualidad_actual or not mensualidad_actual.pagado)
            )

            if debe_estar_en_mora:
                if alumno.estatus_financiero != 'mora':
                    alumno.estatus_financiero = 'mora'
                    alumnos_a_actualizar.append(alumno)
                    logs_pendientes.append(LogAuditoria(
                        usuario=system_user,
                        accion="CAMBIO_ESTATUS_MORA",
                        modulo="COBRANZA",
                        detalles=(
                            f"Alumno {alumno.nombre} {alumno.apellido} "
                            f"(CI: {alumno.cedula_escolar}) en MORA "
                            f"por mes {hoy.month}/{hoy.year}."
                        )
                    ))
                    print(f"[{datetime.now()}] Alumno {alumno.cedula_escolar} -> MORA")

            elif mensualidad_actual and mensualidad_actual.pagado:
                if alumno.estatus_financiero != 'solvente':
                    alumno.estatus_financiero = 'solvente'
                    alumnos_a_actualizar.append(alumno)
                    logs_pendientes.append(LogAuditoria(
                        usuario=system_user,
                        accion="CAMBIO_ESTATUS_SOLVENTE",
                        modulo="COBRANZA",
                        detalles=(
                            f"Alumno {alumno.nombre} {alumno.apellido} "
                            f"marcado SOLVENTE."
                        )
                    ))
                    print(f"[{datetime.now()}] Alumno {alumno.cedula_escolar} -> SOLVENTE")

        # MEJORA: actualización masiva de alumnos
        if alumnos_a_actualizar:
            try:
                Alumno.objects.bulk_update(alumnos_a_actualizar, ['estatus_financiero'])
                print(f"[{datetime.now()}] Se actualizaron {len(alumnos_a_actualizar)} alumnos en lote.")
            except Exception as e:
                print(f"[{datetime.now()}] Error en bulk_update de alumnos: {e}")

        # MEJORA: insertar todos los logs en una sola query
        if logs_pendientes:
            try:
                LogAuditoria.objects.bulk_create(logs_pendientes)
            except Exception as e:
                # No permitimos que el fallo del log revierta la transacción de actualización de estatus
                print(f"[{datetime.now()}] Error al guardar logs de auditoría de solvencia: {e}")

    print(f"[{datetime.now()}] Verificación finalizada.")