import { useState, useCallback, useRef, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { toast } from 'react-toastify';
import { BANKS, parseStatement } from '../utils/bankParsers';

export function useConciliador() {
  const [bank, setBank]                       = useState('');
  const [transactions, setTransactions]       = useState([]);
  const [fileName, setFileName]               = useState('');
  const [dragging, setDragging]               = useState(false);
  const [loading, setLoading]                 = useState(false);
  const [searchOpen, setSearchOpen]           = useState(false);
  const [query, setQuery]                     = useState('');
  const [results, setResults]                 = useState(null); // null = sin buscar, [] = sin resultados, [...] = encontrados
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const fileRef                               = useRef();

  const bankInfo = useMemo(() => BANKS.find(b => b.id === bank), [bank]);

  const processFile = useCallback(async (file) => {
    if (!bank) {
      toast.error('Selecciona un banco antes de cargar el archivo.');
      return;
    }
    setLoading(true);
    try {
      const buffer = await file.arrayBuffer();
      const wb     = XLSX.read(buffer, { type: 'array', cellDates: false });
      const ws     = wb.Sheets[wb.SheetNames[0]];
      const rows   = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
      const txs    = parseStatement(rows, bank);
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

  const handleFileInput = useCallback((e) => {
    const file = e.target.files[0];
    if (file) processFile(file);
    e.target.value = '';
  }, [processFile]);

  const handleSearch = useCallback(() => {
    if (query.length !== 6) return;
    const found = transactions.filter(
      tx => tx.referencia.replace(/\D/g, '').slice(-6) === query
    );
    setResults(found);
  }, [query, transactions]);

  const openSearch = useCallback(() => {
    if (transactions.length === 0) {
      toast.warning('Primero carga un estado de cuenta.');
      return;
    }
    setQuery('');
    setResults(null);
    setSearchOpen(true);
  }, [transactions.length]);

  const clearFile = useCallback(() => {
    setTransactions([]);
    setFileName('');
    setResults(null);
    setShowClearConfirm(false);
  }, []);

  const selectBank = useCallback((id) => {
    setBank(id);
    setTransactions([]);
    setFileName('');
    setResults(null);
  }, []);

  return {
    bank,
    selectBank,
    transactions,
    fileName,
    dragging,
    setDragging,
    loading,
    searchOpen,
    setSearchOpen,
    query,
    setQuery,
    results,
    setResults,
    showClearConfirm,
    setShowClearConfirm,
    bankInfo,
    fileRef,
    processFile,
    handleDrop,
    handleFileInput,
    handleSearch,
    openSearch,
    clearFile,
  };
}
