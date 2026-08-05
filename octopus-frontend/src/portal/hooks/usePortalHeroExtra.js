import { useState, useEffect, useMemo } from 'react';
import { getCirculares } from '../api/comunicacion.service';
import { getRendimientoAlumnoPortal } from '../api/academico.service';

const UMBRAL_RENDIMIENTO = 10;

/**
 * Datos extra para el widget Hero del portal: cantidad de avisos (circulares)
 * sin leer y alertas de rendimiento (materias por debajo del umbral) de los
 * hijos del representante autenticado.
 *
 * @param {Array<{id: number|string, nombre: string, apellido: string}>} alumnos
 * @returns {{
 *   avisosSinLeer: number,
 *   alertaRendimiento: Array<{alumno_id, alumno_nombre, materia_nombre, promedio}>,
 *   loadingAvisos: boolean,
 *   loadingRendimiento: boolean,
 * }}
 */
export function usePortalHeroExtra(alumnos) {
  const [avisosSinLeer, setAvisosSinLeer] = useState(0);
  const [alertaRendimiento, setAlertaRendimiento] = useState([]);
  const [loadingAvisos, setLoadingAvisos] = useState(true);
  const [loadingRendimiento, setLoadingRendimiento] = useState(true);

  const alumnosKey = useMemo(
    () => JSON.stringify((alumnos || []).map(a => a.id)),
    [alumnos]
  );

  useEffect(() => {
    const controller = new AbortController();
    const listaAlumnos = alumnos || [];

    setLoadingAvisos(true);
    setLoadingRendimiento(listaAlumnos.length > 0);
    if (listaAlumnos.length === 0) {
      setAlertaRendimiento([]);
    }

    const fetchAvisos = getCirculares(controller.signal)
      .then(res => {
        if (controller.signal.aborted) return;
        const circulares = res.data || [];
        setAvisosSinLeer(circulares.filter(c => !c.leido).length);
      })
      .catch(() => {
        // Fallo silencioso: no bloquear el Hero por un error no crítico.
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadingAvisos(false);
      });

    const fetchRendimiento = listaAlumnos.length === 0
      ? Promise.resolve()
      : Promise.allSettled(
          listaAlumnos.map(alumno =>
            getRendimientoAlumnoPortal(alumno.id, controller.signal).then(res => ({
              alumno,
              rendimiento: res.data,
            }))
          )
        ).then(resultados => {
          if (controller.signal.aborted) return;

          const alertas = [];
          resultados.forEach(resultado => {
            if (resultado.status !== 'fulfilled') return;
            const { alumno, rendimiento } = resultado.value;

            const ultimoLapsoConNotas = [...(rendimiento?.por_lapso || [])]
              .reverse()
              .find(l => l.por_materia.length > 0);

            (ultimoLapsoConNotas?.por_materia || [])
              .filter(m => m.promedio !== null && m.promedio !== undefined && m.promedio < UMBRAL_RENDIMIENTO)
              .forEach(m => {
                alertas.push({
                  alumno_id: alumno.id,
                  alumno_nombre: `${alumno.nombre} ${alumno.apellido}`,
                  materia_nombre: m.materia,
                  promedio: m.promedio,
                });
              });
          });

          setAlertaRendimiento(alertas.slice(0, 3));
        })
        .catch(() => {
          // Fallo silencioso: no bloquear el Hero por un error no crítico.
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoadingRendimiento(false);
        });

    Promise.allSettled([fetchAvisos, fetchRendimiento]);

    return () => controller.abort();
  }, [alumnosKey]);

  return { avisosSinLeer, alertaRendimiento, loadingAvisos, loadingRendimiento };
}
