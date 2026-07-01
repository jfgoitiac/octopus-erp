from rest_framework import serializers
from datetime import date
from django.db import transaction, IntegrityError
from django.core.exceptions import ValidationError as DjangoValidationError
from .services import generate_temporary_cedula_escolar
from usuarios.models import LogAuditoria
from .models import (
    BienNacional, ConfiguracionGrado, Inscripcion,
    Alumno, Representante, ConfiguracionSistema
)


class ConfiguracionSistemaSerializer(serializers.ModelSerializer):  # NUEVO
    inscripciones_abiertas = serializers.ReadOnlyField()
    ano_escolar_activo     = serializers.ReadOnlyField()

    class Meta:
        model  = ConfiguracionSistema
        fields = '__all__'


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

    class Meta:
        model  = Representante
        fields = [
            'id', 'cedula', 'nombre', 'apellido', 'telefono', 'correo', 'direccion',
            'cantidad_alumnos', 'portal_creado', 'portal_activo',
        ]

    def get_portal_creado(self, obj):
        return hasattr(obj, 'portal_user')

    def get_portal_activo(self, obj):
        if hasattr(obj, 'portal_user'):
            return obj.portal_user.esta_activo
        return False

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


class AlumnoSerializer(serializers.ModelSerializer):
    representante = RepresentanteSerializer()
    estado_inscripcion     = serializers.ReadOnlyField()  # NUEVO
    activo                 = serializers.BooleanField(read_only=True)
    fecha_retiro           = serializers.DateTimeField(read_only=True)
    motivo_retiro          = serializers.CharField(read_only=True)

    class Meta:
        model  = Alumno
        fields = '__all__'

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

        # 2. Generar cédula escolar temporal si viene vacía o nula
        if not validated_data.get('cedula_escolar'):
            validated_data['cedula_escolar'] = generate_temporary_cedula_escolar(
                request.user if request else None
            )

        # 3. Crear el alumno vinculado al representante
        alumno = Alumno.objects.create(
            representante=representante,
            **validated_data
        )
        return alumno


class AlumnoUpdateSerializer(serializers.ModelSerializer):
    representante = RepresentanteSerializer(required=False)

    class Meta:
        model  = Alumno
        fields = [
            'nombre', 'apellido', 'cedula_escolar', 'grado_seccion',
            'fecha_nacimiento', 'genero', 'estatus_financiero',
            'porcentaje_beca', 'representante', 'direccion',
            'contacto_emergencia_nombre', 'contacto_emergencia_telefono',
            'contacto_emergencia_parentesco'
        ]
        extra_kwargs = {
            'cedula_escolar':    {'allow_null': True, 'allow_blank': True, 'required': False},
            'grado_seccion':     {'allow_null': True, 'allow_blank': True, 'required': False},
            'fecha_nacimiento':  {'allow_null': True, 'required': False},
        }

    def update(self, instance, validated_data):
        representante_data = validated_data.pop('representante', None)

        if representante_data:
            if instance.representante:
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
                instance.representante = representante

        if 'cedula_escolar' in validated_data and validated_data['cedula_escolar'] == '':
            validated_data['cedula_escolar'] = None

        return super().update(instance, validated_data)


class AlumnoRetirarSerializer(serializers.Serializer):  # NUEVO
    motivo = serializers.CharField(required=False, allow_blank=True, default='')


class AsignarGradoSerializer(serializers.Serializer):  # NUEVO
    grado_seccion = serializers.CharField(max_length=50)


class AlumnoInscripcionSerializer(serializers.ModelSerializer):
    representante = RepresentanteSerializer()

    class Meta:
        model  = Alumno
        fields = [
            'nombre', 'apellido', 'cedula_escolar', 'fecha_nacimiento',
            'genero', 'representante'
        ]
        extra_kwargs = {
            'cedula_escolar': {'allow_null': True, 'allow_blank': True, 'required': False}
        }


class InscripcionSerializer(serializers.ModelSerializer):
    alumno = AlumnoInscripcionSerializer()

    class Meta:
        model = Inscripcion
        fields = '__all__'
        read_only_fields = ['fecha_inscripcion', 'usuario_registro']

    def validate(self, attrs):
        """
        Validación preventiva de aforo antes de iniciar el proceso de guardado.
        Impide escrituras innecesarias en el banco de alumnos si no hay cupo.
        """
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

                representante, _ = Representante.objects.get_or_create(
                    cedula=cedula_rep,
                    defaults=representante_data
                )

                # 2. Paso al Banco de Alumnos (Biografía)
                cedula_escolar = alumno_data.get('cedula_escolar')
                if not cedula_escolar:
                    alumno_data['cedula_escolar'] = generate_temporary_cedula_escolar(request_user)
                
                alumno, _ = Alumno.objects.update_or_create(
                    cedula_escolar=alumno_data['cedula_escolar'],
                    defaults={**alumno_data, 'representante': representante}
                )

                # 2b. Validar que no exista inscripción previa para el mismo período
                periodo = validated_data.get('periodo_escolar')
                if Inscripcion.objects.filter(alumno=alumno, periodo_escolar=periodo).exists():
                    raise serializers.ValidationError({
                        "non_field_errors": [
                            f"{alumno.nombre} {alumno.apellido} ya está inscrito/a para el período {periodo}."
                        ]
                    })

                # 2c. Validar que no tenga cuotas de inscripción impagas
                from cobranza.models import CuotaInscripcion, ParametroGlobal
                cuota_impaga = CuotaInscripcion.objects.filter(alumno=alumno, pagado=False).first()
                if cuota_impaga:
                    raise serializers.ValidationError({
                        "non_field_errors": [
                            f"{alumno.nombre} {alumno.apellido} tiene una cuota de inscripción pendiente "
                            f"del período {cuota_impaga.periodo_escolar} (${cuota_impaga.monto_usd}). "
                            "Debe cancelarla antes de realizar una nueva inscripción."
                        ]
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

                return inscripcion

            except DjangoValidationError as e:
                # Captura validaciones de integridad/cupos desde el modelo y fuerza rollback
                raise serializers.ValidationError(e.message_dict)
            except IntegrityError:
                # Maneja colisiones de base de datos inesperadas
                raise serializers.ValidationError({
                    "error": "No se pudo completar la inscripción por un conflicto de datos. Por favor, verifique e intente de nuevo."
                })


class LogAuditoriaSerializer(serializers.ModelSerializer):
    usuario = serializers.SerializerMethodField()
    fecha_hora = serializers.SerializerMethodField()
    modulo = serializers.SerializerMethodField()

    class Meta:
        model = LogAuditoria
        fields = ['id', 'fecha_hora', 'usuario', 'accion', 'modulo', 'detalles']

    def get_usuario(self, obj):
        return {"username": obj.usuario.username} if obj.usuario else None

    def get_fecha_hora(self, obj):
        # Soporta dinámicamente campos 'fecha_hora' o 'fecha' con formato ISO
        fecha_valor = getattr(obj, 'fecha_hora', getattr(obj, 'fecha', None))
        if fecha_valor and hasattr(fecha_valor, 'isoformat'):
            return fecha_valor.isoformat()
        return str(fecha_valor) if fecha_valor else None

    def get_modulo(self, obj):
        return obj.modulo.upper() if obj.modulo else None