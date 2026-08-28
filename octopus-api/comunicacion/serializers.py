from rest_framework import serializers

from .models import Circular, LecturaCircular, MensajeDirecto


# ─────────────────────────────────────────────
# CIRCULAR — PANEL ADMIN
# ─────────────────────────────────────────────
class CircularSerializer(serializers.ModelSerializer):
    publicado_por_username = serializers.SerializerMethodField()
    publicado_por_nombre = serializers.SerializerMethodField()
    total_destinatarios = serializers.SerializerMethodField()
    total_leidas = serializers.SerializerMethodField()

    class Meta:
        model = Circular
        fields = [
            'id', 'titulo', 'cuerpo', 'adjunto', 'requiere_confirmacion',
            'publicado_por_username', 'publicado_por_nombre', 'fecha_publicacion',
            'total_destinatarios', 'total_leidas',
        ]
        read_only_fields = ['fecha_publicacion']

    def get_publicado_por_username(self, obj):
        return obj.publicado_por.username if obj.publicado_por else None

    def get_publicado_por_nombre(self, obj):
        return obj.publicado_por.nombre_completo if obj.publicado_por else None

    def get_total_destinatarios(self, obj):
        return obj.lecturas.count()

    def get_total_leidas(self, obj):
        return obj.lecturas.filter(leido=True).count()


# ─────────────────────────────────────────────
# LECTURA CIRCULAR — "¿QUIÉN LEYÓ?" (ADMIN)
# ─────────────────────────────────────────────
class LecturaCircularSerializer(serializers.ModelSerializer):
    representante_nombre = serializers.SerializerMethodField()
    representante_cedula = serializers.SerializerMethodField()

    class Meta:
        model = LecturaCircular
        fields = ['id', 'representante_nombre', 'representante_cedula', 'leido', 'fecha_lectura']

    def get_representante_nombre(self, obj):
        rep = obj.usuario.representante
        return f"{rep.nombre} {rep.apellido}"

    def get_representante_cedula(self, obj):
        return obj.usuario.representante.cedula


# ─────────────────────────────────────────────
# CIRCULAR — PORTAL DE REPRESENTANTES
# ─────────────────────────────────────────────
class CircularPortalSerializer(serializers.ModelSerializer):
    """
    Incluye el estado de lectura de la LecturaCircular del representante
    autenticado (inyectada por la vista vía `instance.lectura_actual`).
    """
    leido = serializers.SerializerMethodField()
    fecha_lectura = serializers.SerializerMethodField()

    class Meta:
        model = Circular
        fields = [
            'id', 'titulo', 'cuerpo', 'adjunto', 'requiere_confirmacion',
            'fecha_publicacion', 'leido', 'fecha_lectura',
        ]

    def get_leido(self, obj):
        lectura = getattr(obj, 'lectura_actual', None)
        return lectura.leido if lectura else False

    def get_fecha_lectura(self, obj):
        lectura = getattr(obj, 'lectura_actual', None)
        return lectura.fecha_lectura if lectura else None


# ─────────────────────────────────────────────
# MENSAJE DIRECTO — PANEL ADMIN / DOCENTE
# ─────────────────────────────────────────────
class MensajeDirectoSerializer(serializers.ModelSerializer):
    alumno_nombre = serializers.SerializerMethodField()
    remitente_nombre = serializers.SerializerMethodField()
    es_propio = serializers.SerializerMethodField()

    class Meta:
        model = MensajeDirecto
        fields = [
            'id', 'alumno_id', 'alumno_nombre', 'cuerpo', 'adjunto',
            'leido', 'fecha', 'remitente_nombre', 'es_propio',
        ]
        read_only_fields = ['leido', 'fecha']

    def get_alumno_nombre(self, obj):
        return f"{obj.alumno.nombre} {obj.alumno.apellido}"

    def get_remitente_nombre(self, obj):
        if obj.remitente_docente:
            return obj.remitente_docente.username
        if obj.remitente_representante:
            rep = obj.remitente_representante.representante
            return f"{rep.nombre} {rep.apellido}"
        return None

    def get_es_propio(self, obj):
        """True si el remitente es el usuario admin/docente autenticado (para alinear la burbuja en el chat)."""
        request = self.context.get('request')
        if not request:
            return False
        return obj.remitente_docente_id == request.user.id


# ─────────────────────────────────────────────
# MENSAJE DIRECTO — PORTAL DE REPRESENTANTES
# ─────────────────────────────────────────────
class MensajeDirectoPortalSerializer(serializers.ModelSerializer):
    alumno_nombre = serializers.SerializerMethodField()
    remitente_nombre = serializers.SerializerMethodField()
    es_propio = serializers.SerializerMethodField()

    class Meta:
        model = MensajeDirecto
        fields = [
            'id', 'alumno_id', 'alumno_nombre', 'cuerpo', 'adjunto',
            'leido', 'fecha', 'remitente_nombre', 'es_propio',
        ]
        read_only_fields = ['leido', 'fecha']

    def get_alumno_nombre(self, obj):
        return f"{obj.alumno.nombre} {obj.alumno.apellido}"

    def get_remitente_nombre(self, obj):
        if obj.remitente_docente:
            return obj.remitente_docente.username
        if obj.remitente_representante:
            rep = obj.remitente_representante.representante
            return f"{rep.nombre} {rep.apellido}"
        return None

    def get_es_propio(self, obj):
        """True si el remitente es el representante autenticado (para alinear la burbuja en el chat)."""
        request = self.context.get('request')
        if not request:
            return False
        rep_user = getattr(request.user, 'representante_portal', None)
        return bool(rep_user) and obj.remitente_representante_id == rep_user.id
