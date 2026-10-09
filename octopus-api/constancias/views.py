from common.busqueda import filtrar_busqueda
from django.conf import settings
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.db import transaction
from django.db.models import ProtectedError
from django.http import FileResponse, HttpResponse
from django.utils import timezone
from rest_framework import generics, permissions, status, viewsets
from rest_framework.response import Response
from rest_framework.views import APIView

from authentication.views import IsSystemAdminOrDirector
from config.pagination import StandardResultsPagination

from .models import ConfiguracionFirmante, ConstanciaEmitida, PlantillaConstancia
from .permissions import EsRolConstancias, NOMBRE_GRUPO_FIRMA_DELEGADA, puede_firmar_como_director
from .render import renderizar_plantilla
from .resolvers import (
    fecha_a_letras,
    generar_numero_constancia,
    periodo_escolar_activo,
    periodo_escolar_de_alumno,
    resolver_datos,
)
from .serializers import (
    ConfiguracionFirmanteSerializer,
    ConstanciaEmitidaDetailSerializer,
    ConstanciaEmitidaListSerializer,
    PlantillaConstanciaSerializer,
)

CLAVE_TARIFAS = 'CONSTANCIAS_TARIFAS_USD'
TIPOS_COBRABLES_ALUMNO = ('estudio', 'conducta', 'retiro')


def _tarifas_constancias():
    import json
    from decimal import Decimal, InvalidOperation
    from cobranza.models import ParametroGlobal
    tarifas = {tipo: Decimal('0.00') for tipo in TIPOS_COBRABLES_ALUMNO}
    config = ParametroGlobal.objects.filter(clave=CLAVE_TARIFAS).first()
    if not config:
        return tarifas
    try:
        valores = json.loads(config.valor)
        for tipo in tarifas:
            tarifas[tipo] = max(Decimal(str(valores.get(tipo, 0))).quantize(Decimal('0.01')), Decimal('0.00'))
    except (ValueError, TypeError, InvalidOperation):
        pass
    return tarifas


class ConfiguracionCobrosConstanciasView(APIView):
    permission_classes = [permissions.IsAuthenticated, EsRolConstancias]

    def get(self, request):
        return Response({'tarifas_usd': {k: str(v) for k, v in _tarifas_constancias().items()}})

    def put(self, request):
        if not IsSystemAdminOrDirector().has_permission(request, self):
            return Response({'detail': 'No tienes permiso para configurar tarifas.'}, status=status.HTTP_403_FORBIDDEN)
        from decimal import Decimal, InvalidOperation
        import json
        recibido = request.data.get('tarifas_usd')
        if not isinstance(recibido, dict):
            return Response({'detail': 'tarifas_usd debe ser un objeto.'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            tarifas = {tipo: str(Decimal(str(recibido.get(tipo, 0))).quantize(Decimal('0.01'))) for tipo in TIPOS_COBRABLES_ALUMNO}
            if any(Decimal(monto) < 0 for monto in tarifas.values()):
                raise ValueError
        except (InvalidOperation, ValueError):
            return Response({'detail': 'Cada tarifa debe ser un monto positivo con máximo dos decimales.'}, status=status.HTTP_400_BAD_REQUEST)
        from cobranza.models import ParametroGlobal
        ParametroGlobal.objects.update_or_create(clave=CLAVE_TARIFAS, defaults={
            'valor': json.dumps(tarifas), 'descripcion': 'Tarifas USD de constancias para alumnos',
        })
        return Response({'tarifas_usd': tarifas})


class CobroConstanciaInfoView(APIView):
    permission_classes = [permissions.IsAuthenticated, EsRolConstancias]

    def get(self, request):
        from decimal import Decimal
        from cobranza.models import TasaCambio
        plantilla, alumno, _trabajador, error = _resolver_plantilla_y_objetivo(request.query_params)
        if error:
            return error
        if alumno is None:
            return Response({'requiere_pago': False, 'detalle': 'Las constancias laborales no tienen cobro.'})
        monto_usd = _tarifas_constancias().get(plantilla.tipo, Decimal('0.00'))
        if monto_usd <= 0:
            return Response({'requiere_pago': False, 'monto_usd': str(monto_usd)})
        tasa = TasaCambio.objects.order_by('-fecha').first()
        if not tasa:
            return Response({'detail': 'No hay una tasa BCV vigente configurada.'}, status=status.HTTP_409_CONFLICT)
        return Response({'requiere_pago': True, 'monto_usd': str(monto_usd), 'tasa_bcv': str(tasa.valor_bs),
                         'monto_ves': str((monto_usd * tasa.valor_bs).quantize(Decimal('0.01')))})


# ---------------------------------------------------------------------------
# Catálogo cerrado de placeholders (GET /constancias/placeholders/)
# ---------------------------------------------------------------------------

CATALOGO_PLACEHOLDERS = {
    'alumno': {
        'etiqueta': 'Alumno',
        'placeholders': [
            ('nombres', 'Nombres del alumno', 'María José'),
            ('apellidos', 'Apellidos del alumno', 'Rodríguez Pérez'),
            ('cedula_escolar', 'Cédula escolar', 'EA-2024-0113'),
            ('cedula', 'Cédula de identidad', 'V-30123456'),
            ('fecha_nacimiento', 'Fecha de nacimiento', '12/03/2012'),
            ('edad', 'Edad', '13 años'),
            ('grado', 'Grado cursado', '3er Grado'),
            ('nivel', 'Nivel cursado', 'Educación Primaria'),
            ('seccion', 'Sección', 'A'),
            ('anio_escolar', 'Año escolar cursado', '2025-2026'),
            ('horario', 'Horario', 'Lunes a Viernes, 7:00 a.m. a 12:00 m.'),
            ('grado_promocion', 'Grado al que fue promovido', '4to Grado'),
            ('nivel_promocion', 'Nivel al que fue promovido', 'Educación Primaria'),
            ('anio_escolar_promocion', 'Año escolar de la promoción', '2026-2027'),
            ('estatus', 'Estatus del alumno', 'Activo'),
        ],
    },
    'familia': {
        'etiqueta': 'Familia',
        'placeholders': [
            ('madre_nombres', 'Nombres de la madre', 'Ana'),
            ('madre_apellidos', 'Apellidos de la madre', 'García'),
            ('madre_cedula', 'Cédula de la madre', 'V-15234567'),
            ('padre_nombres', 'Nombres del padre', 'Luis'),
            ('padre_apellidos', 'Apellidos del padre', 'Rodríguez'),
            ('padre_cedula', 'Cédula del padre', 'V-14567890'),
            ('representante_nombres', 'Nombres del representante', 'Ana'),
            ('representante_apellidos', 'Apellidos del representante', 'García'),
            ('representante_cedula', 'Cédula del representante', 'V-15234567'),
            ('parentesco', 'Parentesco con el alumno', 'Madre'),
        ],
    },
    'trabajador': {
        'etiqueta': 'Trabajador',
        'placeholders': [
            ('nombres', 'Nombres del trabajador', 'Pedro'),
            ('apellidos', 'Apellidos del trabajador', 'Suárez'),
            ('cedula', 'Cédula del trabajador', 'V-9876543'),
            ('cargo', 'Cargo', 'Docente'),
            ('fecha_ingreso', 'Fecha de ingreso', '01/09/2015'),
            ('antiguedad', 'Antigüedad', '10 años, 4 meses'),
            ('tipo_contrato', 'Tipo de contrato', 'Fijo'),
            ('sueldo', 'Sueldo', 'Bs. 1.850,00'),
            ('bono', 'Bono de alimentación', 'Bs. 320,00'),
        ],
    },
    'institucion': {
        'etiqueta': 'Institución',
        'placeholders': [
            ('nombre_colegio', 'Nombre del colegio', 'Colegio Ejemplo'),
            ('afiliacion', 'Afiliación', 'AVEC'),
            ('firmante_nombre', 'Nombre del firmante', 'Carlos Andrés Gómez'),
            ('firmante_cedula', 'Cédula del firmante', 'V-12345678'),
            ('firmante_cargo', 'Cargo del firmante', 'Director'),
            ('direccion', 'Dirección', 'Av. Principal, Sector X'),
            ('ciudad', 'Ciudad', 'Barquisimeto'),
            ('estado', 'Estado', 'Lara'),
            ('sede', 'Sede', '(no aplica)'),
            ('rif', 'RIF', 'J-12345678-9'),
        ],
    },
    'documento': {
        'etiqueta': 'Documento',
        'placeholders': [
            ('numero', 'Número de constancia', 'EST-2025-2026-0042'),
            ('fecha_numero', 'Fecha de emisión en números', '08/09/2026'),
            ('fecha_letras', 'Fecha de emisión en letras', 'ocho de septiembre de dos mil veintiséis'),
        ],
    },
}

# destinatario del query param -> grupo(s) específicos de ese destinatario
# (institucion y documento se agregan siempre, ver PlaceholdersView).
GRUPOS_POR_DESTINATARIO = {
    # La constancia de un alumno puede usar también los datos de su
    # representante (madre/padre/representante). El resolver ya los
    # proporciona bajo ``familia``; exponerlos aquí evita que queden
    # utilizables solo por plantillas importadas o escritas a mano.
    'alumno': ['alumno', 'familia'],
    'trabajador': ['trabajador'],
}


class PlaceholdersView(APIView):
    """Catálogo CERRADO de placeholders disponibles, filtrado por
    `?destinatario=alumno|trabajador` + siempre institucion y
    documento. Cualquier usuario logueado puede consultarlo."""
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        destinatario = request.query_params.get('destinatario')
        grupos_especificos = GRUPOS_POR_DESTINATARIO.get(destinatario)
        if grupos_especificos is None:
            return Response(
                {'detail': "El parámetro 'destinatario' debe ser 'alumno' o 'trabajador'."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        claves = grupos_especificos + ['institucion', 'documento']
        grupos = []
        for clave in claves:
            info = CATALOGO_PLACEHOLDERS[clave]
            grupos.append({
                'grupo': clave,
                'etiqueta': info['etiqueta'],
                'placeholders': [
                    {
                        'token': f'{{{{{clave}.{campo}}}}}',
                        'etiqueta': etiqueta,
                        'ejemplo': ejemplo,
                    }
                    for campo, etiqueta, ejemplo in info['placeholders']
                ],
            })

        return Response({
            'grupos': grupos,
            'sexo': {
                'sintaxis': '{{sexo:variante_masculina|variante_femenina}}',
                'pares_sugeridos': [
                    ['el', 'la'], ['alumno', 'alumna'], ['ciudadano', 'ciudadana'],
                    ['portador', 'portadora'], ['inscrito', 'inscrita'],
                    ['trabajador', 'trabajadora'], ['nacido', 'nacida'],
                    ['promovido', 'promovida'], ['representado', 'representada'],
                    ['hijo', 'hija'],
                ],
            },
        })


# ---------------------------------------------------------------------------
# Plantillas
# ---------------------------------------------------------------------------

class PlantillaConstanciaViewSet(viewsets.ModelViewSet):
    """list/retrieve: cualquier rol de constancias (incluye secretaria, que
    solo necesita ver plantillas para emitir). create/update/destroy: la
    edición de plantillas queda reservada a director/administrador — ver
    Fase 4/agente 4A, PROMPT_MODULO_CONSTANCIAS.md §FASE 4 bloque 4A."""
    queryset = PlantillaConstancia.objects.all().order_by('-creada_en')
    serializer_class = PlantillaConstanciaSerializer

    def get_permissions(self):
        if self.action in ('list', 'retrieve'):
            return [permissions.IsAuthenticated(), EsRolConstancias()]
        return [permissions.IsAuthenticated(), IsSystemAdminOrDirector()]

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        try:
            instance.delete()
        except ProtectedError:
            return Response(
                {'detail': 'No se puede eliminar: esta plantilla tiene constancias emitidas. Desactívala en vez de borrarla.'},
                status=status.HTTP_409_CONFLICT,
            )
        return Response(status=status.HTTP_204_NO_CONTENT)


# ---------------------------------------------------------------------------
# Previsualizar / Emitir
# ---------------------------------------------------------------------------

def _resolver_plantilla_y_objetivo(data):
    """Helper compartido entre PrevisualizarView y EmitirView. Devuelve
    (plantilla, alumno, trabajador, error_response). `error_response` es
    None si todo resolvió correctamente."""
    from nomina.models import Empleado
    from secretaria.models import Alumno

    plantilla_id = data.get('plantilla_id')
    if not plantilla_id:
        return None, None, None, Response({'detail': 'plantilla_id es requerido.'}, status=status.HTTP_400_BAD_REQUEST)

    plantilla = PlantillaConstancia.objects.filter(pk=plantilla_id).first()
    if plantilla is None or not plantilla.activa:
        return None, None, None, Response(
            {'detail': 'Plantilla no encontrada o inactiva.'}, status=status.HTTP_400_BAD_REQUEST
        )

    alumno = None
    trabajador = None
    if plantilla.destinatario == 'alumno':
        alumno_id = data.get('alumno_id')
        if not alumno_id:
            return None, None, None, Response(
                {'detail': 'alumno_id es requerido para esta plantilla.'}, status=status.HTTP_400_BAD_REQUEST
            )
        # .todos porque una constancia (ej. retiro) puede ser sobre un alumno ya retirado.
        alumno = Alumno.todos.filter(pk=alumno_id).select_related('representante').first()
        if alumno is None:
            return None, None, None, Response({'detail': 'Alumno no encontrado.'}, status=status.HTTP_400_BAD_REQUEST)
    else:
        trabajador_id = data.get('trabajador_id')
        if not trabajador_id:
            return None, None, None, Response(
                {'detail': 'trabajador_id es requerido para esta plantilla.'}, status=status.HTTP_400_BAD_REQUEST
            )
        trabajador = Empleado.objects.filter(pk=trabajador_id).first()
        if trabajador is None:
            return None, None, None, Response({'detail': 'Trabajador no encontrado.'}, status=status.HTTP_400_BAD_REQUEST)

    return plantilla, alumno, trabajador, None


def _requiere_permiso_sensible(plantilla) -> bool:
    texto = (plantilla.cuerpo_html or '') + (plantilla.anexo_html or '')
    return plantilla.destinatario == 'trabajador' and (
        '{{trabajador.sueldo}}' in texto or '{{trabajador.bono}}' in texto
    )


def _cuerpo_completo(plantilla) -> str:
    if plantilla.anexo_habilitado:
        return plantilla.cuerpo_html + plantilla.anexo_html
    return plantilla.cuerpo_html


class PrevisualizarView(APIView):
    permission_classes = [permissions.IsAuthenticated, EsRolConstancias]

    def post(self, request):
        plantilla, alumno, trabajador, error = _resolver_plantilla_y_objetivo(request.data)
        if error is not None:
            return error

        requiere_sensible = _requiere_permiso_sensible(plantilla)
        if requiere_sensible and not IsSystemAdminOrDirector().has_permission(request, self):
            return Response(
                {'detail': 'No tienes permiso para emitir constancias con datos de sueldo/bono de alimentación.'},
                status=status.HTTP_403_FORBIDDEN,
            )

        datos_capturados = request.data.get('datos_capturados') or {}
        datos, sexo = resolver_datos(
            plantilla, alumno=alumno, trabajador=trabajador,
            datos_capturados=datos_capturados, incluir_sensibles=requiere_sensible,
        )
        html_renderizado, advertencias = renderizar_plantilla(_cuerpo_completo(plantilla), datos, sexo)
        return Response({'html_renderizado': html_renderizado, 'advertencias': advertencias})


class EmitirView(APIView):
    permission_classes = [permissions.IsAuthenticated, EsRolConstancias]

    @transaction.atomic
    def post(self, request):
        plantilla, alumno, trabajador, error = _resolver_plantilla_y_objetivo(request.data)
        if error is not None:
            return error

        requiere_sensible = _requiere_permiso_sensible(plantilla)
        if requiere_sensible and not IsSystemAdminOrDirector().has_permission(request, self):
            return Response(
                {'detail': 'No tienes permiso para emitir constancias con datos de sueldo/bono de alimentación.'},
                status=status.HTTP_403_FORBIDDEN,
            )

        objetivo = alumno if alumno is not None else trabajador
        if not (objetivo.nombre and objetivo.apellido):
            return Response(
                {'detail': 'El destinatario no tiene nombres/apellidos registrados; no se puede emitir la constancia.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        pago = None
        if alumno is not None:
            from decimal import Decimal, InvalidOperation
            from cobranza.models import BancoInstitucional, Pago, TasaCambio
            from pagos_comunes.referencias import buscar_referencia_duplicada
            tarifa = _tarifas_constancias().get(plantilla.tipo, Decimal('0.00'))
            if tarifa > 0:
                datos_pago = request.data.get('pago') or {}
                metodo = datos_pago.get('metodo_pago')
                if metodo not in dict(Pago.METODOS):
                    return Response({'detail': 'Debes indicar un método de pago válido.'}, status=status.HTTP_400_BAD_REQUEST)
                tasa = TasaCambio.objects.order_by('-fecha').first()
                if not tasa:
                    return Response({'detail': 'No hay una tasa BCV vigente configurada.'}, status=status.HTTP_409_CONFLICT)
                en_usd = metodo in ('efectivo', 'zelle')
                try:
                    recibido = Decimal(str(datos_pago.get('monto_usd' if en_usd else 'monto_ves'))).quantize(Decimal('0.01'))
                except (InvalidOperation, TypeError, ValueError):
                    return Response({'detail': 'Debes indicar el monto recibido.'}, status=status.HTTP_400_BAD_REQUEST)
                esperado = tarifa if en_usd else (tarifa * tasa.valor_bs).quantize(Decimal('0.01'))
                if abs(recibido - esperado) > Decimal('0.01'):
                    return Response({'detail': f'El pago debe ser exactamente {esperado} {"USD" if en_usd else "Bs."}.'}, status=status.HTTP_400_BAD_REQUEST)
                banco = None
                banco_id = datos_pago.get('banco_receptor_id')
                if metodo not in ('efectivo', 'efectivo_ves'):
                    banco = BancoInstitucional.objects.filter(pk=banco_id, activo=True).first()
                    if banco is None:
                        return Response({'detail': 'Selecciona un banco receptor activo.'}, status=status.HTTP_400_BAD_REQUEST)
                referencia = (datos_pago.get('referencia') or '').strip()
                if metodo not in ('efectivo', 'efectivo_ves') and not referencia:
                    return Response({'detail': 'La referencia del pago es obligatoria.'}, status=status.HTTP_400_BAD_REQUEST)
                if referencia and buscar_referencia_duplicada(
                    referencia, metodo_pago=metodo, banco_receptor_id=banco_id,
                    numero_lote=datos_pago.get('numero_lote'),
                ):
                    return Response({'detail': 'La referencia indicada ya fue utilizada.'}, status=status.HTTP_400_BAD_REQUEST)
                pago = Pago.objects.create(
                    alumno=alumno, usuario_receptor=request.user, banco_receptor=banco,
                    metodo_pago=metodo, concepto='otro', monto_usd=tarifa,
                    monto_ves=(tarifa * tasa.valor_bs).quantize(Decimal('0.01')),
                    tasa_aplicada=tasa.valor_bs, referencia=referencia,
                    numero_lote=(datos_pago.get('numero_lote') or '').strip(),
                    representante_documento=getattr(alumno.representante, 'cedula', '') or '',
                    representante_nombre=(f'{alumno.representante.nombre} {alumno.representante.apellido}'.strip() if alumno.representante else ''),
                    observaciones=f'Constancia de {plantilla.get_tipo_display()} — {alumno.nombre} {alumno.apellido}',
                )

        datos_capturados = request.data.get('datos_capturados') or {}
        datos, sexo = resolver_datos(
            plantilla, alumno=alumno, trabajador=trabajador,
            datos_capturados=datos_capturados, incluir_sensibles=requiere_sensible,
        )

        periodo = periodo_escolar_de_alumno(alumno) if alumno is not None else periodo_escolar_activo()
        numero = generar_numero_constancia(plantilla.tipo, periodo)

        fecha_emision = timezone.now()
        # Segunda pasada de render: ahora con el número real ya asignado.
        datos['documento']['numero'] = numero
        datos['documento']['fecha_numero'] = fecha_emision.strftime('%d/%m/%Y')
        datos['documento']['fecha_letras'] = fecha_a_letras(fecha_emision.date())

        html_renderizado, advertencias = renderizar_plantilla(_cuerpo_completo(plantilla), datos, sexo)

        firmante = ConfiguracionFirmante.objects.first()
        salio_firmada = bool(
            plantilla.permite_estampado
            and firmante is not None
            and firmante.estampado_global_activo
            and firmante.firma_imagen
            and puede_firmar_como_director(request.user)
        )
        # Regla del contrato (Fase 4/agente 4B): nunca abortar la emisión
        # por falta de firma — una constancia sin firmar se firma a mano;
        # una emisión bloqueada deja al representante sin su documento. Si
        # `puede_firmar_como_director` da False, la constancia se emite
        # igual, solo con salio_firmada=False (no hay return/403 aquí).

        constancia = ConstanciaEmitida.objects.create(
            numero=numero,
            tipo=plantilla.tipo,
            plantilla=plantilla,
            alumno=alumno,
            trabajador=trabajador,
            pago=pago,
            html_renderizado=html_renderizado,
            datos_capturados=datos_capturados,
            salio_firmada=salio_firmada,
            emitida_por=request.user,
            periodo_escolar=periodo or '',
        )

        respuesta = {
            'id': constancia.id,
            'numero': constancia.numero,
            'tipo': constancia.tipo,
            'fecha_emision': constancia.fecha_emision,
            'salio_firmada': constancia.salio_firmada,
            'html_renderizado': constancia.html_renderizado,
            'pdf_url': f'/api/constancias/emitidas/{constancia.id}/pdf/',
        }
        if alumno is not None:
            respuesta['alumno'] = {'id': alumno.id, 'nombres': alumno.nombre, 'apellidos': alumno.apellido}
        else:
            respuesta['trabajador'] = {'id': trabajador.id, 'nombres': trabajador.nombre, 'apellidos': trabajador.apellido}

        return Response(respuesta, status=status.HTTP_201_CREATED)


# ---------------------------------------------------------------------------
# Emitidas (histórico) + PDF
# ---------------------------------------------------------------------------

class ConstanciaEmitidaListView(generics.ListAPIView):
    serializer_class = ConstanciaEmitidaListSerializer
    permission_classes = [permissions.IsAuthenticated, EsRolConstancias]
    pagination_class = StandardResultsPagination

    def get_queryset(self):
        qs = (
            ConstanciaEmitida.objects
            .select_related('alumno', 'trabajador', 'emitida_por')
            .order_by('-fecha_emision')
        )
        params = self.request.query_params

        tipo = params.get('tipo')
        if tipo:
            qs = qs.filter(tipo=tipo)

        alumno_id = params.get('alumno_id')
        if alumno_id:
            qs = qs.filter(alumno_id=alumno_id)

        trabajador_id = params.get('trabajador_id')
        if trabajador_id:
            qs = qs.filter(trabajador_id=trabajador_id)

        numero = params.get('numero')
        if numero:
            qs = filtrar_busqueda(qs, numero, ['numero'])

        desde = params.get('desde')
        if desde:
            qs = qs.filter(fecha_emision__date__gte=desde)

        hasta = params.get('hasta')
        if hasta:
            qs = qs.filter(fecha_emision__date__lte=hasta)

        return qs


class ConstanciaEmitidaDetailView(generics.RetrieveAPIView):
    queryset = ConstanciaEmitida.objects.select_related('alumno', 'trabajador', 'emitida_por')
    serializer_class = ConstanciaEmitidaDetailSerializer
    permission_classes = [permissions.IsAuthenticated, EsRolConstancias]


class PdfConstanciaView(APIView):
    permission_classes = [permissions.IsAuthenticated, EsRolConstancias]

    def get(self, request, pk):
        constancia = ConstanciaEmitida.objects.filter(pk=pk).first()
        if constancia is None:
            return Response({'detail': 'Constancia no encontrada.'}, status=status.HTTP_404_NOT_FOUND)

        # 3B (agente en paralelo) construye constancias/pdf.py. Mientras no
        # exista, esta vista sigue compilando y devuelve 503 en vez de
        # romper la suite de tests de este agente.
        try:
            from .pdf import generar_pdf_constancia
        except ImportError:
            return Response(
                {'detail': 'Generación de PDF no disponible todavía.'},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        pdf_bytes = generar_pdf_constancia(constancia)
        return HttpResponse(
            pdf_bytes,
            content_type='application/pdf',
            headers={'Content-Disposition': f'inline; filename="{constancia.numero}.pdf"'},
        )


# ---------------------------------------------------------------------------
# Firmante (singleton) + imágenes protegidas
# ---------------------------------------------------------------------------

def _servir_archivo_protegido(campo_archivo):
    """Mismo patrón que pagos_comunes/media_views.py::ComprobanteProtegidoView:
    FileResponse directo en DEBUG, X-Accel-Redirect a nginx en producción."""
    if not campo_archivo or not campo_archivo.storage.exists(campo_archivo.name):
        return Response(status=status.HTTP_404_NOT_FOUND)

    if settings.DEBUG:
        return FileResponse(campo_archivo.open('rb'))

    internal_path = f'/protected-media/{campo_archivo.name}'
    response = HttpResponse()
    response['Content-Type'] = ''
    response['X-Accel-Redirect'] = internal_path
    return response


class FirmanteView(APIView):
    def get_permissions(self):
        if self.request.method == 'GET':
            return [permissions.IsAuthenticated()]
        return [permissions.IsAuthenticated(), IsSystemAdminOrDirector()]

    def get(self, request):
        firmante = ConfiguracionFirmante.objects.first()
        if firmante is None:
            return Response({}, status=status.HTTP_200_OK)
        serializer = ConfiguracionFirmanteSerializer(firmante, context={'request': request})
        return Response(serializer.data)

    def put(self, request):
        firmante = ConfiguracionFirmante.objects.first()
        if firmante is not None:
            serializer = ConfiguracionFirmanteSerializer(firmante, data=request.data, partial=True)
        else:
            serializer = ConfiguracionFirmanteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        firmante = serializer.save(actualizado_por=request.user)
        return Response(ConfiguracionFirmanteSerializer(firmante, context={'request': request}).data)


class FirmanteFirmaProtegidaView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsSystemAdminOrDirector]

    def get(self, request):
        firmante = ConfiguracionFirmante.objects.first()
        if firmante is None or not firmante.firma_imagen:
            return Response(status=status.HTTP_404_NOT_FOUND)
        return _servir_archivo_protegido(firmante.firma_imagen)


class FirmanteSelloProtegidaView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsSystemAdminOrDirector]

    def get(self, request):
        firmante = ConfiguracionFirmante.objects.first()
        if firmante is None or not firmante.sello_imagen:
            return Response(status=status.HTTP_404_NOT_FOUND)
        return _servir_archivo_protegido(firmante.sello_imagen)


# ---------------------------------------------------------------------------
# Firma delegada — CRUD sobre la membresía del grupo Django
# `NOMBRE_GRUPO_FIRMA_DELEGADA` (ver constancias/permissions.py). Permite a
# usuarios que no son director (típicamente secretaria) emitir constancias
# con la firma del director ya estampada. Solo director/administrador/
# sistemas/superuser puede gestionar quién tiene este permiso — misma
# regla que configurar el firmante (ver FirmanteView arriba).
# ---------------------------------------------------------------------------

class FirmaDelegadaListView(APIView):
    """GET /api/constancias/firma-delegada/ — lista los usuarios que hoy
    pertenecen al grupo de firma delegada."""
    permission_classes = [permissions.IsAuthenticated, IsSystemAdminOrDirector]

    def get(self, request):
        grupo = Group.objects.filter(name=NOMBRE_GRUPO_FIRMA_DELEGADA).first()
        if grupo is None:
            return Response({'usuarios': []})
        usuarios = grupo.user_set.select_related('perfil').order_by('username')
        data = [
            {
                'id': u.id,
                'username': u.username,
                'nombre': u.nombre_completo,
                'rol': getattr(getattr(u, 'perfil', None), 'rol', None),
            }
            for u in usuarios
        ]
        return Response({'usuarios': data})


class FirmaDelegadaMiembroView(APIView):
    """POST/DELETE /api/constancias/firma-delegada/<user_id>/ — agrega o
    quita a un usuario del grupo de firma delegada. Ambas operaciones son
    idempotentes: agregar a quien ya está, o quitar a quien no está, no
    falla."""
    permission_classes = [permissions.IsAuthenticated, IsSystemAdminOrDirector]

    def _obtener_usuario(self, user_id):
        User = get_user_model()
        return User.objects.filter(
            pk=user_id, representante_portal__isnull=True,
        ).first()

    def post(self, request, user_id):
        user = self._obtener_usuario(user_id)
        if user is None:
            return Response(status=status.HTTP_404_NOT_FOUND)
        grupo, _ = Group.objects.get_or_create(name=NOMBRE_GRUPO_FIRMA_DELEGADA)
        user.groups.add(grupo)
        return Response(status=status.HTTP_200_OK)

    def delete(self, request, user_id):
        user = self._obtener_usuario(user_id)
        if user is None:
            return Response(status=status.HTTP_404_NOT_FOUND)
        grupo = Group.objects.filter(name=NOMBRE_GRUPO_FIRMA_DELEGADA).first()
        if grupo is not None:
            user.groups.remove(grupo)
        return Response(status=status.HTTP_204_NO_CONTENT)
