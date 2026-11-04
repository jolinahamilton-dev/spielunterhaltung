// Gemeinsame Test-Hilfen
export function falscherSpeicher({ voll = false } = {}) {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { if (voll) throw new DOMException('voll', 'QuotaExceededError'); m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
    key: (i) => [...m.keys()][i] ?? null,
    get length() { return m.size; },
    roh: m,
  };
}
