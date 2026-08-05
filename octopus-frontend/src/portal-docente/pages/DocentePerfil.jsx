import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'react-toastify';
import { Camera, User, Mail, Save, Loader2, KeyRound, ChevronRight, ShieldCheck } from 'lucide-react';

import { useDocentePerfil } from '../hooks/useDocentePerfil';
import SkeletonCard from '../../portal/components/SkeletonCard';

const TAMANO_MAX_MB = 5;

const DocentePerfil = () => {
  const { perfil, loading, guardando, subiendoFoto, guardarPerfil, subirFoto } = useDocentePerfil();
  const [form, setForm] = useState({ first_name: '', last_name: '', email: '' });
  const [dirty, setDirty] = useState(false);
  const [previewFoto, setPreviewFoto] = useState(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    if (perfil) {
      setForm({
        first_name: perfil.first_name || '',
        last_name: perfil.last_name || '',
        email: perfil.email || '',
      });
      setDirty(false);
    }
  }, [perfil]);

  const nombreCompleto = `${form.first_name} ${form.last_name}`.trim() || perfil?.username || 'Docente';

  const handleChange = (campo, valor) => {
    setForm((f) => ({ ...f, [campo]: valor }));
    setDirty(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.first_name.trim() || !form.last_name.trim()) {
      toast.warning('Nombre y apellido no pueden estar vacíos.');
      return;
    }
    const ok = await guardarPerfil({
      first_name: form.first_name.trim(),
      last_name: form.last_name.trim(),
      email: form.email.trim(),
    });
    if (ok) setDirty(false);
  };

  const handleArchivoFoto = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > TAMANO_MAX_MB * 1024 * 1024) {
      toast.error(`La imagen no puede superar ${TAMANO_MAX_MB}MB.`);
      e.target.value = '';
      return;
    }
    setPreviewFoto(URL.createObjectURL(file));
    const ok = await subirFoto(file);
    if (!ok) setPreviewFoto(null);
    e.target.value = '';
  };

  const fotoMostrada = previewFoto || perfil?.foto;

  if (loading) {
    return (
      <div className="space-y-4">
        <SkeletonCard lines={1} />
        <SkeletonCard lines={4} />
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-10">
      <div>
        <h1 className="text-lg font-bold text-gray-900 flex items-center gap-2">
          <User size={20} className="text-[var(--docente-primary)]" />
          Mi perfil
        </h1>
        <p className="text-xs text-gray-400 mt-0.5">Gestiona tu información personal</p>
      </div>

      {/* Card avatar */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 flex flex-col items-center gap-3">
        <div className="relative">
          {fotoMostrada ? (
            <img
              src={fotoMostrada}
              alt={nombreCompleto}
              className="w-24 h-24 rounded-full object-cover ring-4 ring-[var(--docente-primary)]/20"
            />
          ) : (
            <div
              className="w-24 h-24 rounded-full flex items-center justify-center text-2xl font-bold text-white ring-4 ring-[var(--docente-primary)]/20"
              style={{ background: 'linear-gradient(135deg, var(--docente-primary) 0%, var(--docente-primary-dark) 100%)' }}
            >
              {(nombreCompleto || '?').trim().split(/\s+/).slice(0, 2).map(p => p[0]?.toUpperCase() || '').join('') || '?'}
            </div>
          )}

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={subiendoFoto}
            aria-label="Cambiar foto de perfil"
            className="absolute bottom-0 right-0 w-8 h-8 rounded-full bg-[var(--docente-primary)] text-white flex items-center justify-center shadow-md ring-2 ring-white hover:bg-[var(--docente-primary-dark)] transition-colors disabled:opacity-60"
          >
            {subiendoFoto ? <Loader2 size={14} className="animate-spin" /> : <Camera size={14} />}
          </button>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleArchivoFoto}
          />
        </div>

        <div className="text-center">
          <p className="text-sm font-semibold text-gray-900">{nombreCompleto}</p>
          <p className="text-xs text-gray-400">{perfil?.rol}</p>
        </div>
      </div>

      {/* Card formulario */}
      <form
        onSubmit={handleSubmit}
        className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 space-y-4"
      >
        <h2 className="text-sm font-semibold text-gray-900">Información personal</h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="perfil-first-name" className="block text-xs font-medium text-gray-500 mb-1.5">Nombre</label>
            <input
              id="perfil-first-name"
              type="text"
              value={form.first_name}
              onChange={(e) => handleChange('first_name', e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--docente-primary)]/30 focus:border-[var(--docente-primary)] transition-colors"
            />
          </div>
          <div>
            <label htmlFor="perfil-last-name" className="block text-xs font-medium text-gray-500 mb-1.5">Apellido</label>
            <input
              id="perfil-last-name"
              type="text"
              value={form.last_name}
              onChange={(e) => handleChange('last_name', e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--docente-primary)]/30 focus:border-[var(--docente-primary)] transition-colors"
            />
          </div>
        </div>

        <div>
          <label htmlFor="perfil-email" className="block text-xs font-medium text-gray-500 mb-1.5">Correo electrónico</label>
          <div className="relative">
            <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              id="perfil-email"
              type="email"
              value={form.email}
              onChange={(e) => handleChange('email', e.target.value)}
              className="w-full pl-9 pr-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[var(--docente-primary)]/30 focus:border-[var(--docente-primary)] transition-colors"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1 border-t border-gray-50">
          <div className="pt-3">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Usuario</p>
            <p className="text-sm text-gray-500 mt-1">{perfil?.username}</p>
          </div>
          <div className="pt-3">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 flex items-center gap-1">
              <ShieldCheck size={11} /> Rol
            </p>
            <p className="text-sm text-gray-500 mt-1 capitalize">{perfil?.rol}</p>
          </div>
        </div>

        <button
          type="submit"
          disabled={guardando || !dirty}
          className="w-full flex items-center justify-center gap-2 bg-[var(--docente-primary)] hover:bg-[var(--docente-primary-dark)] text-white font-semibold py-3 rounded-xl text-sm transition-colors disabled:opacity-50 min-h-[44px]"
        >
          {guardando ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
          {guardando ? 'Guardando...' : 'Guardar cambios'}
        </button>
      </form>

      {/* Link a cambiar contraseña */}
      <Link
        to="/portal-docente/cambiar-contrasena"
        className="flex items-center justify-between bg-white rounded-2xl shadow-sm border border-gray-100 p-4 hover:shadow-md hover:-translate-y-0.5 transition-shadow"
      >
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-[var(--docente-primary)]/10 text-[var(--docente-primary)] flex items-center justify-center">
            <KeyRound size={16} />
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-900">Cambiar contraseña</p>
            <p className="text-xs text-gray-400">Actualiza tus credenciales de acceso</p>
          </div>
        </div>
        <ChevronRight size={18} className="text-gray-300 flex-shrink-0" />
      </Link>
    </div>
  );
};

export default DocentePerfil;
