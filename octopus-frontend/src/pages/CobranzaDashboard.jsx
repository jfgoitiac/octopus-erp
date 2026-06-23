import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Search, Users, AlertCircle, 
  CheckCircle2, DollarSign, ArrowUpRight, 
  Download, Loader2, CreditCard
} from 'lucide-react';
import axiosInstance from '../api/apiClient';

const CobranzaDashboard = () => {
  const navigate = useNavigate();
  const [isDarkMode] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [stats, setStats] = useState({ solventes: 0, morosos: 0, tasa_bcv: 0 });
  const [searchResult, setSearchResult] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchStats();
  }, []);

  useEffect(() => {
    if (isDarkMode) document.documentElement.classList.add('dark');
    else document.documentElement.classList.remove('dark');
  }, [isDarkMode]);

  const fetchStats = async () => {
    try {
      const res = await axiosInstance.get('cobranza/stats/');
      setStats(res.data);
    } catch {
      // stats son informativos; el fallo silencioso es aceptable
    }
  };

  const handleSearch = async (e) => {
    if (e.key === 'Enter' && searchTerm) {
      setLoading(true);
      try {
        const res = await axiosInstance.get(`cobranza/buscar/${searchTerm}/`);
        setSearchResult(res.data);
      } catch (err) {
        setSearchResult(null);
      } finally {
        setLoading(false);
      }
    }
  };

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)' }}>
      
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">        <div>
          <h2 className="text-lg font-medium" style={{ color: 'var(--jet)' }}>Octopus Finance</h2>
          <p className="text-sm mt-1" style={{ color: 'var(--ash)' }}>Control de cobranza y mensualidades</p>
        </div>

        <div className="flex items-center gap-3">
          <div className="hidden sm:flex items-center gap-2 px-4 py-2 rounded-xl"
               style={{ background: 'var(--porcelain)', border: '0.5px solid var(--border-md)' }}>
            <DollarSign className="w-4 h-4 text-emerald-500" />
            <label className="text-[11px] uppercase tracking-widest" style={{ color: 'var(--ash)' }}>BCV:</label>
            <span className="text-sm font-medium" style={{ color: 'var(--jet)' }}>{stats?.tasa_bcv ?? 0} VES</span>
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <StatCard title="Solventes" value={stats.solventes} icon={<CheckCircle2 size={16} />} color="var(--pb)" />
        <StatCard title="En Mora" value={stats.morosos} icon={<AlertCircle size={16} />} color="var(--red)" />
        <StatCard title="Total" value={stats.solventes + stats.morosos} icon={<Users size={16} />} color="var(--jet)" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div className="rounded-xl p-1" style={{ border: '0.5px solid var(--border-md)', background: 'var(--porcelain)' }}>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--ash)' }} size={16} />
              <input 
                type="text" 
                placeholder="Buscar cédula (Enter)..."
                className="w-full px-3 py-2 pl-9 rounded-lg outline-none"
                style={{ color: 'var(--jet)', fontSize: '16px' }}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onKeyDown={handleSearch}
              />
              {loading && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin" style={{ color: 'var(--pb)' }} size={16} />}
            </div>
          </div>

          {searchResult && searchResult.alumnos.map((alu) => (
            <div key={alu.id} className="rounded-xl overflow-hidden" style={{ border: '0.5px solid var(--border-md)', background: 'var(--porcelain)' }}>
              <div className="px-5 py-4 flex justify-between items-center" style={{ borderBottom: '0.5px solid var(--border)' }}>
                <div>
                  <h3 className="text-sm font-medium" style={{ color: 'var(--jet)' }}>{alu.nombre_completo}</h3>
                  <p className="text-xs" style={{ color: 'var(--ash)' }}>{alu.grado}</p>
                </div>
                {/* Badges de estatus */}
                <span className="px-2.5 py-1 text-[10px] font-bold rounded-full uppercase tracking-wider"
                      style={{ background: alu.estatus === 'solvente' ? '#dcfce7' : 'var(--red-light)', color: alu.estatus === 'solvente' ? '#16a34a' : 'var(--red)' }}>                  {alu.estatus}
                </span>
              </div>
              
              <table className="w-full text-left">
                <thead>
                  <tr style={{ background: 'var(--porcelain)', borderBottom: '0.5px solid var(--border-md)' }}>
                    {['Mes / Año', 'Monto USD', 'Status'].map(h => (
                      <th key={h} className="px-5 py-3 text-[11px] uppercase tracking-widest" style={{ color: 'var(--ash)' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                    {alu.mensualidades_pendientes.map((m) => (
                    <tr key={m.id} style={{ borderBottom: '0.5px solid var(--border)', background: 'var(--porcelain)' }}>                      <td className="px-5 py-3 text-sm font-medium" style={{ color: 'var(--jet)' }}>{m.mes} {m.anio}</td>
                      <td className="px-5 py-3 text-sm font-mono" style={{ color: 'var(--jet)' }}>${(Number(m.monto_usd) || 0).toFixed(2)}</td>
                      <td className="px-5 py-3">
                        <span className="text-[10px] font-bold uppercase flex items-center gap-1" style={{ color: 'var(--red)' }}>
                          <AlertCircle size={12} /> Pendiente
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>

        <div className="space-y-4">
          {searchResult && (
            <div className="rounded-xl p-5 text-white" style={{ background: 'var(--pb)' }}>
              <p className="text-[10px] uppercase tracking-widest opacity-60">Total Deuda</p>
              <p className="text-3xl font-bold mt-1">${(Number(searchResult.monto_total_deuda) || 0).toFixed(2)}</p>
              <button 
                      onClick={() => navigate(`/cobranza?cedula=${searchTerm}`)}
                      className="w-full py-2.5 bg-white rounded-lg text-sm font-medium mt-6 flex items-center justify-center gap-2"
                      style={{ color: 'var(--pb)' }}>
                Registrar Pago <CreditCard size={15} />
              </button>
            </div>
          )}
          <div className="rounded-xl p-5" style={{ border: '0.5px solid var(--border-md)', background: 'var(--porcelain)' }}>
            <h4 className="text-[11px] uppercase tracking-widest mb-4" style={{ color: 'var(--ash)' }}>Acciones</h4>
            <div className="space-y-2">
              <ActionButton label="Corte de Caja Diaria" icon={<Download size={15} />} />
              <ActionButton label="Consultar Auditoría" icon={<Users size={15} />} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const StatCard = ({ title, value, icon, color }) => (
  <div className="p-4 rounded-xl" style={{ border: '0.5px solid var(--border-md)', background: 'var(--porcelain)' }}>
    <div className="flex justify-between items-center mb-2">
      <div className="p-2 rounded-lg" style={{ background: 'var(--bg)', color: color }}>{icon}</div>
      <ArrowUpRight className="w-4 h-4" style={{ color: 'var(--ash)' }} />
    </div>
    <p className="text-[11px] uppercase tracking-widest" style={{ color: 'var(--ash)' }}>{title}</p>
    <p className="text-2xl font-bold" style={{ color: 'var(--jet)' }}>{value}</p>
  </div>
);

const ActionButton = ({ label, icon }) => (
  <button className="w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-all"
          style={{ border: '0.5px solid var(--border-md)', color: 'var(--ash)', background: '#fff' }}>
    {icon}
    {label}
  </button>
);

export default CobranzaDashboard;