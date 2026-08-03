import { useState, useCallback, useRef, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { toast } from 'react-toastify';
import { BANKS, parseStatement } from '../utils/bankParsers';
import apiClient from '../api/apiClient';

// Recorta bytes de espacio en blanco (\t \n \r espacio) al inicio del buffer
// para que XLSX.read detecte correctamente formatos como HTML (<table>)
// cuya firma de bytes cae en el mismo caso que "texto plano" si hay padding.
function trimLeadingWhitespace(buffer) {
  const bytes = new Uint8Array(buffer);
  const whitespace = new Set([0x09, 0x0a, 0x0d, 0x20]);
  let start = 0;
  while (start < bytes.length && whitespace.has(bytes[start])) start++;
  return start === 0 ? buffer : bytes.slice(start).buffer;
}

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
  const [page, setPage]                       = useState(1);
  const fileRef                               = useRef();

  const bankInfo = useMemo(() => BANKS.find(b => b.id === bank), [bank]);

  // Devuelve rows: string[][], mismo formato que produce
  // XLSX.utils.sheet_to_json(ws, { header: 1 }) para el flujo Excel/CSV,
  // así ambos caminos alimentan la misma parseStatement() sin cambios.
  const extractRowsFromExcel = useCallback(async (file) => {
    const buffer = await file.arrayBuffer();
    // Algunos bancos (ej. Banco del Tesoro) exportan tablas HTML con extensión
    // .xls/.xlsx que arrancan con saltos de línea/espacios en blanco. SheetJS
    // detecta el formato leyendo el primer byte crudo, así que ese padding lo
    // hace confundir el archivo con texto plano y no detecta ninguna fila.
    const trimmed = trimLeadingWhitespace(buffer);
    // raw:true evita que SheetJS "adivine" números en tablas HTML (ej. interpreta
    // "124000,00" como 12400000 al asumir la coma como separador de miles en vez
    // de decimal). Dejamos el texto crudo y parseAmount() hace la conversión.
    const wb = XLSX.read(trimmed, { type: 'array', cellDates: false, raw: true });
    const ws = wb.Sheets[wb.SheetNames[0]];
    return XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  }, []);

  // El PDF se procesa en el backend con pdfplumber (extracción de tablas
  // mucho más robusta que reconstruirlas a mano en el navegador desde
  // texto+coordenadas). Es genérico para cualquier banco: el backend solo
  // devuelve filas crudas, la detección de columnas la sigue haciendo
  // parseStatement() como con Excel/CSV.
  const extractRowsFromPdf = useCallback(async (file) => {
    const formData = new FormData();
    formData.append('archivo', file);
    // apiClient trae Content-Type: application/json por defecto. Si no se
    // anula aquí, axios detecta ese "application/json" y convierte el
    // FormData a JSON con JSON.stringify() en vez de enviarlo como
    // multipart (ver axios/lib/defaults/index.js: hasJSONContentType),
    // rompiendo la subida del archivo. Al poner Content-Type en undefined,
    // el navegador genera el header multipart/form-data con el boundary
    // correcto a partir del FormData.
    const { data } = await apiClient.post('cobranza/conciliacion/extraer-pdf/', formData, {
      headers: { 'Content-Type': undefined },
    });
    return data.rows;
  }, []);

  const processFile = useCallback(async (file) => {
    if (!bank) {
      toast.error('Selecciona un banco antes de cargar el archivo.');
      return;
    }
    setLoading(true);
    try {
      const isPdf = file.name.toLowerCase().endsWith('.pdf');
      const rows  = isPdf ? await extractRowsFromPdf(file) : await extractRowsFromExcel(file);
      const txs   = parseStatement(rows, bank);
      if (txs.length === 0) {
        toast.warning('No se detectaron transacciones. Verifica que el banco seleccionado coincida con el archivo.');
      } else {
        toast.success(`${txs.length} transacciones cargadas correctamente.`);
      }
      setTransactions(txs);
      setFileName(file.name);
      setPage(1);
    } catch (err) {
      const backendError = err?.response?.data?.error;
      if (backendError) {
        toast.error(backendError);
      } else if (file.name.toLowerCase().endsWith('.pdf')) {
        toast.error('Error al leer el PDF. Verifica que no esté dañado o protegido con contraseña.');
      } else {
        toast.error('Error al leer el archivo. Verifica que sea un Excel o CSV válido.');
      }
    } finally {
      setLoading(false);
    }
  }, [bank, extractRowsFromExcel, extractRowsFromPdf]);

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
    if (query.length < 4 || query.length > 6) return;
    const n = query.length;
    const found = transactions.filter(
      tx => tx.referencia.replace(/\D/g, '').slice(-n) === query
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
    setPage(1);
  }, []);

  const selectBank = useCallback((id) => {
    setBank(id);
    setTransactions([]);
    setFileName('');
    setResults(null);
    setPage(1);
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
    page,
    setPage,
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
