import { X, User, Info, UserCircle, DollarSign } from 'lucide-react';

const EstadoBadge = ({ alumno }) => {
    const estado = !alumno.activo ? 'Retirado' : (alumno.grado_seccion ? 'Inscrito' : 'Sin inscribir');
    const styles = {
        Inscrito:        { background: '#dcfce7', color: '#16a34a' },
        Retirado:        { background: 'var(--red-light)', color: 'var(--red)' },
        'Sin inscribir': { background: '#fef9c3', color: '#854d0e' },
    };
    return (
        <span className="px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider"
              style={styles[estado]}>
            {estado}
        </span>
    );
};

const SidebarFichaAlumno = ({ alumno, onClose, onIrCobranza }) => (
    <div className="fixed inset-0 z-[60] flex justify-end">
        <div className="absolute inset-0 backdrop-blur-sm"
             style={{ background: 'rgba(43,48,58,0.4)' }}
             onClick={onClose} />

        <div className="relative w-full max-w-md h-full shadow-2xl animate-slideInRight p-8 overflow-y-auto"
             style={{ background: 'var(--porcelain)' }}>

            <button onClick={onClose} aria-label="Cerrar ficha"
                className="absolute top-6 right-6 p-2 rounded-full"
                style={{ background: 'var(--ash-light)', color: 'var(--ash)' }}>
                <X size={20} />
            </button>

            {/* Avatar + nombre */}
            <div className="text-center mb-10">
                <div className="w-24 h-24 rounded-3xl flex items-center justify-center mx-auto mb-4 border-2"
                     style={{ background: 'var(--pb-light)', color: 'var(--pb)', borderColor: 'var(--border)' }}>
                    <User size={48} />
                </div>
                <h2 className="text-2xl font-black uppercase tracking-tighter" style={{ color: 'var(--jet)' }}>
                    {alumno.nombre} {alumno.apellido}
                </h2>
                <p className="font-bold" style={{ color: 'var(--ash)' }}>
                    Cédula: {alumno.cedula_escolar || 'Temporal'}
                </p>
                <div className="mt-2"><EstadoBadge alumno={alumno} /></div>
            </div>

            <div className="space-y-8">
                {/* Detalles Académicos */}
                <section>
                    <h4 className="text-[11px] uppercase tracking-widest mb-4 flex items-center gap-2"
                        style={{ color: 'var(--ash)' }}>
                        <Info size={14} />
                        <span style={{ color: 'var(--jet)' }}>Detalles Académicos</span>
                    </h4>
                    <div className="space-y-3">
                        {[
                            {
                                label: 'Grado Actual',
                                valor: alumno.grado_seccion ? alumno.grado_seccion.split(' - ')[0] : 'PENDIENTE',
                            },
                            {
                                label: 'Estatus de Pago',
                                valor: alumno.estatus_financiero,
                                color: alumno.estatus_financiero === 'solvente' ? '#16a34a' : 'var(--red)',
                            },
                            {
                                label: 'Porcentaje Beca',
                                valor: alumno.porcentaje_beca ? `${alumno.porcentaje_beca}%` : 'Sin beca',
                            },
                        ].map(({ label, valor, color }) => (
                            <div key={label} className="flex justify-between items-center p-3 rounded-xl"
                                 style={{ background: 'var(--ash-light)' }}>
                                <span className="text-xs font-medium" style={{ color: 'var(--ash)' }}>{label}</span>
                                <span className="text-xs font-black uppercase" style={{ color: color || 'var(--jet)' }}>
                                    {valor}
                                </span>
                            </div>
                        ))}
                    </div>
                </section>

                {/* Representante Legal */}
                {alumno.representante && (
                    <section>
                        <h4 className="text-[11px] uppercase tracking-widest mb-4 flex items-center gap-2"
                            style={{ color: 'var(--ash)' }}>
                            <UserCircle size={14} />
                            <span style={{ color: 'var(--jet)' }}>Representante Legal</span>
                        </h4>
                        <div className="p-5 rounded-2xl space-y-4"
                             style={{ background: 'var(--pb-light)', border: '0.5px solid var(--border)' }}>
                            <div>
                                <p className="text-[9px] font-black uppercase" style={{ color: 'var(--pb)' }}>Nombre</p>
                                <p className="text-sm font-bold" style={{ color: 'var(--jet)' }}>
                                    {alumno.representante.nombre} {alumno.representante.apellido}
                                </p>
                            </div>
                            <div>
                                <p className="text-[9px] font-black uppercase" style={{ color: 'var(--pb)' }}>Contacto</p>
                                <p className="text-sm font-bold" style={{ color: 'var(--jet)' }}>
                                    {alumno.representante.telefono}
                                </p>
                                <p className="text-xs" style={{ color: 'var(--ash)' }}>
                                    {alumno.representante.correo}
                                </p>
                            </div>
                        </div>
                    </section>
                )}
            </div>

            <div className="mt-12">
                <button
                    onClick={() => onIrCobranza(alumno)}
                    className="w-full py-4 text-white rounded-2xl font-bold flex items-center justify-center gap-2"
                    style={{ background: 'var(--pb)' }}>
                    <DollarSign size={18} /> Ver Estado de Cuenta
                </button>
            </div>
        </div>
    </div>
);

export default SidebarFichaAlumno;
