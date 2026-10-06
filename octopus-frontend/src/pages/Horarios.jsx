import { useState, useMemo } from 'react';
import { toast } from 'react-toastify';
import { useSearchParams, Link } from 'react-router-dom';
import { GraduationCap, Printer, Wand2, Settings2, Package, ChevronLeft, Plus, ZoomIn, ZoomOut } from 'lucide-react';
import { useHorarios } from '../hooks/useHorarios';
import { usePaquetesHorario, useGradosPaquete } from '../hooks/usePaquetesHorario';
import { INPUT_STYLE } from '../constants/styles';
import { GrillaHorario } from '../components/horarios/GrillaHorario';
import { ModalClase } from '../components/horarios/ModalClase';
import { ModalGenerador } from '../components/horarios/ModalGenerador';
import { ResumenGeneracion } from '../components/horarios/ResumenGeneracion';
import { EditorBloques } from '../components/horarios/EditorBloques';
import { PanelMaterias } from '../components/horarios/PanelMaterias';
import { ModalImprimirHorario } from '../components/horarios/ModalImprimirHorario';
import { VistaImpresionHorario } from '../components/horarios/VistaImpresionHorario';
import { ResumenHorario } from '../components/horarios/ResumenHorario';
import { ModalConfirmarIntercambio } from '../components/horarios/ModalConfirmarIntercambio';
import { PageHeader } from '../components/ui/PageHeader';
import { getHorariosDocente, getHorarios, getMaterias, listarDocentes } from '../api/academico.service';

const Horarios = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const paqueteId = searchParams.get('paquete') || '';

  const { paquetes, loading: loadingPaquetes } = usePaquetesHorario();
  const paqueteActual = useMemo(
    () => paquetes.find(p => String(p.id) === String(paqueteId)),
    [paquetes, paqueteId]
  );
  const { grados: gradosPaquete, loading: loadingGrados } = useGradosPaquete(paqueteId);

  const [grado, setGrado] = useState('');
  const [vista, setVista] = useState('grado');
  const [docenteId, setDocenteId] = useState('');
  const [horariosDocente, setHorariosDocente] = useState([]);
  const [loadingHorarioDocente, setLoadingHorarioDocente] = useState(false);
  const [grillasParalelas, setGrillasParalelas] = useState([]);
  const [loadingParalelas, setLoadingParalelas] = useState(false);
  const [escalaParalelas, setEscalaParalelas] = useState(90);

  const {
    bloques, horarios, materias,
    loading, saving, savingMateria, generando,
    getClaseEnBloque,
    tieneConflicto,
    guardar, eliminar, intercambiar, pinear, generar, deshacerGeneracion, recargar,
    crearMateria, actualizarMateria, eliminarMateria,
  } = useHorarios(paqueteId, grado);

  // modal: null | { clase: objeto|null, bloque: bloque|null }
  const [modal, setModal]                 = useState(null);
  const [showGenerador, setShowGenerador]  = useState(false);
  const [resultadoGeneracion, setResultadoGeneracion] = useState(null);
  const [showEditorBloques, setShowEditorBloques]     = useState(false);
  const [showImprimir, setShowImprimir] = useState(false);
  const [docentes, setDocentes] = useState([]);
  const [loadingDocentes, setLoadingDocentes] = useState(false);
  const [impresion, setImpresion] = useState(null);
  const [materiaActiva, setMateriaActiva] = useState(null);
  const [intercambioPendiente, setIntercambioPendiente] = useState(null);

  const docenteActivo = useMemo(
    () => docentes.find(item => String(item.user_id) === String(docenteId)),
    [docentes, docenteId]
  );
  const usandoVistaDocente = vista === 'docente';
  const usandoVistaParalela = vista === 'paralelo';
  const horariosVisibles = usandoVistaDocente ? horariosDocente : horarios;
  const materiasVisibles = usandoVistaDocente ? (docenteActivo?.materias || []) : materias;
  const claseVisiblePorBloque = useMemo(() => {
    const indice = new Map();
    horariosVisibles.forEach(clase => {
      if (clase.bloque_id != null) indice.set(clase.bloque_id, clase);
    });
    return indice;
  }, [horariosVisibles]);
  const horasAsignadasPorMateria = useMemo(() => horariosVisibles.reduce((totales, clase) => {
    const materiaId = clase.materia?.id;
    if (materiaId) totales[materiaId] = (totales[materiaId] || 0) + 1;
    return totales;
  }, {}), [horariosVisibles]);
  const getClaseVisibleEnBloque = (bloqueId) => claseVisiblePorBloque.get(bloqueId) || null;
  const tieneConflictoVisible = (form) => {
    if (!usandoVistaDocente) return tieneConflicto(form);
    const existente = claseVisiblePorBloque.get(form.bloque_id);
    return !!existente && existente.id !== form.id;
  };

  const seleccionarPaquete = (id) => {
    setGrado('');
    setDocenteId('');
    setHorariosDocente([]);
    setSearchParams(id ? { paquete: id } : {});
  };

  const cargarDocentes = async () => {
    if (docentes.length) return docentes;
    setLoadingDocentes(true);
    try {
      const respuesta = await listarDocentes({ activo: true });
      const lista = respuesta.data || [];
      setDocentes(lista);
      return lista;
    } catch {
      toast.error('No se pudo cargar la lista de profesores.');
      return [];
    } finally {
      setLoadingDocentes(false);
    }
  };

  const cargarHorarioDocente = async (id) => {
    if (!id || !paqueteId) { setHorariosDocente([]); return; }
    setLoadingHorarioDocente(true);
    try {
      const respuesta = await getHorariosDocente(paqueteId, id);
      setHorariosDocente(respuesta.data || []);
    } catch {
      toast.error('No se pudo cargar el horario del profesor.');
    } finally {
      setLoadingHorarioDocente(false);
    }
  };

  const cargarGrillasParalelas = async () => {
    if (!paqueteId || !gradosPaquete.length) { setGrillasParalelas([]); return; }
    setLoadingParalelas(true);
    try {
      const datos = await Promise.all(gradosPaquete.map(async ({ grado_seccion: gradoParalelo }) => {
        const [horariosRespuesta, materiasRespuesta] = await Promise.all([
          getHorarios(paqueteId, gradoParalelo), getMaterias(gradoParalelo),
        ]);
        return { grado: gradoParalelo, horarios: horariosRespuesta.data || [], materias: materiasRespuesta.data || [] };
      }));
      setGrillasParalelas(datos);
    } catch {
      toast.error('No se pudieron cargar las grillas paralelas.');
    } finally {
      setLoadingParalelas(false);
    }
  };

  const cambiarVista = async (nuevaVista) => {
    setVista(nuevaVista);
    setMateriaActiva(null);
    if (nuevaVista === 'docente') await cargarDocentes();
    if (nuevaVista === 'paralelo') await cargarGrillasParalelas();
  };

  const seleccionarDocente = async (id) => {
    setDocenteId(id);
    setMateriaActiva(null);
    await cargarHorarioDocente(id);
  };

  const abrirCelda = (bloque, materiasContexto = null) => {
    setModal({ clase: null, bloque, materiasContexto });
  };

  const agregarClase = () => {
    const bloqueLibre = bloques.find(bloque => bloque.tipo === 'clase' && !getClaseVisibleEnBloque(bloque.id));
    if (!bloqueLibre) {
      toast.info('No hay bloques libres. Mueve o elimina una clase para crear espacio.');
      return;
    }
    abrirCelda(bloqueLibre);
  };

  const asignarRapido = async (bloque) => {
    if (!materiaActiva) return abrirCelda(bloque);
    const ok = await guardar({
      materia_id: materiaActiva.id,
      dia_semana: bloque.dia_semana,
      bloque_id: bloque.id,
      aula: '',
    });
    if (!ok) return;
    if (usandoVistaDocente) await cargarHorarioDocente(docenteId);
  };

  const editarClase = (clase) => {
    setModal({ clase, bloque: null });
  };

  const cerrarModal = () => setModal(null);

  const handleGuardar = async (form) => {
    const ok = await guardar(form);
    if (ok) {
      if (usandoVistaDocente) await cargarHorarioDocente(docenteId);
      if (usandoVistaParalela) await cargarGrillasParalelas();
      cerrarModal();
    }
  };

  const handleEliminar = async (id) => {
    const ok = await eliminar(id);
    if (ok) {
      if (usandoVistaDocente) await cargarHorarioDocente(docenteId);
      if (usandoVistaParalela) await cargarGrillasParalelas();
      cerrarModal();
    }
  };

  // Drag & drop: mover una clase existente a otro bloque (mismo día u otro)
  const handleMoverClase = async (clase, bloqueDestino) => {
    const ok = await guardar({
      id: clase.id,
      materia_id: clase.materia?.id,
      dia_semana: bloqueDestino.dia_semana,
      bloque_id: bloqueDestino.id,
      aula: clase.aula,
    });
    if (ok && usandoVistaDocente) await cargarHorarioDocente(docenteId);
    if (ok && usandoVistaParalela) await cargarGrillasParalelas();
  };

  const handleIntercambiarClase = async (origen, destino) => {
    setIntercambioPendiente({ origen, destino });
  };

  const confirmarIntercambio = async () => {
    if (!intercambioPendiente) return;
    const ok = await intercambiar(intercambioPendiente.origen.id, intercambioPendiente.destino.id);
    if (ok) {
      if (usandoVistaDocente) await cargarHorarioDocente(docenteId);
      if (usandoVistaParalela) await cargarGrillasParalelas();
      setIntercambioPendiente(null);
    }
  };

  const handleGenerar = async (config) => generar(config);

  const abrirImpresion = async () => {
    setShowImprimir(true);
    await cargarDocentes();
  };

  const imprimir = async ({ tipo, docenteId, titulo, subtitulo }) => {
    let horariosParaImprimir = horarios;
    let detalle = `Grado: ${grado} · ${paqueteActual?.nombre || ''}`;
    if (tipo === 'docente') {
      try {
        const respuesta = await getHorariosDocente(paqueteId, docenteId);
        horariosParaImprimir = respuesta.data || [];
        const docente = docentes.find(item => String(item.user_id) === String(docenteId));
        detalle = `Profesor: ${docente?.nombre_completo || ''} · ${paqueteActual?.nombre || ''}`;
      } catch {
        toast.error('No se pudo cargar el horario del profesor.');
        return false;
      }
    }
    setImpresion({ horarios: horariosParaImprimir, encabezado: { titulo, subtitulo, detalle } });
    requestAnimationFrame(() => requestAnimationFrame(() => window.print()));
    return true;
  };

  const handleGeneradoOk = (data) => {
    setShowGenerador(false);
    setResultadoGeneracion(data);
    recargar();
  };

  // Paso 1: no hay paquete seleccionado — elegir uno
  if (!paqueteId) {
    return (
      <div className="animate-fadeIn">
        <PageHeader
          titulo="Horarios de Clases"
          descripcion="Selecciona un paquete de horario para ver o editar su grilla"
          acciones={
            <Link
              to="/horarios/paquetes"
              className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white transition-colors"
              style={{ background: 'var(--pb)' }}
            >
              <Package size={16} />
              Gestionar paquetes
            </Link>
          }
        />

        {loadingPaquetes ? (
          <p className="text-sm" style={{ color: 'var(--ash)' }}>Cargando paquetes de horario...</p>
        ) : paquetes.length === 0 ? (
          <div className="rounded-xl p-16 text-center"
            style={{ border: '0.5px solid var(--border-md)', background: 'var(--porcelain)', color: 'var(--ash)' }}>
            <Package size={40} className="mx-auto mb-3 opacity-30" />
            <p className="text-sm">Aún no hay paquetes de horario. Crea uno desde "Gestionar paquetes".</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {paquetes.map(p => (
              <button
                key={p.id}
                onClick={() => seleccionarPaquete(p.id)}
                className="text-left rounded-xl p-4 transition-colors hover:bg-[var(--pb-light)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--pb)]/40"
                style={{ border: '0.5px solid var(--border-md)', background: 'var(--porcelain)' }}
              >
                <p className="text-sm font-semibold" style={{ color: 'var(--jet)' }}>{p.nombre}</p>
                <p className="text-xs mt-1" style={{ color: 'var(--ash)' }}>{p.periodo_escolar}</p>
                <p className="text-[11px] mt-2" style={{ color: 'var(--ash)' }}>
                  {p.grados?.length || 0} grado{(p.grados?.length || 0) !== 1 ? 's' : ''} · {p.estado === 'publicado' ? 'Publicado' : 'Borrador'}
                </p>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="animate-fadeIn">

      {/* Header — oculto al imprimir */}
      <div className="print:hidden">
        <PageHeader
          titulo={paqueteActual ? paqueteActual.nombre : 'Horarios de Clases'}
          descripcion={usandoVistaDocente ? 'Cuadra la carga semanal de cada profesor sin salir de la grilla' : usandoVistaParalela ? 'Compara y ajusta los grados del paquete lado a lado' : 'Visualiza y edita la grilla horaria por grado'}
          acciones={
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={() => setShowEditorBloques(true)}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors hover:bg-[var(--ash-light)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--pb)]/40 focus-visible:ring-offset-2"
                style={{ border: '0.5px solid var(--border-md)', color: 'var(--ash)' }}
              >
                <Settings2 size={16} />
                Editar bloques
              </button>
              <button
                onClick={agregarClase}
                disabled={usandoVistaParalela || !(usandoVistaDocente ? docenteId : grado) || !bloques.length}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--pb)]/40 focus-visible:ring-offset-2"
                style={{ border: '0.5px solid var(--border-md)', color: 'var(--pb)' }}
              >
                <Plus size={16} />
                Agregar clase
              </button>
              <button
                onClick={() => setShowGenerador(true)}
                disabled={!bloques.length}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--pb)]/40 focus-visible:ring-offset-2"
                style={{ background: 'var(--pb)' }}
                title={!bloques.length ? 'Configura bloques primero' : 'Generar horario automáticamente para todo el paquete'}
              >
                <Wand2 size={16} />
                Generar automático
              </button>
              <button
                onClick={abrirImpresion}
                disabled={!(usandoVistaDocente ? docenteId : grado) || !bloques.length}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed hover:enabled:bg-[var(--ash-light)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--pb)]/40 focus-visible:ring-offset-2"
                style={{ border: '0.5px solid var(--border-md)', color: 'var(--ash)' }}
              >
                <Printer size={16} />
                Vista imprimible
              </button>
            </div>
          }
        />
        <button
          onClick={() => setSearchParams({})}
          className="mb-4 flex items-center gap-1.5 text-xs font-medium"
          style={{ color: 'var(--pb)' }}
        >
          <ChevronLeft size={14} />
          Cambiar paquete de horario
        </button>
      </div>

      {/* Elegir la forma de cuadrar el horario — oculto al imprimir */}
      <div className="mb-6 print:hidden">
        <div className="inline-flex rounded-lg p-1 mb-4" style={{ background: 'var(--ash-light)' }}>
          <button type="button" onClick={() => cambiarVista('grado')} className="px-3 py-1.5 rounded-md text-xs font-semibold transition-colors" style={{ background: vista === 'grado' ? 'var(--porcelain)' : 'transparent', color: vista === 'grado' ? 'var(--pb)' : 'var(--ash)', boxShadow: vista === 'grado' ? '0 1px 2px rgba(0,0,0,.08)' : 'none' }}>Por grado</button>
          <button type="button" onClick={() => cambiarVista('docente')} className="px-3 py-1.5 rounded-md text-xs font-semibold transition-colors" style={{ background: usandoVistaDocente ? 'var(--porcelain)' : 'transparent', color: usandoVistaDocente ? 'var(--pb)' : 'var(--ash)', boxShadow: usandoVistaDocente ? '0 1px 2px rgba(0,0,0,.08)' : 'none' }}>Por profesor</button>
          <button type="button" onClick={() => cambiarVista('paralelo')} className="px-3 py-1.5 rounded-md text-xs font-semibold transition-colors" style={{ background: usandoVistaParalela ? 'var(--porcelain)' : 'transparent', color: usandoVistaParalela ? 'var(--pb)' : 'var(--ash)', boxShadow: usandoVistaParalela ? '0 1px 2px rgba(0,0,0,.08)' : 'none' }}>Grillas paralelas</button>
        </div>
        <div className="max-w-xs">
        <label className="block text-[11px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>
          {usandoVistaDocente ? 'Profesor' : usandoVistaParalela ? 'Grados del paquete' : 'Grado / Año'}
        </label>
        {usandoVistaParalela ? (
          <p className="text-sm" style={{ color: 'var(--ash)' }}>Se muestran {gradosPaquete.length} grillas lado a lado. Selecciona una celda para editar ese grado.</p>
        ) : usandoVistaDocente ? (
          <select value={docenteId} onChange={e => seleccionarDocente(e.target.value)} disabled={loadingDocentes} className="w-full px-3 py-2 rounded-lg text-sm outline-none disabled:opacity-60" style={INPUT_STYLE}>
            <option value="">{loadingDocentes ? 'Cargando profesores...' : 'Seleccionar profesor...'}</option>
            {docentes.map(docente => <option key={docente.user_id} value={docente.user_id}>{docente.nombre_completo || docente.username}</option>)}
          </select>
        ) : loadingGrados ? (
          <p className="text-sm" style={{ color: 'var(--ash)' }}>Cargando grados...</p>
        ) : gradosPaquete.length === 0 ? (
          <p className="text-sm" style={{ color: 'var(--ash)' }}>
            Este paquete no tiene grados. Agrégalos desde{' '}
            <Link to="/horarios/paquetes" className="underline" style={{ color: 'var(--pb)' }}>Gestionar paquetes</Link>.
          </p>
        ) : (
          <select
            value={grado}
            onChange={e => { setGrado(e.target.value); setMateriaActiva(null); }}
            className="w-full px-3 py-2 rounded-lg text-sm outline-none"
            style={INPUT_STYLE}
          >
            <option value="">Seleccionar...</option>
            {gradosPaquete.map(g => (
              <option key={g.id} value={g.grado_seccion}>{g.grado_seccion}</option>
            ))}
          </select>
        )}
        </div>
      </div>

      {/* Materias disponibles para el grado o profesor seleccionado */}
      {(usandoVistaDocente ? docenteId : grado) && !usandoVistaParalela && (
        <>
          <ResumenHorario bloques={bloques} horarios={horariosVisibles} materias={materiasVisibles} modoDocente={usandoVistaDocente} />
          <PanelMaterias
            materias={materiasVisibles}
            savingMateria={savingMateria}
            materiaActiva={materiaActiva}
            onSeleccionarMateria={setMateriaActiva}
            onCrear={crearMateria}
            onActualizar={actualizarMateria}
            onEliminar={eliminarMateria}
            titulo={usandoVistaDocente ? `Organiza por profesor: ${docenteActivo?.nombre_completo || ''}` : undefined}
            permitirGestion={!usandoVistaDocente}
            mostrarDocente={!usandoVistaDocente}
            mensajeVacio={usandoVistaDocente ? 'Este profesor todavía no tiene materias asignadas.' : undefined}
            horasAsignadasPorMateria={usandoVistaDocente ? horasAsignadasPorMateria : undefined}
            instruccion={usandoVistaDocente ? 'Cada materia muestra horas asignadas / horas requeridas. Selecciona una para ubicarla rápidamente.' : undefined}
          />
        </>
      )}

      {/* Título visible solo al imprimir */}
      {impresion && <VistaImpresionHorario bloques={bloques} horarios={impresion.horarios} encabezado={impresion.encabezado} />}

      {/* Contenido principal */}
      {usandoVistaParalela ? (
        <div className="print:hidden">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl px-4 py-3" style={{ border: '0.5px solid var(--border-md)', background: 'var(--porcelain)' }}>
            <div>
              <p className="text-sm font-semibold" style={{ color: 'var(--jet)' }}>Tamaño de las grillas</p>
              <p className="text-xs mt-0.5" style={{ color: 'var(--ash)' }}>Reduce el tamaño para comparar más fácilmente los horarios.</p>
            </div>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setEscalaParalelas(valor => Math.max(70, valor - 5))} disabled={escalaParalelas <= 70} className="p-2 rounded-lg disabled:opacity-40" style={{ border: '0.5px solid var(--border-md)', color: 'var(--pb)' }} aria-label="Reducir tamaño de las grillas"><ZoomOut size={16} /></button>
              <input type="range" min="70" max="100" step="5" value={escalaParalelas} onChange={event => setEscalaParalelas(Number(event.target.value))} className="w-28 accent-[var(--pb)]" aria-label="Tamaño de las grillas paralelas" />
              <button type="button" onClick={() => setEscalaParalelas(valor => Math.min(100, valor + 5))} disabled={escalaParalelas >= 100} className="p-2 rounded-lg disabled:opacity-40" style={{ border: '0.5px solid var(--border-md)', color: 'var(--pb)' }} aria-label="Aumentar tamaño de las grillas"><ZoomIn size={16} /></button>
              <span className="w-10 text-right text-sm font-semibold tabular-nums" style={{ color: 'var(--pb)' }}>{escalaParalelas}%</span>
            </div>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {grillasParalelas.map(grilla => {
              const clasesPorBloque = new Map(grilla.horarios.filter(clase => clase.bloque_id != null).map(clase => [clase.bloque_id, clase]));
              return <section key={grilla.grado} className="rounded-xl p-3" style={{ border: '0.5px solid var(--border-md)', background: 'var(--porcelain)' }}>
                <h2 className="text-sm font-semibold mb-3" style={{ color: 'var(--jet)' }}>{grilla.grado}</h2>
                <div style={{ zoom: escalaParalelas / 100 }}>
                  <GrillaHorario loading={loadingParalelas} bloques={bloques} getClaseEnBloque={id => clasesPorBloque.get(id) || null}
                    onCeldaClick={bloque => abrirCelda(bloque, grilla.materias)} onEditarClase={clase => setModal({ clase, bloque: null, materiasContexto: grilla.materias })}
                    onTogglePin={async clase => { const ok = await pinear(clase.id, !clase.pineado); if (ok) cargarGrillasParalelas(); }}
                    onMoverClase={handleMoverClase} onIntercambiarClase={handleIntercambiarClase} />
                </div>
              </section>;
            })}
            {!loadingParalelas && !grillasParalelas.length && <p className="text-sm" style={{ color: 'var(--ash)' }}>Este paquete todavía no tiene grados para mostrar.</p>}
          </div>
        </div>
      ) : !(usandoVistaDocente ? docenteId : grado) ? (
        <div className="rounded-xl p-16 text-center"
          style={{ border: '0.5px solid var(--border-md)', background: 'var(--porcelain)', color: 'var(--ash)' }}>
          <GraduationCap size={40} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm">{usandoVistaDocente ? 'Selecciona un profesor para cuadrar su horario.' : 'Selecciona un grado para ver el horario.'}</p>
        </div>
      ) : (
        <div className="print:hidden"><GrillaHorario
          loading={usandoVistaDocente ? loadingHorarioDocente : loading}
          bloques={bloques}
          getClaseEnBloque={usandoVistaDocente ? getClaseVisibleEnBloque : getClaseEnBloque}
          onCeldaClick={abrirCelda}
          onEditarClase={editarClase}
          onTogglePin={async (clase) => { const ok = await pinear(clase.id, !clase.pineado); if (ok && usandoVistaDocente) cargarHorarioDocente(docenteId); }}
          onMoverClase={handleMoverClase}
          onIntercambiarClase={handleIntercambiarClase}
          materiaActiva={materiaActiva}
          onAsignarRapido={asignarRapido}
        /></div>
      )}

      {(usandoVistaDocente ? docenteId : grado) && !(usandoVistaDocente ? loadingHorarioDocente : loading) && !!bloques.length && (
        <p className="mt-3 text-xs print:hidden" style={{ color: 'var(--ash)' }}>
          Selecciona una materia para colocarla en varios bloques con un toque. Haz doble clic en una materia para editarla; arrastra una clase para moverla.
        </p>
      )}

      {/* Modal clase (crear / editar) */}
      {modal && (
        <ModalClase
          materias={modal.materiasContexto || materiasVisibles}
          claseInicial={modal.clase}
          bloque={modal.bloque}
          saving={saving}
          tieneConflicto={tieneConflictoVisible}
          onClose={cerrarModal}
          onSave={handleGuardar}
          onDelete={handleEliminar}
        />
      )}

      {/* Modal generador automático */}
      {showGenerador && (
        <ModalGenerador
          generando={generando}
          onClose={() => setShowGenerador(false)}
          onGenerar={handleGenerar}
          onGeneradoOk={handleGeneradoOk}
        />
      )}

      {/* Resumen post-generación */}
      {resultadoGeneracion && (
        <ResumenGeneracion
          resultado={resultadoGeneracion}
          deshaciendo={generando}
          onClose={() => setResultadoGeneracion(null)}
          onDeshacer={deshacerGeneracion}
        />
      )}

      {/* Editor de bloques de la jornada */}
      {showEditorBloques && (
        <EditorBloques
          paqueteId={paqueteId}
          onClose={() => { setShowEditorBloques(false); recargar(); }}
        />
      )}

      {showImprimir && (
        <ModalImprimirHorario
          grado={grado}
          docentes={docentes}
          loadingDocentes={loadingDocentes}
          onClose={() => setShowImprimir(false)}
          onPrint={imprimir}
        />
      )}

      {intercambioPendiente && (
        <ModalConfirmarIntercambio
          origen={intercambioPendiente.origen}
          destino={intercambioPendiente.destino}
          saving={saving}
          onClose={() => setIntercambioPendiente(null)}
          onConfirmar={confirmarIntercambio}
        />
      )}

    </div>
  );
};

export default Horarios;
