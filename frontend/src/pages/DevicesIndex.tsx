import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Router as RouterIcon, Cpu, HardDrive } from 'lucide-react';
import Devices from './Devices';
import SwitchesPage from './Switches';

type TabKey = 'routers' | 'switches';

const TABS: { key: TabKey; label: string; icon: any }[] = [
  { key: 'routers',  label: 'Роутеры', icon: RouterIcon },
  { key: 'switches', label: 'Свичи',   icon: Cpu },
];

function parseHash(h: string): TabKey {
  const v = h.replace(/^#/, '');
  return v === 'switches' ? 'switches' : 'routers';
}

export default function DevicesIndex() {
  const location = useLocation();
  const navigate = useNavigate();
  const [tab, setTab] = useState<TabKey>(() => parseHash(location.hash));

  useEffect(() => { setTab(parseHash(location.hash)); }, [location.hash]);

  const switchTab = (k: TabKey) => {
    setTab(k);
    navigate({ pathname: location.pathname, hash: `#${k}` }, { replace: true });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <HardDrive size={16} className="text-mk-accent2" />
        <h2 className="text-base font-semibold">Устройства</h2>
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
        {tab === 'routers' && <Devices />}
        {tab === 'switches' && <SwitchesPage />}
      </div>
    </div>
  );
}
