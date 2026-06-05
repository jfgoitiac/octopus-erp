import { parse, differenceInYears, isValid } from 'date-fns';
import { CATEGORIAS_DOCENTE } from '../../constants/avec';

const inputCls   = 'w-full px-3 py-2 rounded-lg text-sm outline-none';
const inputStyle = { border: '0.5px solid var(--border-md)', background: 'var(--porcelain)', color: 'var(--jet)' };
const labelCls   = 'block text-[11px] uppercase tracking-widest mb-1.5';
const labelStyle = { color: 'var(--ash)' };
const Req        = () => <span style={{ color: 'var(--red)' }}>*</span>;

function calcularAnosServicio(fechaStr) {
    if (!fechaStr || fechaStr.length < 10) return null;
    const fecha = parse(fechaStr, 'dd/MM/yyyy', new Date());
    if (!isValid(fecha) || fecha >= new Date()) return null;
    return differenceInYears(new Date(), fecha);
}

function SectionLabel({ text }) {
    return (
        <p className="text-[10px] uppercase tracking-widest font-medium pt-1"
            style={{ color: 'var(--ash)', opacity: 0.6 }}>
            {text}
        </p>
    );
}

export function EmpleadoForm({ data, onChange, bancosNomina, showTipoSelect = false, autoFocusNombre = false }) {
    const tipo = data.tipo_personal || 'docente';
    const isDocente        = tipo === 'docente';
    const isAdministrativo = tipo === 'administrativo';

    const handleFechaIngresoChange = (e) => {
        onChange(e);
        const anos = calcularAnosServicio(e.target.value);
        if (anos !== null) {
            onChange({ target: { name: 'anos_servicio', value: String(anos) } });
        }
    };

    const anosCalculados = calcularAnosServicio(data.fecha_ingreso);

    return (
        <div className="space-y-3">
            {/* Tipo de personal — solo visible en modo edición */}
            {showTipoSelect && (
                <div>
                    <label className={labelCls} style={labelStyle}>Tipo de personal <Req /></label>
                    <select name="tipo_personal" value={data.tipo_personal} onChange={onChange}
                        className={inputCls} style={inputStyle}>
                        <option value="docente">Docente</option>
                        <option value="apoyo">Personal de Apoyo</option>
                        <option value="administrativo">Administrativo</option>
                    </select>
                </div>
            )}

            {/* Nombre + Apellido */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                    <label className={labelCls} style={labelStyle}>Nombre <Req /></label>
                    <input name="nombre" value={data.nombre} onChange={onChange}
                        placeholder="Juan" className={inputCls} style={inputStyle}
                        autoFocus={autoFocusNombre} />
                </div>
                <div>
                    <label className={labelCls} style={labelStyle}>Apellido <Req /></label>
                    <input name="apellido" value={data.apellido} onChange={onChange}
                        placeholder="Pérez" className={inputCls} style={inputStyle} />
                </div>
            </div>

            {/* Cédula + Cargo */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                    <label className={labelCls} style={labelStyle}>Cédula <Req /></label>
                    <input name="cedula" value={data.cedula} onChange={onChange}
                        placeholder="V-12345678" className={inputCls} style={inputStyle} />
                    <p className="text-[10px] mt-1" style={{ color: 'var(--ash)' }}>
                        Formato: V-12345678 o E-12345678
                    </p>
                </div>
                <div>
                    <label className={labelCls} style={labelStyle}>Cargo <Req /></label>
                    <input name="cargo" value={data.cargo} onChange={onChange}
                        placeholder={
                            isDocente        ? 'Profesor / Maestro' :
                            isAdministrativo ? 'Secretaria / Contador' :
                            'Obrero / Vigilante'
                        }
                        className={inputCls} style={inputStyle} />
                </div>
            </div>

            {/* ── DOCENTE: campos AVEC / MPPE ──────────────────────────────────── */}
            {isDocente && (
                <>
                    <SectionLabel text="Datos AVEC / MPPE" />
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                            <label className={labelCls} style={labelStyle}>Categoría Docente</label>
                            <select name="categoria_docente" value={data.categoria_docente}
                                onChange={onChange} className={inputCls} style={inputStyle}>
                                <option value="">— Seleccionar —</option>
                                {CATEGORIAS_DOCENTE.map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className={labelCls} style={labelStyle}>Título Académico</label>
                            <input name="titulo" value={data.titulo} onChange={onChange}
                                placeholder="LEM / TSU / Prof." className={inputCls} style={inputStyle} />
                        </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                            <label className={labelCls} style={labelStyle}>N° H/Sem <Req /></label>
                            <input type="number" name="horas_semanales" value={data.horas_semanales}
                                onChange={onChange} placeholder="36" min="1" max="40"
                                className={inputCls} style={inputStyle} />
                            <p className="text-[10px] mt-1" style={{ color: 'var(--ash)' }}>
                                Horas semanales asignadas (define el sueldo base)
                            </p>
                        </div>
                        <div>
                            <label className={labelCls} style={labelStyle}>Fecha de Ingreso</label>
                            <input name="fecha_ingreso" value={data.fecha_ingreso} onChange={handleFechaIngresoChange}
                                placeholder="15/09/1993" className={inputCls} style={inputStyle} />
                        </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div>
                            <label className={labelCls} style={labelStyle}>Años de Servicio</label>
                            <input type="number" name="anos_servicio" value={data.anos_servicio}
                                onChange={onChange} placeholder="30" min="0"
                                className={inputCls} style={inputStyle} />
                            {anosCalculados !== null && (
                                <p className="text-[10px] mt-1" style={{ color: 'var(--ash)' }}>
                                    Calculado: {anosCalculados} año{anosCalculados !== 1 ? 's' : ''}
                                </p>
                            )}
                        </div>
                        <div>
                            <label className={labelCls} style={labelStyle}>N° Hijos</label>
                            <input type="number" name="numero_hijos" value={data.numero_hijos}
                                onChange={onChange} placeholder="0" min="0"
                                className={inputCls} style={inputStyle} />
                        </div>
                        <div>
                            <label className={labelCls} style={labelStyle}>Nivel que dicta</label>
                            <input name="nivel" value={data.nivel} onChange={onChange}
                                placeholder="TODAS / Primaria" className={inputCls} style={inputStyle} />
                        </div>
                    </div>
                </>
            )}

            {/* ── ADMINISTRATIVO: sueldo base + datos laborales ───────────────── */}
            {isAdministrativo && (
                <>
                    <SectionLabel text="Datos salariales" />
                    <div>
                        <label className={labelCls} style={labelStyle}>Sueldo Base Mensual (Bs) <Req /></label>
                        <input type="number" name="sueldo_base" value={data.sueldo_base}
                            onChange={onChange} placeholder="0.00" min="0" step="0.01"
                            className={inputCls} style={inputStyle} />
                        <p className="text-[10px] mt-1" style={{ color: 'var(--ash)' }}>
                            Salario bruto mensual — base para calcular SSO, SPF y FAOV
                        </p>
                    </div>
                    <SectionLabel text="Datos laborales" />
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                            <label className={labelCls} style={labelStyle}>Fecha de Ingreso</label>
                            <input name="fecha_ingreso" value={data.fecha_ingreso} onChange={handleFechaIngresoChange}
                                placeholder="15/09/1993" className={inputCls} style={inputStyle} />
                        </div>
                        <div>
                            <label className={labelCls} style={labelStyle}>Años de Servicio</label>
                            <input type="number" name="anos_servicio" value={data.anos_servicio}
                                onChange={onChange} placeholder="0" min="0"
                                className={inputCls} style={inputStyle} />
                            {anosCalculados !== null && (
                                <p className="text-[10px] mt-1" style={{ color: 'var(--ash)' }}>
                                    Calculado: {anosCalculados} año{anosCalculados !== 1 ? 's' : ''}
                                </p>
                            )}
                        </div>
                    </div>
                </>
            )}

            {/* ── APOYO: sueldo base + fecha ingreso ───────────────────────────── */}
            {tipo === 'apoyo' && (
                <>
                    <SectionLabel text="Datos salariales" />
                    <div>
                        <label className={labelCls} style={labelStyle}>Sueldo Base Mensual (Bs) <Req /></label>
                        <input type="number" name="sueldo_base" value={data.sueldo_base}
                            onChange={onChange} placeholder="0.00" min="0" step="0.01"
                            className={inputCls} style={inputStyle} />
                        <p className="text-[10px] mt-1" style={{ color: 'var(--ash)' }}>
                            Salario bruto mensual — base para calcular SSO, SPF y FAOV
                        </p>
                    </div>
                    <SectionLabel text="Datos laborales" />
                    <div>
                        <label className={labelCls} style={labelStyle}>Fecha de Ingreso</label>
                        <input name="fecha_ingreso" value={data.fecha_ingreso} onChange={handleFechaIngresoChange}
                            placeholder="15/09/1993" className={inputCls} style={inputStyle} />
                        {anosCalculados !== null && (
                            <p className="text-[10px] mt-1" style={{ color: 'var(--ash)' }}>
                                {anosCalculados} año{anosCalculados !== 1 ? 's' : ''} de servicio
                            </p>
                        )}
                    </div>
                </>
            )}

            {/* Contacto */}
            <SectionLabel text="Contacto" />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                    <label className={labelCls} style={labelStyle}>Teléfono</label>
                    <input name="telefono" value={data.telefono} onChange={onChange}
                        placeholder="0414-0000000" className={inputCls} style={inputStyle} />
                </div>
                <div>
                    <label className={labelCls} style={labelStyle}>Correo</label>
                    <input type="email" name="correo" value={data.correo} onChange={onChange}
                        placeholder="empleado@correo.com" className={inputCls} style={inputStyle} />
                </div>
            </div>

            {/* Datos bancarios */}
            <SectionLabel text="Datos bancarios" />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                    <label className={labelCls} style={labelStyle}>Banco</label>
                    <select name="banco" value={data.banco} onChange={onChange}
                        className={inputCls} style={inputStyle}>
                        <option value="">— Sin banco —</option>
                        {bancosNomina.map(b => <option key={b.id} value={b.id}>{b.nombre}</option>)}
                    </select>
                </div>
                <div>
                    <label className={labelCls} style={labelStyle}>Tipo de cuenta</label>
                    <select name="tipo_cuenta" value={data.tipo_cuenta} onChange={onChange}
                        className={inputCls} style={inputStyle}>
                        <option value="">— Sin especificar —</option>
                        <option value="CTE">Corriente</option>
                        <option value="AHO">Ahorro</option>
                    </select>
                </div>
            </div>
            <div>
                <label className={labelCls} style={labelStyle}>Número de cuenta</label>
                <input name="numero_cuenta" value={data.numero_cuenta} onChange={onChange}
                    placeholder="01140000000000000000"
                    className={inputCls} style={{ ...inputStyle, fontFamily: 'monospace' }} />
            </div>
        </div>
    );
}
