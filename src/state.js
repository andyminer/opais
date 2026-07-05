// All mutable app state lives here — one object, one place to serialize.
export const S = {
  graph: null,             // the ForceGraph3D instance (was global `Graph`)
  currentView: 'national', // 'national' | 'state' | 'pharmacy' | 'ce'
  currentState: null,
  nationalData: null,
  activeFilter: 'all',
  activeDimensions: 3,
  fullStateData: null,
  pharmacyIndexData: null,
  stateDataCache: {},
  currentPharmacyNode: null,
  currentCENode: null,
  hoveredNode: null,
  clickedNode: null,
  neighbors: new Set(),
  highlightedConnectionId: null,
  adjacency: {},
}
