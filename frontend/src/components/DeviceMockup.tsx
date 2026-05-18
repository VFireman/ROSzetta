// SVG-мокапы лицевых панелей MikroTik. Подсвечивают живые порты по InterfaceInfo[].
// Сейчас реализован hAP ac lite (RB952Ui-5ac2nD): синий корпус, 5 ethernet,
// первый — PoE in (Internet), 2–4 LAN, 5 — PoE out (оранжевая обводка).

import { InterfaceInfo } from '@/api/client';

export interface DeviceMockupProps {
  /** Имя модели из RouterOS (board-name), например "hAP ac lite". */
  boardName: string | null | undefined;
  /** Текущий снимок интерфейсов с устройства. */
  interfaces: InterfaceInfo[];
}

const isHapAcLite = (b?: string | null): boolean =>
  !!b && /h\s*A\s*P\s*ac\s*lite/i.test(b);

// hAP ac² (RBD52G-5HacD2HnD): отличаем по цифре «2» / «²» после «ac»,
// чтобы случайно не перехватить hAP ac lite.
const isHapAc2 = (b?: string | null): boolean =>
  !!b && (/h\s*A\s*P\s*ac[\s\^]*[²2]/i.test(b) || /RBD52G/i.test(b));

const isHapLike = (b?: string | null): boolean => !!b && /\bh\s*A\s*P\b/i.test(b);

const isRb5009 = (b?: string | null): boolean =>
  !!b && /RB?\s*5009/i.test(b);

const isChr = (b?: string | null): boolean =>
  !!b && /\bCHR\b/i.test(b);

const isHexS = (b?: string | null): boolean =>
  !!b && /h\s*EX\s*S|RB?\s*760/i.test(b);

const isL009 = (b?: string | null): boolean =>
  !!b && /\bL\s*009/i.test(b);

const isRb4011 = (b?: string | null): boolean =>
  !!b && /RB?\s*4011/i.test(b);

// CRS317-1G-16S+ — белый 1U-свич: 16×SFP+ + 1 GigE (ETH/BOOT).
const isCrs317 = (b?: string | null): boolean =>
  !!b && /CRS\s*317(?:-?\s*1G)?(?:-?\s*16S)?/i.test(b);

// Найти интерфейс по базовому имени, допуская суффиксы вида `ether1-Uztelecom`,
// `ether2_LAN`, `ether3 description` и т.п. Сначала пробуем точное совпадение, потом по префиксу.
function findPort(interfaces: InterfaceInfo[], baseName: string): InterfaceInfo | undefined {
  const exact = interfaces.find((x) => x.name === baseName);
  if (exact) return exact;
  const re = new RegExp(`^${baseName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([\\s\\-_.:]|$)`, 'i');
  return interfaces.find((x) => re.test(x.name));
}

// -------- Цветомаркировка скоростей линка --------
//
// Палитра единая для всех мокапов и легенд. Цвет берётся по link_speed:
//   no link / disabled / нет данных → серый
//   10  Mb/s                        → тёмно-зелёный
//   100 Mb/s                        → бирюзовый
//   1   Gb/s (и 2.5G)               → зелёный  (как RJ45 на пиктограмме)
//   10  Gb/s (и 25G/40G/100G)       → фиолетовый
//
// link_speed приходит каноничной строкой ("10M", "100M", "1G", "2.5G", "10G", ...).

interface SpeedPalette {
  /** Главный цвет: используется как обводка иконки порта и LED. */
  color: string;
  /** Подпись для тултипа и легенды ("1 Gb/s", "no link"). */
  label: string;
}

function speedToMbps(s?: string | null): number | null {
  if (!s) return null;
  const m = String(s).match(/^\s*(\d+(?:[.,]\d+)?)\s*([MG])\s*$/i);
  if (!m) return null;
  const v = parseFloat(m[1].replace(',', '.'));
  if (!isFinite(v)) return null;
  return m[2].toUpperCase() === 'G' ? v * 1000 : v;
}

function paletteForSpeed(mbps: number | null): SpeedPalette {
  if (mbps == null)        return { color: '#9ca3af', label: 'no link'  };
  if (mbps <= 10)          return { color: '#166534', label: '10 Mb/s'  };
  if (mbps <= 100)         return { color: '#14b8a6', label: '100 Mb/s' };
  if (mbps <= 2500)        return { color: '#22c55e', label: '1 Gb/s'   };
  return                          { color: '#a855f7', label: '10 Gb/s'  };
}

/** Палитра порта: учитывает link_speed; при отсутствии — деградирует к running/down. */
function portPalette(it: InterfaceInfo | undefined): SpeedPalette {
  if (!it || it.disabled)     return { color: '#9ca3af', label: it?.disabled ? 'disabled' : 'нет данных' };
  if (!it.running)            return { color: '#9ca3af', label: 'no link' };
  const mbps = speedToMbps(it.link_speed);
  if (mbps != null)           return paletteForSpeed(mbps);
  // running, но link_speed нет (не ethernet или старая прошивка) — считаем «up» зелёным.
  return                            { color: '#22c55e', label: 'up' };
}

// -------- Иконки портов (общие для всех мокапов) --------
//
// Стилизованный RJ45 — чёрный корпус, цветной контур, серые «пины» внутри,
// сверху небольшой выступ-фиксатор. Внешний вид одинаков везде; меняется только
// прямоугольник позиционирования (x, y, w, h) и сама палитра (из link_speed).

interface PortIconExtras {
  /** Дополнительный текст в тултипе (PoE in/out, 2.5G, Internet и т.п.). */
  detail?: string;
  /** Кастомное имя для отображения в тултипе, если интерфейс не найден. */
  fallbackName?: string;
}

// Масштаб иконки относительно bounding-box, занимаемого портом в мокапе.
// 0.65 = иконка на 35% меньше; центрируется внутри прежнего bbox.
const PORT_ICON_SCALE = 0.65;

function rj45SvgPort(
  bx: number,
  by: number,
  bw: number,
  bh: number,
  it: InterfaceInfo | undefined,
  extras: PortIconExtras = {},
) {
  const pal = portPalette(it);
  // Уменьшаем иконку и центрируем её внутри переданного bbox.
  const w = bw * PORT_ICON_SCALE;
  const h = bh * PORT_ICON_SCALE;
  const x = bx + (bw - w) / 2;
  const y = by + (bh - h) / 2;
  // Толщина обводки берётся от меньшей стороны, чтобы иконка оставалась пропорциональной.
  const stroke = Math.max(1, Math.min(w, h) * 0.10);
  // Координаты «фиксатора» — выступ сверху по центру: 40% ширины, 18% высоты.
  const clipW = w * 0.40;
  const clipH = h * 0.18;
  const cx = x + w / 2;
  const clipX = cx - clipW / 2;
  const bodyTop = y + clipH;
  const bodyH = h - clipH;
  // Силуэт RJ45: фиксатор сверху + основной прямоугольник корпуса.
  const path = [
    `M ${clipX} ${y}`,
    `L ${clipX + clipW} ${y}`,
    `L ${clipX + clipW} ${bodyTop}`,
    `L ${x + w} ${bodyTop}`,
    `L ${x + w} ${y + h}`,
    `L ${x} ${y + h}`,
    `L ${x} ${bodyTop}`,
    `L ${clipX} ${bodyTop}`,
    'Z',
  ].join(' ');
  // 4 пина — строго симметричны относительно вертикальной оси корпуса.
  const pinAreaW = w * 0.64;            // ширина зоны пинов = 64% от ширины корпуса
  const pinAreaX = cx - pinAreaW / 2;   // центрирована
  const pinW = pinAreaW * 0.13;
  const pinGap = (pinAreaW - 4 * pinW) / 3;
  const pinTop = bodyTop + bodyH * 0.42;
  const pinH = bodyH * 0.42;
  const pinColor = '#7a7a7a';
  const name = it?.name || extras.fallbackName || '—';
  const tooltipLines: string[] = [];
  tooltipLines.push(extras.detail ? `${name} · ${extras.detail}` : name);
  tooltipLines.push(`скорость: ${pal.label}`);
  if (it?.comment) tooltipLines.push(`comment: ${it.comment}`);
  if (it?.mac_address) tooltipLines.push(`mac: ${it.mac_address}`);
  // Внешний ободок порта — всегда серый, не меняется по статусу.
  // Цвет статуса/скорости отражает только внутренняя RJ45-иконка.
  const bezelR = Math.max(1, Math.min(bw, bh) * 0.08);
  const bezelStroke = Math.max(0.6, Math.min(bw, bh) * 0.06);
  return (
    <g>
      {/* Постоянный серый ободок (как «металл» вокруг разъёма) */}
      <rect
        x={bx + bezelStroke / 2}
        y={by + bezelStroke / 2}
        width={bw - bezelStroke}
        height={bh - bezelStroke}
        rx={bezelR}
        ry={bezelR}
        fill="#0a0a0a"
        stroke="#9ca3af"
        strokeWidth={bezelStroke}
      />
      {/* Стилизованная RJ45-иконка внутри — цвет берётся из палитры скоростей */}
      <path d={path} fill="#0a0a0a" stroke={pal.color} strokeWidth={stroke} strokeLinejoin="miter" />
      {[0, 1, 2, 3].map((i) => (
        <rect
          key={i}
          x={pinAreaX + i * (pinW + pinGap)}
          y={pinTop}
          width={pinW}
          height={pinH}
          fill={pinColor}
        />
      ))}
      <title>{tooltipLines.join('\n')}</title>
    </g>
  );
}

function sfpSvgPort(
  bx: number,
  by: number,
  bw: number,
  bh: number,
  it: InterfaceInfo | undefined,
  extras: PortIconExtras = {},
) {
  const pal = portPalette(it);
  const w = bw * PORT_ICON_SCALE;
  const h = bh * PORT_ICON_SCALE;
  const x = bx + (bw - w) / 2;
  const y = by + (bh - h) / 2;
  const stroke = Math.max(1, Math.min(w, h) * 0.10);
  // Прямоугольная клетка SFP без верхнего выступа, с двумя тёмными полосами по бокам.
  const sidebarW = w * 0.16;
  const name = it?.name || extras.fallbackName || '—';
  const tooltipLines: string[] = [];
  tooltipLines.push(extras.detail ? `${name} · ${extras.detail}` : `${name} · SFP`);
  tooltipLines.push(`скорость: ${pal.label}`);
  if (it?.comment) tooltipLines.push(`comment: ${it.comment}`);
  if (it?.mac_address) tooltipLines.push(`mac: ${it.mac_address}`);
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} fill="#0a0a0a" stroke={pal.color} strokeWidth={stroke} />
      <rect x={x + stroke / 2} y={y + stroke / 2} width={sidebarW} height={h - stroke} fill="#1f1f1f" />
      <rect x={x + w - sidebarW - stroke / 2} y={y + stroke / 2} width={sidebarW} height={h - stroke} fill="#1f1f1f" />
      <title>{tooltipLines.join('\n')}</title>
    </g>
  );
}

export default function DeviceMockup({ boardName, interfaces }: DeviceMockupProps) {
  if (isHapAcLite(boardName)) {
    return <HapAcLiteMockup interfaces={interfaces} />;
  }
  if (isHapAc2(boardName)) {
    return <HapAc2Mockup interfaces={interfaces} />;
  }
  if (isHapLike(boardName) && interfaces.filter((it) => /^ether/.test(it.name)).length === 5) {
    return <HapAcLiteMockup interfaces={interfaces} />;
  }
  if (isRb5009(boardName)) {
    return <Rb5009Mockup interfaces={interfaces} />;
  }
  if (isRb4011(boardName)) {
    return <Rb4011Mockup interfaces={interfaces} />;
  }
  if (isCrs317(boardName)) {
    return <Crs317Mockup interfaces={interfaces} />;
  }
  if (isHexS(boardName)) {
    return <HexSMockup interfaces={interfaces} />;
  }
  if (isL009(boardName)) {
    return <L009Mockup interfaces={interfaces} />;
  }
  if (isChr(boardName)) {
    return <ChrMockup interfaces={interfaces} />;
  }
  return (
    <div className="card text-sm text-mk-mute">
      Мокап для модели <span className="font-mono">{boardName || '—'}</span> ещё не подготовлен.
      Статусы интерфейсов смотрите во вкладке «Интерфейсы».
    </div>
  );
}

// --------- hAP ac lite ---------

function HapAcLiteMockup({ interfaces }: { interfaces: InterfaceInfo[] }) {
  const byName = new Map(interfaces.map((it) => [it.name, it]));
  // Раскладка портов: ether1 = Internet/PoE in, ether2..ether4 = LAN, ether5 = PoE out.
  const ports = [
    { name: 'ether1', label: 'Internet',         poe: 'in'  as const },
    { name: 'ether2', label: '2',                poe: null  as const },
    { name: 'ether3', label: '3',                poe: null  as const },
    { name: 'ether4', label: '4',                poe: null  as const },
    { name: 'ether5', label: '5',                poe: 'out' as const },
  ];

  // Размеры в условных единицах — масштабируются через viewBox.
  const W = 1180, H = 230;
  const bodyR = 14;
  const portW = 130, portH = 110;
  const firstPortX = 360;
  const portGap = 12;
  const portsTopY = 50;

  return (
    <div className="card">
      <div className="text-xs text-mk-mute mb-2">
        Лицевая панель <b>hAP ac lite</b> · подсветка портов в реальном времени
      </div>
      <div className="overflow-x-auto">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          xmlns="http://www.w3.org/2000/svg"
          style={{ height: '66px', width: 'auto', maxWidth: '100%', display: 'block' }}
        >
          {/* Корпус */}
          <rect x="2" y="2" width={W - 4} height={H - 4} rx={bodyR} ry={bodyR} fill="#5cb4e5" stroke="#3990c2" strokeWidth="2" />

          {/* Power разъём + подпись */}
          <text x="60" y="35" fontSize="20" fill="#ffffff" fontWeight="700">Power</text>
          <circle cx="60" cy="100" r="28" fill="#0a0a0a" stroke="#143d59" strokeWidth="3" />
          <circle cx="60" cy="100" r="9"  fill="#1a1a1a" stroke="#0a0a0a" strokeWidth="2" />
          <text x="60" y="180" fontSize="13" fill="#ffffff" textAnchor="middle">DC10-28V</text>

          {/* hAPaclite лого */}
          <text x="225" y="40" fontSize="34" fill="#ffffff" fontWeight="800" fontFamily="Inter, sans-serif">hAP</text>
          <text x="310" y="27" fontSize="13" fill="#ffffff" fontWeight="700">ac</text>
          <text x="310" y="42" fontSize="13" fill="#ffffff" fontWeight="700">lite</text>
          {/* WiFi-дуга над лого */}
          <path d="M 230 14 Q 260 -2 290 14" fill="none" stroke="#ffffff" strokeWidth="2.5" />

          {/* RES (кнопка с кругом и подписью WPS) */}
          <circle cx="160" cy="100" r="14" fill="none" stroke="#d04848" strokeWidth="3" />
          <circle cx="160" cy="100" r="4"  fill="#222" />
          <text x="160" y="78" fontSize="13" fill="#ffffff" textAnchor="middle" fontWeight="700">RES</text>
          <text x="160" y="135" fontSize="11" fill="#ffffff" textAnchor="middle">WPS</text>

          {/* PWR кнопка (квадрат) */}
          <text x="210" y="78" fontSize="13" fill="#ffffff" textAnchor="middle" fontWeight="700">PWR</text>
          <rect x="197" y="88" width="26" height="22" rx="3" fill="#444" stroke="#222" strokeWidth="2" />

          {/* USR светодиод */}
          <text x="260" y="78" fontSize="13" fill="#ffffff" textAnchor="middle" fontWeight="700">USR</text>
          <rect x="251" y="92" width="18" height="14" rx="2" fill="#1f6f1f" />

          {/* Тёмная полоса фоны для верхних/нижних лейблов */}
          <rect x="350" y="8"  width={W - 360} height="26" fill="#1c1c1c" />
          <rect x="350" y="178" width={W - 360} height="40" fill="#1c1c1c" />

          {/* Оранжевая зона PoE out над портом 5 */}
          <rect
            x={firstPortX + 4 * (portW + portGap) - 6}
            y="8"
            width={portW + 12}
            height="26"
            fill="#f0851a"
          />
          {/* Оранжевая зона PoE out внизу */}
          <rect
            x={firstPortX + 4 * (portW + portGap) - 6}
            y="178"
            width={portW + 12}
            height="40"
            fill="#f0851a"
          />

          {/* Порты */}
          {ports.map((p, i) => {
            const x = firstPortX + i * (portW + portGap);
            const it = findPort(interfaces, p.name);
            const detail =
              p.poe === 'in' ? `${p.label} · PoE in`
              : p.poe === 'out' ? `${p.label} · PoE out`
              : `LAN ${p.label}`;
            return (
              <g key={p.name}>
                {/* Верхний лейбл (Internet / 2 / 3 / 4 / 5) */}
                <text
                  x={x + portW / 2}
                  y="27"
                  fontSize="16"
                  fill="#ffffff"
                  fontWeight="700"
                  textAnchor="middle"
                >
                  {p.label}
                </text>

                {rj45SvgPort(x, portsTopY, portW, portH, it, { detail, fallbackName: p.name })}

                {/* Имя интерфейса под портом */}
                <text x={x + portW / 2} y={portsTopY + portH + 14} fontSize="11" fill="#ffffff" textAnchor="middle">{p.name}</text>
              </g>
            );
          })}

          {/* Нижние подписи: PoE in / LAN / PoE out */}
          <text x={firstPortX + portW / 2} y="202" fontSize="14" fill="#ffffff" textAnchor="middle" fontWeight="600">PoE in</text>
          <text x={firstPortX + portW + portGap + (portW * 3 + portGap * 2) / 2} y="202" fontSize="14" fill="#ffffff" textAnchor="middle" fontWeight="600">LAN</text>
          <text x={firstPortX + 4 * (portW + portGap) + portW / 2} y="202" fontSize="14" fill="#ffffff" textAnchor="middle" fontWeight="600">PoE out</text>
        </svg>
      </div>

      <MockupLegend />
    </div>
  );
}

// --------- hAP ac² ---------
// Чёрный пластиковый корпус (RBD52G-5HacD2HnD).
// Слева: DC 12-28V, утопленная кнопка res/wps, индикаторы pwr / usr.
// Справа: 5 GigE портов — ether1 «Internet/PoE in», ether2..ether5 «LAN».
// PoE-out нет (в отличие от hAP ac lite).

function HapAc2Mockup({ interfaces }: { interfaces: InterfaceInfo[] }) {
  const ports = [
    { name: 'ether1', label: '1', accent: 'poe-in' as const },
    { name: 'ether2', label: '2', accent: null     as const },
    { name: 'ether3', label: '3', accent: null     as const },
    { name: 'ether4', label: '4', accent: null     as const },
    { name: 'ether5', label: '5', accent: null     as const },
  ];

  // Соотношение фото задней панели ~4.3:1. При height: 62px ширина ≈ 268px.
  const W = 1180, H = 274;
  const bodyR = 20;
  const portW = 130, portH = 130;
  const portGap = 14;
  const firstPortX = 410;
  const portsTopY = 60;
  const lanStartX = firstPortX + portW + portGap;
  const lanSpanW = 4 * portW + 3 * portGap;

  return (
    <div className="card">
      <div className="text-xs text-mk-mute mb-2">
        Лицевая панель <b>hAP ac²</b> · подсветка портов в реальном времени
      </div>
      <div className="overflow-x-auto">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          xmlns="http://www.w3.org/2000/svg"
          style={{ height: '62px', width: 'auto', maxWidth: '100%', display: 'block' }}
        >
          {/* Чёрный пластиковый корпус */}
          <rect x="2" y="2" width={W - 4} height={H - 4} rx={bodyR} ry={bodyR} fill="#1f1f1f" stroke="#050505" strokeWidth="2" />
          {/* Утопленная плашка отсека (чуть темнее, со внутренней тенью обводки) */}
          <rect x="20" y="22" width={W - 40} height={H - 64} rx="12" fill="#161616" stroke="#000" strokeWidth="1" />

          {/* DC разъём */}
          <circle cx="92" cy="148" r="36" fill="#0a0a0a" stroke="#3a3a3a" strokeWidth="3" />
          <circle cx="92" cy="148" r="10" fill="#1a1a1a" stroke="#000" strokeWidth="2" />
          <text x="92" y="235" fontSize="22" fill="#ffffff" textAnchor="middle" fontWeight="700">DC</text>
          <text x="92" y="256" fontSize="14" fill="#cccccc" textAnchor="middle">12-28V</text>

          {/* res/wps — утопленная кнопка */}
          <circle cx="188" cy="148" r="10" fill="#0a0a0a" stroke="#555" strokeWidth="1.5" />
          <circle cx="188" cy="148" r="3"  fill="#222" />
          <text x="188" y="92" fontSize="14" fill="#ffffff" textAnchor="middle" fontWeight="600">res/wps</text>

          {/* pwr LED */}
          <circle cx="252" cy="148" r="5" fill="#1f6f1f" />
          <text x="252" y="92" fontSize="14" fill="#ffffff" textAnchor="middle" fontWeight="600">pwr</text>

          {/* usr LED */}
          <circle cx="312" cy="148" r="5" fill="#3a3a3a" />
          <text x="312" y="92" fontSize="14" fill="#ffffff" textAnchor="middle" fontWeight="600">usr</text>

          {/* Цифры над портами */}
          {ports.map((p, i) => {
            const x = firstPortX + i * (portW + portGap);
            return (
              <text
                key={`lbl-${p.name}`}
                x={x + portW / 2}
                y="48"
                fontSize="22"
                fill="#ffffff"
                fontWeight="700"
                textAnchor="middle"
              >
                {p.label}
              </text>
            );
          })}

          {/* Порты */}
          {ports.map((p, i) => {
            const x = firstPortX + i * (portW + portGap);
            const it = findPort(interfaces, p.name);
            const detail = p.accent === 'poe-in' ? `${p.label} · Internet / PoE in` : `LAN ${p.label}`;
            return (
              <g key={p.name}>
                {rj45SvgPort(x, portsTopY, portW, portH, it, { detail, fallbackName: p.name })}
                {/* Имя интерфейса под портом */}
                <text x={x + portW / 2} y={portsTopY + portH + 16} fontSize="11" fill="#bbbbbb" textAnchor="middle">
                  {p.name}
                </text>
              </g>
            );
          })}

          {/* Группа Internet/PoE in под портом 1 */}
          <line x1={firstPortX - 2} y1={H - 36} x2={firstPortX + portW + 2} y2={H - 36} stroke="#9aa0a6" strokeWidth="1.2" />
          <circle cx={firstPortX - 2} cy={H - 36} r="3" fill="#9aa0a6" />
          <circle cx={firstPortX + portW + 2} cy={H - 36} r="3" fill="#9aa0a6" />
          <text x={firstPortX + portW / 2} y={H - 14} fontSize="14" fill="#ffffff" textAnchor="middle" fontWeight="600">
            Internet/PoE in
          </text>

          {/* Группа LAN под портами 2-5 */}
          <line x1={lanStartX - 2} y1={H - 36} x2={lanStartX + lanSpanW + 2} y2={H - 36} stroke="#9aa0a6" strokeWidth="1.2" />
          <circle cx={lanStartX - 2} cy={H - 36} r="3" fill="#9aa0a6" />
          <circle cx={lanStartX + lanSpanW + 2} cy={H - 36} r="3" fill="#9aa0a6" />
          <text x={lanStartX + lanSpanW / 2} y={H - 14} fontSize="14" fill="#ffffff" textAnchor="middle" fontWeight="600">
            LAN
          </text>
        </svg>
      </div>
      <MockupLegend />
    </div>
  );
}

// --------- RB5009UG+S+ ---------
// Чёрный корпус, 8 GigE портов (ether1..ether8) + 1 SFP+ (sfp-sfpplus1).
// Слева: DC jack 12-57V, кнопка R (reset), USB 3.0 порт.
// ether1 — PoE in (жёлтая обводка), ether8 — 2.5GbE (синяя обводка), sfp-sfpplus1 — 10G.

function Rb5009Mockup({ interfaces }: { interfaces: InterfaceInfo[] }) {
  const byName = new Map(interfaces.map((it) => [it.name, it]));
  const W = 520, H = 66;
  const portW = 32, portH = 32, gap = 3;
  const portsY = (H - portH) / 2 - 1;
  const portsStartX = 132;
  const sfpW = 60;
  const sfp = findPort(interfaces, 'sfp-sfpplus1') || findPort(interfaces, 'sfpplus1');

  const ports = [
    { name: 'ether1', label: '1', accent: 'poe' as const  },
    { name: 'ether2', label: '2', accent: null  as const },
    { name: 'ether3', label: '3', accent: null  as const },
    { name: 'ether4', label: '4', accent: null  as const },
    { name: 'ether5', label: '5', accent: null  as const },
    { name: 'ether6', label: '6', accent: null  as const },
    { name: 'ether7', label: '7', accent: null  as const },
    { name: 'ether8', label: '8', accent: '2g5' as const  },
  ];

  const accentColor = (a: 'poe' | '2g5' | null) =>
    a === 'poe' ? '#f0851a' : a === '2g5' ? '#2563eb' : null;
  const sfpX = portsStartX + ports.length * (portW + gap) + 6;

  return (
    <div className="card">
      <div className="text-xs text-mk-mute mb-2">
        Лицевая панель <b>RB5009UG+S+</b> · подсветка портов в реальном времени
      </div>
      <div className="overflow-x-auto">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          xmlns="http://www.w3.org/2000/svg"
          style={{ width: `${W}px`, height: '66px', maxWidth: '100%', display: 'block' }}
          preserveAspectRatio="xMinYMid meet"
        >
          {/* Чёрный корпус */}
          <rect x="1" y="1" width={W - 2} height={H - 2} rx="4" fill="#1a1a1a" stroke="#3a3a3a" strokeWidth="1" />

          {/* DC jack */}
          <text x="14" y="9" fontSize="3.5" fill="#cccccc" fontWeight="700" textAnchor="middle">12-57V DC</text>
          <circle cx="14" cy="32" r="9" fill="#0a0a0a" stroke="#444" strokeWidth="0.8" />
          <circle cx="14" cy="32" r="3" fill="#222" />
          <text x="14" y="58" fontSize="3" fill="#888" textAnchor="middle">DC IN</text>

          {/* RES */}
          <text x="38" y="9" fontSize="4" fill="#cccccc" fontWeight="700" textAnchor="middle">R</text>
          <circle cx="38" cy="22" r="2.5" fill="none" stroke="#d04848" strokeWidth="0.8" />
          <circle cx="38" cy="22" r="1" fill="#222" />
          <text x="38" y="58" fontSize="3" fill="#888" textAnchor="middle">RES</text>

          {/* USB 3.0 */}
          <text x="72" y="9" fontSize="4" fill="#cccccc" fontWeight="700" textAnchor="middle">USB</text>
          <rect x="56" y="20" width="32" height="22" rx="1" fill="#0a0a0a" stroke="#666" strokeWidth="0.5" />
          <rect x="58" y="22" width="28" height="18" fill="#1a4b8c" />
          <rect x="66" y="26" width="12" height="6" fill="#0a0a0a" />
          <text x="72" y="58" fontSize="3" fill="#888" textAnchor="middle">USB 3.0</text>

          {/* PWR/USR LED */}
          <circle cx="104" cy="12" r="2" fill="#22c55e" />
          <text x="104" y="22" fontSize="3" fill="#888" textAnchor="middle">PWR</text>
          <circle cx="120" cy="12" r="2" fill="#1f6f1f" />
          <text x="120" y="22" fontSize="3" fill="#888" textAnchor="middle">USR</text>

          {/* Лейблы цифр над портами + полоса акцента (PoE/2.5G) */}
          {ports.map((p, i) => {
            const x = portsStartX + i * (portW + gap);
            const accent = accentColor(p.accent);
            return (
              <g key={`lbl-${p.name}`}>
                {accent && (
                  <rect x={x} y="1" width={portW} height="3" fill={accent} />
                )}
                <text x={x + portW / 2} y="10" fontSize="6" fill="#ffffff" fontWeight="800" textAnchor="middle">{p.label}</text>
              </g>
            );
          })}

          {/* Порты */}
          {ports.map((p, i) => {
            const x = portsStartX + i * (portW + gap);
            const it = findPort(interfaces, p.name);
            const detail =
              p.accent === 'poe' ? `порт ${p.label} · PoE in`
              : p.accent === '2g5' ? `порт ${p.label} · 2.5 GbE`
              : `порт ${p.label}`;
            return (
              <g key={p.name}>
                {rj45SvgPort(x, portsY, portW, portH, it, { detail, fallbackName: p.name })}
              </g>
            );
          })}

          {/* SFP+ слот */}
          {(() => {
            return (
              <g>
                <rect x={sfpX} y="1" width={sfpW} height="3" fill="#7c3aed" />
                <text x={sfpX + sfpW / 2} y="10" fontSize="6" fill="#ffffff" fontWeight="800" textAnchor="middle">SFP+</text>
                {sfpSvgPort(sfpX, portsY, sfpW, portH, sfp, { detail: '10 GbE SFP+', fallbackName: 'sfp-sfpplus1' })}
                <text x={sfpX + sfpW / 2} y={H - 2} fontSize="3.5" fill="#888" textAnchor="middle">10G SFP+</text>
              </g>
            );
          })()}

          {/* Подписи акцентов снизу */}
          <text x={portsStartX + portW / 2} y={H - 2} fontSize="3" fill="#f0851a" textAnchor="middle">PoE in</text>
          <text x={portsStartX + 7 * (portW + gap) + portW / 2} y={H - 2} fontSize="3" fill="#2563eb" textAnchor="middle">2.5G</text>
        </svg>
      </div>
      <MockupLegend />
    </div>
  );
}

// --------- RB4011iGS+ ---------
// Чёрный корпус 1U: слева RESET + PWR LED, затем SFP+ слот, 5 GigE портов (1-5, PoE-in 18-57V на ether1),
// центральная LED-матрица статусов (1-5 сверху, 6-10 снизу) и 5 GigE портов (6-10, PoE-out на ether10).

function Rb4011Mockup({ interfaces }: { interfaces: InterfaceInfo[] }) {
  const W = 500, H = 66;
  const portW = 32, portH = 32, gap = 3;
  const portsY = (H - portH) / 2 - 1;
  const sfpW = 50;
  const sfpX = 30;
  const group1StartX = sfpX + sfpW + 4;
  const ledBlockW = 24;
  const ledBlockGap = 4;
  const group2StartX =
    group1StartX + 5 * (portW + gap) - gap + ledBlockGap + ledBlockW + ledBlockGap;

  const sfp = findPort(interfaces, 'sfp-sfpplus1') || findPort(interfaces, 'sfpplus1');

  const portsLeft = [
    { name: 'ether1', label: '1' },
    { name: 'ether2', label: '2' },
    { name: 'ether3', label: '3' },
    { name: 'ether4', label: '4' },
    { name: 'ether5', label: '5' },
  ];
  const portsRight = [
    { name: 'ether6',  label: '6'  },
    { name: 'ether7',  label: '7'  },
    { name: 'ether8',  label: '8'  },
    { name: 'ether9',  label: '9'  },
    { name: 'ether10', label: '10' },
  ];

  return (
    <div className="card">
      <div className="text-xs text-mk-mute mb-2">
        Лицевая панель <b>RB4011iGS+</b> · подсветка портов в реальном времени
      </div>
      <div className="overflow-x-auto">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          xmlns="http://www.w3.org/2000/svg"
          style={{ width: `${W}px`, height: '66px', maxWidth: '100%', display: 'block' }}
          preserveAspectRatio="xMinYMid meet"
        >
          {/* Чёрный корпус */}
          <rect x="1" y="1" width={W - 2} height={H - 2} rx="4" fill="#1a1a1a" stroke="#3a3a3a" strokeWidth="1" />

          {/* RESET кнопка */}
          <circle cx="10" cy="24" r="3" fill="none" stroke="#d04848" strokeWidth="0.8" />
          <circle cx="10" cy="24" r="1.2" fill="#222" />
          <text x="10" y="44" fontSize="3.5" fill="#888" textAnchor="middle">RESET</text>

          {/* PWR LED */}
          <text x="22" y="20" fontSize="3.5" fill="#cccccc" fontWeight="700" textAnchor="middle">PWR</text>
          <circle cx="22" cy="26" r="1.6" fill="#22c55e" />

          {/* SFP+ слот */}
          {(() => {
            return (
              <g>
                <rect x={sfpX} y="1" width={sfpW} height="3" fill="#7c3aed" />
                <text x={sfpX + sfpW / 2} y="10" fontSize="5.5" fill="#ffffff" fontWeight="800" textAnchor="middle">SFP+</text>
                {sfpSvgPort(sfpX, portsY, sfpW, portH, sfp, { detail: '10 GbE SFP+', fallbackName: 'sfp-sfpplus1' })}
                <text x={sfpX + sfpW / 2} y={H - 2} fontSize="3.5" fill="#aaaaaa" textAnchor="middle">SFP+ 10G</text>
              </g>
            );
          })()}

          {/* Акцентная полоска PoE-in над ether1 */}
          <rect x={group1StartX} y="1" width={portW} height="3" fill="#f0851a" />

          {/* Лейблы цифр над портами 1-5 */}
          {portsLeft.map((p, i) => {
            const x = group1StartX + i * (portW + gap);
            return (
              <text key={`lbl-${p.name}`} x={x + portW / 2} y="10" fontSize="6" fill="#ffffff" fontWeight="800" textAnchor="middle">
                {p.label}
              </text>
            );
          })}
          {/* Порты 1-5 */}
          {portsLeft.map((p, i) => {
            const x = group1StartX + i * (portW + gap);
            const it = findPort(interfaces, p.name);
            const isPoeIn = i === 0;
            const detail = isPoeIn ? `порт ${p.label} · PoE in 18-57V` : `порт ${p.label}`;
            return (
              <g key={p.name}>
                {rj45SvgPort(x, portsY, portW, portH, it, { detail, fallbackName: p.name })}
              </g>
            );
          })}

          {/* Подпись группы 1-5 снизу */}
          <text
            x={group1StartX + (5 * (portW + gap) - gap) / 2}
            y={H - 2}
            fontSize="3.5"
            fill="#f0851a"
            textAnchor="middle"
            fontWeight="700"
          >
            PoE in 18-57V
          </text>

          {/* Центральная LED-матрица статусов */}
          {(() => {
            const lx = group1StartX + 5 * (portW + gap) - gap + ledBlockGap;
            const cy1 = portsY + 9;
            const cy2 = portsY + portH - 9;
            return (
              <g>
                <rect x={lx} y={portsY} width={ledBlockW} height={portH} rx="1.5" fill="#0a0a0a" stroke="#444" strokeWidth="0.4" />
                {[0, 1, 2, 3, 4].map((i) => {
                  const cx = lx + 3.5 + i * 4.2;
                  const top = findPort(interfaces, `ether${i + 1}`);
                  const bot = findPort(interfaces, `ether${i + 6}`);
                  const tp = portPalette(top);
                  const bp = portPalette(bot);
                  return (
                    <g key={`led-${i}`}>
                      <circle cx={cx} cy={cy1} r="1.3" fill={tp.color}>
                        <title>{`ether${i + 1}: ${tp.label}`}</title>
                      </circle>
                      <circle cx={cx} cy={cy2} r="1.3" fill={bp.color}>
                        <title>{`ether${i + 6}: ${bp.label}`}</title>
                      </circle>
                    </g>
                  );
                })}
              </g>
            );
          })()}

          {/* Акцентная полоска PoE-out над ether10 */}
          <rect x={group2StartX + 4 * (portW + gap)} y="1" width={portW} height="3" fill="#f0851a" />

          {/* Лейблы цифр над портами 6-10 */}
          {portsRight.map((p, i) => {
            const x = group2StartX + i * (portW + gap);
            return (
              <text key={`lbl-${p.name}`} x={x + portW / 2} y="10" fontSize="6" fill="#ffffff" fontWeight="800" textAnchor="middle">
                {p.label}
              </text>
            );
          })}
          {/* Порты 6-10 */}
          {portsRight.map((p, i) => {
            const x = group2StartX + i * (portW + gap);
            const it = findPort(interfaces, p.name);
            const isPoeOut = i === 4;
            const detail = isPoeOut ? `порт ${p.label} · PoE out` : `порт ${p.label}`;
            return (
              <g key={p.name}>
                {rj45SvgPort(x, portsY, portW, portH, it, { detail, fallbackName: p.name })}
              </g>
            );
          })}

          {/* Подпись группы 6-10 снизу */}
          <text
            x={group2StartX + (5 * (portW + gap) - gap) / 2}
            y={H - 2}
            fontSize="3.5"
            fill="#f0851a"
            textAnchor="middle"
            fontWeight="700"
          >
            PoE out
          </text>
        </svg>
      </div>
      <MockupLegend />
    </div>
  );
}

// --------- CRS317-1G-16S+ ---------
// Белый 1U-свич: 16 портов SFP+ в 4 группах по 4, над каждым портом пара
// светодиодов ACT и 10G. Справа: CONSOLE (RJ45), ETH/BOOT (Gigabit RJ45
// для управления = ether1), кнопка RESET и блок статусных LED (USR,
// FAULT, PWR2, PWR1). Имена SFP-портов в RouterOS — sfp-sfpplus1…16.

function Crs317Mockup({ interfaces }: { interfaces: InterfaceInfo[] }) {
  const W = 700, H = 66;
  const portW = 28, portH = 26, gap = 3;
  const groupGap = 8;
  const portsY = 28;
  const portsStartX = 78;

  // Управляющий Gigabit-порт ETH/BOOT = ether1. Допускаем альт-имена на случай переименования.
  const ethBoot =
    findPort(interfaces, 'ether1') ||
    findPort(interfaces, 'eth1') ||
    findPort(interfaces, 'boot');

  // Группа из 4 портов: индексы 0..3, 4..7, 8..11, 12..15. Между группами — groupGap.
  const xOf = (i: number) => portsStartX + i * (portW + gap) + Math.floor(i / 4) * groupGap;

  return (
    <div className="card">
      <div className="text-xs text-mk-mute mb-2">
        Лицевая панель <b>CRS317-1G-16S+</b> · подсветка портов в реальном времени
      </div>
      <div className="overflow-x-auto">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          xmlns="http://www.w3.org/2000/svg"
          style={{ width: `${W}px`, height: '66px', maxWidth: '100%', display: 'block' }}
          preserveAspectRatio="xMinYMid meet"
        >
          {/* Белый корпус */}
          <rect x="1" y="1" width={W - 2} height={H - 2} rx="3" fill="#f4f4f1" stroke="#bdbdb6" strokeWidth="1" />

          {/* Левая декоративная зона: 4 ряда вентиляционных решёток (по числу групп портов) */}
          {Array.from({ length: 4 }).map((_, gi) => {
            const gx = portsStartX + gi * (4 * (portW + gap) + groupGap) - 4;
            return (
              <g key={`vent-${gi}`} opacity="0.85">
                {Array.from({ length: 16 }).map((__, vi) => (
                  <rect
                    key={vi}
                    x={gx + vi * 7}
                    y={6}
                    width={4}
                    height={1.2}
                    fill="#8e8e88"
                  />
                ))}
              </g>
            );
          })}

          {/* Лейблы ACT / 10G над каждым портом + сами светодиоды */}
          {Array.from({ length: 16 }).map((_, i) => {
            const x = xOf(i);
            const it = findPort(interfaces, `sfp-sfpplus${i + 1}`)
                    || findPort(interfaces, `sfpplus${i + 1}`);
            const pal = portPalette(it);
            const isLink = !!it?.running;
            return (
              <g key={`leds-${i}`}>
                <text x={x + portW * 0.3} y="14" fontSize="3" fill="#444" textAnchor="middle" fontWeight="700">ACT</text>
                <text x={x + portW * 0.7} y="14" fontSize="3" fill="#444" textAnchor="middle" fontWeight="700">10G</text>
                {/* «коробочки» светодиодов: цвет по скорости линка */}
                <rect x={x + portW * 0.3 - 2.2} y={16} width={4.4} height={3.2} rx={0.5}
                      fill={isLink ? pal.color : '#dadad4'} stroke="#9c9c95" strokeWidth="0.3" />
                <rect x={x + portW * 0.7 - 2.2} y={16} width={4.4} height={3.2} rx={0.5}
                      fill={isLink ? pal.color : '#dadad4'} stroke="#9c9c95" strokeWidth="0.3" />
              </g>
            );
          })}

          {/* SFP+ слоты (16 шт.) */}
          {Array.from({ length: 16 }).map((_, i) => {
            const x = xOf(i);
            const it = findPort(interfaces, `sfp-sfpplus${i + 1}`)
                    || findPort(interfaces, `sfpplus${i + 1}`);
            return (
              <g key={`sfp-${i}`}>
                {sfpSvgPort(x, portsY, portW, portH, it, { detail: `SFP+${i + 1} · 10 GbE`, fallbackName: `sfp-sfpplus${i + 1}` })}
                {/* Подпись «SFP+ i» под портом */}
                <text x={x + portW / 2} y={H - 4} fontSize="3.5" fill="#555" textAnchor="middle" fontWeight="700">
                  SFP+{i + 1}
                </text>
              </g>
            );
          })}

          {/* Правая колонка: CONSOLE, ETH/BOOT, RESET, статусные LED, лого */}
          {(() => {
            const rightX = portsStartX + 16 * (portW + gap) + 3 * groupGap + 6;
            const consoleY = 18;
            const ethY = 38;
            return (
              <g>
                {/* CONSOLE — RJ45 для serial */}
                <text x={rightX + 12} y="14" fontSize="3.5" fill="#444" textAnchor="middle" fontWeight="700">CONSOLE</text>
                <rect x={rightX} y={consoleY} width="24" height="14" rx="1.5" fill="#c8c8c8" stroke="#666" strokeWidth="0.5" />
                <rect x={rightX + 4} y={consoleY + 3} width="16" height="8" fill="#0a0a0a" />
                <rect x={rightX + 8} y={consoleY + 6} width="8" height="2.5" fill="#222" />

                {/* ETH/BOOT — управляющий Gigabit (ether1) */}
                <text x={rightX + 12} y={ethY - 2} fontSize="3.5" fill="#444" textAnchor="middle" fontWeight="700">ETH/BOOT</text>
                {rj45SvgPort(rightX, ethY, 24, 20, ethBoot, { detail: 'ETH/BOOT (Gigabit, management)', fallbackName: 'ether1' })}

                {/* RESET — утопленная кнопка */}
                <circle cx={rightX + 38} cy={ethY + 10} r="2.6" fill="none" stroke="#888" strokeWidth="0.6" />
                <circle cx={rightX + 38} cy={ethY + 10} r="0.8" fill="#444" />
                <text x={rightX + 38} y={H - 4} fontSize="3.5" fill="#555" textAnchor="middle" fontWeight="700">RESET</text>

                {/* Блок статусных LED справа */}
                {(() => {
                  const lx = rightX + 50;
                  const labels = [
                    { name: 'USR',   color: '#f5d600' },
                    { name: 'FAULT', color: '#d04848' },
                    { name: 'PWR 2', color: '#22c55e' },
                    { name: 'PWR 1', color: '#22c55e' },
                  ];
                  return (
                    <g>
                      {labels.map((l, idx) => (
                        <g key={l.name}>
                          <circle cx={lx} cy={10 + idx * 11} r="2" fill={l.color} stroke="#7a7a72" strokeWidth="0.3" />
                          <text x={lx + 5} y={11.5 + idx * 11} fontSize="3.5" fill="#444" fontWeight="700">{l.name}</text>
                        </g>
                      ))}
                    </g>
                  );
                })()}

                {/* Лого + название модели — справа сверху, как на корпусе */}
                <text x={W - 8} y={18} fontSize="9" fill="#222" textAnchor="end" fontWeight="800" fontFamily="Inter, sans-serif">
                  Cloud Router Switch
                </text>
                <text x={W - 8} y={28} fontSize="5.5" fill="#444" textAnchor="end" fontFamily="Inter, sans-serif" letterSpacing="1">
                  CRS 317-1G-16S+
                </text>
                <text x={W - 8} y={H - 4} fontSize="6" fill="#1a1a1a" textAnchor="end" fontWeight="900" fontFamily="Inter, sans-serif">
                  MikroTik
                </text>
              </g>
            );
          })()}
        </svg>
      </div>
      <MockupLegend />
    </div>
  );
}

// --------- CHR (Cloud Hosted Router) ---------
// Виртуальная машина MikroTik — нет физической панели.
// Простой белый прямоугольник: слева лейбл «CHR», справа порты ether* в ряд.
// Количество портов — динамическое (сколько отдало устройство).

function ChrMockup({ interfaces }: { interfaces: InterfaceInfo[] }) {
  const ports = interfaces
    .filter((it) => /^ether/i.test(it.name))
    .sort((a, b) => {
      const ai = parseInt(a.name.replace(/\D/g, ''), 10) || 0;
      const bi = parseInt(b.name.replace(/\D/g, ''), 10) || 0;
      return ai - bi;
    });

  // Фиксированные размеры: 500×66 px. SVG в viewBox 1:1 пикселям, scale=1.
  // Порты 30×32 px начинаются после блока «mikrotik» слева, если все не помещаются —
  // их можно прокрутить горизонтально через overflow-x-auto обёртки.
  const W = 500;
  const H = 66;
  const padX = 6;
  const labelW = 92;
  const gap = 4;
  const portW = 30;
  const portH = 32;
  const portsY = (H - portH) / 2 - 2;
  const portsStartX = padX + labelW + 6;

  return (
    <div className="card">
      <div className="text-xs text-mk-mute mb-2">
        Виртуальный роутер <b>MikroTik CHR</b> · подсветка портов в реальном времени
      </div>
      <div className="overflow-x-auto">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          xmlns="http://www.w3.org/2000/svg"
          style={{ width: '500px', height: '66px', maxWidth: '100%', display: 'block' }}
          preserveAspectRatio="xMinYMid meet"
        >
          {/* Белый фон-корпус */}
          <rect x="1" y="1" width={W - 2} height={H - 2} rx="6" fill="#ffffff" stroke="#cccccc" strokeWidth="1" />

          {/* Лейбл mikrotik слева (шрифт в 2 раза мельче) */}
          <text x={padX} y={H / 2} fontSize="14" fill="#1a1a1a" fontWeight="800" fontFamily="Inter, sans-serif">mikrotik</text>
          <text x={padX} y={H / 2 + 12} fontSize="6" fill="#666666">Cloud Hosted Router</text>

          {/* Разделитель */}
          <line x1={padX + labelW - 4} y1="8" x2={padX + labelW - 4} y2={H - 8} stroke="#dddddd" strokeWidth="1" />

          {/* Порты */}
          {ports.length === 0 && (
            <text x={portsStartX + 10} y={H / 2 + 3} fontSize="7" fill="#888888">нет интерфейсов ether*</text>
          )}
          {ports.map((it, i) => {
            const x = portsStartX + i * (portW + gap);
            const pal = portPalette(it);
            // Короткий лейбл — только номер порта (ether7 → "7").
            const num = (it.name.match(/(\d+)$/) || [, it.name])[1];
            return (
              <g key={it.name}>
                {rj45SvgPort(x, portsY, portW, portH, it, { detail: it.type || 'virtual', fallbackName: it.name })}
                {/* Номер порта над иконкой */}
                <text
                  x={x + portW / 2}
                  y={portsY - 2}
                  fontSize="8"
                  fill={pal.color}
                  fontWeight="700"
                  textAnchor="middle"
                  fontFamily="monospace"
                >
                  {num}
                </text>
                {/* Имя интерфейса под портом */}
                <text
                  x={x + portW / 2}
                  y={portsY + portH + 8}
                  fontSize="5"
                  fill="#888888"
                  textAnchor="middle"
                  fontFamily="monospace"
                >
                  {it.name}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      <MockupLegend />
    </div>
  );
}

// --------- hEX S (RB760iGS) ---------
// Тёмно-серый корпус, Power DC + лого, SFP, 5 GigE портов.
// ether1 = INTERNET / PoE in, ether2-4 = LAN, ether5 = PoE out (оранжевый), sfp1.

function HexSMockup({ interfaces }: { interfaces: InterfaceInfo[] }) {
  const byName = new Map(interfaces.map((it) => [it.name, it]));
  const W = 320, H = 66;
  const padX = 4;
  const portW = 32, portH = 32, gap = 3;
  const portsY = (H - portH) / 2 - 1;
  const portsStartX = 96;
  const sfp = findPort(interfaces, 'sfp1') || findPort(interfaces, 'sfp-sfpplus1');

  const ports = [
    { name: 'ether1', label: '1', accent: 'poe-in'  as const },
    { name: 'ether2', label: '2', accent: null      as const },
    { name: 'ether3', label: '3', accent: null      as const },
    { name: 'ether4', label: '4', accent: null      as const },
    { name: 'ether5', label: '5', accent: 'poe-out' as const },
  ];

  return (
    <div className="card">
      <div className="text-xs text-mk-mute mb-2">
        Лицевая панель <b>hEX S</b> · подсветка портов в реальном времени
      </div>
      <div className="overflow-x-auto">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          xmlns="http://www.w3.org/2000/svg"
          style={{ width: `${W}px`, height: '66px', maxWidth: '100%', display: 'block' }}
          preserveAspectRatio="xMinYMid meet"
        >
          {/* Корпус тёмно-серый */}
          <rect x="1" y="1" width={W - 2} height={H - 2} rx="4" fill="#3a3f47" stroke="#1f2227" strokeWidth="1" />

          {/* Power разъём + подпись */}
          <text x="14" y="13" fontSize="5" fill="#dddddd" fontWeight="700">Power</text>
          <circle cx="14" cy="32" r="7" fill="#0a0a0a" stroke="#222" strokeWidth="0.8" />
          <circle cx="14" cy="32" r="2.2" fill="#222" />
          <text x="14" y="48" fontSize="4" fill="#aaaaaa" textAnchor="middle">12-57V DC</text>

          {/* hEX s лого */}
          <text x="44" y="14" fontSize="11" fill="#ffffff" fontWeight="900" fontFamily="Inter, sans-serif">hEX</text>
          <text x="68" y="11" fontSize="5" fill="#ffffff" fontWeight="700">s</text>

          {/* SFP слот */}
          {sfpSvgPort(42, 22, 28, 22, sfp, { detail: 'SFP · Internet', fallbackName: 'sfp1' })}
          <text x="56" y="52" fontSize="4" fill="#aaaaaa" textAnchor="middle">SFP</text>
          <text x="56" y="58" fontSize="4" fill="#888888" textAnchor="middle" fontStyle="italic">INTERNET</text>

          {/* Passive/af/at подпись над портом 1 */}
          <rect x={portsStartX - 1} y="3" width={portW + 2} height="8" rx="2" fill="#1f2227" stroke="#555" strokeWidth="0.4" />
          <text x={portsStartX + portW / 2} y="9" fontSize="4" fill="#dddddd" fontWeight="700" textAnchor="middle">Passive/af/at</text>

          {/* Оранжевая зона над/под портом 5 (PoE out) */}
          <rect x={portsStartX + 4 * (portW + gap) - 1} y="0" width={portW + 2} height="12" fill="#f0851a" />
          <rect x={portsStartX + 4 * (portW + gap) - 1} y={H - 8} width={portW + 2} height="8" fill="#f0851a" />

          {/* Лейблы цифр над портами 2-5 */}
          {ports.slice(1).map((p, idx) => {
            const i = idx + 1;
            const x = portsStartX + i * (portW + gap);
            return (
              <text key={p.label} x={x + portW / 2} y="9" fontSize="6" fill="#ffffff" fontWeight="800" textAnchor="middle">
                {p.label}
              </text>
            );
          })}

          {/* Порты */}
          {ports.map((p, i) => {
            const x = portsStartX + i * (portW + gap);
            const it = findPort(interfaces, p.name);
            const detail =
              p.accent === 'poe-in' ? `порт ${p.label} · PoE in`
              : p.accent === 'poe-out' ? `порт ${p.label} · PoE out`
              : `порт ${p.label}`;
            return (
              <g key={p.name}>
                {rj45SvgPort(x, portsY, portW, portH, it, { detail, fallbackName: p.name })}
              </g>
            );
          })}

          {/* Нижние подписи */}
          <text x={portsStartX + portW / 2} y={H - 2} fontSize="3.5" fill="#dddddd" textAnchor="middle">PoE in</text>
          <text x={portsStartX + (portW + gap) + (3 * (portW + gap) - gap) / 2} y={H - 2} fontSize="3.5" fill="#aaaaaa" textAnchor="middle">LAN</text>
          <text x={portsStartX + 4 * (portW + gap) + portW / 2} y={H - 2} fontSize="3.5" fill="#ffffff" textAnchor="middle" fontWeight="700">PoE out</text>
        </svg>
      </div>
      <MockupLegend />
    </div>
  );
}

// --------- L009 (L009UiGS-RM) ---------
// Красный 19" rack: RES, DC 24-56V, SFP, USB 3.0, 8 GigE портов.
// ether1 = PoE in, ether8 = PoE out (оранжевый), sfp1.

function L009Mockup({ interfaces }: { interfaces: InterfaceInfo[] }) {
  const byName = new Map(interfaces.map((it) => [it.name, it]));
  const W = 480, H = 66;
  const portW = 36, portH = 32, gap = 3;
  const portsY = (H - portH) / 2 - 1;
  // Слева до портов: RES + DC + SFP + USB ≈ 110px
  const portsStartX = 116;
  // Между ether4 и ether5 — небольшой визуальный разрыв
  const groupGap = 8;
  const sfp = findPort(interfaces, 'sfp1');

  const ports = [
    { name: 'ether1', label: '1', accent: 'poe-in'  as const },
    { name: 'ether2', label: '2', accent: null      as const },
    { name: 'ether3', label: '3', accent: null      as const },
    { name: 'ether4', label: '4', accent: null      as const },
    { name: 'ether5', label: '5', accent: null      as const },
    { name: 'ether6', label: '6', accent: null      as const },
    { name: 'ether7', label: '7', accent: null      as const },
    { name: 'ether8', label: '8', accent: 'poe-out' as const },
  ];

  const xOf = (i: number) => portsStartX + i * (portW + gap) + (i >= 4 ? groupGap : 0);

  return (
    <div className="card">
      <div className="text-xs text-mk-mute mb-2">
        Лицевая панель <b>L009UiGS</b> · подсветка портов в реальном времени
      </div>
      <div className="overflow-x-auto">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          xmlns="http://www.w3.org/2000/svg"
          style={{ width: `${W}px`, height: '66px', maxWidth: '100%', display: 'block' }}
          preserveAspectRatio="xMinYMid meet"
        >
          {/* Красный корпус */}
          <rect x="1" y="1" width={W - 2} height={H - 2} rx="4" fill="#c92020" stroke="#7a1010" strokeWidth="1" />

          {/* RES кнопка */}
          <text x="10" y="9" fontSize="4" fill="#ffffff" fontWeight="700" textAnchor="middle">RES</text>
          <circle cx="10" cy="22" r="2.2" fill="none" stroke="#ffffff" strokeWidth="0.8" />
          <circle cx="10" cy="22" r="0.9" fill="#222" />
          {/* power led */}
          <text x="10" y="58" fontSize="3" fill="#ffffff" textAnchor="middle">⏻</text>

          {/* DC разъём */}
          <text x="28" y="9" fontSize="3.5" fill="#ffffff" textAnchor="middle">24-56 V DC</text>
          <circle cx="28" cy="32" r="9" fill="#0a0a0a" stroke="#5a0a0a" strokeWidth="1" />
          <circle cx="28" cy="32" r="3" fill="#222" />
          <text x="28" y="58" fontSize="3" fill="#ffffff" textAnchor="middle">⊖-⊙-⊕</text>

          {/* SFP слот */}
          <text x="60" y="9" fontSize="4" fill="#ffffff" fontWeight="700" textAnchor="middle">SFP</text>
          {sfpSvgPort(48, 16, 24, 32, sfp, { detail: 'SFP', fallbackName: 'sfp1' })}
          <text x="60" y="58" fontSize="3" fill="#ffffff" textAnchor="middle">SFP</text>

          {/* USB 3.0 */}
          <text x="92" y="9" fontSize="4" fill="#ffffff" fontWeight="700" textAnchor="middle">USB</text>
          <rect x="78" y="20" width="28" height="22" rx="1" fill="#0a0a0a" stroke="#888" strokeWidth="0.5" />
          <rect x="80" y="22" width="24" height="18" fill="#1a4b8c" />
          <rect x="88" y="26" width="8" height="6" fill="#0a0a0a" />
          <text x="92" y="58" fontSize="3" fill="#ffffff" textAnchor="middle">USB 3.0</text>

          {/* Оранжевая зона над/под портом 8 (PoE out) */}
          <rect x={xOf(7) - 1} y="0" width={portW + 2} height="11" fill="#f0851a" />
          <rect x={xOf(7) - 1} y={H - 8} width={portW + 2} height="8" fill="#f0851a" />

          {/* Лейблы цифр над портами */}
          {ports.map((p, i) => (
            <text key={p.label} x={xOf(i) + portW / 2} y="8" fontSize="5.5" fill="#ffffff" fontWeight="800" textAnchor="middle">
              {p.label}
            </text>
          ))}

          {/* Порты */}
          {ports.map((p, i) => {
            const x = xOf(i);
            const it = findPort(interfaces, p.name);
            const detail =
              p.accent === 'poe-in' ? `порт ${p.label} · PoE in`
              : p.accent === 'poe-out' ? `порт ${p.label} · PoE out`
              : `порт ${p.label}`;
            return (
              <g key={p.name}>
                {rj45SvgPort(x, portsY, portW, portH, it, { detail, fallbackName: p.name })}
              </g>
            );
          })}

          {/* Нижние подписи скоростей */}
          <text x={xOf(0) + portW / 2} y={H - 2} fontSize="3.5" fill="#ffffff" textAnchor="middle" fontWeight="700">PoE in</text>
          <text x={xOf(7) + portW / 2} y={H - 2} fontSize="3.5" fill="#ffffff" textAnchor="middle" fontWeight="700">PoE out</text>
        </svg>
      </div>
      <MockupLegend />
    </div>
  );
}

// Общая мини-легенда для физических мокапов — цветомаркировка скоростей.
const SPEED_LEGEND: { color: string; label: string }[] = [
  { color: '#9ca3af', label: 'no link' },
  { color: '#166534', label: '10 Mb/s' },
  { color: '#14b8a6', label: '100 Mb/s' },
  { color: '#22c55e', label: '1 Gb/s' },
  { color: '#a855f7', label: '10 Gb/s' },
];

function MockupLegend() {
  return (
    <div className="flex flex-wrap items-center gap-3 mt-2 text-[10px] text-mk-mute">
      {SPEED_LEGEND.map((s) => (
        <span key={s.label} className="inline-flex items-center gap-1">
          <span
            className="inline-block w-3 h-3 rounded-sm border-2"
            style={{ borderColor: s.color, backgroundColor: '#0a0a0a' }}
          />
          {s.label}
        </span>
      ))}
    </div>
  );
}
