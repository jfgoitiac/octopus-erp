from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer

from .models import LogAuditoria


class MyTokenObtainPairSerializer(TokenObtainPairSerializer):
    @classmethod
    def get_token(cls, user):
        token = super().get_token(user)
        token['rol'] = getattr(user.perfil, 'rol', 'cajero') if hasattr(user, 'perfil') else 'cajero'
        token['username'] = user.username
        return token


class LogAuditoriaSerializer(serializers.ModelSerializer):
    usuario = serializers.StringRelatedField()

    class Meta:
        model = LogAuditoria
        fields = ['id', 'usuario', 'accion', 'modulo', 'fecha_hora', 'ip_address', 'detalles']
