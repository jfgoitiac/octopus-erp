import { useContext } from 'react';
import { Navigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';

const PrivateRoute = ({ children }) => {
    const { user, loading } = useContext(AuthContext);

    if (loading) return <div className="p-10 text-center">Verificando credenciales...</div>;

    return user ? children : <Navigate to="/login" />;
};

export default PrivateRoute;