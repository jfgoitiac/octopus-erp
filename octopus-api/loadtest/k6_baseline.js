// Prueba de carga base (baseline) — cobranza/pagos.
//
// NO ejecutar contra producción. Pensado para correr contra staging (ver
// STAGING.md) una vez que exista, o contra un entorno local con datos de
// prueba. Requiere el binario k6 (https://k6.io) — no es una dependencia
// de Python/Node del proyecto.
//
// Uso:
//   BASE_URL=https://staging.tudominio.com \
//   USUARIO=usuario_de_prueba CONTRASENA=clave_de_prueba \
//   k6 run octopus-api/loadtest/k6_baseline.js
//
// Cubre el camino más transitado del panel administrativo: login + listar
// pagos + ver dashboard de cobranza. No cubre RegistrarPagoView a propósito
// (correrlo repetidamente crearía pagos de prueba reales en la BD del
// ambiente objetivo) — si se necesita probar ese endpoint, hacerlo aparte
// contra una BD de staging que se pueda limpiar después.

import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE_URL = __ENV.BASE_URL || 'http://127.0.0.1:8000';
const USUARIO = __ENV.USUARIO || '';
const CONTRASENA = __ENV.CONTRASENA || '';

export const options = {
  stages: [
    { duration: '30s', target: 5 },   // rampa suave
    { duration: '1m', target: 15 },   // carga sostenida — ajustar según uso real
    { duration: '20s', target: 0 },   // enfriamiento
  ],
  thresholds: {
    http_req_duration: ['p(95)<800'],  // 95% de requests bajo 800ms
    http_req_failed: ['rate<0.01'],    // menos de 1% de errores
  },
};

export default function () {
  const loginRes = http.post(`${BASE_URL}/api/token/`, JSON.stringify({
    username: USUARIO,
    password: CONTRASENA,
  }), { headers: { 'Content-Type': 'application/json' } });

  check(loginRes, {
    'login: status 200': (r) => r.status === 200,
  });

  const token = loginRes.json('access');
  if (!token) {
    sleep(1);
    return;
  }
  const authHeaders = { headers: { Authorization: `Bearer ${token}` } };

  const pagosRes = http.get(`${BASE_URL}/api/cobranza/pagos/lista/?page=1`, authHeaders);
  check(pagosRes, {
    'lista de pagos: status 200': (r) => r.status === 200,
  });

  const statsRes = http.get(`${BASE_URL}/api/cobranza/stats/`, authHeaders);
  check(statsRes, {
    'dashboard stats: status 200': (r) => r.status === 200,
  });

  sleep(1);
}
