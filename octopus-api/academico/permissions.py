"""Política central de autorización para datos académicos.

Los filtros de sede se aplican antes de resolver identificadores. En una
instalación multi-sede, una cuenta sin ``PermisoSede`` activo no recibe acceso
implícito (fail closed). Las instalaciones de una sola sede conservan la
compatibilidad con datos legados cuyo campo ``sede`` sea nulo.
"""

from django.db.models import Q
from rest_framework import permissions

from multisede.models import PermisoSede, Sede


ROLES_ACADEMICOS_LECTURA = frozenset({
    'director', 'directivo_red', 'sistemas', 'administrador', 'secretaria',
    'coordinador', 'docente',
})
ROLES_ACADEMICOS_GESTION = frozenset({
    'director', 'directivo_red', 'sistemas', 'administrador', 'coordinador',
})
ROLES_SECRETARIA_O_SUPERIOR = ROLES_ACADEMICOS_GESTION | {'secretaria'}


def rol_usuario(user):
    try:
        perfil = user.perfil
        if perfil.esta_activo:
            return perfil.rol
    except (AttributeError, TypeError):
        pass
    return None


def tiene_rol(user, roles):
    return bool(
        user and user.is_authenticated
        and (user.is_superuser or rol_usuario(user) in roles)
    )


def sedes_academicas_ids(user):
    """``None`` significa acceso global/single-sede; una lista vacía, denegado."""
    if not user or not user.is_authenticated:
        return []
    if user.is_superuser or rol_usuario(user) == 'directivo_red':
        return None
    if Sede.objects.filter(activa=True).count() <= 1:
        return None
    return list(PermisoSede.objects.filter(
        user=user, activo=True, sede__activa=True,
    ).values_list('sede_id', flat=True))


def filtrar_sedes_academicas(user, queryset, campo='sede'):
    ids = sedes_academicas_ids(user)
    if ids is None:
        return queryset
    return queryset.filter(**{f'{campo}__in': ids})


def sede_permitida(user, sede_id):
    ids = sedes_academicas_ids(user)
    if ids is None:
        return True
    return sede_id is not None and sede_id in ids


class IsAcademicoRead(permissions.BasePermission):
    def has_permission(self, request, view):
        return tiene_rol(request.user, ROLES_ACADEMICOS_LECTURA)


class IsAdminOrAbove(permissions.BasePermission):
    def has_permission(self, request, view):
        return tiene_rol(request.user, ROLES_ACADEMICOS_GESTION)


class IsSecretariaOrAbove(permissions.BasePermission):
    def has_permission(self, request, view):
        return tiene_rol(request.user, ROLES_SECRETARIA_O_SUPERIOR)


def materia_queryset_para(user, queryset):
    qs = filtrar_sedes_academicas(user, queryset, 'sede')
    if rol_usuario(user) == 'docente' and not user.is_superuser:
        qs = qs.filter(docente=user, activa=True)
    return qs


def alumno_queryset_para(user, queryset, *, permitir_docente=True):
    qs = filtrar_sedes_academicas(user, queryset, 'sede')
    if permitir_docente and rol_usuario(user) == 'docente' and not user.is_superuser:
        materias = user.materias.filter(activa=True)
        alcance = Q(pk__in=[])
        for sede_id, grado in materias.values_list('sede_id', 'grado_seccion').distinct():
            par = Q(grado_seccion__iexact=grado)
            par &= Q(sede_id=sede_id) if sede_id is not None else Q(sede_id__isnull=True)
            alcance |= par
        qs = qs.filter(alcance)
    return qs
