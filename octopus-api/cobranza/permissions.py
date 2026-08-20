"""
Filtrado de querysets de cobranza por sede (multisede.PermisoSede).

Sigue el mismo criterio de acceso que multisede/views.py
(`_verificar_acceso_sede` / `_sedes_accesibles`):

  - superuser, o rol 'directivo_red' (en PerfilUsuario o en algún
    PermisoSede activo) => acceso total, sin filtrar.
  - Sistema de una sola sede activa (o ninguna) => filtrar no tendría
    sentido, se trata como acceso total (no-op).
  - Usuario SIN ningún PermisoSede registrado (caso legado: cuenta creada
    antes de que existiera multisede, o instalación que todavía no asignó
    permisos por sede) => también se trata como acceso total, para no
    bloquear el trabajo diario de nadie por una migración de datos que no
    le corresponde a este cambio.
  - Cualquier otro caso (multi-sede real, usuario con PermisoSede activo
    para una o más sedes) => se filtra el queryset a esas sedes.

Se usa tanto para listados (`filtrar_por_sede`) como para accesos por ID
(`get`/`retrieve`): filtrar el queryset ANTES del `.get(pk=...)` hace que
un ID de otra sede resulte en 404 (no existe "para mí"), nunca en 403, así
no se filtra si el registro existe en otra sede.
"""
from django.db.models import Q


def _es_acceso_total(user):
    """True si el usuario no debe ser filtrado por sede (ve todo)."""
    if user is None or not getattr(user, 'is_authenticated', False):
        return False
    if user.is_superuser:
        return True

    try:
        if user.perfil.rol == 'directivo_red':
            return True
    except Exception:
        pass

    from multisede.models import PermisoSede
    if PermisoSede.objects.filter(user=user, rol='directivo_red', activo=True).exists():
        return True

    return False


def sedes_permitidas_ids(user):
    """
    Retorna:
      - None  => acceso total, no filtrar (ver reglas en el docstring del módulo).
      - list  => ids de Sede a las que el usuario tiene PermisoSede activo.
                 (puede ser una lista vacía si el usuario tiene PermisoSede
                 pero ninguno activo, en cuyo caso no debería ver nada)
    """
    if _es_acceso_total(user):
        return None

    from multisede.models import Sede, PermisoSede

    total_sedes = Sede.objects.filter(activa=True).count()
    if total_sedes <= 1:
        # Sistema single-sede: filtrar sería un no-op forzado (y con riesgo
        # de bloquear datos legados con sede=null). Se trata como acceso total.
        return None

    permisos_ids = list(
        PermisoSede.objects.filter(user=user, activo=True).values_list('sede_id', flat=True)
    )
    if not permisos_ids:
        # Usuario legado sin PermisoSede: no lo bloqueamos (ver docstring).
        return None

    return permisos_ids


def filtrar_por_sede(user, queryset, campo='sede'):
    """
    Filtra `queryset` a los registros de las sedes accesibles por `user`,
    usando `campo` como lookup (ej. 'sede', 'alumno__sede',
    'representante__alumnos__sede'). Si el usuario tiene acceso total
    (ver `sedes_permitidas_ids`), devuelve el queryset sin modificar.
    """
    sede_ids = sedes_permitidas_ids(user)
    if sede_ids is None:
        return queryset

    lookup = f'{campo}__in'
    qs = queryset.filter(**{lookup: sede_ids})
    if hasattr(qs, 'distinct'):
        # Lookups que atraviesan relaciones inversas/M2M (ej.
        # 'representante__alumnos__sede') pueden duplicar filas.
        qs = qs.distinct()
    return qs
