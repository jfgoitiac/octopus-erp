import { useCallback } from 'react';
import {
  Upload, Search, X, FileSpreadsheet,
  CheckCircle, AlertCircle, Building2, Trash2,
} from 'lucide-react';
import { BANKS } from '../utils/bankParsers';
import { useConciliador } from '../hooks/useConciliador';
import ConfirmDeleteModal from '../components/ConfirmDeleteModal';

// Formateador de montos fuera del componente para evitar recreaciones
const fmt = (v) =>
  Number(v || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// ─── Sub-componente: selector de banco ────────────────────────────────────────
function BankSelector({ bank, onSelect }) {
  return (
    <div
      className="rounded-xl p-4"
      style={{ background: 'var(--porcelain)', border: '0.5px solid var(--border-md)' }}
    >
      <p
        className="text-[11px] font-medium uppercase tracking-wider mb-3"
        style={{ color: 'var(--ash)' }}
      >
        1 · Selecciona el banco
      </p>
      <div className="space-y-2">
        {BANKS.map(b => (
          <button
            key={b.id}
            type="button"
            onClick={() => onSelect(b.id)}
            className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm text-left transition-all duration-150"
            style={{
              border:      `1.5px solid ${bank === b.id ? b.color : 'var(--border-md)'}`,
              background:  bank === b.id ? `${b.color}18` : 'transparent',
              color:       bank === b.id ? b.color : 'var(--ash)',
              fontWeight:  bank === b.id ? 600 : 400,
            }}
          >
            <Building2 size={14} />
            <span className="flex-1">{b.label}</span>
            {bank === b.id && <CheckCircle size={13} />}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Sub-componente: zona de carga drag & drop ────────────────────────────────
function DropZone({ dragging, loading, fileName, transactions, bankInfo, fileRef, onDrop, onDragOver, onDragLeave, onFileInput, onClick }) {
  return (
    <div
      role="button"
      tabIndex={0}
      aria-label="Zona de carga de estado de cuenta bancario"
      className="lg:col-span-2 rounded-xl flex flex-col items-center justify-center gap-3 cursor-pointer select-none outline-none focus-visible:ring-2"
      style={{
        border:     `2px dashed ${dragging ? 'var(--pb)' : 'var(--border-md)'}`,
        background: dragging ? 'var(--pb-light)' : 'var(--porcelain)',
        minHeight:  180,
        transition: 'all 0.2s ease',
      }}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onClick={onClick}
      onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && !loading && fileRef.current?.click()}
    >
      <input
        ref={fileRef}
        type="file"
        accept=".xlsx,.xls,.csv"
        className="hidden"
        onChange={onFileInput}
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
            o presiona Enter para seleccionar · Excel (.xlsx, .xls) o CSV
          </span>
        </div>
      )}
    </div>
  );
}

// ─── Sub-componente: tabla de transacciones ───────────────────────────────────
function TransactionsTable({ transactions }) {
  const VISIBLE_LIMIT = 150;
  const visible = transactions.slice(0, VISIBLE_LIMIT);

  return (
    <div className="rounded-xl overflow-hidden" style={{ border: '0.5px solid var(--border-md)' }}>
      <div className="overflow-x-auto">
        <table className="w-full text-sm" aria-label="Transacciones cargadas">
          <thead>
            <tr style={{ background: 'var(--porcelain)', borderBottom: '0.5px solid var(--border-md)' }}>
              {['Fecha', 'Referencia', 'Descripción', 'Monto (Bs.)'].map((h, i) => (
                <th
                  key={h}
                  scope="col"
                  className={`px-4 py-3 text-${i === 3 ? 'right' : 'left'} text-[11px] font-medium uppercase tracking-wider`}
                  style={{ color: 'var(--ash)' }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((tx, i) => (
              <tr
                key={`${tx.referencia}-${i}`}
                style={{
                  borderBottom: '0.5px solid var(--border)',
                  background: i % 2 === 0 ? 'var(--bg)' : 'var(--porcelain)',
                }}
              >
                <td className="px-4 py-2.5 text-xs tabular-nums" style={{ color: 'var(--ash)' }}>{tx.fecha}</td>
                <td className="px-4 py-2.5 font-mono text-xs" style={{ color: 'var(--jet)' }}>{tx.referencia}</td>
                <td className="px-4 py-2.5 text-xs max-w-xs truncate" style={{ color: 'var(--ash)' }} title={tx.descripcion}>
                  {tx.descripcion || '—'}
                </td>
                <td className="px-4 py-2.5 text-right font-semibold tabular-nums text-xs" style={{ color: 'var(--jet)' }}>
                  {fmt(tx.monto)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {transactions.length > VISIBLE_LIMIT && (
          <div
            className="px-4 py-3 text-center text-xs"
            style={{ color: 'var(--ash)', background: 'var(--porcelain)', borderTop: '0.5px solid var(--border-md)' }}
          >
            Mostrando {VISIBLE_LIMIT} de {transactions.length} transacciones. Usa la búsqueda para localizar una específica.
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Sub-componente: modal de búsqueda ────────────────────────────────────────
function SearchModal({ bankInfo, transactions, query, setQuery, results, setResults, onSearch, onClose }) {
  const handleQueryChange = useCallback((e) => {
    setQuery(e.target.value.replace(/\D/g, '').slice(0, 6));
    setResults(null);
  }, [setQuery, setResults]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="search-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(43,48,58,0.5)', backdropFilter: 'blur(4px)' }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div
        className="rounded-2xl w-full max-w-md"
        style={{
          background:  'var(--bg)',
          boxShadow:   '0 24px 80px rgba(0,0,0,0.22)',
          border:      '0.5px solid var(--border-md)',
        }}
      >
        {/* Encabezado */}
        <div className="flex items-center justify-between p-6 pb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'var(--pb-light)' }}>
              <Search size={15} style={{ color: 'var(--pb)' }} />
            </div>
            <div>
              <h3 id="search-modal-title" className="text-sm font-semibold" style={{ color: 'var(--jet)' }}>
                Buscar transacción
              </h3>
              <p className="text-[11px]" style={{ color: 'var(--ash)' }}>
                {bankInfo?.label} · {transactions.length} movimientos cargados
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar búsqueda"
            className="p-1.5 rounded-lg"
            style={{ color: 'var(--ash)' }}
          >
            <X size={16} />
          </button>
        </div>

        <div className="px-6 pb-6 space-y-4">
          {/* Input */}
          <div>
            <label htmlFor="ref-search" className="block text-xs font-medium mb-1.5" style={{ color: 'var(--ash)' }}>
              Últimos 6 dígitos de la referencia
            </label>
            <div className="flex gap-2">
              <input
                id="ref-search"
                type="text"
                inputMode="numeric"
                value={query}
                onChange={handleQueryChange}
                onKeyDown={e => e.key === 'Enter' && onSearch()}
                placeholder="ej. 123456"
                maxLength={6}
                autoFocus
                className="flex-1 px-3 py-2.5 rounded-lg text-sm font-mono tracking-[0.3em] outline-none"
                style={{
                  border:     '1.5px solid var(--border-md)',
                  background: 'var(--porcelain)',
                  color:      'var(--jet)',
                }}
              />
              <button
                type="button"
                onClick={onSearch}
                disabled={query.length < 6}
                className="px-4 py-2.5 rounded-lg text-sm font-medium text-white disabled:opacity-40 transition-opacity"
                style={{ background: 'linear-gradient(135deg, var(--pb) 0%, var(--pb-mid) 100%)' }}
              >
                Buscar
              </button>
            </div>
          </div>

          {/* Resultados */}
          {results !== null && (
            results.length > 0 ? (
              <div className="space-y-3">
                {results.length > 1 && (
                  <p className="text-xs px-1" style={{ color: 'var(--ash)' }}>
                    <span className="font-semibold" style={{ color: 'var(--jet)' }}>{results.length}</span> coincidencias encontradas
                  </p>
                )}
                {results.map((tx, i) => (
                  <div
                    key={`${tx.referencia}-${i}`}
                    className="rounded-xl p-4"
                    style={{ background: 'var(--green-light, #f0fdf4)', border: '1.5px solid var(--green, #16a34a)' }}
                  >
                    <div className="flex items-center gap-2 mb-3">
                      <CheckCircle size={16} style={{ color: 'var(--green, #16a34a)' }} />
                      <span className="text-sm font-semibold" style={{ color: 'var(--green, #16a34a)' }}>
                        {results.length > 1 ? `Coincidencia ${i + 1}` : 'Transacción encontrada'}
                      </span>
                    </div>
                    <div className="space-y-2.5">
                      <div className="flex justify-between items-center">
                        <span className="text-xs" style={{ color: 'var(--ash)' }}>Fecha</span>
                        <span className="text-sm font-medium" style={{ color: 'var(--jet)' }}>{tx.fecha}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-xs" style={{ color: 'var(--ash)' }}>Referencia</span>
                        <span className="text-sm font-mono" style={{ color: 'var(--jet)' }}>{tx.referencia}</span>
                      </div>
                      <div
                        className="flex justify-between items-center pt-1"
                        style={{ borderTop: '0.5px solid var(--border-md)' }}
                      >
                        <span className="text-xs font-medium" style={{ color: 'var(--ash)' }}>Monto</span>
                        <span className="text-lg font-bold" style={{ color: 'var(--pb)' }}>
                          Bs. {fmt(tx.monto)}
                        </span>
                      </div>
                      {tx.descripcion && (
                        <div className="flex justify-between items-start gap-4">
                          <span className="text-xs flex-shrink-0" style={{ color: 'var(--ash)' }}>Descripción</span>
                          <span className="text-xs text-right" style={{ color: 'var(--ash)' }}>{tx.descripcion}</span>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div
                className="rounded-xl p-4"
                style={{ background: 'var(--red-light)', border: '1.5px solid var(--red)' }}
              >
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
    </div>
  );
}

// ─── Página principal ─────────────────────────────────────────────────────────
export default function Conciliador() {
  const {
    bank, selectBank,
    transactions, fileName,
    dragging, setDragging,
    loading,
    searchOpen, setSearchOpen,
    query, setQuery,
    results, setResults,
    showClearConfirm, setShowClearConfirm,
    bankInfo, fileRef,
    processFile, handleDrop, handleFileInput,
    handleSearch, openSearch, clearFile,
  } = useConciliador();

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Encabezado */}
      <div className="mb-6">
        <h1 className="text-xl font-semibold" style={{ color: 'var(--jet)' }}>Conciliador Bancario</h1>
        <p className="text-sm mt-0.5" style={{ color: 'var(--ash)' }}>
          Carga tu estado de cuenta para verificar transacciones por los últimos 6 dígitos de referencia.
        </p>
      </div>

      {/* Paso 1: selector de banco + zona de carga */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        <BankSelector bank={bank} onSelect={selectBank} />
        <DropZone
          dragging={dragging}
          loading={loading}
          fileName={fileName}
          transactions={transactions}
          bankInfo={bankInfo}
          fileRef={fileRef}
          onDrop={handleDrop}
          onDragOver={e => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onFileInput={handleFileInput}
          onClick={() => !loading && fileRef.current?.click()}
        />
      </div>

      {/* Barra de acciones */}
      {transactions.length > 0 && (
        <div className="flex items-center justify-between mb-4 gap-3">
          <div className="flex items-center gap-3">
            <span className="text-sm" style={{ color: 'var(--ash)' }}>
              <span className="font-semibold" style={{ color: 'var(--jet)' }}>{transactions.length}</span> transacciones cargadas
            </span>
            <button
              type="button"
              onClick={() => setShowClearConfirm(true)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs"
              style={{ color: 'var(--ash)', border: '0.5px solid var(--border-md)' }}
            >
              <Trash2 size={12} />
              Limpiar
            </button>
          </div>
          <button
            type="button"
            onClick={openSearch}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white"
            style={{
              background:  'linear-gradient(135deg, var(--pb) 0%, var(--pb-mid) 100%)',
              boxShadow:   '0 4px 14px rgba(15,163,177,0.3)',
            }}
          >
            <Search size={14} />
            Buscar por referencia
          </button>
        </div>
      )}

      {/* Tabla de transacciones */}
      {transactions.length > 0 && (
        <TransactionsTable transactions={transactions} />
      )}

      {/* Modal de búsqueda */}
      {searchOpen && (
        <SearchModal
          bankInfo={bankInfo}
          transactions={transactions}
          query={query}
          setQuery={setQuery}
          results={results}
          setResults={setResults}
          onSearch={handleSearch}
          onClose={() => setSearchOpen(false)}
        />
      )}

      {/* Confirmación de limpieza */}
      {showClearConfirm && (
        <ConfirmDeleteModal
          titulo="Limpiar archivo cargado"
          nombre="todas las transacciones cargadas"
          onConfirm={clearFile}
          onCancel={() => setShowClearConfirm(false)}
        />
      )}
    </div>
  );
}
