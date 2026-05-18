import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { api } from '@/api/client';

export default function AboutModal({ onClose }: { onClose: () => void }) {
  const [info, setInfo] = useState<{ name: string; version: string } | null>(null);

  useEffect(() => {
    api.get<{ name: string; version: string }>('/version')
      .then((r) => setInfo(r.data))
      .catch(() => {});
  }, []);

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="card w-full max-w-md relative" onClick={(e) => e.stopPropagation()}>
        <button
          className="absolute top-3 right-3 text-mk-mute hover:text-mk-text"
          onClick={onClose}
          aria-label="Закрыть"
        >
          <X size={18} />
        </button>
        <div className="flex items-center gap-3 mb-4">
          <img src="/mikrotik-logo.svg" alt="logo" className="w-12 h-12" />
          <div>
            <div className="text-lg font-semibold">{info?.name ?? 'ROSzetta'}</div>
            <div className="text-xs text-mk-mute font-mono">v{info?.version ?? '—'}</div>
          </div>
        </div>
        <div className="text-sm text-mk-text space-y-2">
          <div>Контроллер для управления MikroTik / RouterOS устройствами.</div>
          <div className="pt-3 border-t border-mk-border">
            <div className="text-xs text-mk-mute uppercase tracking-wider mb-1">Разработчик</div>
            <div className="font-medium">CoRE group</div>
            <a
              href="http://core.uz"
              target="_blank"
              rel="noreferrer"
              className="text-mk-accent2 hover:underline text-sm"
            >
              http://core.uz
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
