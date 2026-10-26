import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { ETIQUETA_AREA } from '../cantina/aperturaEvento';
import { etiquetaMetodo } from '../components/cantina/metodoPagoUtils';

/**
 * Impresora térmica ESC/POS por Bluetooth (p. ej. MP80-12) sin diálogo del
 * navegador. Dos transportes, ambos nativos de Chrome/Edge (sin librerías):
 *
 *  - 'ble'    → Web Bluetooth (impresoras Bluetooth LE). Se elige el equipo en
 *               el selector del navegador; no hace falta emparejarlo antes.
 *  - 'serial' → Web Serial sobre el puerto COM que Windows crea al emparejar
 *               una impresora Bluetooth clásica (SPP). Es la vía para los
 *               modelos que no exponen BLE.
 *
 * Requiere HTTPS o localhost y un gesto del usuario la primera vez; después el
 * permiso queda concedido y se reconecta solo (getDevices / getPorts).
 * Con modo 'dialogo' (por defecto) se conserva la impresión por diálogo del
 * sistema de imprimirReciboCantina.js.
 */
const CLAVE_CONFIG = 'cantina_impresora';

export const MODOS = { DIALOGO: 'dialogo', BLE: 'ble', SERIAL: 'serial', RAWBT: 'rawbt' };

const CONFIG_BASE = { modo: MODOS.DIALOGO, nombre: '', deviceId: '', baudRate: 9600 };

export const getConfigImpresora = () => {
  try {
    return { ...CONFIG_BASE, ...JSON.parse(localStorage.getItem(CLAVE_CONFIG) || '{}') };
  } catch {
    return { ...CONFIG_BASE };
  }
};

export const guardarConfigImpresora = (parcial) => {
  const nueva = { ...getConfigImpresora(), ...parcial };
  try { localStorage.setItem(CLAVE_CONFIG, JSON.stringify(nueva)); } catch { /* sin persistencia */ }
  return nueva;
};

export const soporteBluetooth = () => typeof navigator !== 'undefined' && !!navigator.bluetooth;
export const soporteSerial = () => typeof navigator !== 'undefined' && !!navigator.serial;

// Servicios GATT habituales en impresoras térmicas genéricas: hay que
// declararlos de antemano o Chrome no permite leerlos después.
const SERVICIOS_BLE = [
  0x18f0, 0xff00, 0xff12, 0xffe0, 0xfee7, 0xae30,
  'e7810a71-73ae-499d-8c15-faa9aef0c3f2',
  '49535343-fe7d-4ae5-8fa9-9fafd205e455',
];

// UUID de datos habituales en impresoras térmicas, por orden de preferencia.
const UUID_DATOS = ['ff02', '2af1', 'bef8d6c9', '49535343-8841-43f4-a8d4-ecbe34729bb3', 'ffe1', 'ff01', 'ae01'];

// 20 bytes = tamaño que toda impresora BLE acepta sin negociar MTU.
const CHUNK_BLE = 20;
const PAUSA_BLE_MS = 25;
const pausa = (ms) => new Promise(r => setTimeout(r, ms));

// Estado de la conexión viva (se pierde al recargar; se recupera con reconectar).
let ble = null;      // { device, char }
let serial = null;   // { port }

/* ---------------------------------- BLE ---------------------------------- */

async function abrirCaracteristica(device) {
  const server = device.gatt.connected ? device.gatt : await device.gatt.connect();
  const servicios = await server.getPrimaryServices();
  const candidatas = [];
  for (const servicio of servicios) {
    // Servicios estándar (Generic Access / Attribute / Device Information): nunca son de impresión.
    if (/^0000(1800|1801|180a)-/.test(servicio.uuid)) continue;
    const chars = await servicio.getCharacteristics();
    chars.filter(c => c.properties.writeWithoutResponse || c.properties.write)
      .forEach(c => candidatas.push(c));
  }
  // Muchas impresoras exponen varias características escribibles: se prefieren las conocidas de datos.
  const rango = (c) => {
    const i = UUID_DATOS.findIndex(p => c.uuid.includes(p));
    return i === -1 ? UUID_DATOS.length : i;
  };
  candidatas.sort((a, b) => rango(a) - rango(b));
  console.info('[impresora] características escribibles:', candidatas.map(c => c.uuid), '→ usando', candidatas[0]?.uuid);
  if (!candidatas.length) {
    throw new Error('La impresora no expone una característica de escritura. Pruebe el modo "Puerto serie".');
  }
  return candidatas[0];
}

export async function conectarBluetooth() {
  if (!soporteBluetooth()) throw new Error('Este navegador no soporta Web Bluetooth. Use Chrome o Edge.');
  const device = await navigator.bluetooth.requestDevice({
    acceptAllDevices: true,
    optionalServices: SERVICIOS_BLE,
  });
  const char = await abrirCaracteristica(device);
  ble = { device, char };
  guardarConfigImpresora({ modo: MODOS.BLE, nombre: device.name || 'Impresora Bluetooth', deviceId: device.id });
  return device.name || 'Impresora Bluetooth';
}

async function reconectarBluetooth() {
  if (ble?.device?.gatt?.connected) return;
  let device = ble?.device;
  if (!device && navigator.bluetooth?.getDevices) {
    const { deviceId } = getConfigImpresora();
    const permitidos = await navigator.bluetooth.getDevices();
    device = permitidos.find(d => d.id === deviceId);
  }
  if (!device) throw new Error('Impresora Bluetooth no conectada. Conéctela en "Configurar impresora".');
  ble = { device, char: await abrirCaracteristica(device) };
}

async function escribirBluetooth(bytes) {
  await reconectarBluetooth();
  const { char } = ble;
  const sinRespuesta = char.properties.writeWithoutResponse;
  for (let i = 0; i < bytes.length; i += CHUNK_BLE) {
    const trozo = bytes.slice(i, i + CHUNK_BLE);
    if (sinRespuesta) await char.writeValueWithoutResponse(trozo);
    else await char.writeValue(trozo);
    await pausa(PAUSA_BLE_MS);
  }
}

/* --------------------------------- Serial -------------------------------- */

async function abrirPuerto(port, baudRate) {
  if (!port.readable) await port.open({ baudRate: Number(baudRate) || 9600 });
}

export async function conectarSerial() {
  if (!soporteSerial()) throw new Error('Este navegador no soporta Web Serial. Use Chrome o Edge.');
  const port = await navigator.serial.requestPort();
  await abrirPuerto(port, getConfigImpresora().baudRate);
  serial = { port };
  guardarConfigImpresora({ modo: MODOS.SERIAL, nombre: 'Impresora Bluetooth (COM)' });
  return 'Impresora Bluetooth (COM)';
}

async function reconectarSerial() {
  if (serial?.port?.writable) return;
  let port = serial?.port;
  if (!port && navigator.serial?.getPorts) {
    [port] = await navigator.serial.getPorts();
  }
  if (!port) throw new Error('Impresora no conectada. Conéctela en "Configurar impresora".');
  await abrirPuerto(port, getConfigImpresora().baudRate);
  serial = { port };
}

async function escribirSerial(bytes) {
  await reconectarSerial();
  const writer = serial.port.writable.getWriter();
  try {
    await writer.write(bytes);
  } finally {
    writer.releaseLock();
  }
}

/* ------------------------------ API pública ------------------------------ */

export async function desconectarImpresora() {
  try { if (ble?.device?.gatt?.connected) ble.device.gatt.disconnect(); } catch { /* ya desconectada */ }
  try { if (serial?.port?.readable) await serial.port.close(); } catch { /* puerto ocupado */ }
  ble = null;
  serial = null;
  guardarConfigImpresora({ modo: MODOS.DIALOGO, nombre: '', deviceId: '' });
}

/* --------------------------------- RawBT --------------------------------- */

// Celular Android con impresora Bluetooth clásica: la app gratuita RawBT
// (ru.a402d.rawbtprinter) recibe los bytes ESC/POS por intent y los envía a
// la impresora que el usuario eligió en ella. No hay conexión que mantener.
export function activarRawBT() {
  guardarConfigImpresora({ modo: MODOS.RAWBT, nombre: 'RawBT (Android)', deviceId: '' });
  return 'RawBT (Android)';
}

function enviarRawBT(bytes) {
  let binario = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binario += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  window.location.href = `intent:base64,${btoa(binario)}#Intent;scheme=rawbt;package=ru.a402d.rawbtprinter;end;`;
}

export const impresoraConectada = () => {
  const { modo } = getConfigImpresora();
  if (modo === MODOS.RAWBT) return true;
  if (modo === MODOS.BLE) return !!ble?.device?.gatt?.connected;
  if (modo === MODOS.SERIAL) return !!serial?.port?.writable;
  return false;
};

export async function enviarBytes(bytes) {
  const { modo } = getConfigImpresora();
  if (modo === MODOS.BLE) return escribirBluetooth(bytes);
  if (modo === MODOS.SERIAL) return escribirSerial(bytes);
  if (modo === MODOS.RAWBT) return enviarRawBT(bytes);
  throw new Error('No hay impresora Bluetooth configurada.');
}

/* --------------------------------- ESC/POS -------------------------------- */

const ESC = 0x1b;
const GS = 0x1d;
const LF = 0x0a;

// Página de códigos CP858 (ESC t 19): acentos y signos del español.
const CP858 = {
  á: 0xa0, é: 0x82, í: 0xa1, ó: 0xa2, ú: 0xa3, ñ: 0xa4, Ñ: 0xa5, ü: 0x81, Ü: 0x9a,
  Á: 0xb5, É: 0x90, Í: 0xd6, Ó: 0xe0, Ú: 0xe9, '¿': 0xa8, '¡': 0xad, '°': 0xf8,
};

const aBytes = (texto) => Array.from(String(texto ?? '')).map((c) => {
  const cod = c.codePointAt(0);
  if (cod < 0x80) return cod;
  return CP858[c] ?? 0x3f;
});

class Ticket {
  constructor(cols) {
    this.cols = cols;
    this.buf = [ESC, 0x40, ESC, 0x74, 19]; // reset + CP858
  }
  raw(...b) { for (const x of b) this.buf.push(x); return this; }
  alinear(n) { return this.raw(ESC, 0x61, n); }            // 0 izq, 1 centro, 2 der
  negrita(on) { return this.raw(ESC, 0x45, on ? 1 : 0); }
  tamano(doble) { return this.raw(GS, 0x21, doble ? 0x11 : 0x00); }
  texto(t) { return this.raw(...aBytes(t)); }
  linea(t = '') { return this.texto(t).raw(LF); }
  guiones() { return this.linea('-'.repeat(this.cols)); }
  fila(izq, der) {
    const d = String(der);
    const espacio = Math.max(1, this.cols - d.length - 1);
    const partes = [];
    let resto = String(izq);
    while (resto.length > espacio) { partes.push(resto.slice(0, espacio)); resto = resto.slice(espacio); }
    partes.push(resto);
    const ultima = partes.pop();
    partes.forEach(p => this.linea(p));
    return this.linea(ultima.padEnd(this.cols - d.length) + d);
  }
  /** Imagen 1 bit en bloque raster (GS v 0). `bits`: Uint8Array de anchoBytes × alto. */
  raster(bits, anchoBytes, alto) {
    this.raw(GS, 0x76, 0x30, 0, anchoBytes & 0xff, anchoBytes >> 8, alto & 0xff, alto >> 8);
    for (let i = 0; i < bits.length; i++) this.buf.push(bits[i]);
    return this;
  }
  // GS V 66 0 ya avanza el papel hasta la cuchilla antes de cortar: basta un avance mínimo.
  cortar() { return this.raw(LF, GS, 0x56, 0x42, 0x00); }
  bytes() { return new Uint8Array(this.buf); }
}

/** Logo → bitmap 1 bit. Devuelve null si no se puede cargar (se imprime sin logo). */
async function logoRaster(url, puntosAncho) {
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const w = Math.ceil(puntosAncho / 8) * 8;
    const h = Math.round(img.naturalHeight * (w / img.naturalWidth));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    const { data } = ctx.getImageData(0, 0, w, h);
    const anchoBytes = w / 8;
    const bits = new Uint8Array(anchoBytes * h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        const luz = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
        if (data[i + 3] > 127 && luz < 160) bits[y * anchoBytes + (x >> 3)] |= 0x80 >> (x & 7);
      }
    }
    return { bits, anchoBytes, alto: h };
  } catch {
    return null;
  }
}

/**
 * Tasa Bs/USD congelada en la venta. Los recibos de cantina se muestran solo
 * en bolívares: cada monto en USD se convierte con esta tasa.
 */
export const tasaVenta = (venta) => {
  const tasa = Number(venta?.tasa_aplicada);
  if (tasa > 0) return tasa;
  const usdTotal = Number(venta?.total_usd);
  return usdTotal > 0 && venta?.total_ves != null ? Number(venta.total_ves) / usdTotal : 0;
};

export const formatoBs = (n) =>
  `Bs. ${Number(n || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Monto USD → "Bs. 1.234,56" con la tasa de la venta. */
export const bsDesdeUsd = (montoUsd, tasa) => formatoBs(Number(montoUsd || 0) * tasa);

export async function construirReciboEscPos(venta, ancho, logoUrl) {
  const t = new Ticket(ancho === 80 ? 48 : 32);
  const detalles = venta.detalles || [];
  const tasa = tasaVenta(venta);
  const bs = (usdMonto) => bsDesdeUsd(usdMonto, tasa);
  const subtotal = detalles.reduce((acc, d) => acc + Number(d.subtotal || 0), 0);
  const descuento = Number(venta.descuento_usd) || 0;
  const fecha = format(venta.creado_en ? parseISO(venta.creado_en) : new Date(), 'dd/MM/yy HH:mm', { locale: es });
  const metodo = venta.metodo_pago === 'credito_representante' ? 'Cargo a cuenta' : etiquetaMetodo(venta.metodo_pago);
  const area = venta.area ? (ETIQUETA_AREA[venta.area] ?? venta.area) : '';
  const cliente = venta.alumno_nombre || venta.cliente_nombre || '';
  const cajero = venta.cajero_nombre || venta.cajero_username || '';
  const totalBs = venta.total_ves != null ? formatoBs(venta.total_ves) : bs(venta.total_usd);

  // Compacto: logo pequeño, sin líneas en blanco ni mensajes de cortesía.
  t.alinear(1);
  const logo = logoUrl ? await logoRaster(logoUrl, ancho === 80 ? 160 : 112) : null;
  if (logo) t.raster(logo.bits, logo.anchoBytes, logo.alto);
  t.linea(area ? `Caja ${area}` : 'Cantina').alinear(0);
  t.fila(`#${venta.id}`, fecha);
  if (cajero) t.fila('Cajero', cajero);
  if (cliente) t.fila('Alumno', cliente);
  t.guiones();
  detalles.forEach(d => t.fila(`${d.cantidad}x ${d.producto?.nombre ?? ''}`, bs(d.subtotal)));
  t.guiones();
  if (descuento > 0) t.fila('Subtotal', bs(subtotal)).fila('Descuento', `-${bs(descuento)}`);
  t.negrita(true).fila('TOTAL', totalBs).negrita(false);
  t.fila('Pago', venta.referencia ? `${metodo} ${venta.referencia}` : metodo);
  if (venta.saldo_tarjeta_despues != null) {
    t.fila('Saldo anterior', bs(Number(venta.saldo_tarjeta_despues) + Number(venta.total_usd)))
      .negrita(true).fila('Saldo restante', bs(venta.saldo_tarjeta_despues)).negrita(false);
  }
  t.guiones().alinear(1).negrita(true).linea('ENTREGAR AL ALUMNO').negrita(false).alinear(0);
  return t.cortar().bytes();
}

export async function imprimirReciboDirecto(venta, ancho, logoUrl) {
  await enviarBytes(await construirReciboEscPos(venta, ancho, logoUrl));
}

export async function imprimirPrueba(ancho) {
  const t = new Ticket(ancho === 80 ? 48 : 32);
  t.alinear(1).tamano(true).linea('PRUEBA').tamano(false)
    .linea('Impresora configurada')
    .linea(format(new Date(), 'dd/MM/yyyy HH:mm', { locale: es }))
    .linea('áéíóú ñ Ñ ¿? ¡!').alinear(0).guiones()
    .fila('Producto de ejemplo', '$1.50');
  await enviarBytes(t.cortar().bytes());
}
