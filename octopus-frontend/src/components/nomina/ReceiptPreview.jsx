import {
  NAVY, NAVY_L, BORDER,
  c, r, lb, rb, secH, subH, redCell, redLCell, cell_, stripe,
} from './reciboStyles';

const fmt = (n) =>
  isNaN(n) || n === ''
    ? ''
    : Number(n).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const LogoPlaceholder = ({ label }) => (
  <div style={{
    width: 68, height: 68,
    border: `1.5px dashed ${BORDER}`,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    margin: '0 auto', fontSize: '7px', color: '#94a3b8',
    flexDirection: 'column', gap: 2, borderRadius: '4px',
  }}>
    <span>Logo</span><span>{label}</span>
  </div>
);

const ReceiptPreview = ({ info, asignaciones, retenciones, alimentario, calcs }) => (
  <div style={{
    width: '100%', minHeight: '802px',
    fontFamily: '"Arial", sans-serif',
    background: '#fff',
    padding: '20px 26px',
    boxSizing: 'border-box',
    display: 'flex',
    flexDirection: 'column',
  }}>

    {/* Encabezado institucional */}
    <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '8px' }}>
      <tbody>
        <tr>
          <td style={{ width: '13%', border: 'none', textAlign: 'center', verticalAlign: 'middle' }}>
            {info.logoColegio
              ? <img src={info.logoColegio} alt="logo" style={{ maxWidth: 68, maxHeight: 68 }} />
              : <LogoPlaceholder label="Colegio" />
            }
          </td>
          <td style={{ border: 'none', textAlign: 'center', verticalAlign: 'middle', lineHeight: 1.1 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
              <span style={{ fontSize: '8px',   color: '#374151' }}>REPÚBLICA BOLIVARIANA DE VENEZUELA</span>
              <span style={{ fontSize: '7.5px', color: '#374151' }}>MINISTERIO DEL PODER POPULAR PARA LA EDUCACIÓN</span>
              <span style={{ fontSize: '7.5px', color: '#1e293b' }}>U.E. COLEGIO LOS HIJOS DE MARÍA AUXILIADORA</span>
              <span style={{ fontSize: '7px',   color: '#374151' }}>AFILIADO A LA ASOCIACIÓN VENEZOLANA DE EDUCACIÓN CATÓLICA</span>
              <span style={{ fontSize: '7px',   color: '#374151' }}>YARACAL ESTADO FALCÓN</span>
              <span style={{ fontSize: '7px',   color: '#374151' }}>TELÉFONOS 0259 938 1347</span>
              <span style={{ fontSize: '7px',   color: '#374151' }}>CÓDIGO DEA PD00131104 &nbsp;&nbsp; RIF-J-085222910</span>
            </div>
          </td>
          <td style={{ width: '13%', border: 'none', textAlign: 'center', verticalAlign: 'middle' }}>
            {info.logoAvec
              ? <img src={info.logoAvec} alt="avec" style={{ maxWidth: 68, maxHeight: 68 }} />
              : <LogoPlaceholder label="AVEC" />
            }
          </td>
        </tr>
      </tbody>
    </table>

    {/* Título */}
    <div style={{ textAlign: 'center', marginBottom: '14px' }}>
      <div style={{
        fontWeight: '800', fontSize: '9.5px', textTransform: 'uppercase',
        letterSpacing: '0.06em', color: NAVY,
      }}>
        RECIBO DE PAGO {info.tipoRecibo}
      </div>
      <div style={{ fontWeight: '600', fontSize: '8.5px', color: '#374151', marginTop: '3px' }}>
        Mes: {info.mes} {info.año}
      </div>
    </div>

    {/* Datos del empleado */}
    <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '8px' }}>
      <tbody>
        <tr>
          <td style={{ ...subH, width: '32%' }}>Apellidos y Nombres</td>
          <td style={{ ...subH, width: '18%' }}>C.I Nº</td>
          <td style={{ ...subH, width: '32%' }}>Nº H /Sem</td>
          <td style={{ ...subH, width: '18%' }}>Cargo</td>
        </tr>
        <tr>
          <td style={c}>{info.nombre}</td>
          <td style={c}>{info.cedula}</td>
          <td style={c}>{info.horasSemana}</td>
          <td style={c}>{info.cargo}</td>
        </tr>
        <tr>
          <td style={subH}>Fecha de Ingreso</td>
          <td style={subH}>Título</td>
          <td style={subH}>Categoría Docente</td>
          <td style={subH}>NIVEL</td>
        </tr>
        <tr>
          <td style={c}>{info.fechaIngreso}</td>
          <td style={c}>{info.titulo}</td>
          <td style={c}>{info.categoriaDocente}</td>
          <td style={c}>{info.nivel}</td>
        </tr>
      </tbody>
    </table>

    {/* Asignaciones + Retenciones */}
    <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '8px' }}>
      <tbody>
        <tr>
          <td colSpan={2} style={{ ...secH, width: '50%' }}>ASIGNACIONES MENSUALES</td>
          <td colSpan={2} style={{ ...secH, width: '50%' }}>RETENCIONES</td>
        </tr>
        <tr>
          <td colSpan={2} style={{ padding: 0, verticalAlign: 'top', border: `0.5px solid ${BORDER}` }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <colgroup><col style={{ width: '70%' }}/><col style={{ width: '30%' }}/></colgroup>
              <tbody>
                {asignaciones.map((a, i) => (
                  <tr key={a.id} style={stripe(i)}>
                    <td style={lb}>{a.label}</td>
                    <td style={r}>{a.value ? fmt(a.value) : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </td>
          <td colSpan={2} style={{ padding: 0, verticalAlign: 'top', border: `0.5px solid ${BORDER}` }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <colgroup><col style={{ width: '70%' }}/><col style={{ width: '30%' }}/></colgroup>
              <tbody>
                {retenciones.map((ret, i) => (
                  <tr key={ret.id} style={stripe(i)}>
                    <td style={lb}>{ret.label}</td>
                    <td style={r}>{ret.value ? fmt(ret.value) : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </td>
        </tr>
        {/* Totales */}
        <tr style={{ background: NAVY_L }}>
          <td style={{ ...lb,      width: '35%', color: NAVY }}>TOTAL ASIGNACIONES</td>
          <td style={{ ...rb,      width: '15%', color: NAVY }}>{fmt(calcs.totalAsignaciones)}</td>
          <td style={{ ...redLCell, width: '35%' }}>Total Retenciones</td>
          <td style={{ ...redCell,  width: '15%' }}>{fmt(calcs.totalRetenciones)}</td>
        </tr>
        <tr>
          <td style={lb}>MONTO PRIMERA QUINCENA</td>
          <td style={rb}>{fmt(calcs.primerQuincena)}</td>
          <td style={cell_}></td>
          <td style={cell_}></td>
        </tr>
        <tr style={stripe(1)}>
          <td style={lb}>MONTO SEGUNDA QUINCENA</td>
          <td style={rb}>{fmt(calcs.segundaQuincena)}</td>
          <td style={cell_}></td>
          <td style={cell_}></td>
        </tr>
      </tbody>
    </table>

    {/* Prima discapacidad + Neto */}
    <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '8px' }}>
      <tbody>
        <tr>
          <td colSpan={4} style={lb}>PRIMA POR DISCAPACIDAD PARA EL PERSONAL E HIJOS</td>
        </tr>
        <tr style={{ background: '#fff5f5' }}>
          <td colSpan={3} style={{ ...redLCell, textAlign: 'right', padding: '7px 10px', fontSize: '8.5px' }}>
            Neto a Depositar
          </td>
          <td style={{ ...redCell, width: '20%', padding: '7px 10px', fontSize: '9px', fontWeight: '800' }}>
            {fmt(calcs.netoDepositar)}
          </td>
        </tr>
      </tbody>
    </table>

    {/* Programa Alimentario */}
    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
      <colgroup>
        <col style={{ width: '35%' }} />
        <col style={{ width: '15%' }} />
        <col style={{ width: '35%' }} />
        <col style={{ width: '15%' }} />
      </colgroup>
      <tbody>
        <tr>
          <td colSpan={4} style={secH}>PROGRAMA ALIMENTARIO</td>
        </tr>
        <tr>
          <td colSpan={3} style={lb}>MONTO DEL BENEFICIO DE ALIMENTACIÓN POR HORA:</td>
          <td style={rb}>{alimentario.montoPorHora ? fmt(alimentario.montoPorHora) : ''}</td>
        </tr>
        <tr style={stripe(1)}>
          <td colSpan={3} style={lb}>COSTO DIARIO DEL BENEFICIO DE ALIMENTACIÓN:</td>
          <td style={rb}>{alimentario.costoDiario ? fmt(alimentario.costoDiario) : ''}</td>
        </tr>
        <tr style={{ background: NAVY_L }}>
          <td colSpan={3} style={{ ...lb, textAlign: 'right', color: NAVY }}>TOTAL BENEFICIO DE ALIMENTACIÓN:</td>
          <td style={{ ...rb, color: NAVY }}>{alimentario.totalBeneficio ? fmt(alimentario.totalBeneficio) : ''}</td>
        </tr>
        <tr>
          <td colSpan={2} style={{ ...redLCell, borderBottom: 'none' }}>Nº H /MENS de inasistencia</td>
          <td colSpan={2} style={{ ...redLCell, borderBottom: 'none' }}>Descuento por inasistencia</td>
        </tr>
        <tr>
          <td colSpan={2} style={{ ...r, borderTop: 'none' }}>{alimentario.horasInasistencia || ''}</td>
          <td colSpan={2} style={{ ...r, borderTop: 'none' }}>
            {alimentario.descuentoInasistencia ? fmt(alimentario.descuentoInasistencia) : ''}
          </td>
        </tr>
        <tr style={{ background: '#fff5f5' }}>
          <td colSpan={3} style={{ ...redLCell, textAlign: 'right', padding: '7px 10px', fontSize: '8.5px' }}>
            Total Beneficio de Alimentación a Recibir
          </td>
          <td style={{ ...redCell, padding: '7px 10px', fontSize: '9px', fontWeight: '800' }}>
            {fmt(calcs.totalBeneficioRecibir)}
          </td>
        </tr>
      </tbody>
    </table>

    {/* Footer */}
    <div style={{
      marginTop: 'auto',
      textAlign: 'center',
      fontSize: '7px',
      color: '#64748b',
      lineHeight: 2,
      borderTop: `1.5px solid ${NAVY}`,
      paddingTop: '10px',
    }}>
      Calle el Samán, detrás de la Guardia Nacional en el Municipio Cacique Manaure, Yaracal, Estado Falcon.<br />
      Teléfonos de Contacto: 0259 938 1347 &nbsp;&nbsp; 0426 563 1569
    </div>

  </div>
);

export default ReceiptPreview;
