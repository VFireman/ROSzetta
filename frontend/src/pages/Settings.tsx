import { FormEvent, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Database, Settings as SettingsIcon, Download, Upload, RefreshCw, Eye, Save,
  Globe, Palette, Tag, Activity, Radar, AlertTriangle, User as UserIcon, KeyRound,
  Lock, Unlock, ShieldCheck, ShieldAlert,
} from 'lucide-react';
import { api, AppSettings, vaultApi, VaultStatus, VaultMigration } from '@/api/client';
import { useAuth } from '@/store/auth';
import { useSettings } from '@/store/settings';
import { useT, LOCALES, THEMES, HEARTBEAT_RANGES, PROBE_INTERVALS } from '@/i18n';

const MENU_LABELS: Record<keyof AppSettings['menu'], string> = {
  dashboard: 'Dashboard',
  devices: 'Devices',
  switches: 'Свичи',
  firmware: 'Прошивки',
  notif_center: 'Центр уведомлений',
  cli: 'Автоматизация (CLI)',
  settings: 'Настройки',
};

type TabKey = 'general' | 'probe' | 'user' | 'security' | 'menu' | 'backup';

function parseHash(h: string): TabKey {
  const v = h.replace(/^#/, '');
  if (v === 'users' || v === 'password' || v === 'user') return 'user';
  if (v === 'security' || v === 'vault' || v === 'master') return 'security';
  if (v === 'menu') return 'menu';
  if (v === 'backup') return 'backup';
  if (v === 'probe') return 'probe';
  // 'config' и любые другие → general
  return 'general';
}

const TABS: { key: TabKey; label: string; icon: any }[] = [
  { key: 'general',  label: 'Общие',         icon: SettingsIcon },
  { key: 'probe',    label: 'Опрос',         icon: Radar },
  { key: 'user',     label: 'Пользователь',  icon: UserIcon },
  { key: 'security', label: 'Безопасность',  icon: ShieldCheck },
  { key: 'menu',     label: 'Меню',          icon: Eye },
  { key: 'backup',   label: 'Бэкап',         icon: Database },
];

export default function SettingsPage() {
  const token = useAuth((s) => s.accessToken);
  const email = useAuth((s) => s.email);
  const { settings, load, patch } = useSettings();
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [draft, setDraft] = useState<AppSettings | null>(null);
  const restoreInputRef = useRef<HTMLInputElement | null>(null);
  const t = useT();
  const location = useLocation();
  const navigate = useNavigate();
  const [tab, setTab] = useState<TabKey>(() => parseHash(location.hash));

  useEffect(() => { setTab(parseHash(location.hash)); }, [location.hash]);

  const switchTab = (k: TabKey) => {
    setTab(k);
    navigate({ pathname: location.pathname, hash: `#${k}` }, { replace: true });
  };

  useEffect(() => { load(); }, []);
  useEffect(() => { if (settings) setDraft(structuredClone(settings)); }, [settings]);

  const save = async () => {
    if (!draft) return;
    setBusy('save'); setMsg(null);
    try { await patch(draft); setMsg('Настройки сохранены'); }
    catch (ex: any) { setMsg(`Ошибка: ${ex?.response?.data?.detail ?? ex.message}`); }
    finally { setBusy(null); }
  };

  const downloadBackup = async (kind: 'config' | 'full') => {
    setBusy(kind); setMsg(null);
    try {
      const resp = await fetch(`/api/v1/controller/backup/${kind}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!resp.ok) throw new Error(await resp.text());
      const cd = resp.headers.get('content-disposition') || '';
      const m = /filename="([^"]+)"/.exec(cd);
      const name = m ? m[1] : `controller-${kind}.tar.gz`;
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = name; a.click();
      URL.revokeObjectURL(url);
    } catch (ex: any) {
      setMsg(`Ошибка: ${ex.message ?? ex}`);
    } finally { setBusy(null); }
  };

  const checkFirmware = async () => {
    setBusy('check'); setMsg(null);
    try {
      const r = await api.post<{ latest_version: string; released_at: string }>('/firmware/check');
      setMsg(`Последняя стабильная RouterOS: ${r.data.latest_version} (${new Date(r.data.released_at).toLocaleDateString()})`);
    } catch (ex: any) {
      setMsg(`Ошибка: ${ex?.response?.data?.detail ?? ex.message}`);
    } finally { setBusy(null); }
  };

  const restoreBackup = async (file: File) => {
    const ok = window.confirm(
      `Развернуть бэкап «${file.name}»?\n\nВНИМАНИЕ: текущая БД будет полностью заменена. Продолжить?`,
    );
    if (!ok) return;
    setBusy('restore'); setMsg(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const resp = await fetch('/api/v1/controller/backup/restore', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(data?.detail || resp.statusText);
      setMsg(data?.message || 'Бэкап развёрнут. Рекомендуется перезайти в систему.');
      load();
    } catch (ex: any) {
      setMsg(`Ошибка восстановления: ${ex?.message ?? ex}`);
    } finally { setBusy(null); }
  };

  if (!draft) return <div className="text-mk-mute">Загрузка настроек…</div>;

  const updMenu = (k: keyof AppSettings['menu'], v: boolean) =>
    setDraft({ ...draft, menu: { ...draft.menu, [k]: v } });
  const ui = draft.ui ?? { instance_name: 'ROSzetta', locale: 'ru', theme: 'mk-dark', heartbeat_hours: 6, probe_interval_minutes: 5 };
  const updUi = (k: keyof AppSettings['ui'], v: any) =>
    setDraft({ ...draft, ui: { ...ui, [k]: v } });

  // На вкладках "Пользователь" и "Безопасность" — свои кнопки в формах,
  // глобальный "Сохранить" не нужен.
  const showSaveBtn = tab !== 'user' && tab !== 'security';

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="flex items-center gap-2">
        <SettingsIcon size={16} />
        <h2 className="text-base font-semibold">{t('settings.title')}</h2>
        {showSaveBtn && (
          <button className="ml-auto btn-primary !py-1 !text-xs" onClick={save} disabled={busy === 'save'}>
            <Save size={13} /> {t('common.save')}
          </button>
        )}
      </div>

      <div className="flex items-center gap-1 border-b border-mk-border overflow-x-auto">
        {TABS.map((tb) => {
          const Icon = tb.icon;
          const active = tb.key === tab;
          return (
            <button
              key={tb.key}
              onClick={() => switchTab(tb.key)}
              className={`inline-flex items-center gap-1.5 px-3 py-2 text-sm border-b-2 -mb-px transition-colors whitespace-nowrap ${
                active ? 'border-mk-accent text-mk-text' : 'border-transparent text-mk-mute hover:text-mk-text'
              }`}
            >
              <Icon size={14} />
              {tb.label}
            </button>
          );
        })}
      </div>

      {tab === 'general' && (
        <>
          <div className="card space-y-3">
            <div className="flex items-center gap-2">
              <Tag size={14} className="text-mk-accent2" />
              <h3 className="text-sm font-semibold">{t('settings.identity')}</h3>
            </div>
            <p className="text-xs text-mk-mute">{t('settings.identity.hint')}</p>
            <div>
              <label className="text-xs text-mk-mute">{t('settings.instanceName')}</label>
              <input
                className="input"
                type="text"
                maxLength={64}
                value={ui.instance_name}
                onChange={(e) => updUi('instance_name', e.target.value)}
              />
            </div>
          </div>

          <div className="card space-y-3">
            <div className="flex items-center gap-2">
              <Globe size={14} className="text-mk-accent2" />
              <h3 className="text-sm font-semibold">{t('settings.locale')}</h3>
            </div>
            <div className="flex flex-wrap gap-2">
              {LOCALES.map((l) => (
                <button
                  key={l.code}
                  type="button"
                  onClick={() => updUi('locale', l.code)}
                  className={`px-3 py-1.5 rounded-md text-sm border transition-colors ${
                    ui.locale === l.code
                      ? 'bg-mk-accent/15 border-mk-accent2 text-mk-text'
                      : 'border-mk-border text-mk-mute hover:bg-mk-panel2'
                  }`}
                >
                  {l.label}
                </button>
              ))}
            </div>
          </div>

          <div className="card space-y-3">
            <div className="flex items-center gap-2">
              <Palette size={14} className="text-mk-accent2" />
              <h3 className="text-sm font-semibold">{t('settings.theme')}</h3>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {THEMES.map((th) => {
                const active = ui.theme === th.id;
                return (
                  <button
                    key={th.id}
                    type="button"
                    onClick={() => updUi('theme', th.id)}
                    className={`group flex items-center gap-3 p-2 rounded-md border text-left transition-colors ${
                      active
                        ? 'border-mk-accent2 bg-mk-accent/10'
                        : 'border-mk-border hover:bg-mk-panel2'
                    }`}
                  >
                    <span className="flex h-8 w-12 rounded overflow-hidden border border-mk-border shrink-0">
                      <span className="flex-1" style={{ background: th.swatch[0] }} />
                      <span className="flex-1" style={{ background: th.swatch[1] }} />
                      <span className="flex-1" style={{ background: th.swatch[2] }} />
                    </span>
                    <span className="text-xs">{th.label}</span>
                  </button>
                );
              })}
            </div>
            <p className="text-[11px] text-mk-mute">Тема применяется мгновенно после сохранения.</p>
          </div>
        </>
      )}

      {tab === 'probe' && (
        <>
          <div className="card space-y-3">
            <div className="flex items-center gap-2">
              <Radar size={14} className="text-mk-accent2" />
              <h3 className="text-sm font-semibold">{t('settings.probe')}</h3>
            </div>
            <p className="text-xs text-mk-mute">{t('settings.probe.hint')}</p>
            <div className="flex flex-wrap gap-2">
              {PROBE_INTERVALS.map((p) => {
                const active = Number(ui.probe_interval_minutes) === p.minutes;
                return (
                  <button
                    key={p.minutes}
                    type="button"
                    onClick={() => updUi('probe_interval_minutes', p.minutes)}
                    className={`px-3 py-1.5 rounded-md text-sm border transition-colors ${
                      active
                        ? 'bg-mk-accent/15 border-mk-accent2 text-mk-text'
                        : 'border-mk-border text-mk-mute hover:bg-mk-panel2'
                    }`}
                  >
                    {p.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="card space-y-3">
            <div className="flex items-center gap-2">
              <Activity size={14} className="text-mk-accent2" />
              <h3 className="text-sm font-semibold">{t('settings.heartbeat')}</h3>
            </div>
            <p className="text-xs text-mk-mute">{t('settings.heartbeat.hint')}</p>
            <div className="flex flex-wrap gap-2">
              {HEARTBEAT_RANGES.map((r) => {
                const active = Number(ui.heartbeat_hours) === r.hours;
                return (
                  <button
                    key={r.hours}
                    type="button"
                    onClick={() => updUi('heartbeat_hours', r.hours)}
                    className={`px-3 py-1.5 rounded-md text-sm border transition-colors ${
                      active
                        ? 'bg-mk-accent/15 border-mk-accent2 text-mk-text'
                        : 'border-mk-border text-mk-mute hover:bg-mk-panel2'
                    }`}
                  >
                    {r.label}
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}

      {tab === 'user' && <UserTab email={email} />}

      {tab === 'security' && <SecurityTab />}

      {tab === 'menu' && (
        <div className="card space-y-3">
          <div className="flex items-center gap-2">
            <Eye size={14} className="text-mk-accent2" />
            <h3 className="text-sm font-semibold">{t('settings.menu')}</h3>
          </div>
          <p className="text-xs text-mk-mute">Скрыть ненужные пункты бокового меню.</p>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {(Object.keys(MENU_LABELS) as Array<keyof AppSettings['menu']>).map((k) => (
              <label key={k} className="flex items-center gap-2 text-sm hover:bg-mk-panel2 px-2 py-1 rounded">
                <input
                  type="checkbox"
                  checked={draft.menu[k]}
                  onChange={(e) => updMenu(k, e.target.checked)}
                  disabled={k === 'settings'}
                />
                <span className={k === 'settings' ? 'text-mk-mute' : ''}>{MENU_LABELS[k]}</span>
              </label>
            ))}
          </div>
          <p className="text-[11px] text-mk-mute">Пункт «Настройки» нельзя скрыть.</p>
        </div>
      )}

      {tab === 'backup' && (
        <>
          <div className="card space-y-3">
            <div className="flex items-center gap-2">
              <Database size={14} className="text-mk-accent2" />
              <h3 className="text-sm font-semibold">Бэкап контроллера</h3>
            </div>
            <p className="text-xs text-mk-mute">
              <b>Полный</b> — дамп БД + настройки окружения. <b>Только конфиг</b> — без БД.
            </p>
            <div className="flex flex-wrap gap-2">
              <button className="btn-primary !py-1 !text-xs" disabled={busy !== null} onClick={() => downloadBackup('full')}>
                <Download size={13} /> Полный (БД + конфиг)
              </button>
              <button className="btn-ghost !py-1 !text-xs" disabled={busy !== null} onClick={() => downloadBackup('config')}>
                <Download size={13} /> Только конфиг
              </button>
            </div>
            <div className="border-t border-mk-border pt-3 mt-2">
              <div className="flex items-center gap-2 mb-1">
                <Upload size={13} className="text-mk-warn" />
                <span className="text-sm font-semibold">Развернуть бэкап</span>
              </div>
              <p className="text-[11px] text-mk-warn flex items-start gap-1">
                <AlertTriangle size={12} className="mt-0.5 shrink-0" />
                <span>Деструктивная операция: текущая БД будет полностью заменена.</span>
              </p>
              <input
                ref={restoreInputRef}
                type="file"
                accept=".tar.gz,.tgz,application/gzip"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) restoreBackup(f);
                  if (e.target) e.target.value = '';
                }}
              />
              <button
                className="btn-ghost !py-1 !text-xs mt-2 border-mk-warn/50 text-mk-warn hover:bg-mk-warn/10"
                disabled={busy !== null}
                onClick={() => restoreInputRef.current?.click()}
              >
                <Upload size={13} /> {busy === 'restore' ? 'Развёртывание…' : 'Выбрать файл бэкапа…'}
              </button>
            </div>
          </div>

          <div className="card space-y-3">
            <h3 className="text-sm font-semibold">Прошивки</h3>
            <p className="text-xs text-mk-mute">Автопроверка раз в сутки. Можно запустить вручную.</p>
            <button className="btn-ghost !py-1 !text-xs" disabled={busy !== null} onClick={checkFirmware}>
              <RefreshCw size={13} className={busy === 'check' ? 'animate-spin' : ''} /> Проверить сейчас
            </button>
          </div>
        </>
      )}

      {msg && <div className="card text-sm">{msg}</div>}
    </div>
  );
}

// ---------- Вкладка «Пользователь» ----------

function UserTab({ email }: { email: string | null }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setMsg(null);
    if (next.length < 4) { setMsg({ kind: 'err', text: 'Новый пароль слишком короткий (мин. 4 символа)' }); return; }
    if (next !== confirm) { setMsg({ kind: 'err', text: 'Пароли не совпадают' }); return; }
    setBusy(true);
    try {
      await api.post('/auth/change-password', { current, new: next });
      setMsg({ kind: 'ok', text: 'Пароль изменён' });
      setCurrent(''); setNext(''); setConfirm('');
    } catch (ex: any) {
      setMsg({ kind: 'err', text: ex?.response?.data?.detail ?? 'Ошибка смены пароля' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="card space-y-2">
        <div className="flex items-center gap-2">
          <UserIcon size={14} className="text-mk-accent2" />
          <h3 className="text-sm font-semibold">Текущий пользователь</h3>
        </div>
        <div className="text-sm">
          <span className="text-mk-mute">Логин:</span> <b>{email ?? '—'}</b>
        </div>
        <p className="text-[11px] text-mk-mute">
          Управление списком пользователей пока недоступно. Поддерживается только смена пароля
          текущего пользователя.
        </p>
      </div>

      <form onSubmit={submit} className="card space-y-3">
        <div className="flex items-center gap-2">
          <KeyRound size={14} className="text-mk-accent2" />
          <h3 className="text-sm font-semibold">Смена пароля</h3>
        </div>
        <div>
          <label className="text-xs text-mk-mute">Текущий пароль</label>
          <input
            className="input"
            type="password"
            autoComplete="current-password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            required
          />
        </div>
        <div>
          <label className="text-xs text-mk-mute">Новый пароль</label>
          <input
            className="input"
            type="password"
            autoComplete="new-password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            required
            minLength={4}
          />
        </div>
        <div>
          <label className="text-xs text-mk-mute">Повторите новый пароль</label>
          <input
            className="input"
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
            minLength={4}
          />
        </div>
        {msg && (
          <div className={`text-sm ${msg.kind === 'ok' ? 'text-mk-ok' : 'text-mk-err'}`}>{msg.text}</div>
        )}
        <button className="btn-primary !text-xs" disabled={busy}>
          {busy ? 'Меняем…' : 'Сменить пароль'}
        </button>
      </form>
    </div>
  );
}

// ---------- Вкладка «Безопасность» (мастер-пароль / vault) ----------

function SecurityTab() {
  const [status, setStatus] = useState<VaultStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [migration, setMigration] = useState<VaultMigration | null>(null);

  // init / unlock form
  const [pwd, setPwd] = useState('');
  const [pwd2, setPwd2] = useState('');
  // rotate form
  const [oldPwd, setOldPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [newPwd2, setNewPwd2] = useState('');

  const refresh = async () => {
    try { setStatus(await vaultApi.status()); }
    catch (ex: any) { setMsg({ kind: 'err', text: ex?.response?.data?.detail ?? String(ex) }); }
  };

  useEffect(() => { refresh(); }, []);

  const doInit = async (e: FormEvent) => {
    e.preventDefault();
    setMsg(null); setMigration(null);
    if (pwd.length < 8) { setMsg({ kind: 'err', text: 'Мастер-пароль должен быть не короче 8 символов' }); return; }
    if (pwd !== pwd2) { setMsg({ kind: 'err', text: 'Пароли не совпадают' }); return; }
    setBusy(true);
    try {
      const r = await vaultApi.init(pwd);
      setStatus(r.status);
      setMigration(r.migration ?? null);
      setPwd(''); setPwd2('');
      setMsg({ kind: 'ok', text: 'Мастер-пароль установлен. Vault разблокирован.' });
    } catch (ex: any) {
      setMsg({ kind: 'err', text: ex?.response?.data?.detail ?? 'Ошибка инициализации' });
    } finally { setBusy(false); }
  };

  const doUnlock = async (e: FormEvent) => {
    e.preventDefault();
    setMsg(null); setMigration(null);
    setBusy(true);
    try {
      const r = await vaultApi.unlock(pwd);
      setStatus(r.status);
      setMigration(r.migration ?? null);
      setPwd('');
      setMsg({ kind: 'ok', text: 'Vault разблокирован.' });
    } catch (ex: any) {
      setMsg({ kind: 'err', text: ex?.response?.data?.detail ?? 'Ошибка разблокировки' });
    } finally { setBusy(false); }
  };

  const doLock = async () => {
    setBusy(true); setMsg(null);
    try {
      await vaultApi.lock();
      await refresh();
      setMsg({ kind: 'ok', text: 'Vault заблокирован. Фоновые задачи опроса остановлены до следующей разблокировки.' });
    } catch (ex: any) {
      setMsg({ kind: 'err', text: ex?.response?.data?.detail ?? 'Ошибка блокировки' });
    } finally { setBusy(false); }
  };

  const doRotate = async (e: FormEvent) => {
    e.preventDefault();
    setMsg(null);
    if (newPwd.length < 8) { setMsg({ kind: 'err', text: 'Новый мастер-пароль не короче 8 символов' }); return; }
    if (newPwd !== newPwd2) { setMsg({ kind: 'err', text: 'Новые пароли не совпадают' }); return; }
    setBusy(true);
    try {
      const r = await vaultApi.rotate(oldPwd, newPwd);
      setStatus(r.status);
      setOldPwd(''); setNewPwd(''); setNewPwd2('');
      setMsg({ kind: 'ok', text: 'Мастер-пароль изменён. Все секреты остались валидными.' });
    } catch (ex: any) {
      setMsg({ kind: 'err', text: ex?.response?.data?.detail ?? 'Ошибка смены пароля' });
    } finally { setBusy(false); }
  };

  const renderStatus = () => {
    if (!status) return <span className="text-mk-mute">Загрузка…</span>;
    if (!status.initialized) {
      return <span className="inline-flex items-center gap-1.5 text-mk-warn"><ShieldAlert size={14}/> не инициализирован</span>;
    }
    if (status.unlocked) {
      return <span className="inline-flex items-center gap-1.5 text-mk-ok"><Unlock size={14}/> разблокирован</span>;
    }
    return <span className="inline-flex items-center gap-1.5 text-mk-warn"><Lock size={14}/> заблокирован</span>;
  };

  return (
    <div className="space-y-4">
      <div className="card space-y-2">
        <div className="flex items-center gap-2">
          <ShieldCheck size={14} className="text-mk-accent2" />
          <h3 className="text-sm font-semibold">Шифрование секретов устройств</h3>
        </div>
        <p className="text-xs text-mk-mute leading-relaxed">
          Пароли подключения к RouterOS-устройствам хранятся в БД зашифрованными
          <b> AES-256-GCM</b>. Ключ шифрования (DEK) защищён вашим мастер-паролем
          (PBKDF2-HMAC-SHA256, 200 000 итераций). Мастер-пароль в БД <b>не сохраняется</b> —
          его помнит только администратор. После рестарта контейнера vault блокируется
          автоматически, до повторного ввода пароля фоновый опрос устройств приостанавливается.
        </p>
        <div className="text-sm">
          <span className="text-mk-mute">Статус: </span>{renderStatus()}
        </div>
        {migration && (
          <div className="text-[11px] text-mk-mute">
            Миграция legacy-секретов: перешифровано <b>{migration.migrated}</b>,
            пропущено уже-v2 <b>{migration.skipped}</b>,
            не удалось <b>{migration.failed}</b>.
          </div>
        )}
      </div>

      {/* --- INIT (vault ещё не создан) --- */}
      {status && !status.initialized && (
        <form onSubmit={doInit} className="card space-y-3">
          <div className="flex items-center gap-2">
            <KeyRound size={14} className="text-mk-accent2" />
            <h3 className="text-sm font-semibold">Создать мастер-пароль</h3>
          </div>
          <p className="text-[11px] text-mk-warn flex items-start gap-1">
            <AlertTriangle size={12} className="mt-0.5 shrink-0" />
            <span>
              Запомните его надёжно. Если потеряете — пароли устройств в БД восстановить
              будет нельзя, придётся завести устройства заново.
            </span>
          </p>
          <div>
            <label className="text-xs text-mk-mute">Мастер-пароль (мин. 8 символов)</label>
            <input className="input" type="password" autoComplete="new-password" minLength={8}
              value={pwd} onChange={(e) => setPwd(e.target.value)} required />
          </div>
          <div>
            <label className="text-xs text-mk-mute">Повторите</label>
            <input className="input" type="password" autoComplete="new-password" minLength={8}
              value={pwd2} onChange={(e) => setPwd2(e.target.value)} required />
          </div>
          {msg && <div className={`text-sm ${msg.kind === 'ok' ? 'text-mk-ok' : 'text-mk-err'}`}>{msg.text}</div>}
          <button className="btn-primary !text-xs" disabled={busy}>
            {busy ? 'Создаём…' : 'Создать мастер-пароль'}
          </button>
        </form>
      )}

      {/* --- UNLOCK (создан, но заблокирован) --- */}
      {status && status.initialized && !status.unlocked && (
        <form onSubmit={doUnlock} className="card space-y-3">
          <div className="flex items-center gap-2">
            <Unlock size={14} className="text-mk-accent2" />
            <h3 className="text-sm font-semibold">Разблокировать vault</h3>
          </div>
          <p className="text-xs text-mk-mute">
            Введите мастер-пароль, чтобы возобновить опрос устройств и операции с их секретами.
          </p>
          <div>
            <label className="text-xs text-mk-mute">Мастер-пароль</label>
            <input className="input" type="password" autoComplete="current-password"
              value={pwd} onChange={(e) => setPwd(e.target.value)} required autoFocus />
          </div>
          {msg && <div className={`text-sm ${msg.kind === 'ok' ? 'text-mk-ok' : 'text-mk-err'}`}>{msg.text}</div>}
          <button className="btn-primary !text-xs" disabled={busy}>
            {busy ? 'Разблокируем…' : 'Разблокировать'}
          </button>
        </form>
      )}

      {/* --- LOCK + ROTATE (разблокирован) --- */}
      {status && status.initialized && status.unlocked && (
        <>
          <div className="card space-y-3">
            <div className="flex items-center gap-2">
              <Lock size={14} className="text-mk-accent2" />
              <h3 className="text-sm font-semibold">Заблокировать сейчас</h3>
            </div>
            <p className="text-xs text-mk-mute">
              После блокировки DEK будет очищен из памяти, и до следующей разблокировки
              автоопрос приостановится, а API устройств начнёт отвечать <b>423 Locked</b>.
            </p>
            <button type="button" className="btn-ghost !text-xs" disabled={busy} onClick={doLock}>
              <Lock size={13} /> Заблокировать
            </button>
            {msg && msg.kind === 'ok' && (
              <div className="text-sm text-mk-ok">{msg.text}</div>
            )}
          </div>

          <form onSubmit={doRotate} className="card space-y-3">
            <div className="flex items-center gap-2">
              <KeyRound size={14} className="text-mk-accent2" />
              <h3 className="text-sm font-semibold">Сменить мастер-пароль</h3>
            </div>
            <p className="text-xs text-mk-mute">
              Сами зашифрованные секреты при смене мастера не трогаются — перешифровывается
              только защитная обёртка DEK. Это безопасно и быстро.
            </p>
            <div>
              <label className="text-xs text-mk-mute">Текущий мастер-пароль</label>
              <input className="input" type="password" autoComplete="current-password"
                value={oldPwd} onChange={(e) => setOldPwd(e.target.value)} required />
            </div>
            <div>
              <label className="text-xs text-mk-mute">Новый мастер-пароль (мин. 8 символов)</label>
              <input className="input" type="password" autoComplete="new-password" minLength={8}
                value={newPwd} onChange={(e) => setNewPwd(e.target.value)} required />
            </div>
            <div>
              <label className="text-xs text-mk-mute">Повторите новый</label>
              <input className="input" type="password" autoComplete="new-password" minLength={8}
                value={newPwd2} onChange={(e) => setNewPwd2(e.target.value)} required />
            </div>
            {msg && msg.kind === 'err' && (
              <div className="text-sm text-mk-err">{msg.text}</div>
            )}
            <button className="btn-primary !text-xs" disabled={busy}>
              {busy ? 'Меняем…' : 'Сменить мастер-пароль'}
            </button>
          </form>
        </>
      )}
    </div>
  );
}
