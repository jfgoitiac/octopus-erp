import { useState } from 'react';
import { toast } from 'react-toastify';
import InstruccionesIOSModal from '../components/InstruccionesIOSModal';
import useInstalarApp from './useInstalarApp';

// Lanza la instalación: diálogo nativo en Android/Chrome, instrucciones en iOS.
export default function useAccionInstalar() {
  const estado = useInstalarApp();
  const [verInstrucciones, setVerInstrucciones] = useState(false);

  const accionar = async () => {
    if (estado.esIOS) {
      setVerInstrucciones(true);
      return;
    }
    try {
      const aceptado = await estado.instalar();
      if (aceptado) toast.success('¡Listo! El portal quedó en tu pantalla de inicio.');
    } catch {
      toast.error('No se pudo instalar. Intenta desde el menú de tu navegador.');
    }
  };

  const modal = (
    <InstruccionesIOSModal open={verInstrucciones} onClose={() => setVerInstrucciones(false)} />
  );

  return { ...estado, accionar, modal };
}
