import { FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Wifi } from 'lucide-react';
import { api } from '@/api/client';
import { useAuth } from '@/store/auth';

export default function Login() {
  const navigate = useNavigate();
  const setTokens = useAuth((s) => s.setTokens);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setErr(null);
    setLoading(true);
    try {
      const { data } = await api.post('/auth/login', { email, password });
      setTokens(data.access_token, data.refresh_token, email);
      navigate('/dashboard', { replace: true });
    } catch (ex: any) {
      setErr(ex?.response?.data?.detail ?? 'Ошибка входа');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-full flex items-center justify-center bg-mk-bg p-6">
      <div className="w-full max-w-sm card">
        <div className="flex items-center gap-2 mb-6">
          <Wifi className="text-mk-accent2" size={28} />
          <div>
            <div className="text-lg font-semibold">ROSzetta</div>
            <div className="text-xs text-mk-mute">Вход в панель управления</div>
          </div>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="block text-xs text-mk-mute mb-1">Логин</label>
            <input
              className="input"
              type="text"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus
            />
          </div>
          <div>
            <label className="block text-xs text-mk-mute mb-1">Пароль</label>
            <input
              className="input"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          {err && <div className="text-sm text-mk-err">{err}</div>}

          <button className="btn-primary w-full" disabled={loading}>
            {loading ? 'Входим…' : 'Войти'}
          </button>
        </form>
      </div>
    </div>
  );
}
