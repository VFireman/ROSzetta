import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Plus, Trash2, Check, AlertCircle,
  ArrowUpCircle, Wifi, WifiOff,
} from 'lucide-react';
import { api, Device, Firmware } from '@/api/client';
import { latestStableVersion, isOutdated } from '@/utils/version';

function StatusDot({ status }: { status: string }) {
  const cls =
    status === 'up'   ? 'bg-mk-ok'   :
    status === 'down' ? 'bg-mk-err'  :
                        'bg-mk-mute' ;
  return <span className={`inline-block w-2 h-2 rounded-full ${cls} flex-shrink-0`} />;
}

function CheckIcon({ device }: { device: Device }) {
  if (device.last_error || device.abnormal_reboot) {
    const t = device.abnormal_reboot ? 'Аварийный reboot' : (device.last_error ?? 'ошибка');
    return (
      <span title={t} className="inline-flex items-center text-mk-err">
        <AlertCircle size={14} />
      </span>
    );
  }
  if (device.status === 'up') {
    return (
      <span title="OK" className="inline-flex items-center text-mk-ok">
        <Check size={14} />
      </span>
    );
  }
  return <span className="inline-flex items-center text-mk-mute">·</span>;
}

export default function Devices() {
  const [list, setList] = useState<Device[]>([]);
  const [firmware, setFirmware] = useState<Firmware[]>([]);
  const [open, setOpen] = useState(false);

  const reload = () =>
    api.get<Device[]>('/devices', { params: { kind: 'router' } }).then((r) => setList(r.data));

  useEffect(() => {
    reload();
    api.get<Firmware[]>('/firmware').then((r) => setFirmware(r.data)).catch(() => {});
  }, []);

  const latestVer = useMemo(() => latestStableVersion(firmware), [firmware]);

  const remove = async (id: number) => {
    if (!confirm('Удалить устройство?')) return;
    await api.delete(`/devices/${id}`);
    await reload();
  };

  return (
    <div className="space-y-3">
      <div className="flex justify-end items-center">
        <button className="btn-primary !py-1 !text-xs" onClick={() => setOpen(true)}>
          <Plus size={13} /> Добавить
        </button>
      </div>

      <div className="card p-0 overflow-hidden">
        <table className="w-full text-[13px]">
          <thead className="bg-mk-panel2 text-mk-mute text-[10px] uppercase tracking-wider">
            <tr>
              <th className="text-left px-2 py-1 w-8">#</th>
              <th className="text-left px-2 py-1 w-6">✓</th>
              <th className="text-left px-2 py-1 w-5"></th>
              <th className="text-left px-2 py-1">Имя</th>
              <th className="text-left px-2 py-1">Хост</th>
              <th className="text-left px-2 py-1">Модель</th>
              <th className="text-left px-2 py-1">RouterOS</th>
              <th className="text-left px-2 py-1">Internet</th>
              <th className="text-left px-2 py-1">Статус</th>
              <th className="text-right px-2 py-1 w-10"></th>
            </tr>
          </thead>
          <tbody>
            {list.length === 0 && (
              <tr><td colSpan={10} className="px-3 py-3 text-center text-mk-mute">Нет устройств</td></tr>
            )}
            {list.map((d, idx) => {
              const outdated = isOutdated(d.ros_version, latestVer);
              return (
              <tr
                key={d.id}
                className={`border-t border-mk-border hover:bg-mk-panel2/40 ${
                  outdated ? 'bg-mk-warn/[0.06]' : ''
                }`}
              >
                <td className="px-2 py-0.5 text-mk-mute text-xs">{idx + 1}</td>
                <td className="px-2 py-0.5"><CheckIcon device={d} /></td>
                <td className="px-2 py-0.5"><StatusDot status={d.status} /></td>
                <td className="px-2 py-0.5">
                  <Link to={`/devices/${d.id}`} className="text-mk-accent2 hover:underline">
                    {d.identity || d.name}
                  </Link>
                  {d.last_error && (
                    <div className="text-[10px] text-mk-err truncate max-w-[260px]" title={d.last_error}>
                      {d.last_error}
                    </div>
                  )}
                </td>
                <td className="px-2 py-0.5 text-mk-mute">{d.host}:{d.port}{d.use_tls ? ' (TLS)' : ''}</td>
                <td className="px-2 py-0.5 text-mk-mute">{d.model || '—'}</td>
                <td className="px-2 py-0.5">
                  <span className="inline-flex items-center gap-1.5">
                    {d.ros_version || '—'}
                    {outdated && (
                      <span
                        className="inline-flex items-center gap-0.5 text-mk-warn text-[10px]"
                        title={`Доступна: ${latestVer}`}
                      >
                        <ArrowUpCircle size={11} /> {latestVer}
                      </span>
                    )}
                  </span>
                </td>
                <td className="px-2 py-0.5">
                  {d.internet_ok === true && <Wifi size={13} className="text-mk-ok" />}
                  {d.internet_ok === false && <WifiOff size={13} className="text-mk-warn" />}
                  {d.internet_ok === null && <span className="text-mk-mute">—</span>}
                </td>
                <td className="px-2 py-0.5">
                  <span className={`text-[10px] px-1.5 py-0.5 ${
                    d.status === 'up' ? 'badge-up' : d.status === 'down' ? 'badge-down' : 'badge-unk'
                  }`}>
                    {d.status.toUpperCase()}
                  </span>
                </td>
                <td className="px-2 py-0.5 text-right">
                  <button className="btn-ghost !py-0.5 !px-1.5" onClick={() => remove(d.id)} title="Удалить">
                    <Trash2 size={12} />
                  </button>
                </td>
              </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {open && <AddDeviceModal onClose={() => setOpen(false)} onCreated={reload} />}
    </div>
  );
}

function AddDeviceModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState({
    name: '', host: '', port: 8729, use_tls: true, username: 'admin', password: '',
  });
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true); setErr(null);
    try {
      await api.post('/devices', form);
      onCreated(); onClose();
    } catch (ex: any) {
      setErr(ex?.response?.data?.detail ?? 'Ошибка');
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="card w-full max-w-md">
        <h3 className="text-base font-semibold mb-4">Новое устройство</h3>
        <form onSubmit={submit} className="space-y-3">
          {(['name', 'host', 'username', 'password'] as const).map((k) => (
            <div key={k}>
              <label className="text-xs text-mk-mute">{k}</label>
              <input
                className="input"
                type={k === 'password' ? 'password' : 'text'}
                value={(form as any)[k]}
                onChange={(e) => setForm({ ...form, [k]: e.target.value })}
                required
              />
            </div>
          ))}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-mk-mute">port</label>
              <input
                className="input" type="number"
                value={form.port}
                onChange={(e) => setForm({ ...form, port: Number(e.target.value) })}
              />
            </div>
            <label className="flex items-end gap-2 text-sm pb-2">
              <input
                type="checkbox" checked={form.use_tls}
                onChange={(e) => setForm({ ...form, use_tls: e.target.checked })}
              />
              api-ssl
            </label>
          </div>
          {err && <div className="text-sm text-mk-err">{err}</div>}
          <div className="flex gap-2 justify-end pt-2">
            <button type="button" className="btn-ghost" onClick={onClose}>Отмена</button>
            <button className="btn-primary" disabled={saving}>{saving ? 'Сохранение…' : 'Создать'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function EditDeviceModal({ device, onClose, onSaved }: { device: Device; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    name: device.name,
    host: device.host,
    port: device.port,
    use_tls: device.use_tls,
    username: device.username,
    password: '',
  });
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true); setErr(null);
    const payload: Record<string, unknown> = { ...form };
    if (!payload.password) delete payload.password;
    try {
      await api.patch(`/devices/${device.id}`, payload);
      onSaved(); onClose();
    } catch (ex: any) {
      setErr(ex?.response?.data?.detail ?? 'Ошибка');
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="card w-full max-w-md">
        <h3 className="text-base font-semibold mb-4">Редактировать устройство</h3>
        <form onSubmit={submit} className="space-y-3">
          {(['name', 'host', 'username'] as const).map((k) => (
            <div key={k}>
              <label className="text-xs text-mk-mute">{k}</label>
              <input
                className="input"
                type="text"
                value={form[k]}
                onChange={(e) => setForm({ ...form, [k]: e.target.value })}
                required
              />
            </div>
          ))}
          <div>
            <label className="text-xs text-mk-mute">password (оставьте пустым — без изменений)</label>
            <input
              className="input"
              type="password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-mk-mute">port</label>
              <input
                className="input" type="number"
                value={form.port}
                onChange={(e) => setForm({ ...form, port: Number(e.target.value) })}
              />
            </div>
            <label className="flex items-end gap-2 text-sm pb-2">
              <input
                type="checkbox" checked={form.use_tls}
                onChange={(e) => setForm({ ...form, use_tls: e.target.checked })}
              />
              api-ssl
            </label>
          </div>
          {err && <div className="text-sm text-mk-err">{err}</div>}
          <div className="flex gap-2 justify-end pt-2">
            <button type="button" className="btn-ghost" onClick={onClose}>Отмена</button>
            <button className="btn-primary" disabled={saving}>{saving ? 'Сохранение…' : 'Сохранить'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
