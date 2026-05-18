import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Bell, Inbox, Send, Sliders } from 'lucide-react';
import AlertsPage from './Alerts';
import TelegramBotPage from './TelegramBot';
import NotifySettingsPage from './NotifySettings';

type TabKey = 'alerts' | 'telegram' | 'settings';

const TABS: { key: TabKey; label: string; icon: any }[] = [
  { key: 'alerts',   label: 'Алерты',   icon: Bell },
  { key: 'telegram', label: 'Telegram-бот', icon: Send },
  { key: 'settings', label: 'Настройки', icon: Sliders },
];

function parseHash(h: string): TabKey {
  const v = h.replace(/^#/, '');
  return (v === 'alerts' || v === 'telegram' || v === 'settings') ? v : 'alerts';
}

export default function NotificationCenter() {
  const location = useLocation();
  const navigate = useNavigate();
  const [tab, setTab] = useState<TabKey>(() => parseHash(location.hash));

  useEffect(() => {
    setTab(parseHash(location.hash));
  }, [location.hash]);

  const switchTab = (k: TabKey) => {
    setTab(k);
    navigate({ pathname: location.pathname, hash: `#${k}` }, { replace: true });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Inbox size={16} className="text-mk-accent2" />
        <h2 className="text-base font-semibold">Центр уведомлений</h2>
      </div>

      <div className="flex items-center gap-1 border-b border-mk-border">
        {TABS.map((tb) => {
          const Icon = tb.icon;
          const active = tb.key === tab;
          return (
            <button
              key={tb.key}
              onClick={() => switchTab(tb.key)}
              className={`inline-flex items-center gap-1.5 px-3 py-2 text-sm border-b-2 -mb-px transition-colors ${
                active
                  ? 'border-mk-accent text-mk-text'
                  : 'border-transparent text-mk-mute hover:text-mk-text'
              }`}
            >
              <Icon size={14} />
              {tb.label}
            </button>
          );
        })}
      </div>

      <div>
        {tab === 'alerts' && <AlertsPage />}
        {tab === 'telegram' && <TelegramBotPage />}
        {tab === 'settings' && <NotifySettingsPage />}
      </div>
    </div>
  );
}
