import { createContext, useContext, useState, useCallback } from 'react';

const STORAGE_KEY = 'portal_alumno_activo_id';

export const AlumnoActivoContext = createContext(null);

/**
 * Alumno seleccionado en el portal, compartido entre Dashboard, Historial,
 * Rendimiento, Mensajes y Cantina para que elegir un hijo en cualquier
 * pantalla se mantenga al navegar a las demás. Persiste solo el id en
 * localStorage (los datos completos del alumno vienen siempre de la API,
 * que es la fuente de verdad) para sobrevivir a un refresh de página.
 */
export const AlumnoActivoProvider = ({ children }) => {
  const [alumnoActivo, setAlumnoActivoState] = useState(null);

  const setAlumnoActivo = useCallback((alumno) => {
    setAlumnoActivoState(alumno);
    try {
      if (alumno?.id != null) {
        localStorage.setItem(STORAGE_KEY, String(alumno.id));
      }
    } catch {
      // localStorage no disponible (modo privado, etc.) — no bloquea la selección en memoria
    }
  }, []);

  // Cada pantalla carga su propia lista de alumnos del representante; esta
  // función resuelve cuál debe quedar activo una vez llega esa lista:
  // conserva el ya seleccionado si sigue presente, si no intenta restaurar
  // el id persistido, y si no hay ninguno usa el primero.
  const sincronizarConLista = useCallback((alumnos) => {
    if (!alumnos || alumnos.length === 0) return;

    setAlumnoActivoState((actual) => {
      if (actual) {
        const encontrado = alumnos.find((a) => String(a.id) === String(actual.id));
        if (encontrado) return encontrado;
      }

      let persistedId = null;
      try {
        persistedId = localStorage.getItem(STORAGE_KEY);
      } catch {
        // ignorar
      }

      const porId = persistedId && alumnos.find((a) => String(a.id) === String(persistedId));
      return porId || alumnos[0];
    });
  }, []);

  return (
    <AlumnoActivoContext.Provider value={{ alumnoActivo, setAlumnoActivo, sincronizarConLista }}>
      {children}
    </AlumnoActivoContext.Provider>
  );
};

export const useAlumnoActivo = () => useContext(AlumnoActivoContext);
