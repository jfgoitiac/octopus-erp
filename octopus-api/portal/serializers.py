from datetime import date
from django.contrib.auth import authenticate
from rest_framework import serializers
from rest_framework_simplejwt.tokens import RefreshToken

from secretaria.models import Representante
from cobranza.models import Mensualidad, Pago
from .models import ComprobantePago, RepresentanteUser


# ──────────────────────────────────────────────────────────────────────────────
# AUTENTICACIÓN DEL PORTAL
# ──────────────────────────────────────────────────────────────────────────────

class PortalTokenSerializer(serializers.Serializer):
    """
    Serializer de login para representantes.
    Acepta cédula o correo electrónico + contraseña.
    Retorna tokens JWT junto con datos básicos del representante.

    SEGURIDAD: todos los fallos de autenticación retornan el mismo mensaje
    genérico para evitar username enumeration.
    """
    # max_length limita ataques de payload oversized / DoS en este campo
    cedula_o_email = serializers.CharField(write_only=True, max_length=254)
    contrasena = serializers.CharField(write_only=True, max_length=128)

    # Mensaje genérico único — no distingue entre "no existe", "sin acceso" ni "clave incorrecta"
    _ERROR_GENERICO = 'Credenciales incorrectas o acceso no habilitado.'

    def validate(self, attrs):
        cedula_o_email = attrs.get('cedula_o_email', '').strip()
        contrasena = attrs.get('contrasena', '')

        # Buscar representante por cédula o correo
        representante = (
            Representante.objects.filter(cedula=cedula_o_email).first()
            or Representante.objects.filter(correo__iexact=cedula_o_email).first()
        )

        # SEGURIDAD: mismo error para "no existe", "sin portal_user" y "desactivado"
        if not representante:
            raise serializers.ValidationError(self._ERROR_GENERICO)

        # Verificar que tiene usuario de portal asociado
        try:
            rep_user = representante.portal_user
        except RepresentanteUser.DoesNotExist:
            raise serializers.ValidationError(self._ERROR_GENERICO)

        if not rep_user.esta_activo:
            raise serializers.ValidationError(self._ERROR_GENERICO)

        # Autenticar con Django auth
        user = authenticate(username=rep_user.user.username, password=contrasena)
        # SEGURIDAD: mismo mensaje genérico para contraseña incorrecta o cuenta inactiva
        if not user or not user.is_active:
            raise serializers.ValidationError(self._ERROR_GENERICO)

        # Generar tokens JWT con custom claims del representante
        # Esto permite que el frontend recupere nombre/apellido/cédula al recargar
        # sin hacer una llamada adicional al backend.
        refresh = RefreshToken.for_user(user)
        refresh['representante_id'] = representante.id
        refresh['nombre'] = representante.nombre
        refresh['apellido'] = representante.apellido
        refresh['cedula'] = representante.cedula
        attrs['tokens'] = {
            'refresh': str(refresh),
            'access': str(refresh.access_token),
        }
        attrs['representante'] = representante
        return attrs


# ──────────────────────────────────────────────────────────────────────────────
# DATOS DEL DASHBOARD
# ──────────────────────────────────────────────────────────────────────────────

class AlumnoDashboardSerializer(serializers.Serializer):
    """Datos básicos del alumno para el dashboard del representante."""
    id = serializers.IntegerField()
    nombre = serializers.CharField()
    apellido = serializers.CharField()
    grado_seccion = serializers.CharField()
    estatus_financiero = serializers.CharField()


class MensualidadSerializer(serializers.ModelSerializer):
    """
    Mensualidad con cálculo de días de mora.
    dias_mora > 0 indica que la mensualidad está vencida y sin pagar.
    """
    mes_nombre = serializers.SerializerMethodField()
    dias_mora = serializers.SerializerMethodField()

    class Meta:
        model = Mensualidad
        fields = ['id', 'mes', 'mes_nombre', 'anio', 'monto_usd', 'pagado', 'fecha_pago', 'dias_mora']

    def get_mes_nombre(self, obj):
        return obj.get_mes_display()

    def get_dias_mora(self, obj):
        """Calcula días de mora para mensualidades no pagadas y ya vencidas."""
        if obj.pagado:
            return 0
        hoy = date.today()
        # Último día del mes de la mensualidad
        import calendar
        ultimo_dia = calendar.monthrange(obj.anio, obj.mes)[1]
        fecha_vencimiento = date(obj.anio, obj.mes, ultimo_dia)
        if hoy > fecha_vencimiento:
            return (hoy - fecha_vencimiento).days
        return 0


class PagoHistorialSerializer(serializers.ModelSerializer):
    """Historial de pagos del representante con datos resumidos."""
    concepto = serializers.SerializerMethodField()

    class Meta:
        model = Pago
        fields = ['id', 'factura_id', 'fecha_pago', 'monto_usd', 'metodo_pago', 'estatus', 'concepto']

    def get_concepto(self, obj):
        return obj.get_concepto_display()


class ComprobantePagoSerializer(serializers.ModelSerializer):
    """Serializer completo de ComprobantePago para creación y consulta."""
    estatus_display = serializers.SerializerMethodField()

    class Meta:
        model = ComprobantePago
        fields = [
            'id', 'mensualidad', 'archivo', 'fecha_subida',
            'estatus', 'estatus_display', 'observaciones'
        ]
        read_only_fields = ['fecha_subida', 'estatus', 'subido_por_ip']

    def get_estatus_display(self, obj):
        return obj.get_estatus_display()
