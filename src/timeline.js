import { S } from './state.js';
import { fmt, linkSrc, linkTgt } from './utils.js';
import { syncUrlState } from './urlstate.js';

// ── Timeline scrub / growth replay ───────────────────────────
// The shipped data holds currently-active contracts, each with a begin date,
// so the scrubber shows how today's network assembled: at time t, a link is
// visible if its contract had begun by t. Time is a month integer
// (year * 12 + month-1) everywhere — the national file's contractsCum /
// weightCum arrays use the same unit.

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                     'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const bar = document.getElementById('timeline-bar');
const slider = document.getElementById('timeline-slider');
const playBtn = document.getElementById('timeline-play');
const labelEl = document.getElementById('timeline-label');

let sortedLinkMonths = [];   // state/pharmacy/ce views — for the contract counter
let playTimer = null;
let refreshQueued = false;

export function monthLabel(t) {
  return `${MONTH_NAMES[t % 12]} ${Math.floor(t / 12)}`;
}

// Value of an ascending change-point series [[monthInt, cum], ...] at time t
function cumAt(series, t) {
  let lo = 0, hi = series.length - 1, ans = 0;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (series[mid][0] <= t) { ans = series[mid][1]; lo = mid + 1; }
    else hi = mid - 1;
  }
  return ans;
}

// "MM/DD/YYYY" -> month integer, or null
function parseBeginMonth(beginDate) {
  if (!beginDate || beginDate.length < 10) return null;
  const m = +beginDate.slice(0, 2);
  const y = +beginDate.slice(6, 10);
  if (!y || !m) return null;
  return y * 12 + (m - 1);
}

// ── Visibility & size predicates (read by graph accessors) ───
export function isNodeVisibleAtT(node) {
  if (!S.timeActive) return true;
  if (node.type === 'State') {
    return node.contractsCum ? cumAt(node.contractsCum, S.timeT) > 0 : true;
  }
  return node._tm0 === undefined || node._tm0 <= S.timeT;
}

function isLinkVisibleAtT(link) {
  if (!S.timeActive) return true;
  if (S.currentView === 'national') {
    return link.weightCum ? cumAt(link.weightCum, S.timeT) > 0 : true;
  }
  return link._tm === undefined || link._tm <= S.timeT;
}

// National-view node size / link width honor the scrub position
export function timelineNodeCount(node) {
  if (S.timeActive && node.contractsCum) return cumAt(node.contractsCum, S.timeT);
  return node.contractCount || 1;
}

export function timelineLinkWeight(link) {
  if (S.timeActive && link.weightCum) return cumAt(link.weightCum, S.timeT);
  return link.weight || 1;
}

// ── Setup per view load ──────────────────────────────────────
export function prepareTimeline(graphData) {
  stopPlay();

  let minT = Infinity;
  let maxT = -Infinity;

  if (S.currentView === 'national') {
    sortedLinkMonths = [];
    for (const n of graphData.nodes) {
      if (n.contractsCum && n.contractsCum.length) {
        minT = Math.min(minT, n.contractsCum[0][0]);
        maxT = Math.max(maxT, n.contractsCum[n.contractsCum.length - 1][0]);
      }
    }
  } else {
    const months = [];
    for (const l of graphData.links) {
      const t = parseBeginMonth(l.beginDate);
      l._tm = t === null ? -Infinity : t;
      if (t !== null) months.push(t);
    }
    months.sort((a, b) => a - b);
    sortedLinkMonths = months;
    if (months.length) {
      minT = months[0];
      maxT = months[months.length - 1];
    }

    // A node appears with its earliest link
    const firstSeen = {};
    for (const l of graphData.links) {
      const s = linkSrc(l), tg = linkTgt(l);
      if (firstSeen[s] === undefined || l._tm < firstSeen[s]) firstSeen[s] = l._tm;
      if (firstSeen[tg] === undefined || l._tm < firstSeen[tg]) firstSeen[tg] = l._tm;
    }
    for (const n of graphData.nodes) {
      n._tm0 = firstSeen[n.id] !== undefined ? firstSeen[n.id] : -Infinity;
    }
  }

  const hasRange = isFinite(minT) && isFinite(maxT) && maxT > minT;
  const show = hasRange && (S.currentView === 'national' || S.currentView === 'state');
  bar.style.display = show ? 'flex' : 'none';

  S.timeMin = hasRange ? minT : 0;
  S.timeMax = hasRange ? maxT : 0;
  S.timeT = S.timeMax;
  S.timeActive = false;

  if (show) {
    slider.min = String(S.timeMin);
    slider.max = String(S.timeMax);
    slider.value = String(S.timeMax);
    playBtn.textContent = '▶';
    updateLabel();
  }
}

export function resetTimeline() {
  stopPlay();
  S.timeT = S.timeMax;
  S.timeActive = false;
  slider.value = String(S.timeMax);
  playBtn.textContent = '▶';
  refreshTimeline();
}

// Restore a scrub position from a URL param ("YYYY-MM")
export function setTimeFromParam(param) {
  const match = /^(\d{4})-(\d{1,2})$/.exec(param || '');
  if (!match) return;
  if (bar.style.display === 'none') return;
  const t = (+match[1]) * 12 + ((+match[2]) - 1);
  setTime(Math.max(S.timeMin, Math.min(S.timeMax, t)));
}

export function currentTimeParam() {
  const y = Math.floor(S.timeT / 12);
  const m = (S.timeT % 12) + 1;
  return `${y}-${String(m).padStart(2, '0')}`;
}

// ── Scrubbing ────────────────────────────────────────────────
function setTime(t) {
  S.timeT = t;
  S.timeActive = t < S.timeMax;
  slider.value = String(t);
  refreshTimeline();
}

let lastRefresh = 0;

function doRefresh() {
  if (!S.graph) return;
  lastRefresh = performance.now();
  // Re-set the accessors so the library re-evaluates them at the new t
  S.graph.nodeVisibility(isNodeVisibleAtT).linkVisibility(isLinkVisibleAtT);
  if (S.currentView === 'national') {
    S.graph.nodeVal(S.graph.nodeVal());
    S.graph.linkWidth(S.graph.linkWidth());
  }
  updateLabel();
}

function refreshTimeline() {
  if (!S.graph) return;
  // Time-based throttle with a trailing call (rAF stalls in hidden tabs) —
  // big states re-evaluate tens of thousands of predicates per refresh
  const elapsed = performance.now() - lastRefresh;
  if (elapsed >= 40) {
    doRefresh();
  } else if (!refreshQueued) {
    refreshQueued = true;
    setTimeout(() => { refreshQueued = false; doRefresh(); }, 40 - elapsed);
  }
}

function visibleContractCount() {
  if (S.currentView === 'national') {
    if (!S.graph) return 0;
    let sum = 0;
    for (const n of S.graph.graphData().nodes) {
      if (n.contractsCum) sum += cumAt(n.contractsCum, S.timeT);
    }
    return sum;
  }
  // Count of link months <= timeT (binary search on the sorted array)
  let lo = 0, hi = sortedLinkMonths.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sortedLinkMonths[mid] <= S.timeT) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

function updateLabel() {
  labelEl.textContent = `${monthLabel(S.timeT)} · ${fmt(visibleContractCount())} contracts`;
}

// ── Playback ─────────────────────────────────────────────────
function stopPlay() {
  if (playTimer) {
    clearInterval(playTimer);
    playTimer = null;
    playBtn.textContent = '▶';
  }
}

function startPlay() {
  // Replay from the start when already at the end
  if (S.timeT >= S.timeMax) setTime(S.timeMin);
  // Aim for a ~20 second full replay regardless of range
  const step = Math.max(1, Math.round((S.timeMax - S.timeMin) / 280));
  playBtn.textContent = '❚❚';
  playTimer = setInterval(() => {
    const next = S.timeT + step;
    if (next >= S.timeMax) {
      setTime(S.timeMax);
      stopPlay();
      syncUrlState();
    } else {
      setTime(next);
    }
  }, 70);
}

// ── Wiring ───────────────────────────────────────────────────
playBtn.addEventListener('click', () => {
  if (playTimer) {
    stopPlay();
    syncUrlState();
  } else {
    startPlay();
  }
});

slider.addEventListener('input', () => {
  stopPlay();
  setTime(+slider.value);
});

// Sync the URL only when the scrub settles, not on every input event —
// browsers rate-limit replaceState
slider.addEventListener('change', () => {
  syncUrlState();
});
