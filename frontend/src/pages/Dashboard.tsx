import { useEffect, useState } from 'react';
import { Activity, Router as RouterIcon, AlertTriangle, CheckCircle2, WifiOff, Bell } from 'lucide-react';
import { api, Alert as AlertT, Device, HeartbeatBucket, HeartbeatOut } from '@/api/client';
import { useSettings } from '@/store/settings';

function StatCard({
  icon: Icon, label, value, accent,
}: { icon: any; label: string; value: string | number; accent: string }) {
  return (
    <div className="card flex items-center gap-3 !p-4">
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${accent}`}>
        <Icon size={20} />
      </div>
      <div>
        <div className="text-[10px] text-mk-mute uppercase tracking-wider">{label}</div>
        <div className="text-xl font-semibold leading-tight">{value}</div>
      </div>
    </div>
  );
}

const BUCKET_COLORS: Record<HeartbeatBucket, string> = {
  up:      'bg-mk-ok',
  'no-net':'bg-mk-warn',
  down:    'bg-mk-err',
  none:    'bg-mk-panel2',
};

const BUCKET_LABEL: Record<HeartbeatBucket, string> = {
  up: 'OK', 'no-net': 'нет интернета', down: 'оффлайн', none: 'нет данных',
};

function HeartbeatGrid({ data }: { data: HeartbeatOut }) {
  const since = new Date(data.since);
  const until = new Date(data.until);
  const binMin = Math.round(((until.getTime() - since.getTime()) / data.bins) / 60000);
  return (
    <div className="card space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Activity size={14} className="text-mk-accent2" />
        <h3 className="text-sm font-semibold">Heartbeat — {data.hours < 1 ? `${Math.round(data.hours * 60)}м` : `${data.hours}ч`}</h3>
        <span className="text-[11px] text-mk-mute sm:ml-auto">
          {data.bins} бинов × {binMin} мин
        </span>
      </div>
      {data.devices.length === 0 ? (
        <div className="text-sm text-mk-mute">Нет устройств.</div>
      ) : (
        <div className="space-y-1 overflow-x-auto -mx-1 px-1">
          {data.devices.map((d) => (
            <div key={d.id} className="flex items-center gap-2 sm:gap-3 min-w-[420px]">
              <div className="w-24 sm:w-32 shrink-0 truncate text-xs">
                <div className="font-medium truncate">{d.name}</div>
                <div className="text-[10px] text-mk-mute font-mono truncate">{d.host}</div>
              </div>
              <div className="flex-1 grid gap-[1px]" style={{ gridTemplateColumns: `repeat(${data.bins}, minmax(0,1fr))` }}>
                {d.buckets.map((b, i) => (
                  <div
                    key={i}
                    className={`h-3.5 rounded-[2px] ${BUCKET_COLORS[b]}`}
                    title={`Бин ${i + 1}/${data.bins}: ${BUCKET_LABEL[b]}`}
                  />
                ))}
              </div>
              <span className={`badge-${d.status === 'up' ? 'up' : d.status === 'down' ? 'down' : 'unk'} text-[10px]`}>
                {d.status}
              </span>
            </div>
          ))}
        </div>
      )}
      <div className="flex flex-wrap gap-3 text-[11px] text-mk-mute pt-1 border-t border-mk-border">
        {(['up', 'no-net', 'down', 'none'] as HeartbeatBucket[]).map((b) => (
          <span key={b} className="inline-flex items-center gap-1.5">
            <span className={`w-3 h-3 rounded-sm ${BUCKET_COLORS[b]}`} /> {BUCKET_LABEL[b]}
          </span>
        ))}
      </div>
    </div>
  );
}

export default function Dashboard() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [hb, setHb] = useState<HeartbeatOut | null>(null);
  const hours = useSettings((s) => s.settings?.ui?.heartbeat_hours ?? 6);

  useEffect(() => {
    api.get<Device[]>('/devices').then((r) => setDevices(r.data)).catch(() => {});
  }, []);

  useEffect(() => {
    // бины: ~120 ячеек, не меньше 60, не больше 180 (более мелкая сетка)
    const bins = Math.max(60, Math.min(180, Math.round(Number(hours) * 24)));
    const loadHb = () => api.get<HeartbeatOut>(`/heartbeat?hours=${hours}&bins=${bins}`)
      .then((r) => setHb(r.data)).catch(() => {});
    loadHb();
    const t = setInterval(loadHb, 60000);
    return () => clearInterval(t);
  }, [hours]);

  const up      = devices.filter((d) => d.status === 'up').length;
  const down    = devices.filter((d) => d.status === 'down').length;
  const unknown = devices.filter((d) => d.status !== 'up' && d.status !== 'down').length;
  const noNet   = devices.filter((d) => d.internet_ok === false).length;
  const abnormal = devices.filter((d) => d.abnormal_reboot).length;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <StatCard icon={RouterIcon}    label="Устройства" value={devices.length} accent="bg-mk-accent/15 text-mk-accent2" />
        <StatCard icon={CheckCircle2}  label="Online"     value={up}             accent="bg-mk-ok/15 text-mk-ok" />
        <StatCard icon={AlertTriangle} label="Offline"    value={down}           accent="bg-mk-err/15 text-mk-err" />
        <StatCard icon={WifiOff}       label="Без интернета" value={noNet}       accent="bg-mk-warn/15 text-mk-warn" />
        <StatCard icon={Activity}      label="Аварийные reboot" value={abnormal} accent="bg-mk-warn/15 text-mk-warn" />
      </div>

      {hb && <HeartbeatGrid data={hb} />}

      <ActivityWidget />

      {unknown > 0 && (
        <div className="card text-xs text-mk-mute">
          Устройства без статуса: {unknown}. Откройте карточку устройства и нажмите «Опросить».
        </div>
      )}
    </div>
  );
}

function ActivityWidget() {
  const [alerts, setAlerts] = useState<AlertT[]>([]);
  useEffect(() => {
    api.get<AlertT[]>('/alerts', { params: { only_unack: false } })
      .then((r) => setAlerts(r.data.slice(0, 30))).catch(() => {});
  }, []);
  const sevColor = (s: string) =>
    s === 'critical' ? 'text-mk-err' :
    s === 'error'    ? 'text-mk-err' :
    s === 'warning'  ? 'text-mk-warn' :
                       'text-mk-mute';
  return (
    <div className="card !p-0 overflow-hidden">
      <div className="flex border-b border-mk-border">
        <div className="px-4 py-2 text-xs font-medium inline-flex items-center gap-1.5 border-b-2 -mb-px border-mk-accent2 text-mk-text">
          <Bell size={13} /> Алерты <span className="text-[10px] opacity-70">({alerts.length})</span>
        </div>
      </div>
      <div className="max-h-72 overflow-y-auto divide-y divide-mk-border">
        {alerts.length === 0 && (
          <div className="px-4 py-6 text-center text-mk-mute text-sm">Нет алертов</div>
        )}
        {alerts.map((a) => (
          <div key={a.id} className={`px-3 py-1.5 text-xs flex items-start gap-2 ${a.acknowledged ? 'opacity-60' : ''}`}>
            <span className={`${sevColor(a.severity)} font-medium uppercase text-[10px] mt-0.5 w-14 shrink-0`}>{a.severity}</span>
            <div className="flex-1 min-w-0">
              <div className="truncate">{a.title}</div>
              {a.message && <div className="text-[11px] text-mk-mute truncate">{a.message}</div>}
            </div>
            <span className="text-[10px] text-mk-mute font-mono shrink-0">{new Date(a.created_at).toLocaleTimeString()}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
