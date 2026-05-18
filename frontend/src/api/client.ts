import axios from 'axios';
import { useAuth } from '@/store/auth';

export const api = axios.create({
  baseURL: '/api/v1',
  timeout: 15000,
});

api.interceptors.request.use((config) => {
  const token = useAuth.getState().accessToken;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err?.response?.status === 401) {
      useAuth.getState().logout();
    }
    return Promise.reject(err);
  },
);

export interface Device {
  id: number;
  name: string;
  kind: 'router' | 'switch' | string;
  host: string;
  port: number;
  use_tls: boolean;
  username: string;
  identity: string | null;
  model: string | null;
  serial: string | null;
  ros_version: string | null;
  architecture: string | null;
  status: 'up' | 'down' | 'unknown' | string;
  last_error: string | null;
  last_seen: string | null;
  internet_ok: boolean | null;
  last_uptime_seconds: number | null;
  abnormal_reboot: boolean;
  last_log_warning: string | null;
  monitored_interfaces: string | null;
  uplink_interfaces: string | null;
  interface_history_hours: number;
  created_at: string;
}

export interface InterfaceInfo {
  name: string;
  rx_bytes: number;
  tx_bytes: number;
  running: boolean;
  disabled?: boolean;
  type: string | null;
  comment: string | null;
  mac_address?: string | null;
  /** Текущая скорость линка: "10M", "100M", "1G", "2.5G", "10G".
   *  null — порт не ethernet, нет линка, или устройство не дало monitor. */
  link_speed?: string | null;
}

export interface InterfaceTrafficPoint {
  ts: string;
  rx_bps: number | null;
  tx_bps: number | null;
  running: boolean;
}

export interface InterfaceTrafficOut {
  series: Record<string, InterfaceTrafficPoint[]>;
  hours: number;
}

export interface UplinkStatus {
  name: string;
  running: boolean | null;
  ts: string | null;
}

export interface DhcpLease {
  address: string;
  mac_address: string;
  host_name: string | null;
  comment: string | null;
  server: string | null;
  status: string | null;
  dynamic: boolean;
  blocked: boolean;
  last_seen: string | null;
  expires_after: string | null;
}

export interface DeviceResource {
  cpu_load: number | null;
  free_memory: number | null;
  total_memory: number | null;
  uptime: string | null;
  version: string | null;
  board_name: string | null;
  architecture_name: string | null;
}

export interface DeviceBackup {
  id: number;
  device_id: number;
  filename: string;
  fmt: 'binary' | 'text' | string;
  size: number;
  created_at: string;
}

export interface Firmware {
  id: number;
  name: string;
  version: string | null;
  architecture: string | null;
  channel: string | null;
  size: number;
  sha256: string | null;
  source_url: string | null;
  created_at: string;
}

export interface Alert {
  id: number;
  severity: 'info' | 'warning' | 'error' | 'critical' | string;
  category: string;
  source: string | null;
  title: string;
  message: string | null;
  acknowledged: boolean;
  created_at: string;
}

export interface MetricPoint {
  ts: string;
  cpu_load: number | null;
  mem_used_pct: number | null;
  uptime_seconds: number | null;
  internet_ok: boolean | null;
  rx_bps: number | null;
  tx_bps: number | null;
}


export interface CLIDeviceResult {
  device_id: number;
  device_name: string | null;
  ok: boolean;
  rows: Record<string, unknown>[] | null;
  error: string | null;
}

export interface CLIRunOut {
  command: string;
  results: CLIDeviceResult[];
}

export interface AppSettings {
  ui: {
    instance_name: string;
    locale: 'ru' | 'en' | 'uz' | string;
    theme: string;
    heartbeat_hours: number;
    probe_interval_minutes: number;
  };
  menu: {
    dashboard: boolean;
    devices: boolean;
    switches: boolean;
    firmware: boolean;
    notif_center: boolean;
    cli: boolean;
    settings: boolean;
  };
  notify: {
    device_status: boolean;
    internet: boolean;
    abnormal_reboot: boolean;
    firmware: boolean;
    style: 'jokes' | 'serious';
  };
  telegram: {
    enabled: boolean;
    bot_token: string;
    chat_id: string;
    min_severity: 'info' | 'warning' | 'error' | 'critical' | string;
  };
}

export interface FirmwareChannelInfo {
  version?: string;
  released_at?: string;
  last_check?: string;
  last_check_ok?: boolean;
}

export interface FirmwareChannelsOut {
  channels: Record<string, FirmwareChannelInfo>;
  available_channels: string[];
  architectures: string[];
}

export interface FirmwareBulkResult {
  architecture: string;
  ok: boolean;
  firmware_id: number | null;
  error: string | null;
  skipped?: boolean;
}

export interface FirmwareBulkOut {
  version: string;
  channel: string | null;
  results: FirmwareBulkResult[];
}

export type HeartbeatBucket = 'up' | 'no-net' | 'down' | 'none';

export interface HeartbeatDevice {
  id: number;
  name: string;
  host: string;
  status: string;
  buckets: HeartbeatBucket[];
}

export interface HeartbeatOut {
  since: string;
  until: string;
  bins: number;
  hours: number;
  devices: HeartbeatDevice[];
}

// --- Vault (мастер-пароль / шифрование секретов устройств) -------------------

export interface VaultStatus {
  initialized: boolean;
  unlocked: boolean;
}

export interface VaultMigration {
  migrated: number;
  failed: number;
  skipped: number;
}

export interface VaultActionOut {
  status: VaultStatus;
  migration?: VaultMigration;
}

export const vaultApi = {
  async status(): Promise<VaultStatus> {
    const r = await api.get<VaultStatus>('/vault/status');
    return r.data;
  },
  async init(master_password: string): Promise<VaultActionOut> {
    const r = await api.post<VaultActionOut>('/vault/init', { master_password });
    return r.data;
  },
  async unlock(master_password: string): Promise<VaultActionOut> {
    const r = await api.post<VaultActionOut>('/vault/unlock', { master_password });
    return r.data;
  },
  async lock(): Promise<{ unlocked: false }> {
    const r = await api.post<{ unlocked: false }>('/vault/lock');
    return r.data;
  },
  async rotate(old_password: string, new_password: string): Promise<VaultActionOut> {
    const r = await api.post<VaultActionOut>('/vault/rotate', { old_password, new_password });
    return r.data;
  },
};
