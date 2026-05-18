import { useEffect, useState } from 'react';
import { BellOff, Save } from 'lucide-react';
import { AppSettings } from '@/api/client';
import { useSettings } from '@/store/settings';

type NotifyBoolKey = Exclude<keyof AppSettings['notify'], 'style'>;

const NOTIFY_LABELS: Record<NotifyBoolKey, string> = {
  device_status: 'Изменение статуса устройства (up/down)',
  internet: 'Отсутствие интернета на устройстве',
  abnormal_reboot: 'Аномальная перезагрузка устройства',
  firmware: 'Появление новой версии RouterOS',
};

export default function NotifySettingsPage() {
  const { settings, load, patch } = useSettings();
  const [draft, setDraft] = useState<AppSettings['notify'] | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => { load(); }, []);
  useEffect(() => { if (settings) setDraft({ ...settings.notify }); }, [settings]);

  if (!draft) return <div className="text-mk-mute">Загрузка…</div>;

  const upd = (k: NotifyBoolKey, v: boolean) => setDraft({ ...draft, [k]: v });

  const save = async () => {
    setBusy(true); setMsg(null);
    try {
      await patch({ notify: draft });
      setMsg('Сохранено');
    } catch (ex: any) {
      setMsg(`Ошибка: ${ex?.response?.data?.detail ?? ex.message}`);
    } finally { setBusy(false); }
  };

  return (
    <div className="card space-y-3">
      <div className="flex items-center gap-2">
        <BellOff size={14} className="text-mk-warn" />
        <h3 className="text-sm font-semibold">Уведомления о проблемах</h3>
      </div>
      <p className="text-xs text-mk-mute">
        Отключите категории, которые не должны генерировать алерты и попадать в global health.
      </p>
      <div className="space-y-1.5">
        {(Object.keys(NOTIFY_LABELS) as Array<NotifyBoolKey>).map((k) => (
          <label key={k} className="flex items-center gap-2 text-sm hover:bg-mk-panel2 px-2 py-1 rounded">
            <input
              type="checkbox"
              checked={draft[k]}
              onChange={(e) => upd(k, e.target.checked)}
            />
            <span>{NOTIFY_LABELS[k]}</span>
          </label>
        ))}
      </div>
      <div className="pt-2 border-t border-mk-border">
        <div className="text-xs text-mk-mute mb-1.5">Стиль сообщения при полном благополучии:</div>
        <div className="flex gap-3">
          {(['jokes', 'serious'] as const).map((s) => (
            <label key={s} className="flex items-center gap-1.5 text-sm cursor-pointer">
              <input
                type="radio"
                name="notify-style"
                checked={draft.style === s}
                onChange={() => setDraft({ ...draft, style: s })}
              />
              <span>{s === 'jokes' ? 'С шутками' : 'Строго'}</span>
            </label>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <button className="btn-primary !py-1 !text-xs" onClick={save} disabled={busy}>
          <Save size={13} /> {busy ? 'Сохранение…' : 'Сохранить'}
        </button>
        {msg && <span className="text-xs text-mk-mute">{msg}</span>}
      </div>
    </div>
  );
}
