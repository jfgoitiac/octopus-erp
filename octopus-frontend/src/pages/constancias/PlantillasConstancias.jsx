import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'react-toastify';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import {
  Plus, Pencil, Power, Trash2, FileText, AlertTriangle, ShieldCheck,
} from 'lucide-react';
import { getPlantillas, actualizarPlantilla, eliminarPlantilla } from '../../services/constancias';
import { PageHeader } from '../../components/ui/PageHeader';
import { Card } from '../../components/ui/Card';
import { Tabla } from '../../components/ui/Tabla';
import { Modal } from '../../components/ui/Modal';
import { TableRowSkeleton } from '../../components/shared/Skeleton';

const DESTINATARIO_LABEL = {
  alumno: 'Alumno',
  trabajador: 'Trabajador',
  representante: 'Representante',
};

const TIPO_LABEL = {
  estudio: 'Estudio',
  buena_conducta: 'Buena conducta',
  trabajo: 'Trabajo',
};

const ActivaBadge = ({ activa }) => (
  <span
    className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full whitespace-nowrap"
    style={{
      background: activa ? '#dcfce7' : '#f1f5f9',
      color: activa ? '#16a34a' : '#64748b',
    }}
  >
    <span
      className="w-1.5 h-1.5 rounded-full"
      style={{ background: activa ? '#16a34a' : '#94a3b8' }}
    />
    {activa ? 'Activa' : 'Inactiva'}
  </span>
);

export default function PlantillasConstancias() {
  const [plantillas, setPlantillas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [togglingId, setTogglingId] = useState(null);
  const [aEliminar, setAEliminar] = useState(null);
  const [eliminando, setEliminando] = useState(false);

  const cargar = useCallback(async (signal) => {
    setLoading(true);
    try {
      const res = await getPlantillas(undefined, signal);
      const data = res.data;
      setPlantillas(Array.isArray(data) ? data : (data?.results ?? []));
    } catch (err) {
      if (err.code === 'ERR_CANCELED' || err.name === 'AbortError' || err.name === 'CanceledError') return;
      toast.error('No se pudieron cargar las plantillas de constancias.');
      setPlantillas([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    cargar(controller.signal);
    return () => controller.abort();
  }, [cargar]);

  const handleToggleActiva = async (plantilla) => {
    setTogglingId(plantilla.id);
    try {
      await actualizarPlantilla(plantilla.id, { ...plantilla, activa: !plantilla.activa });
      setPlantillas(prev => prev.map(p => p.id === plantilla.id ? { ...p, activa: !p.activa } : p));
      toast.success(plantilla.activa ? 'Plantilla desactivada.' : 'Plantilla activada.');
    } catch (err) {
      toast.error(err.response?.data?.detail || 'No se pudo cambiar el estado de la plantilla.');
    } finally {
      setTogglingId(null);
    }
  };

  const confirmarEliminar = (plantilla) => setAEliminar(plantilla);

  const handleEliminar = async () => {
    if (!aEliminar) return;
    setEliminando(true);
    try {
      await eliminarPlantilla(aEliminar.id);
      setPlantillas(prev => prev.filter(p => p.id !== aEliminar.id));
      toast.success('Plantilla eliminada.');
      setAEliminar(null);
    } catch (err) {
      if (err.response?.status === 409) {
        toast.warning(
          err.response?.data?.detail ||
          'No se puede eliminar: esta plantilla tiene constancias emitidas. Desactívala en vez de borrarla.'
        );
      } else {
        toast.error(err.response?.data?.detail || 'No se pudo eliminar la plantilla.');
      }
    } finally {
      setEliminando(false);
    }
  };

  const columnas = [
    { key: 'nombre', label: 'Nombre' },
    { key: 'tipo', label: 'Tipo' },
    { key: 'destinatario', label: 'Destinatario' },
    { key: 'activa', label: 'Activa' },
    { key: 'actualizada', label: 'Actualizada' },
    { key: 'acciones', label: '' },
  ];

  return (
    <div>
      <PageHeader
        titulo="Plantillas de constancias"
        descripcion="Gestiona las plantillas disponibles para emitir constancias"
        acciones={
          <Link
            to="nueva"
            className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-xs font-semibold text-white min-h-[44px]"
            style={{ background: 'linear-gradient(135deg, var(--pb) 0%, var(--pb-mid) 100%)' }}
          >
            <Plus size={14} /> Nueva plantilla
          </Link>
        }
      />

      <Card padding="none">
        <Tabla columnas={columnas} minWidth={720}>
          {loading ? (
            <TableRowSkeleton cols={6} rows={5} />
          ) : plantillas.length === 0 ? (
            <tr>
              <td colSpan={6} className="px-4 py-12 text-center">
                <div className="flex flex-col items-center gap-2">
                  <FileText size={28} style={{ color: 'var(--ash)' }} />
                  <p className="text-xs" style={{ color: 'var(--ash)' }}>
                    Todavía no hay plantillas de constancias.
                  </p>
                </div>
              </td>
            </tr>
          ) : plantillas.map((p) => (
            <tr key={p.id}>
              <td className="px-3 py-3 sm:px-4">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium" style={{ color: 'var(--jet)' }}>{p.nombre}</span>
                  {p.permite_estampado && (
                    <span title="Permite firma y sello">
                      <ShieldCheck size={13} style={{ color: 'var(--pb)' }} />
                    </span>
                  )}
                </div>
              </td>
              <td className="px-3 py-3 sm:px-4 text-xs" style={{ color: 'var(--ash)' }}>
                {TIPO_LABEL[p.tipo] || p.tipo}
              </td>
              <td className="px-3 py-3 sm:px-4 text-xs" style={{ color: 'var(--ash)' }}>
                {DESTINATARIO_LABEL[p.destinatario] || p.destinatario}
              </td>
              <td className="px-3 py-3 sm:px-4">
                <ActivaBadge activa={p.activa} />
              </td>
              <td className="px-3 py-3 sm:px-4 text-xs whitespace-nowrap" style={{ color: 'var(--ash)' }}>
                {p.actualizada_en
                  ? format(parseISO(p.actualizada_en), "dd 'de' MMMM 'de' yyyy", { locale: es })
                  : '—'}
              </td>
              <td className="px-3 py-3 sm:px-4">
                <div className="flex items-center justify-end gap-1.5">
                  <Link
                    to={`${p.id}/editar`}
                    aria-label={`Editar plantilla ${p.nombre}`}
                    title="Editar"
                    className="flex items-center justify-center w-8 h-8 rounded-lg"
                    style={{ background: 'var(--pb-light)', color: 'var(--pb-mid)' }}
                  >
                    <Pencil size={14} />
                  </Link>
                  <button
                    onClick={() => handleToggleActiva(p)}
                    disabled={togglingId === p.id}
                    aria-label={p.activa ? `Desactivar plantilla ${p.nombre}` : `Activar plantilla ${p.nombre}`}
                    title={p.activa ? 'Desactivar' : 'Activar'}
                    className="flex items-center justify-center w-8 h-8 rounded-lg disabled:opacity-50"
                    style={{ background: 'var(--ash-light)', color: 'var(--ash)' }}
                  >
                    <Power size={14} />
                  </button>
                  <button
                    onClick={() => confirmarEliminar(p)}
                    aria-label={`Eliminar plantilla ${p.nombre}`}
                    title="Eliminar"
                    className="flex items-center justify-center w-8 h-8 rounded-lg"
                    style={{ background: '#fee2e2', color: '#dc2626' }}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </Tabla>
      </Card>

      <Modal
        open={!!aEliminar}
        onClose={() => !eliminando && setAEliminar(null)}
        titulo="Eliminar plantilla"
        footer={
          <>
            <button
              onClick={() => setAEliminar(null)}
              disabled={eliminando}
              className="w-full sm:w-auto px-4 py-2.5 rounded-lg text-xs font-semibold min-h-[44px]"
              style={{ border: '0.5px solid var(--border-md)', color: 'var(--ash)' }}
            >
              Cancelar
            </button>
            <button
              onClick={handleEliminar}
              disabled={eliminando}
              className="w-full sm:w-auto px-4 py-2.5 rounded-lg text-xs font-semibold text-white disabled:opacity-60 min-h-[44px]"
              style={{ background: '#dc2626' }}
            >
              {eliminando ? 'Eliminando…' : 'Eliminar'}
            </button>
          </>
        }
      >
        <div className="flex items-start gap-3">
          <AlertTriangle size={20} style={{ color: '#dc2626', flexShrink: 0 }} />
          <p className="text-sm" style={{ color: 'var(--jet)' }}>
            ¿Seguro que deseas eliminar la plantilla <strong>{aEliminar?.nombre}</strong>? Si ya tiene
            constancias emitidas, el sistema sugerirá desactivarla en su lugar.
          </p>
        </div>
      </Modal>
    </div>
  );
}
