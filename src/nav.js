import { S } from './state.js';
import { HOSPITAL_TYPES } from './config.js';
import { fmt, linkSrc, linkTgt } from './utils.js';
import {
  loading,
  searchInput,
  updateInfoPanel,
  updateLegend,
  updateDetailPanel,
} from './ui.js';
import { initGraph, buildAdjacency, refreshGraphAppearance } from './graph.js';

// ── Filtering ─────────────────────────────────────────────
export function updateFilterCounts() {
  if (!S.fullStateData) return;
  const nodes = S.fullStateData.nodes;
  const counts = {
    all: nodes.length,
    hospitals: nodes.filter(n => n.type === 'CE' && HOSPITAL_TYPES.has(n.entityType)).length,
    grantees: nodes.filter(n => n.type === 'CE' && !HOSPITAL_TYPES.has(n.entityType)).length,
    instate: nodes.filter(n => n.type === 'Pharmacy' && n.cpState === S.currentState).length,
    outofstate: nodes.filter(n => n.type === 'Pharmacy' && n.cpState !== S.currentState).length,
  };
  const labels = {
    all: 'All',
    hospitals: 'Hospitals',
    grantees: 'Grantees',
    instate: 'In-State',
    outofstate: 'Out-of-State',
  };
  document.querySelectorAll('.filter-btn').forEach(btn => {
    const f = btn.dataset.filter;
    const count = counts[f];
    btn.innerHTML = `${labels[f]}<span class="filter-count">${count !== undefined ? fmt(count) : ''}</span>`;
  });
}

export function applyFilter(filterName) {
  S.activeFilter = filterName;

  // Update button styling
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.filter === filterName);
  });

  // Clear selection and any active search highlighting — the search
  // closures capture a match set from the pre-filter data
  S.clickedNode = null;
  S.highlightedConnectionId = null;
  S.neighbors.clear();
  searchInput.value = '';
  updateDetailPanel(null);

  let data;
  if (filterName === 'all') {
    data = S.fullStateData;
  } else {
    data = filterStateData(S.fullStateData, filterName);
  }

  // Rebuild adjacency
  buildAdjacency(data);

  // Swap graph data — force simulation animates the transition
  S.graph.graphData(data);
  refreshGraphAppearance();
}

export function filterStateData(stateData, filterName) {
  let filteredNodes, filteredLinks;

  if (filterName === 'hospitals') {
    const ceIds = new Set(stateData.nodes.filter(n => n.type === 'CE' && HOSPITAL_TYPES.has(n.entityType)).map(n => n.id));
    filteredLinks = stateData.links.filter(l => ceIds.has(linkSrc(l)));
    const pharmIds = new Set(filteredLinks.map(l => linkTgt(l)));
    filteredNodes = stateData.nodes.filter(n => ceIds.has(n.id) || pharmIds.has(n.id));
  } else if (filterName === 'grantees') {
    const ceIds = new Set(stateData.nodes.filter(n => n.type === 'CE' && !HOSPITAL_TYPES.has(n.entityType)).map(n => n.id));
    filteredLinks = stateData.links.filter(l => ceIds.has(linkSrc(l)));
    const pharmIds = new Set(filteredLinks.map(l => linkTgt(l)));
    filteredNodes = stateData.nodes.filter(n => ceIds.has(n.id) || pharmIds.has(n.id));
  } else if (filterName === 'instate') {
    const pharmIds = new Set(stateData.nodes.filter(n => n.type === 'Pharmacy' && n.cpState === S.currentState).map(n => n.id));
    filteredLinks = stateData.links.filter(l => pharmIds.has(linkTgt(l)));
    const ceIds = new Set(filteredLinks.map(l => linkSrc(l)));
    filteredNodes = stateData.nodes.filter(n => pharmIds.has(n.id) || ceIds.has(n.id));
  } else if (filterName === 'outofstate') {
    const pharmIds = new Set(stateData.nodes.filter(n => n.type === 'Pharmacy' && n.cpState !== S.currentState).map(n => n.id));
    filteredLinks = stateData.links.filter(l => pharmIds.has(linkTgt(l)));
    const ceIds = new Set(filteredLinks.map(l => linkSrc(l)));
    filteredNodes = stateData.nodes.filter(n => pharmIds.has(n.id) || ceIds.has(n.id));
  }

  return { nodes: filteredNodes, links: filteredLinks };
}

// ── Dimension toggle ──────────────────────────────────────
export function setDimensions(dim) {
  S.activeDimensions = dim;
  document.querySelectorAll('.dim-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.dim === String(dim));
  });
  if (S.graph) {
    S.graph.numDimensions(dim);
  }
}

// ── Navigation ────────────────────────────────────────────
export async function loadNationalView() {
  loading.style.display = 'block';
  try {
    if (!S.nationalData) {
      const resp = await fetch('opais_network_national.json');
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      S.nationalData = await resp.json();
    }
    S.currentView = 'national';
    S.currentState = null;
    S.fullStateData = null;
    document.getElementById('filter-bar').style.display = 'none';
    document.getElementById('dimension-toggle').style.display = 'none';
    searchInput.value = '';
    searchInput.placeholder = 'Search states...';
    updateInfoPanel();
    updateLegend();
    initGraph(S.nationalData);
  } catch (err) {
    console.error('Error loading national data:', err);
    alert('Error loading national network data.');
  } finally {
    loading.style.display = 'none';
  }
}

export async function loadState(stateId) {
  loading.style.display = 'block';
  try {
    let data;
    if (S.stateDataCache[stateId]) {
      data = JSON.parse(JSON.stringify(S.stateDataCache[stateId]));
    } else {
      const resp = await fetch(`opais_network_${stateId}.json`);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      data = await resp.json();
      // Cache a deep copy so the original isn't mutated by the graph
      S.stateDataCache[stateId] = JSON.parse(JSON.stringify(data));
    }
    // Store deep copy for filtering (before graph mutates it)
    S.fullStateData = JSON.parse(JSON.stringify(data));
    S.currentView = 'state';
    S.currentState = stateId;
    S.activeFilter = 'all';
    S.activeDimensions = 3;
    searchInput.value = '';
    searchInput.placeholder = 'Search entities or pharmacies...';
    // Reset filter and dimension buttons
    document.querySelectorAll('.filter-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.filter === 'all');
    });
    document.querySelectorAll('.dim-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.dim === '3');
    });
    updateFilterCounts();
    document.getElementById('filter-bar').style.display = 'flex';
    document.getElementById('dimension-toggle').style.display = 'flex';
    updateInfoPanel();
    updateLegend();
    initGraph(data);
  } catch (err) {
    console.error('Error loading state data:', err);
    alert(`Data for ${stateId} is not available yet.`);
  } finally {
    loading.style.display = 'none';
  }
}

export async function drillIntoState(stateId) {
  history.pushState({ view: 'state', state: stateId, hasPrev: true }, '', `?state=${stateId}`);
  await loadState(stateId);
}

export function returnToNational() {
  S.fullStateData = null;
  document.getElementById('filter-bar').style.display = 'none';
    document.getElementById('dimension-toggle').style.display = 'none';
  history.pushState({ view: 'national', hasPrev: true }, '', window.location.pathname);
  loadNationalView();
}

export async function loadPharmacyView(pharmacyId) {
  loading.style.display = 'block';
  try {
    // Fetch pharmacy index if not cached
    if (!S.pharmacyIndexData) {
      const resp = await fetch('opais_pharmacy_index.json');
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      S.pharmacyIndexData = await resp.json();
    }

    const pharmInfo = S.pharmacyIndexData[pharmacyId];
    if (!pharmInfo) {
      alert('Pharmacy not found in index.');
      loading.style.display = 'none';
      return;
    }

    // Fetch all state files where this pharmacy appears (parallel, with cache)
    const states = pharmInfo.states;
    const fetchPromises = states.map(async (st) => {
      if (S.stateDataCache[st]) return JSON.parse(JSON.stringify(S.stateDataCache[st]));
      const resp = await fetch(`opais_network_${st}.json`);
      if (!resp.ok) return null;
      const data = await resp.json();
      S.stateDataCache[st] = JSON.parse(JSON.stringify(data));
      return data;
    });
    const stateFiles = await Promise.all(fetchPromises);

    // Merge: find the pharmacy node and all connected CEs across all states
    let pharmacyNode = null;
    const ceNodes = {};
    const links = [];

    stateFiles.forEach((stateData, i) => {
      if (!stateData) return;
      const st = states[i];

      // Find the pharmacy node
      if (!pharmacyNode) {
        const found = stateData.nodes.find(n => n.id === pharmacyId && n.type === 'Pharmacy');
        if (found) pharmacyNode = { ...found };
      }

      // Find links targeting this pharmacy
      stateData.links.forEach(l => {
        const src = linkSrc(l);
        const tgt = linkTgt(l);
        if (tgt === pharmacyId) {
          // Find the CE node
          const ceNode = stateData.nodes.find(n => n.id === src);
          if (ceNode && !ceNodes[ceNode.id]) {
            ceNodes[ceNode.id] = { ...ceNode };
          }
          links.push({
            source: src,
            target: pharmacyId,
            beginDate: l.beginDate || '',
            termDate: l.termDate || '',
            contractID: l.contractID || '',
          });
        }
      });
    });

    if (!pharmacyNode) {
      alert('Could not find pharmacy data.');
      loading.style.display = 'none';
      return;
    }

    const graphData = {
      nodes: [pharmacyNode, ...Object.values(ceNodes)],
      links: links
    };

    S.currentPharmacyNode = pharmacyNode;
    S.currentView = 'pharmacy';
    S.currentState = null;
    S.activeFilter = 'all';
    searchInput.value = '';
    searchInput.placeholder = 'Search entities...';
    document.getElementById('filter-bar').style.display = 'none';
    document.getElementById('dimension-toggle').style.display = 'none';
    updateInfoPanel();
    updateLegend();
    initGraph(graphData);

    // Auto-select the pharmacy node so the detail panel is immediately visible
    const loadedPharm = S.graph.graphData().nodes.find(n => n.type === 'Pharmacy');
    if (loadedPharm) {
      S.clickedNode = loadedPharm;
      S.neighbors = new Set(S.adjacency[loadedPharm.id] || []);
      updateDetailPanel(loadedPharm);
      refreshGraphAppearance();
    }
  } catch (err) {
    console.error('Error loading pharmacy view:', err);
    alert('Error loading pharmacy network.');
  } finally {
    loading.style.display = 'none';
  }
}

export async function drillIntoPharmacy(pharmacyId) {
  history.pushState(
    { view: 'pharmacy', pharmacyId, hasPrev: true },
    '',
    `?pharmacy=${pharmacyId}`
  );
  await loadPharmacyView(pharmacyId);
}

// Back button for pharmacy/CE views: entries pushed by in-app navigation
// carry hasPrev — without it, this is a cold deep link with no in-app
// history behind it, so going "back" would leave the app entirely
export function goBack() {
  if (history.state && history.state.hasPrev) {
    history.back();
  } else {
    returnToNational();
  }
}

export async function loadCEView(ceId, stateHint) {
  loading.style.display = 'block';
  try {
    // A CE belongs to one state — find it from graph data or state files
    let ceNode = null;
    let ceState = null;

    // Check current graph data first
    if (S.graph) {
      ceNode = S.graph.graphData().nodes.find(n => n.id === ceId && n.type === 'CE');
      if (ceNode) ceState = ceNode.state;
    }

    // If not found, try to find from cached state data
    if (!ceState) {
      for (const [st, data] of Object.entries(S.stateDataCache)) {
        const found = data.nodes.find(n => n.id === ceId && n.type === 'CE');
        if (found) { ceNode = { ...found }; ceState = found.state; break; }
      }
    }

    // Cold load (deep link / refresh): trust the state carried in the URL
    if (!ceState && stateHint) {
      ceState = stateHint.toUpperCase();
    }

    if (!ceState) {
      console.warn(`Could not determine home state for CE ${ceId}`);
      await loadNationalView();
      return;
    }

    // Fetch the CE's state file
    let stateData;
    if (S.stateDataCache[ceState]) {
      stateData = JSON.parse(JSON.stringify(S.stateDataCache[ceState]));
    } else {
      const resp = await fetch(`opais_network_${ceState}.json`);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      stateData = await resp.json();
      S.stateDataCache[ceState] = JSON.parse(JSON.stringify(stateData));
    }

    // Extract this CE and all its pharmacies
    ceNode = stateData.nodes.find(n => n.id === ceId) || ceNode;
    if (!ceNode) {
      console.warn(`CE ${ceId} not found in ${ceState} state data`);
      await loadNationalView();
      return;
    }

    const ceLinks = stateData.links.filter(l => linkSrc(l) === ceId);
    const pharmIds = new Set(ceLinks.map(l => linkTgt(l)));
    const pharmNodes = stateData.nodes.filter(n => pharmIds.has(n.id));

    const graphData = {
      nodes: [{ ...ceNode }, ...pharmNodes.map(n => ({ ...n }))],
      links: ceLinks.map(l => ({
        source: linkSrc(l),
        target: linkTgt(l),
        beginDate: l.beginDate || '',
        termDate: l.termDate || '',
        contractID: l.contractID || '',
      }))
    };

    S.currentCENode = { ...ceNode };
    S.currentCENode._pharmCount = pharmNodes.length;
    S.currentCENode._pharmStates = new Set(pharmNodes.map(n => n.cpState)).size;
    S.currentView = 'ce';
    S.currentState = ceState;
    S.activeFilter = 'all';
    searchInput.value = '';
    searchInput.placeholder = 'Search pharmacies...';
    document.getElementById('filter-bar').style.display = 'none';
    document.getElementById('dimension-toggle').style.display = 'none';
    updateInfoPanel();
    updateLegend();
    initGraph(graphData);

    // Auto-select the CE node
    const loadedCE = S.graph.graphData().nodes.find(n => n.type === 'CE');
    if (loadedCE) {
      S.clickedNode = loadedCE;
      S.neighbors = new Set(S.adjacency[loadedCE.id] || []);
      updateDetailPanel(loadedCE);
      refreshGraphAppearance();
    }
  } catch (err) {
    console.error('Error loading CE view:', err);
    alert('Error loading CE network.');
  } finally {
    loading.style.display = 'none';
  }
}

export async function drillIntoCE(ceId) {
  // Resolve the CE's home state so the URL survives a cold load / refresh
  let st = null;
  if (S.graph) {
    const n = S.graph.graphData().nodes.find(n => n.id === ceId && n.type === 'CE');
    if (n && n.state) st = n.state;
  }
  history.pushState(
    { view: 'ce', ceId, ceState: st, hasPrev: true },
    '',
    `?ce=${ceId}${st ? '&st=' + st : ''}`
  );
  await loadCEView(ceId, st);
}

// ── Startup ───────────────────────────────────────────────
export function startup() {
  // Browser back/forward
  window.addEventListener('popstate', (e) => {
    if (e.state?.view === 'pharmacy' && e.state.pharmacyId) {
      loadPharmacyView(e.state.pharmacyId);
    } else if (e.state?.view === 'ce' && e.state.ceId) {
      loadCEView(e.state.ceId, e.state.ceState);
    } else if (e.state?.view === 'state' && e.state.state) {
      loadState(e.state.state);
    } else {
      loadNationalView();
    }
  });

  const urlParams = new URLSearchParams(window.location.search);
  const initialState = urlParams.get('state');
  const initialPharmacy = urlParams.get('pharmacy');
  const initialCE = urlParams.get('ce');
  const initialCEState = urlParams.get('st');

  // Seed the first history entry so Back after in-app navigation restores
  // this view instead of falling through to national with a stale URL
  const startUrl = window.location.pathname + window.location.search;

  if (initialPharmacy) {
    history.replaceState({ view: 'pharmacy', pharmacyId: initialPharmacy }, '', startUrl);
    (async () => {
      try {
        const resp = await fetch('opais_network_national.json');
        if (resp.ok) S.nationalData = await resp.json();
      } catch (e) {}
      await loadPharmacyView(initialPharmacy);
    })();
  } else if (initialCE) {
    history.replaceState({ view: 'ce', ceId: initialCE, ceState: initialCEState }, '', startUrl);
    (async () => {
      try {
        const resp = await fetch('opais_network_national.json');
        if (resp.ok) S.nationalData = await resp.json();
      } catch (e) {}
      await loadCEView(initialCE, initialCEState);
    })();
  } else if (initialState) {
    history.replaceState({ view: 'state', state: initialState }, '', startUrl);
    (async () => {
      try {
        const resp = await fetch('opais_network_national.json');
        if (resp.ok) S.nationalData = await resp.json();
      } catch (e) {}
      await loadState(initialState);
    })();
  } else {
    history.replaceState({ view: 'national' }, '', startUrl);
    loadNationalView();
  }
}
