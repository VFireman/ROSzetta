import { useEffect, useState } from 'react';
import { Bell, CheckCheck, Trash2, AlertTriangle, AlertCircle, Info, Eraser } from 'lucide-react';
import { api, Alert as AlertT } from '@/api/client';

function sevIcon(s: string) {
  if (s === 'critical' || s === 'error') return <AlertCircle size={14} className="text-mk-err" />;
  if (s === 'warning') return <AlertTriangle size={14} className="text-mk-warn" />;
  return <Info size={14} className="text-mk-accent2" />;
}

export default function AlertsPage() {
  const [alerts, setAlerts] = useState<AlertT[]>([]);
  const [onlyUnack, setOnlyUnack] = useState(false);

  const reload = () =>
    api.get<AlertT[]>('/alerts', { params: { only_unack: onlyUnack } })
       .then((r) => setAlerts(r.data));

  useEffect(() => { reload(); }, [onlyUnack]);

  const ack = async (id: number) => { await api.post(`/alerts/${id}/ack`); reload(); };
  const ackAll = async () => { await api.post('/alerts/ack-all'); reload(); };
  const remove = async (id: number) => {
    if (!confirm('Удалить алерт?')) return;
    await api.delete(`/alerts/${id}`); reload();
  };
  const purge = async () => {
    const onlyAcked = confirm('OK — удалить только прочитанные.\nОтмена — удалить все.');
    if (!confirm(onlyAcked ? 'Удалить все прочитанные алерты?' : 'Удалить ВСЕ алерты?')) return;
    await api.delete('/alerts', { params: { only_acked: onlyAcked } });
    reload();
  };

  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-2">
          <Bell size={16} />
          <h2 className="text-base font-semibold">Alert Center</h2>
          <span className="text-xs text-mk-mute">всего: {alerts.length}</span>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-mk-mute flex items-center gap-1.5">
            <input type="checkbox" checked={onlyUnack} onChange={(e) => setOnlyUnack(e.target.checked)} />
            только непрочитанные
          </label>
          <button className="btn-ghost !py-1 !text-xs" onClick={ackAll}>
            <CheckCheck size={13} /> Прочитать всё
          </button>
          <button className="btn-ghost !py-1 !text-xs text-mk-warn" onClick={purge}>
            <Eraser size={13} /> Очистить
          </button>
        </div>
      </div>

      <div className="card p-0 overflow-hidden">
        <table className="w-full text-[13px]">
          <thead className="bg-mk-panel2 text-mk-mute text-[10px] uppercase tracking-wider">
            <tr>
              <th className="px-2 py-1.5 w-8"></th>
              <th className="text-left px-2 py-1.5">Заголовок</th>
              <th className="text-left px-2 py-1.5">Категория</th>
              <th className="text-left px-2 py-1.5">Источник</th>
              <th className="text-left px-2 py-1.5">Время</th>
              <th className="text-right px-2 py-1.5">Действия</th>
            </tr>
          </thead>
          <tbody>
            {alerts.length === 0 && (
              <tr><td colSpan={6} className="px-3 py-3 text-center text-mk-mute">Нет алертов</td></tr>
            )}
            {alerts.map((a) => (
              <tr key={a.id} className={`border-t border-mk-border hover:bg-mk-panel2/40 ${
                a.acknowledged ? 'opacity-60' : ''
              }`}>
                <td className="px-2 py-1">{sevIcon(a.severity)}</td>
                <td className="px-2 py-1">
                  <div className={a.acknowledged ? '' : 'font-medium'}>{a.title}</div>
                  {a.message && <div className="text-[11px] text-mk-mute">{a.message}</div>}
                </td>
                <td className="px-2 py-1 text-mk-mute">{a.category}</td>
                <td className="px-2 py-1 text-mk-mute font-mono text-[11px]">{a.source ?? '—'}</td>
                <td className="px-2 py-1 text-mk-mute text-[11px]">{new Date(a.created_at).toLocaleString()}</td>
                <td className="px-2 py-1 text-right">
                  {!a.acknowledged && (
                    <button className="btn-ghost !py-0.5 !px-1.5" onClick={() => ack(a.id)} title="Прочитано">
                      <CheckCheck size={12} />
                    </button>
                  )}
                  <button className="btn-ghost !py-0.5 !px-1.5 ml-1" onClick={() => remove(a.id)} title="Удалить">
                    <Trash2 size={12} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
