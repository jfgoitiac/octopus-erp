import { Users, Pencil, Trash2 } from 'lucide-react';

export const TablaRepresentantesSkeleton = () => (
    <tbody>
        {Array.from({ length: 6 }).map((_, i) => (
            <tr key={i} style={{ borderBottom: '0.5px solid var(--border)' }}>
                <td className="px-4 py-3"><div className="h-3 w-20 rounded animate-pulse" style={{ background: 'var(--ash-light)' }} /></td>
                <td className="px-4 py-3"><div className="h-3 w-36 rounded animate-pulse" style={{ background: 'var(--ash-light)' }} /></td>
                <td className="px-4 py-3"><div className="h-3 w-24 rounded animate-pulse" style={{ background: 'var(--ash-light)' }} /></td>
                <td className="px-4 py-3"><div className="h-3 w-32 rounded animate-pulse" style={{ background: 'var(--ash-light)' }} /></td>
                <td className="px-4 py-3"><div className="h-5 w-8 rounded-full animate-pulse" style={{ background: 'var(--ash-light)' }} /></td>
                <td className="px-4 py-3" />
            </tr>
        ))}
    </tbody>
);

const TablaRepresentantes = ({ representantes, selectedRep, canWrite, onOpenFicha, onEditar, onConfirmDelete }) => {
    if (representantes.length === 0) {
        return (
            <tbody>
                <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-xs" style={{ color: 'var(--ash)' }}>
                        No se encontraron representantes.
                    </td>
                </tr>
            </tbody>
        );
    }

    return (
        <tbody>
            {representantes.map(rep => (
                <tr
                    key={rep.id}
                    className="cursor-pointer transition-colors"
                    style={{
                        borderBottom: '0.5px solid var(--border)',
                        background: selectedRep?.id === rep.id ? 'var(--pb-light)' : 'var(--porcelain)',
                    }}
                    onMouseEnter={e => { if (selectedRep?.id !== rep.id) e.currentTarget.style.background = 'var(--ash-light)'; }}
                    onMouseLeave={e => { if (selectedRep?.id !== rep.id) e.currentTarget.style.background = 'var(--porcelain)'; }}
                    onClick={() => onOpenFicha(rep)}
                >
                    <td className="px-4 py-3 text-xs font-mono" style={{ color: 'var(--ash)' }}>{rep.cedula}</td>
                    <td className="px-4 py-3 font-medium" style={{ color: 'var(--jet)', fontSize: '13px' }}>
                        {rep.nombre} {rep.apellido}
                    </td>
                    <td className="px-4 py-3 text-xs" style={{ color: 'var(--ash)' }}>{rep.telefono || '—'}</td>
                    <td className="px-4 py-3 text-xs" style={{ color: 'var(--ash)' }}>{rep.correo || '—'}</td>
                    <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium"
                            style={{ background: 'var(--pb-light)', color: 'var(--pb-mid)' }}>
                            <Users size={11} />
                            {rep.cantidad_alumnos ?? 0}
                        </span>
                    </td>
                    <td className="px-4 py-3">
                        {canWrite && (
                            <div className="flex items-center gap-1.5" onClick={e => e.stopPropagation()}>
                                <button
                                    onClick={() => onEditar(rep)}
                                    aria-label={`Editar a ${rep.nombre} ${rep.apellido}`}
                                    className="p-1.5 rounded-lg transition-colors"
                                    style={{ color: 'var(--ash)', border: '0.5px solid var(--border-md)' }}
                                    onMouseEnter={e => { e.currentTarget.style.color = 'var(--pb)'; }}
                                    onMouseLeave={e => { e.currentTarget.style.color = 'var(--ash)'; }}
                                >
                                    <Pencil size={13} />
                                </button>
                                <button
                                    onClick={() => onConfirmDelete(rep)}
                                    aria-label={`Eliminar a ${rep.nombre} ${rep.apellido}`}
                                    className="p-1.5 rounded-lg transition-colors"
                                    style={{ color: 'var(--ash)', border: '0.5px solid var(--border-md)' }}
                                    onMouseEnter={e => { e.currentTarget.style.color = 'var(--red)'; }}
                                    onMouseLeave={e => { e.currentTarget.style.color = 'var(--ash)'; }}
                                >
                                    <Trash2 size={13} />
                                </button>
                            </div>
                        )}
                    </td>
                </tr>
            ))}
        </tbody>
    );
};

export default TablaRepresentantes;
