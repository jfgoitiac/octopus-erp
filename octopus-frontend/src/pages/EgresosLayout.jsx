import { Outlet } from 'react-router-dom';
import EgresosNav from '../components/egresos/EgresosNav';

export default function EgresosLayout() {
  return <div><EgresosNav /><Outlet /></div>;
}
