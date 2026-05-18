// Минимальный i18n: словарь + хук useT(). Без внешних зависимостей.
import { useSettings } from '../store/settings';

export type Locale = 'ru' | 'en' | 'uz';

const dict: Record<Locale, Record<string, string>> = {
  ru: {
    'nav.dashboard': 'Дашборд',
    'nav.devices':   'Мониторинг',
    'nav.devicesRouters': 'Роутеры',
    'nav.firmware':  'Прошивки',
    'nav.alerts':    'Алерты',
    'nav.cli':       'CLI',
    'nav.automation':'Автоматизация',
    'nav.switches':  'Свичи',
    'nav.audit':     'Аудит',
    'nav.logs':      'Просмотр логов',
    'nav.notifCenter':'Центр уведомлений',
    'nav.telegram':  'Telegram',
    'nav.settings':  'Настройки',
    'nav.settingsUsers':    'Пользователи',
    'nav.settingsPassword': 'Смена пароля',
    'nav.settingsConfig':   'Конфигурация',
    'nav.logout':    'Выйти',
    'logout.confirm':'Выйти из системы?',
    'health.ok':     'Всё ОК',
    'health.issues': 'Проблем',
    'health.empty':  'Нет устройств',
    'settings.title':         'Настройки',
    'settings.identity':      'Идентификация установки',
    'settings.identity.hint': 'Это название отображается в шапке интерфейса.',
    'settings.instanceName':  'Название установки',
    'settings.locale':        'Язык интерфейса',
    'settings.theme':         'Тема оформления',
    'settings.menu':          'Видимость пунктов меню',
    'settings.notify':        'Уведомления',
    'settings.telegram':      'Telegram-бот',
    'settings.heartbeat':     'Окно Heartbeat на дашборде',
    'settings.heartbeat.hint':'Сколько времени отображается в сетке состояния устройств.',
    'settings.probe':         'Автоматический опрос устройств',
    'settings.probe.hint':    'Как часто опрашивать все устройства (сбор метрик, статуса, интернета).',
    'common.save':            'Сохранить',
    'common.saved':           'Сохранено',
    'common.cancel':          'Отмена',
  },
  en: {
    'nav.dashboard': 'Dashboard',
    'nav.devices':   'Monitoring',
    'nav.devicesRouters': 'Routers',
    'nav.firmware':  'Firmware',
    'nav.alerts':    'Alerts',
    'nav.cli':       'CLI',
    'nav.automation':'Automation',
    'nav.switches':  'Switches',
    'nav.audit':     'Audit',
    'nav.logs':      'View logs',
    'nav.notifCenter':'Notification Center',
    'nav.telegram':  'Telegram',
    'nav.settings':  'Settings',
    'nav.settingsUsers':    'Users',
    'nav.settingsPassword': 'Change password',
    'nav.settingsConfig':   'Configuration',
    'nav.logout':    'Logout',
    'logout.confirm':'Sign out?',
    'health.ok':     'All OK',
    'health.issues': 'Issues',
    'health.empty':  'No devices',
    'settings.title':         'Settings',
    'settings.identity':      'Installation identity',
    'settings.identity.hint': 'This name is shown in the header.',
    'settings.instanceName':  'Installation name',
    'settings.locale':        'Interface language',
    'settings.theme':         'Theme',
    'settings.menu':          'Menu items visibility',
    'settings.notify':        'Notifications',
    'settings.telegram':      'Telegram bot',
    'settings.heartbeat':     'Dashboard Heartbeat window',
    'settings.heartbeat.hint':'How much history is shown in the device heartbeat grid.',
    'settings.probe':         'Automatic device polling',
    'settings.probe.hint':    'How often to probe all devices (metrics, status, internet check).',
    'common.save':            'Save',
    'common.saved':           'Saved',
    'common.cancel':          'Cancel',
  },
  uz: {
    'nav.dashboard': 'Boshqaruv paneli',
    'nav.devices':   'Monitoring',
    'nav.devicesRouters': 'Routerlar',
    'nav.firmware':  'Proshivkalar',
    'nav.alerts':    'Ogohlantirishlar',
    'nav.cli':       'CLI',
    'nav.automation':'Avtomatlashtirish',
    'nav.switches':  'Switchlar',
    'nav.audit':     'Audit',
    'nav.logs':      "Loglarni ko'rish",
    'nav.notifCenter':'Bildirishnomalar markazi',
    'nav.telegram':  'Telegram',
    'nav.settings':  'Sozlamalar',
    'nav.settingsUsers':    'Foydalanuvchilar',
    'nav.settingsPassword': "Parolni o'zgartirish",
    'nav.settingsConfig':   'Konfiguratsiya',
    'nav.logout':    'Chiqish',
    'logout.confirm':'Tizimdan chiqasizmi?',
    'health.ok':     "Hammasi joyida",
    'health.issues': 'Muammolar',
    'health.empty':  "Qurilmalar yo'q",
    'settings.title':         'Sozlamalar',
    'settings.identity':      'Tizim identifikatsiyasi',
    'settings.identity.hint': 'Bu nom interfeys sarlavhasida ko\'rsatiladi.',
    'settings.instanceName':  'Tizim nomi',
    'settings.locale':        'Interfeys tili',
    'settings.theme':         'Mavzu',
    'settings.menu':          'Menyu elementlari ko\'rinishi',
    'settings.notify':        'Bildirishnomalar',
    'settings.telegram':      'Telegram bot',
    'settings.heartbeat':     'Boshqaruv panelidagi Heartbeat oynasi',
    'settings.heartbeat.hint':'Qurilmalar holati panelida qancha vaqt ko\'rsatiladi.',
    'settings.probe':         'Qurilmalarni avtomatik so\'rash',
    'settings.probe.hint':    'Barcha qurilmalar qanchalik tez-tez so\'raladi (metrikalar, holat, internet).',
    'common.save':            'Saqlash',
    'common.saved':           'Saqlandi',
    'common.cancel':          'Bekor qilish',
  },
};

export function t(locale: Locale, key: string): string {
  return dict[locale]?.[key] ?? dict.ru[key] ?? key;
}

export function useT() {
  const locale = useSettings((s) => (s.settings?.ui?.locale as Locale) ?? 'ru');
  return (key: string) => t(locale, key);
}

export const LOCALES: { code: Locale; label: string }[] = [
  { code: 'ru', label: 'Русский' },
  { code: 'en', label: 'English' },
  { code: 'uz', label: "O'zbekcha" },
];

export const THEMES: { id: string; label: string; swatch: [string, string, string] }[] = [
  { id: 'mk-dark',      label: 'ROSzetta Dark',   swatch: ['#0b0e14', '#11151c', '#1b78ff'] },
  { id: 'abyss',           label: 'Abyss (VS Code)', swatch: ['#000c18', '#051336', '#4d9cff'] },
  { id: 'midnight',        label: 'Midnight',        swatch: ['#0a0f1f', '#121a30', '#5b6cff'] },
  { id: 'dracula',         label: 'Dracula',         swatch: ['#282a36', '#343746', '#bd93f9'] },
  { id: 'light',           label: 'Light',           swatch: ['#ffffff', '#f5f6f8', '#1b78ff'] },
  { id: 'solarized-light', label: 'Solarized Light', swatch: ['#fdf6e3', '#eee8d5', '#268bd2'] },
];

// Доступные окна Heartbeat (в часах).
export const HEARTBEAT_RANGES: { hours: number; label: string }[] = [
  { hours: 6,   label: '6ч' },
  { hours: 3,   label: '3ч' },
  { hours: 1,   label: '1ч' },
  { hours: 0.5, label: '30м' },
];

// Допустимые интервалы автоопроса устройств (мин).
export const PROBE_INTERVALS: { minutes: number; label: string }[] = [
  { minutes: 1,  label: '1 мин' },
  { minutes: 2,  label: '2 мин' },
  { minutes: 3,  label: '3 мин' },
  { minutes: 5,  label: '5 мин' },
  { minutes: 10, label: '10 мин' },
];
