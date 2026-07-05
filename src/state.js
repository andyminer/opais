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
  // Timeline scrub (growth replay). timeT is a month integer:
  // year * 12 + (month - 1). Inactive means "show everything".
  timeActive: false,
  timeT: 0,
  timeMin: 0,
  timeMax: 0,
}
