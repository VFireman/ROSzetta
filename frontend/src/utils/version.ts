// Простой компаратор версий вида "7.15.3" / "7.15rc4" / "stable"
function tokenize(v: string): number[] {
  const m = v.match(/\d+/g);
  return m ? m.map((x) => parseInt(x, 10)) : [0];
}

export function compareVersions(a: string, b: string): number {
  const A = tokenize(a);
  const B = tokenize(b);
  const n = Math.max(A.length, B.length);
  for (let i = 0; i < n; i++) {
    const x = A[i] ?? 0;
    const y = B[i] ?? 0;
    if (x !== y) return x - y;
  }
  return 0;
}

export interface FirmwareLike {
  version: string | null;
  channel: string | null;
}

/** Возвращает максимальную версию из репозитория (только канал stable, либо null). */
export function latestStableVersion(firmware: FirmwareLike[]): string | null {
  const versions = firmware
    .filter((f) => !!f.version && (!f.channel || f.channel === 'stable'))
    .map((f) => f.version as string);
  if (versions.length === 0) return null;
  return versions.reduce((a, b) => (compareVersions(a, b) >= 0 ? a : b));
}

export function isOutdated(deviceVersion: string | null, latest: string | null): boolean {
  if (!deviceVersion || !latest) return false;
  return compareVersions(deviceVersion, latest) < 0;
}
