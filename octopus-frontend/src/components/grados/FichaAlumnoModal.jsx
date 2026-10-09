import { GraduationCap, IdCard, Wallet, UserRound, Mail, Phone, MapPin, UserX } from 'lucide-react';
import { Modal } from '../ui/Modal';
import WhatsAppIcon from '../ui/WhatsAppIcon';
import { mostrarCedula } from '../../utils/cedulaEscolar';
import { nombreGradoCompleto } from '../../hooks/useMatriculaGrado';

const VACIO = '—';

function Dato({ icono: Icono, etiqueta, children }) {
  return (
    <div className="flex items-start gap-3 min-w-0">
      <span
        className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
        style={{ background: 'var(--pb-light)', color: 'var(--pb-mid)' }}
      >
        <Icono size={15} aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] uppercase tracking-wider font-medium" style={{ color: 'var(--ash)' }}>
          {etiqueta}
        </p>
        <div className="mt-0.5 text-sm break-words" style={{ color: 'var(--jet)' }}>
          {children}
        </div>
      </div>
    </div>
  );
}

function Atenuado() {
  return <span style={{ color: 'var(--ash)', opacity: 0.7 }}>{VACIO}</span>;
}

const ENLACE_CLASS =
  'rounded-md underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--pb)]';

function BloqueRepresentante({ alumno }) {
  const {
    representante_nombre: nombre,
    representante_cedula: cedula,
    representante_correo: correo,
    representante_telefono: telefono,
    representante_direccion: direccion,
  } = alumno;

  const hayRepresentante = [nombre, cedula, correo, telefono, direccion].some(v => v && String(v).trim());

  if (!hayRepresentante) {
    return (
      <div
        className="flex flex-col items-center gap-1 rounded-xl px-4 py-8 text-center"
        style={{ border: '1px dashed var(--border-md)', color: 'var(--ash)' }}
      >
        <UserX size={28} className="opacity-40" aria-hidden="true" />
        <p className="text-sm font-medium">Sin representante asignado</p>
        <p className="text-xs opacity-80">Este alumno aún no tiene un representante vinculado.</p>
      </div>
    );
  }

  // wa.me exige número internacional sin signos; solo se ofrece si viene con '+'
  const digitos = telefono ? String(telefono).replace(/\D/g, '') : '';
  const waUrl = telefono && String(telefono).trim().startsWith('+') && digitos.length >= 8
    ? `https://wa.me/${digitos}`
    : null;

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <Dato icono={UserRound} etiqueta="Nombre y apellido">
        {nombre ? <span className="font-medium">{nombre}</span> : <Atenuado />}
      </Dato>
      <Dato icono={IdCard} etiqueta="Cédula">
        {cedula ? <span className="font-mono">{cedula}</span> : <Atenuado />}
      </Dato>
      <Dato icono={Mail} etiqueta="Correo">
        {correo ? (
          <a href={`mailto:${correo}`} className={ENLACE_CLASS} style={{ color: 'var(--pb)' }}>
            {correo}
          </a>
        ) : <Atenuado />}
      </Dato>
      <Dato icono={Phone} etiqueta="Teléfono">
        {telefono ? (
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <a href={`tel:${String(telefono).replace(/[^\d+]/g, '')}`} className={ENLACE_CLASS} style={{ color: 'var(--pb)' }}>
              {telefono}
            </a>
            {waUrl && (
              <a
                href={waUrl}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`Escribir por WhatsApp al ${telefono}`}
                className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium hover:bg-[var(--ash-light)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--pb)]"
                style={{ border: '0.5px solid var(--border-md)', color: 'var(--jet)' }}
              >
                <WhatsAppIcon size={13} />
                WhatsApp
              </a>
            )}
          </span>
        ) : <Atenuado />}
      </Dato>
      <div className="sm:col-span-2">
        <Dato icono={MapPin} etiqueta="Dirección">
          {direccion ? direccion : <Atenuado />}
        </Dato>
      </div>
    </div>
  );
}

export default function FichaAlumnoModal({ alumno, onClose }) {
  const open = Boolean(alumno);
  const solvente = alumno?.estatus_financiero === 'solvente';

  return (
    <Modal
      open={open}
      onClose={onClose}
      titulo="Ficha del alumno"
      size="lg"
      footer={
        <button
          type="button"
          onClick={onClose}
          className="w-full rounded-lg px-4 py-2.5 text-sm font-medium transition-colors hover:bg-[var(--ash-light)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--pb)] sm:w-auto"
          style={{ border: '0.5px solid var(--border-md)', color: 'var(--jet)' }}
        >
          Cerrar
        </button>
      }
    >
      {alumno && (
        <div className="flex flex-col gap-6">
          <section aria-label="Datos del alumno" className="flex flex-col gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <span
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-lg font-semibold text-white"
                style={{ background: 'var(--pb)' }}
                aria-hidden="true"
              >
                {(alumno.nombre?.[0] || '?').toUpperCase()}
              </span>
              <h4 className="min-w-0 break-words text-lg font-semibold leading-tight" style={{ color: 'var(--jet)' }}>
                {alumno.nombre} {alumno.apellido}
              </h4>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Dato icono={IdCard} etiqueta="Cédula escolar">
                {alumno.cedula_escolar
                  ? <span className="font-mono">{mostrarCedula(alumno.cedula_escolar)}</span>
                  : <Atenuado />}
              </Dato>
              <Dato icono={GraduationCap} etiqueta="Grado">
                {alumno.grado_seccion ? nombreGradoCompleto(alumno.grado_seccion) : <Atenuado />}
              </Dato>
              <Dato icono={UserRound} etiqueta="Género">
                {{ masculino: 'M', femenino: 'F' }[String(alumno.genero || '').toLowerCase()] || <Atenuado />}
              </Dato>
              {alumno.estatus_financiero && (
                <Dato icono={Wallet} etiqueta="Estatus financiero">
                  <span
                    className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium capitalize"
                    style={{
                      background: solvente ? '#DCFCE7' : 'var(--red-light)',
                      color: solvente ? '#15803D' : 'var(--red)',
                    }}
                  >
                    <span
                      className="h-1.5 w-1.5 rounded-full"
                      style={{ background: solvente ? '#16A34A' : 'var(--red)' }}
                      aria-hidden="true"
                    />
                    {alumno.estatus_financiero}
                  </span>
                </Dato>
              )}
            </div>
          </section>

          <section aria-labelledby="ficha-representante" className="flex flex-col gap-3">
            <h5
              id="ficha-representante"
              className="flex items-center gap-1.5 pb-2 text-xs font-semibold uppercase tracking-widest"
              style={{ color: 'var(--ash)', borderBottom: '0.5px solid var(--border-md)' }}
            >
              <UserRound size={13} aria-hidden="true" />
              Representante
            </h5>
            <BloqueRepresentante alumno={alumno} />
          </section>
        </div>
      )}
    </Modal>
  );
}
