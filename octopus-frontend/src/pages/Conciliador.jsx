import { useState, useCallback, useRef } from 'react';
import { Upload, Search, X, FileSpreadsheet, CheckCircle, AlertCircle, Building2, Trash2 } from 'lucide-react';
import { toast } from 'react-toastify';
import * as XLSX from 'xlsx';
import { BANKS, parseStatement } from '../utils/bankParsers';

export default function Conciliador() {
  const [bank, setBank]               = useState('');
  const [transactions, setTransactions] = useState([]);
  const [fileName, setFileName]       = useState('');
  const [dragging, setDragging]       = useState(false);
  const [loading, setLoading]         = useState(false);
  const [searchOpen, setSearchOpen]   = useState(false);
  const [query, setQuery]             = useState('');
  const [result, setResult]           = useState(null);
  const fileRef                       = useRef();

  const processFile = useCallback(async (file) => {
    if (!bank) {
      toast.error('Selecciona un banco antes de cargar el archivo.');
      return;
    }
    setLoading(true);
    try {
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: 'array', cellDates: false });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
      const txs = parseStatement(rows, bank);
      if (txs.length === 0) {
        toast.warning('No se detectaron transacciones. Verifica que el banco seleccionado coincida con el archivo.');
      } else {
        toast.success(`${txs.length} transacciones cargadas correctamente.`);
      }
      setTransactions(txs);
      setFileName(file.name);
    } catch {
      toast.error('Error al leer el archivo. Verifica que sea un Excel o CSV válido.');
    } finally {
      setLoading(false);
    }
  }, [bank]);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  }, [processFile]);

  const handleSearch = () => {
    const q = query.trim();
    if (q.length === 0) return;
    if (q.length !== 6) {
      toast.error('Ingresa exactamente 6 dígitos.');
      return;
    }
    const found = transactions.find(tx => tx.referencia.replace(/\D/g, '').slice(-6) === q);
    setResult(found ? { found: true, tx: found } : { found: false });
  };

  const openSearch = () => {
    if (transactions.length === 0) {
      toast.warning('Primero carga un estado de cuenta.');
      return;
    }
    setQuery('');
    setResult(null);
    setSearchOpen(true);
  };

  const clearFile = () => {
    setTransactions([]);
    setFileName('');
    setResult(null);
  };

  const bankInfo = BANKS.find(b => b.id === bank);

  const fmt = (v) => Number(v || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-xl font-semibold" style={{ color: 'var(--jet)' }}>Conciliador Bancario</h1>
        <p className="text-sm mt-0.5" style={{ color: 'var(--ash)' }}>
          Carga tu estado de cuenta para verificar transacciones por los últimos 6 dígitos de referencia.
        </p>
      </div>

      {/* Step 1: Bank selector + Drop zone */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">

        {/* Bank selector */}
        <div className="rounded-xl p-4" style={{ background: 'var(--porcelain)', border: '0.5px solid var(--border-md)' }}>
          <p className="text-[11px] font-medium uppercase tracking-wider mb-3" style={{ color: 'var(--ash)' }}>
            1 · Selecciona el banco
          </p>
          <div className="space-y-2">
            {BANKS.map(b => (
              <button
                key={b.id}
                onClick={() => { setBank(b.id); clearFile(); }}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm text-left"
                style={{
                  border: `1.5px solid ${bank === b.id ? b.color : 'var(--border-md)'}`,
                  background: bank === b.id ? `${b.color}18` : 'transparent',
                  color: bank === b.id ? b.color : 'var(--ash)',
                  fontWeight: bank === b.id ? 600 : 400,
                  transition: 'all 0.15s ease',
                }}
              >
                <Building2 size={14} />
                <span className="flex-1">{b.label}</span>
                {bank === b.id && <CheckCircle size={13} />}
              </button>
            ))}
          </div>
        </div>

        {/* Drop zone */}
        <div
          className="lg:col-span-2 rounded-xl flex flex-col items-center justify-center gap-3 cursor-pointer select-none"
          style={{
            border: `2px dashed ${dragging ? 'var(--pb)' : 'var(--border-md)'}`,
            background: dragging ? 'var(--pb-light)' : 'var(--porcelain)',
            minHeight: 180,
            transition: 'all 0.2s ease',
          }}
          onDragOver={e => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          onClick={() => !loading && fileRef.current?.click()}
        >
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={e => { const f = e.target.files[0]; if (f) processFile(f); e.target.value = ''; }}
          />

          {loading ? (
            <div className="flex flex-col items-center gap-2">
              <div
                className="w-8 h-8 rounded-full border-2 animate-spin"
                style={{ borderColor: 'var(--pb)', borderTopColor: 'transparent' }}
              />
              <span className="text-sm" style={{ color: 'var(--ash)' }}>Procesando archivo…</span>
            </div>
          ) : fileName ? (
            <div className="flex flex-col items-center gap-2 text-center">
              <FileSpreadsheet size={28} style={{ color: 'var(--pb)' }} />
              <span className="text-sm font-medium" style={{ color: 'var(--jet)' }}>{fileName}</span>
              <span className="text-xs" style={{ color: 'var(--ash)' }}>
                {transactions.length} transacciones · {bankInfo?.label}
              </span>
              <span className="text-[11px]" style={{ color: 'var(--pb)' }}>
                Arrastra otro archivo para reemplazar
              </span>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2 text-center px-6">
              <Upload size={28} style={{ color: dragging ? 'var(--pb)' : 'var(--ash)' }} />
              <span className="text-sm font-medium" style={{ color: 'var(--jet)' }}>
                {dragging ? 'Suelta el archivo aquí' : 'Arrastra tu estado de cuenta'}
              </span>
              <span className="text-xs" style={{ color: 'var(--ash)' }}>
                o haz clic para seleccionar · Excel (.xlsx, .xls) o CSV
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Action bar */}
      {transactions.length > 0 && (
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <span className="text-sm" style={{ color: 'var(--ash)' }}>
              <span className="font-semibold" style={{ color: 'var(--jet)' }}>{transactions.length}</span> transacciones cargadas
            </span>
            <button
              onClick={clearFile}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs"
              style={{ color: 'var(--ash)', border: '0.5px solid var(--border-md)' }}
            >
              <Trash2 size={12} />
              Limpiar
            </button>
          </div>
          <button
            onClick={openSearch}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white"
            style={{ background: 'linear-gradient(135deg, var(--pb) 0%, var(--pb-mid) 100%)', boxShadow: '0 4px 14px rgba(15,163,177,0.3)' }}
          >
            <Search size={14} />
            Buscar por referencia
          </button>
        </div>
      )}

      {/* Transactions table */}
      {transactions.length > 0 && (
        <div className="rounded-xl overflow-hidden" style={{ border: '0.5px solid var(--border-md)' }}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ background: 'var(--porcelain)', borderBottom: '0.5px solid var(--border-md)' }}>
                  {['Fecha', 'Referencia', 'Descripción', 'Monto (Bs.)'].map((h, i) => (
                    <th
                      key={h}
                      className={`px-4 py-3 text-${i === 3 ? 'right' : 'left'} text-[11px] font-medium uppercase tracking-wider`}
                      style={{ color: 'var(--ash)' }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {transactions.slice(0, 150).map((tx, i) => (
                  <tr
                    key={i}
                    style={{
                      borderBottom: '0.5px solid var(--border)',
                      background: i % 2 === 0 ? 'var(--bg)' : 'var(--porcelain)',
                    }}
                  >
                    <td className="px-4 py-2.5 text-xs tabular-nums" style={{ color: 'var(--ash)' }}>{tx.fecha}</td>
                    <td className="px-4 py-2.5 font-mono text-xs" style={{ color: 'var(--jet)' }}>{tx.referencia}</td>
                    <td className="px-4 py-2.5 text-xs max-w-xs truncate" style={{ color: 'var(--ash)' }} title={tx.descripcion}>{tx.descripcion || '—'}</td>
                    <td className="px-4 py-2.5 text-right font-semibold tabular-nums text-xs" style={{ color: 'var(--jet)' }}>
                      {fmt(tx.monto)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {transactions.length > 150 && (
              <div className="px-4 py-3 text-center text-xs" style={{ color: 'var(--ash)', background: 'var(--porcelain)', borderTop: '0.5px solid var(--border-md)' }}>
                Mostrando 150 de {transactions.length} transacciones. Usa la búsqueda para localizar una específica.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Search Modal */}
      {searchOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: 'rgba(43,48,58,0.5)', backdropFilter: 'blur(4px)' }}
          onClick={e => { if (e.target === e.currentTarget) setSearchOpen(false); }}
        >
          <div
            className="rounded-2xl w-full max-w-md mx-4 p-6"
            style={{
              background: 'var(--bg)',
              boxShadow: '0 24px 80px rgba(0,0,0,0.22)',
              border: '0.5px solid var(--border-md)',
            }}
          >
            {/* Modal header */}
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'var(--pb-light)' }}>
                  <Search size={15} style={{ color: 'var(--pb)' }} />
                </div>
                <div>
                  <h3 className="text-sm font-semibold" style={{ color: 'var(--jet)' }}>Buscar transacción</h3>
                  <p className="text-[11px]" style={{ color: 'var(--ash)' }}>
                    {bankInfo?.label} · {transactions.length} movimientos cargados
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSearchOpen(false)}
                className="p-1.5 rounded-lg"
                style={{ color: 'var(--ash)' }}
              >
                <X size={16} />
              </button>
            </div>

            {/* Input */}
            <div className="mb-4">
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--ash)' }}>
                Últimos 6 dígitos de la referencia
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  inputMode="numeric"
                  value={query}
                  onChange={e => { setQuery(e.target.value.replace(/\D/g, '').slice(0, 6)); setResult(null); }}
                  onKeyDown={e => e.key === 'Enter' && handleSearch()}
                  placeholder="ej. 123456"
                  maxLength={6}
                  className="flex-1 px-3 py-2.5 rounded-lg text-sm font-mono tracking-[0.3em] outline-none"
                  style={{
                    border: '1.5px solid var(--border-md)',
                    background: 'var(--porcelain)',
                    color: 'var(--jet)',
                  }}
                  autoFocus
                />
                <button
                  onClick={handleSearch}
                  disabled={query.length === 0}
                  className="px-4 py-2.5 rounded-lg text-sm font-medium text-white disabled:opacity-40"
                  style={{ background: 'linear-gradient(135deg, var(--pb) 0%, var(--pb-mid) 100%)' }}
                >
                  Buscar
                </button>
              </div>
            </div>

            {/* Result */}
            {result && (
              result.found ? (
                <div className="rounded-xl p-4" style={{ background: '#f0fdf4', border: '1.5px solid #16a34a' }}>
                  <div className="flex items-center gap-2 mb-3">
                    <CheckCircle size={16} color="#16a34a" />
                    <span className="text-sm font-semibold" style={{ color: '#16a34a' }}>Transacción encontrada</span>
                  </div>
                  <div className="space-y-2.5">
                    <div className="flex justify-between items-center">
                      <span className="text-xs" style={{ color: 'var(--ash)' }}>Fecha</span>
                      <span className="text-sm font-medium" style={{ color: 'var(--jet)' }}>{result.tx.fecha}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-xs" style={{ color: 'var(--ash)' }}>Referencia</span>
                      <span className="text-sm font-mono" style={{ color: 'var(--jet)' }}>{result.tx.referencia}</span>
                    </div>
                    <div className="flex justify-between items-center pt-1" style={{ borderTop: '0.5px solid #bbf7d0' }}>
                      <span className="text-xs font-medium" style={{ color: 'var(--ash)' }}>Monto</span>
                      <span className="text-lg font-bold" style={{ color: 'var(--pb)' }}>
                        Bs. {fmt(result.tx.monto)}
                      </span>
                    </div>
                    {result.tx.descripcion && (
                      <div className="flex justify-between items-start gap-4">
                        <span className="text-xs flex-shrink-0" style={{ color: 'var(--ash)' }}>Descripción</span>
                        <span className="text-xs text-right" style={{ color: 'var(--ash)' }}>{result.tx.descripcion}</span>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="rounded-xl p-4" style={{ background: 'var(--red-light)', border: '1.5px solid var(--red)' }}>
                  <div className="flex items-center gap-2">
                    <AlertCircle size={16} style={{ color: 'var(--red)' }} />
                    <span className="text-sm font-medium" style={{ color: 'var(--red)' }}>
                      No se encontró ninguna transacción con esa referencia.
                    </span>
                  </div>
                </div>
              )
            )}
          </div>
        </div>
      )}
    </div>
  );
}
