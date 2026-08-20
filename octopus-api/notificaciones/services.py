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


def enviar_whatsapp(telefono, mensaje, tipo='otro', representante_cedula='', alumno_nombre=''):
    """Envia WhatsApp segun proveedor configurado en BD o fallback a settings."""
    numero = _normalizar_telefono(telefono)
    if not numero:
        return False
    cfg = _notif_cfg()
    proveedor = (cfg.whatsapp_proveedor if (cfg and cfg.whatsapp_activo) else None) \
        or getattr(settings, 'WHATSAPP_PROVIDER', '')
    proveedor = (proveedor or '').lower()
    if proveedor == 'twilio':
        return _wa_twilio(numero, mensaje, tipo, representante_cedula, alumno_nombre)
    elif proveedor == 'meta':
        return _wa_meta(numero, mensaje, tipo, representante_cedula, alumno_nombre)
    else:
        _log('whatsapp', tipo, numero, '', mensaje, 'pendiente',
             error='WHATSAPP_PROVIDER no configurado',
             representante_cedula=representante_cedula, alumno_nombre=alumno_nombre, proveedor='ninguno')
        return False


def _wa_twilio(numero, mensaje, tipo, representante_cedula, alumno_nombre):
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


def _wa_meta(numero, mensaje, tipo, representante_cedula, alumno_nombre):
    cfg      = _notif_cfg()
    token    = (cfg.meta_whatsapp_token    if cfg else '') or getattr(settings, 'META_WHATSAPP_TOKEN', '')
    phone_id = (cfg.meta_whatsapp_phone_id if cfg else '') or getattr(settings, 'META_WHATSAPP_PHONE_ID', '')
    if not all([token, phone_id]):
        _log('whatsapp', tipo, numero, '', mensaje, 'fallido',
             error='Credenciales Meta no configuradas',
             representante_cedula=representante_cedula, alumno_nombre=alumno_nombre, proveedor='meta')
        logger.warning('Meta WhatsApp: faltan META_WHATSAPP_TOKEN o META_WHATSAPP_PHONE_ID')
        return False
    try:
        import requests as req
        resp = req.post(
            f'https://graph.facebook.com/v19.0/{phone_id}/messages',
            headers={'Authorization': f'Bearer {token}', 'Content-Type': 'application/json'},
            json={
                'messaging_product': 'whatsapp',
                'to': numero.lstrip('+'),
                'type': 'text',
                'text': {'body': mensaje},
            },
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
            data=json.dumps({'title': titulo, 'body': cuerpo, 'url': url}),
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
    }

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
            f'*${mensualidad.monto_usd} USD* para {alumno.nombre} '
            f'({mensualidad.get_mes_display()} {mensualidad.anio}).\n\n'
            f'Ingrese al portal: {cfg["portal_url"]}'
        ),
        'mora_dia_10': (
            f'Segundo aviso -- Pago vencido\n\n'
            f'Estimado/a {rep.nombre}, la mensualidad de {alumno.nombre} '
            f'tiene *{dias_mora} dias de mora*.\n\n'
            f'Monto: *${mensualidad.monto_usd} USD*\n\n'
            f'Por favor regularice a la brevedad.'
        ),
        'mora_dia_15': (
            f'Alerta morosidad -- Director\n\n'
            f'Representante: {rep.nombre} {rep.apellido}\n'
            f'CI: {rep.cedula} | Tel: {rep.telefono}\n'
            f'Alumno: {alumno.nombre} {alumno.apellido} | Grado: {alumno.grado_seccion}\n'
            f'Mora: {dias_mora} dias | Monto: ${mensualidad.monto_usd} USD'
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
                f'{ctx["nombre_alumno"]} -- {ctx["mes_nombre"]} {ctx["anio"]} -- ${ctx["monto_usd"]} USD',
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
    elif mensaje.destinatario_docente and mensaje.destinatario_docente.email:
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
    }
    html = _render_email('pago_exitoso.html', ctx)

    adjuntos = None
    try:
        from cobranza.utils_pdf import generar_recibo_pdf
        pdf_bytes = bytes(generar_recibo_pdf(pago))
        adjuntos = [(f'recibo_pago_{pago.id}.pdf', pdf_bytes, 'application/pdf')]
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
            f'Hola {rep.nombre}, su pago de *${mensualidad.monto_usd} USD* '
            f'para {alumno.nombre} ({mensualidad.get_mes_display()} {mensualidad.anio}) fue procesado.\n'
            f'Ref: {ctx["referencia"]}'
        )
        enviar_whatsapp(rep.telefono, msg, tipo='pago_exitoso',
                        representante_cedula=rep.cedula)

    usuario_portal = _usuario_portal_de(rep)
    if usuario_portal:
        _push_representante(
            usuario_portal, 'factura', 'Pago confirmado',
            f'{ctx["nombre_alumno"]} -- {ctx["mes_nombre"]} {ctx["anio"]} -- ${ctx["monto_usd"]} USD',
            url='/portal/historial', tipo_log='pago_exitoso',
            representante_cedula=rep.cedula, alumno_nombre=ctx['nombre_alumno'],
        )
