import React from 'react';
import { useInscripcion } from '../hooks/useInscripcion';
import { BarraProgreso }     from '../components/inscripciones/BarraProgreso';
import { PasoRepresentante } from '../components/inscripciones/PasoRepresentante';
import { PasoAlumno }        from '../components/inscripciones/PasoAlumno';
import { PasoConfiguracion } from '../components/inscripciones/PasoConfiguracion';
import { PasoConfirmacion }  from '../components/inscripciones/PasoConfirmacion';
import { PantallaExito }     from '../components/inscripciones/PantallaExito';

const Inscripciones = () => {
    const {
        paso, setPaso,
        loading, exito,
        datos, setDatos,
        handleConfirmar,
        descargarPDF,
        reiniciar,
    } = useInscripcion();

    return (
        <div className="min-h-screen pb-20 animate-fadeIn">
            <div className="max-w-6xl mx-auto px-4">
                {!exito && (
                    <header className="mb-12 text-center">
                        <h2 className="text-lg font-medium" style={{ color: 'var(--jet)' }}>
                            Admisión Octopus
                        </h2>
                        <p className="text-sm mt-1" style={{ color: 'var(--ash)' }}>
                            Módulo de control de matriculación y nuevos ingresos
                        </p>
                    </header>
                )}

                {!exito && <BarraProgreso pasoActual={paso} />}

                <div className="mt-10">
                    {exito ? (
                        <PantallaExito
                            alumno={`${datos.alumno?.nombre} ${datos.alumno?.apellido}`}
                            grado={datos.grado_seccion}
                            onReiniciar={reiniciar}
                            onDescargar={() => descargarPDF(datos.inscripcion_id)}
                        />
                    ) : (
                        <>
                            {paso === 1 && (
                                <PasoRepresentante
                                    datos={datos}
                                    setDatos={setDatos}
                                    onContinuar={() => setPaso(2)}
                                />
                            )}
                            {paso === 2 && (
                                <PasoAlumno
                                    datos={datos}
                                    setDatos={setDatos}
                                    onContinuar={() => setPaso(3)}
                                    onVolver={() => setPaso(1)}
                                />
                            )}
                            {paso === 3 && (
                                <PasoConfiguracion
                                    datos={datos}
                                    setDatos={setDatos}
                                    onContinuar={() => setPaso(4)}
                                    onVolver={() => setPaso(2)}
                                />
                            )}
                            {paso === 4 && (
                                <PasoConfirmacion
                                    datos={datos}
                                    cargando={loading}
                                    onContinuar={handleConfirmar}
                                    onVolver={() => setPaso(3)}
                                />
                            )}
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};

export default Inscripciones;