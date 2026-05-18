import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Terminal, Play, AlertTriangle, Bot, HardDrive } from 'lucide-react';
import { api, CLIRunOut, Device } from '@/api/client';
import ChatBot from '@/components/ChatBot';
import FirmwarePage from '@/pages/Firmware';

const PRESETS = [
  '/system/identity/print',
  '/system/resource/print',
  '/interface/print',
  '/ip/address/print',
  '/ip/route/print',
  '/system/clock/print',
  '/log/print',
];

const DANGEROUS = [
  '/system/reboot',
  '/system/shutdown',
  '/system/reset-configuration',
  '/system/routerboard/upgrade',
  '/file/remove',
];

export default function CLIPage() {
  const [params] = useSearchParams();
  const [devices, setDevices] = useState<Device[]>([]);
  const initialIds = (params.get('ids') ?? '').split(',').map(Number).filter(Boolean);
  const [selected, setSelected] = useState<Set<number>>(new Set(initialIds));
  const [command, setCommand] = useState('/system/resource/print');
  const [out, setOut] = useState<CLIRunOut | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [tab, setTab] = useState<'cli' | 'assistant' | 'firmware'>(() => {
    const h = (typeof window !== 'undefined' ? window.location.hash : '').replace('#', '');
    if (h === 'assistant' || h === 'firmware' || h === 'cli') return h;
    return 'cli';
  });

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.history.replaceState(null, '', `#${tab}`);
    }
  }, [tab]);

  useEffect(() => {
    api.get<Device[]>('/devices').then((r) => setDevices(r.data));
  }, []);

  const isDangerous = useMemo(
    () => DANGEROUS.some((p) => command.trim().startsWith(p)),
    [command],
  );

  const toggle = (id: number) => {
    setSelected((s) => {
      const x = new Set(s);
      if (x.has(id)) x.delete(id); else x.add(id);
      return x;
    });
  };

  const run = async () => {
    setErr(null);
    if (selected.size === 0) { setErr('Выберите хотя бы одно устройство'); return; }
    if (!command.trim()) { setErr('Введите команду'); return; }
    if (isDangerous && !confirm(`Опасная команда!\n\n${command}\n\nЗапустить на ${selected.size} устройств?`)) {
      return;
    }
    setBusy(true);
    try {
      const r = await api.post<CLIRunOut>('/cli/run', {
        device_ids: Array.from(selected),
        command,
        confirm: isDangerous,
      });
      setOut(r.data);
    } catch (ex: any) {
      setErr(ex?.response?.data?.detail ?? 'Ошибка');
    } finally { setBusy(false); }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Terminal size={16} />
        <h2 className="text-base font-semibold">Автоматизация</h2>
        <span className="text-xs text-mk-mute">CLI и помощник</span>
      </div>

      <div className="flex items-center gap-1 border-b border-mk-border">
        <button
          onClick={() => setTab('cli')}
          className={`inline-flex items-center gap-1.5 px-3 py-2 text-sm border-b-2 -mb-px transition-colors ${
            tab === 'cli'
              ? 'border-mk-accent text-mk-text'
              : 'border-transparent text-mk-mute hover:text-mk-text'
          }`}
        >
          <Terminal size={14} /> CLI
        </button>
        <button
          onClick={() => setTab('assistant')}
          className={`inline-flex items-center gap-1.5 px-3 py-2 text-sm border-b-2 -mb-px transition-colors ${
            tab === 'assistant'
              ? 'border-mk-accent text-mk-text'
              : 'border-transparent text-mk-mute hover:text-mk-text'
          }`}
        >
          <Bot size={14} /> Помощник
        </button>
        <button
          onClick={() => setTab('firmware')}
          className={`inline-flex items-center gap-1.5 px-3 py-2 text-sm border-b-2 -mb-px transition-colors ${
            tab === 'firmware'
              ? 'border-mk-accent text-mk-text'
              : 'border-transparent text-mk-mute hover:text-mk-text'
          }`}
        >
          <HardDrive size={14} /> Репозиторий прошивок
        </button>
      </div>

      {tab === 'assistant' && <ChatBot embedded />}
      {tab === 'firmware' && <FirmwarePage embedded />}

      {tab === 'cli' && (
      <div className="space-y-3">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="card p-3">
          <h3 className="text-xs uppercase tracking-wider text-mk-mute mb-2">Устройства ({selected.size})</h3>
          <div className="max-h-64 overflow-auto space-y-0.5">
            {devices.map((d) => (
              <label key={d.id} className="flex items-center gap-2 text-sm hover:bg-mk-panel2 px-2 py-1 rounded">
                <input type="checkbox" checked={selected.has(d.id)} onChange={() => toggle(d.id)} />
                <span className={`w-2 h-2 rounded-full ${d.status === 'up' ? 'bg-mk-ok' : d.status === 'down' ? 'bg-mk-err' : 'bg-mk-mute'}`} />
                <span className="truncate">{d.identity || d.name}</span>
                <span className="ml-auto text-xs text-mk-mute font-mono">{d.host}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="card p-3 md:col-span-2 space-y-2">
          <h3 className="text-xs uppercase tracking-wider text-mk-mute">Команда</h3>
          <textarea
            className="input font-mono text-sm h-20"
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            placeholder="/system/resource/print"
          />
          <div className="flex flex-wrap gap-1">
            {PRESETS.map((p) => (
              <button
                key={p}
                className="text-[11px] px-2 py-0.5 rounded bg-mk-panel2 hover:bg-mk-panel2/60 text-mk-mute font-mono"
                onClick={() => setCommand(p)}
              >{p}</button>
            ))}
          </div>
          {isDangerous && (
            <div className="text-xs text-mk-warn flex items-center gap-1.5">
              <AlertTriangle size={12} /> Опасная команда — потребуется подтверждение
            </div>
          )}
          {err && <div className="text-sm text-mk-err">{err}</div>}
          <div className="flex justify-end">
            <button className="btn-primary" onClick={run} disabled={busy}>
              <Play size={14} /> {busy ? 'Выполнение…' : 'Запустить'}
            </button>
          </div>
        </div>
      </div>

      {out && (
        <div className="card p-0 overflow-hidden">
          <div className="px-3 py-2 border-b border-mk-border text-xs text-mk-mute font-mono">
            $ {out.command}
          </div>
          <div className="divide-y divide-mk-border">
            {out.results.map((r) => (
              <div key={r.device_id} className="p-3">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`w-2 h-2 rounded-full ${r.ok ? 'bg-mk-ok' : 'bg-mk-err'}`} />
                  <span className="text-sm font-medium">{r.device_name ?? `device:${r.device_id}`}</span>
                </div>
                {r.error && <div className="text-xs text-mk-err font-mono">{r.error}</div>}
                {r.ok && r.rows && (
                  <pre className="text-[11px] font-mono bg-mk-bg p-2 rounded overflow-auto max-h-64">
                    {JSON.stringify(r.rows, null, 2)}
                  </pre>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
      </div>
      )}
    </div>
  );
}
