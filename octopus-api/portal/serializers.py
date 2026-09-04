from datetime import date
from decimal import Decimal
from django.contrib.auth import authenticate
from django.contrib.auth.tokens import default_token_generator
from django.utils.encoding import force_bytes, force_str
from django.utils.http import urlsafe_base64_decode, urlsafe_base64_encode
from rest_framework import serializers
from rest_framework_simplejwt.tokens import RefreshToken

from secretaria.models import Representante
from cobranza.models import Mensualidad, Pago
from cantina.models import MovimientoTarjeta, RecargaTarjeta as RecargaTarjetaCantina
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
        attrs['debe_cambiar_password'] = rep_user.debe_cambiar_password
        return attrs


# ──────────────────────────────────────────────────────────────────────────────
# RECUPERACIÓN DE CONTRASEÑA (self-service, sin intervención de un admin)
# ──────────────────────────────────────────────────────────────────────────────

class PortalSolicitarResetSerializer(serializers.Serializer):
    """
    Paso 1: recibe cédula o correo, y si corresponde a un representante con
    portal activo genera un uid+token (Django PasswordResetTokenGenerator,
    stateless — no requiere tabla propia) para incluir en el link del email.

    SEGURIDAD: nunca revela si la cédula/correo existe o no — validate()
    siempre resuelve sin error; la vista decide si envía el email o no,
    pero la respuesta HTTP es idéntica en ambos casos (ver PortalSolicitarResetView).
    """
    cedula_o_email = serializers.CharField(write_only=True, max_length=254)

    def validate(self, attrs):
        cedula_o_email = attrs.get('cedula_o_email', '').strip()
        representante = (
            Representante.objects.filter(cedula=cedula_o_email).first()
            or Representante.objects.filter(correo__iexact=cedula_o_email).first()
        )
        rep_user = None
        if representante:
            try:
                rep_user = representante.portal_user
            except RepresentanteUser.DoesNotExist:
                rep_user = None
        attrs['representante'] = representante if (rep_user and rep_user.esta_activo) else None
        return attrs


class PortalConfirmarResetSerializer(serializers.Serializer):
    """
    Paso 2: valida uid+token del link y la nueva contraseña, y la aplica.
    El token de Django incorpora el hash de la contraseña actual, así que
    dejar de ser válido apenas se usa una vez (o si el usuario ya cambió su
    clave por otra vía) es automático, sin necesidad de marcarlo "usado".
    """
    uid = serializers.CharField(write_only=True)
    token = serializers.CharField(write_only=True)
    contrasena_nueva = serializers.CharField(write_only=True, max_length=128)
    confirmar = serializers.CharField(write_only=True, max_length=128)

    _ERROR_TOKEN = 'El enlace de recuperación es inválido o ya expiró. Solicita uno nuevo.'

    def validate(self, attrs):
        if attrs['contrasena_nueva'] != attrs['confirmar']:
            raise serializers.ValidationError('La nueva contraseña y la confirmación no coinciden.')
        if len(attrs['contrasena_nueva']) < 8:
            raise serializers.ValidationError('La contraseña debe tener al menos 8 caracteres.')

        try:
            rep_user_id = force_str(urlsafe_base64_decode(attrs['uid']))
            rep_user = RepresentanteUser.objects.select_related('user', 'representante').get(pk=rep_user_id)
        except (TypeError, ValueError, OverflowError, RepresentanteUser.DoesNotExist):
            raise serializers.ValidationError(self._ERROR_TOKEN)

        if not rep_user.esta_activo or not default_token_generator.check_token(rep_user.user, attrs['token']):
            raise serializers.ValidationError(self._ERROR_TOKEN)

        attrs['rep_user'] = rep_user
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

    monto_recargo/nombre_recargo/monto_total son PROSPECTIVOS: se calculan
    con resolver_recargo() evaluado HOY, solo si la mensualidad sigue sin
    pagar (una ya pagada no debe mostrar un recargo hipotético — su recargo
    REAL, si aplicó, ya quedó guardado como LineaRecargoPago inmutable en
    el momento del cobro, y no se confunde con este cálculo de cotización).
    """
    mes_nombre = serializers.SerializerMethodField()
    dias_mora = serializers.SerializerMethodField()
    monto_recargo = serializers.SerializerMethodField()
    nombre_recargo = serializers.SerializerMethodField()
    monto_total = serializers.SerializerMethodField()

    class Meta:
        model = Mensualidad
        fields = [
            'id', 'mes', 'mes_nombre', 'anio', 'monto_usd', 'pagado', 'fecha_pago', 'dias_mora',
            'monto_original_usd', 'porcentaje_beca_aplicado',
            'monto_recargo', 'nombre_recargo', 'monto_total',
        ]

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

    def _resultado_recargo(self, obj):
        """Cachea el resultado en el propio objeto (atributo transitorio, no
        persistido) para no repetir la resolución 3 veces por mensualidad
        (una por cada campo monto_recargo/nombre_recargo/monto_total).

        `context['cache_reglas']` (dict opcional, compartido entre instancias
        de la misma llamada many=True) evita además repetir la query de la
        regla activa por cada mensualidad de la lista -- sin esto, serializar
        N mensualidades disparaba N queries a ReglaRecargoPago (N+1, ver
        PortalDashboardNPlusOneTest). Mismo patrón que ya usa la versión bulk
        en cobranza/recargos.py::calcular_recargos_para_alumnos."""
        if hasattr(obj, '_recargo_resuelto_cache'):
            return obj._recargo_resuelto_cache
        if obj.pagado:
            resultado = None
        else:
            from cobranza.recargos import resolver_recargo
            cache_reglas = self.context.get('cache_reglas')
            resultado = resolver_recargo(obj, date.today(), _cache_reglas=cache_reglas)
        obj._recargo_resuelto_cache = resultado
        return resultado

    def get_monto_recargo(self, obj):
        resultado = self._resultado_recargo(obj)
        return str(resultado['monto_usd']) if resultado else '0.00'

    def get_nombre_recargo(self, obj):
        resultado = self._resultado_recargo(obj)
        return resultado['nombre'] if resultado else None

    def get_monto_total(self, obj):
        resultado = self._resultado_recargo(obj)
        recargo = resultado['monto_usd'] if resultado else Decimal('0.00')
        return str(obj.monto_usd + recargo)


class PagoHistorialSerializer(serializers.ModelSerializer):
    """Historial de pagos del representante con datos resumidos."""
    concepto = serializers.SerializerMethodField()

    class Meta:
        model = Pago
        fields = ['id', 'factura_id', 'fecha_pago', 'monto_usd', 'metodo_pago', 'estatus', 'concepto']

    def get_concepto(self, obj):
        return obj.get_concepto_display()


class PortalPerfilSerializer(serializers.Serializer):
    """
    Perfil del representante autenticado para el portal (mi-perfil).
    Combina datos editables del User (first_name/last_name/email) y de
    PerfilUsuario.foto (mismo modelo que usa el portal docente, ya existe
    para cualquier usuario vía la señal create_perfil_usuario) con datos
    propios de Representante (telefono editable, cedula solo lectura).
    """
    first_name = serializers.CharField()
    last_name = serializers.CharField()
    email = serializers.EmailField()
    username = serializers.CharField(read_only=True)
    foto = serializers.SerializerMethodField()
    cedula = serializers.SerializerMethodField()
    telefono = serializers.SerializerMethodField()

    def get_foto(self, user):
        try:
            return user.perfil.foto.url if user.perfil.foto else None
        except Exception:
            return None

    def get_cedula(self, user):
        return user.representante_portal.representante.cedula

    def get_telefono(self, user):
        return user.representante_portal.representante.telefono


# ──────────────────────────────────────────────────────────────────────────────
# CANTINA — SALDO Y RECARGA DE TARJETA PREPAGO (Fase 3 del portal, cantina.md §5.6)
# ──────────────────────────────────────────────────────────────────────────────

class TarjetaCantinaPortalSerializer(serializers.Serializer):
    """
    Estado de la tarjeta de cantina de un alumno del representante autenticado.
    Serializa dicts (no instancias de modelo) armados en PortalSaldoTarjetaView,
    porque un alumno puede no tener tarjeta asignada todavía (tiene_tarjeta=False)
    y en ese caso no existe ninguna instancia de TarjetaPrepago que serializar.
    """
    alumno_id = serializers.IntegerField()
    alumno_nombre = serializers.CharField()
    grado_seccion = serializers.CharField(allow_null=True)
    tiene_tarjeta = serializers.BooleanField()
    tarjeta_id = serializers.IntegerField(allow_null=True)
    saldo = serializers.CharField(allow_null=True)
    estado = serializers.CharField(allow_null=True)
    estado_display = serializers.CharField(allow_null=True)
    limite_credito = serializers.CharField(allow_null=True)
    en_negativo = serializers.BooleanField()
    saldo_negativo_desde = serializers.DateField(allow_null=True)
    dias_en_negativo = serializers.IntegerField()


class MovimientoTarjetaPortalSerializer(serializers.ModelSerializer):
    """Consumo/recarga/ajuste de una tarjeta de cantina, para el historial del portal."""
    tipo_display = serializers.SerializerMethodField()

    class Meta:
        model = MovimientoTarjeta
        fields = ['id', 'tipo', 'tipo_display', 'monto', 'saldo_antes', 'saldo_despues', 'creado_en']

    def get_tipo_display(self, obj):
        return obj.get_tipo_display()


class RecargaTarjetaPortalSerializer(serializers.ModelSerializer):
    """
    Recarga de tarjeta de cantina solicitada desde el portal. De solo lectura:
    PortalRecargarTarjetaView arma y valida los campos a mano (monto derivado
    con la tasa vigente, referencia normalizada, antifraude cruzado) antes de
    llamar a RecargaTarjeta.objects.create(...) — este serializer solo formatea
    la respuesta 201, no se usa para validar la creación.
    """
    metodo_pago_display = serializers.SerializerMethodField()
    estatus_display = serializers.SerializerMethodField()
    alumno_id = serializers.IntegerField(source='tarjeta.alumno_id', read_only=True)

    class Meta:
        model = RecargaTarjetaCantina
        fields = [
            'id', 'tarjeta', 'alumno_id', 'metodo_pago', 'metodo_pago_display',
            'monto_usd', 'tasa_aplicada', 'monto_ves', 'banco_receptor',
            'banco_procedencia', 'referencia', 'comprobante', 'estatus',
            'estatus_display', 'registrado_por_portal', 'creado_en', 'revisado_en',
        ]
        read_only_fields = fields

    def get_metodo_pago_display(self, obj):
        return dict(Pago.METODOS).get(obj.metodo_pago, obj.metodo_pago)

    def get_estatus_display(self, obj):
        return obj.get_estatus_display()


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
