/** Select de banco reutilizado por Conciliación y Clasificación de Pagos. */
const BancoSelect = ({ value, onChange, bancosDisponibles, className, style }) => (
    <select value={value} onChange={onChange} className={className} style={style}>
        <option value="todos">Todos los bancos</option>
        <option value="sin_banco">Sin banco (Efectivo)</option>
        {bancosDisponibles.map(b => (
            <option key={b.id} value={b.id}>{b.nombre}</option>
        ))}
    </select>
);

export default BancoSelect;
