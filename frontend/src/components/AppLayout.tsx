import { useEffect, useMemo, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Router, LogOut, Info,
  CheckCircle2, AlertTriangle, Bell, Terminal,
  Menu, X, Settings as SettingsIcon,
  ChevronDown, ChevronUp,
  Lock, Unlock, ShieldAlert,
} from 'lucide-react';
import { useAuth } from '@/store/auth';
import { api, Device, vaultApi, VaultStatus } from '@/api/client';
import AboutModal from './AboutModal';
import { useSettings } from '@/store/settings';
import { pickOkMessage } from '@/utils/okMessages';
import { useT } from '@/i18n';

type MenuKey =
  | 'dashboard' | 'devices' | 'switches' | 'firmware' | 'alerts'
  | 'notif_center' | 'cli' | 'settings';

type NavChild = {
  tKey: string;
  to: string;
  /** Ключ из settings.menu для гранулярной видимости (если задан). */
  menuKey?: MenuKey;
};

type NavItem = {
  /** Ключ родителя для settings.menu (видимость самой группы). */
  key: MenuKey;
  /** Куда переходить при клике по самому пункту (или endpoint первого подпункта). */
  to: string;
  tKey: string;
  icon: any;
  children?: NavChild[];
};

const NAV_TOP: NavItem[] = [
  { key: 'dashboard',    to: '/dashboard',     tKey: 'nav.dashboard',   icon: LayoutDashboard },
  {
    key: 'devices', to: '/devices', tKey: 'nav.devices', icon: Router,
    children: [
      { menuKey: 'devices',  tKey: 'nav.devicesRouters', to: '/devices' },
      { menuKey: 'switches', tKey: 'nav.switches',       to: '/devices#switches' },
    ],
  },
  {
    key: 'notif_center', to: '/notifications', tKey: 'nav.notifCenter', icon: Bell,
    children: [
      { menuKey: 'alerts', tKey: 'nav.alerts',   to: '/notifications#alerts' },
      {                    tKey: 'nav.telegram', to: '/notifications#telegram' },
    ],
  },
  {
    key: 'cli', to: '/cli', tKey: 'nav.automation', icon: Terminal,
    children: [
      {                     tKey: 'nav.cli',      to: '/cli' },
      { menuKey: 'firmware', tKey: 'nav.firmware', to: '/cli#firmware' },
    ],
  },
];

const NAV_BOTTOM: NavItem[] = [
  {
    key: 'settings', to: '/settings', tKey: 'nav.settings', icon: SettingsIcon,
    children: [
      { tKey: 'nav.settingsUsers',    to: '/settings#users' },
      { tKey: 'nav.settingsPassword', to: '/settings#password' },
      { tKey: 'nav.settingsConfig',   to: '/settings#config' },
    ],
  },
];

// ------------------------------------------------------------------
// Header-виджеты (без изменений по сравнению с предыдущей версией)
// ------------------------------------------------------------------

function GlobalHealth() {
  const [devices, setDevices] = useState<Device[] | null>(null);
  const settings = useSettings((s) => s.settings);
  const style = settings?.notify?.style ?? 'jokes';
  const [okMsg] = useState(() => pickOkMessage());
  const t = useT();

  useEffect(() => {
    const load = () =>
      api.get<Device[]>('/devices').then((r) => setDevices(r.data)).catch(() => {});
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, []);

  if (!devices) return <span className="text-xs text-mk-mute">…</span>;
  const n = settings?.notify;
  const problems = devices.filter((d) => {
    if (n?.device_status !== false && d.status === 'down') return true;
    if (n?.abnormal_reboot !== false && d.abnormal_reboot) return true;
    if (n?.internet !== false && d.internet_ok === false) return true;
    if (d.last_error) return true;
    return false;
  }).length;
  const total = devices.length;
  if (total === 0) return <span className="text-xs text-mk-mute">{t('health.empty')}</span>;
  if (problems === 0) {
    return (
      <span
        className="inline-flex items-center gap-2 px-3 py-1.5 bg-mk-ok/15 text-mk-ok text-sm font-medium"
        title="Global system status"
      >
        <CheckCircle2 size={15} /> {t('health.ok')} · {total}
        {style === 'jokes' && <span className="text-xs opacity-80">· {okMsg}</span>}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-mk-err/15 text-mk-err text-sm font-medium">
      <AlertTriangle size={15} /> {t('health.issues')}: {problems} / {total}
    </span>
  );
}

function VaultBadge() {
  const navigate = useNavigate();
  const [s, setS] = useState<VaultStatus | null>(null);
  useEffect(() => {
    const load = () => vaultApi.status().then(setS).catch(() => {});
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, []);
  if (!s) return null;
  const goto = () => navigate('/settings#security');
  // Три состояния: ok (зелёный замок открыт), locked (жёлтый замок закрыт), uninit (красный щит)
  if (!s.initialized) {
    return (
      <button
        onClick={goto}
        className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-mk-err hover:bg-white/[0.04]"
        title="Vault не инициализирован — задайте мастер-пароль"
      >
        <ShieldAlert size={14} /> <span className="hidden md:inline">vault</span>
      </button>
    );
  }
  if (!s.unlocked) {
    return (
      <button
        onClick={goto}
        className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-mk-warn hover:bg-white/[0.04]"
        title="Vault заблокирован — введите мастер-пароль, опрос устройств приостановлен"
      >
        <Lock size={14} /> <span className="hidden md:inline">locked</span>
      </button>
    );
  }
  return (
    <button
      onClick={goto}
      className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-mk-ok hover:bg-white/[0.04]"
      title="Vault разблокирован — секреты устройств доступны"
    >
      <Unlock size={14} />
    </button>
  );
}

function AlertsBell() {
  const navigate = useNavigate();
  const [count, setCount] = useState(0);
  useEffect(() => {
    const load = () =>
      api.get<{ count: number }>('/alerts/unread-count')
        .then((r) => setCount(r.data.count)).catch(() => {});
    load();
    const t = setInterval(load, 20000);
    return () => clearInterval(t);
  }, []);
  return (
    <button
      onClick={() => navigate('/notifications#alerts')}
      className="relative p-2 hover:bg-white/[0.04] text-mk-text"
      title="Центр уведомлений"
    >
      <Bell size={18} />
      {count > 0 && (
        <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-[16px] px-1 bg-mk-err text-white text-[10px] font-bold flex items-center justify-center">
          {count > 99 ? '99+' : count}
        </span>
      )}
    </button>
  );
}

function HeaderClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  const time = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const date = now.toLocaleDateString([], { day: '2-digit', month: '2-digit' });
  return (
    <span
      className="hidden sm:inline-flex items-center gap-2 text-[11px] font-mono text-mk-mute px-2 py-0.5 border border-mk-border"
      title={now.toLocaleString()}
    >
      <span className="text-mk-mute/70">{date}</span>
      <span className="text-mk-text">{time}</span>
    </span>
  );
}

function UserMenu({ email }: {
  email: string | null;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const initials = (email || '?').slice(0, 1).toUpperCase();

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 p-1 pl-1 pr-2 hover:bg-white/[0.04] text-mk-text"
        title={email ?? ''}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-mk-accent/20 text-mk-accent2 text-xs font-semibold">
          {initials}
        </span>
        <span className="hidden md:inline text-xs text-mk-mute max-w-[140px] truncate">{email ?? '—'}</span>
      </button>
      {open && (
        <div
          className="absolute right-0 mt-1.5 w-64 border border-mk-border bg-mk-panel shadow-xl z-30"
          role="menu"
        >
          <div className="px-3 py-2 border-b border-mk-border">
            <div className="text-xs text-mk-mute">Вы вошли как</div>
            <div className="text-sm font-medium truncate" title={email ?? ''}>{email ?? '—'}</div>
          </div>
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------
// Sidebar — стили строк по образцу (Zabbix-like): без скруглений,
// активный пункт — тёмная плашка во всю ширину с акцентной полосой
// слева; подменю — отдельный блок темнее, чем сама панель.
// ------------------------------------------------------------------

const ROW_BASE =
  'group flex items-center gap-3 w-full px-4 py-2.5 text-[13.5px] transition-colors select-none ' +
  'border-l-2 border-transparent';
const ROW_IDLE = 'text-mk-mute hover:bg-white/[0.04] hover:text-mk-text';
const ROW_ACTIVE = 'bg-black/30 text-mk-text border-l-mk-accent';

const SUBMENU_WRAP = 'bg-black/20 border-y border-black/40';
const CHILD_BASE =
  'flex items-center w-full pl-12 pr-4 py-2 text-[13px] transition-colors ' +
  'border-l-2 border-transparent';
const CHILD_IDLE = 'text-mk-mute hover:bg-white/[0.04] hover:text-mk-text';
const CHILD_ACTIVE = 'bg-black/30 text-mk-text border-l-mk-accent';

function isChildActive(c: NavChild, location: { pathname: string; hash: string }): boolean {
  const [path, hash] = c.to.split('#');
  if (location.pathname !== path) return false;
  const wantHash = hash ? '#' + hash : '';
  return location.hash === wantHash;
}

function NavGroup({
  item, t, isVisibleChild,
}: {
  item: NavItem;
  t: (k: string) => string;
  isVisibleChild: (c: NavChild) => boolean;
}) {
  const location = useLocation();
  const isOnParent =
    location.pathname === item.to || location.pathname.startsWith(item.to + '/');
  const [open, setOpen] = useState<boolean>(isOnParent);

  useEffect(() => { if (isOnParent) setOpen(true); }, [isOnParent]);

  const visibleChildren = (item.children ?? []).filter(isVisibleChild);
  if (visibleChildren.length === 0) return null;

  const Caret = open ? ChevronUp : ChevronDown;
  const parentActive = isOnParent;

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`${ROW_BASE} ${parentActive ? ROW_ACTIVE : ROW_IDLE}`}
        aria-expanded={open}
      >
        <item.icon size={18} className="shrink-0 opacity-90" />
        <span className="flex-1 text-left truncate">{t(item.tKey)}</span>
        <Caret size={15} className="opacity-60" />
      </button>
      {open && (
        <div className={SUBMENU_WRAP}>
          {visibleChildren.map((c) => (
            <NavLink
              key={c.to}
              to={c.to}
              className={() =>
                `${CHILD_BASE} ${isChildActive(c, location) ? CHILD_ACTIVE : CHILD_IDLE}`
              }
            >
              <span className="truncate">{t(c.tKey)}</span>
            </NavLink>
          ))}
        </div>
      )}
    </div>
  );
}

function NavRow({ item, t }: { item: NavItem; t: (k: string) => string }) {
  return (
    <NavLink
      to={item.to}
      className={({ isActive }) =>
        `${ROW_BASE} ${isActive ? ROW_ACTIVE : ROW_IDLE}`
      }
    >
      <item.icon size={18} className="shrink-0 opacity-90" />
      <span className="truncate">{t(item.tKey)}</span>
    </NavLink>
  );
}

export default function AppLayout() {
  const { email, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [aboutOpen, setAboutOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [version, setVersion] = useState<string | null>(null);
  const settings = useSettings((s) => s.settings);
  const loadSettings = useSettings((s) => s.load);
  const t = useT();

  useEffect(() => { setSidebarOpen(false); }, [location.pathname]);

  useEffect(() => {
    api.get<{ version: string }>('/version').then((r) => setVersion(r.data.version)).catch(() => {});
    loadSettings();
  }, []);

  // Видимость родителя — из settings.menu по `key`.
  const isVisibleGroup = (n: NavItem): boolean =>
    !settings?.menu || settings.menu[n.key] !== false;
  // Видимость подпункта — по child.menuKey (если задан). Без menuKey — всегда виден.
  const isVisibleChild = (c: NavChild): boolean =>
    !c.menuKey || !settings?.menu || settings.menu[c.menuKey] !== false;

  const topNav = useMemo(() => NAV_TOP.filter(isVisibleGroup), [settings]);
  const bottomNav = useMemo(() => NAV_BOTTOM.filter(isVisibleGroup), [settings]);

  const onLogout = () => {
    if (!window.confirm(t('logout.confirm'))) return;
    logout();
    navigate('/login', { replace: true });
  };

  const renderItem = (n: NavItem) =>
    n.children
      ? <NavGroup key={n.to} item={n} t={t} isVisibleChild={isVisibleChild} />
      : <NavRow key={n.to} item={n} t={t} />;

  return (
    <div className="flex h-full relative">
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-30 md:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-hidden
        />
      )}
      <aside
        className={`w-60 shrink-0 bg-mk-panel border-r border-mk-border flex flex-col
          fixed md:static inset-y-0 left-0 z-40 transition-transform duration-200
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}
      >
        <div className="h-14 flex items-center gap-2 px-4 border-b border-mk-border">
          <img src="/mikrotik-logo.svg" alt="MikroTik" className="w-6 h-6 shrink-0" />
          <div className="flex flex-col min-w-0 flex-1 leading-tight">
            <span className="font-semibold tracking-wide text-sm text-mk-text">ROSzetta</span>
            {settings?.ui?.instance_name && (
              <span
                className="text-[11px] text-mk-mute truncate"
                title={settings.ui.instance_name}
              >
                {settings.ui.instance_name}
              </span>
            )}
          </div>
          <button
            onClick={() => setSidebarOpen(false)}
            className="md:hidden p-1 text-mk-mute hover:text-mk-text"
            aria-label="Закрыть меню"
          >
            <X size={16} />
          </button>
        </div>

        {/* Верхняя часть — основное меню. Прижато к верху, скроллится. */}
        <nav className="flex-1 overflow-y-auto py-1">
          {topNav.map(renderItem)}
        </nav>

        {/* Нижняя часть — Настройки и Выход. Прижата к низу. */}
        <div className="border-t border-mk-border/70">
          {bottomNav.map(renderItem)}
          <button
            type="button"
            onClick={onLogout}
            className={`${ROW_BASE} ${ROW_IDLE}`}
            title={email ?? ''}
          >
            <LogOut size={18} className="shrink-0 opacity-90" />
            <span className="truncate">{t('nav.logout')}</span>
          </button>
        </div>
      </aside>

      <main className="flex-1 min-w-0 overflow-auto">
        <header className="h-12 border-b border-mk-border flex md:grid md:grid-cols-3 items-center gap-2 md:gap-3 px-3 md:px-5 sticky top-0 bg-mk-bg/85 backdrop-blur z-10">
          <button
            onClick={() => setSidebarOpen(true)}
            className="md:hidden p-1.5 -ml-1 text-mk-text hover:bg-white/[0.04]"
            aria-label="Открыть меню"
          >
            <Menu size={20} />
          </button>
          <div className="flex items-center min-w-0 flex-1 md:flex-none">
            {settings?.ui?.instance_name && (
              <span
                className="inline-flex items-center text-sm font-medium text-mk-text truncate"
                title={settings.ui.instance_name}
              >
                {settings.ui.instance_name}
              </span>
            )}
          </div>
          <div className="hidden md:flex items-center justify-center gap-2">
            <span className="text-sm text-mk-mute whitespace-nowrap">Состояние системы:</span>
            <GlobalHealth />
          </div>
          <div className="flex items-center justify-end gap-1 md:gap-2">
            <span className="hidden lg:inline-flex"><HeaderClock /></span>
            {version && (
              <span className="hidden sm:inline-flex text-[11px] text-mk-mute font-mono px-2 py-0.5 border border-mk-border">
                v{version}
              </span>
            )}
            <VaultBadge />
            <AlertsBell />
            <button
              onClick={() => setAboutOpen(true)}
              className="hidden sm:inline-flex p-2 hover:bg-white/[0.04] text-mk-mute hover:text-mk-text"
              title="О программе"
            >
              <Info size={18} />
            </button>
            <UserMenu email={email} />
          </div>
        </header>
        <div className="md:hidden px-3 pt-3 flex items-center gap-2 flex-wrap">
          <span className="text-sm text-mk-mute">Состояние системы:</span>
          <GlobalHealth />
        </div>
        <div className="p-3 md:p-5">
          <Outlet />
        </div>
      </main>

      {aboutOpen && <AboutModal onClose={() => setAboutOpen(false)} />}
    </div>
  );
}
