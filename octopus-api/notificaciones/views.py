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
    # Webhook de Meta (conversaciones de Cobranza Inteligente)
    'meta_app_secret', 'meta_webhook_verify_token', 'meta_waba_id',
]
CAMPOS_MORA = [
    'dias_recordatorio_1', 'dias_recordatorio_2', 'dias_alerta_director',
]
CAMPOS_SECRETOS = {'email_host_password', 'twilio_auth_token', 'meta_whatsapp_token', 'meta_app_secret'}
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
            sede_id = request.data.get('sede_id') or None
            if sede_id is not None:
                try:
                    sede_id = int(sede_id)
                except (TypeError, ValueError):
                    return Response({'error': 'sede_id inválido.'}, status=400)
                if not _sede_permitida(request.user, sede_id):
                    return Response({'error': 'Sin permiso para esa sede.'}, status=403)
            ok = enviar_whatsapp(destino, mensaje, tipo='prueba', sede=sede_id)
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

        cambiados = []
        for campo, valor in datos.items():
            if campo not in campos_permitidos:
                continue
            # Ignorar placeholders: '***' (formato viejo) y '••••xxxx' (formato nuevo)
            if campo in CAMPOS_SECRETOS and (valor == '***' or str(valor).startswith('••••')):
                continue
            setattr(cfg, campo, valor)
            cambiados.append(campo)
        cfg.save()
        if any(c in CAMPOS_WA for c in cambiados):
            _auditar(request, 'Actualizó la configuración general de WhatsApp', {'campos': cambiados})
        return Response(_cfg_to_dict(cfg))


# ── WhatsApp por sede (docs/CONTRATO_WHATSAPP_POR_SEDE.md) ────────────────────

CAMPOS_WA_SEDE = [
    'activo', 'numero_visible', 'meta_whatsapp_phone_id', 'meta_whatsapp_token',
    'meta_waba_id', 'meta_app_secret', 'meta_webhook_verify_token',
]
CAMPOS_SECRETOS_WA_SEDE = {'meta_whatsapp_token', 'meta_app_secret'}


def _auditar(request, accion, detalles):
    """LogAuditoria sin valores: solo nombres de campos y ids (nunca secretos)."""
    from usuarios.models import crear_log
    try:
        crear_log(request.user, accion, 'notificaciones', detalles,
                  ip=request.META.get('REMOTE_ADDR'))
    except Exception:
        logger.exception('No se pudo registrar la auditoría: %s', accion)


def _sede_permitida(user, sede_id):
    from cobranza.permissions import sedes_permitidas_ids
    permitidas = sedes_permitidas_ids(user)
    return permitidas is None or int(sede_id) in permitidas


def _sedes_del_usuario(user):
    from multisede.models import Sede
    from cobranza.permissions import sedes_permitidas_ids
    qs = Sede.objects.filter(activa=True)
    permitidas = sedes_permitidas_ids(user)
    return qs if permitidas is None else qs.filter(pk__in=permitidas)


def _wa_sede_to_dict(sede, fila):
    """Config de una sede para la API: secretos enmascarados y qué número usa en la práctica."""
    from .config_whatsapp import get_config_whatsapp
    data = {c: getattr(fila, c) if fila else ('' if c != 'activo' else False) for c in CAMPOS_WA_SEDE}
    _ocultar_secretos(data, CAMPOS_SECRETOS_WA_SEDE)
    efectiva = get_config_whatsapp(sede.pk)
    return {
        'sede': {'id': sede.pk, 'nombre': sede.nombre},
        **data,
        'usa_configuracion_general': efectiva.origen != 'sede',
        'efectiva': {'origen': efectiva.origen, 'phone_id': efectiva.phone_id,
                     'numero_visible': efectiva.numero_visible, 'proveedor': efectiva.proveedor},
    }


class WhatsAppSedesView(APIView):
    """GET: una entrada por sede accesible (config propia enmascarada o "usa la general")."""
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        if not _check_rol(request):
            return Response({'error': 'Sin permiso.'}, status=403)
        from .models import ConfiguracionWhatsAppSede
        sedes = list(_sedes_del_usuario(request.user))
        filas = {f.sede_id: f for f in ConfiguracionWhatsAppSede.objects.filter(
            sede__in=[s.pk for s in sedes])}
        return Response({'results': [_wa_sede_to_dict(s, filas.get(s.pk)) for s in sedes]})


class WhatsAppSedeDetailView(APIView):
    """GET/PATCH/DELETE de la config de WhatsApp de UNA sede. DELETE = volver a la general."""
    permission_classes = [permissions.IsAuthenticated]

    def _contexto(self, request, sede_id):
        """(sede, fila, error_response)."""
        if not _check_rol(request):
            return None, None, Response({'error': 'Sin permiso.'}, status=403)
        from multisede.models import Sede
        from .models import ConfiguracionWhatsAppSede
        sede = Sede.objects.filter(pk=sede_id, activa=True).first()
        # Sede de otra persona = 404 (no se revela que existe).
        if sede is None or not _sede_permitida(request.user, sede.pk):
            return None, None, Response({'error': 'Sede no encontrada.'}, status=404)
        return sede, ConfiguracionWhatsAppSede.objects.filter(sede=sede).first(), None

    def get(self, request, sede_id):
        sede, fila, error = self._contexto(request, sede_id)
        return error or Response(_wa_sede_to_dict(sede, fila))

    def patch(self, request, sede_id):
        sede, fila, error = self._contexto(request, sede_id)
        if error:
            return error
        from .models import ConfiguracionWhatsAppSede
        from .config_whatsapp import get_config_whatsapp
        fila = fila or ConfiguracionWhatsAppSede(sede=sede)
        nuevos = {}
        for campo, valor in request.data.items():
            if campo not in CAMPOS_WA_SEDE:
                continue
            if campo in CAMPOS_SECRETOS_WA_SEDE and (valor == '***' or str(valor).startswith('••••')):
                continue   # placeholder devuelto por la API: no es un cambio
            nuevos[campo] = bool(valor) if campo == 'activo' else str(valor or '').strip()
        pid = nuevos.get('meta_whatsapp_phone_id')
        if pid:
            if not pid.isdigit() or len(pid) > 50:
                return Response({'error': 'El Phone Number ID debe contener solo dígitos (máx. 50).'}, status=400)
            repetido = ConfiguracionWhatsAppSede.objects.filter(meta_whatsapp_phone_id=pid).exclude(
                sede=sede).exists() or get_config_whatsapp(None).phone_id == pid
            if repetido:
                return Response({'error': 'Ese Phone Number ID ya lo usa otra sede o la configuración general.'},
                                status=400)
        for campo, valor in nuevos.items():
            setattr(fila, campo, valor)
        if fila.activo and not (fila.meta_whatsapp_token and fila.meta_whatsapp_phone_id):
            return Response(
                {'error': 'Para activar el número propio de la sede se requieren el token y el Phone Number ID.'},
                status=400)
        fila.save()
        _auditar(request, 'Actualizó la configuración de WhatsApp de una sede', {
            'sede_id': sede.pk, 'campos': sorted(nuevos),
            'secretos_modificados': sorted(c for c in nuevos if c in CAMPOS_SECRETOS_WA_SEDE),
            'activo': fila.activo})
        return Response(_wa_sede_to_dict(sede, fila))

    def delete(self, request, sede_id):
        sede, fila, error = self._contexto(request, sede_id)
        if error:
            return error
        if fila is not None:
            fila.delete()
            _auditar(request, 'Quitó la configuración de WhatsApp de una sede (vuelve a la general)',
                     {'sede_id': sede.pk})
        return Response(_wa_sede_to_dict(sede, None))


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


def _control_cobro(cedula):
    """
    Cobranza Inteligente (v4 §1.8): (representante, activo). `activo` es True
    solo si alguna sede del representante tiene el toggle encendido; con el
    toggle apagado todo el cobro manual funciona exactamente como antes.
    """
    from secretaria.models import Representante
    from cobranza.control_envios import inteligente_activa_para_representante
    rep = Representante.objects.filter(cedula=cedula).first()
    return rep, bool(rep and inteligente_activa_para_representante(rep))


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

        control = None
        rep, activo = _control_cobro(cedula)
        if activo:
            from cobranza.control_envios import ORIGEN_MANUAL_API, ORIGEN_MANUAL_WAME, puede_enviar_cobro
            control = {
                'activo': True,
                # Modo A (wa.me): solo avisos; Modo B (API): puede haber bloqueos.
                'modo_a': puede_enviar_cobro(rep, 'whatsapp', ORIGEN_MANUAL_WAME).as_dict(),
                'modo_b': puede_enviar_cobro(rep, 'whatsapp', ORIGEN_MANUAL_API).as_dict(),
            }

        respuesta = {
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
        }
        if control is not None:
            respuesta['control'] = control
        return Response(respuesta)


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
        # Cobranza Inteligente encendida: el cobro queda en el historial del
        # ciclo y cuenta para el tope semanal (§1.8). Apagada: nada cambia.
        rep, activo = _control_cobro(cedula)
        if activo:
            from cobranza.control_envios import ORIGEN_MANUAL_WAME, registrar_cobro
            registrar_cobro(rep, 'whatsapp', ORIGEN_MANUAL_WAME, request.user, mensaje)
        return Response({'id': log.id, 'fecha_envio': log.fecha_envio}, status=status.HTTP_201_CREATED)


class EnviarCobroWhatsAppView(APIView):
    """Modo B: envío automático vía API con plantilla aprobada por Meta.
    Solo funciona si WhatsApp está activo en la configuración Y la plantilla
    elegida tiene `nombre_plantilla_meta` cargado -- si no, el frontend debe
    usar el envío manual (RegistrarEnvioManualCobroWhatsAppView)."""
    permission_classes = [permissions.IsAuthenticated, EsPersonalCobranza]

    def post(self, request):
        from .models import PlantillaWhatsApp, NotificacionLog
        from .services import enviar_whatsapp
        from .cobro_whatsapp import renderizar_mensaje_cobro, hubo_envio_reciente

        cedula = (request.data.get('representante_cedula') or '').strip()
        plantilla_id = request.data.get('plantilla_id')
        confirmar = bool(request.data.get('confirmar', False))
        if not cedula or not plantilla_id:
            return Response({'error': 'representante_cedula y plantilla_id son requeridos.'}, status=400)

        from .config_whatsapp import get_config_whatsapp, sede_id_de_representante
        from secretaria.models import Representante
        sede_id = sede_id_de_representante(Representante.objects.filter(cedula=cedula).first())
        if not get_config_whatsapp(sede_id).activo:
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
        # Cobranza Inteligente encendida: mismas verificaciones que el motor (§1.8).
        rep, activo = _control_cobro(cedula)
        if activo:
            from cobranza.control_envios import ORIGEN_MANUAL_API, puede_enviar_cobro
            veredicto = puede_enviar_cobro(rep, 'whatsapp', ORIGEN_MANUAL_API)
            if not veredicto.permitido:
                return Response(
                    {'error': veredicto.bloqueos[0]['mensaje'], 'bloqueado': True,
                     'motivo': veredicto.bloqueos[0]['codigo'], 'bloqueos': veredicto.bloqueos},
                    status=400,
                )
            if veredicto.avisos and not confirmar:
                return Response(
                    {'error': veredicto.avisos[0]['mensaje'], 'requiere_confirmacion': True,
                     'avisos': veredicto.avisos},
                    status=409,
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
            sede=sede_id,
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
        if activo:
            from cobranza.control_envios import registrar_cobro
            registrar_cobro(rep, 'whatsapp', ORIGEN_MANUAL_API, request.user, mensaje)
        return Response({'id': log.id if log else None, 'estado': 'enviado'})


class SuscripcionPushUsuarioView(APIView):
    """Web Push de usuarios del panel (administrativos y docentes), con el JWT
    del panel. GET: estado de la cuenta + clave pública VAPID. POST: crea o
    reactiva la suscripción del `endpoint` (unico: si el navegador cambia de
    cuenta queda reasignado). DELETE: desactiva (soft) ese endpoint."""
    permission_classes = [permissions.IsAuthenticated]

    TIPOS_VALIDOS = {'mensaje', 'comprobante'}

    def get(self, request):
        from django.conf import settings
        from .models import SuscripcionPushUsuario
        s = SuscripcionPushUsuario.objects.filter(
            usuario=request.user, activa=True).order_by('-fecha_registro').first()
        return Response({
            'activa': bool(s),
            'tipos_activos': s.tipos_activos if s else [],
            'vapid_public_key': settings.VAPID_PUBLIC_KEY,
        })

    def post(self, request):
        from .models import SuscripcionPushUsuario, _tipos_push_usuario_default
        endpoint = (request.data.get('endpoint') or '').strip()
        keys = request.data.get('keys') or {}
        p256dh, auth = keys.get('p256dh'), keys.get('auth')
        if not endpoint or not p256dh or not auth:
            return Response({'error': 'Suscripción inválida: faltan endpoint o keys.'},
                            status=status.HTTP_400_BAD_REQUEST)
        tipos = request.data.get('tipos') or _tipos_push_usuario_default()
        if not isinstance(tipos, list) or not set(tipos).issubset(self.TIPOS_VALIDOS):
            return Response({'error': f'`tipos` debe estar dentro de {sorted(self.TIPOS_VALIDOS)}.'},
                            status=status.HTTP_400_BAD_REQUEST)
        s, _ = SuscripcionPushUsuario.objects.update_or_create(
            endpoint=endpoint,
            defaults={'usuario': request.user, 'p256dh': p256dh, 'auth': auth,
                      'activa': True, 'tipos_activos': tipos},
        )
        return Response({'id': s.id, 'activa': s.activa, 'tipos_activos': s.tipos_activos},
                        status=status.HTTP_201_CREATED)

    def delete(self, request):
        from .models import SuscripcionPushUsuario
        endpoint = (request.data.get('endpoint') or '').strip()
        if not endpoint:
            return Response({'error': 'Falta endpoint.'}, status=status.HTTP_400_BAD_REQUEST)
        if not SuscripcionPushUsuario.objects.filter(
                endpoint=endpoint, usuario=request.user).update(activa=False):
            return Response({'error': 'Suscripción no encontrada.'}, status=status.HTTP_404_NOT_FOUND)
        return Response(status=status.HTTP_204_NO_CONTENT)
