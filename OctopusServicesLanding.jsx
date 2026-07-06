import { useState, useEffect } from "react";
import { Zap, Code2, ArrowRight, Check, Menu, X } from "lucide-react";

// ── Brand tokens ──────────────────────────────────────────────
const INK   = "#141A1C";
const PAPER = "#F7F7F5";
const SLATE = "#8A9296";

// ── Octopus logo: círculo de 8 arcos (brand guidelines) ──────
function OctopusIcon({ size = 28, color = INK }) {
  const r    = size * 0.38;
  const cx   = size / 2;
  const cy   = size / 2;
  const circ = 2 * Math.PI * r;
  const dash = (circ / 8) * 0.68;
  const gap  = (circ / 8) * 0.32;
  return (
    <svg
      width={size} height={size}
      viewBox={`0 0 ${size} ${size}`}
      fill="none"
      aria-hidden="true"
    >
      <circle
        cx={cx} cy={cy} r={r}
        stroke={color}
        strokeWidth={Math.max(1.5, size * 0.055)}
        strokeDasharray={`${dash} ${gap}`}
        strokeLinecap="round"
      />
    </svg>
  );
}

// ── Contenido ─────────────────────────────────────────────────
const SERVICES = [
  {
    Icon: Zap,
    tagline: "Haz más con menos.",
    title: "Automatizaciones",
    desc: "Eliminamos tareas repetitivas conectando tus herramientas actuales y creando flujos que trabajan por ti, 24/7.",
    features: [
      "Integración con tus sistemas existentes",
      "Flujos activados por eventos o tiempo",
      "Alertas y reportes automáticos",
      "Resultados visibles en semanas",
    ],
  },
  {
    Icon: Code2,
    tagline: "Exactamente lo que necesitas.",
    title: "Software a medida",
    desc: "Construimos aplicaciones y sistemas personalizados que se adaptan a tu negocio, no al revés.",
    features: [
      "Diseño centrado en tu proceso real",
      "Escalable desde el primer día",
      "Stack moderno y mantenible",
      "Soporte continuo post-lanzamiento",
    ],
  },
];

const STEPS = [
  { num: "01", title: "Diagnóstico",  desc: "Analizamos tu operación para identificar cuellos de botella y oportunidades reales." },
  { num: "02", title: "Propuesta",    desc: "Presentamos una solución concreta con alcance, tiempos y costo transparentes." },
  { num: "03", title: "Desarrollo",   desc: "Construimos en iteraciones cortas con tu equipo involucrado desde el inicio." },
  { num: "04", title: "Entrega",      desc: "Desplegamos, capacitamos y acompañamos para garantizar adopción real." },
];

const VALUES = [
  { title: "Rapidez sin atajos",   desc: "Entregamos en semanas, no meses. Sin sacrificar calidad ni mantenibilidad." },
  { title: "Sin dependencias",     desc: "El código es tuyo. Documentado, transferible y libre de lock-in." },
  { title: "Foco en resultados",   desc: "No vendemos horas. Vendemos impacto medible en tu operación." },
];

// ── Componente principal ──────────────────────────────────────
export default function OctopusServicesLanding() {
  const [menuOpen, setMenuOpen] = useState(false);

  // Inyectar Poppins desde Google Fonts
  useEffect(() => {
    const link = document.createElement("link");
    link.href = "https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap";
    link.rel  = "stylesheet";
    document.head.appendChild(link);
    return () => document.head.removeChild(link);
  }, []);

  const scrollTo = (id) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
    setMenuOpen(false);
  };

  // ── Render ────────────────────────────────────────────────
  return (
    <div
      style={{ fontFamily: "'Poppins', sans-serif", backgroundColor: PAPER, color: INK }}
      className="antialiased"
    >

      {/* ═══════════════════════ NAVBAR ════════════════════════ */}
      <nav
        className="fixed top-0 inset-x-0 z-50 backdrop-blur-sm"
        style={{ backgroundColor: `${PAPER}F5`, borderBottom: `1px solid ${SLATE}22` }}
      >
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">

          {/* Logo */}
          <button
            onClick={() => scrollTo("hero")}
            className="flex items-center gap-2.5 focus:outline-none"
            aria-label="Ir al inicio"
          >
            <OctopusIcon size={26} color={INK} />
            <span className="font-bold text-sm tracking-tight" style={{ color: INK }}>
              Octopus Services
            </span>
          </button>

          {/* Desktop links */}
          <div className="hidden md:flex items-center gap-8">
            {[["Servicios", "services"], ["Proceso", "process"], ["Nosotros", "values"]].map(([label, id]) => (
              <button
                key={id}
                onClick={() => scrollTo(id)}
                className="text-sm font-medium transition-opacity hover:opacity-50"
                style={{ color: INK }}
              >
                {label}
              </button>
            ))}
            <button
              onClick={() => scrollTo("contact")}
              className="px-4 py-2 text-sm font-semibold rounded-lg transition-opacity hover:opacity-75"
              style={{ backgroundColor: INK, color: PAPER }}
            >
              Habla con nosotros
            </button>
          </div>

          {/* Mobile toggle */}
          <button
            className="md:hidden"
            onClick={() => setMenuOpen(!menuOpen)}
            aria-label="Abrir menú"
          >
            {menuOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>

        {/* Mobile menu */}
        {menuOpen && (
          <div
            className="md:hidden px-6 py-5 flex flex-col gap-4"
            style={{ backgroundColor: PAPER, borderTop: `1px solid ${SLATE}22` }}
          >
            {[["Servicios", "services"], ["Proceso", "process"], ["Nosotros", "values"], ["Contacto", "contact"]].map(
              ([label, id]) => (
                <button
                  key={id}
                  onClick={() => scrollTo(id)}
                  className="text-left text-sm font-medium py-1"
                  style={{ color: INK }}
                >
                  {label}
                </button>
              )
            )}
          </div>
        )}
      </nav>

      {/* ═══════════════════════ HERO ══════════════════════════ */}
      <section id="hero" className="min-h-screen flex items-center pt-16">
        <div className="max-w-6xl mx-auto px-6 py-28 w-full">
          <div className="max-w-3xl">

            {/* Eyebrow */}
            <div className="flex items-center gap-2 mb-8">
              <OctopusIcon size={16} color={SLATE} />
              <span
                className="text-xs font-semibold tracking-widest uppercase"
                style={{ color: SLATE }}
              >
                Automatización · Software · Resultados
              </span>
            </div>

            {/* Headline */}
            <h1
              className="text-5xl sm:text-6xl lg:text-7xl font-bold leading-[1.06] tracking-tight mb-7"
              style={{ color: INK }}
            >
              Múltiples
              <br />
              soluciones.
              <br />
              <span style={{ color: SLATE }}>Un solo núcleo.</span>
            </h1>

            {/* Subheadline */}
            <p
              className="text-lg sm:text-xl font-medium leading-relaxed mb-10 max-w-xl"
              style={{ color: SLATE }}
            >
              Diseñamos automatizaciones y software a medida para que tu negocio opere más rápido,
              con menos fricción y sin depender de procesos manuales.
            </p>

            {/* CTAs */}
            <div className="flex flex-wrap gap-4">
              <button
                onClick={() => scrollTo("services")}
                className="flex items-center gap-2 px-6 py-3.5 font-semibold rounded-xl transition-opacity hover:opacity-75"
                style={{ backgroundColor: INK, color: PAPER }}
              >
                Ver servicios <ArrowRight size={16} />
              </button>
              <button
                onClick={() => scrollTo("contact")}
                className="flex items-center gap-2 px-6 py-3.5 font-semibold rounded-xl border-2 transition-opacity hover:opacity-60"
                style={{ borderColor: INK, color: INK }}
              >
                Habla con nosotros
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════════════════ SERVICES ══════════════════════ */}
      <section id="services" className="py-24 bg-white">
        <div className="max-w-6xl mx-auto px-6">

          {/* Header */}
          <div className="mb-16">
            <p className="text-xs font-semibold tracking-widest uppercase mb-3" style={{ color: SLATE }}>
              Servicios
            </p>
            <h2 className="text-3xl sm:text-4xl font-bold" style={{ color: INK }}>
              Lo que hacemos bien.
            </h2>
          </div>

          {/* Cards */}
          <div className="grid md:grid-cols-2 gap-8">
            {SERVICES.map(({ Icon, tagline, title, desc, features }) => (
              <div
                key={title}
                className="p-8 rounded-2xl flex flex-col gap-6"
                style={{ backgroundColor: PAPER }}
              >
                {/* Icon badge */}
                <div
                  className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
                  style={{ backgroundColor: INK }}
                >
                  <Icon size={20} color={PAPER} />
                </div>

                {/* Title block */}
                <div>
                  <p className="text-xs font-semibold tracking-widest uppercase mb-1.5" style={{ color: SLATE }}>
                    {tagline}
                  </p>
                  <h3 className="text-2xl font-bold" style={{ color: INK }}>{title}</h3>
                </div>

                {/* Description */}
                <p className="text-base leading-relaxed" style={{ color: SLATE }}>{desc}</p>

                {/* Feature list */}
                <ul className="flex flex-col gap-3 mt-auto">
                  {features.map((f) => (
                    <li key={f} className="flex items-start gap-3 text-sm font-medium" style={{ color: INK }}>
                      <Check size={15} className="mt-0.5 shrink-0" style={{ color: SLATE }} />
                      {f}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════════ PROCESS ═══════════════════════ */}
      <section id="process" className="py-24" style={{ backgroundColor: PAPER }}>
        <div className="max-w-6xl mx-auto px-6">

          {/* Header */}
          <div className="mb-16">
            <p className="text-xs font-semibold tracking-widest uppercase mb-3" style={{ color: SLATE }}>
              Cómo trabajamos
            </p>
            <h2 className="text-3xl sm:text-4xl font-bold" style={{ color: INK }}>
              De la idea al resultado.
            </h2>
          </div>

          {/* Steps */}
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-10">
            {STEPS.map(({ num, title, desc }) => (
              <div key={num} className="flex flex-col gap-4">
                <span
                  className="text-4xl font-bold"
                  style={{ color: `${SLATE}44` }}
                >
                  {num}
                </span>
                <h3 className="text-lg font-bold" style={{ color: INK }}>{title}</h3>
                <p className="text-sm leading-relaxed" style={{ color: SLATE }}>{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════════ VALUES ════════════════════════ */}
      <section id="values" className="py-24 bg-white">
        <div className="max-w-6xl mx-auto px-6">

          {/* Header */}
          <div className="mb-16">
            <p className="text-xs font-semibold tracking-widest uppercase mb-3" style={{ color: SLATE }}>
              Por qué Octopus
            </p>
            <h2 className="text-3xl sm:text-4xl font-bold" style={{ color: INK }}>
              Sin humo. Solo resultados.
            </h2>
          </div>

          {/* Grid */}
          <div className="grid md:grid-cols-3 gap-10">
            {VALUES.map(({ title, desc }) => (
              <div key={title} className="flex flex-col gap-4">
                <div
                  className="w-8 h-0.5 rounded-full"
                  style={{ backgroundColor: INK }}
                />
                <h3 className="text-xl font-bold" style={{ color: INK }}>{title}</h3>
                <p className="text-sm leading-relaxed" style={{ color: SLATE }}>{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════════ CTA ═══════════════════════════ */}
      <section id="contact" className="py-28" style={{ backgroundColor: INK }}>
        <div className="max-w-6xl mx-auto px-6 text-center flex flex-col items-center gap-6">
          <OctopusIcon size={44} color={PAPER} />
          <h2 className="text-3xl sm:text-4xl font-bold" style={{ color: PAPER }}>
            ¿Listo para automatizar?
          </h2>
          <p className="text-base max-w-sm leading-relaxed" style={{ color: SLATE }}>
            Cuéntanos qué proceso quieres mejorar. La primera conversación es gratis y sin compromiso.
          </p>
          <a
            href="mailto:hola@octopusservices.com"
            className="inline-flex items-center gap-2.5 px-8 py-4 font-semibold rounded-xl transition-opacity hover:opacity-80 mt-2"
            style={{ backgroundColor: PAPER, color: INK }}
          >
            hola@octopusservices.com <ArrowRight size={16} />
          </a>
        </div>
      </section>

      {/* ═══════════════════════ FOOTER ════════════════════════ */}
      <footer
        className="py-8"
        style={{ backgroundColor: INK, borderTop: `1px solid ${SLATE}33` }}
      >
        <div className="max-w-6xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <OctopusIcon size={18} color={PAPER} />
            <span className="text-sm font-semibold" style={{ color: PAPER }}>
              Octopus Services
            </span>
          </div>
          <p className="text-xs" style={{ color: SLATE }}>
            © 2026 Octopus Services. Todos los derechos reservados.
          </p>
        </div>
      </footer>

    </div>
  );
}
