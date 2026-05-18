// Применяет тему и язык к документу при загрузке/смене настроек.
export function applyTheme(theme: string | undefined) {
  const id = theme && typeof theme === 'string' ? theme : 'mk-dark';
  document.documentElement.setAttribute('data-theme', id);
}

export function applyLocale(locale: string | undefined) {
  const id = locale && typeof locale === 'string' ? locale : 'ru';
  document.documentElement.setAttribute('lang', id);
}

export function applyInstanceName(name: string | undefined) {
  if (name) document.title = name;
}
