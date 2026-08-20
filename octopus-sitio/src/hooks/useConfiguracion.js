import { useContext } from 'react';
import { ConfiguracionContext } from '../context/ConfiguracionContextValue';

export const useConfiguracion = () => useContext(ConfiguracionContext);
