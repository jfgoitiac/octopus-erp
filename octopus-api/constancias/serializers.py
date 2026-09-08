from rest_framework import serializers

from .models import ConfiguracionFirmante, ConstanciaEmitida, PlantillaConstancia


class PlantillaConstanciaSerializer(serializers.ModelSerializer):
    creada_por = serializers.SerializerMethodField()
    tipo_display = serializers.CharField(source='get_tipo_display', read_only=True)
    destinatario_display = serializers.CharField(source='get_destinatario_display', read_only=True)

    class Meta:
        model = PlantillaConstancia
        fields = [
            'id', 'tipo', 'tipo_display', 'nombre', 'destinatario', 'destinatario_display',
            'cuerpo_html', 'anexo_html', 'anexo_habilitado', 'permite_estampado', 'activa',
            'creada_en', 'actualizada_en', 'creada_por',
        ]
        read_only_fields = ['creada_en', 'actualizada_en', 'creada_por']

    def get_creada_por(self, obj):
        """Mismo patrón que cobranza/serializers.py para resolver el nombre
        completo de un usuario: first_name + last_name, o el username si
        ambos están vacíos."""
        user = obj.creada_por
        if user is None:
            return None
        nombre = f"{user.first_name} {user.last_name}".strip() or user.username
        return {'id': user.id, 'nombre': nombre}

    def create(self, validated_data):
        request = self.context.get('request')
        if request is not None and request.user and request.user.is_authenticated:
            validated_data['creada_por'] = request.user
        return super().create(validated_data)


class ConfiguracionFirmanteSerializer(serializers.ModelSerializer):
    """`firma_imagen`/`sello_imagen` son write_only: nunca se exponen como
    URL directa a /media/ (dato institucional sensible). Para lectura se
    exponen `firma_imagen_url`/`sello_imagen_url`, que apuntan a las vistas
    protegidas `FirmanteFirmaProtegidaView`/`FirmanteSelloProtegidaView`."""
    firma_imagen_url = serializers.SerializerMethodField()
    sello_imagen_url = serializers.SerializerMethodField()

    class Meta:
        model = ConfiguracionFirmante
        fields = [
            'id', 'nombre', 'cedula', 'nacionalidad', 'cargo',
            'firma_imagen', 'sello_imagen', 'firma_imagen_url', 'sello_imagen_url',
            'estampado_global_activo', 'actualizado_en',
        ]
        read_only_fields = ['actualizado_en']
        extra_kwargs = {
            'firma_imagen': {'write_only': True, 'required': False, 'allow_null': True},
            'sello_imagen': {'write_only': True, 'required': False, 'allow_null': True},
        }

    def get_firma_imagen_url(self, obj):
        return '/api/constancias/firmante/firma/' if obj.firma_imagen else None

    def get_sello_imagen_url(self, obj):
        return '/api/constancias/firmante/sello/' if obj.sello_imagen else None


class ConstanciaEmitidaListSerializer(serializers.ModelSerializer):
    """Listado: NO incluye html_renderizado (payload pesado) — solo el
    detalle lo expone (ver ConstanciaEmitidaDetailSerializer)."""
    tipo_display = serializers.CharField(source='get_tipo_display', read_only=True)
    alumno_nombre = serializers.SerializerMethodField()
    trabajador_nombre = serializers.SerializerMethodField()
    emitida_por_nombre = serializers.SerializerMethodField()

    class Meta:
        model = ConstanciaEmitida
        fields = [
            'id', 'numero', 'tipo', 'tipo_display', 'plantilla',
            'alumno', 'alumno_nombre', 'trabajador', 'trabajador_nombre',
            'salio_firmada', 'emitida_por', 'emitida_por_nombre',
            'fecha_emision', 'periodo_escolar',
        ]

    def get_alumno_nombre(self, obj):
        if obj.alumno_id is None:
            return None
        return f"{obj.alumno.nombre} {obj.alumno.apellido}".strip()

    def get_trabajador_nombre(self, obj):
        if obj.trabajador_id is None:
            return None
        return f"{obj.trabajador.nombre} {obj.trabajador.apellido}".strip()

    def get_emitida_por_nombre(self, obj):
        user = obj.emitida_por
        if user is None:
            return None
        return f"{user.first_name} {user.last_name}".strip() or user.username


class ConstanciaEmitidaDetailSerializer(ConstanciaEmitidaListSerializer):
    class Meta(ConstanciaEmitidaListSerializer.Meta):
        fields = ConstanciaEmitidaListSerializer.Meta.fields + ['html_renderizado', 'datos_capturados']
