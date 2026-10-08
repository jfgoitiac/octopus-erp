"""
Servicio centralizado de notificaciones Octopus.
Las credenciales se leen desde ConfiguracionNotificaciones (BD), con fallback a variables de entorno.
"""
import logging
from django.conf import settings

logger = logging.getLogger(__name__)


def _notif_cfg():
    """Retorna ConfiguracionNotificaciones singleton o None si no existe aún."""
    try:
        from .models import ConfiguracionNotificaciones
        return ConfiguracionNotificaciones.objects.filter(pk=1).first()
    except Exception:
        return None


def _perfil_email(area):
    """Retorna PerfilEmailRemitente del área, o None si no existe."""
    try:
        from .models import PerfilEmailRemitente
        return PerfilEmailRemitente.objects.filter(area=area).first()
    except Exception:
        return None


def _log(canal, tipo, destinatario, asunto, mensaje, estado, error='',
         representante_cedula='', alumno_nombre='', proveedor=''):
    try:
        from .models import NotificacionLog
        NotificacionLog.objects.create(
            canal=canal, tipo=tipo, destinatario=destinatario,
            asunto=asunto, mensaje=mensaje[:500], estado=estado,
            error_detalle=error[:1000], representante_cedula=representante_cedula,
            alumno_nombre=alumno_nombre, proveedor=proveedor,
        )
    except Exception as e:
        logger.warning(f'No se pudo guardar log de notificacion: {e}')


def _config_colegio():
    try:
        from secretaria.models import ConfiguracionSistema
        cfg = ConfiguracionSistema.objects.first()
        if cfg:
            return {
                'nombre_colegio': cfg.nombre_colegio or 'Mi Colegio',
                'color_primario': getattr(cfg, 'color_primario', '#0fa3b1'),
                'portal_url': getattr(settings, 'FRONTEND_URL', 'http://localhost:5173') + '/portal',
            }
    except Exception:
        pass
    return {
        'nombre_colegio': 'Mi Colegio',
        'color_primario': '#0fa3b1',
        'portal_url': getattr(settings, 'FRONTEND_URL', 'http://localhost:5173') + '/portal',
    }


def montos_ref(monto_usd, tasa_aplicada=None, fecha_pago=None):
    """Monto como REF. en dólares y su equivalente en bolívares, más la nota
    con la fecha de la tasa.

    Sin `tasa_aplicada` (montos por pagar: mora, cobro): tasa BCV vigente, la
    misma que usa caja al cobrar y que muestra el portal. Con `tasa_aplicada`
    y `fecha_pago` (pago ya confirmado): la tasa con la que se cobró, para
    que el monto en Bs. no cambie según el día en que se lea el aviso.
    Sin tasa disponible, monto_bs y nota_tasa quedan vacíos."""
    from decimal import Decimal
    from django.utils import timezone
    from cobranza.models import TasaCambio
    from cobranza.recibo_cobranza import fmt_bs

    monto = Decimal(str(monto_usd or 0))
    datos = {'monto_ref': f'REF. {fmt_bs(monto)}', 'monto_bs': '', 'nota_tasa': ''}
    if tasa_aplicada and fecha_pago:
        valor = Decimal(str(tasa_aplicada))
        fecha = timezone.localtime(fecha_pago).strftime('%d/%m/%Y')
        nota = f'El monto en bolívares corresponde a la tasa del dólar BCV aplicada al pago del día {fecha}'
    else:
        tasa = TasaCambio.objects.order_by('-fecha').first()
        if not tasa:
            return datos
        valor = tasa.valor_bs
        fecha = timezone.localtime(tasa.fecha).strftime('%d/%m/%Y')
        nota = f'El monto en bolívares corresponde a la tasa del dólar BCV del día {fecha}'
    datos['monto_bs'] = f'Bs. {fmt_bs(monto * valor)}'
    datos['nota_tasa'] = f'{nota} (Bs. {fmt_bs(valor)} por dólar).'
    return datos


def _monto_whatsapp(montos):
    """'*REF. 45,00* (Bs. 1.822,50)' para los mensajes de texto de WhatsApp."""
    texto = f"*{montos['monto_ref']}*"
    return f"{texto} ({montos['monto_bs']})" if montos['monto_bs'] else texto


# ── EMAIL ─────────────────────────────────────────────────────────────────────

def enviar_email(destinatario, asunto, html_body, texto_plano='',
                 tipo='otro', representante_cedula='', alumno_nombre='',
                 area='cobranza', adjuntos=None):
    """Envia un email HTML usando el perfil SMTP del área (cobranza,
    control_estudios) o fallback a settings. `adjuntos` es una lista opcional
    de tuplas (nombre_archivo, contenido_bytes, mimetype)."""
    if not destinatario:
        return False
    try:
        from django.core.mail import EmailMultiAlternatives, get_connection
        perfil = _perfil_email(area)
        if perfil and perfil.email_activo and perfil.email_host_user:
            port = int(perfil.email_port or 587)
            use_ssl = port == 465
            conn = get_connection(
                backend='django.core.mail.backends.smtp.EmailBackend',
                host=perfil.email_host or 'smtp.gmail.com',
                port=port,
                username=perfil.email_host_user,
                password=perfil.email_host_password,
                use_tls=perfil.email_use_tls and not use_ssl,
                use_ssl=use_ssl,
                fail_silently=False,
            )
            from_email = perfil.email_from or perfil.email_host_user
        else:
            conn = None
            from_email = getattr(settings, 'DEFAULT_FROM_EMAIL', 'noreply@octopus.edu.ve')

        kwargs = dict(
            subject=asunto,
            body=texto_plano or _strip_html(html_body),
            from_email=from_email,
            to=[destinatario],
        )
        if conn:
            kwargs['connection'] = conn
        msg = EmailMultiAlternatives(**kwargs)
        msg.attach_alternative(html_body, 'text/html')
        for nombre_archivo, contenido, mimetype in (adjuntos or []):
            msg.attach(nombre_archivo, contenido, mimetype)
        msg.send()
        _log('email', tipo, destinatario, asunto, texto_plano, 'enviado',
             representante_cedula=representante_cedula, alumno_nombre=alumno_nombre, proveedor='smtp')
        logger.info(f'Email [{tipo}] -> {destinatario}')
        return True
    except Exception as e:
        _log('email', tipo, destinatario, asunto, '', 'fallido', error=str(e),
             representante_cedula=representante_cedula, alumno_nombre=alumno_nombre, proveedor='smtp')
        logger.error(f'Error email [{tipo}] -> {destinatario}: {e}')
        return False


def _strip_html(html):
    import re
    return re.sub(r'\s+', ' ', re.sub(r'<[^>]+>', ' ', html)).strip()


def _render_email(template_name, contexto):
    """Renderiza template de email con Django template engine."""
    from django.template.loader import render_to_string
    cfg = _config_colegio()
    return render_to_string(f'notificaciones/{template_name}', {**cfg, **contexto})


# ── WHATSAPP ──────────────────────────────────────────────────────────────────

def _normalizar_telefono(tel):
    import re
    d = re.sub(r'\D', '', str(tel or ''))
    if not d:
        return None
    if d.startswith('04') and len(d) == 11:
        return '+58' + d[1:]
    if d.startswith('58') and len(d) == 12:
        return '+' + d
    if len(d) >= 10:
        return '+' + d
    return None


def _proveedor_whatsapp():
    """'twilio', 'meta' o '' según ConfiguracionNotificaciones (BD) o settings."""
    cfg = _notif_cfg()
    proveedor = (cfg.whatsapp_proveedor if (cfg and cfg.whatsapp_activo) else None) \
        or getattr(settings, 'WHATSAPP_PROVIDER', '')
    return (proveedor or '').lower()


def enviar_whatsapp_documento(telefono, contenido, nombre_archivo, caption, tipo='otro',
                              representante_cedula='', alumno_nombre='', parametros_plantilla=None):
    """Envía un PDF como documento de WhatsApp (solo Meta Cloud API: sube el
    archivo a /media y lo manda por su id; Twilio exigiría una URL pública).

    Si settings.WHATSAPP_PLANTILLA_RECIBO tiene el nombre de una plantilla
    aprobada por Meta (encabezado de tipo DOCUMENTO), se usa esa plantilla con
    `parametros_plantilla` en el cuerpo: es lo que permite escribirle al
    representante fuera de la ventana de 24h. Sin plantilla se manda el
    documento libre, que Meta solo entrega dentro de esa ventana.

    Devuelve True si Meta aceptó el envío; False si el proveedor no es Meta,
    faltan credenciales o falló (el caller puede caer al texto)."""
    numero = _normalizar_telefono(telefono)
    if not numero or _proveedor_whatsapp() != 'meta':
        return False
    cfg      = _notif_cfg()
    token    = (cfg.meta_whatsapp_token    if cfg else '') or getattr(settings, 'META_WHATSAPP_TOKEN', '')
    phone_id = (cfg.meta_whatsapp_phone_id if cfg else '') or getattr(settings, 'META_WHATSAPP_PHONE_ID', '')
    if not all([token, phone_id]):
        return False
    plantilla = getattr(settings, 'WHATSAPP_PLANTILLA_RECIBO', '')
    try:
        import requests as req
        base = f'https://graph.facebook.com/v19.0/{phone_id}'
        auth = {'Authorization': f'Bearer {token}'}
        subida = req.post(
            f'{base}/media', headers=auth,
            data={'messaging_product': 'whatsapp', 'type': 'application/pdf'},
            files={'file': (nombre_archivo, contenido, 'application/pdf')},
            timeout=20,
        )
        subida.raise_for_status()
        documento = {'id': subida.json()['id'], 'filename': nombre_archivo}
        if plantilla:
            componentes = [{'type': 'header', 'parameters': [{'type': 'document', 'document': documento}]}]
            if parametros_plantilla:
                componentes.append({'type': 'body', 'parameters': [
                    {'type': 'text', 'text': str(v)} for v in parametros_plantilla
                ]})
            payload = {
                'messaging_product': 'whatsapp', 'to': numero.lstrip('+'), 'type': 'template',
                'template': {'name': plantilla, 'language': {'code': 'es'}, 'components': componentes},
            }
        else:
            payload = {
                'messaging_product': 'whatsapp', 'to': numero.lstrip('+'), 'type': 'document',
                'document': {**documento, 'caption': caption},
            }
        resp = req.post(f'{base}/messages', headers={**auth, 'Content-Type': 'application/json'},
                        json=payload, timeout=10)
        resp.raise_for_status()
        _log('whatsapp', tipo, numero, '', caption, 'enviado',
             representante_cedula=representante_cedula, alumno_nombre=alumno_nombre, proveedor='meta')
        logger.info(f'WhatsApp Meta documento [{tipo}] -> {numero}')
        return True
    except Exception as e:
        _log('whatsapp', tipo, numero, '', caption, 'fallido', error=str(e),
             representante_cedula=representante_cedula, alumno_nombre=alumno_nombre, proveedor='meta')
        logger.error(f'Error Meta documento -> {numero}: {e}')
        return False


def enviar_whatsapp(telefono, mensaje, tipo='otro', representante_cedula='', alumno_nombre='',
                     template_data=None):
    """Envia WhatsApp segun proveedor configurado en BD o fallback a settings.

    `template_data`, si viene, envia un mensaje de plantilla aprobada por Meta
    (`type: template`) en vez de texto libre -- necesario para iniciar una
    conversacion fuera de la ventana de 24h que exige WhatsApp Business API.
    Forma esperada: {'nombre': str, 'idioma': str, 'parametros': [str, ...]}.
    Si es None (comportamiento por defecto, usado por notificar_mora,
    notificar_bienvenida_portal, notificar_pago_exitoso), se manda texto
    libre exactamente como antes."""
    numero = _normalizar_telefono(telefono)
    if not numero:
        return False
    proveedor = _proveedor_whatsapp()
    if proveedor == 'twilio':
        return _wa_twilio(numero, mensaje, tipo, representante_cedula, alumno_nombre, template_data)
    elif proveedor == 'meta':
        return _wa_meta(numero, mensaje, tipo, representante_cedula, alumno_nombre, template_data)
    else:
        _log('whatsapp', tipo, numero, '', mensaje, 'pendiente',
             error='WHATSAPP_PROVIDER no configurado',
             representante_cedula=representante_cedula, alumno_nombre=alumno_nombre, proveedor='ninguno')
        return False


def _wa_twilio(numero, mensaje, tipo, representante_cedula, alumno_nombre, template_data=None):
    cfg   = _notif_cfg()
    sid   = (cfg.twilio_account_sid   if cfg else '') or getattr(settings, 'TWILIO_ACCOUNT_SID', '')
    token = (cfg.twilio_auth_token    if cfg else '') or getattr(settings, 'TWILIO_AUTH_TOKEN', '')
    from_ = (cfg.twilio_whatsapp_from if cfg else '') or getattr(settings, 'TWILIO_WHATSAPP_FROM', '')
    if not all([sid, token, from_]):
        _log('whatsapp', tipo, numero, '', mensaje, 'fallido',
             error='Credenciales Twilio no configuradas',
             representante_cedula=representante_cedula, alumno_nombre=alumno_nombre, proveedor='twilio')
        logger.warning('Twilio: faltan TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN o TWILIO_WHATSAPP_FROM')
        return False
    try:
        from twilio.rest import Client
        client = Client(sid, token)
        wa_from = from_ if from_.startswith('whatsapp:') else f'whatsapp:{from_}'
        if template_data:
            # Plantilla de contenido aprobada (Twilio Content API): el
            # 'nombre' de template_data se usa como content_sid y los
            # parametros posicionales como content_variables.
            import json
            content_variables = json.dumps(
                {str(i + 1): v for i, v in enumerate(template_data.get('parametros', []))}
            )
            msg = client.messages.create(
                content_sid=template_data['nombre'],
                content_variables=content_variables,
                from_=wa_from, to=f'whatsapp:{numero}',
            )
        else:
            msg = client.messages.create(body=mensaje, from_=wa_from, to=f'whatsapp:{numero}')
        _log('whatsapp', tipo, numero, '', mensaje, 'enviado',
             representante_cedula=representante_cedula, alumno_nombre=alumno_nombre, proveedor='twilio')
        logger.info(f'WhatsApp Twilio [{tipo}] -> {numero} SID={msg.sid}')
        return True
    except ImportError:
        err = 'pip install twilio requerido'
        logger.error(err)
        _log('whatsapp', tipo, numero, '', mensaje, 'fallido', error=err,
             representante_cedula=representante_cedula, alumno_nombre=alumno_nombre, proveedor='twilio')
        return False
    except Exception as e:
        _log('whatsapp', tipo, numero, '', mensaje, 'fallido', error=str(e),
             representante_cedula=representante_cedula, alumno_nombre=alumno_nombre, proveedor='twilio')
        logger.error(f'Error Twilio -> {numero}: {e}')
        return False


def _wa_meta(numero, mensaje, tipo, representante_cedula, alumno_nombre, template_data=None):
    cfg      = _notif_cfg()
    token    = (cfg.meta_whatsapp_token    if cfg else '') or getattr(settings, 'META_WHATSAPP_TOKEN', '')
    phone_id = (cfg.meta_whatsapp_phone_id if cfg else '') or getattr(settings, 'META_WHATSAPP_PHONE_ID', '')
    if not all([token, phone_id]):
        _log('whatsapp', tipo, numero, '', mensaje, 'fallido',
             error='Credenciales Meta no configuradas',
             representante_cedula=representante_cedula, alumno_nombre=alumno_nombre, proveedor='meta')
        logger.warning('Meta WhatsApp: faltan META_WHATSAPP_TOKEN o META_WHATSAPP_PHONE_ID')
        return False
    if template_data:
        payload = {
            'messaging_product': 'whatsapp',
            'to': numero.lstrip('+'),
            'type': 'template',
            'template': {
                'name': template_data['nombre'],
                'language': {'code': template_data.get('idioma', 'es')},
                'components': [{
                    'type': 'body',
                    'parameters': [
                        {'type': 'text', 'text': str(v)}
                        for v in template_data.get('parametros', [])
                    ],
                }] if template_data.get('parametros') else [],
            },
        }
    else:
        payload = {
            'messaging_product': 'whatsapp',
            'to': numero.lstrip('+'),
            'type': 'text',
            'text': {'body': mensaje},
        }
    try:
        import requests as req
        resp = req.post(
            f'https://graph.facebook.com/v19.0/{phone_id}/messages',
            headers={'Authorization': f'Bearer {token}', 'Content-Type': 'application/json'},
            json=payload,
            timeout=10,
        )
        resp.raise_for_status()
        _log('whatsapp', tipo, numero, '', mensaje, 'enviado',
             representante_cedula=representante_cedula, alumno_nombre=alumno_nombre, proveedor='meta')
        logger.info(f'WhatsApp Meta [{tipo}] -> {numero}')
        return True
    except Exception as e:
        _log('whatsapp', tipo, numero, '', mensaje, 'fallido', error=str(e),
             representante_cedula=representante_cedula, alumno_nombre=alumno_nombre, proveedor='meta')
        logger.error(f'Error Meta -> {numero}: {e}')
        return False


# ── WEB PUSH ──────────────────────────────────────────────────────────────────

def _payload_push(titulo, cuerpo, url):
    """JSON que lee public/push-sw.js. `icon` (opcional) es el logo del
    colegio en cuadrado (portal/app_instalable.py); si el colegio no subio
    logo se omite y el Service Worker usa el icono generico."""
    payload = {'title': titulo, 'body': cuerpo, 'url': url}
    try:
        from secretaria.models import ConfiguracionSistema
        from portal.app_instalable import url_icono_app
        icono = url_icono_app(ConfiguracionSistema.objects.first(), 192)
    except Exception:
        logger.warning('No se pudo resolver el icono del colegio para el push', exc_info=True)
        icono = ''
    if icono:
        payload['icon'] = icono
    return payload


def enviar_push(suscripcion, titulo, cuerpo, url='/portal', tipo='otro',
                 representante_cedula='', alumno_nombre=''):
    """Envia una notificacion Web Push a una SuscripcionPush especifica.
    Si el endpoint ya no es valido (404/410), marca la suscripcion como
    inactiva -- mismo criterio de "limpieza" que usa el resto del proyecto
    para canales que fallan de forma permanente."""
    import json
    from django.conf import settings
    if not suscripcion.activa:
        return False
    try:
        from pywebpush import webpush, WebPushException
    except ImportError:
        logger.error('pywebpush no esta instalado')
        return False
    destino = suscripcion.endpoint[:200]
    try:
        webpush(
            subscription_info={
                'endpoint': suscripcion.endpoint,
                'keys': {'p256dh': suscripcion.p256dh, 'auth': suscripcion.auth},
            },
            data=json.dumps(_payload_push(titulo, cuerpo, url)),
            vapid_private_key=settings.VAPID_PRIVATE_KEY,
            vapid_claims={'sub': f'mailto:{settings.VAPID_EMAIL}'},
        )
        _log('push', tipo, destino, titulo, cuerpo, 'enviado',
             representante_cedula=representante_cedula, alumno_nombre=alumno_nombre, proveedor='webpush')
        return True
    except WebPushException as e:
        status_code = getattr(getattr(e, 'response', None), 'status_code', None)
        if status_code in (404, 410):
            suscripcion.activa = False
            suscripcion.save(update_fields=['activa'])
        _log('push', tipo, destino, titulo, cuerpo, 'fallido', error=str(e),
             representante_cedula=representante_cedula, alumno_nombre=alumno_nombre, proveedor='webpush')
        logger.error(f'Error push -> {destino}: {e}')
        return False


def _push_representante(usuario_portal, tipo_push, titulo, cuerpo, url='/portal',
                        tipo_log='otro', representante_cedula='', alumno_nombre=''):
    """Envia push a todas las suscripciones activas del representante que
    tengan `tipo_push` habilitado en `tipos_activos`."""
    from .models import SuscripcionPush
    if not _vapid_configurado():
        return
    suscripciones = SuscripcionPush.objects.filter(usuario_portal=usuario_portal, activa=True)
    for s in suscripciones:
        if tipo_push in (s.tipos_activos or []):
            enviar_push(s, titulo, cuerpo, url=url, tipo=tipo_log,
                       representante_cedula=representante_cedula, alumno_nombre=alumno_nombre)


def push_usuarios(usuarios, tipo_push, titulo, cuerpo, url, tipo_log='otro'):
    """Envia push a las suscripciones activas de usuarios del panel
    (administrativos o docentes) que tengan `tipo_push` habilitado."""
    from .models import SuscripcionPushUsuario
    if not _vapid_configurado():
        return
    for s in SuscripcionPushUsuario.objects.filter(usuario__in=usuarios, activa=True):
        if tipo_push in (s.tipos_activos or []):
            enviar_push(s, titulo, cuerpo, url=url, tipo=tipo_log)


def _vapid_configurado():
    from django.conf import settings
    return bool(settings.VAPID_PRIVATE_KEY and settings.VAPID_PUBLIC_KEY)


def _usuario_portal_de(representante):
    """Devuelve el RepresentanteUser (usuario del portal) de un Representante,
    o None si nunca activo su acceso al portal."""
    try:
        return representante.portal_user
    except Exception:
        return None


# ── NOTIFICACIONES DE NEGOCIO ─────────────────────────────────────────────────

def notificar_mora(mensualidad, dias_mora, tipo):
    alumno = mensualidad.alumno
    rep    = alumno.representante
    cfg    = _config_colegio()

    ctx = {
        'nombre_representante': f'{rep.nombre} {rep.apellido}',
        'nombre_alumno': f'{alumno.nombre} {alumno.apellido}',
        'grado': alumno.grado_seccion or '',
        'mes_nombre': mensualidad.get_mes_display(),
        'anio': mensualidad.anio,
        'monto_usd': str(mensualidad.monto_usd),
        'dias_mora': dias_mora,
        'fecha_limite': f'{alumno.dia_limite_pago or 5} de cada mes',
        'cedula_representante': rep.cedula,
        'telefono_representante': rep.telefono or '',
        'correo_representante': rep.correo or '',
        # REF. + Bs. a la tasa BCV vigente, igual que el portal.
        **montos_ref(mensualidad.monto_usd),
    }
    monto_wa = _monto_whatsapp(ctx)
    nota_wa = f"\n_{ctx['nota_tasa']}_" if ctx['nota_tasa'] else ''

    asuntos = {
        'mora_dia_0':  f'Nueva factura -- {ctx["mes_nombre"]} {ctx["anio"]}',
        'mora_dia_5':  f'Recordatorio de pago -- {ctx["mes_nombre"]} {ctx["anio"]}',
        'mora_dia_10': f'Segundo aviso -- Pago vencido',
        'mora_dia_15': f'Alerta de morosidad -- {ctx["nombre_alumno"]}',
    }
    templates = {
        'mora_dia_0':  'mora_dia_0.html',
        'mora_dia_5':  'mora_dia_5.html',
        'mora_dia_10': 'mora_dia_10.html',
        'mora_dia_15': 'mora_dia_15.html',
    }

    asunto = asuntos.get(tipo, 'Aviso de pago')
    tmpl   = templates.get(tipo, 'mora_dia_5.html')

    cfg_notif  = _notif_cfg()
    dir_email  = (cfg_notif.director_email if cfg_notif else '') or getattr(settings, 'PORTAL_EMAIL_DIRECTOR', '')
    email_dest = dir_email if tipo == 'mora_dia_15' else rep.correo
    if email_dest:
        html = _render_email(tmpl, ctx)
        enviar_email(email_dest, asunto, html, tipo=tipo,
                     representante_cedula=rep.cedula,
                     alumno_nombre=ctx['nombre_alumno'])

    # WhatsApp: dias 5, 10, 15 (no dia 0 para no saturar)
    mensajes_wa = {
        'mora_dia_5':  (
            f'*{cfg["nombre_colegio"]}*\n\n'
            f'Hola {rep.nombre}, tiene una mensualidad pendiente de '
            f'{monto_wa} para {alumno.nombre} '
            f'({mensualidad.get_mes_display()} {mensualidad.anio}).{nota_wa}\n\n'
            f'Ingrese al portal: {cfg["portal_url"]}'
        ),
        'mora_dia_10': (
            f'Segundo aviso -- Pago vencido\n\n'
            f'Estimado/a {rep.nombre}, la mensualidad de {alumno.nombre} '
            f'tiene *{dias_mora} dias de mora*.\n\n'
            f'Monto: {monto_wa}{nota_wa}\n\n'
            f'Por favor regularice a la brevedad.'
        ),
        'mora_dia_15': (
            f'Alerta morosidad -- Director\n\n'
            f'Representante: {rep.nombre} {rep.apellido}\n'
            f'CI: {rep.cedula} | Tel: {rep.telefono}\n'
            f'Alumno: {alumno.nombre} {alumno.apellido} | Grado: {alumno.grado_seccion}\n'
            f'Mora: {dias_mora} dias | Monto: {monto_wa}{nota_wa}'
        ),
    }
    if tipo in mensajes_wa and rep.telefono:
        dir_wa = (cfg_notif.director_whatsapp if cfg_notif else '') or getattr(settings, 'DIRECTOR_WHATSAPP', '')
        tel = (dir_wa or rep.telefono) if tipo == 'mora_dia_15' else rep.telefono
        enviar_whatsapp(tel, mensajes_wa[tipo], tipo=tipo,
                        representante_cedula=rep.cedula,
                        alumno_nombre=ctx['nombre_alumno'])

    # Push: solo dia 5/10 (dia 0 satura, dia 15 va al director que no es
    # usuario del portal).
    if tipo in ('mora_dia_5', 'mora_dia_10'):
        usuario_portal = _usuario_portal_de(rep)
        if usuario_portal:
            _push_representante(
                usuario_portal, 'factura', asuntos.get(tipo, 'Aviso de pago'),
                f'{ctx["nombre_alumno"]} -- {ctx["mes_nombre"]} {ctx["anio"]} -- {ctx["monto_ref"]}',
                url='/portal', tipo_log=tipo,
                representante_cedula=rep.cedula, alumno_nombre=ctx['nombre_alumno'],
            )


def notificar_bienvenida_portal(representante, contrasena_inicial):
    cfg = _config_colegio()
    ctx = {
        'nombre_representante': f'{representante.nombre} {representante.apellido}',
        'cedula': representante.cedula,
        'contrasena_inicial': contrasena_inicial,
    }
    html = _render_email('bienvenida_portal.html', ctx)
    enviar_email(
        representante.correo,
        'Bienvenido/a al Portal de Representantes',
        html,
        tipo='bienvenida',
        representante_cedula=representante.cedula,
    )
    if representante.telefono:
        msg = (
            f'*{cfg["nombre_colegio"]}*\n\n'
            f'Hola {representante.nombre}, su acceso al portal fue activado.\n'
            f'Usuario: {representante.cedula}\n'
            f'Contrasena: {contrasena_inicial}\n\n'
            f'Ingrese en: {cfg["portal_url"]}'
        )
        enviar_whatsapp(representante.telefono, msg, tipo='bienvenida',
                        representante_cedula=representante.cedula)


def notificar_reset_password_portal(representante, uid, token):
    """Envia el link de un solo uso para restablecer la contrasena del portal.
    `uid`/`token` ya vienen generados por la vista (PortalSolicitarResetView)."""
    frontend_url = getattr(settings, 'FRONTEND_URL', 'http://localhost:5173')
    ctx = {
        'nombre_representante': f'{representante.nombre} {representante.apellido}',
        'reset_url': f'{frontend_url}/portal/restablecer-password?uid={uid}&token={token}',
    }
    html = _render_email('reset_password.html', ctx)
    enviar_email(
        representante.correo,
        'Recuperar contraseña — Portal de Representantes',
        html,
        tipo='reset_password',
        representante_cedula=representante.cedula,
    )


def notificar_comprobante_inscripcion(inscripcion):
    """Envia el comprobante de inscripcion (.docx adjunto) al representante,
    desde el perfil de email de Control de Estudios."""
    alumno = inscripcion.alumno
    rep    = alumno.representante
    if not rep.correo:
        return
    cfg = _config_colegio()
    ctx = {
        'nombre_representante': f'{rep.nombre} {rep.apellido}',
        'nombre_alumno': f'{alumno.nombre} {alumno.apellido}',
        'periodo_escolar': inscripcion.periodo_escolar,
        'grado_seccion': inscripcion.grado_seccion,
    }
    html = _render_email('comprobante_inscripcion.html', ctx)

    adjuntos = []
    try:
        from secretaria.utils_preinscripcion import generar_planilla_preinscripcion, nombre_archivo_alumno
        buffer = generar_planilla_preinscripcion(alumno, inscripcion, campos_seleccionados=None)
        adjuntos.append((
            nombre_archivo_alumno(alumno),
            buffer.read(),
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        ))
    except Exception as e:
        logger.warning(f'No se pudo generar el adjunto del comprobante de inscripcion: {e}')

    enviar_email(
        rep.correo,
        f'Comprobante de inscripción -- {ctx["nombre_alumno"]}',
        html,
        tipo='comprobante_inscripcion',
        representante_cedula=rep.cedula,
        alumno_nombre=ctx['nombre_alumno'],
        area='control_estudios',
        adjuntos=adjuntos,
    )


def notificar_circular_nueva(circular):
    """Envía la notificación de una circular nueva a todos los representantes
    para los que ya se creó su LecturaCircular (broadcast completo, ver
    comunicacion/views.py::CircularListCreateView.create -- se crea una
    LecturaCircular por cada RepresentanteUser activo al publicar)."""
    ctx = {
        'titulo': circular.titulo,
        'cuerpo': circular.cuerpo,
        'requiere_confirmacion': circular.requiere_confirmacion,
    }
    html = _render_email('circular_nueva.html', ctx)
    asunto = f'Nueva circular -- {circular.titulo}'

    lecturas = circular.lecturas.select_related('usuario__representante')
    for lectura in lecturas:
        rep = lectura.usuario.representante
        if rep.correo:
            enviar_email(
                rep.correo,
                asunto,
                html,
                tipo='circular',
                representante_cedula=rep.cedula,
                area='control_estudios',
            )
        _push_representante(
            lectura.usuario, 'circular', circular.titulo, circular.cuerpo[:120],
            url='/portal/comunicaciones', tipo_log='circular',
            representante_cedula=rep.cedula,
        )


def notificar_mensaje_directo(mensaje):
    """Notifica al destinatario (docente o representante) de un MensajeDirecto
    nuevo. El destinatario_docente recibe el link al panel admin; el
    destinatario_representante, al portal (ver
    comunicacion/views.py::MensajeDirectoListCreateView.post /
    MensajeDirectoPortalListCreateView.post -- cada mensaje tiene exactamente
    un destinatario de los dos)."""
    cfg = _config_colegio()

    if mensaje.remitente_docente:
        remitente_nombre = mensaje.remitente_docente.username
    elif mensaje.remitente_representante:
        rep = mensaje.remitente_representante.representante
        remitente_nombre = f'{rep.nombre} {rep.apellido}'
    else:
        remitente_nombre = 'Alguien'

    ctx = {
        'remitente_nombre': remitente_nombre,
        'alumno_nombre': f'{mensaje.alumno.nombre} {mensaje.alumno.apellido}',
        'cuerpo': mensaje.cuerpo,
    }
    asunto = f'Nuevo mensaje sobre {ctx["alumno_nombre"]}'

    if mensaje.destinatario_representante:
        rep = mensaje.destinatario_representante.representante
        if rep.correo:
            ctx['enlace'] = f'{cfg["portal_url"]}/mensajes'
            html = _render_email('mensaje_nuevo.html', ctx)
            enviar_email(rep.correo, asunto, html, tipo='mensaje',
                         representante_cedula=rep.cedula,
                         alumno_nombre=ctx['alumno_nombre'],
                         area='control_estudios')
        _push_representante(
            mensaje.destinatario_representante, 'mensaje', asunto, mensaje.cuerpo[:120],
            url='/portal/mensajes', tipo_log='mensaje',
            representante_cedula=rep.cedula, alumno_nombre=ctx['alumno_nombre'],
        )
    elif mensaje.destinatario_docente:
        push_usuarios([mensaje.destinatario_docente], 'mensaje', asunto, mensaje.cuerpo[:120],
                      url='/portal-docente/mensajes', tipo_log='mensaje')
    if not mensaje.destinatario_representante and mensaje.destinatario_docente \
            and mensaje.destinatario_docente.email:
        frontend_url = getattr(settings, 'FRONTEND_URL', 'http://localhost:5173')
        ctx['enlace'] = f'{frontend_url}/mensajes'
        html = _render_email('mensaje_nuevo.html', ctx)
        enviar_email(mensaje.destinatario_docente.email, asunto, html, tipo='mensaje',
                     alumno_nombre=ctx['alumno_nombre'],
                     area='control_estudios')


def notificar_pago_exitoso(mensualidad, pago):
    alumno = mensualidad.alumno
    rep    = alumno.representante
    ctx = {
        'nombre_representante': f'{rep.nombre} {rep.apellido}',
        'nombre_alumno': f'{alumno.nombre} {alumno.apellido}',
        'mes_nombre': mensualidad.get_mes_display(),
        'anio': mensualidad.anio,
        'monto_usd': str(mensualidad.monto_usd),
        'metodo_pago': pago.get_metodo_pago_display(),
        'referencia': pago.referencia or str(pago.id),
        # REF. + Bs. a la tasa con la que se cobró este pago.
        **montos_ref(mensualidad.monto_usd, pago.tasa_aplicada, pago.fecha_pago),
    }
    # Mismo recibo que imprime el panel y descarga el portal (motor único).
    from cobranza.recibo_cobranza import generar_pdf_recibo, nombre_archivo_recibo, numero_recibo
    ctx['numero_recibo'] = numero_recibo(pago)
    html = _render_email('pago_exitoso.html', ctx)

    adjuntos = None
    pdf_bytes = None
    nombre_pdf = nombre_archivo_recibo(pago)
    try:
        pdf_bytes = generar_pdf_recibo(pago).getvalue()
        adjuntos = [(nombre_pdf, pdf_bytes, 'application/pdf')]
    except Exception as e:
        logger.error(f'No se pudo generar el PDF del recibo para el pago #{pago.id}: {e}')

    enviar_email(
        rep.correo,
        f'Pago confirmado -- {mensualidad.get_mes_display()} {mensualidad.anio}',
        html,
        tipo='pago_exitoso',
        representante_cedula=rep.cedula,
        alumno_nombre=ctx['nombre_alumno'],
        adjuntos=adjuntos,
    )
    if rep.telefono:
        msg = (
            f'Pago confirmado\n\n'
            f'Hola {rep.nombre}, su pago de {_monto_whatsapp(ctx)} '
            f'para {alumno.nombre} ({mensualidad.get_mes_display()} {mensualidad.anio}) fue procesado.\n'
            f'Recibo N° {ctx["numero_recibo"]}'
            + (f"\n_{ctx['nota_tasa']}_" if ctx['nota_tasa'] else '')
        )
        # Con Meta se manda el PDF del recibo; si no se puede (otro proveedor
        # o falla del envío), queda el aviso de texto de siempre.
        enviado_pdf = pdf_bytes is not None and enviar_whatsapp_documento(
            rep.telefono, pdf_bytes, nombre_pdf, msg, tipo='pago_exitoso',
            representante_cedula=rep.cedula, alumno_nombre=ctx['nombre_alumno'],
            parametros_plantilla=[rep.nombre, ctx['numero_recibo']],
        )
        if not enviado_pdf:
            enviar_whatsapp(rep.telefono, msg, tipo='pago_exitoso',
                            representante_cedula=rep.cedula)

    usuario_portal = _usuario_portal_de(rep)
    if usuario_portal:
        _push_representante(
            usuario_portal, 'factura', 'Pago confirmado',
            f'{ctx["nombre_alumno"]} -- {ctx["mes_nombre"]} {ctx["anio"]} -- {ctx["monto_ref"]}',
            url='/portal/historial', tipo_log='pago_exitoso',
            representante_cedula=rep.cedula, alumno_nombre=ctx['nombre_alumno'],
        )
