import { useEffect, useState } from 'react';
import { Send, Save } from 'lucide-react';
import { api, AppSettings } from '@/api/client';
import { useSettings } from '@/store/settings';

export default function TelegramBotPage() {
  const { settings, load, patch } = useSettings();
  const [draft, setDraft] = useState<AppSettings['telegram'] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => { load(); }, []);
  useEffect(() => {
    if (settings) setDraft({ ...settings.telegram });
  }, [settings]);

  if (!draft) return <div className="text-mk-mute">Загрузка…</div>;

  const upd = (k: keyof AppSettings['telegram'], v: any) =>
    setDraft({ ...draft, [k]: v });

  const save = async () => {
    setBusy('save'); setMsg(null);
    try {
      await patch({ telegram: draft });
      setMsg('Настройки Telegram сохранены');
    } catch (ex: any) {
      setMsg(`Ошибка: ${ex?.response?.data?.detail ?? ex.message}`);
    } finally { setBusy(null); }
  };

  const test = async () => {
    setBusy('tg'); setMsg(null);
    try {
      await patch({ telegram: draft });
      const r = await api.post<{ ok: boolean; message: string }>('/settings/telegram/test');
      setMsg(r.data.ok ? 'Тестовое сообщение отправлено ✓' : `Ошибка TG: ${r.data.message}`);
    } catch (ex: any) {
      setMsg(`Ошибка: ${ex?.response?.data?.detail ?? ex.message}`);
    } finally { setBusy(null); }
  };

  return (
    <div className="card space-y-3">
      <div className="flex items-center gap-2">
        <Send size={14} className="text-mk-accent2" />
        <h3 className="text-sm font-semibold">Telegram-бот</h3>
      </div>
      <p className="text-xs text-mk-mute">
        Опциональная отправка алертов в Telegram. Создайте бота через <code>@BotFather</code>,
        получите <code>chat_id</code> через <code>@userinfobot</code>.
      </p>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox" checked={draft.enabled}
          onChange={(e) => upd('enabled', e.target.checked)}
        />
        Включить отправку
      </label>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-mk-mute">Bot token</label>
          <input
            className="input font-mono text-xs"
            type="password"
            placeholder="123456:ABC-DEF…"
            value={draft.bot_token}
            onChange={(e) => upd('bot_token', e.target.value)}
          />
        </div>
        <div>
          <label className="text-xs text-mk-mute">Chat ID</label>
          <input
            className="input font-mono text-xs"
            type="text"
            placeholder="123456789 или -100…"
            value={draft.chat_id}
            onChange={(e) => upd('chat_id', e.target.value)}
          />
        </div>
        <div>
          <label className="text-xs text-mk-mute">Минимальная серьёзность</label>
          <select
            className="input"
            value={draft.min_severity}
            onChange={(e) => upd('min_severity', e.target.value)}
          >
            <option value="info">info</option>
            <option value="warning">warning</option>
            <option value="error">error</option>
            <option value="critical">critical</option>
          </select>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button className="btn-primary !py-1 !text-xs" onClick={save} disabled={busy !== null}>
          <Save size={13} /> {busy === 'save' ? 'Сохранение…' : 'Сохранить'}
        </button>
        <button
          className="btn-ghost !py-1 !text-xs"
          onClick={test}
          disabled={busy !== null || !draft.bot_token}
        >
          <Send size={13} /> {busy === 'tg' ? 'Отправка…' : 'Сохранить и отправить тест'}
        </button>
        {msg && <span className="text-xs text-mk-mute">{msg}</span>}
      </div>
    </div>
  );
}
