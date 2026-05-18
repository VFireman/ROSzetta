import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  ArrowLeft, RefreshCw, Power, ShieldAlert, Save, Download, Trash2, ArrowUpCircle,
  Wifi, WifiOff, AlertTriangle, Activity as ActivityIcon, Network,
  Globe, HardDrive, Pencil, Cloud, Package, Info,
} from 'lucide-react';
import {
  AreaChart, Area, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
} from 'recharts';
import {
  api, Device, DeviceBackup, DeviceResource, Firmware, MetricPoint,
  InterfaceInfo, InterfaceTrafficOut, UplinkStatus, DhcpLease,
} from '@/api/client';
import { useAuth } from '@/store/auth';
import { latestStableVersion, isOutdated } from '@/utils/version';
import { EditDeviceModal } from './Devices';
import DeviceMockup from '@/components/DeviceMockup';

type Tab = 'overview' | 'about' | 'interfaces' | 'firmware' | 'backups' | 'ipmgmt';

function StatusDot({ status }: { status: string }) {
  const cls =
    status === 'up' ? 'bg-mk-ok' :
    status === 'down' ? 'bg-mk-err' :
    'bg-mk-mute';
  return <span className={`inline-block w-4 h-4 rounded-full ${cls}`} />;
}

function fmtSize(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KiB`;
  return `${(b / 1024 / 1024).toFixed(2)} MiB`;
}

function fmtBps(b: number): string {
  if (b < 1000) return `${b.toFixed(0)} bps`;
  if (b < 1_000_000) return `${(b / 1000).toFixed(1)} Kbps`;
  if (b < 1_000_000_000) return `${(b / 1_000_000).toFixed(2)} Mbps`;
  return `${(b / 1_000_000_000).toFixed(2)} Gbps`;
}

function parseList(s: string | null | undefined): string[] {
  if (!s) return [];
  return s.split(',').map((x) => x.trim()).filter(Boolean);
}

const COLORS = ['#22c55e', '#3b82f6', '#f59e0b', '#a855f7', '#ec4899', '#14b8a6', '#ef4444', '#eab308'];

export default function DeviceDetail() {
  const { id } = useParams();
  const [d, setD] = useState<Device | null>(null);
  const [tab, setTab] = useState<Tab>('about');
  const [res, setRes] = useState<DeviceResource | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [backups, setBackups] = useState<DeviceBackup[]>([]);
  const [firmwares, setFirmwares] = useState<Firmware[]>([]);
  const [latestVer, setLatestVer] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<MetricPoint[]>([]);
  const [editing, setEditing] = useState(false);
  const [selectedFw, setSelectedFw] = useState<number | ''>('');
  const [showAllFw, setShowAllFw] = useState(false);
  const [upgradeChannel, setUpgradeChannel] = useState<'stable' | 'long-term' | 'testing' | 'development'>('stable');
  const token = useAuth((s) => s.accessToken);

  const load = () => api.get<Device>(`/devices/${id}`).then((r) => setD(r.data));
  const loadBackups = () => api.get<DeviceBackup[]>(`/devices/${id}/backups`).then((r) => setBackups(r.data));
  const loadMetrics = () => api.get<MetricPoint[]>(`/devices/${id}/metrics`, { params: { hours: 24 } }).then((r) => setMetrics(r.data));

  useEffect(() => {
    load();
    loadBackups();
    loadMetrics();
    api.get<Firmware[]>('/firmware').then((r) => {
      setFirmwares(r.data);
      setLatestVer(latestStableVersion(r.data));
    }).catch(() => {});
  }, [id]);

  const probe = async () => {
    setBusy(true); setErr(null);
    try {
      const { data } = await api.post<DeviceResource>(`/devices/${id}/probe`);
      setRes(data);
      await load();
      await loadMetrics();
    } catch (ex: any) {
      setErr(ex?.response?.data?.detail ?? 'Ошибка опроса');
    } finally { setBusy(false); }
  };

  const reboot = async () => {
    if (!confirm('Перезагрузить устройство?')) return;
    setActionBusy('reboot'); setActionMsg(null);
    try { await api.post(`/devices/${id}/reboot`); setActionMsg('Команда reboot отправлена'); }
    catch (ex: any) { setActionMsg(ex?.response?.data?.detail ?? 'Ошибка reboot'); }
    finally { setActionBusy(null); }
  };

  const safeMode = async () => {
    setActionBusy('safemode'); setActionMsg(null);
    try { await api.post(`/devices/${id}/safe-mode`); setActionMsg('Safe mode переключён'); }
    catch (ex: any) { setActionMsg(ex?.response?.data?.detail ?? 'Ошибка safe mode'); }
    finally { setActionBusy(null); }
  };

  const makeBackup = async () => {
    setActionBusy('backup'); setActionMsg(null);
    try { await api.post(`/devices/${id}/backups`); await loadBackups(); setActionMsg('Бэкап создан'); }
    catch (ex: any) { setActionMsg(ex?.response?.data?.detail ?? 'Ошибка бэкапа'); }
    finally { setActionBusy(null); }
  };

  const upgradeFromInternet = async () => {
    if (!confirm(`Обновить RouterOS из интернета (канал ${upgradeChannel})?\nУстройство будет перезагружено.`)) return;
    setActionBusy('upgrade-net'); setActionMsg(null);
    try {
      const { data } = await api.post(`/devices/${id}/upgrade/internet`, null, {
        params: { channel: upgradeChannel, install: true },
      });
      setActionMsg(`Обновление запущено: ${JSON.stringify(data)}`);
    } catch (ex: any) {
      setActionMsg(ex?.response?.data?.detail ?? 'Ошибка обновления');
    } finally { setActionBusy(null); }
  };

  const upgradeFromLocal = async () => {
    if (!selectedFw) { setActionMsg('Сначала выберите прошивку из репозитория'); return; }
    if (!confirm('Загрузить прошивку с контроллера и перезагрузить устройство для установки?')) return;
    setActionBusy('upgrade-local'); setActionMsg(null);
    try {
      const { data } = await api.post(`/devices/${id}/upgrade/local`, null, {
        params: { firmware_id: selectedFw, reboot: true },
      });
      setActionMsg(`Прошивка загружена и перезагрузка отправлена: ${JSON.stringify(data)}`);
    } catch (ex: any) {
      setActionMsg(ex?.response?.data?.detail ?? 'Ошибка локального обновления');
    } finally { setActionBusy(null); }
  };

  const downloadBackup = (b: DeviceBackup) => {
    fetch(`/api/v1/backups/${b.id}/download`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.blob())
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = b.filename; a.click();
        URL.revokeObjectURL(url);
      });
  };

  const deleteBackup = async (b: DeviceBackup) => {
    if (!confirm(`Удалить ${b.filename}?`)) return;
    await api.delete(`/backups/${b.id}`);
    await loadBackups();
  };

  // Нормализация имени архитектуры (например, "x86-64" и "x86_64" — одно и то же)
  const normArch = (s: string | null | undefined) =>
    (s || '').toLowerCase().replace(/[-_]/g, '');
  const deviceArch = normArch(d?.architecture);
  const filteredFirmwares = useMemo(() => {
    if (showAllFw || !deviceArch) return firmwares;
    return firmwares.filter((f) => normArch(f.architecture) === deviceArch);
  }, [firmwares, deviceArch, showAllFw]);
  // Сбросить выбор, если текущая прошивка отфильтрована
  useEffect(() => {
    if (selectedFw && !filteredFirmwares.some((f) => f.id === selectedFw)) {
      setSelectedFw('');
    }
  }, [filteredFirmwares, selectedFw]);

  if (!d) return <div className="text-mk-mute">Загрузка…</div>;

  const memUsedPct = res?.total_memory && res?.free_memory
    ? Math.round(100 - (res.free_memory / res.total_memory) * 100) : null;
  const chartData = metrics.map((m) => ({
    ...m,
    t: new Date(m.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
  }));

  return (
    <div className="space-y-3">
      <Link to="/devices" className="inline-flex items-center gap-2 text-sm text-mk-mute hover:text-mk-text">
        <ArrowLeft size={14} /> Назад
      </Link>

      <div className="card !py-2 !px-3">
        <div className="flex items-center gap-3 flex-wrap">
          <StatusDot status={d.status} />
          <h2 className="text-lg font-semibold leading-none">{d.identity || d.name}</h2>
          <span className={`text-xs px-2 py-0.5 ${
            d.status === 'up' ? 'badge-up' : d.status === 'down' ? 'badge-down' : 'badge-unk'
          }`}>{d.status.toUpperCase()}</span>

          {/* Мета-блок: host, internet, модель, RouterOS, arch — одной строкой */}
          <div className="text-xs text-mk-mute flex items-center gap-2 flex-wrap">
            <span>{d.host}:{d.port}{d.use_tls ? ' (TLS)' : ''}</span>
            {d.internet_ok === true && (
              <span className="inline-flex items-center gap-1 text-mk-ok"><Wifi size={11} /> ok</span>
            )}
            {d.internet_ok === false && (
              <span className="inline-flex items-center gap-1 text-mk-err"><WifiOff size={11} /> no internet</span>
            )}
            {d.abnormal_reboot && (
              <span className="inline-flex items-center gap-1 text-mk-warn"><AlertTriangle size={11} /> abnormal reboot</span>
            )}
            <span className="text-mk-mute/70">·</span>
            <span>{d.model || '—'} · {d.ros_version || '—'}</span>
            {d.architecture && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0 rounded bg-mk-panel2 text-mk-text font-mono">
                <HardDrive size={10} /> {d.architecture}
              </span>
            )}
            {isOutdated(d.ros_version, latestVer) && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0 rounded bg-mk-warn/15 text-mk-warn font-medium">
                <ArrowUpCircle size={11} /> {latestVer}
              </span>
            )}
          </div>

          {/* Кнопки прижаты к правому краю */}
          <div className="flex gap-1.5 flex-wrap justify-end ml-auto">
            <button className="btn-ghost !py-1 !px-2 !text-xs" onClick={() => setEditing(true)}>
              <Pencil size={12} /> Изменить
            </button>
            <button className="btn-ghost !py-1 !px-2 !text-xs" onClick={safeMode} disabled={actionBusy !== null}>
              <ShieldAlert size={12} className={actionBusy === 'safemode' ? 'animate-pulse' : ''} /> Safe Mode
            </button>
            <button className="btn-ghost !py-1 !px-2 !text-xs" onClick={reboot} disabled={actionBusy !== null}>
              <Power size={12} className={actionBusy === 'reboot' ? 'animate-pulse' : ''} /> Reboot
            </button>
            <button className="btn-primary !py-1 !px-2 !text-xs" onClick={probe} disabled={busy}>
              <RefreshCw size={12} className={busy ? 'animate-spin' : ''} /> {busy ? 'Опрос…' : 'Опросить'}
            </button>
          </div>
        </div>
        {d.last_error && (
          <div className="text-xs text-mk-err mt-1.5" title={d.last_error}>
            Последняя ошибка: {d.last_error}
          </div>
        )}
      </div>

      {err && <div className="card text-mk-err text-sm">{err}</div>}
      {actionMsg && <div className="card text-mk-ok text-sm whitespace-pre-wrap">{actionMsg}</div>}

      <div className="flex border-b border-mk-border gap-1">
        <TabBtn active={tab === 'about'} onClick={() => setTab('about')} icon={Info} label="Об устройстве" />
        <TabBtn active={tab === 'overview'} onClick={() => setTab('overview')} icon={ActivityIcon} label="Обзор" />
        <TabBtn active={tab === 'interfaces'} onClick={() => setTab('interfaces')} icon={Network} label="Интерфейсы" />
        <TabBtn active={tab === 'ipmgmt'} onClick={() => setTab('ipmgmt')} icon={Globe} label="IP Management | DHCP" />
        <TabBtn active={tab === 'backups'} onClick={() => setTab('backups')} icon={Save} label="Бэкапы" />
        <TabBtn active={tab === 'firmware'} onClick={() => setTab('firmware')} icon={HardDrive} label="Прошивка" />
      </div>

      {tab === 'overview' && (
        <div className="space-y-3">
          {res && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="card">
                <div className="text-xs text-mk-mute uppercase">CPU load</div>
                <div className="text-3xl font-semibold">{res.cpu_load ?? '—'}%</div>
              </div>
              <div className="card">
                <div className="text-xs text-mk-mute uppercase">Memory</div>
                <div className="text-3xl font-semibold">{memUsedPct ?? '—'}%</div>
                <div className="text-xs text-mk-mute mt-1">
                  {res.free_memory != null && res.total_memory != null
                    ? `${(res.free_memory / 1024 / 1024).toFixed(1)} / ${(res.total_memory / 1024 / 1024).toFixed(1)} MiB free`
                    : '—'}
                </div>
              </div>
              <div className="card">
                <div className="text-xs text-mk-mute uppercase">Uptime</div>
                <div className="text-3xl font-semibold">{res.uptime ?? '—'}</div>
                <div className="text-xs text-mk-mute mt-1">{res.architecture_name ?? ''}</div>
              </div>
            </div>
          )}

          {metrics.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="card">
                <div className="text-xs uppercase text-mk-mute mb-2">CPU за 24ч</div>
                <ResponsiveContainer width="100%" height={160}>
                  <AreaChart data={chartData}>
                    <defs>
                      <linearGradient id="gC" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#22c55e" stopOpacity={0.5} />
                        <stop offset="100%" stopColor="#22c55e" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="2 2" stroke="#2a2f36" />
                    <XAxis dataKey="t" stroke="#8b95a5" fontSize={10} minTickGap={30} />
                    <YAxis stroke="#8b95a5" fontSize={10} domain={[0, 100]} unit="%" />
                    <Tooltip contentStyle={{ background: '#1e242b', border: '1px solid #2a2f36', fontSize: 12 }} />
                    <Area type="monotone" dataKey="cpu_load" stroke="#22c55e" fill="url(#gC)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
              <div className="card">
                <div className="text-xs uppercase text-mk-mute mb-2">Memory за 24ч</div>
                <ResponsiveContainer width="100%" height={160}>
                  <AreaChart data={chartData}>
                    <defs>
                      <linearGradient id="gM" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.5} />
                        <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="2 2" stroke="#2a2f36" />
                    <XAxis dataKey="t" stroke="#8b95a5" fontSize={10} minTickGap={30} />
                    <YAxis stroke="#8b95a5" fontSize={10} domain={[0, 100]} unit="%" />
                    <Tooltip contentStyle={{ background: '#1e242b', border: '1px solid #2a2f36', fontSize: 12 }} />
                    <Area type="monotone" dataKey="mem_used_pct" stroke="#3b82f6" fill="url(#gM)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

        </div>
      )}

      {tab === 'backups' && (
        <div className="space-y-3">
          <div className="card flex items-center gap-3 flex-wrap">
            <Save size={16} className="text-mk-accent2" />
            <div className="text-sm">
              Хранится максимум <b>10 пар</b> (binary <code>.backup</code> + text <code>.rsc</code>) с ротацией.
              Доставка — через встроенный FTP контроллера (push с устройства).
            </div>
            <button
              className="btn-primary !text-xs ml-auto"
              onClick={makeBackup}
              disabled={actionBusy !== null}
            >
              <Save size={14} /> {actionBusy === 'backup' ? 'Снимаем…' : 'Снять бэкап сейчас'}
            </button>
          </div>

          <div className="card p-0 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2 border-b border-mk-border">
              <h3 className="text-sm font-semibold">Бэкапы конфигурации</h3>
              <span className="text-[11px] text-mk-mute">{backups.length} файлов</span>
            </div>
            <table className="w-full text-[13px]">
              <thead className="bg-mk-panel2 text-mk-mute text-[10px] uppercase tracking-wider">
                <tr>
                  <th className="text-left px-3 py-1">Файл</th>
                  <th className="text-left px-3 py-1">Формат</th>
                  <th className="text-left px-3 py-1">Размер</th>
                  <th className="text-left px-3 py-1">Создан</th>
                  <th className="text-right px-3 py-1">Действия</th>
                </tr>
              </thead>
              <tbody>
                {backups.length === 0 && (
                  <tr><td colSpan={5} className="px-3 py-3 text-center text-mk-mute">Нет бэкапов</td></tr>
                )}
                {backups.map((b) => (
                  <tr key={b.id} className="border-t border-mk-border hover:bg-mk-panel2/40">
                    <td className="px-3 py-1 font-mono text-xs">{b.filename}</td>
                    <td className="px-3 py-1">
                      <span className={b.fmt === 'binary' ? 'badge-up' : 'badge-unk'}>{b.fmt}</span>
                    </td>
                    <td className="px-3 py-1">{fmtSize(b.size)}</td>
                    <td className="px-3 py-1 text-mk-mute text-xs">{new Date(b.created_at).toLocaleString()}</td>
                    <td className="px-3 py-1 text-right whitespace-nowrap">
                      <button className="btn-ghost !py-0.5 !px-1.5" onClick={() => downloadBackup(b)} title="Скачать">
                        <Download size={12} />
                      </button>
                      <button className="btn-ghost !py-0.5 !px-1.5 ml-1" onClick={() => deleteBackup(b)} title="Удалить">
                        <Trash2 size={12} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'about' && <AboutTab device={d} resource={res} />}

      {tab === 'interfaces' && <InterfacesTab device={d} onSaved={load} />}

      {tab === 'firmware' && (
        <div className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="card">
              <div className="text-xs text-mk-mute uppercase">Текущая версия</div>
              <div className="text-2xl font-semibold mt-0.5">{d.ros_version ?? '—'}</div>
              {latestVer && d.ros_version && isOutdated(d.ros_version, latestVer) && (
                <div className="text-[11px] text-mk-warn mt-1">
                  доступна {latestVer} (stable)
                </div>
              )}
            </div>
            <div className="card">
              <div className="text-xs text-mk-mute uppercase">Архитектура</div>
              <div className="text-2xl font-semibold mt-0.5 font-mono">
                {d.architecture ?? <span className="text-mk-warn">неизвестна</span>}
              </div>
              {!d.architecture && (
                <div className="text-[11px] text-mk-mute mt-1">
                  Нажмите «Опросить» в шапке карточки, чтобы определить.
                </div>
              )}
            </div>
            <div className="card">
              <div className="text-xs text-mk-mute uppercase">Stable в репозитории</div>
              <div className="text-2xl font-semibold mt-0.5">{latestVer ?? '—'}</div>
              <div className="text-[11px] text-mk-mute mt-1">
                Всего файлов: {firmwares.length}
              </div>
            </div>
          </div>

          <div className="card space-y-3">
            <div className="flex items-center gap-2">
              <ArrowUpCircle size={16} className="text-mk-accent2" />
              <h3 className="text-base font-semibold">Обновление прошивки</h3>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="border border-mk-border rounded p-3 space-y-2">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Cloud size={14} className="text-mk-accent2" />
                  Из интернета (RouterOS update)
                </div>
                <div className="text-[11px] text-mk-mute">
                  Устройство загрузит обновление с серверов MikroTik самостоятельно. Требует исходящий доступ в интернет.
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-xs text-mk-mute">Канал:</label>
                  <select
                    className="input !py-1 !text-xs !w-auto"
                    value={upgradeChannel}
                    onChange={(e) => setUpgradeChannel(e.target.value as any)}
                  >
                    <option value="stable">stable</option>
                    <option value="long-term">long-term</option>
                    <option value="testing">testing</option>
                    <option value="development">development</option>
                  </select>
                </div>
                <button
                  className="btn-primary !text-xs"
                  onClick={upgradeFromInternet}
                  disabled={actionBusy !== null}
                >
                  {actionBusy === 'upgrade-net' ? 'Запускается…' : 'Обновить из интернета'}
                </button>
              </div>

              <div className="border border-mk-border rounded p-3 space-y-2">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Package size={14} className="text-mk-accent2" />
                  Из локального репозитория (через FTP)
                </div>
                <div className="text-[11px] text-mk-mute">
                  Контроллер запустит на устройстве <code>/tool fetch ftp</code>, чтобы скачать выбранный <code>.npk</code>, и отправит reboot для установки.
                </div>
                <div className="text-[11px] flex items-center gap-2 flex-wrap">
                  <span className="text-mk-mute">Платформа устройства:</span>
                  {d.architecture ? (
                    <span className="px-1.5 py-0.5 rounded bg-mk-panel2 font-mono">{d.architecture}</span>
                  ) : (
                    <span className="text-mk-warn">неизвестна — нажмите «Опросить»</span>
                  )}
                  <label className="ml-auto inline-flex items-center gap-1 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={showAllFw}
                      onChange={(e) => setShowAllFw(e.target.checked)}
                    />
                    <span className="text-mk-mute">показать все архитектуры</span>
                  </label>
                </div>
                <select
                  className="input !py-1 !text-xs"
                  value={selectedFw}
                  onChange={(e) => setSelectedFw(e.target.value ? Number(e.target.value) : '')}
                >
                  <option value="">— выберите файл —</option>
                  {filteredFirmwares.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name} {f.version ? `(${f.version})` : ''} {f.architecture ? `· ${f.architecture}` : ''}
                    </option>
                  ))}
                </select>
                {filteredFirmwares.length === 0 && (
                  <div className="text-[11px] text-mk-warn">
                    Нет прошивок для архитектуры <span className="font-mono">{d.architecture || '?'}</span>.
                    Загрузите подходящий <code>.npk</code> в разделе «Прошивки».
                  </div>
                )}
                <button
                  className="btn-primary !text-xs"
                  onClick={upgradeFromLocal}
                  disabled={actionBusy !== null || !selectedFw}
                >
                  {actionBusy === 'upgrade-local' ? 'Загрузка…' : 'Обновить из репозитория'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {tab === 'ipmgmt' && <IpMgmtTab deviceId={Number(id)} />}

      {editing && <EditDeviceModal device={d} onClose={() => setEditing(false)} onSaved={load} />}
    </div>
  );
}

function TabBtn({
  active, onClick, icon: Icon, label,
}: { active: boolean; onClick: () => void; icon: any; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 text-xs inline-flex items-center gap-1.5 border-b-2 -mb-px ${
        active ? 'border-mk-accent2 text-mk-text font-medium' : 'border-transparent text-mk-mute hover:text-mk-text'
      }`}
    >
      <Icon size={13} /> {label}
    </button>
  );
}

// Физические типы RouterOS интерфейсов. Всё остальное — логические (vlan/bridge/ppp/vpn/...).
const PHYSICAL_TYPE_RE = /^(ether|wlan|wireless|sfp|qsfp)/i;
const isPhysicalIface = (it: InterfaceInfo): boolean =>
  PHYSICAL_TYPE_RE.test((it.type || '').trim());

function InterfacesTab({ device, onSaved }: { device: Device; onSaved: () => void }) {
  const [ifs, setIfs] = useState<InterfaceInfo[]>([]);
  const [monitored, setMonitored] = useState<Set<string>>(new Set(parseList(device.monitored_interfaces)));
  const [uplinks, setUplinks] = useState<Set<string>>(new Set(parseList(device.uplink_interfaces)));
  const [hours, setHours] = useState<number>(device.interface_history_hours ?? 24);
  const [traffic, setTraffic] = useState<InterfaceTrafficOut | null>(null);
  const [uplinkStatus, setUplinkStatus] = useState<UplinkStatus[]>([]);
  const [saveBusy, setSaveBusy] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [subTab, setSubTab] = useState<'physical' | 'ports'>('physical');

  const loadIfs = () =>
    api.get<InterfaceInfo[]>(`/devices/${device.id}/interfaces`).then((r) => setIfs(r.data)).catch(() => {});
  const loadTraffic = () => {
    if (monitored.size === 0) { setTraffic(null); return; }
    api.get<InterfaceTrafficOut>(`/devices/${device.id}/interface-traffic`, {
      params: { names: Array.from(monitored).join(','), hours },
    }).then((r) => setTraffic(r.data)).catch(() => {});
  };
  const loadUplinkStatus = () => {
    api.get<UplinkStatus[]>(`/devices/${device.id}/uplink-status`)
      .then((r) => setUplinkStatus(r.data)).catch(() => {});
  };

  useEffect(() => { loadIfs(); loadTraffic(); loadUplinkStatus(); }, [device.id]);
  useEffect(() => { loadTraffic(); }, [Array.from(monitored).join(','), hours]);

  const toggle = (set: Set<string>, setSet: (s: Set<string>) => void, name: string) => {
    const next = new Set(set);
    if (next.has(name)) next.delete(name); else next.add(name);
    setSet(next);
  };

  const save = async () => {
    setSaveBusy(true); setSaveMsg(null);
    try {
      await api.patch(`/devices/${device.id}`, {
        monitored_interfaces: Array.from(monitored).join(','),
        uplink_interfaces: Array.from(uplinks).join(','),
        interface_history_hours: hours,
      });
      setSaveMsg('Сохранено. Данные начнут собираться в ближайшем цикле опроса.');
      onSaved();
    } catch (ex: any) {
      setSaveMsg(ex?.response?.data?.detail ?? 'Ошибка сохранения');
    } finally { setSaveBusy(false); }
  };

  // Build chart data: rows = timestamps, columns = interfaces, values = rx_bps & tx_bps
  const chart = useMemo(() => {
    if (!traffic) return [];
    const tsMap: Record<string, any> = {};
    for (const [name, points] of Object.entries(traffic.series)) {
      for (const p of points) {
        const k = p.ts;
        if (!tsMap[k]) tsMap[k] = { t: new Date(p.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), ts: k };
        tsMap[k][`${name}_rx`] = p.rx_bps;
        tsMap[k][`${name}_tx`] = p.tx_bps;
      }
    }
    return Object.values(tsMap).sort((a: any, b: any) => a.ts.localeCompare(b.ts));
  }, [traffic]);

  const trafficNames = traffic ? Object.keys(traffic.series) : [];

  return (
    <div className="space-y-3">
      <div className="card space-y-3">
        <div className="flex items-center gap-2">
          <Network size={14} className="text-mk-accent2" />
          <h3 className="text-sm font-semibold">Конфигурация мониторинга</h3>
        </div>
        <div className="text-[11px] text-mk-mute">
          Отметьте интерфейсы, нагрузку которых нужно сохранять, и uplink-интерфейсы (например <code>uztelecom</code>, <code>lte1</code>) для индикатора связи.
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <div>
            <div className="text-xs text-mk-mute mb-1">Глубина истории, часов:</div>
            <input
              type="number" min={1} max={168}
              className="input !py-1 !text-xs !w-32"
              value={hours}
              onChange={(e) => setHours(Math.max(1, Math.min(168, Number(e.target.value) || 24)))}
            />
          </div>
        </div>

        <div className="flex items-center gap-1 border-b border-mk-border -mx-3 px-3">
          {([
            { key: 'physical' as const, label: 'Интерфейсы', count: ifs.filter(isPhysicalIface).length },
            { key: 'ports' as const,    label: 'Порты',      count: ifs.filter((it) => !isPhysicalIface(it)).length },
          ]).map((s) => (
            <button
              key={s.key}
              type="button"
              onClick={() => setSubTab(s.key)}
              className={`px-3 py-1.5 text-xs inline-flex items-center gap-1.5 border-b-2 -mb-px ${
                subTab === s.key
                  ? 'border-mk-accent2 text-mk-text font-medium'
                  : 'border-transparent text-mk-mute hover:text-mk-text'
              }`}
            >
              {s.label} <span className="text-[10px] opacity-70">({s.count})</span>
            </button>
          ))}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="text-mk-mute text-[10px] uppercase tracking-wider">
              <tr>
                <th className="text-center px-2 py-1">Статус</th>
                <th className="text-left px-2 py-1">Имя</th>
                <th className="text-left px-2 py-1">Тип</th>
                <th className="text-left px-2 py-1">Comment</th>
                <th className="text-left px-2 py-1">MAC</th>
                <th className="text-center px-2 py-1">Граф</th>
                <th className="text-center px-2 py-1">Uplink</th>
              </tr>
            </thead>
            <tbody>
              {(() => {
                const filtered = ifs.filter((it) =>
                  subTab === 'physical' ? isPhysicalIface(it) : !isPhysicalIface(it)
                );
                if (ifs.length === 0) {
                  return (
                    <tr><td colSpan={7} className="px-2 py-3 text-center text-mk-mute">Нет данных. Опросите устройство.</td></tr>
                  );
                }
                if (filtered.length === 0) {
                  return (
                    <tr><td colSpan={7} className="px-2 py-3 text-center text-mk-mute">
                      {subTab === 'physical' ? 'Физических интерфейсов не найдено.' : 'Логических портов не найдено.'}
                    </td></tr>
                  );
                }
                const statusBadge = (it: InterfaceInfo) => {
                  if (it.disabled) return <span className="inline-flex items-center gap-1 text-mk-mute"><span>○</span> disabled</span>;
                  if (it.running)  return <span className="inline-flex items-center gap-1 text-mk-ok"><span>●</span> running</span>;
                  return <span className="inline-flex items-center gap-1 text-mk-err"><span>●</span> down</span>;
                };
                return filtered.map((it) => (
                  <tr key={it.name} className="border-t border-mk-border hover:bg-mk-panel2/40">
                    <td className="px-2 py-1 text-center">{statusBadge(it)}</td>
                    <td className="px-2 py-1 font-mono">{it.name}</td>
                    <td className="px-2 py-1 text-mk-mute">{it.type || '—'}</td>
                    <td className="px-2 py-1 text-mk-mute truncate max-w-[200px]">{it.comment || ''}</td>
                    <td className="px-2 py-1 text-mk-mute font-mono text-[11px]">{it.mac_address || ''}</td>
                    <td className="px-2 py-1 text-center">
                      <input type="checkbox" checked={monitored.has(it.name)} onChange={() => toggle(monitored, setMonitored, it.name)} />
                    </td>
                    <td className="px-2 py-1 text-center">
                      <input type="checkbox" checked={uplinks.has(it.name)} onChange={() => toggle(uplinks, setUplinks, it.name)} />
                    </td>
                  </tr>
                ));
              })()}
            </tbody>
          </table>
        </div>

        <div className="flex items-center gap-3">
          <button className="btn-primary !text-xs" onClick={save} disabled={saveBusy}>
            <Save size={13} /> {saveBusy ? 'Сохранение…' : 'Сохранить'}
          </button>
          {saveMsg && <span className="text-xs text-mk-mute">{saveMsg}</span>}
        </div>
      </div>

      <div className="card space-y-2">
        <div className="flex items-center gap-2">
          <Wifi size={14} className="text-mk-accent2" />
          <h3 className="text-sm font-semibold">Состояние uplink</h3>
        </div>
        {uplinkStatus.length === 0 ? (
          <div className="text-xs text-mk-mute">Не выбраны uplink-интерфейсы или нет данных.</div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {uplinkStatus.map((u) => (
              <div
                key={u.name}
                className={`px-3 py-2 rounded border ${
                  u.running
                    ? 'border-mk-ok/40 bg-mk-ok/10 text-mk-ok'
                    : 'border-mk-err/40 bg-mk-err/10 text-mk-err'
                }`}
              >
                <div className="flex items-center gap-2 text-sm font-medium">
                  {u.running ? <Wifi size={14} /> : <WifiOff size={14} />}
                  {u.name}
                </div>
                <div className="text-[10px] opacity-70 mt-0.5">
                  {u.running ? 'CONNECTED' : 'DOWN'}{u.ts ? ` · ${new Date(u.ts).toLocaleTimeString()}` : ''}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {traffic && trafficNames.length > 0 && (
        <div className="card space-y-2">
          <div className="flex items-center gap-2">
            <ActivityIcon size={14} className="text-mk-accent2" />
            <h3 className="text-sm font-semibold">Трафик за {hours}ч</h3>
            <span className="text-[11px] text-mk-mute ml-auto">
              шкала: бит/сек, отрицательные дельты после ребута пропускаются
            </span>
          </div>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={chart}>
              <CartesianGrid strokeDasharray="2 2" stroke="#2a2f36" />
              <XAxis dataKey="t" stroke="#8b95a5" fontSize={10} minTickGap={40} />
              <YAxis stroke="#8b95a5" fontSize={10} tickFormatter={fmtBps} />
              <Tooltip
                contentStyle={{ background: '#1e242b', border: '1px solid #2a2f36', fontSize: 12 }}
                formatter={(v: any) => fmtBps(Number(v))}
              />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              {trafficNames.flatMap((name, idx) => [
                <Line
                  key={`${name}_rx`}
                  type="monotone"
                  dataKey={`${name}_rx`}
                  stroke={COLORS[idx % COLORS.length]}
                  dot={false}
                  name={`${name} RX`}
                />,
                <Line
                  key={`${name}_tx`}
                  type="monotone"
                  dataKey={`${name}_tx`}
                  stroke={COLORS[idx % COLORS.length]}
                  strokeDasharray="3 3"
                  dot={false}
                  name={`${name} TX`}
                />,
              ])}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

function IpMgmtTab({ deviceId }: { deviceId: number }) {
  const [leases, setLeases] = useState<DhcpLease[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = async () => {
    setBusy(true); setErr(null);
    try {
      const { data } = await api.get<DhcpLease[]>(`/devices/${deviceId}/dhcp-leases`);
      setLeases(data);
    } catch (ex: any) {
      setErr(ex?.response?.data?.detail ?? 'Ошибка получения leases');
    } finally { setBusy(false); }
  };

  useEffect(() => { load(); }, [deviceId]);

  return (
    <div className="card p-0 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 border-b border-mk-border">
        <div className="flex items-center gap-2">
          <HardDrive size={14} className="text-mk-accent2" />
          <h3 className="text-sm font-semibold">DHCP Leases</h3>
          <span className="text-[11px] text-mk-mute">всего: {leases.length}</span>
        </div>
        <button className="btn-ghost !py-1 !text-xs" onClick={load} disabled={busy}>
          <RefreshCw size={13} className={busy ? 'animate-spin' : ''} /> Обновить
        </button>
      </div>
      {err && <div className="px-4 py-2 text-xs text-mk-err">{err}</div>}
      <table className="w-full text-xs">
        <thead className="bg-mk-panel2 text-mk-mute text-[10px] uppercase tracking-wider">
          <tr>
            <th className="text-left px-3 py-1">Адрес</th>
            <th className="text-left px-3 py-1">MAC</th>
            <th className="text-left px-3 py-1">Hostname</th>
            <th className="text-left px-3 py-1">Comment</th>
            <th className="text-left px-3 py-1">Server</th>
            <th className="text-left px-3 py-1">Status</th>
            <th className="text-left px-3 py-1">Expires</th>
            <th className="text-center px-3 py-1">Static</th>
          </tr>
        </thead>
        <tbody>
          {leases.length === 0 && !busy && (
            <tr><td colSpan={8} className="px-3 py-3 text-center text-mk-mute">Нет lease</td></tr>
          )}
          {leases.map((l, i) => (
            <tr key={i} className="border-t border-mk-border hover:bg-mk-panel2/40">
              <td className="px-3 py-1 font-mono">{l.address}</td>
              <td className="px-3 py-1 font-mono text-mk-mute">{l.mac_address}</td>
              <td className="px-3 py-1">{l.host_name || '—'}</td>
              <td className="px-3 py-1 text-mk-mute">{l.comment || ''}</td>
              <td className="px-3 py-1 text-mk-mute">{l.server || '—'}</td>
              <td className="px-3 py-1">
                <span className={l.status === 'bound' ? 'text-mk-ok' : 'text-mk-mute'}>{l.status || '—'}</span>
              </td>
              <td className="px-3 py-1 text-mk-mute text-[11px]">{l.expires_after || '—'}</td>
              <td className="px-3 py-1 text-center">{l.dynamic === false ? '●' : ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AboutTab({ device, resource }: { device: Device; resource: DeviceResource | null }) {
  const [ifs, setIfs] = useState<InterfaceInfo[]>([]);
  useEffect(() => {
    api.get<InterfaceInfo[]>(`/devices/${device.id}/interfaces`).then((r) => setIfs(r.data)).catch(() => {});
    const t = setInterval(() => {
      api.get<InterfaceInfo[]>(`/devices/${device.id}/interfaces`).then((r) => setIfs(r.data)).catch(() => {});
    }, 15000);
    return () => clearInterval(t);
  }, [device.id]);

  const board = device.model || resource?.board_name || null;

  const rows: [string, ReactNode][] = [
    ['Имя (identity)',  device.identity || '—'],
    ['Модель',          board || '—'],
    ['Архитектура',     device.architecture || '—'],
    ['RouterOS',        device.ros_version || '—'],
    ['Серийный',        device.serial || '—'],
    ['Адрес',           `${device.host}:${device.port}${device.use_tls ? ' (api-ssl)' : ''}`],
    ['Аптайм',          resource?.uptime || '—'],
    ['Последний опрос', device.last_seen ? new Date(device.last_seen).toLocaleString() : '—'],
    ['Статус',          device.status],
  ];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
      <DeviceMockup boardName={board} interfaces={ifs} />

      <div className="card !py-2 !px-3 h-full flex flex-col">
        <div className="flex items-center gap-1.5 mb-1">
          <Info size={13} className="text-mk-accent2" />
          <h3 className="text-xs font-semibold uppercase tracking-wide text-mk-mute">Описание</h3>
        </div>
        <dl className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-0 text-xs flex-1 content-start">
          {rows.map(([k, v]) => (
            <div key={k} className="flex items-baseline gap-2 leading-tight py-0.5">
              <dt className="text-mk-mute min-w-[100px] shrink-0">{k}</dt>
              <dd className="font-mono text-mk-text break-all">{v}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}

