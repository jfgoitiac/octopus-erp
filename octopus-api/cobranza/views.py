from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status, permissions
from rest_framework import viewsets
from django.db import transaction
from django.http import FileResponse
from django.utils import timezone
import logging
from decimal import Decimal, InvalidOperation
from .tasks import sincronizar_tasa_con_blindaje
from django.db.models import Q
from .models import BancoInstitucional, Mensualidad, ParametroGlobal, Pago, TasaCambio, TransferenciaInterna
from .serializers import BancoInstitucionalSerializer, ComprobanteSerializer, DashboardStatsSerializer, PagoCreateSerializer, PagoSerializer
from .utils import generar_pdf_recibo
from authentication.views import IsSystemAdminOrDirector
from usuarios.models import LogAuditoria

logger = logging.getLogger(__name__)


class SincronizarTasaView(APIView):
    """
    Vista para la gestión y consulta de la tasa oficial.
    Implementa lógica defensiva contra valores nulos o en cero,
    con doble fuente de verdad: ParametroGlobal y TasaCambio.
    """
    permission_classes = [permissions.IsAuthenticated, IsSystemAdminOrDirector]

    def get(self, request):
        """
        Consulta la tasa actual con triple nivel de recuperación:
          1. ParametroGlobal (fuente rápida principal)
          2. TasaCambio (fallback si ParametroGlobal está en 0 o corrupto)
          3. Scraping síncrono (último recurso, bloquea una sola vez)
        Nunca devuelve 0 al frontend.
        """
        try:
            # --- Fuente 1: ParametroGlobal ---
            tasa_valor = Decimal('0')
            parametro = ParametroGlobal.objects.filter(clave="TASA_BCV_ACTUAL").first()

            if parametro and parametro.valor:
                try:
                    tasa_valor = Decimal(parametro.valor)
                except InvalidOperation:
                    logger.warning(
                        f"ParametroGlobal tiene un valor no numérico: '{parametro.valor}'. "
                        "Se procederá al fallback."
                    )
                    tasa_valor = Decimal('0')

            # --- Fuente 2: TasaCambio (fallback ante ParametroGlobal en 0) ---
            if tasa_valor <= Decimal('0'):
                ultima = TasaCambio.objects.order_by('-id').first()
                if ultima and ultima.valor_bs and ultima.valor_bs > Decimal('0'):
                    tasa_valor = ultima.valor_bs
                    logger.warning(
                        f"ParametroGlobal estaba en 0 o ausente. "
                        f"Recuperado desde TasaCambio: {tasa_valor}. "
                        "Activando corrección de consistencia..."
                    )
                    # Corrige la inconsistencia para la próxima consulta
                    ParametroGlobal.objects.update_or_create(
                        clave="TASA_BCV_ACTUAL",
                        defaults={
                            "valor": str(tasa_valor),
                            "descripcion": (
                                f"Corregido automáticamente por inconsistencia "
                                f"detectada en consulta GET"
                            )
                        }
                    )

            # --- Fuente 3: Scraping síncrono (último recurso) ---
            if tasa_valor <= Decimal('0'):
                logger.warning(
                    "Ambas fuentes internas en 0 o ausentes. "
                    "Iniciando rescate síncrono contra BCV..."
                )
                tasa_valor = sincronizar_tasa_con_blindaje()

            # --- Respuesta final ---
            if tasa_valor and tasa_valor > Decimal('0'):
                return Response({"valor": tasa_valor}, status=status.HTTP_200_OK)

            logger.error(
                "Las tres fuentes de recuperación fallaron. "
                "Respondiendo 503 al cliente."
            )
            return Response(
                {"error": "Tasa no disponible temporalmente. Intente en unos minutos."},
                status=status.HTTP_503_SERVICE_UNAVAILABLE
            )

        except Exception as e:
            logger.error(f"Excepción crítica en consulta de tasa: {str(e)}")
            return Response(
                {"error": "Tasa no disponible temporalmente. Intente en unos minutos."},
                status=status.HTTP_503_SERVICE_UNAVAILABLE
            )

    def post(self, request):
        """
        Disparador manual de emergencia.
        SEGURIDAD: Ignora request.data para evitar inyección de tasas falsas.
        """
        tasa = sincronizar_tasa_con_blindaje()

        if tasa is not None:
            # El frontend en sistemas.jsx espera una respuesta con la clave 'valor'
            return Response({"valor": tasa}, status=status.HTTP_200_OK)

        return Response(
            {"error": "No se pudo sincronizar la tasa cambiaria con el BCV ni sus fuentes de respaldo."},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )


# ──────────────────────────────────────────────────────────────────────────────
# DASHBOARD STATS
# ──────────────────────────────────────────────────────────────────────────────

class DashboardStatsView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        from secretaria.models import Alumno, ConfiguracionGrado
        from django.db.models import Sum, Count

        activos   = Alumno.objects.filter(activo=True)
        solventes = activos.filter(estatus_financiero='solvente').count()
        morosos   = activos.filter(estatus_financiero='mora').count()
        becados   = activos.filter(estatus_financiero='becado').count()
        masculino = activos.filter(genero='masculino').count()
        femenino  = activos.filter(genero='femenino').count()
        total_activos = activos.count()
        inactivos = Alumno.objects.filter(activo=False).count()

        tasa_valor = Decimal('0')
        parametro = ParametroGlobal.objects.filter(clave="TASA_BCV_ACTUAL").first()
        if parametro and parametro.valor:
            try:
                tasa_valor = Decimal(parametro.valor)
            except InvalidOperation:
                pass

        if tasa_valor <= 0:
            ultima = TasaCambio.objects.order_by('-id').first()
            if ultima and ultima.valor_bs > 0:
                tasa_valor = ultima.valor_bs

        # Cobranza del día
        from datetime import date
        pagos_hoy = Pago.objects.filter(
            fecha_pago__date=date.today(),
            estatus='completado'
        )
        cobrado_hoy_usd = pagos_hoy.filter(
            metodo_pago__in=['efectivo', 'zelle']
        ).aggregate(t=Sum('monto_usd'))['t'] or Decimal('0')
        cobrado_hoy_ves = pagos_hoy.aggregate(t=Sum('monto_ves'))['t'] or Decimal('0')
        pagos_hoy_count = pagos_hoy.aggregate(c=Count('id'))['c'] or 0

        # Ocupación por grado
        grados = list(
            ConfiguracionGrado.objects
            .values('grado_seccion', 'cupos_maximos', 'cupos_utilizados')
            .order_by('grado_seccion')
        )

        return Response({
            'total_activos':     total_activos,
            'inactivos':         inactivos,
            'solventes':         solventes,
            'morosos':           morosos,
            'becados':           becados,
            'masculino':         masculino,
            'femenino':          femenino,
            'tasa_bcv':          tasa_valor,
            'cobrado_hoy_usd':   cobrado_hoy_usd,
            'cobrado_hoy_ves':   cobrado_hoy_ves,
            'pagos_hoy_count':   pagos_hoy_count,
            'grados':            grados,
        })


# ──────────────────────────────────────────────────────────────────────────────
# BÚSQUEDA DE ALUMNO/REPRESENTANTE PARA COBRANZA
# ──────────────────────────────────────────────────────────────────────────────

class BuscarAlumnoCobranzaView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def _alumno_data(self, alumno):
        from datetime import date as _date
        hoy = _date.today()
        mensualidades = list(
            Mensualidad.objects.filter(
                alumno=alumno,
                pagado=False,
            ).filter(
                Q(anio__lt=hoy.year) |
                Q(anio=hoy.year, mes__lte=hoy.month)
            )
            .values('id', 'mes', 'anio', 'monto_usd')
            .order_by('anio', 'mes')
        )
        return {
            'id':                       alumno.id,
            'nombre':                   alumno.nombre,
            'nombre_completo':          f"{alumno.nombre} {alumno.apellido}",
            'cedula_escolar':           alumno.cedula_escolar,
            'grado':                    alumno.grado_seccion or 'Sin grado',
            'estatus':                  alumno.estatus_financiero,
            'mensualidades_pendientes': mensualidades,
        }

    def _rep_data(self, rep):
        return {
            'id':        rep.id,
            'nombre':    rep.nombre,
            'apellido':  rep.apellido,
            'cedula':    rep.cedula,
            'telefono':  rep.telefono,
            'correo':    rep.correo,
            'direccion': rep.direccion,
        }

    def get(self, request, cedula):
        from secretaria.models import Representante, Alumno

        # Intento 1: buscar como cédula de representante
        rep = Representante.objects.filter(cedula=cedula).first()
        if rep:
            alumnos = Alumno.objects.filter(
                representante=rep, activo=True
            ).select_related('representante')
            return Response({
                'representante': self._rep_data(rep),
                'alumnos':       [self._alumno_data(a) for a in alumnos],
            })

        # Intento 2: buscar como cédula escolar de alumno
        alumno = Alumno.objects.filter(cedula_escolar=cedula, activo=True).select_related('representante').first()
        if alumno:
            return Response({
                'representante': self._rep_data(alumno.representante) if alumno.representante else None,
                'alumnos':       [self._alumno_data(alumno)],
            })

        return Response({'representante': None, 'alumnos': []})


# ──────────────────────────────────────────────────────────────────────────────
# LISTADO DE BANCOS
# ──────────────────────────────────────────────────────────────────────────────

class BancosListView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        bancos = BancoInstitucional.objects.filter(activo=True).order_by('nombre')
        return Response(BancoInstitucionalSerializer(bancos, many=True).data)


# ──────────────────────────────────────────────────────────────────────────────
# REGISTRO DE PAGO
# ──────────────────────────────────────────────────────────────────────────────

class RegistrarPagoView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    @transaction.atomic
    def post(self, request):
        serializer = PagoCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        alumno = data['alumno']
        tasa   = data['tasa']
        concepto = data.get('concepto', 'mensualidad')

        pagos_creados = []
        for pago_item in data['pagos']:
            metodo    = pago_item['metodo_pago']
            monto_usd = pago_item['monto_usd']
            monto_ves = pago_item['monto_ves']

            if monto_usd > 0:
                monto_usd_final = monto_usd
                monto_ves_final = (monto_usd * tasa.valor_bs).quantize(Decimal('0.01'))
            elif monto_ves > 0:
                monto_ves_final = monto_ves
                monto_usd_final = (monto_ves / tasa.valor_bs).quantize(Decimal('0.01'))
            else:
                continue

            banco = None
            if pago_item.get('banco_receptor_id'):
                try:
                    banco = BancoInstitucional.objects.get(id=pago_item['banco_receptor_id'])
                except BancoInstitucional.DoesNotExist:
                    pass

            pago = Pago(
                alumno=alumno,
                usuario_receptor=request.user,
                banco_receptor=banco,
                metodo_pago=metodo,
                concepto=concepto,
                monto_usd=monto_usd_final,
                tasa_aplicada=tasa.valor_bs,
                monto_ves=monto_ves_final,
                referencia=pago_item.get('referencia', '') or '',
                observaciones=pago_item.get('observaciones', '') or '',
                representante_documento=data.get('representante_documento', '') or '',
                representante_nombre=data.get('representante_nombre', '') or '',
            )
            pago.save()
            pagos_creados.append(pago)

        if not pagos_creados:
            return Response(
                {"error": "No se procesó ningún pago. Verifique los montos."},
                status=status.HTTP_400_BAD_REQUEST
            )

        mensualidad_ids = data.get('mensualidad_ids', [])
        if mensualidad_ids:
            Mensualidad.objects.filter(
                id__in=mensualidad_ids, alumno=alumno
            ).update(pagado=True, fecha_pago=timezone.now())

            for pago in pagos_creados:
                pago.mensualidades_pagadas.set(
                    Mensualidad.objects.filter(id__in=mensualidad_ids, alumno=alumno)
                )

            alumno.estatus_financiero = 'solvente'
            alumno.save(update_fields=['estatus_financiero'])

        LogAuditoria.objects.create(
            usuario=request.user,
            accion="REGISTRO_PAGO",
            modulo="COBRANZA",
            detalles={
                "alumno_id":             alumno.id,
                "nombre":                f"{alumno.nombre} {alumno.apellido}",
                "total_pagos":           len(pagos_creados),
                "mensualidades_pagadas": mensualidad_ids,
            }
        )

        return Response(
            {'pagos': PagoSerializer(pagos_creados, many=True).data},
            status=status.HTTP_201_CREATED
        )


# ──────────────────────────────────────────────────────────────────────────────
# RECIBO PDF
# ──────────────────────────────────────────────────────────────────────────────

class ReciboView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, pago_id):
        try:
            pago_ref = Pago.objects.get(id=pago_id)
        except Pago.DoesNotExist:
            return Response({"error": "Pago no encontrado."}, status=status.HTTP_404_NOT_FOUND)

        pagos = list(
            Pago.objects.filter(operacion_uuid=pago_ref.operacion_uuid).select_related(
                'alumno', 'alumno__representante', 'usuario_receptor', 'banco_receptor'
            ).order_by('id')
        )

        try:
            pdf_buffer = generar_pdf_recibo(pagos)
            factura_label = pagos[0].factura_id or f"{pago_id:06d}"
            return FileResponse(
                pdf_buffer,
                as_attachment=False,
                filename=f"Recibo_{factura_label}.pdf",
                content_type='application/pdf'
            )
        except Exception as e:
            logger.error(f"Error generando PDF de recibo {pago_id}: {e}")
            return Response(
                {"error": "No se pudo generar el recibo PDF."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


# ──────────────────────────────────────────────────────────────────────────────
# AUDITORÍA DIARIA (resumen del día para Reportes/Auditoria)
# ──────────────────────────────────────────────────────────────────────────────

class AuditoriaDiariaView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        from datetime import date, datetime
        from django.db.models import Sum, Count

        fi_str = request.query_params.get('fecha_inicio')
        ff_str = request.query_params.get('fecha_fin')
        try:
            fi = datetime.strptime(fi_str, '%Y-%m-%d').date() if fi_str else date.today()
            ff = datetime.strptime(ff_str, '%Y-%m-%d').date() if ff_str else date.today()
        except ValueError:
            return Response({"error": "Formato de fecha inválido. Use YYYY-MM-DD."}, status=status.HTTP_400_BAD_REQUEST)
        if fi > ff:
            return Response({"error": "fecha_inicio no puede ser posterior a fecha_fin."}, status=status.HTTP_400_BAD_REQUEST)

        pagos_hoy = Pago.objects.filter(
            fecha_pago__date__gte=fi,
            fecha_pago__date__lte=ff,
            estatus='completado'
        )

        total_usd = pagos_hoy.filter(
            metodo_pago__in=['efectivo', 'zelle']
        ).aggregate(t=Sum('monto_usd'))['t'] or Decimal('0')

        efectivo_usd = pagos_hoy.filter(
            metodo_pago='efectivo'
        ).aggregate(t=Sum('monto_usd'))['t'] or Decimal('0')

        transferencia_ves = pagos_hoy.filter(
            metodo_pago__in=['transferencia', 'pago_movil', 'punto_de_venta', 'efectivo_ves']
        ).aggregate(t=Sum('monto_ves'))['t'] or Decimal('0')

        total_ves = pagos_hoy.aggregate(t=Sum('monto_ves'))['t'] or Decimal('0')
        conteo = pagos_hoy.aggregate(c=Count('id'))['c'] or 0

        return Response({
            'total_usd':        total_usd,
            'total_ves':        total_ves,
            'efectivo_usd':     efectivo_usd,
            'transferencia_ves': transferencia_ves,
            'conteo_pagos':     conteo,
        })


# ──────────────────────────────────────────────────────────────────────────────
# HISTÓRICO MENSUAL (desglose día a día)
# ──────────────────────────────────────────────────────────────────────────────

class HistoricoMensualView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        import calendar
        from datetime import date
        from django.db.models import Sum, Count, Case, When, DecimalField
        from django.db.models.functions import TruncDate

        try:
            today = date.today()
            year  = int(request.query_params.get('year',  today.year))
            month = int(request.query_params.get('month', today.month))
            if not (1 <= month <= 12):
                raise ValueError
        except (ValueError, TypeError):
            return Response({"error": "Parámetros inválidos. Envíe year y month como enteros."}, status=400)

        _, last_day = calendar.monthrange(year, month)
        fi = date(year, month, 1)
        ff = date(year, month, last_day)

        rows = (
            Pago.objects
            .filter(fecha_pago__date__gte=fi, fecha_pago__date__lte=ff, estatus='completado')
            .annotate(dia=TruncDate('fecha_pago'))
            .values('dia')
            .annotate(
                total_usd=Sum(
                    Case(When(metodo_pago__in=['efectivo', 'zelle'], then='monto_usd'),
                         default=Decimal('0'), output_field=DecimalField())
                ),
                efectivo_usd=Sum(
                    Case(When(metodo_pago='efectivo', then='monto_usd'),
                         default=Decimal('0'), output_field=DecimalField())
                ),
                transferencia_ves=Sum(
                    Case(When(metodo_pago__in=['transferencia', 'pago_movil', 'punto_de_venta', 'efectivo_ves'], then='monto_ves'),
                         default=Decimal('0'), output_field=DecimalField())
                ),
                conteo_pagos=Count('id'),
            )
            .order_by('dia')
        )

        dias = [
            {
                'fecha':             str(r['dia']),
                'total_usd':         str(r['total_usd']         or 0),
                'efectivo_usd':      str(r['efectivo_usd']      or 0),
                'transferencia_ves': str(r['transferencia_ves'] or 0),
                'conteo_pagos':      r['conteo_pagos'] or 0,
            }
            for r in rows
        ]

        return Response({'year': year, 'month': month, 'dias': dias})


# ──────────────────────────────────────────────────────────────────────────────
# EXPORTAR AUDITORÍA A EXCEL
# ──────────────────────────────────────────────────────────────────────────────

class ExportarAuditoriaExcelView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsSystemAdminOrDirector]

    def get(self, request):
        from datetime import date, datetime
        from .exports import ExcelExporter

        fi_str = request.query_params.get('fecha_inicio')
        ff_str = request.query_params.get('fecha_fin')
        try:
            fi = datetime.strptime(fi_str, '%Y-%m-%d').date() if fi_str else date.today()
            ff = datetime.strptime(ff_str, '%Y-%m-%d').date() if ff_str else date.today()
        except ValueError:
            return Response({"error": "Formato inválido. Use YYYY-MM-DD."}, status=status.HTTP_400_BAD_REQUEST)

        pagos = Pago.objects.filter(
            fecha_pago__date__gte=fi,
            fecha_pago__date__lte=ff,
        ).select_related('alumno', 'banco_receptor', 'usuario_receptor').order_by('-fecha_pago')

        columns = [
            ('Fecha',          lambda x: x.fecha_pago.strftime('%d/%m/%Y %H:%M')),
            ('Alumno',         lambda x: f"{x.alumno.nombre} {x.alumno.apellido}"),
            ('Cédula Escolar', lambda x: x.alumno.cedula_escolar or ''),
            ('Concepto',       lambda x: x.get_concepto_display()),
            ('Método',         lambda x: x.get_metodo_pago_display()),
            ('Monto USD',      'monto_usd'),
            ('Monto VES',      'monto_ves'),
            ('Tasa BCV',       'tasa_aplicada'),
            ('Banco',          lambda x: x.banco_receptor.nombre if x.banco_receptor else ''),
            ('Referencia',     'referencia'),
            ('Cajero',         lambda x: x.usuario_receptor.username if x.usuario_receptor else ''),
        ]

        return ExcelExporter.export(pagos, columns, f"auditoria_{fi}_{ff}")


# ──────────────────────────────────────────────────────────────────────────────
# CONFIGURACIÓN DE COBRANZA (monto por defecto de mensualidades)
# ──────────────────────────────────────────────────────────────────────────────

class ConfiguracionCobranzaView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        param = ParametroGlobal.objects.filter(clave="MONTO_MENSUALIDAD_DEFECTO").first()
        return Response({'monto_defecto': param.valor if param else '35.00'})

    def post(self, request):
        monto = request.data.get('monto_defecto', '35.00')
        ParametroGlobal.objects.update_or_create(
            clave="MONTO_MENSUALIDAD_DEFECTO",
            defaults={'valor': str(monto), 'descripcion': 'Monto base mensualidad por defecto'}
        )
        return Response({'monto_defecto': monto})


# ──────────────────────────────────────────────────────────────────────────────
# ACTUALIZACIÓN MASIVA DE MONTOS DE MENSUALIDADES
# ──────────────────────────────────────────────────────────────────────────────

class ActualizarMensualidadesView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsSystemAdminOrDirector]

    @transaction.atomic
    def patch(self, request):
        items = request.data.get('mensualidades', [])
        if not items:
            return Response(
                {"error": "No se enviaron mensualidades para actualizar."},
                status=status.HTTP_400_BAD_REQUEST
            )

        actualizadas = 0
        for item in items:
            mensualidad_id = item.get('id')
            monto = item.get('monto_usd')
            if mensualidad_id and monto is not None:
                Mensualidad.objects.filter(id=mensualidad_id).update(
                    monto_usd=Decimal(str(monto))
                )
                actualizadas += 1

        return Response({'actualizadas': actualizadas})


# ──────────────────────────────────────────────────────────────────────────────
# GENERAR ANUALIDAD (crea los 12 meses del año para un alumno)
# ──────────────────────────────────────────────────────────────────────────────

class GenerarAnualidadView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsSystemAdminOrDirector]

    @transaction.atomic
    def post(self, request):
        from datetime import date
        from secretaria.models import Alumno

        alumno_id = request.data.get('alumno_id')
        if not alumno_id:
            return Response(
                {"error": "El campo alumno_id es requerido."},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            alumno = Alumno.objects.get(id=alumno_id, activo=True)
        except Alumno.DoesNotExist:
            return Response({"error": "Alumno no encontrado."}, status=status.HTTP_404_NOT_FOUND)

        param = ParametroGlobal.objects.filter(clave="MONTO_MENSUALIDAD_DEFECTO").first()
        monto_defecto = Decimal(param.valor) if param and param.valor else Decimal('35.00')

        anio_actual = date.today().year
        creadas = 0
        for mes in range(1, 13):
            _, created = Mensualidad.objects.get_or_create(
                alumno=alumno,
                mes=mes,
                anio=anio_actual,
                defaults={'monto_usd': monto_defecto, 'pagado': False}
            )
            if created:
                creadas += 1

        LogAuditoria.objects.create(
            usuario=request.user,
            accion="GENERACION_ANUALIDAD",
            modulo="COBRANZA",
            detalles={
                "alumno_id":   alumno.id,
                "nombre":      f"{alumno.nombre} {alumno.apellido}",
                "meses_nuevos": creadas,
                "anio":        anio_actual,
            }
        )

        return Response({
            'mensaje':  f"Se generaron {creadas} mensualidades nuevas para {alumno.nombre} {alumno.apellido}.",
            'creadas':  creadas,
            'alumno_id': alumno.id,
        }, status=status.HTTP_201_CREATED)


# ──────────────────────────────────────────────────────────────────────────────
# ADMINISTRACIÓN DE BANCOS (CRUD)
# ──────────────────────────────────────────────────────────────────────────────

class BancosAdminView(APIView):
    """Lista todos los bancos (activos e inactivos) y permite crear nuevos."""
    permission_classes = [permissions.IsAuthenticated, IsSystemAdminOrDirector]

    def get(self, request):
        bancos = BancoInstitucional.objects.all().order_by('nombre')
        serializer = BancoInstitucionalSerializer(bancos, many=True)
        return Response(serializer.data)

    def post(self, request):
        serializer = BancoInstitucionalSerializer(data=request.data)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class BancoDetailView(APIView):
    """Recupera, actualiza o elimina un banco específico."""
    permission_classes = [permissions.IsAuthenticated, IsSystemAdminOrDirector]

    def _get_banco(self, pk):
        from django.shortcuts import get_object_or_404
        return get_object_or_404(BancoInstitucional, pk=pk)

    def get(self, request, pk):
        banco = self._get_banco(pk)
        serializer = BancoInstitucionalSerializer(banco)
        return Response(serializer.data)

    def patch(self, request, pk):
        banco = self._get_banco(pk)
        serializer = BancoInstitucionalSerializer(banco, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def delete(self, request, pk):
        banco = self._get_banco(pk)
        tiene_ref = (
            Pago.objects.filter(banco_receptor=banco).exists() or
            TransferenciaInterna.objects.filter(
                Q(banco_origen=banco) | Q(banco_destino=banco)
            ).exists()
        )
        if tiene_ref:
            banco.activo = False
            banco.save(update_fields=['activo'])
            return Response(
                {"detail": "Banco desactivado. Tiene registros asociados y no puede eliminarse permanentemente.",
                 "accion": "desactivado"},
                status=status.HTTP_200_OK
            )
        banco.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


# ──────────────────────────────────────────────────────────────────────────────
# CONSULTA DE COMPROBANTES / FACTURAS
# ──────────────────────────────────────────────────────────────────────────────

class ConsultaComprobantesView(APIView):
    """
    Módulo de consulta de comprobantes de pago con filtros y paginación.
    Soporta búsqueda por factura_id, alumno, cédula, fechas, método, concepto y estatus.
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        from datetime import datetime

        qs = Pago.objects.select_related(
            'alumno', 'alumno__representante', 'usuario_receptor', 'banco_receptor'
        ).order_by('-fecha_pago')

        factura_id = request.query_params.get('factura_id', '').strip()
        if factura_id:
            qs = qs.filter(factura_id__icontains=factura_id)

        cedula = request.query_params.get('cedula', '').strip()
        if cedula:
            qs = qs.filter(alumno__cedula_escolar__icontains=cedula)

        alumno_nombre = request.query_params.get('alumno_nombre', '').strip()
        if alumno_nombre:
            qs = qs.filter(
                Q(alumno__nombre__icontains=alumno_nombre) |
                Q(alumno__apellido__icontains=alumno_nombre)
            )

        fi_str = request.query_params.get('fecha_inicio', '').strip()
        ff_str = request.query_params.get('fecha_fin', '').strip()
        try:
            if fi_str:
                fi = datetime.strptime(fi_str, '%Y-%m-%d').date()
                qs = qs.filter(fecha_pago__date__gte=fi)
            if ff_str:
                ff = datetime.strptime(ff_str, '%Y-%m-%d').date()
                qs = qs.filter(fecha_pago__date__lte=ff)
        except ValueError:
            return Response(
                {"error": "Formato de fecha inválido. Use YYYY-MM-DD."},
                status=status.HTTP_400_BAD_REQUEST
            )

        metodo = request.query_params.get('metodo_pago', '').strip()
        if metodo:
            qs = qs.filter(metodo_pago=metodo)

        concepto = request.query_params.get('concepto', '').strip()
        if concepto:
            qs = qs.filter(concepto=concepto)

        estatus = request.query_params.get('estatus', '').strip()
        if estatus:
            qs = qs.filter(estatus=estatus)

        try:
            page = max(1, int(request.query_params.get('page', 1)))
            page_size = min(100, max(1, int(request.query_params.get('page_size', 20))))
        except (ValueError, TypeError):
            page, page_size = 1, 20

        from django.db.models import Min, Max

        # Agrupa por operacion_uuid; un pago representante por operación
        groups = (
            qs.values('operacion_uuid')
            .annotate(rep_id=Min('id'), max_fecha=Max('fecha_pago'))
            .order_by('-max_fecha')
        )
        total = groups.count()
        offset = (page - 1) * page_size
        page_groups = groups[offset:offset + page_size]
        rep_ids = [g['rep_id'] for g in page_groups]

        pagos_dict = {
            p.id: p for p in Pago.objects.filter(id__in=rep_ids).select_related(
                'alumno', 'alumno__representante', 'usuario_receptor', 'banco_receptor'
            )
        }
        pagos = [pagos_dict[rid] for rid in rep_ids if rid in pagos_dict]

        return Response({
            'total': total,
            'page': page,
            'page_size': page_size,
            'total_pages': (total + page_size - 1) // page_size if total else 1,
            'results': ComprobanteSerializer(pagos, many=True).data,
        })


class ComprobanteDetalleView(APIView):
    """Retorna el detalle de un comprobante por su factura_id."""
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, factura_id):
        try:
            pago = Pago.objects.select_related(
                'alumno', 'alumno__representante', 'usuario_receptor', 'banco_receptor'
            ).get(factura_id=factura_id)
        except Pago.DoesNotExist:
            return Response({"error": "Comprobante no encontrado."}, status=status.HTTP_404_NOT_FOUND)
        return Response(ComprobanteSerializer(pago).data)