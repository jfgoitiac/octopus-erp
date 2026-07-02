from django.db.models import Sum
from django.utils import timezone
from rest_framework import serializers

from .models import Sede, PermisoSede


# ─────────────────────────────────────────────
# SEDE
# ─────────────────────────────────────────────
class SedeSerializer(serializers.ModelSerializer):
    usuarios_count = serializers.SerializerMethodField()

    class Meta:
        model = Sede
        fields = [
            'id', 'nombre', 'rif', 'direccion', 'telefono', 'correo',
            'municipio', 'estado', 'activa', 'fecha_creacion',
            'configuracion', 'usuarios_count',
        ]

    def get_usuarios_count(self, obj):
        return obj.permisos.filter(activo=True).count()


# ─────────────────────────────────────────────
# PERMISO DE SEDE
# ─────────────────────────────────────────────
class PermisoSedeSerializer(serializers.ModelSerializer):
    username   = serializers.CharField(source='user.username', read_only=True)
    sede_nombre = serializers.CharField(source='sede.nombre', read_only=True)

    class Meta:
        model = PermisoSede
        fields = [
            'id', 'user_id', 'username', 'rol', 'activo',
            'fecha_asignacion', 'sede_id', 'sede_nombre',
        ]


# ─────────────────────────────────────────────
# SEDE RESUMEN (para dashboard consolidado)
# ─────────────────────────────────────────────
class SedeResumenSerializer(serializers.ModelSerializer):
    alumnos_activos  = serializers.SerializerMethodField()
    deuda_total_usd  = serializers.SerializerMethodField()
    pagos_mes_actual = serializers.SerializerMethodField()
    morosos          = serializers.SerializerMethodField()

    class Meta:
        model = Sede
        fields = [
            'id', 'nombre', 'activa',
            'alumnos_activos', 'deuda_total_usd',
            'pagos_mes_actual', 'morosos',
        ]

    def _total_sedes(self):
        # OJO: dict.get(key, default) evalúa el default siempre, aunque la
        # clave ya exista — con `.get('total_sedes', Sede.objects...count())`
        # se disparaba la query de conteo en cada llamada (4 veces por sede,
        # ignorando por completo el valor ya calculado en el contexto).
        total = self.context.get('total_sedes')
        if total is None:
            total = Sede.objects.filter(activa=True).count()
        return total

    def get_alumnos_activos(self, obj):
        from .views import _get_alumnos_de_sede
        return _get_alumnos_de_sede(obj, self._total_sedes()).count()

    def get_deuda_total_usd(self, obj):
        from cobranza.models import Mensualidad
        from .views import _get_alumnos_de_sede
        alumnos_qs = _get_alumnos_de_sede(obj, self._total_sedes())
        resultado = Mensualidad.objects.filter(
            alumno__in=alumnos_qs, pagado=False
        ).aggregate(total=Sum('monto_usd'))
        total = resultado.get('total')
        return float(total) if total else 0.0

    def get_pagos_mes_actual(self, obj):
        from .views import _get_pagos_de_sede
        ahora = timezone.now()
        resultado = _get_pagos_de_sede(
            obj, self._total_sedes(), mes=ahora.month, anio=ahora.year
        ).aggregate(total=Sum('monto_usd'))
        total = resultado.get('total')
        return float(total) if total else 0.0

    def get_morosos(self, obj):
        from .views import _get_alumnos_de_sede
        return _get_alumnos_de_sede(obj, self._total_sedes()).filter(estatus_financiero='mora').count()


# ─────────────────────────────────────────────
# DASHBOARD CONSOLIDADO
# ─────────────────────────────────────────────
class DashboardConsolidadoSerializer(serializers.Serializer):
    sedes   = SedeResumenSerializer(many=True)
    totales = serializers.DictField()
