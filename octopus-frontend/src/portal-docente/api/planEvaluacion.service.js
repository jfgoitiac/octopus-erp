import docenteApiClient from './docenteApiClient';

// Plan de Evaluación — bloques e ítems configurados por el docente para una
// materia + lapso. GET devuelve null/404 si todavía no existe el plan.
export const getPlanEvaluacion = (materiaId, lapsoId, signal) =>
  docenteApiClient.get(
    `academico/docente/plan-evaluacion/?materia_id=${materiaId}&lapso_id=${lapsoId}`,
    signal ? { signal } : undefined
  );

// Crea o actualiza el plan (bloques anidados con items anidados en el body).
// materia_id/lapso_id van en query params (así resuelve el backend a qué plan
// se refiere, tanto para crear como para editar) — el body es solo {bloques}.
// Usa PATCH cuando el plan ya existe (tiene id), POST para crearlo.
export const guardarPlanEvaluacion = (plan) => {
  const qs = `?materia_id=${plan.materia_id}&lapso_id=${plan.lapso_id}`;
  const payload = { bloques: plan.bloques };
  return plan.id
    ? docenteApiClient.patch(`academico/docente/plan-evaluacion/${qs}`, payload)
    : docenteApiClient.post(`academico/docente/plan-evaluacion/${qs}`, payload);
};

// Notas cargadas sobre el plan — roster de alumnos con sus notas por ítem/bloque.
export const getNotasPlan = (materiaId, lapsoId, signal) =>
  docenteApiClient.get(
    `academico/docente/plan-evaluacion/notas/?materia_id=${materiaId}&lapso_id=${lapsoId}`,
    signal ? { signal } : undefined
  );

// Guardado en bulk de notas: [{ item_id, alumno_id, valor_numerico | valor_letra }]
export const guardarNotasPlan = (materiaId, lapsoId, notas) =>
  docenteApiClient.post('academico/docente/plan-evaluacion/notas/', {
    materia_id: materiaId,
    lapso_id: lapsoId,
    notas,
  });
