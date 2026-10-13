"""
Endpoints de Conversaciones de Cobranza Inteligente v4 (Fase B), bajo
`/api/cobranza/inteligente/`. Mismos permisos que el resto del módulo y misma
respuesta 409 "apagada" (ver docs/CONTRATO_COBRANZA_V4_FASE_B.md).
"""
import mimetypes

from django.db.models import OuterRef, Q, Subquery
from django.http import FileResponse
from django.utils import timezone
from django.utils.dateparse import parse_datetime
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from authentication.views import EsPersonalCobranza
from cobranza.views_gestion import _apagada, _error, sedes_activas_accesibles
from secretaria.models import Representante

from . import comprobantes_whatsapp as comprobantes
from . import conversaciones as srv
from .models import ConversacionWhatsApp, MensajeWhatsApp, PlantillaWhatsApp, RespuestaRapida

LIMITE_LISTA = 200
LIMITE_HILO = 100
PREVIEW = 140
FILTROS = ('todas', 'no_leidas', 'requieren_humano', 'humano', 'automatico', 'sin_vincular')


# ── Serialización ─────────────────────────────────────────────────────────────

def _usuario(u):
    return {'id': u.id, 'nombre': srv._nombre_usuario(u)} if u else None


def _rep(r):
    return {'id': r.id, 'nombre': f'{r.nombre} {r.apellido}', 'cedula': r.cedula,
            'telefono': r.telefono} if r else None


def _preview(m):
    if m is None:
        return None
    cuerpo = m.cuerpo or {'imagen': '[Imagen]', 'documento': '[Documento]'}.get(m.tipo, '')
    return {'id': m.id, 'direccion': m.direccion, 'tipo': m.tipo, 'cuerpo': cuerpo[:PREVIEW],
            'estado_entrega': m.estado_entrega, 'creado_en': m.creado_en}


def serializar_conversacion(c, ultimo=None, ahora=None):
    return {
        'id': c.id, 'telefono': c.telefono, 'nombre_contacto': c.nombre_contacto,
        'representante': _rep(c.representante), 'sede': c.sede_id, 'estado': c.estado,
        'requiere_humano': c.requiere_humano, 'tomada_por': _usuario(c.tomada_por),
        'tomada_en': c.tomada_en, 'ultimo_entrante_en': c.ultimo_entrante_en,
        'ultimo_saliente_en': c.ultimo_saliente_en, 'ultimo_humano_en': c.ultimo_humano_en,
        'no_leidos': c.no_leidos, 'esperando': c.esperando, 'actualizado_en': c.actualizado_en,
        'ventana': srv.ventana(c, ahora), 'ultimo_mensaje': _preview(ultimo),
    }


def serializar_adjunto(m):
    """Adjunto de un mensaje (None si no tiene). Lo comparten el hilo y la tarjeta de Hoy."""
    if not m.adjunto:
        return None
    return {'id': m.id, 'url': f'/api/cobranza/inteligente/mensajes/{m.id}/archivo/',
            'nombre': m.adjunto.name.rsplit('/', 1)[-1],
            'tipo': mimetypes.guess_type(m.adjunto.name)[0] or '', 'estado': m.estado_adjunto}


def serializar_mensaje(m):
    adjunto = serializar_adjunto(m)
    return {
        'id': m.id, 'direccion': m.direccion, 'tipo': m.tipo, 'cuerpo': m.cuerpo, 'payload': m.payload,
        'estado_entrega': m.estado_entrega, 'adjunto': adjunto, 'estado_adjunto': m.estado_adjunto,
        'enviado_por': _usuario(m.enviado_por), 'envio_cobranza': m.envio_cobranza_id,
        'creado_en': m.creado_en, 'actualizado_en': m.actualizado_en,
    }


def _serializar_respuesta(r):
    return {'id': r.id, 'sede': r.sede_id, 'titulo': r.titulo, 'cuerpo': r.cuerpo,
            'activa': r.activa, 'orden': r.orden}


# ── Utilidades ────────────────────────────────────────────────────────────────

def _desde(request):
    """(instante o None, error o None) del parámetro ?desde=<iso>."""
    bruto = request.query_params.get('desde')
    if not bruto:
        return None, None
    valor = parse_datetime(bruto.replace(' ', '+'))   # un '+' sin escapar llega como espacio
    if valor is None:
        return None, _error('Parámetro `desde` inválido (use ISO 8601).')
    if timezone.is_naive(valor):
        valor = timezone.make_aware(valor)
    return valor, None


class _Base(APIView):
    permission_classes = [permissions.IsAuthenticated, EsPersonalCobranza]

    def sedes(self, request):
        return sedes_activas_accesibles(request.user, request.query_params.get('sede'))

    def conversacion(self, request, conversacion_id, sedes):
        return (ConversacionWhatsApp.objects.filter(srv.q_visibles(sedes), pk=conversacion_id)
                .select_related('representante', 'tomada_por').first())


def _con_ultimos(convs, ahora):
    convs = list(convs)
    ids = Subquery(MensajeWhatsApp.objects.filter(
        conversacion=OuterRef('pk')).exclude(direccion=MensajeWhatsApp.NOTA).order_by('-creado_en', '-id').values('id')[:1])
    ultimos = dict(ConversacionWhatsApp.objects.filter(pk__in=[c.pk for c in convs]).annotate(
        ultimo_id=ids).values_list('pk', 'ultimo_id'))
    mensajes = MensajeWhatsApp.objects.in_bulk([i for i in ultimos.values() if i])
    return [serializar_conversacion(c, mensajes.get(ultimos.get(c.pk)), ahora) for c in convs]


def _responder_envio(accion):
    """Ejecuta un envío y traduce sus errores a respuestas HTTP."""
    try:
        return accion(), None
    except srv.VentanaCerrada as e:
        return None, Response({'detail': str(e), 'ventana_cerrada': True}, status=status.HTTP_400_BAD_REQUEST)
    except srv.ErrorConversacion as e:    # incluye AdjuntoNoResoluble
        return None, _error(str(e))
    except srv.ErrorEnvio as e:
        return None, Response({'detail': str(e)}, status=status.HTTP_502_BAD_GATEWAY)


# ── Conversaciones ────────────────────────────────────────────────────────────

class ConversacionesView(_Base):
    """GET conversaciones/?desde=<iso>&filtro=&q=&sede=&limite="""

    def get(self, request):
        sedes = self.sedes(request)
        if not sedes:
            return _apagada()
        desde, error = _desde(request)
        if error:
            return error
        filtro = request.query_params.get('filtro', 'todas')
        if filtro not in FILTROS:
            return _error(f'Filtro inválido. Use uno de: {", ".join(FILTROS)}.')
        ahora = timezone.now()   # se toma ANTES de consultar: el cliente lo usa como próximo `desde`
        qs = ConversacionWhatsApp.objects.filter(srv.q_visibles(sedes)).select_related(
            'representante', 'tomada_por')
        if desde:
            qs = qs.filter(actualizado_en__gt=desde)
        if filtro == 'no_leidas':
            qs = qs.filter(no_leidos__gt=0)
        elif filtro == 'requieren_humano':
            qs = qs.filter(requiere_humano=True)
        elif filtro in ('humano', 'automatico'):
            qs = qs.filter(estado=filtro)
        elif filtro == 'sin_vincular':
            qs = qs.filter(representante__isnull=True)
        q = (request.query_params.get('q') or '').strip()
        if q:
            qs = qs.filter(Q(telefono__icontains=q) | Q(nombre_contacto__icontains=q)
                           | Q(representante__nombre__icontains=q) | Q(representante__apellido__icontains=q)
                           | Q(representante__cedula__icontains=q))
        try:
            limite = max(1, min(int(request.query_params.get('limite', LIMITE_LISTA)), LIMITE_LISTA))
        except ValueError:
            limite = LIMITE_LISTA
        filas = _con_ultimos(qs.order_by('-actualizado_en', '-id')[:limite], ahora)
        return Response({'ahora': ahora, 'count': len(filas), 'results': filas})


class ConversacionDetalleView(_Base):
    """GET conversaciones/<id>/"""

    def get(self, request, conversacion_id):
        sedes = self.sedes(request)
        if not sedes:
            return _apagada()
        conv = self.conversacion(request, conversacion_id, sedes)
        if conv is None:
            return _error('Conversación no encontrada.', status.HTTP_404_NOT_FOUND)
        return Response(_con_ultimos([conv], timezone.now())[0])


class IniciarConversacionView(_Base):
    """POST conversaciones/iniciar/ {representante_id} — la conversación del representante (se crea si falta)."""

    def post(self, request):
        sedes = self.sedes(request)
        if not sedes:
            return _apagada()
        rep = Representante.objects.filter(pk=request.data.get('representante_id')).first()
        if rep is None:
            return _error('Representante no encontrado.')
        conv = srv.conversacion_de_representante(rep, crear=True)
        if conv is None:
            return _error('El representante no tiene un teléfono válido para WhatsApp.')
        if self.conversacion(request, conv.id, sedes) is None:
            return _error('Conversación no accesible para su sede.', status.HTTP_404_NOT_FOUND)
        return Response(_con_ultimos([conv], timezone.now())[0])


class MensajesView(_Base):
    """
    GET  conversaciones/<id>/mensajes/?desde=<iso>   hilo (incremental con `desde`)
    POST conversaciones/<id>/mensajes/               {cuerpo} o multipart {archivo, cuerpo?}
    """

    def get(self, request, conversacion_id):
        sedes = self.sedes(request)
        if not sedes:
            return _apagada()
        conv = self.conversacion(request, conversacion_id, sedes)
        if conv is None:
            return _error('Conversación no encontrada.', status.HTTP_404_NOT_FOUND)
        desde, error = _desde(request)
        if error:
            return error
        ahora = timezone.now()
        qs = conv.mensajes.select_related('enviado_por')
        hay_mas = False
        if desde:
            qs = qs.filter(actualizado_en__gt=desde).order_by('creado_en', 'id')
            mensajes = list(qs)
        else:
            try:
                limite = max(1, min(int(request.query_params.get('limite', LIMITE_HILO)), 200))
            except ValueError:
                limite = LIMITE_HILO
            ultimos = list(qs.order_by('-creado_en', '-id')[:limite + 1])
            hay_mas = len(ultimos) > limite
            mensajes = ultimos[:limite][::-1]
        return Response({
            'ahora': ahora, 'conversacion': _con_ultimos([conv], ahora)[0], 'hay_mas': hay_mas,
            'count': len(mensajes), 'results': [serializar_mensaje(m) for m in mensajes]})

    def post(self, request, conversacion_id):
        sedes = self.sedes(request)
        if not sedes:
            return _apagada()
        conv = self.conversacion(request, conversacion_id, sedes)
        if conv is None:
            return _error('Conversación no encontrada.', status.HTTP_404_NOT_FOUND)
        archivo = request.FILES.get('archivo')
        cuerpo = request.data.get('cuerpo', '')
        if archivo is not None:
            msg, error = _responder_envio(lambda: srv.enviar_documento(conv, archivo, cuerpo, request.user))
        else:
            msg, error = _responder_envio(lambda: srv.enviar_texto(conv, cuerpo, request.user))
        if error:
            return error
        conv.refresh_from_db()
        return Response({'mensaje': serializar_mensaje(msg),
                         'conversacion': _con_ultimos([conv], timezone.now())[0]},
                        status=status.HTTP_201_CREATED)


class PlantillasConversacionView(_Base):
    """GET conversaciones/plantillas/ — plantillas de Meta disponibles para enviar fuera de la ventana."""

    def get(self, request):
        if not self.sedes(request):
            return _apagada()
        filas = [{
            'id': p.id, 'nombre': p.nombre, 'nombre_meta': p.nombre_plantilla_meta, 'idioma': p.idioma_meta,
            'cuerpo': p.cuerpo, 'orden_parametros': p.orden_parametros_meta,
        } for p in PlantillaWhatsApp.objects.filter(activa=True).exclude(nombre_plantilla_meta='')]
        return Response({'count': len(filas), 'results': filas})


class EnviarPlantillaView(_Base):
    """POST conversaciones/<id>/plantilla/ {plantilla_id | nombre, idioma?, parametros?, cuerpo?}"""

    def post(self, request, conversacion_id):
        sedes = self.sedes(request)
        if not sedes:
            return _apagada()
        conv = self.conversacion(request, conversacion_id, sedes)
        if conv is None:
            return _error('Conversación no encontrada.', status.HTTP_404_NOT_FOUND)
        d = request.data
        nombre, idioma, cuerpo = d.get('nombre'), d.get('idioma'), d.get('cuerpo', '')
        if d.get('plantilla_id'):
            p = PlantillaWhatsApp.objects.filter(pk=d['plantilla_id'], activa=True).exclude(
                nombre_plantilla_meta='').first()
            if p is None:
                return _error('Plantilla no encontrada o sin plantilla de Meta aprobada.')
            nombre, idioma = p.nombre_plantilla_meta, idioma or p.idioma_meta
            cuerpo = cuerpo or p.cuerpo
        parametros = d.get('parametros') or []
        if not isinstance(parametros, list):
            return _error('`parametros` debe ser una lista.')
        msg, error = _responder_envio(lambda: srv.enviar_plantilla(
            conv, nombre, idioma, parametros, request.user, cuerpo))
        if error:
            return error
        conv.refresh_from_db()
        return Response({'mensaje': serializar_mensaje(msg),
                         'conversacion': _con_ultimos([conv], timezone.now())[0]},
                        status=status.HTTP_201_CREATED)


class NotaView(_Base):
    """POST conversaciones/<id>/nota/ {cuerpo}"""

    def post(self, request, conversacion_id):
        sedes = self.sedes(request)
        if not sedes:
            return _apagada()
        conv = self.conversacion(request, conversacion_id, sedes)
        if conv is None:
            return _error('Conversación no encontrada.', status.HTTP_404_NOT_FOUND)
        msg, error = _responder_envio(lambda: srv.agregar_nota(conv, request.data.get('cuerpo'), request.user))
        if error:
            return error
        return Response({'mensaje': serializar_mensaje(msg)}, status=status.HTTP_201_CREATED)


class _AccionConversacion(_Base):
    def ejecutar(self, request, conv):
        raise NotImplementedError

    def post(self, request, conversacion_id):
        sedes = self.sedes(request)
        if not sedes:
            return _apagada()
        conv = self.conversacion(request, conversacion_id, sedes)
        if conv is None:
            return _error('Conversación no encontrada.', status.HTTP_404_NOT_FOUND)
        error = self.ejecutar(request, conv)
        if error:
            return error
        conv.refresh_from_db()
        return Response(_con_ultimos([conv], timezone.now())[0])


class TomarView(_AccionConversacion):
    """POST conversaciones/<id>/tomar/"""

    def ejecutar(self, request, conv):
        srv.tomar(conv, request.user)


class DevolverView(_AccionConversacion):
    """POST conversaciones/<id>/devolver/"""

    def ejecutar(self, request, conv):
        srv.devolver(conv, request.user)


class LeidaView(_AccionConversacion):
    """POST conversaciones/<id>/leida/"""

    def ejecutar(self, request, conv):
        srv.marcar_leida(conv)


class VincularView(_AccionConversacion):
    """POST conversaciones/<id>/vincular/ {representante_id}"""

    def ejecutar(self, request, conv):
        rep = Representante.objects.filter(pk=request.data.get('representante_id')).first()
        if rep is None:
            return _error('Representante no encontrado.')
        srv.vincular(conv, rep)


class ArchivoMensajeView(_Base):
    """GET mensajes/<id>/archivo/ — descarga autenticada del adjunto (los archivos no se sirven por /media/)."""

    def get(self, request, mensaje_id):
        sedes = self.sedes(request)
        if not sedes:
            return _apagada()
        msg = MensajeWhatsApp.objects.filter(
            srv.q_visibles(sedes, 'conversacion__'), pk=mensaje_id).first()
        if msg is None or not msg.adjunto:
            return _error('Archivo no encontrado.', status.HTTP_404_NOT_FOUND)
        tipo = mimetypes.guess_type(msg.adjunto.name)[0] or 'application/octet-stream'
        return FileResponse(msg.adjunto.open('rb'), content_type=tipo,
                            filename=msg.adjunto.name.rsplit('/', 1)[-1])


# ── Comprobantes recibidos por WhatsApp (Fase C) ──────────────────────────────

def _serializar_comprobante(c):
    m = c.mensualidad
    return {'id': c.id, 'estatus': c.estatus, 'mensualidad': m.id,
            'alumno': f'{m.alumno.nombre} {m.alumno.apellido}', 'periodo': f'{m.get_mes_display()} {m.anio}',
            'monto_usd': str(m.monto_usd)}


class _AccionAdjunto(_Base):
    """Base de las acciones sobre un adjunto entrante (mismos permisos y 409 "apagada")."""

    def post(self, request, mensaje_id):
        sedes = self.sedes(request)
        if not sedes:
            return _apagada()
        msg = (MensajeWhatsApp.objects.select_related('conversacion__representante')
               .filter(srv.q_visibles(sedes, 'conversacion__'), pk=mensaje_id).first())
        if msg is None:
            return _error('Mensaje no encontrado.', status.HTTP_404_NOT_FOUND)
        return self.resolver(request, msg)


class ConvertirComprobanteView(_AccionAdjunto):
    """
    POST adjuntos/<mensaje_id>/convertir-comprobante/
         {mensualidades: [ids], referencia_bancaria?, metodo_pago?, banco_receptor_id?}
    """

    def resolver(self, request, msg):
        d = request.data
        creados, error = _responder_envio(lambda: comprobantes.convertir_en_comprobantes(
            msg, d.get('mensualidades'), request.user, d.get('referencia_bancaria', ''),
            d.get('metodo_pago') or 'transferencia', d.get('banco_receptor_id')))
        if error:
            return error
        msg.refresh_from_db()
        conv = ConversacionWhatsApp.objects.get(pk=msg.conversacion_id)
        return Response({'mensaje': serializar_mensaje(msg),
                         'comprobantes': [_serializar_comprobante(c) for c in creados],
                         'conversacion': _con_ultimos([conv], timezone.now())[0]},
                        status=status.HTTP_201_CREATED)


class DescartarAdjuntoView(_AccionAdjunto):
    """POST adjuntos/<mensaje_id>/descartar/ {motivo}"""

    def resolver(self, request, msg):
        _, error = _responder_envio(lambda: comprobantes.descartar(msg, request.data.get('motivo'), request.user))
        if error:
            return error
        msg.refresh_from_db()
        return Response({'mensaje': serializar_mensaje(msg)})


class MensualidadesPendientesView(_Base):
    """GET conversaciones/<id>/mensualidades-pendientes/ — qué mensualidades puede cubrir el comprobante."""

    def get(self, request, conversacion_id):
        sedes = self.sedes(request)
        if not sedes:
            return _apagada()
        conv = self.conversacion(request, conversacion_id, sedes)
        if conv is None:
            return _error('Conversación no encontrada.', status.HTTP_404_NOT_FOUND)
        filas = comprobantes.mensualidades_pendientes(conv.representante) if conv.representante else []
        return Response({'representante': _rep(conv.representante), 'count': len(filas), 'results': filas})


# ── Respuestas rápidas ────────────────────────────────────────────────────────

class RespuestasRapidasView(_Base):
    """
    GET  respuestas-rapidas/?conversacion=<id>&todas=1   (con `conversacion`, agrega `cuerpo_renderizado`)
    POST respuestas-rapidas/ {titulo, cuerpo, sede?, activa?, orden?}
    """

    def _filtro_sedes(self, sedes):
        return Q(sede__isnull=True) | Q(sede_id__in=[s for s in sedes if s is not None])

    def get(self, request):
        sedes = self.sedes(request)
        if not sedes:
            return _apagada()
        qs = RespuestaRapida.objects.filter(self._filtro_sedes(sedes))
        if request.query_params.get('todas') != '1':
            qs = qs.filter(activa=True)
        conv = None
        if request.query_params.get('conversacion'):
            conv = self.conversacion(request, request.query_params['conversacion'], sedes)
            if conv is None:
                return _error('Conversación no encontrada.', status.HTTP_404_NOT_FOUND)
        filas = []
        variables = srv.variables_conversacion(conv) if conv else None
        for r in qs:
            fila = _serializar_respuesta(r)
            if conv:
                fila['cuerpo_renderizado'] = srv.aplicar_variables(r.cuerpo, variables)
            filas.append(fila)
        return Response({'count': len(filas), 'results': filas})

    def post(self, request):
        sedes = self.sedes(request)
        if not sedes:
            return _apagada()
        datos, error = _datos_respuesta(request.data, sedes)
        if error:
            return error
        if not datos.get('titulo') or not datos.get('cuerpo'):
            return _error('Título y texto son obligatorios.')
        return Response(_serializar_respuesta(RespuestaRapida.objects.create(**datos)),
                        status=status.HTTP_201_CREATED)


class RespuestaRapidaDetalleView(_Base):
    """PATCH / DELETE respuestas-rapidas/<id>/"""

    def _obtener(self, request, pk, sedes):
        return RespuestaRapida.objects.filter(
            Q(sede__isnull=True) | Q(sede_id__in=[s for s in sedes if s is not None]), pk=pk).first()

    def patch(self, request, pk):
        sedes = self.sedes(request)
        if not sedes:
            return _apagada()
        r = self._obtener(request, pk, sedes)
        if r is None:
            return _error('Respuesta rápida no encontrada.', status.HTTP_404_NOT_FOUND)
        datos, error = _datos_respuesta(request.data, sedes, parcial=True)
        if error:
            return error
        for k, v in datos.items():
            setattr(r, k, v)
        if not r.titulo or not r.cuerpo:
            return _error('Título y texto son obligatorios.')
        r.save()
        return Response(_serializar_respuesta(r))

    def delete(self, request, pk):
        sedes = self.sedes(request)
        if not sedes:
            return _apagada()
        r = self._obtener(request, pk, sedes)
        if r is None:
            return _error('Respuesta rápida no encontrada.', status.HTTP_404_NOT_FOUND)
        r.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


def _datos_respuesta(d, sedes, parcial=False):
    datos = {}
    for campo in ('titulo', 'cuerpo'):
        if campo in d:
            datos[campo] = str(d[campo] or '').strip()
    if 'activa' in d:
        datos['activa'] = bool(d['activa'])
    if 'orden' in d:
        try:
            datos['orden'] = max(0, int(d['orden']))
        except (TypeError, ValueError):
            return None, _error('`orden` debe ser un entero.')
    if 'sede' in d:
        if d['sede'] in (None, ''):
            datos['sede_id'] = None
        else:
            try:
                sede_id = int(d['sede'])
            except (TypeError, ValueError):
                return None, _error('Sede inválida.')
            if sede_id not in sedes:
                return None, _error('Sede no accesible.')
            datos['sede_id'] = sede_id
    return datos, None
