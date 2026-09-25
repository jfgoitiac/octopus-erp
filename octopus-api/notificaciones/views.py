from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import permissions, status
import logging

from portal.authentication import PortalJWTAuthentication
from authentication.views import EsPersonalCobranza

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


# ──────────────────────────────────────────────────────────────────────────────
# COBROS POR WHATSAPP
# ──────────────────────────────────────────────────────────────────────────────

def _sede_del_representante(cedula):
    """Devuelve la sede (id) de cualquier alumno activo de ese representante,
    o None si no se encuentra -- usada para aplicar filtrar_por_sede sobre un
    representante puntual (los endpoints de cobro trabajan por representante,
    no por alumno)."""
    from secretaria.models import Alumno
    alumno = Alumno.objects.filter(
        representante__cedula=cedula, activo=True,
    ).values_list('sede', flat=True).first()
    return alumno


def _grupo_moroso_de(request, representante_cedula):
    """Busca al representante entre los morosos agrupados, respetando
    filtrar_por_sede. Devuelve el dict del grupo o None si no está en mora
    o no es accesible para el usuario (otra sede)."""
    from datetime import date
    from cobranza.views import ListaMorososView
    from .cobro_whatsapp import agrupar_morosos_por_representante

    hoy = date.today()
    qs = ListaMorososView._build_qs(hoy, buscar=representante_cedula, user=request.user)
    grupos = agrupar_morosos_por_representante(qs, hoy)
    for g in grupos:
        if g['representante_cedula'] == representante_cedula:
            return g
    return None


class PlantillasWhatsAppView(APIView):
    permission_classes = [permissions.IsAuthenticated, EsPersonalCobranza]

    @staticmethod
    def _serializar(p):
        return {
            'id': p.id, 'nombre': p.nombre, 'tipo': p.tipo, 'cuerpo': p.cuerpo,
            'predeterminada': p.predeterminada, 'activa': p.activa,
            'nombre_plantilla_meta': p.nombre_plantilla_meta,
            'idioma_meta': p.idioma_meta, 'orden_parametros_meta': p.orden_parametros_meta,
            'creada_en': p.creada_en, 'actualizada_en': p.actualizada_en,
        }

    def get(self, request):
        from .models import PlantillaWhatsApp
        plantillas = PlantillaWhatsApp.objects.all()
        return Response([self._serializar(p) for p in plantillas])

    def post(self, request):
        from .models import PlantillaWhatsApp
        nombre = (request.data.get('nombre') or '').strip()
        cuerpo = (request.data.get('cuerpo') or '').strip()
        if not nombre or not cuerpo:
            return Response({'error': 'nombre y cuerpo son requeridos.'}, status=400)
        plantilla = PlantillaWhatsApp.objects.create(
            nombre=nombre,
            tipo=request.data.get('tipo', 'personalizada'),
            cuerpo=cuerpo,
            predeterminada=bool(request.data.get('predeterminada', False)),
            activa=bool(request.data.get('activa', True)),
            nombre_plantilla_meta=request.data.get('nombre_plantilla_meta', ''),
            idioma_meta=request.data.get('idioma_meta', 'es'),
            orden_parametros_meta=request.data.get('orden_parametros_meta', []),
        )
        return Response(self._serializar(plantilla), status=status.HTTP_201_CREATED)


class PlantillaWhatsAppDetailView(APIView):
    permission_classes = [permissions.IsAuthenticated, EsPersonalCobranza]

    def _get(self, pk):
        from .models import PlantillaWhatsApp
        return PlantillaWhatsApp.objects.filter(pk=pk).first()

    def get(self, request, pk):
        plantilla = self._get(pk)
        if not plantilla:
            return Response({'error': 'Plantilla no encontrada.'}, status=404)
        return Response(PlantillasWhatsAppView._serializar(plantilla))

    def patch(self, request, pk):
        plantilla = self._get(pk)
        if not plantilla:
            return Response({'error': 'Plantilla no encontrada.'}, status=404)
        campos = ['nombre', 'tipo', 'cuerpo', 'predeterminada', 'activa',
                  'nombre_plantilla_meta', 'idioma_meta', 'orden_parametros_meta']
        for campo in campos:
            if campo in request.data:
                setattr(plantilla, campo, request.data[campo])
        if not (plantilla.nombre or '').strip() or not (plantilla.cuerpo or '').strip():
            return Response({'error': 'nombre y cuerpo no pueden quedar vacíos.'}, status=400)
        plantilla.save()
        return Response(PlantillasWhatsAppView._serializar(plantilla))

    def delete(self, request, pk):
        plantilla = self._get(pk)
        if not plantilla:
            return Response({'error': 'Plantilla no encontrada.'}, status=404)
        plantilla.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class VariablesPlantillaWhatsAppView(APIView):
    permission_classes = [permissions.IsAuthenticated, EsPersonalCobranza]

    def get(self, request):
        from .cobro_whatsapp import TOKENS_DISPONIBLES
        return Response(TOKENS_DISPONIBLES)


class PrevisualizarCobroWhatsAppView(APIView):
    permission_classes = [permissions.IsAuthenticated, EsPersonalCobranza]

    def post(self, request):
        from .models import PlantillaWhatsApp
        from .services import _normalizar_telefono
        from .cobro_whatsapp import renderizar_mensaje_cobro, hubo_envio_reciente, ultimo_envio

        cedula = (request.data.get('representante_cedula') or '').strip()
        plantilla_id = request.data.get('plantilla_id')
        if not cedula or not plantilla_id:
            return Response({'error': 'representante_cedula y plantilla_id son requeridos.'}, status=400)

        plantilla = PlantillaWhatsApp.objects.filter(pk=plantilla_id).first()
        if not plantilla:
            return Response({'error': 'Plantilla no encontrada.'}, status=404)

        grupo = _grupo_moroso_de(request, cedula)
        if not grupo:
            return Response(
                {'error': 'El representante no tiene deuda registrada o no es accesible para su sede.'},
                status=404,
            )

        mensaje = renderizar_mensaje_cobro(grupo, plantilla)
        telefono = _normalizar_telefono(grupo['representante_telefono'])
        log = ultimo_envio(cedula)

        return Response({
            'mensaje': mensaje,
            'telefono': telefono,
            'telefono_valido': bool(telefono),
            'monto_total': str(grupo['monto_total']),
            'meses_total': grupo['meses_total'],
            'dias_atraso_max': grupo['dias_atraso_max'],
            'alumnos': [
                {
                    'nombre': a['nombre'],
                    'monto_adeudado': str(a['monto_adeudado']),
                    'meses_adeudados': a['meses_adeudados'],
                    'dias_atraso': a['dias_atraso'],
                }
                for a in grupo['alumnos']
            ],
            'envio_reciente': hubo_envio_reciente(cedula),
            'ultimo_envio_fecha': log.fecha_envio if log else None,
        })


class RegistrarEnvioManualCobroWhatsAppView(APIView):
    permission_classes = [permissions.IsAuthenticated, EsPersonalCobranza]

    def post(self, request):
        from .models import NotificacionLog
        from .services import _normalizar_telefono
        from .cobro_whatsapp import hubo_envio_reciente

        cedula = (request.data.get('representante_cedula') or '').strip()
        mensaje = (request.data.get('mensaje') or '').strip()
        confirmar = bool(request.data.get('confirmar', False))
        if not cedula or not mensaje:
            return Response({'error': 'representante_cedula y mensaje son requeridos.'}, status=400)

        grupo = _grupo_moroso_de(request, cedula)
        if not grupo:
            return Response(
                {'error': 'El representante no tiene deuda registrada o no es accesible para su sede.'},
                status=404,
            )
        telefono = _normalizar_telefono(grupo['representante_telefono'])
        if not telefono:
            return Response({'error': 'El representante no tiene un teléfono válido registrado.'}, status=400)

        if hubo_envio_reciente(cedula) and not confirmar:
            return Response(
                {'error': 'Ya se envió un cobro a este representante en las últimas 24 horas.',
                 'requiere_confirmacion': True},
                status=409,
            )

        log = NotificacionLog.objects.create(
            canal='whatsapp', tipo='cobro_whatsapp', modo='manual', estado='enviado',
            destinatario=telefono, mensaje=mensaje[:500],
            representante_cedula=cedula,
            alumno_nombre=', '.join(a['nombre'] for a in grupo['alumnos']),
            proveedor='wa.me',
        )
        return Response({'id': log.id, 'fecha_envio': log.fecha_envio}, status=status.HTTP_201_CREATED)


class EnviarCobroWhatsAppView(APIView):
    """Modo B: envío automático vía API con plantilla aprobada por Meta.
    Solo funciona si WhatsApp está activo en la configuración Y la plantilla
    elegida tiene `nombre_plantilla_meta` cargado -- si no, el frontend debe
    usar el envío manual (RegistrarEnvioManualCobroWhatsAppView)."""
    permission_classes = [permissions.IsAuthenticated, EsPersonalCobranza]

    def post(self, request):
        from .models import PlantillaWhatsApp, ConfiguracionNotificaciones, NotificacionLog
        from .services import enviar_whatsapp
        from .cobro_whatsapp import renderizar_mensaje_cobro, hubo_envio_reciente

        cedula = (request.data.get('representante_cedula') or '').strip()
        plantilla_id = request.data.get('plantilla_id')
        confirmar = bool(request.data.get('confirmar', False))
        if not cedula or not plantilla_id:
            return Response({'error': 'representante_cedula y plantilla_id son requeridos.'}, status=400)

        cfg = ConfiguracionNotificaciones.objects.filter(pk=1).first()
        if not (cfg and cfg.whatsapp_activo):
            return Response(
                {'error': 'WhatsApp automático no está activo. Use el envío manual (enlace wa.me).'},
                status=400,
            )
        plantilla = PlantillaWhatsApp.objects.filter(pk=plantilla_id).first()
        if not plantilla:
            return Response({'error': 'Plantilla no encontrada.'}, status=404)
        if not plantilla.nombre_plantilla_meta:
            return Response(
                {'error': 'Esta plantilla no tiene una plantilla de Meta aprobada asociada. '
                          'Use el envío manual (enlace wa.me).'},
                status=400,
            )

        grupo = _grupo_moroso_de(request, cedula)
        if not grupo:
            return Response(
                {'error': 'El representante no tiene deuda registrada o no es accesible para su sede.'},
                status=404,
            )
        if hubo_envio_reciente(cedula) and not confirmar:
            return Response(
                {'error': 'Ya se envió un cobro a este representante en las últimas 24 horas.',
                 'requiere_confirmacion': True},
                status=409,
            )

        mensaje = renderizar_mensaje_cobro(grupo, plantilla)
        ok = enviar_whatsapp(
            grupo['representante_telefono'], mensaje, tipo='cobro_whatsapp',
            representante_cedula=cedula,
            alumno_nombre=', '.join(a['nombre'] for a in grupo['alumnos']),
            template_data={
                'nombre': plantilla.nombre_plantilla_meta,
                'idioma': plantilla.idioma_meta,
                'parametros': [grupo['representante_nombre'], str(grupo['monto_total'])],
            },
        )
        if not ok:
            return Response({'error': 'No se pudo enviar el mensaje. Revise la configuración de WhatsApp.'},
                             status=502)

        log = NotificacionLog.objects.filter(
            canal='whatsapp', tipo='cobro_whatsapp', representante_cedula=cedula,
        ).order_by('-fecha_envio').first()
        if log:
            log.modo = 'automatico'
            log.save(update_fields=['modo'])
        return Response({'id': log.id if log else None, 'estado': 'enviado'})
