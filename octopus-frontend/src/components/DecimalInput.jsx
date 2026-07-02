const DecimalInput = ({ value, onChange, className, style, placeholder, autoFocus, max }) => {
    const handleChange = (e) => {
        const digits = e.target.value.replace(/\D/g, '');
        if (!digits || parseInt(digits, 10) === 0) { onChange(''); return; }
        let num = parseInt(digits, 10) / 100;
        if (max !== undefined && max > 0 && num > max) num = parseFloat(max.toFixed(2));
        onChange(num.toFixed(2));
    };
    return (
        <input
            type="text"
            inputMode="numeric"
            className={className}
            style={style}
            placeholder={placeholder ?? '0.00'}
            value={value}
            onChange={handleChange}
            autoFocus={autoFocus}
        />
    );
};

export default DecimalInput;
