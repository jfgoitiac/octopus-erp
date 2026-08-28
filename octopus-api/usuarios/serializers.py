from rest_framework import serializers

from .models import LogAuditoria


class LogAuditoriaSerializer(serializers.ModelSerializer):
    usuario = serializers.StringRelatedField()

    class Meta:
        model = LogAuditoria
        fields = ['id', 'usuario', 'accion', 'modulo', 'fecha_hora', 'ip_address', 'detalles']
