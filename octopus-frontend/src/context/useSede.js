import { createContext, useContext } from 'react';

export const SedeContext = createContext(null);

export const useSede = () => useContext(SedeContext);
