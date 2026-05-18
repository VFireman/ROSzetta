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

// Найти интерфейс по базовому имени, допуская суффиксы вида `ether1-Uztelecom`,
// `ether2_LAN`, `ether3 description` и т.п. Сначала пробуем точное совпадение, потом по префиксу.
function findPort(interfaces: InterfaceInfo[], baseName: string): InterfaceInfo | undefined {
  const exact = interfaces.find((x) => x.name === baseName);
  if (exact) return exact;
  const re = new RegExp(`^${baseName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([\\s\\-_.:]|$)`, 'i');
  return interfaces.find((x) => re.test(x.name));
}

// Цвета порта по статусу.
function portColor(it: InterfaceInfo | undefined): { fill: string; stroke: string; label: string } {
  if (!it)                  return { fill: '#0c0c0c', stroke: '#3a3a3a', label: 'нет данных' };
  if (it.disabled)          return { fill: '#1a1a1a', stroke: '#5b5b5b', label: 'отключён' };
  if (it.running)           return { fill: '#0a3a14', stroke: '#22c55e', label: 'up' };
  return                          { fill: '#1a1a1a', stroke: '#ef4444', label: 'down' };
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
            const col = portColor(it);
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

                {/* Корпус порта (металлический ободок) */}
                <rect x={x} y={portsTopY} width={portW} height={portH} rx="6" fill="#d4d4d4" stroke="#888" strokeWidth="1.5" />
                {/* Внутренний экран порта */}
                <rect x={x + 8} y={portsTopY + 8} width={portW - 16} height={portH - 16} rx="3" fill={col.fill} stroke={col.stroke} strokeWidth="3" />
                {/* RJ45 «зубчики» */}
                <rect x={x + 24} y={portsTopY + 14} width={portW - 48} height="14" fill="#000" />
                <rect x={x + 30} y={portsTopY + 28} width={portW - 60} height="8"  fill="#000" />
                {/* LED-индикатор (точка) */}
                <circle
                  cx={x + portW - 18}
                  cy={portsTopY + portH - 16}
                  r="4"
                  fill={it?.running ? '#22c55e' : it?.disabled ? '#777' : '#5a1a1a'}
                />
                {/* Имя интерфейса под портом для понятности */}
                <text x={x + portW / 2} y={portsTopY + portH - 6} fontSize="10" fill="#999" textAnchor="middle">{p.name}</text>

                {/* Тултип через <title> */}
                <title>
                  {p.name} ({p.label}){p.poe === 'in' ? ' · PoE in' : p.poe === 'out' ? ' · PoE out' : ''}
                  {'\n'}статус: {col.label}
                  {it?.comment ? `\ncomment: ${it.comment}` : ''}
                  {it?.mac_address ? `\nmac: ${it.mac_address}` : ''}
                </title>
              </g>
            );
          })}

          {/* Нижние подписи: PoE in / LAN / PoE out */}
          <text x={firstPortX + portW / 2} y="202" fontSize="14" fill="#ffffff" textAnchor="middle" fontWeight="600">PoE in</text>
          <text x={firstPortX + portW + portGap + (portW * 3 + portGap * 2) / 2} y="202" fontSize="14" fill="#ffffff" textAnchor="middle" fontWeight="600">LAN</text>
          <text x={firstPortX + 4 * (portW + portGap) + portW / 2} y="202" fontSize="14" fill="#ffffff" textAnchor="middle" fontWeight="600">PoE out</text>
        </svg>
      </div>

      {/* Легенда */}
      <div className="flex flex-wrap items-center gap-4 mt-3 text-xs text-mk-mute">
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded-sm bg-mk-ok/30 ring-1 ring-mk-ok" /> up (running)
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded-sm bg-mk-err/10 ring-1 ring-mk-err" /> down
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded-sm bg-mk-panel2 ring-1 ring-mk-mute" /> disabled / нет данных
        </span>
      </div>
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
            const col = portColor(it);
            return (
              <g key={p.name}>
                {/* Металлический ободок RJ45 */}
                <rect x={x} y={portsTopY} width={portW} height={portH} rx="6" fill="#c8c8c8" stroke="#666" strokeWidth="1.5" />
                {/* Внутренний экран — закрашивается под статус */}
                <rect x={x + 8} y={portsTopY + 8} width={portW - 16} height={portH - 16} rx="3" fill={col.fill} stroke={col.stroke} strokeWidth="3" />
                {/* RJ45 «зубчики» */}
                <rect x={x + 24} y={portsTopY + 16} width={portW - 48} height="18" fill="#000" />
                <rect x={x + 32} y={portsTopY + 34} width={portW - 64} height="10" fill="#000" />
                {/* LED-индикатор линка */}
                <circle
                  cx={x + portW - 18}
                  cy={portsTopY + portH - 18}
                  r="5"
                  fill={it?.running ? '#22c55e' : it?.disabled ? '#777' : '#5a1a1a'}
                />
                {/* Имя интерфейса под портом — мелким шрифтом, чтобы не сливалось с подписями групп */}
                <text x={x + portW / 2} y={portsTopY + portH + 16} fontSize="11" fill="#888" textAnchor="middle">
                  {p.name}
                </text>
                <title>
                  {p.name} (порт {p.label}){p.accent === 'poe-in' ? ' · Internet / PoE in' : ' · LAN'}
                  {'\n'}статус: {col.label}
                  {it?.comment ? `\ncomment: ${it.comment}` : ''}
                  {it?.mac_address ? `\nmac: ${it.mac_address}` : ''}
                </title>
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
            const col = portColor(it);
            return (
              <g key={p.name}>
                <rect x={x} y={portsY} width={portW} height={portH} rx="2" fill="#c8c8c8" stroke="#666" strokeWidth="0.5" />
                <rect x={x + 2} y={portsY + 2} width={portW - 4} height={portH - 4} rx="1" fill={col.fill} stroke={col.stroke} strokeWidth="1.5" />
                <rect x={x + 6} y={portsY + 4} width={portW - 12} height="5" fill="#000" />
                <circle cx={x + portW - 4} cy={portsY + portH - 4} r="1.3" fill={it?.running ? '#22c55e' : it?.disabled ? '#777' : '#5a1a1a'} />
                <title>
                  {p.name} (порт {p.label})
                  {p.accent === 'poe' ? ' · PoE in' : ''}
                  {p.accent === '2g5' ? ' · 2.5 GbE' : ''}
                  {'\n'}статус: {col.label}
                  {it?.comment ? `\ncomment: ${it.comment}` : ''}
                  {it?.mac_address ? `\nmac: ${it.mac_address}` : ''}
                </title>
              </g>
            );
          })}

          {/* SFP+ слот */}
          {(() => {
            const col = portColor(sfp);
            return (
              <g>
                <rect x={sfpX} y="1" width={sfpW} height="3" fill="#7c3aed" />
                <text x={sfpX + sfpW / 2} y="10" fontSize="6" fill="#ffffff" fontWeight="800" textAnchor="middle">SFP+</text>
                <rect x={sfpX} y={portsY} width={sfpW} height={portH} rx="2" fill="#1a1a1a" stroke="#666" strokeWidth="0.5" />
                <rect x={sfpX + 3} y={portsY + 3} width={sfpW - 6} height={portH - 6} rx="1" fill={col.fill} stroke={col.stroke} strokeWidth="1.5" />
                <rect x={sfpX + 3} y={portsY + 3} width="4" height={portH - 6} fill="#0a0a0a" />
                <rect x={sfpX + sfpW - 7} y={portsY + 3} width="4" height={portH - 6} fill="#0a0a0a" />
                <circle cx={sfpX + sfpW - 5} cy={portsY + portH - 4} r="1.3" fill={sfp?.running ? '#22c55e' : sfp?.disabled ? '#777' : '#5a1a1a'} />
                <text x={sfpX + sfpW / 2} y={H - 2} fontSize="3.5" fill="#888" textAnchor="middle">10G SFP+</text>
                <title>
                  sfp-sfpplus1 · 10 GbE SFP+
                  {'\n'}статус: {col.label}
                  {sfp?.comment ? `\ncomment: ${sfp.comment}` : ''}
                </title>
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
            const col = portColor(sfp);
            return (
              <g>
                <rect x={sfpX} y="1" width={sfpW} height="3" fill="#7c3aed" />
                <text x={sfpX + sfpW / 2} y="10" fontSize="5.5" fill="#ffffff" fontWeight="800" textAnchor="middle">SFP+</text>
                <rect x={sfpX} y={portsY} width={sfpW} height={portH} rx="2" fill="#1a1a1a" stroke="#666" strokeWidth="0.5" />
                <rect x={sfpX + 3} y={portsY + 3} width={sfpW - 6} height={portH - 6} rx="1" fill={col.fill} stroke={col.stroke} strokeWidth="1.5" />
                <rect x={sfpX + 3} y={portsY + 3} width="4" height={portH - 6} fill="#0a0a0a" />
                <rect x={sfpX + sfpW - 7} y={portsY + 3} width="4" height={portH - 6} fill="#0a0a0a" />
                <circle cx={sfpX + sfpW - 5} cy={portsY + portH - 4} r="1.3" fill={sfp?.running ? '#22c55e' : sfp?.disabled ? '#777' : '#5a1a1a'} />
                <text x={sfpX + sfpW / 2} y={H - 2} fontSize="3.5" fill="#aaaaaa" textAnchor="middle">SFP+ 10G</text>
                <title>
                  sfp-sfpplus1 · 10 GbE SFP+
                  {'\n'}статус: {col.label}
                  {sfp?.comment ? `\ncomment: ${sfp.comment}` : ''}
                </title>
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
            const col = portColor(it);
            const isPoeIn = i === 0;
            return (
              <g key={p.name}>
                <rect x={x} y={portsY} width={portW} height={portH} rx="2" fill="#c8c8c8" stroke="#666" strokeWidth="0.5" />
                <rect x={x + 2} y={portsY + 2} width={portW - 4} height={portH - 4} rx="1" fill={col.fill} stroke={col.stroke} strokeWidth="1.5" />
                <rect x={x + 6} y={portsY + 4} width={portW - 12} height="5" fill="#000" />
                <circle cx={x + portW - 4} cy={portsY + portH - 4} r="1.3" fill={it?.running ? '#22c55e' : it?.disabled ? '#777' : '#5a1a1a'} />
                <title>
                  {p.name} (порт {p.label}){isPoeIn ? ' · PoE in 18-57V' : ''}
                  {'\n'}статус: {col.label}
                  {it?.comment ? `\ncomment: ${it.comment}` : ''}
                  {it?.mac_address ? `\nmac: ${it.mac_address}` : ''}
                </title>
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
                  return (
                    <g key={`led-${i}`}>
                      <circle cx={cx} cy={cy1} r="1.3" fill={top?.running ? '#22c55e' : top?.disabled ? '#444' : '#1f3f1f'}>
                        <title>{top ? `ether${i + 1}: ${top.running ? 'up' : top.disabled ? 'disabled' : 'down'}` : `ether${i + 1}: нет данных`}</title>
                      </circle>
                      <circle cx={cx} cy={cy2} r="1.3" fill={bot?.running ? '#22c55e' : bot?.disabled ? '#444' : '#1f3f1f'}>
                        <title>{bot ? `ether${i + 6}: ${bot.running ? 'up' : bot.disabled ? 'disabled' : 'down'}` : `ether${i + 6}: нет данных`}</title>
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
            const col = portColor(it);
            const isPoeOut = i === 4;
            return (
              <g key={p.name}>
                <rect x={x} y={portsY} width={portW} height={portH} rx="2" fill="#c8c8c8" stroke="#666" strokeWidth="0.5" />
                <rect x={x + 2} y={portsY + 2} width={portW - 4} height={portH - 4} rx="1" fill={col.fill} stroke={col.stroke} strokeWidth="1.5" />
                <rect x={x + 6} y={portsY + 4} width={portW - 12} height="5" fill="#000" />
                <circle cx={x + portW - 4} cy={portsY + portH - 4} r="1.3" fill={it?.running ? '#22c55e' : it?.disabled ? '#777' : '#5a1a1a'} />
                <title>
                  {p.name} (порт {p.label}){isPoeOut ? ' · PoE out' : ''}
                  {'\n'}статус: {col.label}
                  {it?.comment ? `\ncomment: ${it.comment}` : ''}
                  {it?.mac_address ? `\nmac: ${it.mac_address}` : ''}
                </title>
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
            const col = portColor(it);
            // Короткий лейбл — только номер порта (ether7 → "7").
            const num = (it.name.match(/(\d+)$/) || [, it.name])[1];
            return (
              <g key={it.name}>
                {/* Корпус виртуального порта */}
                <rect
                  x={x}
                  y={portsY}
                  width={portW}
                  height={portH}
                  rx="3"
                  fill={col.fill}
                  stroke={col.stroke}
                  strokeWidth="1.5"
                />
                {/* Номер порта внутри */}
                <text
                  x={x + portW / 2}
                  y={portsY + portH / 2 + 4}
                  fontSize="12"
                  fill={it.running ? '#86efac' : it.disabled ? '#bbbbbb' : '#fca5a5'}
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

                <title>
                  {it.name}
                  {it.type ? ` · ${it.type}` : ''}
                  {'\n'}статус: {col.label}
                  {it.comment ? `\ncomment: ${it.comment}` : ''}
                  {it.mac_address ? `\nmac: ${it.mac_address}` : ''}
                </title>
              </g>
            );
          })}
        </svg>
      </div>

      {/* Легенда */}
      <div className="flex flex-wrap items-center gap-4 mt-3 text-xs text-mk-mute">
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded-sm bg-mk-ok/30 ring-1 ring-mk-ok" /> up (running)
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded-sm bg-mk-err/10 ring-1 ring-mk-err" /> down
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded-sm bg-mk-panel2 ring-1 ring-mk-mute" /> disabled / нет данных
        </span>
      </div>
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
          <rect x="42" y="22" width="28" height="22" rx="2" fill="#0a0a0a" stroke="#555" strokeWidth="0.5" />
          {(() => {
            const col = portColor(sfp);
            return <rect x="44" y="24" width="24" height="18" rx="1" fill={col.fill} stroke={col.stroke} strokeWidth="1">
              <title>{sfp ? `${sfp.name} · SFP\nстатус: ${col.label}` : 'SFP · нет данных'}</title>
            </rect>;
          })()}
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
            const col = portColor(it);
            return (
              <g key={p.name}>
                <rect x={x} y={portsY} width={portW} height={portH} rx="2" fill="#d4d0c4" stroke="#666" strokeWidth="0.5" />
                <rect x={x + 2} y={portsY + 2} width={portW - 4} height={portH - 4} rx="1" fill={col.fill} stroke={col.stroke} strokeWidth="1.2" />
                <rect x={x + 6} y={portsY + 4} width={portW - 12} height="5" fill="#000" />
                <circle cx={x + portW - 4} cy={portsY + portH - 4} r="1.3" fill={it?.running ? '#22c55e' : it?.disabled ? '#777' : '#5a1a1a'} />
                <title>{p.name} (порт {p.label}){p.accent === 'poe-in' ? ' · PoE in' : p.accent === 'poe-out' ? ' · PoE out' : ''}{'\n'}статус: {col.label}{it?.comment ? `\ncomment: ${it.comment}` : ''}</title>
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
          <rect x="48" y="16" width="24" height="32" rx="1.5" fill="#0a0a0a" stroke="#888" strokeWidth="0.5" />
          {(() => {
            const col = portColor(sfp);
            return <rect x="50" y="18" width="20" height="28" rx="1" fill={col.fill} stroke={col.stroke} strokeWidth="1">
              <title>{sfp ? `${sfp.name} · SFP\nстатус: ${col.label}` : 'SFP · нет данных'}</title>
            </rect>;
          })()}
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
            const col = portColor(it);
            return (
              <g key={p.name}>
                <rect x={x} y={portsY} width={portW} height={portH} rx="2" fill="#d4d0c4" stroke="#666" strokeWidth="0.5" />
                <rect x={x + 2} y={portsY + 2} width={portW - 4} height={portH - 4} rx="1" fill={col.fill} stroke={col.stroke} strokeWidth="1.2" />
                <rect x={x + 6} y={portsY + 4} width={portW - 12} height="5" fill="#000" />
                <circle cx={x + portW - 4} cy={portsY + portH - 4} r="1.3" fill={it?.running ? '#22c55e' : it?.disabled ? '#777' : '#5a1a1a'} />
                <title>{p.name} (порт {p.label}){p.accent === 'poe-in' ? ' · PoE in' : p.accent === 'poe-out' ? ' · PoE out' : ''}{'\n'}статус: {col.label}{it?.comment ? `\ncomment: ${it.comment}` : ''}</title>
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

// Общая мини-легенда для физических мокапов.
function MockupLegend() {
  return (
    <div className="flex flex-wrap items-center gap-3 mt-2 text-[10px] text-mk-mute">
      <span className="inline-flex items-center gap-1">
        <span className="inline-block w-2 h-2 rounded-sm bg-mk-ok/30 ring-1 ring-mk-ok" /> up
      </span>
      <span className="inline-flex items-center gap-1">
        <span className="inline-block w-2 h-2 rounded-sm bg-mk-err/10 ring-1 ring-mk-err" /> down
      </span>
      <span className="inline-flex items-center gap-1">
        <span className="inline-block w-2 h-2 rounded-sm bg-mk-panel2 ring-1 ring-mk-mute" /> disabled
      </span>
    </div>
  );
}
