const InitialsAvatar = ({ nombre, apellido, color = '#6b7280', size = 8 }) => {
    const initials = `${nombre?.[0] ?? ''}${apellido?.[0] ?? ''}`.toUpperCase();
    return (
        <div
            className={`w-${size} h-${size} rounded-full flex items-center justify-center text-white font-semibold flex-shrink-0`}
            style={{ background: color, fontSize: size <= 8 ? 11 : 13 }}
        >
            {initials}
        </div>
    );
};

export default InitialsAvatar;
