import { lazy, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { ConfiguracionProvider } from './context/ConfiguracionContext';
import LayoutPublico from './layouts/LayoutPublico';

const Home             = lazy(() => import('./pages/Home'));
const Articulos        = lazy(() => import('./pages/Articulos'));
const ArticuloDetalle  = lazy(() => import('./pages/ArticuloDetalle'));
const PaginaDinamica   = lazy(() => import('./pages/PaginaDinamica'));
const PaginaPreview    = lazy(() => import('./pages/PaginaPreview'));
const NotFound         = lazy(() => import('./pages/NotFound'));
// Galería de plantillas (herramienta interna de diseño, fuera de LayoutPublico).
const GaleriaPlantillas = lazy(() => import('./templates/GaleriaPlantillas'));

const SuspenseFallback = () => (
  <div className="flex flex-col gap-3 justify-center items-center h-screen">
    <Loader2 className="animate-spin" size={32} style={{ color: 'var(--color-primario)' }} />
  </div>
);

function App() {
  return (
    <ConfiguracionProvider>
      <Router>
        <Suspense fallback={<SuspenseFallback />}>
          <Routes>
            <Route path="plantillas" element={<GaleriaPlantillas />} />
            <Route element={<LayoutPublico />}>
              <Route index element={<Home />} />
              <Route path="articulos" element={<Articulos />} />
              <Route path="articulos/:slug" element={<ArticuloDetalle />} />
              <Route path="preview/:token" element={<PaginaPreview />} />
              {/* Catch-all: páginas dinámicas por slug — debe ir al final. */}
              <Route path=":slug" element={<PaginaDinamica />} />
              <Route path="*" element={<NotFound />} />
            </Route>
          </Routes>
        </Suspense>
      </Router>
    </ConfiguracionProvider>
  );
}

export default App;
