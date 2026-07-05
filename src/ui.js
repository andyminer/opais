import { S } from './state.js';
import { entityTypeGroups, groupColors } from './config.js';
import { fmt, dateToSortable } from './utils.js';
import { refreshGraphAppearance, selectNodeById } from './graph.js';

// DOM elements
export const tooltip  = document.getElementById('tooltip');
export const loading  = document.getElementById('loading');
export const searchInput = document.getElementById('search-input');

// ── Tooltip ───────────────────────────────────────────────
export function showTooltip(node) {
  if (!node) return;
  if (node.type === 'State') {
    const pctOut = node.contractCount
      ? Math.round(100 * node.outOfStateContracts / node.contractCount)
      : 0;
    tooltip.innerHTML = `
      <strong>${node.label}</strong> (${node.id})<br>
      <strong>CEs:</strong> ${fmt(node.ceCount)}<br>
      <strong>Contracted Pharmacies:</strong> ${fmt(node.pharmacyCount)}<br>
      <strong>Contracts:</strong> ${fmt(node.contractCount)}<br>
      <strong>Cross-state:</strong> ${fmt(node.outOfStateContracts)} (${pctOut}%)
    `;
    tooltip.style.visibility = "visible";
    return;
  }
  if (node.type === 'Pharmacy') {
    tooltip.innerHTML = `
      <strong>Pharmacy:</strong> ${node.pharmacyName || ""}<br>
      <strong>ID:</strong> ${node.id}<br>
      <strong>Location:</strong> ${node.cpCity || ""}, ${node.cpState || ""}
    `;
  } else {
    tooltip.innerHTML = `
      <strong>Entity:</strong> ${node.entityName || ""}<br>
      <strong>Type:</strong> ${node.entityType || ""}<br>
      <strong>340B ID:</strong> ${node.id}<br>
      <strong>Location:</strong> ${node.city || ""}, ${node.state || ""}
    `;
  }
  tooltip.style.visibility = "visible";
}

export function hideTooltip() {
  tooltip.style.visibility = "hidden";
}

export function updateTooltipPosition() {
  if (S.hoveredNode) {
    const coords = S.graph.graph2ScreenCoords(S.hoveredNode.x, S.hoveredNode.y, S.hoveredNode.z);
    tooltip.style.left = `${coords.x + 8}px`;
    tooltip.style.top = `${coords.y + 8}px`;
  }
  // Update state labels in national view
  updateStateLabels();
}

// ── State labels (HTML overlay) ───────────────────────────
const stateLabelsContainer = document.getElementById('state-labels');
let stateLabelEls = {};
let stateLabelNodes = [];   // Source nodes for labels — real graph nodes
                            // (national) or pseudo centroid nodes (pharmacy/CE)

export function createStateLabels(nodes) {
  stateLabelsContainer.innerHTML = '';
  stateLabelEls = {};
  stateLabelNodes = nodes.filter(n => n.type === 'State');
  stateLabelNodes.forEach(node => {
    const el = document.createElement('div');
    el.className = 'state-label';
    el.textContent = node.id;
    stateLabelsContainer.appendChild(el);
    stateLabelEls[node.id] = el;
  });
}

export function clearStateLabels() {
  stateLabelsContainer.innerHTML = '';
  stateLabelEls = {};
  stateLabelNodes = [];
}

export function updateStateLabels() {
  if (!S.graph || stateLabelNodes.length === 0) return;
  for (const node of stateLabelNodes) {
    const el = stateLabelEls[node.id];
    // Real graph nodes get x/y/z from the engine; pseudo nodes carry
    // their own fixed coordinates
    const x = node.x !== undefined ? node.x : node.fx;
    const y = node.y !== undefined ? node.y : node.fy;
    const z = node.z !== undefined ? node.z : (node.fz || 0);
    if (!el || x === undefined) continue;
    const coords = S.graph.graph2ScreenCoords(x, y, z);
    el.style.left = `${coords.x}px`;
    el.style.top = `${coords.y - 8}px`;
  }
}

// ── Connection hover helper ───────────────────────────────
export function wireConnectionHover(container) {
  container.querySelectorAll('.connection-item[data-node-id]').forEach(el => {
    el.addEventListener('mouseenter', () => {
      S.highlightedConnectionId = el.dataset.nodeId;
      refreshGraphAppearance();
    });
    el.addEventListener('mouseleave', () => {
      S.highlightedConnectionId = null;
      refreshGraphAppearance();
    });
    el.addEventListener('click', () => {
      selectNodeById(el.dataset.nodeId);
    });
  });
}

// ── Detail panel ──────────────────────────────────────────
export function updateDetailPanel(node) {
  const panel = document.getElementById('detail-panel');
  const nodeDetails = document.getElementById('node-details');
  const connectionDetails = document.getElementById('connection-details');
  const detailTitle = document.getElementById('detail-title');
  const connectionsHeader = document.getElementById('connections-header');

  if (!node) {
    panel.classList.remove('visible');
    return;
  }
  panel.scrollTop = 0;
  panel.classList.add('visible');

  if (node.type === 'State') {
    detailTitle.textContent = `${node.label} (${node.id})`;
    connectionsHeader.textContent = 'Cross-State Relationships';

    const pctHosp = (node.hospitalCount + node.granteeCount) > 0
      ? Math.round(100 * node.hospitalCount / (node.hospitalCount + node.granteeCount))
      : 0;

    nodeDetails.innerHTML = `
      <div class="stat-row"><span class="stat-label">Participating CEs</span><span class="stat-value">${fmt(node.participatingCeCount)}</span></div>
      <div class="stat-row"><span class="stat-label">CEs with Active Contracts</span><span class="stat-value">${fmt(node.ceCount)}</span></div>
      <div class="stat-row"><span class="stat-label">Hospitals</span><span class="stat-value">${fmt(node.hospitalCount)}</span></div>
      <div class="stat-row"><span class="stat-label">Grantees</span><span class="stat-value">${fmt(node.granteeCount)}</span></div>
      <hr class="stat-divider">
      <div class="stat-row"><span class="stat-label">Contracted Pharmacies</span><span class="stat-value">${fmt(node.pharmacyCount)}</span></div>
      <div class="stat-row"><span class="stat-label">Total Contracts</span><span class="stat-value">${fmt(node.contractCount)}</span></div>
      <hr class="stat-divider">
      <div class="stat-row"><span class="stat-label">In-State Contracts</span><span class="stat-value">${fmt(node.inStateContracts)}</span></div>
      <div class="stat-row"><span class="stat-label">Cross-State Contracts</span><span class="stat-value">${fmt(node.outOfStateContracts)}</span></div>
      <button class="drill-button" onclick="drillIntoState('${node.id}')">
        View ${node.label} Network &rarr;
      </button>
    `;

    // Connected states — aggregate by neighbor, sort by weight
    const graphData = S.graph.graphData();
    const links = graphData.links.filter(link => {
      const srcId = typeof link.source === 'object' ? link.source.id : link.source;
      const tgtId = typeof link.target === 'object' ? link.target.id : link.target;
      return srcId === node.id || tgtId === node.id;
    });

    // Aggregate links by connected state (there can be both directions)
    const stateAgg = {};
    links.forEach(link => {
      const srcId = typeof link.source === 'object' ? link.source.id : link.source;
      const tgtId = typeof link.target === 'object' ? link.target.id : link.target;
      const otherId = srcId === node.id ? tgtId : srcId;
      if (!stateAgg[otherId]) stateAgg[otherId] = { weight: 0, ceCount: 0 };
      stateAgg[otherId].weight += (link.weight || 0);
      stateAgg[otherId].ceCount += (link.ceCount || 0);
    });

    const sortedStates = Object.entries(stateAgg)
      .sort((a, b) => b[1].weight - a[1].weight);

    const nodeMap = {};
    graphData.nodes.forEach(n => { nodeMap[n.id] = n; });

    connectionDetails.innerHTML = sortedStates.map(([stateId, agg]) => {
      const sn = nodeMap[stateId];
      const label = sn ? sn.label : stateId;
      return `
        <div class="connection-item">
          <strong>${label} (${stateId})</strong><br>
          <small>${fmt(agg.weight)} contracts from ${fmt(agg.ceCount)} CEs</small>
        </div>
      `;
    }).join('');

  } else if (node.type === 'Pharmacy') {
    detailTitle.textContent = 'Contract Pharmacy';

    // Compute pharmacy summary stats (local to this view)
    const pharmStats = computeConnectionStats(node);

    // Look up total CEs from pharmacy index (if loaded)
    const indexInfo = S.pharmacyIndexData ? S.pharmacyIndexData[node.id] : null;
    const totalCEs = indexInfo ? indexInfo.ceCount : null;
    const totalStates = indexInfo ? indexInfo.states.length : null;
    const localLabel = S.currentState || '';
    const showTotal = totalCEs && totalCEs > pharmStats.connectionCount;

    connectionsHeader.textContent = showTotal
      ? `${localLabel} Covered Entities Served`
      : 'Covered Entities Served';

    nodeDetails.innerHTML = `
      <p><strong>${node.pharmacyName || ''}</strong></p>
      <p style="font-size:0.85rem; color:#666;">
        ${node.cpAddress1 || ''}<br>
        ${node.cpAddress2 ? node.cpAddress2 + '<br>' : ''}
        ${node.cpCity || ''}, ${node.cpState || ''} ${node.cpZip || ''}
      </p>
      <hr class="stat-divider">
      <div class="stat-row"><span class="stat-label">${localLabel ? localLabel + ' ' : ''}CEs Served</span><span class="stat-value">${pharmStats.connectionCount}</span></div>
      ${showTotal ? `<div class="stat-row"><span class="stat-label">Total CEs (all states)</span><span class="stat-value">${fmt(totalCEs)} across ${totalStates} states</span></div>` : ''}
      <div class="stat-row"><span class="stat-label">Contracts</span><span class="stat-value">${pharmStats.dateRange}</span></div>
      <button class="nav-button" style="margin-top:0.5rem; font-size:11px;" onclick="drillIntoPharmacy('${node.id}')">All Contracts &rarr;</button>
    `;
    renderStateConnections(node, connectionDetails);

    // Lazily load pharmacy index; re-render if this pharmacy is still
    // selected so the "Total CEs (all states)" row appears without a re-click
    if (!S.pharmacyIndexData) {
      fetch('opais_pharmacy_index.json').then(r => r.ok ? r.json() : null).then(data => {
        if (data) {
          S.pharmacyIndexData = data;
          if (S.clickedNode && S.clickedNode.id === node.id && S.clickedNode.type === 'Pharmacy') {
            updateDetailPanel(S.clickedNode);
          }
        }
      });
    }
  } else {
    // Covered Entity
    const group = entityTypeGroups[node.entityType] || 'unknown';
    const badgeColor = groupColors[group] || groupColors.unknown;
    const groupLabel = group === 'hospital' ? 'Hospital' : (group === 'grantee' ? 'Grantee' : node.entityType);

    // Compute CE summary stats
    const ceStats = computeConnectionStats(node);

    detailTitle.innerHTML = `Covered Entity`;
    connectionsHeader.textContent = 'Contract Pharmacies';
    nodeDetails.innerHTML = `
      <p>
        <strong>${node.entityName || ''}</strong>
        <span class="type-badge" style="background:${badgeColor}">${node.entityType || '?'}</span>
      </p>
      ${node.entitySubName ? `<p style="font-size:0.82rem; color:#888;">${node.entitySubName}</p>` : ''}
      <p style="font-size:0.85rem; color:#666;">
        ${node.address1 || ''}<br>
        ${node.address2 ? node.address2 + '<br>' : ''}
        ${node.city || ''}, ${node.state || ''} ${node.zip || ''}
      </p>
      <hr class="stat-divider">
      <div class="stat-row"><span class="stat-label">Type</span><span class="stat-value">${groupLabel}</span></div>
      <div class="stat-row"><span class="stat-label">340B ID</span><span class="stat-value" style="font-family:monospace;font-size:0.8rem;">${node.id || ''}</span></div>
      <div class="stat-row"><span class="stat-label">Contract Pharmacies</span><span class="stat-value">${ceStats.connectionCount}</span></div>
      ${ceStats.inStateCount !== null ? `
      <div class="stat-row"><span class="stat-label">In-State</span><span class="stat-value">${ceStats.inStateCount} (${ceStats.inStatePct}%)</span></div>
      <div class="stat-row"><span class="stat-label">Out-of-State</span><span class="stat-value">${ceStats.outOfStateCount} (${ceStats.outOfStatePct}%)</span></div>
      ` : ''}
      <div class="stat-row"><span class="stat-label">Contracts</span><span class="stat-value">${ceStats.dateRange}</span></div>
      <button class="nav-button" style="margin-top:0.5rem; font-size:11px;" onclick="drillIntoCE('${node.id}')">All Contracts &rarr;</button>
    `;
    renderStateConnections(node, connectionDetails);
  }
}

export function computeConnectionStats(node) {
  const graphData = S.graph.graphData();
  const links = graphData.links.filter(link =>
    (typeof link.source === 'object' ? link.source.id : link.source) === node.id ||
    (typeof link.target === 'object' ? link.target.id : link.target) === node.id
  );

  // Dedupe connections by the other node's ID
  const seen = new Set();
  let inState = 0, outOfState = 0;
  let earliestBegin = null, latestBegin = null;
  let earliestBeginSort = null, latestBeginSort = null;

  links.forEach(link => {
    const srcId = typeof link.source === 'object' ? link.source.id : link.source;
    const tgtId = typeof link.target === 'object' ? link.target.id : link.target;
    const otherId = srcId === node.id ? tgtId : srcId;
    const otherNode = srcId === node.id ? link.target : link.source;
    const other = typeof otherNode === 'object' ? otherNode : graphData.nodes.find(n => n.id === otherNode);

    if (!seen.has(otherId)) {
      seen.add(otherId);
      // In-state vs out-of-state
      if (other && node.type === 'CE') {
        const ceState = node.state || '';
        const pharmState = other.cpState || '';
        if (ceState && pharmState) {
          if (ceState === pharmState) inState++;
          else outOfState++;
        }
      }
    }

    // Date range across all links (compare as sortable YYYY-MM-DD)
    const begin = link.beginDate || '';
    const beginSort = dateToSortable(begin);
    if (beginSort) {
      if (!earliestBegin || beginSort < earliestBeginSort) { earliestBegin = begin; earliestBeginSort = beginSort; }
      if (!latestBegin || beginSort > latestBeginSort) { latestBegin = begin; latestBeginSort = beginSort; }
    }
  });

  const total = seen.size;
  const hasGeo = node.type === 'CE' && (inState + outOfState) > 0;

  return {
    connectionCount: total,
    inStateCount: hasGeo ? inState : null,
    outOfStateCount: hasGeo ? outOfState : null,
    inStatePct: hasGeo ? Math.round(100 * inState / (inState + outOfState)) : null,
    outOfStatePct: hasGeo ? Math.round(100 * outOfState / (inState + outOfState)) : null,
    dateRange: earliestBegin
      ? (earliestBegin === latestBegin ? earliestBegin : `${earliestBegin} – ${latestBegin}`)
      : 'Unknown'
  };
}

export function renderStateConnections(node, container) {
  const graphData = S.graph.graphData();
  const links = graphData.links.filter(link =>
    (typeof link.source === 'object' ? link.source.id : link.source) === node.id ||
    (typeof link.target === 'object' ? link.target.id : link.target) === node.id
  );

  // Dedupe by connected node ID, keeping the most recent contract
  const byNodeId = {};
  links.forEach(link => {
    const srcId = typeof link.source === 'object' ? link.source.id : link.source;
    const connectedNode = (srcId === node.id) ? link.target : link.source;
    const cNode = typeof connectedNode === 'object'
      ? connectedNode
      : graphData.nodes.find(n => n.id === connectedNode);
    if (!cNode) return;

    const existing = byNodeId[cNode.id];
    if (!existing || dateToSortable(link.beginDate || '') > dateToSortable(existing.link.beginDate || '')) {
      byNodeId[cNode.id] = { cNode, link };
    }
  });

  // Sort by name
  const sorted = Object.values(byNodeId).sort((a, b) => {
    const nameA = (a.cNode.type === 'Pharmacy' ? a.cNode.pharmacyName : a.cNode.entityName) || '';
    const nameB = (b.cNode.type === 'Pharmacy' ? b.cNode.pharmacyName : b.cNode.entityName) || '';
    return nameA.localeCompare(nameB);
  });

  container.innerHTML = sorted.map(({ cNode, link }) => {
    const begin = link.beginDate || 'Unknown';
    const term = link.termDate === '' ? 'Open' : (link.termDate || 'Open');

    if (cNode.type === 'CE' || cNode.type !== 'Pharmacy') {
      // CE connection: name, sub-name, 340B ID, city/state, dates
      const name = cNode.entityName || cNode.id;
      const subName = cNode.entitySubName || '';
      const ceId = cNode.id || '';
      const city = cNode.city || '';
      const state = cNode.state || '';
      return `
        <div class="connection-item" data-node-id="${cNode.id}">
          <strong>${name}</strong><br>
          ${subName ? `<small style="color:#888;">${subName}</small><br>` : ''}
          <small style="font-family:monospace;color:#999;">${ceId}</small><br>
          <small>${city}, ${state}</small><br>
          <small>${begin} – ${term}</small>
        </div>
      `;
    } else {
      // Pharmacy connection
      const name = cNode.pharmacyName || cNode.id;
      const city = cNode.cpCity || '';
      const state = cNode.cpState || '';
      return `
        <div class="connection-item" data-node-id="${cNode.id}">
          <strong>${name}</strong><br>
          <small>${city}, ${state}</small><br>
          <small>${begin} – ${term}</small>
        </div>
      `;
    }
  }).join('');

  // Wire up hover highlighting
  wireConnectionHover(container);
}

// ── Info panel ────────────────────────────────────────────
export function updateInfoPanel() {
  const panel = document.getElementById('info-panel');

  if (S.currentView === 'national' && S.nationalData) {
    const m = S.nationalData.metadata || {};
    panel.innerHTML = `
      <h2>340B National Network</h2>
      <div class="panel-stats">
        <strong>${fmt(m.totalParticipatingCEs)}</strong> participating covered entities<br>
        <strong>${fmt(m.totalCEsWithContracts)}</strong> with active pharmacy contracts<br>
        <strong>${fmt(m.totalPharmacies)}</strong> contracted pharmacies<br>
        <strong>${fmt(m.totalContracts)}</strong> active contracts<br>
        <strong>${S.nationalData.nodes.length}</strong> states &amp; territories
      </div>
      <div class="panel-hint">Click a state to explore its network</div>
    `;
  } else if (S.currentView === 'pharmacy' && S.currentPharmacyNode) {
    const pharmInfo = S.pharmacyIndexData ? S.pharmacyIndexData[S.currentPharmacyNode.id] : null;
    const ceCount = pharmInfo ? pharmInfo.ceCount : 0;
    const stateCount = pharmInfo ? pharmInfo.states.length : 0;
    const name = S.currentPharmacyNode.pharmacyName || S.currentPharmacyNode.id;
    panel.innerHTML = `
      <h2>${name}</h2>
      <div class="panel-stats">
        <strong>${fmt(ceCount)}</strong> covered entities<br>
        <strong>${stateCount}</strong> states
      </div>
      <button class="nav-button" onclick="goBack()">&larr; Back</button>
    `;
  } else if (S.currentView === 'ce' && S.currentCENode) {
    const name = S.currentCENode.entityName || S.currentCENode.id;
    panel.innerHTML = `
      <h2>${name}</h2>
      <div class="panel-stats">
        <strong>${fmt(S.currentCENode._pharmCount)}</strong> contracted pharmacies<br>
        <strong>${S.currentCENode._pharmStates}</strong> states
      </div>
      <button class="nav-button" onclick="goBack()">&larr; Back</button>
    `;
  } else {
    // State view
    let label = S.currentState;
    if (S.nationalData) {
      const sn = S.nationalData.nodes.find(n => n.id === S.currentState);
      if (sn) label = `${sn.label} (${sn.id})`;
    }
    panel.innerHTML = `
      <h2>${label}</h2>
      <button class="nav-button" onclick="returnToNational()">&larr; National Overview</button>
    `;
  }
}

// ── Legend ─────────────────────────────────────────────────
export function updateLegend() {
  const legend = document.getElementById('legend');

  if (S.currentView === 'national') {
    legend.innerHTML = `
      <div class="legend-item">
        <div class="legend-color" style="background: ${groupColors.hospital}"></div>
        <span>Hospital-heavy</span>
      </div>
      <div class="legend-item">
        <div class="legend-color" style="background: ${groupColors.grantee}"></div>
        <span>Grantee-heavy</span>
      </div>
      <div class="legend-item">
        <div class="legend-color" style="background: linear-gradient(to right, ${groupColors.grantee}, ${groupColors.hospital}); width: 40px;"></div>
        <span>Blend = CE mix</span>
      </div>
      <div class="legend-item" style="margin-top: 0.5rem; color: #999;">
        <span>Node size = contract volume<br>Edge = cross-state contracts</span>
      </div>
    `;
  } else if (S.currentView === 'pharmacy') {
    legend.innerHTML = `
      <div class="legend-item">
        <div class="legend-color" style="background: ${groupColors.hospital}"></div>
        <span>Hospitals</span>
      </div>
      <div class="legend-item">
        <div class="legend-color" style="background: ${groupColors.grantee}"></div>
        <span>Grantees</span>
      </div>
      <div class="legend-item">
        <div class="legend-color" style="background: ${groupColors.pharmacyIn}"></div>
        <span>Contract Pharmacy</span>
      </div>
      <div class="legend-item" style="margin-top: 0.5rem; color: #999;">
        <span>CEs positioned by state</span>
      </div>
    `;
  } else if (S.currentView === 'ce') {
    legend.innerHTML = `
      <div class="legend-item">
        <div class="legend-color" style="background: ${groupColors.pharmacyIn}"></div>
        <span>In-State Pharmacies</span>
      </div>
      <div class="legend-item">
        <div class="legend-color" style="background: ${groupColors.pharmacyOut}"></div>
        <span>Out-of-State Pharmacies</span>
      </div>
      <div class="legend-item" style="margin-top: 0.5rem; color: #999;">
        <span>Pharmacies positioned by state</span>
      </div>
    `;
  } else {
    legend.innerHTML = `
      <div class="legend-item">
        <div class="legend-color" style="background: ${groupColors.hospital}"></div>
        <span>Hospitals</span>
      </div>
      <div class="legend-item">
        <div class="legend-color" style="background: ${groupColors.grantee}"></div>
        <span>Grantees</span>
      </div>
      <div class="legend-item">
        <div class="legend-color" style="background: ${groupColors.pharmacyIn}"></div>
        <span>In-State Pharmacies</span>
      </div>
      <div class="legend-item">
        <div class="legend-color" style="background: ${groupColors.pharmacyOut}"></div>
        <span>Out-of-State Pharmacies</span>
      </div>
    `;
  }
}
