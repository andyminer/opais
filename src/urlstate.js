import { S } from './state.js';

// ── URL-as-state ─────────────────────────────────────────────
// Sub-view state (filter, selection, dimensions) is reflected into the URL
// via replaceState so any interesting configuration is a permalink. View
// transitions still pushState; this merely annotates the current entry.

export const FILTER_NAMES = new Set(['hospitals', 'grantees', 'instate', 'outofstate']);

export function syncUrlState() {
  const params = new URLSearchParams(window.location.search);
  params.delete('filter');
  params.delete('dim');
  params.delete('sel');
  params.delete('t');

  if (S.currentView === 'state') {
    if (S.activeFilter && S.activeFilter !== 'all') params.set('filter', S.activeFilter);
    if (S.activeDimensions === 2) params.set('dim', '2');
  }
  if (S.clickedNode) params.set('sel', S.clickedNode.id);
  if (S.timeActive) {
    const y = Math.floor(S.timeT / 12);
    const m = (S.timeT % 12) + 1;
    params.set('t', `${y}-${String(m).padStart(2, '0')}`);
  }

  const qs = params.toString();
  const url = window.location.pathname + (qs ? '?' + qs : '');
  // Preserve the entry's state object (view info, hasPrev) — only the URL changes
  history.replaceState(history.state, '', url);
}
