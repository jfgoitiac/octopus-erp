"""
Pestaña "Hoy" de Cobranza Inteligente (PLAN_COBRANZA_INTELIGENTE_V4.md §1.2 / §2.3).

Arma las tarjetas de acción del día reutilizando lo que ya existe
(`calcular_bandeja`, `pagos_en_revision`, convenios, envíos fallidos) más los
KPIs y la actividad automática, y expone la evaluación en seco del motor.

Cada tarjeta trae su `clave` estable, el POR QUÉ (razones con puntos) y las
acciones sugeridas. Marcar una tarjeta como hecha deja un EventoCiclo
`tarjeta_hecha`; la tarjeta no vuelve a salir hasta que su condición se dispare
de nuevo (ver `desde` de cada tarjeta).

Ganchos para las fases B y C (conversaciones y comprobantes por WhatsApp):
`registrar_fuente` permite que otros módulos aporten tarjetas sin tocar este
archivo. Las tarjetas previstas y su clave son:
  - `conversacion_espera:<id>`        conversación con requiere_humano o sin respuesta > 2 h
  - `conversacion_tomada:<id>`        takeover sin mensajes del cobrador > 24 h
  - `comprobante_whatsapp:<mensaje>`  comprobante recibido sin asignar
Deben devolver dicts con la misma forma que `_tarjeta`.
"""
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta

from django.utils import timezone

from .ciclos import dias_de_mora
from .dashboard import cartera_mes, distribucion_por_etapa, q_sedes
from .gestion import DIAS_PAGO_REVISION_VIEJO, calcular_bandeja, pagos_en_revision
from .models import CicloCobranza, ConvenioPago, EnvioCobranza, EventoCiclo

EVENTO_TARJETA_HECHA = 'tarjeta_hecha'
UMBRAL_PUNTAJE_PRIORITARIO = 30
DIAS_SIN_GESTION = 3
DIAS_VISIBLE_PROMESA_VENCIDA = 14
DIAS_VISIBLE_ENVIO_FALLIDO = 14
DIAS_OCULTA_SIN_CONTACTO = 7
EVENTOS_GESTION_HUMANA = ('llamada_registrada', 'whatsapp_manual', 'nota', 'convenio_creado', 'cobro_manual')
HORA_ENVIOS = '8:00'

TIPOS_TARJETA = (
    'caso_prioritario', 'promesa_vencida', 'pago_en_revision', 'envio_fallido', 'sin_contacto',
    'comprobante_whatsapp', 'conversacion_espera', 'conversacion_tomada',
)


@dataclass
class Contexto:
    sedes: set
    hoy: date
    ahora: datetime
    ciclos: object      # QuerySet de CicloCobranza ya filtrado por sedes accesibles


# Registro de fuentes extra (fases B y C).
FUENTES_TARJETAS = []


def registrar_fuente(funcion):
    """Decorador: `funcion(contexto) -> [tarjeta]`."""
    if funcion not in FUENTES_TARJETAS:
        FUENTES_TARJETAS.append(funcion)
    return funcion


def _rep(r):
    return {'id': r.id, 'nombre': f'{r.nombre} {r.apellido}', 'cedula': r.cedula, 'telefono': r.telefono}


def _accion(accion, etiqueta, disponible=True, **extra):
    return {'accion': accion, 'etiqueta': etiqueta, 'disponible': disponible, **extra}


def _tarjeta(clave, tipo, prioridad, titulo, por_que, representante, desde, acciones, ciclos=(),
             sede=None, urgente=False, detalle=None):
    return {
        'clave': clave, 'tipo': tipo, 'prioridad': prioridad, 'urgente': urgente, 'titulo': titulo,
        'por_que': por_que, 'representante': representante, 'ciclos': list(ciclos),
        'acciones': acciones, 'desde': desde, 'sede': sede, 'detalle': detalle or {},
    }


def _aware(d):
    return timezone.make_aware(datetime.combine(d, time.min))


# ── Fuentes de tarjetas existentes ─────────────────────────────────────────────

def _tarjetas_bandeja(ctx):
    filas = calcular_bandeja(ctx.ciclos, ctx.hoy, ctx.ahora)
    if not filas:
        return []
    todos = [c for f in filas for c in f['ciclos']]
    sede_de = dict(ctx.ciclos.filter(id__in=todos).values_list('id', 'mensualidad__alumno__sede_id'))
    recientes = set()
    for ciclo_id in EventoCiclo.objects.filter(
            ciclo_id__in=todos, tipo__in=EVENTOS_GESTION_HUMANA,
            creado_en__gte=ctx.ahora - timedelta(days=DIAS_SIN_GESTION)).values_list('ciclo_id', flat=True):
        recientes.add(ciclo_id)
    inicio_dia = timezone.localtime(ctx.ahora).replace(hour=0, minute=0, second=0, microsecond=0)
    tarjetas = []
    for f in filas:
        grave = bool({'prioritaria', 'critica'} & set(f['estados'])) or f['puntaje'] >= UMBRAL_PUNTAJE_PRIORITARIO
        if not grave or any(c in recientes for c in f['ciclos']):
            continue
        critico = 'critica' in f['estados']
        rep = f['representante']
        tarjetas.append(_tarjeta(
            clave=f"caso_prioritario:{rep['id']}", tipo='caso_prioritario',
            prioridad=min(100, f['puntaje']) + (10 if critico else 0),
            titulo=f"{rep['nombre']}: {'caso crítico' if critico else 'caso prioritario'} sin gestión reciente",
            por_que=f['razones'], representante=rep, desde=inicio_dia,
            acciones=[
                _accion('abrir_chat', 'Abrir chat', disponible=False),   # fase B
                _accion('llamada', 'Registrar llamada', ciclo=f['ciclos'][0]),
                _accion('pausar', 'Pausar', ciclo=f['ciclos'][0]),
            ],
            ciclos=f['ciclos'], sede=sede_de.get(f['ciclos'][0]), urgente=critico,
            detalle={'puntaje': f['puntaje'], 'saldo_total_usd': f['saldo_total_usd'],
                     'dias_mora_max': f['dias_mora_max'], 'estados': f['estados']}))
    return tarjetas


def _tarjetas_pagos_revision(ctx, filas=None):
    filas = pagos_en_revision(ctx.sedes, ctx.ahora) if filas is None else filas
    tarjetas = []
    for f in filas:
        if f['dias_espera'] < DIAS_PAGO_REVISION_VIEJO:
            continue
        rep = f['representante']
        tarjetas.append(_tarjeta(
            clave=f"pago_en_revision:{f['tipo']}:{f['id']}", tipo='pago_en_revision',
            prioridad=60 + min(f['dias_espera'], 30),
            titulo=f"{rep['nombre']}: {'pago' if f['tipo'] == 'pago' else 'comprobante'} en revisión "
                   f"hace {f['dias_espera']} días",
            por_que=[{'texto': f"Esperando conciliación hace {f['dias_espera']} días (${f['monto_usd']})",
                      'puntos': 0}],
            representante=rep, desde=f['desde'],
            acciones=[_accion('conciliar', 'Ir a conciliar', tipo=f['tipo'], id=f['id'])],
            urgente=f['dias_espera'] >= 7,
            detalle={'tipo': f['tipo'], 'id': f['id'], 'monto_usd': f['monto_usd'],
                     'alumno': f['alumno'], 'dias_espera': f['dias_espera']}))
    return tarjetas


def _tarjetas_promesas_vencidas(ctx):
    limite = ctx.hoy - timedelta(days=DIAS_VISIBLE_PROMESA_VENCIDA)
    convenios = (
        ConvenioPago.objects.filter(
            tipo=ConvenioPago.TIPO_PROMESA, estado=ConvenioPago.INCUMPLIDO,
            ciclos__in=ctx.ciclos, cuotas__fecha__gte=limite, cuotas__fecha__lt=ctx.hoy, cuotas__pagada=False)
        .distinct().select_related('representante').prefetch_related('cuotas', 'ciclos'))
    tarjetas = []
    for c in convenios:
        cuota = next((q for q in c.cuotas.all() if not q.pagada), None)
        if cuota is None:
            continue
        dias = (ctx.hoy - cuota.fecha).days
        ciclos = [x.id for x in c.ciclos.all()]
        tarjetas.append(_tarjeta(
            clave=f'promesa_vencida:{c.id}', tipo='promesa_vencida', prioridad=80 + min(dias, 15),
            titulo=f'{c.representante.nombre} {c.representante.apellido}: promesa de pago vencida',
            por_que=[{'texto': f'Prometió pagar ${cuota.monto_usd} el {cuota.fecha.isoformat()} y no pagó '
                               f'({dias} días)', 'puntos': 0},
                     {'texto': 'Sus deudas ya volvieron al ciclo de cobranza', 'puntos': 0}],
            representante=_rep(c.representante), desde=_aware(cuota.fecha),
            acciones=[_accion('abrir_chat', 'Escribir', disponible=False),   # fase B
                      _accion('llamada', 'Registrar llamada', ciclo=ciclos[0] if ciclos else None)],
            ciclos=ciclos, urgente=True,
            detalle={'convenio': c.id, 'fecha_promesa': cuota.fecha, 'monto_usd': str(cuota.monto_usd),
                     'origen': c.origen}))
    return tarjetas


def _tarjetas_envios_fallidos(ctx):
    envios = (
        EnvioCobranza.objects.filter(
            q_sedes(ctx.sedes, 'regla__'), estado=EnvioCobranza.FALLIDO,
            creado_en__gte=ctx.ahora - timedelta(days=DIAS_VISIBLE_ENVIO_FALLIDO))
        .select_related('representante', 'regla').order_by('-creado_en'))
    tarjetas = []
    for e in envios:
        tarjetas.append(_tarjeta(
            clave=f'envio_fallido:{e.id}', tipo='envio_fallido', prioridad=50,
            titulo=f'{e.representante.nombre} {e.representante.apellido}: el aviso falló {e.intentos} veces',
            por_que=[{'texto': f'«{e.regla.nombre}» ({e.fecha.isoformat()}) no se pudo entregar '
                               f'tras {e.intentos} intentos', 'puntos': 0}],
            representante=_rep(e.representante), desde=e.creado_en,
            acciones=[_accion('ver_envio', 'Ver detalle', envio=e.id),
                      _accion('editar_representante', 'Corregir teléfono')],
            ciclos=e.detalle.get('ciclos', []), sede=e.regla.sede_id,
            detalle={'envio': e.id, 'canal': e.canal, 'regla': e.regla.nombre, 'intentos': e.intentos}))
    return tarjetas


def _contacto_valido(rep):
    from notificaciones.services import _normalizar_telefono
    return bool(_normalizar_telefono(rep.telefono)) or '@' in (rep.correo or '')


def _tarjetas_sin_contacto(ctx):
    activos = ctx.ciclos.filter(
        estado__in=[e for e in CicloCobranza.ESTADOS_ABIERTOS if e != CicloCobranza.PAUSADA]
    ).select_related('mensualidad__alumno__representante')
    vistos, tarjetas = set(), []
    for c in activos:
        rep = c.mensualidad.alumno.representante
        if rep.id in vistos:
            continue
        vistos.add(rep.id)
        if _contacto_valido(rep):
            continue
        tarjetas.append(_tarjeta(
            clave=f'sin_contacto:{rep.id}', tipo='sin_contacto', prioridad=40,
            titulo=f'{rep.nombre} {rep.apellido}: sin teléfono ni email válido',
            por_que=[{'texto': 'Tiene deuda abierta y no hay forma de contactarlo por el sistema',
                      'puntos': 0}],
            representante=_rep(rep), desde=ctx.ahora - timedelta(days=DIAS_OCULTA_SIN_CONTACTO),
            acciones=[_accion('editar_representante', 'Editar representante')],
            ciclos=[c.id], sede=c.mensualidad.alumno.sede_id))
    return tarjetas


FUENTES_BASE = (_tarjetas_bandeja, _tarjetas_promesas_vencidas, _tarjetas_pagos_revision,
                _tarjetas_envios_fallidos, _tarjetas_sin_contacto)


# ── Armado ─────────────────────────────────────────────────────────────────────

def _contexto(sedes, hoy, ahora):
    return Contexto(sedes=sedes, hoy=hoy, ahora=ahora,
                    ciclos=CicloCobranza.objects.filter(q_sedes(sedes, 'mensualidad__alumno__')))


def _todas_las_tarjetas(ctx):
    """Tarjetas vigentes (antes de ocultar las marcadas como hechas)."""
    tarjetas = []
    for fuente in (*FUENTES_BASE, *FUENTES_TARJETAS):
        tarjetas.extend(fuente(ctx))
    return tarjetas


def _hechas(ahora):
    """{clave: último instante en que se marcó hecha}."""
    hechas = {}
    for detalle, creado in EventoCiclo.objects.filter(
            tipo=EVENTO_TARJETA_HECHA, creado_en__gte=ahora - timedelta(days=60)
    ).order_by('creado_en').values_list('detalle', 'creado_en'):
        hechas[detalle.get('clave')] = creado
    return hechas


def _tarjetas_visibles(ctx):
    hechas = _hechas(ctx.ahora)
    visibles = []
    for t in _todas_las_tarjetas(ctx):
        hecha = hechas.get(t['clave'])
        if hecha is not None and hecha >= t['desde']:
            continue
        visibles.append(t)
    return sorted(visibles, key=lambda t: (-t['prioridad'], t['clave']))


def marcar_tarjeta_hecha(clave, usuario, sedes, hoy=None, ahora=None, nota=''):
    """
    Registra un EventoCiclo `tarjeta_hecha`. Devuelve False si la tarjeta no
    existe (o no es accesible). Es idempotente: marcarla dos veces no falla.
    """
    hoy = hoy or date.today()
    ahora = ahora or timezone.now()
    ctx = _contexto(sedes, hoy, ahora)
    tarjeta = next((t for t in _todas_las_tarjetas(ctx) if t['clave'] == clave), None)
    if tarjeta is None:
        return False
    ciclo_id = tarjeta['ciclos'][0] if tarjeta['ciclos'] else None
    EventoCiclo.objects.create(
        ciclo_id=ciclo_id if ctx.ciclos.filter(pk=ciclo_id).exists() else None,
        sede_id=tarjeta['sede'], tipo=EVENTO_TARJETA_HECHA, usuario=usuario,
        detalle={'clave': clave, 'tipo_tarjeta': tarjeta['tipo'], 'nota': (nota or '')[:300],
                 'representante': tarjeta['representante']['id'] if tarjeta['representante'] else None})
    return True


def contadores(sedes, hoy=None, ahora=None):
    """Liviano, para el badge del sidebar (polling)."""
    hoy = hoy or date.today()
    ahora = ahora or timezone.now()
    tarjetas = _tarjetas_visibles(_contexto(sedes, hoy, ahora))
    no_leidos = 0   # fase B: suma de ConversacionWhatsApp.no_leidos
    urgentes = sum(1 for t in tarjetas if t['urgente'])
    return {
        'no_leidos': no_leidos, 'tarjetas_urgentes': urgentes, 'total_tarjetas': len(tarjetas),
        'total': no_leidos + urgentes,   # número del badge del sidebar
    }


# ── Evaluación en seco ─────────────────────────────────────────────────────────

def simulacion(sedes, fecha, ahora=None):
    from .motor import simular_reglas_sede
    ahora = ahora or timezone.now()
    items = []
    for sede_id in sorted(sedes, key=lambda s: (s is None, s)):
        items.extend(simular_reglas_sede(sede_id, fecha, ahora))
    por_estado, por_canal = {}, {}
    for i in items:
        por_estado[i['estado']] = por_estado.get(i['estado'], 0) + 1
        por_canal[i['canal']] = por_canal.get(i['canal'], 0) + 1
    return {'fecha': fecha, 'total': len(items), 'por_estado': por_estado, 'por_canal': por_canal,
            'items': items}


# ── Respuesta de Hoy ───────────────────────────────────────────────────────────

def _mora_por_antiguedad(ctx):
    cubos = {'por_vencer': 0, '1_7': 0, '8_15': 0, '16_30': 0, 'mas_30': 0}
    activos = ctx.ciclos.filter(
        estado__in=[e for e in CicloCobranza.ESTADOS_ABIERTOS if e != CicloCobranza.PAUSADA])
    for fecha in activos.values_list('fecha_vencimiento', flat=True):
        d = dias_de_mora(fecha, ctx.hoy)
        clave = ('por_vencer' if d <= 0 else '1_7' if d <= 7 else '8_15' if d <= 15
                 else '16_30' if d <= 30 else 'mas_30')
        cubos[clave] += 1
    return cubos


def _actividad(ctx, limite=15):
    envios = (
        EnvioCobranza.objects.filter(q_sedes(ctx.sedes, 'regla__'),
                                     creado_en__gte=ctx.ahora - timedelta(days=7))
        .exclude(estado__in=(EnvioCobranza.SIMULADO, EnvioCobranza.CANCELADO))
        .select_related('representante', 'regla').order_by('-creado_en')[:limite])
    return [{
        'id': e.id, 'fecha': e.fecha, 'estado': e.estado, 'canal': e.canal,
        'motivo_omision': e.motivo_omision, 'enviado_en': e.enviado_en, 'creado_en': e.creado_en,
        'regla': e.regla.nombre,
        'representante': {'id': e.representante_id,
                          'nombre': f'{e.representante.nombre} {e.representante.apellido}'},
    } for e in envios]


def _frase(casos, comprobantes, promesas, envios):
    partes = [f"{casos} {'caso requiere' if casos == 1 else 'casos requieren'} acción"]
    if comprobantes:
        partes.append(f"{comprobantes} {'comprobante' if comprobantes == 1 else 'comprobantes'} por aprobar")
    if promesas:
        partes.append(f"{promesas} {'promesa vencida' if promesas == 1 else 'promesas vencidas'}")
    frase = 'Hoy: ' + ' · '.join(partes) + '.'
    if envios:
        frase += (f" El sistema enviará {envios} {'recordatorio' if envios == 1 else 'recordatorios'} "
                  f"a las {HORA_ENVIOS}.")
    return frase


def calcular_hoy(sedes, hoy=None, ahora=None):
    hoy = hoy or date.today()
    ahora = ahora or timezone.now()
    ctx = _contexto(sedes, hoy, ahora)
    tarjetas = _tarjetas_visibles(ctx)
    pagos = pagos_en_revision(sedes, ahora)
    sim = simulacion(sedes, hoy, ahora)
    pendientes_hoy = sim['por_estado'].get('saldria', 0)
    abiertos = ctx.ciclos.filter(estado__in=CicloCobranza.ESTADOS_ABIERTOS).select_related('mensualidad')
    envios_7 = {}
    for estado in EnvioCobranza.objects.filter(
            q_sedes(sedes, 'regla__'), creado_en__gte=ahora - timedelta(days=7)
    ).values_list('estado', flat=True):
        envios_7[estado] = envios_7.get(estado, 0) + 1
    promesas = sum(1 for t in tarjetas if t['tipo'] == 'promesa_vencida')
    comprobantes = (sum(1 for p in pagos if p['tipo'] == 'comprobante')
                    + sum(1 for t in tarjetas if t['tipo'] == 'comprobante_whatsapp'))
    por_tipo = {}
    for t in tarjetas:
        por_tipo[t['tipo']] = por_tipo.get(t['tipo'], 0) + 1
    return {
        'fecha': hoy,
        'resumen': {
            'frase': _frase(len(tarjetas), comprobantes, promesas, pendientes_hoy),
            'casos_requieren_accion': len(tarjetas), 'comprobantes_por_aprobar': comprobantes,
            'promesas_vencidas': promesas, 'envios_programados_hoy': pendientes_hoy,
            'hora_envios': HORA_ENVIOS,
        },
        'tarjetas': tarjetas,
        'tarjetas_por_tipo': por_tipo,
        'kpis': {
            'cartera_mes': cartera_mes(sedes, hoy),
            'distribucion_por_etapa': distribucion_por_etapa(abiertos),
            'mora_por_antiguedad': _mora_por_antiguedad(ctx),
            'pagos_por_conciliar': len(pagos),
            'envios_7_dias': envios_7,
        },
        'actividad': _actividad(ctx),
    }
