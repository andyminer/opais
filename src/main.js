import { S } from './state.js';
import { searchInput, updateDetailPanel } from './ui.js';
import {
  computeBaseColor,
  buildAdjacency,
  refreshGraphAppearance,
  nudgeCamera,
} from './graph.js';
import {
  drillIntoState,
  returnToNational,
  drillIntoPharmacy,
  drillIntoCE,
  goBack,
  applyFilter,
  setDimensions,
  startup,
} from './nav.js';

// Expose the functions referenced by inline onclick= attributes on window
Object.assign(window, { drillIntoState, returnToNational, drillIntoPharmacy, drillIntoCE, goBack });

// Debug/testing handle: the app state survives minification under this name
window.__S = S;

// ── Search ────────────────────────────────────────────────
searchInput.addEventListener('input', () => {
  const query = searchInput.value.trim().toLowerCase();
  if (!query) {
    S.clickedNode = null;
    S.neighbors.clear();
    updateDetailPanel(null);
    refreshGraphAppearance();
    return;
  }

  const matchingNodes = S.graph.graphData().nodes.filter(node => {
    return (node.entityName && node.entityName.toLowerCase().includes(query)) ||
           (node.pharmacyName && node.pharmacyName.toLowerCase().includes(query)) ||
           (node.label && node.label.toLowerCase().includes(query)) ||
           (node.id && node.id.toLowerCase().includes(query));
  });

  if (matchingNodes.length === 0) {
    S.clickedNode = null;
    S.neighbors.clear();
    updateDetailPanel(null);
    refreshGraphAppearance();
    return;
  }

  const matchingNodeIds = new Set(matchingNodes.map(n => n.id));
  S.neighbors.clear();
  matchingNodes.forEach(node => {
    (S.adjacency[node.id] || new Set()).forEach(nid => S.neighbors.add(nid));
  });

  S.clickedNode = null;
  updateDetailPanel(null);

  S.graph
    .nodeColor(node =>
      matchingNodeIds.has(node.id) || S.neighbors.has(node.id)
        ? computeBaseColor(node)
        : "rgba(224, 224, 224, 0.2)"
    )
    .linkColor(link => {
      const srcId = typeof link.source === 'object' ? link.source.id : link.source;
      const tgtId = typeof link.target === 'object' ? link.target.id : link.target;
      const visible =
        (matchingNodeIds.has(srcId) && (matchingNodeIds.has(tgtId) || S.neighbors.has(tgtId))) ||
        (matchingNodeIds.has(tgtId) && S.neighbors.has(srcId));
      return visible ? "rgba(44, 62, 80, 0.25)" : "rgba(224, 224, 224, 0.03)";
    })
    .linkWidth(link => {
      const srcId = typeof link.source === 'object' ? link.source.id : link.source;
      const tgtId = typeof link.target === 'object' ? link.target.id : link.target;
      const visible =
        (matchingNodeIds.has(srcId) && (matchingNodeIds.has(tgtId) || S.neighbors.has(tgtId))) ||
        (matchingNodeIds.has(tgtId) && S.neighbors.has(srcId));
      return visible ? 2 : 0.3;
    });
});

// Escape key clears selection and search
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    S.highlightedConnectionId = null;
    S.clickedNode = null;
    S.neighbors.clear();
    updateDetailPanel(null);
    searchInput.value = '';
    nudgeCamera(false);
    // Only restore the full dataset when a filter is actually applied —
    // swapping identical data would needlessly destroy the settled layout
    if (S.currentView === 'state' && S.fullStateData && S.activeFilter !== 'all') {
      S.activeFilter = 'all';
      document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.filter === 'all');
      });
      buildAdjacency(S.fullStateData);
      S.graph.graphData(S.fullStateData);
    }
    refreshGraphAppearance();
  }
});

// Wire filter buttons
document.querySelectorAll('.filter-btn').forEach(btn => {
  btn.addEventListener('click', () => applyFilter(btn.dataset.filter));
});

document.querySelectorAll('.dim-btn').forEach(btn => {
  btn.addEventListener('click', () => setDimensions(Number(btn.dataset.dim)));
});

startup();
