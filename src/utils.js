// ── Color helpers ─────────────────────────────────────────
export function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function lerpColor(hex1, hex2, t) {
  const [r1, g1, b1] = hexToRgb(hex1);
  const [r2, g2, b2] = hexToRgb(hex2);
  const r = Math.round(r1 + (r2 - r1) * t);
  const g = Math.round(g1 + (g2 - g1) * t);
  const b = Math.round(b1 + (b2 - b1) * t);
  return `rgb(${r},${g},${b})`;
}

// ── Date helpers ───────────────────────────────────────────
// Parse MM/DD/YYYY to a sortable YYYY-MM-DD string (or '' if invalid)
export function dateToSortable(mmddyyyy) {
  if (!mmddyyyy || mmddyyyy === 'Unknown' || mmddyyyy === 'Open') return '';
  const parts = mmddyyyy.split('/');
  if (parts.length !== 3) return '';
  return `${parts[2]}-${parts[0].padStart(2,'0')}-${parts[1].padStart(2,'0')}`;
}

// ── Number formatting ─────────────────────────────────────
export function fmt(n) {
  return (n || 0).toLocaleString();
}

// ── Link helpers ──────────────────────────────────────────
// Normalize link source/target to string ID (handles both raw JSON and graph-mutated objects)
export function linkSrc(l) { return typeof l.source === 'object' ? l.source.id : l.source; }
export function linkTgt(l) { return typeof l.target === 'object' ? l.target.id : l.target; }
