import { useEffect, useState } from 'react';
import { Layers, RefreshCw, CheckCircle2, AlertTriangle } from 'lucide-react';
import { api, FirmwareChannelsOut } from '@/api/client';

function fmtDt(s?: string): string {
  if (!s) return '—';
  try { return new Date(s).toLocaleString(); } catch { return s; }
}

/**
 * Самодостаточная карточка «Каналы RouterOS» — сама грузит данные и
 * умеет запускать проверку обновлений. Используется на дашборде и
 * во вкладке «Репозиторий прошивок» страницы Автоматизации.
 */
export default function FirmwareChannelsCard() {
  const [data, setData] = useState<FirmwareChannelsOut | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const reload = () => api.get<FirmwareChannelsOut>('/firmware/channels')
    .then((r) => setData(r.data)).catch(() => {});

  useEffect(() => { reload(); }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await api.post('/firmware/check');
      await reload();
    } catch { /* ignore */ }
    finally { setRefreshing(false); }
  };

  if (!data) return null;
  const order = data.available_channels;
  return (
    <div className="card space-y-3">
      <div className="flex items-center gap-2">
        <Layers size={14} className="text-mk-accent2" />
        <h3 className="text-sm font-semibold">Каналы RouterOS</h3>
        <button className="ml-auto btn-ghost !py-1 !text-xs" onClick={onRefresh} disabled={refreshing}>
          <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} /> Проверить
        </button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {order.map((ch) => {
          const info = data.channels[ch];
          const ok = info?.last_check_ok !== false && info?.version;
          return (
            <div key={ch} className="border border-mk-border rounded-md p-3 bg-mk-panel2/30">
              <div className="flex items-center gap-2">
                {ok ? (
                  <CheckCircle2 size={14} className="text-mk-ok" />
                ) : (
                  <AlertTriangle size={14} className="text-mk-warn" />
                )}
                <span className="font-medium text-sm">{ch}</span>
              </div>
              <div className="text-lg font-semibold mt-1">{info?.version || '—'}</div>
              <div className="text-[11px] text-mk-mute mt-1">
                Выпущена: {fmtDt(info?.released_at)}
              </div>
              <div className="text-[11px] text-mk-mute">
                Проверено: {fmtDt(info?.last_check)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
