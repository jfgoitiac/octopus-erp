import { useEffect, useState } from 'react';
import { Link, Outlet } from 'react-router-dom';
import { Menu, X, Share2 } from 'lucide-react';
import { getMenu } from '../api/sitio.service';
import { useConfiguracion } from '../hooks/useConfiguracion';
import { resolverUrlItemMenu, esUrlExterna } from '../lib/itemMenuUrl';
import { resolverUrlMedia } from '../lib/media';
import Skeleton from '../components/ui/Skeleton';

// NOTA: esta versión de lucide-react (^1.14.0, la del stack del proyecto) no
// incluye íconos de marcas (Facebook/Instagram/etc, retirados por licencia).
// Se usa un ícono genérico + label accesible en su lugar.
const REDES_LABEL = {
  facebook: 'Facebook',
  instagram: 'Instagram',
  twitter: 'Twitter',
  youtube: 'YouTube',
  tiktok: 'TikTok',
};

const ItemNav = ({ item, onClick, className = '' }) => {
  const url = resolverUrlItemMenu(item);
  if (esUrlExterna(item)) {
    return (
      <a
        href={url}
        target={item.abre_nueva_pestana ? '_blank' : undefined}
        rel={item.abre_nueva_pestana ? 'noopener noreferrer' : undefined}
        className={className}
        onClick={onClick}
      >
        {item.etiqueta}
      </a>
    );
  }
  return (
    <Link to={url} className={className} onClick={onClick}>
      {item.etiqueta}
    </Link>
  );
};

const LayoutPublico = () => {
  const { configuracion } = useConfiguracion() ?? {};
  const [menuPrincipal, setMenuPrincipal] = useState(null);
  const [menuFooter, setMenuFooter] = useState(null);
  const [menuAbierto, setMenuAbierto] = useState(false);

  useEffect(() => {
    getMenu('principal').then((res) => setMenuPrincipal(res.data)).catch(() => setMenuPrincipal({ items: [] }));
    getMenu('footer').then((res) => setMenuFooter(res.data)).catch(() => setMenuFooter({ items: [] }));
  }, []);

  const redes = configuracion?.redes_sociales ?? {};
  const redesActivas = Object.entries(redes).filter(([, url]) => Boolean(url));

  const menuFijo = configuracion?.menu_fijo ?? true;
  const centrado = configuracion?.alineacion_menu === 'centro';
  const enlaceOrdenados = (menuPrincipal?.items ?? []).slice().sort((a, b) => a.orden - b.orden);

  return (
    <div className="flex min-h-screen flex-col">
      {/* ── Header ──
          Colores vienen de --menu-bg/--menu-texto/--menu-borde (ConfiguracionSitio.estilo_menu,
          ver templates/_kit/tema.js). menu_fijo controla sticky vs. relative. */}
      <header
        className={`${menuFijo ? 'sticky top-0' : 'relative'} z-40 backdrop-blur`}
        style={{
          borderBottom: '1px solid var(--menu-borde)',
          background: 'color-mix(in oklab, var(--menu-bg) 95%, transparent)',
          color: 'var(--menu-texto)',
        }}
      >
        <div className={`contenedor flex h-16 items-center ${centrado ? 'flex-col justify-center gap-1 h-auto py-2 md:flex-row md:h-16 md:py-0 md:justify-between' : 'justify-between'}`}>
          <Link to="/" className="flex items-center gap-2 shrink-0">
            {configuracion?.logo ? (
              <img src={resolverUrlMedia(configuracion.logo)} alt="Logo" className="h-9 w-auto" />
            ) : (
              <span className="text-lg font-bold" style={{ color: 'var(--color-primario)' }}>Colegio</span>
            )}
          </Link>

          <nav className={`hidden md:flex items-center gap-6 ${centrado ? 'md:absolute md:left-1/2 md:-translate-x-1/2' : ''}`}>
            {!menuPrincipal ? (
              <Skeleton className="h-4 w-64" />
            ) : (
              enlaceOrdenados.map((item, i) => (
                <ItemNav
                  key={i}
                  item={item}
                  className="text-sm font-medium transition-colors hover:opacity-70"
                />
              ))
            )}
          </nav>

          <button
            type="button"
            className="md:hidden p-2 -mr-2"
            aria-label={menuAbierto ? 'Cerrar menú' : 'Abrir menú'}
            onClick={() => setMenuAbierto((v) => !v)}
          >
            {menuAbierto ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>

        {menuAbierto && (
          <nav style={{ borderTop: '1px solid var(--menu-borde)', background: 'var(--menu-bg)' }} className="md:hidden">
            <div className="contenedor flex flex-col py-2">
              {enlaceOrdenados.map((item, i) => (
                <ItemNav
                  key={i}
                  item={item}
                  className="py-2.5 text-sm font-medium"
                  onClick={() => setMenuAbierto(false)}
                />
              ))}
            </div>
          </nav>
        )}
      </header>

      <main className="flex-1">
        <Outlet />
      </main>

      {/* ── Footer ── */}
      <footer
        className="mt-auto"
        style={{ borderTop: '1px solid var(--footer-borde)', background: 'var(--footer-bg)', color: 'var(--footer-texto)' }}
      >
        <div className="contenedor py-10 grid gap-8 sm:grid-cols-2 md:grid-cols-3">
          <div>
            <p className="font-semibold mb-2">Contacto</p>
            <ul className="space-y-1 text-sm opacity-80">
              {configuracion?.direccion && <li>{configuracion.direccion}</li>}
              {configuracion?.telefono_contacto && <li>{configuracion.telefono_contacto}</li>}
              {configuracion?.email_contacto && <li>{configuracion.email_contacto}</li>}
            </ul>
          </div>

          <div>
            <p className="font-semibold mb-2">Enlaces</p>
            <ul className="space-y-1 text-sm">
              {(menuFooter?.items ?? [])
                .slice()
                .sort((a, b) => a.orden - b.orden)
                .map((item, i) => (
                  <li key={i}>
                    <ItemNav item={item} className="opacity-80 hover:opacity-100" />
                  </li>
                ))}
            </ul>
          </div>

          {redesActivas.length > 0 && (
            <div>
              <p className="font-semibold mb-2">Síguenos</p>
              <div className="flex gap-3">
                {redesActivas.map(([red, url]) => {
                  return (
                    <a
                      key={red}
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={REDES_LABEL[red] ?? red}
                      title={REDES_LABEL[red] ?? red}
                      className="p-2 rounded-full opacity-90 hover:opacity-100"
                      style={{ background: 'color-mix(in oklab, var(--footer-texto) 10%, transparent)', border: '1px solid var(--footer-borde)' }}
                    >
                      <Share2 size={18} />
                    </a>
                  );
                })}
              </div>
            </div>
          )}
        </div>
        <div style={{ borderTop: '1px solid var(--footer-borde)' }} className="py-4">
          <p className="contenedor text-xs opacity-70">
            © {new Date().getFullYear()} Colegio. Todos los derechos reservados.
          </p>
        </div>
      </footer>
    </div>
  );
};

export default LayoutPublico;
