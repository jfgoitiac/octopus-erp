/** Skeleton de la pestaña: lista a la izquierda y hilo a la derecha (en móvil solo la lista). */
export function ConversacionesSkeleton() {
    return (
        <div className="grid grid-cols-1 lg:grid-cols-[20rem_minmax(0,1fr)] gap-0 rounded-2xl overflow-hidden animate-pulse"
            style={{ border: '1px solid var(--border)', background: 'var(--surface)' }} aria-hidden="true">
            <div className="p-3 space-y-4">
                <div className="h-11 rounded-xl" style={{ background: 'var(--ash-light)' }} />
                {Array.from({ length: 6 }, (_, i) => (
                    <div key={i} className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full shrink-0" style={{ background: 'var(--ash-light)' }} />
                        <div className="flex-1 space-y-2">
                            <div className="h-3 w-2/3 rounded" style={{ background: 'var(--ash-light)' }} />
                            <div className="h-3 w-full rounded" style={{ background: 'var(--ash-light)' }} />
                        </div>
                    </div>
                ))}
            </div>
            <div className="hidden lg:block p-4 space-y-3" style={{ borderLeft: '1px solid var(--border)' }}>
                <div className="h-6 w-1/3 rounded" style={{ background: 'var(--ash-light)' }} />
                <div className="h-14 w-2/3 rounded-2xl" style={{ background: 'var(--ash-light)' }} />
                <div className="h-14 w-1/2 rounded-2xl ml-auto" style={{ background: 'var(--ash-light)' }} />
                <div className="h-14 w-3/5 rounded-2xl" style={{ background: 'var(--ash-light)' }} />
            </div>
        </div>
    );
}

export default ConversacionesSkeleton;
