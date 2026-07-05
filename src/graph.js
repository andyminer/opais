import ForceGraph3D from '3d-force-graph';
import { S } from './state.js';
import { entityTypeGroups, groupColors, stateCentroids } from './config.js';
import { lerpColor, fmt } from './utils.js';
import {
  showTooltip,
  hideTooltip,
  updateDetailPanel,
  updateTooltipPosition,
  createStateLabels,
  clearStateLabels,
} from './ui.js';
import { drillIntoState } from './nav.js';

// Project lat/lon to x/y for 3D graph (simple equirectangular, z=0 for flat map)
export function projectStateNodes(nodes) {
  const SCALE = 8;  // pixels per degree — tune to fill viewport
  // Center on the continental US (~39N, -98W)
  const centerLat = 39.5;
  const centerLon = -98.0;

  nodes.forEach(node => {
    const coords = stateCentroids[node.id];
    if (coords) {
      node.fx = (coords[1] - centerLon) * SCALE;       // lon → x (east is positive)
      node.fy = (coords[0] - centerLat) * SCALE;       // lat → y (north is up)
      node.fz = 0;
    }
  });
}

// Remove fixed positions so force simulation works normally
export function unpinNodes(nodes) {
  nodes.forEach(node => {
    delete node.fx;
    delete node.fy;
    delete node.fz;
  });
}

export function stateNodeColor(node) {
  const total = (node.hospitalCount || 0) + (node.granteeCount || 0);
  if (total === 0) return groupColors.grantee;
  const ratio = (node.hospitalCount || 0) / total; // 1 = all hospital, 0 = all grantee
  return lerpColor(groupColors.grantee, groupColors.hospital, ratio);
}

// ── Adjacency ─────────────────────────────────────────────
export function buildAdjacency(graphData) {
  Object.keys(S.adjacency).forEach(key => delete S.adjacency[key]);
  graphData.nodes.forEach(n => { S.adjacency[n.id] = new Set(); });
  graphData.links.forEach(link => {
    const srcId = typeof link.source === 'object' ? link.source.id : link.source;
    const tgtId = typeof link.target === 'object' ? link.target.id : link.target;
    S.adjacency[srcId].add(tgtId);
    S.adjacency[tgtId].add(srcId);
  });
}

// ── Node color ────────────────────────────────────────────
export function getNodeColor(node) {
  const baseColor = computeBaseColor(node);

  if (!S.clickedNode) return baseColor;

  // When hovering a connection in the detail panel, emphasize that pair
  if (S.highlightedConnectionId) {
    if (node.id === S.clickedNode.id || node.id === S.highlightedConnectionId) return baseColor;
    return "rgba(224, 224, 224, 0.1)";
  }

  if (node.id === S.clickedNode.id || S.neighbors.has(node.id)) return baseColor;
  return "rgba(224, 224, 224, 0.2)";
}

export function computeBaseColor(node) {
  if (node.type === 'State') return stateNodeColor(node);
  if (node.type === 'Pharmacy') {
    // In the pharmacy-centric view the focal pharmacy is an identity,
    // not an in-state/out-of-state comparison (currentState is null there)
    if (S.currentView === 'pharmacy') return groupColors.pharmacyIn;
    const isInState = S.currentState && node.cpState === S.currentState;
    return isInState ? groupColors.pharmacyIn : groupColors.pharmacyOut;
  }
  return groupColors[entityTypeGroups[node.entityType]] || groupColors.unknown;
}

// ── Node label ────────────────────────────────────────────
export function getNodeLabel(node) {
  if (node.type === 'State') {
    return `${node.label} (${node.id}) — ${fmt(node.contractCount)} contracts`;
  }
  if (node.type === 'Pharmacy') {
    return node.pharmacyName || `Pharmacy: ${node.id}`;
  }
  return `${node.entityName || 'Unknown'} (${node.entityType || 'Unknown'})`;
}

// ── Link color ────────────────────────────────────────────
export function getLinkColor(link) {
  if (S.currentView === 'pharmacy' || S.currentView === 'ce') {
    if (!S.clickedNode) return "rgba(44, 62, 80, 0.15)";
    const srcId = typeof link.source === 'object' ? link.source.id : link.source;
    const tgtId = typeof link.target === 'object' ? link.target.id : link.target;
    if (srcId === S.clickedNode.id || tgtId === S.clickedNode.id) return "rgba(44, 62, 80, 0.3)";
    return "rgba(221, 221, 221, 0.03)";
  }
  if (S.currentView === 'national') {
    const base = "rgba(44, 62, 80, 0.12)";
    const faded = "rgba(221, 221, 221, 0.03)";
    if (!S.clickedNode) return base;
    const srcId = typeof link.source === 'object' ? link.source.id : link.source;
    const tgtId = typeof link.target === 'object' ? link.target.id : link.target;
    if (srcId === S.clickedNode.id || tgtId === S.clickedNode.id) return "rgba(185, 117, 47, 0.35)";
    return faded;
  }

  // State view — in-state vs out-of-state
  const sameState = link.source?.state && link.target?.cpState &&
                    link.source.state === link.target.cpState;
  if (!S.clickedNode) {
    return sameState ? "rgba(44, 62, 80, 0.1)" : "rgba(185, 117, 47, 0.2)";
  }
  const srcId = typeof link.source === 'object' ? link.source.id : link.source;
  const tgtId = typeof link.target === 'object' ? link.target.id : link.target;

  // Detail panel hover: only the specific edge is emphasized
  if (S.highlightedConnectionId && S.clickedNode) {
    const isHighlightedEdge =
      (srcId === S.clickedNode.id && tgtId === S.highlightedConnectionId) ||
      (tgtId === S.clickedNode.id && srcId === S.highlightedConnectionId);
    if (isHighlightedEdge) return sameState ? "rgba(44, 62, 80, 0.5)" : "rgba(185, 117, 47, 0.6)";
    return "rgba(221, 221, 221, 0.03)";
  }

  if ((srcId === S.clickedNode.id && S.neighbors.has(tgtId)) ||
      (tgtId === S.clickedNode.id && S.neighbors.has(srcId))) {
    return sameState ? "rgba(44, 62, 80, 0.15)" : "rgba(185, 117, 47, 0.3)";
  }
  return "rgba(221, 221, 221, 0.05)";
}

// ── Link width ────────────────────────────────────────────
export function getLinkWidth(link) {
  if (S.currentView === 'pharmacy' || S.currentView === 'ce') {
    if (!S.clickedNode) return 1;
    const srcId = typeof link.source === 'object' ? link.source.id : link.source;
    const tgtId = typeof link.target === 'object' ? link.target.id : link.target;
    if (srcId === S.clickedNode.id || tgtId === S.clickedNode.id) return 2;
    return 0.15;
  }
  if (S.currentView === 'national') {
    const w = link.weight || 1;
    const base = Math.max(0.4, Math.sqrt(w) * 0.25);
    if (!S.clickedNode) return base;
    const srcId = typeof link.source === 'object' ? link.source.id : link.source;
    const tgtId = typeof link.target === 'object' ? link.target.id : link.target;
    if (srcId === S.clickedNode.id || tgtId === S.clickedNode.id) return base * 1.5;
    return 0.15;
  }

  // State view
  const sameState = link.source?.state && link.target?.cpState &&
                    link.source.state === link.target.cpState;
  const baseWidth = sameState ? 1 : 2;
  if (!S.clickedNode) return baseWidth;
  const srcId = typeof link.source === 'object' ? link.source.id : link.source;
  const tgtId = typeof link.target === 'object' ? link.target.id : link.target;

  // Detail panel hover: emphasize the specific edge
  if (S.highlightedConnectionId && S.clickedNode) {
    const isHighlightedEdge =
      (srcId === S.clickedNode.id && tgtId === S.highlightedConnectionId) ||
      (tgtId === S.clickedNode.id && srcId === S.highlightedConnectionId);
    return isHighlightedEdge ? 3 : 0.1;
  }

  if ((srcId === S.clickedNode.id && S.neighbors.has(tgtId)) ||
      (tgtId === S.clickedNode.id && S.neighbors.has(srcId))) {
    return baseWidth;
  }
  return 0.2;
}

// ── Hover / click handlers ────────────────────────────────
export function handleNodeHover(node) {
  S.hoveredNode = node || null;
  if (!S.hoveredNode) { hideTooltip(); return; }
  showTooltip(S.hoveredNode);
}

// Camera nudge to keep selected node visible alongside detail panel
export function nudgeCamera(selecting) {
  if (S.currentView !== 'national') return;
  const cam = S.graph.cameraPosition();
  // Shift left when selecting to clear the detail panel, back to center when deselecting
  const targetX = selecting ? 90 : 0;
  S.graph.cameraPosition(
    { x: targetX, y: cam.y, z: cam.z },
    { x: targetX, y: 0, z: 0 },
    600
  );
}

export function handleNodeClick(node) {
  S.highlightedConnectionId = null;

  // National view: second click on same state drills in
  if (S.currentView === 'national' && node && S.clickedNode && node.id === S.clickedNode.id && node.type === 'State') {
    drillIntoState(node.id);
    return;
  }

  if (!node || (S.clickedNode && node.id === S.clickedNode.id)) {
    S.clickedNode = null;
    S.neighbors.clear();
    updateDetailPanel(null);
    nudgeCamera(false);
  } else {
    S.clickedNode = node;
    S.neighbors = new Set(S.adjacency[node.id] || []);
    updateDetailPanel(node);
    nudgeCamera(true);
  }
  refreshGraphAppearance();
}

export function handleBackgroundClick() {
  S.highlightedConnectionId = null;
  S.clickedNode = null;
  S.neighbors.clear();
  updateDetailPanel(null);
  nudgeCamera(false);
  refreshGraphAppearance();
}

export function refreshGraphAppearance() {
  S.graph
    .nodeColor(getNodeColor)
    .linkColor(getLinkColor)
    .linkWidth(getLinkWidth);
}

// ── Graph init ────────────────────────────────────────────
export function initGraph(graphData) {
  // Reset selection
  S.clickedNode = null;
  S.hoveredNode = null;
  S.neighbors.clear();
  updateDetailPanel(null);

  buildAdjacency(graphData);

  if (!S.graph) {
    S.graph = ForceGraph3D()
      (document.getElementById("graph-container"))
      .backgroundColor("#faf9f7")
      .nodeResolution(16)
      .nodeColor(getNodeColor)
      .nodeLabel(getNodeLabel)
      .linkColor(getLinkColor)
      .linkWidth(getLinkWidth)
      .onNodeHover(handleNodeHover)
      .onNodeClick(handleNodeClick)
      .onBackgroundClick(handleBackgroundClick)
      .onEngineTick(updateTooltipPosition);

    // Keep overlay labels/tooltips glued to the scene during camera moves
    // after the force engine cools down (engine ticks stop ~15s in)
    const controls = S.graph.controls && S.graph.controls();
    if (controls && controls.addEventListener) {
      controls.addEventListener('change', updateTooltipPosition);
    }
  }

  // Restore default accessors — an active search swaps in closures over a
  // stale match set, which would gray out the new view's nodes
  refreshGraphAppearance();

  // Dimensions always reset to 3D on a view load (the 2D toggle is a
  // per-state-view mode; without this, 2D silently persists)
  if (S.graph.numDimensions() !== 3) S.graph.numDimensions(3);

  // View-specific configuration
  if (S.currentView === 'national') {
    // Pin state nodes to geographic positions
    projectStateNodes(graphData.nodes);
    createStateLabels(graphData.nodes);

    S.graph
      .nodeRelSize(2)
      .nodeVal(node => Math.pow(node.contractCount || 1, 0.55))
      .nodeOpacity(0.9)
      .d3AlphaDecay(1)
      .d3VelocityDecay(0.9)
      .cameraPosition({ x: 0, y: 20, z: 350 }, { x: 0, y: 0, z: 0 }, 1200);

    // Reset camera orientation so the map isn't tilted from a previous state view
    if (S.graph.camera) {
      S.graph.camera().up.set(0, 1, 0);
      const controls = S.graph.controls && S.graph.controls();
      if (controls && controls.target) {
        controls.target.set(0, 0, 0);
      }
    }

    // Disable forces — geographic positions are authoritative
    S.graph.d3Force('charge').strength(0);
    S.graph.d3Force('link').distance(0).strength(0);
  } else if (S.currentView === 'pharmacy') {
    // Pharmacy-centric: pharmacy at center, CEs positioned by state centroid
    const SCALE = 6;
    const centerLat = 39.5;
    const centerLon = -98.0;

    graphData.nodes.forEach(node => {
      if (node.type === 'Pharmacy') {
        node.fx = 0;
        node.fy = 0;
        node.fz = 0;
      } else if (node.state) {
        const coords = stateCentroids[node.state];
        if (coords) {
          // Position by state centroid with small jitter to spread CEs within a state
          const jitter = () => (Math.random() - 0.5) * 15;
          node.fx = (coords[1] - centerLon) * SCALE + jitter();
          node.fy = (coords[0] - centerLat) * SCALE + jitter();
          node.fz = jitter() * 0.5;
        }
      }
    });

    // Create state labels for CE clusters
    const ceStates = new Set(graphData.nodes.filter(n => n.type === 'CE').map(n => n.state));
    const pseudoStateNodes = [...ceStates].filter(s => stateCentroids[s]).map(s => ({
      id: s, type: 'State',
      x: (stateCentroids[s][1] - centerLon) * SCALE,
      y: (stateCentroids[s][0] - centerLat) * SCALE,
      z: 0,
    }));
    createStateLabels(pseudoStateNodes);

    S.graph
      .nodeRelSize(3)
      .nodeVal(node => node.type === 'Pharmacy' ? 8 : 1)
      .nodeOpacity(0.9)
      .d3AlphaDecay(1)
      .d3VelocityDecay(0.9)
      .cameraPosition({ x: 0, y: 0, z: 500 }, { x: 0, y: 0, z: 0 }, 1200);

    // Reset camera orientation
    if (S.graph.camera) {
      S.graph.camera().up.set(0, 1, 0);
      const controls = S.graph.controls && S.graph.controls();
      if (controls && controls.target) controls.target.set(0, 0, 0);
    }

    S.graph.d3Force('charge').strength(0);
    S.graph.d3Force('link').distance(0).strength(0);
  } else if (S.currentView === 'ce') {
    // CE-centric: CE at center, pharmacies positioned by state centroid
    const SCALE = 6;
    const centerLat = 39.5;
    const centerLon = -98.0;

    graphData.nodes.forEach(node => {
      if (node.type === 'CE') {
        node.fx = 0;
        node.fy = 0;
        node.fz = 0;
      } else if (node.cpState) {
        const coords = stateCentroids[node.cpState];
        if (coords) {
          const jitter = () => (Math.random() - 0.5) * 15;
          node.fx = (coords[1] - centerLon) * SCALE + jitter();
          node.fy = (coords[0] - centerLat) * SCALE + jitter();
          node.fz = jitter() * 0.5;
        }
      }
    });

    // Create state labels for pharmacy clusters
    const pharmStates = new Set(graphData.nodes.filter(n => n.type === 'Pharmacy').map(n => n.cpState));
    const pseudoStateNodes = [...pharmStates].filter(s => stateCentroids[s]).map(s => ({
      id: s, type: 'State',
      x: (stateCentroids[s][1] - centerLon) * SCALE,
      y: (stateCentroids[s][0] - centerLat) * SCALE,
      z: 0,
    }));
    createStateLabels(pseudoStateNodes);

    S.graph
      .nodeRelSize(3)
      .nodeVal(node => node.type === 'CE' ? 8 : 1)
      .nodeOpacity(0.9)
      .d3AlphaDecay(1)
      .d3VelocityDecay(0.9)
      .cameraPosition({ x: 0, y: 0, z: 500 }, { x: 0, y: 0, z: 0 }, 1200);

    if (S.graph.camera) {
      S.graph.camera().up.set(0, 1, 0);
      const controls = S.graph.controls && S.graph.controls();
      if (controls && controls.target) controls.target.set(0, 0, 0);
    }

    S.graph.d3Force('charge').strength(0);
    S.graph.d3Force('link').distance(0).strength(0);
  } else {
    // Unpin any fixed positions from national view
    unpinNodes(graphData.nodes);
    clearStateLabels();

    // Size CEs by their connection count (pharmacies stay uniform)
    const connectionCounts = {};
    graphData.links.forEach(link => {
      const src = typeof link.source === 'object' ? link.source.id : link.source;
      const tgt = typeof link.target === 'object' ? link.target.id : link.target;
      connectionCounts[src] = (connectionCounts[src] || 0) + 1;
      connectionCounts[tgt] = (connectionCounts[tgt] || 0) + 1;
    });

    S.graph
      .nodeRelSize(3)
      .nodeVal(node => {
        if (node.type === 'Pharmacy') return 1;
        const count = connectionCounts[node.id] || 1;
        return Math.pow(count, 0.6);
      })
      .nodeOpacity(1.0)
      .d3AlphaDecay(0.0228)
      .d3VelocityDecay(0.4)
      .cameraPosition({ x: 0, y: 0, z: 800 }, { x: 0, y: 0, z: 0 }, 1200);

    // Restore forces for state view
    S.graph.d3Force('charge').strength(-30);
    S.graph.d3Force('link').distance(30).strength(1);
  }

  S.graph.graphData(graphData);
}
