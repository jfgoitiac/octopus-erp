import logging
import requests
from decimal import Decimal, InvalidOperation

from .models import TasaCambio, ParametroGlobal

logger = logging.getLogger(__name__)

_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
                  '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept': 'application/json',
}


# ──────────────────────────────────────────────────────────────────────────────
# LÓGICA DE MONITOREO Y TOLERANCIA A FALLOS (TASA BCV)
# ──────────────────────────────────────────────────────────────────────────────

def _parse_decimal(valor) -> Decimal:
    """Convierte cualquier representación numérica a Decimal, normalizando comas."""
    return Decimal(str(valor).replace(',', '.')).quantize(Decimal('0.01'))


def _obtener_tasa_por_scraping_bcv() -> Decimal:
    """
    API 1: ve.dolarapi.com — JSON público.
    Endpoint: GET /v1/dolares → busca fuente "oficial" (BCV).
    """
    r = requests.get(
        'https://ve.dolarapi.com/v1/dolares',
        headers=_HEADERS,
        timeout=10,
    )
    r.raise_for_status()
    data = r.json()

    for item in data:
        fuente = str(item.get('fuente', '')).lower()
        if fuente == 'oficial':
            price = item.get('promedio') or item.get('venta') or item.get('compra')
            if price:
                tasa = _parse_decimal(price)
                if tasa > 0:
                    return tasa

    raise ValueError(f"ve.dolarapi.com no devolvió tasa oficial en: {data}")


def _obtener_tasa_por_pydolar() -> Decimal:
    """
    API 2: exchangerate.host como fallback real con endpoint distinto.
    """
    r = requests.get(
        'https://api.exchangerate.host/latest?base=USD&symbols=VES',
        headers=_HEADERS,
        timeout=10,
    )
    r.raise_for_status()
    data = r.json()

    ves = data.get('rates', {}).get('VES')
    if ves:
        tasa = _parse_decimal(ves)
        if tasa > 0:
            return tasa

    raise ValueError(f"exchangerate.host no devolvió tasa VES: {data}")


def _obtener_tasa_de_emergencia_db() -> Decimal:
    """
    Fallback final: tasa manual configurada por el administrador o último
    registro histórico en BD. No crea registros nuevos.
    """
    parametro, _ = ParametroGlobal.objects.get_or_create(
        clave="TASA_BCV_MANUAL",
        defaults={"valor": "0.0000", "descripcion": "Tasa manual de contingencia"}
    )
    if parametro.valor:
        try:
            manual = Decimal(parametro.valor)
            if manual > 0:
                logger.warning(f"Usando tasa manual de contingencia: {manual}")
                return manual.quantize(Decimal('0.01'))
        except InvalidOperation:
            pass

    ultima_tasa = TasaCambio.objects.order_by('-id').first()
    if ultima_tasa:
        logger.warning(f"Usando última tasa histórica en BD: {ultima_tasa.valor_bs}")
        return ultima_tasa.valor_bs

    raise LookupError("Sin registros en BD. Imposible determinar tasa de cambio.")


def sincronizar_tasa_bcv() -> Decimal:
    """Controlador con cadena de fallback: API1 → API2 → BD."""
    for nombre, fn in [
        ('pydolarve.org', _obtener_tasa_por_scraping_bcv),
        ('ve.dolarapi.com', _obtener_tasa_por_pydolar),
    ]:
        try:
            tasa = fn()
            TasaCambio.objects.create(valor_bs=tasa)
            logger.info(f"Tasa BCV obtenida desde {nombre}: {tasa}")
            return tasa
        except Exception as e:
            logger.warning(f"{nombre} falló: {e}")

    try:
        return _obtener_tasa_de_emergencia_db()
    except Exception as e:
        logger.critical(f"Todas las fuentes fallaron: {e}")
        return None
