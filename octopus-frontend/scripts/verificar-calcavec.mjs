// Regresión numérica de dinero para calcAVEC (Fase B — separación AVEC/genérico).
// Uso: node scripts/verificar-calcavec.mjs
// Verifica que, con convenioNomina='avec_ve' (el default, igual al comportamiento
// previo a la separación de capas), calcAVEC siga produciendo exactamente los
// mismos 14 campos que el fixture congelado. También verifica que con
// convenioNomina='generico' las primas de convenio (primaDoc/primaGeo) den 0.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createServer } from 'vite';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturePath = join(__dirname, '../src/constants/__fixtures__/calcAVEC.fixture.json');
const fixture = JSON.parse(readFileSync(fixturePath, 'utf-8'));

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
const { calcAVEC } = await server.ssrLoadModule('/src/constants/avec.js');

let failed = false;

for (const caso of fixture) {
    const { categoria, sueldoBase, anosServicio, numeroHijos, titulo, resultado: esperado } = caso;
    const actual = calcAVEC(sueldoBase, categoria, anosServicio, numeroHijos, titulo); // convenioNomina default = 'avec_ve'

    for (const campo of Object.keys(esperado)) {
        if (Math.abs(actual[campo] - esperado[campo]) > 1e-9) {
            failed = true;
            console.error(`[FAIL] ${categoria} — campo "${campo}": esperado ${esperado[campo]}, obtenido ${actual[campo]}`);
        }
    }

    const generico = calcAVEC(sueldoBase, categoria, anosServicio, numeroHijos, titulo, 'generico');
    if (generico.primaDoc !== 0 || generico.primaGeo !== 0) {
        failed = true;
        console.error(`[FAIL] ${categoria} — convenio 'generico' debería dar primaDoc=0/primaGeo=0, dio primaDoc=${generico.primaDoc}, primaGeo=${generico.primaGeo}`);
    }
}

// conceptosUniversales: un colegio que configuró ConceptoNomina debe ver esos
// valores reflejados en el cálculo, en vez de las constantes hardcodeadas.
{
    const caso = fixture[0]; // D-I S/C: sueldoBase=300, anosServicio=5, numeroHijos=0
    const conceptos = {
        ANTIGUEDAD_PCT_ANIO: { porcentaje: '0.02' }, // 2%/año en vez de 1%
        ASISTENCIAL_FIJO:    { monto: '25.00' },      // en vez de 17.50
        HIJO_FIJO:           { monto: '20.00' },      // en vez de 12.50 (no aplica, numeroHijos=0)
    };
    const actual = calcAVEC(caso.sueldoBase, caso.categoria, caso.anosServicio, caso.numeroHijos, caso.titulo, 'avec_ve', conceptos);
    const primaAntEsperada  = caso.sueldoBase * 0.02 * caso.anosServicio; // 300*0.02*5 = 30
    if (Math.abs(actual.primaAnt - primaAntEsperada) > 1e-9) {
        failed = true;
        console.error(`[FAIL] conceptosUniversales — primaAnt esperado ${primaAntEsperada}, obtenido ${actual.primaAnt}`);
    }
    if (Math.abs(actual.primaAsis - 25.00) > 1e-9) {
        failed = true;
        console.error(`[FAIL] conceptosUniversales — primaAsis esperado 25, obtenido ${actual.primaAsis}`);
    }
}

await server.close();

if (failed) {
    console.error('\nRegresión de calcAVEC: FALLÓ. Ver detalles arriba.');
    process.exit(1);
}
console.log(`Regresión de calcAVEC: OK (${fixture.length} categorías, avec_ve idéntico al fixture + generico sin prima de convenio).`);
