import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from '@/store/auth';
import Login from '@/pages/Login';
import AppLayout from '@/components/AppLayout';
import Dashboard from '@/pages/Dashboard';
import DevicesIndex from '@/pages/DevicesIndex';
import DeviceDetail from '@/pages/DeviceDetail';
import AlertsPage from '@/pages/Alerts';
import CLIPage from '@/pages/CLI';
import NotificationCenter from '@/pages/NotificationCenter';
import SettingsPage from '@/pages/Settings';

function Protected({ children }: { children: JSX.Element }) {
  const token = useAuth((s) => s.accessToken);
  if (!token) return <Navigate to="/login" replace />;
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/"
        element={
          <Protected>
            <AppLayout />
          </Protected>
        }
      >
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="devices" element={<DevicesIndex />} />
        <Route path="devices/:id" element={<DeviceDetail />} />
        <Route path="switches" element={<Navigate to="/devices#switches" replace />} />
        <Route path="firmware" element={<Navigate to="/cli#firmware" replace />} />
        <Route path="notifications" element={<NotificationCenter />} />
        <Route path="alerts" element={<AlertsPage />} />
        <Route path="cli" element={<CLIPage />} />
        <Route path="audit" element={<Navigate to="/notifications" replace />} />
        <Route path="logs" element={<Navigate to="/dashboard" replace />} />
        <Route path="network_map" element={<Navigate to="/dashboard" replace />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
