import { FormEvent, useEffect, useState } from 'react';
import { Download, HardDrive, Plus, Trash2, RefreshCw, Layers, CheckCircle2, AlertTriangle, Upload } from 'lucide-react';
import {
  api, Firmware, FirmwareBulkOut, FirmwareChannelsOut,
} from '@/api/client';
import { useAuth } from '@/store/auth';

function fmtSize(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KiB`;
  return `${(b / 1024 / 1024).toFixed(2)} MiB`;
}

function fmtDt(s?: string): string {
  if (!s) return '—';
  try { return new Date(s).toLocaleString(); } catch { return s; }
}

function ChannelsWidget({ data, onRefresh, refreshing }: {
  data: FirmwareChannelsOut | null; onRefresh: () => void; refreshing: boolean;
}) {
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

export default function FirmwarePage({ embedded = false }: { embedded?: boolean } = {}) {
  const [list, setList] = useState<Firmware[]>([]);
  const [open, setOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [channels, setChannels] = useState<FirmwareChannelsOut | null>(null);
  const [checking, setChecking] = useState(false);
  const token = useAuth((s) => s.accessToken);

  const reload = () => api.get<Firmware[]>('/firmware').then((r) => setList(r.data));
  const reloadChannels = () => api.get<FirmwareChannelsOut>('/firmware/channels')
    .then((r) => setChannels(r.data)).catch(() => {});

  useEffect(() => { reload(); reloadChannels(); }, []);

  const checkUpdates = async () => {
    setChecking(true);
    try {
      await api.post('/firmware/check');
      await reloadChannels();
    } catch { /* ignore */ }
    finally { setChecking(false); }
  };

  const remove = async (id: number) => {
    if (!confirm('Удалить прошивку из репозитория?')) return;
    await api.delete(`/firmware/${id}`);
    await reload();
  };

  const download = (f: Firmware) => {
    fetch(`/api/v1/firmware/${f.id}/download`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.blob())
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = f.name; a.click();
        URL.revokeObjectURL(url);
      });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap justify-between items-center gap-2">
        {!embedded && <h2 className="text-lg font-semibold">Внутренний репозиторий прошивок</h2>}
        <div className="flex gap-2 ml-auto">
          <button className="btn-ghost" onClick={() => setUploadOpen(true)}>
            <Upload size={16} /> Загрузить файл
          </button>
          <button className="btn-ghost" onClick={() => setBulkOpen(true)}>
            <Layers size={16} /> Загрузить по архитектурам
          </button>
          <button className="btn-primary" onClick={() => setOpen(true)}>
            <Plus size={16} /> Загрузить с URL
          </button>
        </div>
      </div>

      <ChannelsWidget data={channels} onRefresh={checkUpdates} refreshing={checking} />

      <div className="card p-0 overflow-hidden">
        <table className="w-full text-[13px]">
          <thead className="bg-mk-panel2 text-mk-mute text-[10px] uppercase tracking-wider">
            <tr>
              <th className="text-left px-3 py-1 w-8">#</th>
              <th className="text-left px-3 py-1">Файл</th>
              <th className="text-left px-3 py-1">Версия</th>
              <th className="text-left px-3 py-1">Архитектура</th>
              <th className="text-left px-3 py-1">Канал</th>
              <th className="text-left px-3 py-1">Размер</th>
              <th className="text-left px-3 py-1">Загружено</th>
              <th className="text-right px-3 py-1">Действия</th>
            </tr>
          </thead>
          <tbody>
            {list.length === 0 && (
              <tr><td colSpan={8} className="px-4 py-6 text-center text-mk-mute">
                Нет прошивок. Загрузите по URL или массово по архитектурам.
              </td></tr>
            )}
            {list.map((f, idx) => (
              <tr key={f.id} className="border-t border-mk-border hover:bg-mk-panel2/40">
                <td className="px-3 py-1 text-mk-mute text-xs">{idx + 1}</td>
                <td className="px-3 py-1">
                  <div className="flex items-center gap-2">
                    <HardDrive size={13} className="text-mk-mute" />
                    <span className="truncate">{f.name}</span>
                  </div>
                </td>
                <td className="px-3 py-1">{f.version || '—'}</td>
                <td className="px-3 py-1">{f.architecture || '—'}</td>
                <td className="px-3 py-1">{f.channel || '—'}</td>
                <td className="px-3 py-1">{fmtSize(f.size)}</td>
                <td className="px-3 py-1 text-mk-mute text-xs">
                  {new Date(f.created_at).toLocaleString()}
                </td>
                <td className="px-3 py-1 text-right whitespace-nowrap">
                  <button className="btn-ghost !py-0.5 !px-1.5" onClick={() => download(f)} title="Скачать">
                    <Download size={12} />
                  </button>
                  <button className="btn-ghost !py-0.5 !px-1.5 ml-1" onClick={() => remove(f.id)} title="Удалить">
                    <Trash2 size={12} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {open && <ImportFirmwareModal onClose={() => setOpen(false)} onCreated={reload} />}
      {uploadOpen && (
        <UploadFirmwareModal
          arches={channels?.architectures || []}
          onClose={() => setUploadOpen(false)}
          onDone={reload}
        />
      )}
      {bulkOpen && (
        <BulkImportModal
          arches={channels?.architectures || []}
          channels={channels}
          onClose={() => setBulkOpen(false)}
          onDone={reload}
        />
      )}
    </div>
  );
}

function UploadFirmwareModal({ arches, onClose, onDone }: {
  arches: string[]; onClose: () => void; onDone: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [version, setVersion] = useState('');
  const [architecture, setArchitecture] = useState('');
  const [channel, setChannel] = useState('stable');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  // Авто-разбор имени файла routeros-<ver>-<arch>.npk
  const onPick = (f: File | null) => {
    setFile(f);
    if (!f) return;
    const m = f.name.toLowerCase().match(/^routeros-([\d.]+[a-z0-9.\-]*)-([a-z0-9_]+)\.npk$/);
    if (m) {
      if (!version) setVersion(m[1]);
      if (!architecture) setArchitecture(m[2]);
    }
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!file) { setErr('Выберите файл'); return; }
    setBusy(true); setErr(null); setMsg(null);
    const fd = new FormData();
    fd.append('file', file);
    if (version) fd.append('version', version);
    if (architecture) fd.append('architecture', architecture);
    if (channel) fd.append('channel', channel);
    try {
      const r = await api.post<Firmware>('/firmware/upload', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 300000,
      });
      setMsg(`Загружено: ${r.data.name}` + (r.data.version ? ` (${r.data.version})` : ''));
      onDone();
      setTimeout(onClose, 800);
    } catch (ex: any) {
      setErr(ex?.response?.data?.detail ?? String(ex?.message ?? 'Ошибка'));
    } finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="card w-full max-w-md">
        <h3 className="text-base font-semibold mb-4">Загрузить прошивку с диска</h3>
        <form onSubmit={submit} className="space-y-3">
          <div>
            <label className="text-xs text-mk-mute">Файл .npk</label>
            <input
              className="input" type="file" accept=".npk,application/octet-stream" required
              onChange={(e) => onPick(e.target.files?.[0] ?? null)}
            />
            {file && (
              <div className="text-[11px] text-mk-mute mt-1">
                {file.name} · {fmtSize(file.size)}
              </div>
            )}
          </div>
          <div>
            <label className="text-xs text-mk-mute">Версия (необязательно)</label>
            <input className="input" type="text" placeholder="например 7.16.1"
              value={version} onChange={(e) => setVersion(e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-mk-mute">Архитектура (необязательно)</label>
            <input
              className="input" type="text" placeholder="например arm64"
              list="arch-list"
              value={architecture} onChange={(e) => setArchitecture(e.target.value)}
            />
            <datalist id="arch-list">
              {arches.map((a) => <option key={a} value={a} />)}
            </datalist>
          </div>
          <div>
            <label className="text-xs text-mk-mute">Канал</label>
            <select className="input" value={channel} onChange={(e) => setChannel(e.target.value)}>
              <option value="stable">stable</option>
              <option value="long-term">long-term</option>
              <option value="testing">testing</option>
              <option value="development">development</option>
            </select>
          </div>
          <p className="text-[11px] text-mk-mute">
            Лимит: 200 MiB. Дубликаты определяются по sha256 и (версия+архитектура) — повторно не сохраняются.
          </p>
          {err && <div className="text-sm text-mk-err">{err}</div>}
          {msg && <div className="text-sm text-mk-ok">{msg}</div>}
          <div className="flex gap-2 justify-end pt-2">
            <button type="button" className="btn-ghost" onClick={onClose}>Закрыть</button>
            <button className="btn-primary" disabled={busy || !file}>
              {busy ? 'Загрузка…' : 'Загрузить'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ImportFirmwareModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState({
    url: '', name: '', version: '', architecture: '', channel: 'stable',
  });
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true); setErr(null);
    const payload: Record<string, unknown> = { url: form.url };
    if (form.name) payload.name = form.name;
    if (form.version) payload.version = form.version;
    if (form.architecture) payload.architecture = form.architecture;
    if (form.channel) payload.channel = form.channel;
    try {
      await api.post('/firmware/import', payload);
      onCreated(); onClose();
    } catch (ex: any) {
      setErr(ex?.response?.data?.detail ?? 'Ошибка');
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="card w-full max-w-md">
        <h3 className="text-base font-semibold mb-4">Загрузить прошивку с URL</h3>
        <form onSubmit={submit} className="space-y-3">
          <div>
            <label className="text-xs text-mk-mute">URL .npk</label>
            <input
              className="input" type="url" required
              placeholder="https://download.mikrotik.com/routeros/7.16.1/routeros-7.16.1-arm64.npk"
              value={form.url}
              onChange={(e) => setForm({ ...form, url: e.target.value })}
            />
          </div>
          {(['name', 'version', 'architecture'] as const).map((k) => (
            <div key={k}>
              <label className="text-xs text-mk-mute">{k} (необязательно)</label>
              <input
                className="input" type="text"
                value={form[k]}
                onChange={(e) => setForm({ ...form, [k]: e.target.value })}
              />
            </div>
          ))}
          <div>
            <label className="text-xs text-mk-mute">channel</label>
            <select
              className="input"
              value={form.channel}
              onChange={(e) => setForm({ ...form, channel: e.target.value })}
            >
              <option value="stable">stable</option>
              <option value="long-term">long-term</option>
              <option value="testing">testing</option>
              <option value="development">development</option>
            </select>
          </div>
          {err && <div className="text-sm text-mk-err">{err}</div>}
          <div className="flex gap-2 justify-end pt-2">
            <button type="button" className="btn-ghost" onClick={onClose}>Отмена</button>
            <button className="btn-primary" disabled={saving}>
              {saving ? 'Загрузка…' : 'Загрузить'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function BulkImportModal({ arches, channels, onClose, onDone }: {
  arches: string[]; channels: FirmwareChannelsOut | null; onClose: () => void; onDone: () => void;
}) {
  const available = channels?.available_channels || ['stable'];
  const state = channels?.channels || {};
  const [channel, setChannel] = useState(available[0]);
  // Версия подставляется из обновления канала, но пользователь может перебить.
  const channelVersion = state[channel]?.version || '';
  const [version, setVersion] = useState(channelVersion);
  const [overridden, setOverridden] = useState(false);
  // При смене канала — подставить версию (если юзер её не правил вручную).
  useEffect(() => {
    if (!overridden) setVersion(channelVersion);
  }, [channelVersion, overridden]);
  const [picked, setPicked] = useState<Set<string>>(new Set(['arm64', 'mipsbe', 'mmips']));
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<FirmwareBulkOut | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const toggle = (a: string) => {
    const n = new Set(picked);
    n.has(a) ? n.delete(a) : n.add(a);
    setPicked(n);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!version || picked.size === 0) return;
    setBusy(true); setErr(null); setResult(null);
    try {
      const r = await api.post<FirmwareBulkOut>('/firmware/import-bulk', {
        version, channel, architectures: Array.from(picked),
      });
      setResult(r.data);
      onDone();
    } catch (ex: any) {
      setErr(ex?.response?.data?.detail ?? 'Ошибка');
    } finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="card w-full max-w-xl max-h-[90vh] overflow-auto">
        <h3 className="text-base font-semibold mb-4">Массовая загрузка по архитектурам</h3>
        <form onSubmit={submit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-mk-mute">Канал</label>
              <select
                className="input"
                value={channel}
                onChange={(e) => { setChannel(e.target.value); setOverridden(false); }}
              >
                {available.map((c) => {
                  const v = state[c]?.version;
                  return <option key={c} value={c}>{c}{v ? ` — ${v}` : ''}</option>;
                })}
              </select>
            </div>
            <div>
              <label className="text-xs text-mk-mute">Версия RouterOS {channelVersion && !overridden && <span className="text-mk-mute">(из канала)</span>}</label>
              <input
                className="input" required placeholder="7.16.1"
                value={version}
                onChange={(e) => { setVersion(e.target.value); setOverridden(true); }}
              />
              {!channelVersion && (
                <p className="text-[11px] text-mk-warn mt-1">
                  Нет данных о версии канала — запустите «Проверить обновления».
                </p>
              )}
            </div>
          </div>
          <div>
            <label className="text-xs text-mk-mute">Архитектуры ({picked.size})</label>
            <div className="grid grid-cols-3 md:grid-cols-4 gap-1 mt-1">
              {arches.map((a) => (
                <label key={a} className="flex items-center gap-1.5 text-sm hover:bg-mk-panel2 px-2 py-1 rounded">
                  <input type="checkbox" checked={picked.has(a)} onChange={() => toggle(a)} />
                  {a}
                </label>
              ))}
            </div>
          </div>
          <p className="text-[11px] text-mk-mute">
            URL формируется как <code>https://download.mikrotik.com/routeros/&lt;version&gt;/routeros-&lt;version&gt;-&lt;arch&gt;.npk</code>.
          </p>
          {err && <div className="text-sm text-mk-err">{err}</div>}
          {result && (
            <div className="card !p-2 text-xs space-y-1">
              {result.results.map((r) => (
                <div key={r.architecture} className="flex items-center gap-2">
                  {r.ok
                    ? <CheckCircle2 size={12} className="text-mk-ok" />
                    : <AlertTriangle size={12} className="text-mk-err" />}
                  <span className="font-mono">{r.architecture}</span>
                  {r.ok && r.skipped && (
                    <span className="text-mk-mute">уже в репозитории — пропущено</span>
                  )}
                  {!r.ok && <span className="text-mk-mute truncate">{r.error}</span>}
                </div>
              ))}
            </div>
          )}
          <div className="flex gap-2 justify-end pt-2">
            <button type="button" className="btn-ghost" onClick={onClose}>Закрыть</button>
            <button className="btn-primary" disabled={busy || !version || picked.size === 0}>
              {busy ? 'Загрузка…' : `Загрузить ${picked.size}`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
