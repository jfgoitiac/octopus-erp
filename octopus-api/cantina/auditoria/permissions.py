"""
Permiso del módulo de Auditoría de Cantina.

Mismo patrón que cantina/permissions.py: el rol vive en
`request.user.perfil.rol` con `perfil.esta_activo`; el superusuario pasa
(decisión D5).
"""
from rest_framework import permissions


class EsDirector(permissions.BasePermission):
    """Solo el rol Director (o superusuario)."""
    message = 'La Auditoría de Cantina es exclusiva del Director.'

    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        if request.user.is_superuser:
            return True
        try:
            return request.user.perfil.esta_activo and request.user.perfil.rol == 'director'
        except Exception:
            return False
