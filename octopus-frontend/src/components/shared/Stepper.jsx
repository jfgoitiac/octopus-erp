/**
 * Stepper — indicador horizontal de progreso para wizards de pasos.
 * Puramente informativo (no clickeable).
 *
 * Props:
 * - steps: string[]   Etiquetas de cada paso, en orden.
 * - current: number   Paso activo, 1-indexed.
 */
const Stepper = ({ steps = [], current = 1 }) => {
    return (
        <ol className="flex items-center w-full mb-4">
            {steps.map((label, i) => {
                const stepNum = i + 1;
                const isDone = stepNum < current;
                const isActive = stepNum === current;
                const isCompletedOrActive = isDone || isActive;
                const isLast = stepNum === steps.length;

                return (
                    <li key={label} className={`flex items-center ${isLast ? 'flex-none' : 'flex-1'}`}>
                        <div className="flex items-center gap-2 shrink-0">
                            <span
                                className="flex items-center justify-center w-7 h-7 rounded-full text-xs font-semibold shrink-0"
                                style={
                                    isCompletedOrActive
                                        ? { backgroundColor: 'var(--pb)', color: '#fff' }
                                        : { backgroundColor: 'var(--porcelain)', color: 'var(--ash)', border: '1px solid var(--border-md)' }
                                }
                            >
                                {stepNum}
                            </span>
                            <span
                                className={`text-sm font-medium ${isActive ? 'inline' : 'hidden sm:inline'}`}
                                style={{ color: isCompletedOrActive ? 'var(--ink)' : 'var(--ash)' }}
                            >
                                {label}
                            </span>
                        </div>
                        {!isLast && (
                            <span
                                className="flex-1 h-px mx-3"
                                style={{ backgroundColor: isDone ? 'var(--pb)' : 'var(--border-md)' }}
                            />
                        )}
                    </li>
                );
            })}
        </ol>
    );
};

export default Stepper;
