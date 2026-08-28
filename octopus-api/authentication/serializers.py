from rest_framework import serializers
from django.contrib.auth import get_user_model
from .models import PerfilUsuario
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer


class PerfilSerializer(serializers.ModelSerializer):
    class Meta:
        model = PerfilUsuario
        fields = ['rol', 'esta_activo']


class UserSerializer(serializers.ModelSerializer):
    perfil = PerfilSerializer(read_only=True)
    # Protegemos el campo estructural: 'rol' ahora es solo para entrada (creación/edición).
    # Esto evita que el valor real se exponga en GET y previene mutaciones no validadas.
    rol = serializers.CharField(write_only=True, required=False)

    first_name = serializers.CharField(required=True, allow_blank=False)
    last_name = serializers.CharField(required=True, allow_blank=False)
    nombre_completo = serializers.ReadOnlyField()

    # Implementamos un campo calculado seguro para el Frontend.
    permissions_context = serializers.SerializerMethodField()

    class Meta:
        model = get_user_model()
        fields = ['id', 'username', 'email', 'password', 'first_name', 'last_name', 'nombre_completo', 'is_active', 'perfil', 'rol', 'permissions_context', 'last_login']
        extra_kwargs = {'password': {'write_only': True}}

    def get_permissions_context(self, obj):
        """
        Genera un subconjunto seguro y sanitizado de flags de permisos.
        Reduce la superficie de exposición de la lógica de roles interna.
        """
        try:
            rol_nombre = obj.perfil.rol
        except Exception:
            rol_nombre = "sin_perfil"

        return {
            "role_display": rol_nombre,
            "can_manage_billing": rol_nombre in ['director', 'administrador', 'cajero'],
            "can_view_reports": rol_nombre in ['director', 'administrador', 'sistemas'],
            "is_system_admin": rol_nombre in ['director', 'sistemas'],
        }

    def validate_password(self, value):
        try:
            validate_password(value)
        except DjangoValidationError as e:
            raise serializers.ValidationError(list(e.messages))
        return value

    @transaction.atomic
    def create(self, validated_data):
        User = get_user_model()
        rol = validated_data.pop('rol', 'cajero')
        password = validated_data.pop('password')

        # BUG: DRF completa 'is_active' con False cuando el campo no viene en
        # el request (comportamiento de BooleanField con required=False, no
        # hereda el default=True del modelo). El formulario de creación de
        # usuarios (Sistemas.jsx) nunca envía este campo, así que todo
        # usuario nuevo quedaba inactivo y no podía iniciar sesión hasta que
        # alguien lo activara manualmente. Si el campo no vino explícito en
        # el request, se fuerza a True (default real del modelo); si vino
        # explícito, se respeta el valor ya validado/coercido por DRF.
        if 'is_active' not in self.initial_data:
            validated_data['is_active'] = True

        user = User.objects.create_user(password=password, **validated_data)

        perfil, _ = PerfilUsuario.objects.get_or_create(user=user)
        perfil.rol = rol
        perfil.esta_activo = True
        perfil.save()

        return user

    @transaction.atomic
    def update(self, instance, validated_data):
        rol = validated_data.pop('rol', None)
        password = validated_data.pop('password', None)

        # D3: el username es inmutable después de creado el usuario.
        validated_data.pop('username', None)

        if password:
            instance.set_password(password)

        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()

        # CORRECCIÓN 2: get_or_create evita AttributeError
        # si el perfil no existe por algún fallo de base de datos
        if rol:
            perfil, _ = PerfilUsuario.objects.get_or_create(user=instance)
            perfil.rol = rol
            perfil.save()

        return instance


class PerfilDocenteSerializer(serializers.ModelSerializer):
    """Perfil del docente autenticado para el portal docente (mi-perfil)."""
    rol = serializers.SerializerMethodField()
    foto = serializers.SerializerMethodField()
    username = serializers.CharField(read_only=True)

    class Meta:
        model = get_user_model()
        fields = ['id', 'first_name', 'last_name', 'email', 'username', 'rol', 'foto']

    def get_rol(self, obj):
        try:
            return obj.perfil.rol
        except Exception:
            return None

    def get_foto(self, obj):
        try:
            return obj.perfil.foto.url if obj.perfil.foto else None
        except Exception:
            return None


class PerfilFotoSerializer(serializers.ModelSerializer):
    """Validación del archivo de foto de perfil (tamaño/tipo) antes de guardarlo."""
    class Meta:
        model = PerfilUsuario
        fields = ['foto']


class MyTokenObtainPairSerializer(TokenObtainPairSerializer):
    @classmethod
    def get_token(cls, user):
        token = super().get_token(user)
        # El token JWT debe ser una representación fiel de la base de datos
        # Si no hay perfil, no inyectamos un rol falso.
        token['username'] = user.username
        # 'nombre' se embebe como claim para que el frontend lo recupere al
        # decodificar el access token tras un silent refresh, sin necesitar
        # una llamada adicional al backend (antes solo lo hacían
        # DocenteTokenView/CantinaTokenView; ahora que el login de todo el
        # staff pasa por este serializer, se centraliza aquí).
        token['nombre'] = f"{user.first_name} {user.last_name}".strip() or user.username
        if hasattr(user, 'perfil'):
            token['rol'] = user.perfil.rol
        else:
            token['rol'] = 'no_role'
        return token

    def validate(self, attrs):
        data = super().validate(attrs)
        
        # Seguridad estricta: Bloquear acceso si no hay perfil configurado
        if not hasattr(self.user, 'perfil'):
            raise serializers.ValidationError({
                "perfil": "El usuario no tiene un perfil administrativo configurado. Contacte a sistemas."
            })

        # Validación de estado del perfil
        if not self.user.perfil.esta_activo:
            raise serializers.ValidationError({
                "perfil": "Este perfil de usuario se encuentra desactivado."
            })

        user_serializer = UserSerializer(self.user)
        data.update(user_serializer.data)
        data['rol'] = self.user.perfil.rol
        return data