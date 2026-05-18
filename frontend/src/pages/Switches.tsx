import { FormEvent, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Trash2, Pencil, Wifi, WifiOff } from 'lucide-react';
import { api, Device } from '@/api/client';

function StatusDot({ status }: { status: string }) {
  const cls =
    status === 'up'   ? 'bg-mk-ok'   :
    status === 'down' ? 'bg-mk-err'  :
                        'bg-mk-mute' ;
  return <span className={`inline-block w-2 h-2 rounded-full ${cls} flex-shrink-0`} />;
}

export default function SwitchesPage() {
  const [list, setList] = useState<Device[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Device | null>(null);

  const reload = () =>
    api.get<Device[]>('/devices', { params: { kind: 'switch' } }).then((r) => setList(r.data));

  useEffect(() => { reload(); }, []);

  const remove = async (id: number) => {
    if (!confirm('Удалить свич?')) return;
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
              <th className="text-left px-2 py-1 w-5"></th>
              <th className="text-left px-2 py-1">Имя</th>
              <th className="text-left px-2 py-1">Хост</th>
              <th className="text-left px-2 py-1">Модель</th>
              <th className="text-left px-2 py-1">RouterOS</th>
              <th className="text-left px-2 py-1">Internet</th>
              <th className="text-left px-2 py-1">Статус</th>
              <th className="text-right px-2 py-1 w-20"></th>
            </tr>
          </thead>
          <tbody>
            {list.length === 0 && (
              <tr><td colSpan={9} className="px-3 py-3 text-center text-mk-mute">Нет свичей</td></tr>
            )}
            {list.map((d, idx) => (
              <tr key={d.id} className="border-t border-mk-border hover:bg-mk-panel2/40">
                <td className="px-2 py-0.5 text-mk-mute text-xs">{idx + 1}</td>
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
                <td className="px-2 py-0.5">{d.ros_version || '—'}</td>
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
                  <button className="btn-ghost !py-0.5 !px-1.5" onClick={() => setEditing(d)} title="Редактировать">
                    <Pencil size={12} />
                  </button>
                  <button className="btn-ghost !py-0.5 !px-1.5 ml-1" onClick={() => remove(d.id)} title="Удалить">
                    <Trash2 size={12} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {open && <SwitchModal onClose={() => setOpen(false)} onSaved={reload} />}
      {editing && (
        <SwitchModal
          device={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); reload(); }}
        />
      )}
    </div>
  );
}

function SwitchModal({
  device, onClose, onSaved,
}: {
  device?: Device;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!device;
  const [form, setForm] = useState({
    name: device?.name ?? '',
    host: device?.host ?? '',
    port: device?.port ?? 8729,
    use_tls: device?.use_tls ?? true,
    username: device?.username ?? 'admin',
    password: '',
  });
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true); setErr(null);
    try {
      if (isEdit) {
        const payload: Record<string, unknown> = { ...form };
        if (!payload.password) delete payload.password;
        await api.patch(`/devices/${device!.id}`, payload);
      } else {
        await api.post('/devices', { ...form, kind: 'switch' });
      }
      onSaved(); onClose();
    } catch (ex: any) {
      setErr(ex?.response?.data?.detail ?? 'Ошибка');
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="card w-full max-w-md">
        <h3 className="text-base font-semibold mb-4">
          {isEdit ? 'Редактировать свич' : 'Новый свич'}
        </h3>
        <form onSubmit={submit} className="space-y-3">
          {(['name', 'host', 'username'] as const).map((k) => (
            <div key={k}>
              <label className="text-xs text-mk-mute">{k}</label>
              <input
                className="input"
                type="text"
                value={(form as any)[k]}
                onChange={(e) => setForm({ ...form, [k]: e.target.value })}
                required
              />
            </div>
          ))}
          <div>
            <label className="text-xs text-mk-mute">
              password{isEdit ? ' (оставьте пустым — без изменений)' : ''}
            </label>
            <input
              className="input"
              type="password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              required={!isEdit}
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
            <button className="btn-primary" disabled={saving}>
              {saving ? 'Сохранение…' : isEdit ? 'Сохранить' : 'Создать'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
