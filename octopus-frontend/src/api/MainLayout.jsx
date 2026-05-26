import { authService } from '../services/auth.service';

const MainLayout = ({ children }) => {
  return (
    <div className="min-h-screen flex flex-col bg-brand-50">
      {/* Navbar fija */}
      <nav className="sticky top-0 z-50 bg-brand-900 text-white p-4 shadow-md flex justify-between items-center">
        <h1 className="text-xl font-bold tracking-tight">Octopus ERP</h1>
        <div className="flex items-center gap-4">
          <span className="text-sm opacity-80 capitalize">{authService.getCurrentUserRole()}</span>
          <button 
            onClick={() => authService.logout()}
            className="bg-red-500 hover:bg-red-600 px-3 py-1 rounded text-sm transition-colors"
          >
            Salir
          </button>
        </div>
      </nav>

      {/* Área de contenido con scroll natural */}
      <main className="flex-1 container mx-auto p-4 md:p-8">
        <div className="animate-in fade-in duration-500">
          {children}
        </div>
      </main>
    </div>
  );
};

export default MainLayout;