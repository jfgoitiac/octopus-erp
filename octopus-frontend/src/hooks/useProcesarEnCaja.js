import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { fechaBancoAISO } from '../utils/conciliacionMasiva';
import { guardarRetornoConciliador, urlCajaComprobante } from '../components/comprobantes/cajaComprobante';

/**
 * "Procesar en caja" desde el conciliador: guarda el estado de cuenta cargado
 * y abre la caja con el comprobante del portal y los datos de la línea del
 * banco (`tx`, opcional). Al registrar, la caja vuelve con ?operacion=.
 */
export function useProcesarEnCaja({ banco, transactions, fileName }) {
  const navigate = useNavigate();
  return useCallback((comprobante, tx, bancoReceptor = banco) => {
    guardarRetornoConciliador({ banco, fileName, transactions, referencia: tx?.referencia || '' });
    navigate(urlCajaComprobante({
      cedula: comprobante.cedula_representante,
      comprobanteId: comprobante.comprobante_id,
      linea: {
        metodo: comprobante.metodo_pago || 'transferencia',
        banco: bancoReceptor,
        referencia: tx?.referencia,
        fecha: tx ? fechaBancoAISO(tx.fecha) : null,
        monto: tx?.monto,
      },
    }));
  }, [banco, transactions, fileName, navigate]);
}
