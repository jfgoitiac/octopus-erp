from rest_framework import serializers
from datetime import date
from django.db import transaction, IntegrityError
from django.core.exceptions import ValidationError as DjangoValidationError
from .services import generate_temporary_cedula_escolar
from usuarios.models import LogAuditoria
from .models import (
    Beca, BienNacional, ConfiguracionGrado, Inscripcion,
    Alumno, Representante, ConfiguracionSistema
)


class BecaSerializer(serializers.ModelSerializer):
    alumno_nombre = serializers.SerializerMethodField()
    tipo_display = serializers.CharField(source='get_tipo_display', read_only=True)
    estado_display = serializers.CharField(source='get_estado_display', read_only=True)
    vigente_hoy = serializers.ReadOnlyField()
    otorgada_por_nombre = serializers.SerializerMethodField()
    revocada_por_nombre = serializers.SerializerMethodField()

    class Meta:
        model = Beca
        fields = [
            'id', 'alumno', 'alumno_nombre', 'periodo_escolar', 'tipo', 'tipo_display',
            'porcentaje', 'fecha_desde', 'fecha_hasta', 'motivo', 'documento_adjunto',
            'estado', 'estado_display', 'vigente_hoy',
            'otorgada_por', 'otorgada_por_nombre', 'fecha_otorgamiento',
            'revocada_por', 'revocada_por_nombre', 'fecha_revocacion', 'motivo_revocacion',
        ]
        read_only_fields = [
            'estado', 'otorgada_por', 'fecha_otorgamiento',
            'revocada_por', 'fecha_revocacion', 'motivo_revocacion',
        ]

    def get_alumno_nombre(self, obj):
        return f"{obj.alumno.nombre} {obj.alumno.apellido}"

    def _nombre_usuario(self, user):
        if not user:
            return None
        return user.get_full_name() or user.username

    def get_otorgada_por_nombre(self, obj):
        return self._nombre_usuario(obj.otorgada_por)

    def get_revocada_por_nombre(self, obj):
        return self._nombre_usuario(obj.revocada_por)

    def validate_documento_adjunto(self, archivo):
        if not archivo:
            return archivo
        if archivo.size > 5 * 1024 * 1024:
            raise serializers.ValidationError("El documento no debe superar 5MB.")
        return archivo

    def validate(self, attrs):
        porcentaje = attrs.get('porcentaje', getattr(self.instance, 'porcentaje', None))
        if porcentaje is not None and not (1 <= porcentaje <= 100):
            raise serializers.ValidationError({'porcentaje': 'Debe estar entre 1 y 100.'})

        fecha_desde = attrs.get('fecha_desde', getattr(self.instance, 'fecha_desde', None))
        fecha_hasta = attrs.get('fecha_hasta', getattr(self.instance, 'fecha_hasta', None))
        if fecha_desde and fecha_hasta and fecha_desde > fecha_hasta:
            raise serializers.ValidationError(
                {'fecha_hasta': 'No puede ser anterior a fecha_desde.'}
            )

        alumno = attrs.get('alumno', getattr(self.instance, 'alumno', None))
        periodo_escolar = attrs.get('periodo_escolar', getattr(self.instance, 'periodo_escolar', None))
        if alumno and periodo_escolar:
            qs = Beca.objects.filter(alumno=alumno, periodo_escolar=periodo_escolar, estado='activa')
            if self.instance:
                qs = qs.exclude(pk=self.instance.pk)
            if qs.exists():
                raise serializers.ValidationError(
                    f"{alumno.nombre} {alumno.apellido} ya tiene una beca activa para el período {periodo_escolar}. "
                    "Revoque la existente antes de crear una nueva."
                )
        return attrs


class ConfiguracionSistemaSerializer(serializers.ModelSerializer):  # NUEVO
    inscripciones_abiertas = serializers.ReadOnlyField()
    ano_escolar_activo     = serializers.ReadOnlyField()

    class Meta:
        model  = ConfiguracionSistema
        fields = '__all__'

    def _validar_logo(self, imagen):
        if not imagen:
            return imagen
        if imagen.size > 2 * 1024 * 1024:
            raise serializers.ValidationError("La imagen no debe superar 2MB.")
        content_type = getattr(imagen, 'content_type', '')
        if content_type not in ('image/png', 'image/jpeg', 'image/webp'):
            raise serializers.ValidationError("Formato de imagen no soportado. Use PNG, JPG o WEBP.")
        return imagen

    def validate_logo_colegio(self, imagen):
        return self._validar_logo(imagen)

    def validate_logo_avec(self, imagen):
        return self._validar_logo(imagen)

    def _validar_favicon(self, imagen):
        if not imagen:
            return imagen
        if imagen.size > 512 * 1024:
            raise serializers.ValidationError("El favicon no debe superar 512KB.")
        content_type = getattr(imagen, 'content_type', '')
        if content_type not in ('image/png', 'image/x-icon', 'image/vnd.microsoft.icon', 'image/svg+xml', 'image/webp'):
            raise serializers.ValidationError("Formato de favicon no soportado. Use PNG, ICO, SVG o WEBP.")
        return imagen

    def validate_favicon(self, imagen):
        return self._validar_favicon(imagen)


class BienNacionalSerializer(serializers.ModelSerializer):
    nombre_responsable = serializers.ReadOnlyField(source='responsable_asignado.username')

    class Meta:
        model  = BienNacional
        fields = '__all__'


class ConfiguracionGradoSerializer(serializers.ModelSerializer):
    cupos_disponibles = serializers.ReadOnlyField()

    class Meta:
        model  = ConfiguracionGrado
        fields = '__all__'


class RepresentanteSerializer(serializers.ModelSerializer):
    class Meta:
        model  = Representante
        fields = '__all__'
        # DESACTIVACIÓN DE VALIDACIÓN DE UNICIDAD:
        # Esto permite que los datos del representante pasen la validación inicial (is_valid)
        # incluso si la cédula ya existe, permitiendo que el método create maneje la vinculación.
        extra_kwargs = {
            'cedula': {
                'validators': [], 
            }
        }


class RepresentanteUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model        = Representante
        fields       = ['nombre', 'apellido', 'cedula', 'telefono', 'correo', 'direccion']
        extra_kwargs = {'cedula': {'read_only': True}}


class RepresentanteCRUDSerializer(serializers.ModelSerializer):
    """Serializer para gestión CRUD directa de representantes (valida unicidad de cédula)."""
    cantidad_alumnos  = serializers.IntegerField(read_only=True)
    portal_creado     = serializers.SerializerMethodField()
    portal_activo     = serializers.SerializerMethodField()
    # No es campo del modelo Representante: se persiste en CuotaProyectoInversion
    # (app cobranza) del período escolar activo. Ver to_representation()/update()
    # más abajo. El valor se resuelve vía prefetch en RepresentanteViewSet.get_queryset
    # (to_attr='_cuota_proyecto_periodo_activo') para no escalar en O(n) en el listado.
    monto_proyecto_inversion = serializers.DecimalField(
        max_digits=10, decimal_places=2, required=False, allow_null=True
    )
    # Habilita el botón "Cargar Proyecto de Inversión" en el módulo de
    # Representantes (carga manual puntual, ver RepresentanteViewSet.cargar_proyecto_inversion):
    # solo tiene sentido ofrecerlo mientras el representante siga debiendo
    # inscripción, para no forzar cobros sobre cuentas ya al día.
    tiene_inscripcion_impaga = serializers.SerializerMethodField()

    class Meta:
        model  = Representante
        fields = [
            'id', 'cedula', 'nombre', 'apellido', 'telefono', 'correo', 'direccion',
            'nacionalidad', 'nivel_estudio',
            'cantidad_alumnos', 'portal_creado', 'portal_activo',
            'monto_proyecto_inversion', 'tiene_inscripcion_impaga',
        ]

    def get_portal_creado(self, obj):
        return hasattr(obj, 'portal_user')

    def get_tiene_inscripcion_impaga(self, obj):
        # Resuelto vía Exists() anotado en RepresentanteViewSet.get_queryset
        # (to_attr '_tiene_inscripcion_impaga') para no disparar una query
        # por fila en el listado — mismo criterio que cantidad_alumnos y
        # monto_proyecto_inversion en este mismo serializer. Fallback por si
        # se instancia el serializer sobre un queryset que no pasó por ahí.
        valor = getattr(obj, '_tiene_inscripcion_impaga', None)
        if valor is not None:
            return valor
        from cobranza.models import CuotaInscripcion
        return CuotaInscripcion.objects.filter(
            alumno__representante=obj, alumno__activo=True, pagado=False
        ).exists()

    def get_portal_activo(self, obj):
        if hasattr(obj, 'portal_user'):
            return obj.portal_user.esta_activo
        return False

    def _cuota_proyecto_activo(self, instance):
        cuotas = getattr(instance, '_cuota_proyecto_periodo_activo', None)
        if cuotas is not None:
            return cuotas[0] if cuotas else None
        from cobranza.models import CuotaProyectoInversion
        from .models import ConfiguracionSistema
        config = ConfiguracionSistema.objects.first()
        periodo = config.periodo_escolar_activo if config else None
        if not periodo:
            return None
        return CuotaProyectoInversion.objects.filter(representante=instance, periodo_escolar=periodo).first()

    def to_representation(self, instance):
        data = super().to_representation(instance)
        cuota = self._cuota_proyecto_activo(instance)
        data['monto_proyecto_inversion'] = str(cuota.monto_usd) if cuota else '0.00'
        return data

    def create(self, validated_data):
        validated_data.pop('monto_proyecto_inversion', None)
        return super().create(validated_data)

    def update(self, instance, validated_data):
        monto_proyecto_inversion = validated_data.pop('monto_proyecto_inversion', None)
        instance = super().update(instance, validated_data)
        if monto_proyecto_inversion is not None:
            from cobranza.models import CuotaProyectoInversion
            from cobranza.services import tipo_cargo_proyecto_inversion
            from .models import ConfiguracionSistema
            config = ConfiguracionSistema.objects.first()
            periodo = config.periodo_escolar_activo if config else None
            if not periodo:
                raise serializers.ValidationError({
                    "monto_proyecto_inversion": ["No hay un período escolar activo configurado."]
                })
            cuota, _ = CuotaProyectoInversion.objects.update_or_create(
                representante=instance, periodo_escolar=periodo,
                tipo_concepto=tipo_cargo_proyecto_inversion(), numero_cuota=1,
                defaults={'monto_usd': monto_proyecto_inversion}
            )
            instance._cuota_proyecto_periodo_activo = [cuota]
        return instance

    def validate_cedula(self, value):
        qs = Representante.objects.filter(cedula=value)
        instance = self.instance
        if instance:
            qs = qs.exclude(pk=instance.pk)
        if qs.exists():
            raise serializers.ValidationError("Ya existe un representante con esta cédula.")
        return value

    def validate_correo(self, value):
        if value and '@' not in value:
            raise serializers.ValidationError("Ingrese un correo electrónico válido.")
        return value


class NormalizaFechaNacimientoMixin:
    """
    Trata '' como ausencia de valor en fecha_nacimiento. El campo es opcional
    a nivel de modelo (null=True, blank=True), pero DateField no soporta
    allow_blank: un string vacío no pasa por la rama allow_null y DRF intenta
    parsearlo como fecha, fallando con "Fecha con formato erróneo" en vez de
    tratarlo como ausente. Cualquier cliente que envíe '' (en lugar de omitir
    el campo o mandar null) queda cubierto sin depender de que cada
    formulario del frontend recuerde sanearlo antes de enviar.
    """
    def to_internal_value(self, data):
        if isinstance(data, dict) and data.get('fecha_nacimiento') == '':
            data = data.copy()
            data['fecha_nacimiento'] = None
        return super().to_internal_value(data)


class AlumnoSerializer(NormalizaFechaNacimientoMixin, serializers.ModelSerializer):
    representante = RepresentanteSerializer()
    estado_inscripcion     = serializers.ReadOnlyField()  # NUEVO
    activo                 = serializers.BooleanField(read_only=True)
    fecha_retiro           = serializers.DateTimeField(read_only=True)
    motivo_retiro          = serializers.CharField(read_only=True)
    monto_solvencia        = serializers.SerializerMethodField()
    concepto_solvencia     = serializers.SerializerMethodField()
    solvencia_pagada       = serializers.SerializerMethodField()
    solvencia_definida     = serializers.SerializerMethodField()
    monto_proyecto_inversion = serializers.SerializerMethodField()

    class Meta:
        model  = Alumno
        fields = '__all__'

    def _periodo_activo(self):
        """Cachea ConfiguracionSistema.objects.first() en la instancia del serializer
        (reusada para todas las filas cuando many=True) — evita repetir la misma
        query por cada uno de los 4 métodos y por cada alumno de la página."""
        if not hasattr(self, '_config_activo_cache'):
            self._config_activo_cache = ConfiguracionSistema.objects.first()
        config = self._config_activo_cache
        return config.periodo_escolar_activo if config else None

    def _cuota_solvencia(self, instance):
        """Usa el prefetch de AlumnoListView.get_queryset (to_attr=
        '_cuota_solvencia_periodo_activo') si está presente, evitando 1 query
        extra por alumno; si no está prefetched (ej. instancia suelta fuera de
        listado), cae al query individual de siempre."""
        cuotas = getattr(instance, '_cuota_solvencia_periodo_activo', None)
        if cuotas is not None:
            return cuotas[0] if cuotas else None
        from cobranza.models import CuotaSolvencia
        periodo = self._periodo_activo()
        return CuotaSolvencia.objects.filter(alumno=instance, periodo_escolar=periodo).first() if periodo else None

    def get_monto_solvencia(self, instance):
        cuota = self._cuota_solvencia(instance)
        return str(cuota.monto_usd) if cuota else '0.00'

    def get_solvencia_definida(self, instance):
        """Indica si ya existe una CuotaSolvencia guardada para el período activo,
        para distinguir "monto 0 guardado explícitamente" de "sin definir todavía"
        (ambos casos devuelven '0.00' en get_monto_solvencia)."""
        return self._cuota_solvencia(instance) is not None

    def get_concepto_solvencia(self, instance):
        cuota = self._cuota_solvencia(instance)
        return cuota.concepto if cuota else ''

    def get_solvencia_pagada(self, instance):
        cuota = self._cuota_solvencia(instance)
        return cuota.pagado if cuota else True

    def get_monto_proyecto_inversion(self, instance):
        if not instance.representante:
            return '0.00'
        cuotas = getattr(instance.representante, '_cuota_proyecto_periodo_activo', None)
        if cuotas is not None:
            cuota = cuotas[0] if cuotas else None
        else:
            from cobranza.models import CuotaProyectoInversion
            periodo = self._periodo_activo()
            cuota = (
                CuotaProyectoInversion.objects.filter(
                    representante=instance.representante, periodo_escolar=periodo
                ).first()
                if periodo else None
            )
        return str(cuota.monto_usd) if cuota else '0.00'

    def to_representation(self, instance):
        """
        Muestra el estatus financiero EN VIVO cuando el queryset viene anotado
        con `en_mora` (cobranza.mora.annotate_en_mora), evitando divergencias con
        el módulo de morosos entre corridas de la tarea Celery. Si no hay
        anotación, se conserva el campo persistido. Los becados no se alteran.
        """
        data = super().to_representation(instance)
        en_mora = getattr(instance, 'en_mora', None)
        if en_mora is not None and instance.estatus_financiero != 'becado':
            data['estatus_financiero'] = 'mora' if en_mora else 'solvente'

        inscrito_periodo_activo = getattr(instance, 'inscrito_periodo_activo', None)
        if instance.activo and inscrito_periodo_activo is not None:
            data['estado_inscripcion'] = 'inscrito' if inscrito_periodo_activo else 'sin_inscribir'
        return data

    @transaction.atomic
    def create(self, validated_data):
        representante_data = validated_data.pop('representante')
        request = self.context.get('request')

        # 1. Resolver Representante (Vincular si existe, Crear si no)
        cedula_rep = representante_data.get('cedula')
        # Usamos get_or_create para que, si existe, simplemente use el objeto encontrado.
        # Si se prefiere actualizar los datos del representante existente con lo que viene
        # en el formulario, se podría usar update_or_create.
        representante, _ = Representante.objects.get_or_create(
            cedula=cedula_rep,
            defaults=representante_data
        )
        if not representante.activo:
            representante.activo = True
            representante.fecha_eliminacion = None
            representante.save(update_fields=['activo', 'fecha_eliminacion'])

        # 2. Generar cédula escolar temporal si viene vacía o nula
        if not validated_data.get('cedula_escolar'):
            validated_data['cedula_escolar'] = generate_temporary_cedula_escolar(
                request.user if request else None
            )

        # 3. Día límite de pago desde Configuración (salvo que venga explícito)
        from .services import dia_limite_pago_global
        validated_data.setdefault('dia_limite_pago', dia_limite_pago_global())

        # 4. Crear el alumno vinculado al representante
        alumno = Alumno.objects.create(
            representante=representante,
            **validated_data
        )
        return alumno


class AlumnoUpdateSerializer(NormalizaFechaNacimientoMixin, serializers.ModelSerializer):
    representante = RepresentanteSerializer(required=False)
    # No son campos del modelo Alumno: se persisten en CuotaSolvencia (app cobranza)
    # del período escolar activo. Ver update() más abajo.
    monto_solvencia = serializers.DecimalField(max_digits=10, decimal_places=2, required=False, allow_null=True)
    concepto_solvencia = serializers.CharField(max_length=255, required=False, allow_blank=True)

    class Meta:
        model  = Alumno
        fields = [
            'nombre', 'apellido', 'cedula_escolar', 'grado_seccion',
            'fecha_nacimiento', 'genero', 'estatus_financiero',
            'porcentaje_beca', 'representante', 'direccion', 'foto', 'parentesco',
            'monto_solvencia', 'concepto_solvencia',
            'lugar_nacimiento', 'pais_nacimiento', 'estado_nacimiento',
            'peso', 'estatura', 'institucion_procedencia',
            'bautizado', 'alergico',
        ]
        extra_kwargs = {
            'cedula_escolar':    {'allow_null': True, 'allow_blank': True, 'required': False},
            'grado_seccion':     {'allow_null': True, 'allow_blank': True, 'required': False},
            'fecha_nacimiento':  {'allow_null': True, 'required': False},
        }

    def update(self, instance, validated_data):
        representante_data = validated_data.pop('representante', None)
        monto_solvencia = validated_data.pop('monto_solvencia', None)
        concepto_solvencia = validated_data.pop('concepto_solvencia', None)

        if monto_solvencia is not None or concepto_solvencia is not None:
            from cobranza.models import CuotaSolvencia
            from .models import ConfiguracionSistema
            config = ConfiguracionSistema.objects.first()
            periodo = config.periodo_escolar_activo if config else None
            if not periodo:
                raise serializers.ValidationError({
                    "monto_solvencia": ["No hay un período escolar activo configurado."]
                })
            defaults = {}
            if monto_solvencia is not None:
                defaults['monto_usd'] = monto_solvencia
            if concepto_solvencia is not None:
                defaults['concepto'] = concepto_solvencia
            CuotaSolvencia.objects.update_or_create(
                alumno=instance, periodo_escolar=periodo,
                defaults=defaults
            )

        if representante_data:
            nueva_cedula = representante_data.get('cedula')
            if instance.representante and nueva_cedula and nueva_cedula != instance.representante.cedula:
                # La cédula cambió: es un representante distinto (mal asignado originalmente),
                # no una corrección de datos del representante actual. Se reasigna el alumno
                # al representante correcto (existente, actualizando sus datos con lo que venga
                # en el formulario) o se crea uno nuevo si la cédula no pertenece a nadie todavía.
                representante_existente = Representante.objects.filter(
                    cedula=nueva_cedula
                ).exclude(pk=instance.representante.pk).first()
                if representante_existente:
                    datos_a_actualizar = {k: v for k, v in representante_data.items() if k != 'cedula'}
                    for attr, value in datos_a_actualizar.items():
                        setattr(representante_existente, attr, value)
                    if not representante_existente.activo:
                        representante_existente.activo = True
                        representante_existente.fecha_eliminacion = None
                    representante_existente.save()
                    instance.representante = representante_existente
                else:
                    instance.representante = Representante.objects.create(**representante_data)
            elif instance.representante:
                representante_data.pop('cedula', None)
                for attr, value in representante_data.items():
                    setattr(instance.representante, attr, value)
                instance.representante.save()
            else:
                cedula = representante_data.get('cedula')
                if not cedula:
                    raise serializers.ValidationError({
                        "representante": {"cedula": ["La cédula es requerida."]}
                    })
                representante, _ = Representante.objects.get_or_create(
                    cedula=cedula, defaults=representante_data
                )
                if not representante.activo:
                    representante.activo = True
                    representante.fecha_eliminacion = None
                    representante.save(update_fields=['activo', 'fecha_eliminacion'])
                instance.representante = representante

        if 'cedula_escolar' in validated_data and validated_data['cedula_escolar'] == '':
            validated_data['cedula_escolar'] = None

        return super().update(instance, validated_data)


class AlumnoRetirarSerializer(serializers.Serializer):  # NUEVO
    motivo = serializers.CharField(required=False, allow_blank=True, default='')


class AsignarGradoSerializer(serializers.Serializer):  # NUEVO
    grado_seccion = serializers.CharField(max_length=50)


class AlumnoInscripcionSerializer(NormalizaFechaNacimientoMixin, serializers.ModelSerializer):
    representante = RepresentanteSerializer()

    class Meta:
        model  = Alumno
        fields = [
            'nombre', 'apellido', 'cedula_escolar', 'fecha_nacimiento',
            'genero', 'representante', 'direccion', 'foto', 'parentesco',
            'lugar_nacimiento', 'pais_nacimiento', 'estado_nacimiento',
            'peso', 'estatura', 'institucion_procedencia',
            'bautizado', 'alergico',
        ]
        # Sin validador de unicidad en cedula_escolar (mismo patrón que la cédula
        # del representante): al reinscribir un alumno existente el frontend envía
        # su cédula real y create() lo resuelve con update_or_create. Con el
        # validador activo, la reinscripción fallaba con "ya existe" antes de
        # llegar a las validaciones de cuota de inscripción y período.
        extra_kwargs = {
            'cedula_escolar': {
                'allow_null': True, 'allow_blank': True, 'required': False,
                'validators': [],
            }
        }


class InscripcionSerializer(serializers.ModelSerializer):
    alumno = AlumnoInscripcionSerializer()
    datos_administrativos = serializers.SerializerMethodField()

    class Meta:
        model = Inscripcion
        fields = '__all__'
        read_only_fields = ['fecha_inscripcion', 'usuario_registro']

    def get_datos_administrativos(self, instance):
        if not instance.pk:
            return None
        from cobranza.services import calcular_datos_administrativos_inscripcion
        return calcular_datos_administrativos_inscripcion(instance)

    def validate(self, attrs):
        """
        Validación preventiva de período de inscripciones y aforo antes de
        iniciar el proceso de guardado. Impide escrituras innecesarias en el
        banco de alumnos si el período está cerrado o no hay cupo.
        """
        config = ConfiguracionSistema.objects.first()
        if config and not config.inscripciones_abiertas:
            raise serializers.ValidationError({
                "non_field_errors": [
                    "El período de inscripciones está cerrado "
                    f"(vigente del {config.fecha_inicio_inscripciones.strftime('%d/%m/%Y')} "
                    f"al {config.fecha_fin_inscripciones.strftime('%d/%m/%Y')})."
                ]
            })

        grado_seccion = attrs.get('grado_seccion')
        try:
            config = ConfiguracionGrado.objects.get(grado_seccion=grado_seccion)
            if config.cupos_disponibles <= 0:
                raise serializers.ValidationError({
                    "grado_seccion": f"No hay cupos disponibles para {grado_seccion}. Capacidad máxima de {config.cupos_maximos} alcanzada."
                })
        except ConfiguracionGrado.DoesNotExist:
            raise serializers.ValidationError({
                "grado_seccion": f"El grado {grado_seccion} no ha sido configurado en el sistema."
            })
        return attrs

    def create(self, validated_data):
        """
        Orquestación de la inscripción:
        1. Resolver/Actualizar Representante.
        2. Resolver/Actualizar Alumno en el 'Banco de Alumnos' (Sin grado aún).
        3. Crear Inscripción (Donde se asigna el grado y se valida cupo).
        """
        with transaction.atomic():
            try:
                alumno_data = validated_data.pop('alumno')
                representante_data = alumno_data.pop('representante')
                request_user = self.context['request'].user

                # 1. Paso al Banco de Representantes
                cedula_rep = representante_data.get('cedula')
                if not cedula_rep:
                    raise serializers.ValidationError({"alumno": {"representante": {"cedula": ["Requerida"]}}})

                # update_or_create (no get_or_create): si el representante ya existe,
                # el formulario de inscripción puede traer datos recién completados
                # (ver ModalCompletarRepresentante) y deben persistirse igual que con
                # el alumno más abajo.
                representante, _ = Representante.objects.update_or_create(
                    cedula=cedula_rep,
                    defaults=representante_data
                )
                if not representante.activo:
                    representante.activo = True
                    representante.fecha_eliminacion = None
                    representante.save(update_fields=['activo', 'fecha_eliminacion'])

                # 2. Paso al Banco de Alumnos (Biografía)
                cedula_escolar = alumno_data.get('cedula_escolar')
                if not cedula_escolar:
                    alumno_data['cedula_escolar'] = generate_temporary_cedula_escolar(request_user)
                
                alumno, alumno_creado = Alumno.objects.update_or_create(
                    cedula_escolar=alumno_data['cedula_escolar'],
                    defaults={**alumno_data, 'representante': representante}
                )
                # Alumno nuevo: día límite de pago desde Configuración
                if alumno_creado:
                    from .services import dia_limite_pago_global
                    alumno.dia_limite_pago = dia_limite_pago_global()
                    alumno.save(update_fields=['dia_limite_pago'])

                # 2b. Validar que no exista inscripción previa para el mismo período
                periodo = validated_data.get('periodo_escolar')
                if Inscripcion.objects.filter(alumno=alumno, periodo_escolar=periodo).exists():
                    raise serializers.ValidationError({
                        "non_field_errors": [
                            f"{alumno.nombre} {alumno.apellido} ya está inscrito/a para el período {periodo}."
                        ]
                    })

                # 2c. Validar que no tenga cuotas de inscripción impagas
                from django.db.models import Q
                from cobranza.models import CuotaInscripcion, CuotaProyectoInversion, CuotaSolvencia, Mensualidad, ParametroGlobal
                cuota_impaga = CuotaInscripcion.objects.filter(alumno=alumno, pagado=False).first()
                if cuota_impaga:
                    raise serializers.ValidationError({
                        "non_field_errors": [
                            f"{alumno.nombre} {alumno.apellido} tiene una cuota de inscripción pendiente "
                            f"del período {cuota_impaga.periodo_escolar} (${cuota_impaga.monto_usd}). "
                            "Debe realizar los pagos pendientes antes de continuar."
                        ]
                    })

                # 2c-bis. Validar que el REPRESENTANTE no tenga cargos especiales
                # bloqueantes impagos (tipo_concepto__bloquea_inscripcion=True;
                # antes solo existía "Proyecto de Inversión", ahora puede haber
                # varios TipoCargoEspecial). A diferencia de las cuotas anteriores
                # (por alumno), esto es por representante: si está impago, bloquea
                # a TODOS sus hijos, no solo al que se está inscribiendo.
                cargo_impago = CuotaProyectoInversion.objects.filter(
                    representante=representante, pagado=False,
                    tipo_concepto__bloquea_inscripcion=True,
                ).select_related('tipo_concepto').first()
                if cargo_impago:
                    raise serializers.ValidationError({
                        "non_field_errors": [
                            f"El representante {representante.nombre} {representante.apellido} tiene el "
                            f"cargo '{cargo_impago.tipo_concepto.nombre}' pendiente del período "
                            f"{cargo_impago.periodo_escolar} (${cargo_impago.monto_usd}). Debe realizar el "
                            "pago antes de inscribir a cualquiera de sus representados."
                        ]
                    })

                # 2d. Validar que no tenga solvencia impaga (solo bloquea si el
                # monto asignado es mayor a 0; el default de $0 no es exigible).
                solvencia_impaga = CuotaSolvencia.objects.filter(
                    alumno=alumno, pagado=False, monto_usd__gt=0
                ).first()
                if solvencia_impaga:
                    raise serializers.ValidationError({
                        "non_field_errors": [
                            f"{alumno.nombre} {alumno.apellido} tiene una solvencia pendiente "
                            f"del período {solvencia_impaga.periodo_escolar} (${solvencia_impaga.monto_usd}). "
                            "Debe realizar los pagos pendientes antes de continuar."
                        ]
                    })

                # 2e. Validar que no tenga mensualidades vencidas impagas. Mismo
                # criterio canónico que cobranza/mora.py: meses anteriores sin
                # pagar, o el mes actual sin pagar si ya se alcanzó el día
                # límite de pago del alumno. Los becados quedan exentos.
                if alumno.estatus_financiero != 'becado':
                    hoy = date.today()
                    mensualidad_vencida = Mensualidad.objects.filter(
                        alumno=alumno, pagado=False
                    ).filter(
                        Q(anio__lt=hoy.year) |
                        Q(anio=hoy.year, mes__lt=hoy.month) |
                        Q(anio=hoy.year, mes=hoy.month, alumno__dia_limite_pago__lte=hoy.day)
                    ).order_by('anio', 'mes').first()
                    if mensualidad_vencida:
                        raise serializers.ValidationError({
                            "non_field_errors": [
                                f"{alumno.nombre} {alumno.apellido} tiene mensualidades pendientes "
                                f"desde {mensualidad_vencida.get_mes_display()} {mensualidad_vencida.anio} "
                                f"(${mensualidad_vencida.monto_usd}). "
                                "Debe realizar los pagos pendientes antes de continuar."
                            ]
                        })

                # 2f. Lock real de cupos: mismo patrón que Alumno.reactivar()
                # (models.py). La validación de validate() es solo UX preventiva
                # (lectura sin lock, puede quedar desactualizada); esta lectura
                # bajo select_for_update(), dentro de la misma transacción, es
                # la que realmente impide sobrevender el cupo bajo concurrencia.
                grado_seccion = validated_data.get('grado_seccion')
                config_grado = ConfiguracionGrado.objects.select_for_update().filter(
                    grado_seccion=grado_seccion
                ).first()
                if not config_grado:
                    raise serializers.ValidationError({
                        "grado_seccion": f"El grado {grado_seccion} no ha sido configurado en el sistema."
                    })
                if config_grado.cupos_disponibles <= 0:
                    raise serializers.ValidationError({
                        "grado_seccion": f"No hay cupos disponibles para {grado_seccion}. Capacidad máxima de {config_grado.cupos_maximos} alcanzada."
                    })

                # 3. Módulo de Inscripción (Asignación de Grado y Estatus)
                # Al estar dentro de with transaction.atomic(), cualquier error aquí revierte al alumno y representante.
                inscripcion = Inscripcion.objects.create(
                    usuario_registro=request_user,
                    alumno=alumno,
                    **validated_data
                )

                # 4. Cargar cuota de inscripción automáticamente
                from decimal import Decimal
                param = ParametroGlobal.objects.filter(clave="MONTO_INSCRIPCION_DEFECTO").first()
                monto_insc = Decimal(param.valor) if param and param.valor else Decimal('50.00')
                CuotaInscripcion.objects.get_or_create(
                    alumno=alumno,
                    periodo_escolar=inscripcion.periodo_escolar,
                    defaults={'monto_usd': monto_insc}
                )

                # 4b. Red de seguridad: si el representante es nuevo y no pasó por la
                # generación bulk (apertura de inscripciones / carga manual), se crea
                # aquí su Proyecto de Inversión del período con el monto por defecto.
                from cobranza.services import monto_proyecto_inversion_defecto, tipo_cargo_proyecto_inversion
                CuotaProyectoInversion.objects.get_or_create(
                    representante=representante,
                    periodo_escolar=inscripcion.periodo_escolar,
                    tipo_concepto=tipo_cargo_proyecto_inversion(), numero_cuota=1,
                    defaults={'monto_usd': monto_proyecto_inversion_defecto()}
                )

                return inscripcion

            except DjangoValidationError as e:
                # Captura validaciones de integridad/cupos desde el modelo y fuerza rollback
                raise serializers.ValidationError(e.message_dict)
            except IntegrityError as e:
                # La UniqueConstraint (alumno, periodo_escolar) es la última línea
                # de defensa real contra la condición de carrera de doble inscripción
                # (la validación de "2b" arriba es solo UX preventiva, no atómica).
                if 'unica_inscripcion_por_periodo' in str(e):
                    raise serializers.ValidationError({
                        "non_field_errors": [
                            f"{alumno.nombre} {alumno.apellido} ya está inscrito/a para el período {periodo}."
                        ]
                    })
                # Maneja colisiones de base de datos inesperadas
                raise serializers.ValidationError({
                    "error": "No se pudo completar la inscripción por un conflicto de datos. Por favor, verifique e intente de nuevo."
                })


class InscripcionListSerializer(serializers.ModelSerializer):
    """Solo lectura, liviano: para la consulta/reimpresión de comprobantes.
    A diferencia de InscripcionSerializer (escritura, anidado) no dispara
    validaciones ni carga datos administrativos de cobranza.
    """
    alumno_nombre = serializers.CharField(source='alumno.nombre', read_only=True)
    alumno_apellido = serializers.CharField(source='alumno.apellido', read_only=True)
    cedula_escolar = serializers.CharField(source='alumno.cedula_escolar', read_only=True)
    representante_nombre = serializers.SerializerMethodField()

    class Meta:
        model = Inscripcion
        fields = [
            'id', 'alumno_nombre', 'alumno_apellido', 'cedula_escolar',
            'representante_nombre', 'periodo_escolar', 'grado_seccion',
            'tipo_ingreso', 'fecha_inscripcion',
        ]

    def get_representante_nombre(self, instance):
        rep = instance.alumno.representante
        return f"{rep.nombre} {rep.apellido}".strip() if rep else ''


class LogAuditoriaSerializer(serializers.ModelSerializer):
    usuario = serializers.SerializerMethodField()
    fecha_hora = serializers.SerializerMethodField()
    modulo = serializers.SerializerMethodField()

    class Meta:
        model = LogAuditoria
        fields = ['id', 'fecha_hora', 'usuario', 'accion', 'modulo', 'detalles']

    def get_usuario(self, obj):
        if not obj.usuario:
            return None
        return {"username": obj.usuario.username, "nombre": obj.usuario.nombre_completo}

    def get_fecha_hora(self, obj):
        # Soporta dinámicamente campos 'fecha_hora' o 'fecha' con formato ISO
        fecha_valor = getattr(obj, 'fecha_hora', getattr(obj, 'fecha', None))
        if fecha_valor and hasattr(fecha_valor, 'isoformat'):
            return fecha_valor.isoformat()
        return str(fecha_valor) if fecha_valor else None

    def get_modulo(self, obj):
        return obj.modulo.upper() if obj.modulo else None