import { createContext, useContext } from 'react';

export const AlumnoActivoContext = createContext(null);

export const useAlumnoActivo = () => useContext(AlumnoActivoContext);
