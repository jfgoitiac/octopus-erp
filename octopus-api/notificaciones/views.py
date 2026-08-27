from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import permissions, status
import logging

from portal.authentication import PortalJWTAuthentication

logger = logging.getLogger(__name__)

CAMPOS_EMAIL = [
    # La config SMTP en sí vive por área en PerfilEmailRemitente (ver
    # PerfilEmailRemitenteView) — este singleton solo guarda el destinatario
    # de las alertas de mora día 15.
    'director_email',
]
CAMPOS_WA = [
    'whatsapp_activo', 'whatsapp_proveedor', 'director_whatsapp',
    'twilio_account_sid', 'twilio_auth_token', 'twilio_whatsapp_from',
    'meta_whatsapp_token', 'meta_whatsapp_phone_id',
]
CAMPOS_MORA = [
    'dias_recordatorio_1', 'dias_recordatorio_2', 'dias_alerta_director',
]
CAMPOS_SECRETOS = {'email_host_password', 'twilio_auth_token', 'meta_whatsapp_token'}
CAMPOS_PERFIL_EMAIL = [
    'email_activo', 'email_host', 'email_port', 'email_use_tls',
    'email_host_user', 'email_host_password', 'email_from',
]


def _check_rol(request):
    return getattr(getattr(request.user, 'perfil', None), 'rol', '') in ('director', 'sistemas', 'administrador')


def _ocultar_secretos(data, campos):
    """Reemplaza en `data` los campos secretos por '••••' + últimos 4 chars.
    El frontend detecta el prefijo '••••' para saber que es un placeholder."""
    for campo in campos:
        val = data.get(campo)
        if val:
            suffix = val[-4:] if len(val) >= 4 else val
            data[campo] = f'••••{suffix}'
        else:
            data[campo] = ''
    return data


def _cfg_to_dict(cfg):
    data = {}
    for campo in CAMPOS_EMAIL + CAMPOS_WA + CAMPOS_MORA:
        data[campo] = getattr(cfg, campo)
    return _ocultar_secretos(data, CAMPOS_SECRETOS)


class ProbarNotificacionView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        if not _check_rol(request):
            return Response({'error': 'Sin permiso.'}, status=403)
        canal   = request.data.get('canal', 'email')
        destino = request.data.get('destino', '')
        mensaje = request.data.get('mensaje', 'Mensaje de prueba del sistema Octopus.')
        area    = request.data.get('area', 'cobranza')
        if not destino:
            return Response({'error': 'destino es requerido.'}, status=400)
        resultados = {}
        if canal in ('email', 'ambos'):
            from notificaciones.services import enviar_email
            html = (
                '<div style="font-family:Arial;padding:24px">'
                '<h2>Prueba de notificacion</h2>'
                f'<p>{mensaje}</p>'
                '</div>'
            )
            ok = enviar_email(destino, 'Prueba de notificacion -- Octopus', html, tipo='prueba', area=area)
            resultados['email'] = 'enviado' if ok else 'fallido'
        if canal in ('whatsapp', 'ambos'):
            from notificaciones.services import enviar_whatsapp
            ok = enviar_whatsapp(destino, mensaje, tipo='prueba')
            resultados['whatsapp'] = 'enviado' if ok else 'fallido (revisar configuracion)'
        return Response({'resultados': resultados, 'destino': destino})


class ConfiguracionNotificacionesView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def _get_cfg(self):
        from .models import ConfiguracionNotificaciones
        cfg, _ = ConfiguracionNotificaciones.objects.get_or_create(pk=1)
        return cfg

    def get(self, request):
        if not _check_rol(request):
            return Response({'error': 'Sin permiso.'}, status=403)
        return Response(_cfg_to_dict(self._get_cfg()))

    def patch(self, request):
        if not _check_rol(request):
            return Response({'error': 'Sin permiso.'}, status=403)
        cfg = self._get_cfg()
        campos_permitidos = set(CAMPOS_EMAIL + CAMPOS_WA + CAMPOS_MORA)

        datos = dict(request.data)
        if any(c in datos for c in CAMPOS_MORA):
            d1 = int(datos.get('dias_recordatorio_1', cfg.dias_recordatorio_1))
            d2 = int(datos.get('dias_recordatorio_2', cfg.dias_recordatorio_2))
            d3 = int(datos.get('dias_alerta_director', cfg.dias_alerta_director))
            if not (0 < d1 < d2 < d3):
                return Response(
                    {'error': 'Los días de recordatorio deben ser positivos y crecientes '
                              '(primer recordatorio < segundo aviso < alerta al director).'},
                    status=400,
                )

        for campo, valor in datos.items():
            if campo not in campos_permitidos:
                continue
            # Ignorar placeholders: '***' (formato viejo) y '••••xxxx' (formato nuevo)
            if campo in CAMPOS_SECRETOS and (valor == '***' or str(valor).startswith('••••')):
                continue
            setattr(cfg, campo, valor)
        cfg.save()
        return Response(_cfg_to_dict(cfg))


class PerfilEmailRemitenteView(APIView):
    """Config SMTP por área (cobranza / control_estudios)."""
    permission_classes = [permissions.IsAuthenticated]

    def _get_perfil(self, area):
        from .models import PerfilEmailRemitente
        areas_validas = dict(PerfilEmailRemitente.AREAS)
        if area not in areas_validas:
            return None
        perfil, _ = PerfilEmailRemitente.objects.get_or_create(area=area)
        return perfil

    def get(self, request, area):
        if not _check_rol(request):
            return Response({'error': 'Sin permiso.'}, status=403)
        perfil = self._get_perfil(area)
        if perfil is None:
            return Response({'error': 'Área inválida.'}, status=404)
        data = {campo: getattr(perfil, campo) for campo in CAMPOS_PERFIL_EMAIL}
        return Response(_ocultar_secretos(data, CAMPOS_SECRETOS))

    def patch(self, request, area):
        if not _check_rol(request):
            return Response({'error': 'Sin permiso.'}, status=403)
        perfil = self._get_perfil(area)
        if perfil is None:
            return Response({'error': 'Área inválida.'}, status=404)
        for campo, valor in request.data.items():
            if campo not in CAMPOS_PERFIL_EMAIL:
                continue
            if campo in CAMPOS_SECRETOS and (valor == '***' or str(valor).startswith('••••')):
                continue
            setattr(perfil, campo, valor)
        perfil.save()
        data = {campo: getattr(perfil, campo) for campo in CAMPOS_PERFIL_EMAIL}
        return Response(_ocultar_secretos(data, CAMPOS_SECRETOS))


class LogNotificacionesView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        if not _check_rol(request):
            return Response({'error': 'Sin permiso.'}, status=403)
        from .models import NotificacionLog
        qs = NotificacionLog.objects.all()
        for k in ('canal', 'estado', 'tipo'):
            v = request.query_params.get(k)
            if v:
                qs = qs.filter(**{k: v})
        page = max(1, int(request.query_params.get('page', 1)))
        size = min(50, int(request.query_params.get('page_size', 20)))
        total = qs.count()
        logs  = qs[(page - 1) * size: page * size]
        return Response({
            'total': total,
            'page': page,
            'page_size': size,
            'results': [
                {
                    'id': l.id,
                    'canal': l.canal,
                    'tipo': l.tipo,
                    'destinatario': l.destinatario,
                    'asunto': l.asunto,
                    'estado': l.estado,
                    'error_detalle': l.error_detalle,
                    'fecha_envio': l.fecha_envio,
                    'proveedor': l.proveedor,
                    'representante_cedula': l.representante_cedula,
                    'alumno_nombre': l.alumno_nombre,
                }
                for l in logs
            ],
        })


# ──────────────────────────────────────────────────────────────────────────────
# WEB PUSH — PORTAL DE REPRESENTANTES
# ──────────────────────────────────────────────────────────────────────────────

class SuscripcionPushView(APIView):
    """POST: crea o reactiva la suscripcion push del representante autenticado
    para el `endpoint` recibido (el mismo `endpoint` puede volver a suscribirse
    tras desactivarse, o quedar reasignado si el navegador se reutiliza con
    otra cuenta -- `endpoint` es unico en el modelo).
    DELETE: desactiva (soft) la suscripcion de ese endpoint.
    GET: estado agregado de la cuenta -- si tiene alguna suscripcion activa y
    los tipos activos (es una preferencia de cuenta, igual que en PATCH tipos/)."""
    authentication_classes = [PortalJWTAuthentication]
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        from .models import SuscripcionPush
        rep_user = request.user.representante_portal
        suscripcion = SuscripcionPush.objects.filter(
            usuario_portal=rep_user, activa=True,
        ).order_by('-fecha_registro').first()
        if not suscripcion:
            return Response({'activa': False, 'tipos_activos': []})
        return Response({'activa': True, 'tipos_activos': suscripcion.tipos_activos})

    def post(self, request):
        from .models import SuscripcionPush, _tipos_push_default
        rep_user = request.user.representante_portal
        endpoint = (request.data.get('endpoint') or '').strip()
        keys = request.data.get('keys') or {}
        p256dh = keys.get('p256dh') or request.data.get('p256dh')
        auth = keys.get('auth') or request.data.get('auth')
        if not endpoint or not p256dh or not auth:
            return Response(
                {'error': 'Suscripción inválida: faltan endpoint o keys.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        tipos = request.data.get('tipos') or _tipos_push_default()

        suscripcion, _creada = SuscripcionPush.objects.update_or_create(
            endpoint=endpoint,
            defaults={
                'usuario_portal': rep_user,
                'p256dh': p256dh,
                'auth': auth,
                'activa': True,
                'tipos_activos': tipos,
            },
        )
        return Response({
            'id': suscripcion.id,
            'activa': suscripcion.activa,
            'tipos_activos': suscripcion.tipos_activos,
        }, status=status.HTTP_201_CREATED)

    def delete(self, request):
        from .models import SuscripcionPush
        rep_user = request.user.representante_portal
        endpoint = (request.data.get('endpoint') or '').strip()
        if not endpoint:
            return Response({'error': 'Falta endpoint.'}, status=status.HTTP_400_BAD_REQUEST)
        actualizadas = SuscripcionPush.objects.filter(
            endpoint=endpoint, usuario_portal=rep_user,
        ).update(activa=False)
        if not actualizadas:
            return Response({'error': 'Suscripción no encontrada.'}, status=status.HTTP_404_NOT_FOUND)
        return Response(status=status.HTTP_204_NO_CONTENT)


class TiposPushView(APIView):
    """PATCH: actualiza los tipos de notificacion push activos (circular, nota,
    factura, mensaje) en todas las suscripciones activas del representante
    autenticado -- es una preferencia de cuenta, no por dispositivo."""
    authentication_classes = [PortalJWTAuthentication]
    permission_classes = [permissions.IsAuthenticated]

    TIPOS_VALIDOS = {'circular', 'nota', 'factura', 'mensaje'}

    def patch(self, request):
        from .models import SuscripcionPush
        rep_user = request.user.representante_portal
        tipos = request.data.get('tipos')
        if not isinstance(tipos, list) or not set(tipos).issubset(self.TIPOS_VALIDOS):
            return Response(
                {'error': f'`tipos` debe ser una lista dentro de {sorted(self.TIPOS_VALIDOS)}.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        SuscripcionPush.objects.filter(usuario_portal=rep_user, activa=True).update(tipos_activos=tipos)
        return Response({'tipos_activos': tipos})
