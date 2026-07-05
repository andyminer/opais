// ── Constants ──────────────────────────────────────────────
export const entityTypeGroups = {
  'DSH': 'hospital', 'CAH': 'hospital', 'RRC': 'hospital',
  'PED': 'hospital', 'SCH': 'hospital', 'CAN': 'hospital',
  'CH': 'grantee', 'STD': 'grantee', 'FQHCLA': 'grantee',
  'RWI': 'grantee', 'RWII': 'grantee', 'HV': 'grantee',
  'FP': 'grantee', 'TB': 'grantee', 'RWIID': 'grantee',
  'HM': 'grantee', 'RW4': 'grantee', 'FQHC638': 'grantee',
  'UI': 'grantee', 'RWIIR': 'grantee', 'NH': 'grantee',
  'BL': 'grantee', 'SPNS': 'grantee'
};

export const groupColors = {
  'hospital':     '#D95F02',   // Burnt orange
  'grantee':      '#1B3147',   // Deep navy
  'pharmacyIn':   '#8BA4B8',   // Muted steel blue — in-state pharmacies
  'pharmacyOut':  '#B8956A',   // Warm tan — out-of-state pharmacies
  'unknown':      '#8B5CF6'    // Distinct purple for unrecognized entity types
};

export const HOSPITAL_TYPES = new Set(['DSH', 'CAH', 'RRC', 'PED', 'SCH', 'CAN']);

// State centroids [lat, lon] — continental US + inset positions for AK/HI/territories
export const stateCentroids = {
  'AL': [32.8, -86.8], 'AK': [28.0, -127.0], 'AZ': [34.2, -111.7],
  'AR': [34.8, -92.2], 'CA': [37.2, -119.5], 'CO': [39.0, -105.5],
  'CT': [41.6, -72.7], 'DE': [39.0, -75.5],  'DC': [38.9, -77.0],
  'FL': [28.6, -82.5], 'GA': [32.7, -83.5],  'HI': [24.5, -120.0],
  'ID': [44.4, -114.6],'IL': [40.0, -89.2],  'IN': [39.9, -86.3],
  'IA': [42.0, -93.5], 'KS': [38.5, -98.3],  'KY': [37.8, -85.7],
  'LA': [31.0, -92.0], 'ME': [45.4, -69.2],  'MD': [39.0, -76.7],
  'MA': [42.3, -71.8], 'MI': [44.3, -85.4],  'MN': [46.3, -94.3],
  'MS': [32.7, -89.7], 'MO': [38.4, -92.5],  'MT': [47.0, -109.6],
  'NE': [41.5, -99.8], 'NV': [39.3, -116.6], 'NH': [43.7, -71.6],
  'NJ': [40.1, -74.7], 'NM': [34.4, -106.1], 'NY': [42.9, -75.5],
  'NC': [35.6, -79.4], 'ND': [47.4, -100.5], 'OH': [40.4, -82.8],
  'OK': [35.6, -97.5], 'OR': [44.0, -120.5], 'PA': [40.9, -77.8],
  'RI': [41.7, -71.5], 'SC': [34.0, -81.0],  'SD': [44.4, -100.2],
  'TN': [35.9, -86.4], 'TX': [31.5, -99.3],  'UT': [39.3, -111.7],
  'VT': [44.1, -72.6], 'VA': [37.5, -78.9],  'WA': [47.4, -120.5],
  'WV': [38.6, -80.6], 'WI': [44.6, -89.8],  'WY': [43.0, -107.5],
  // Territories — inset below the continental US
  'PR': [24.5, -80.0], 'VI': [24.5, -76.0],  'MP': [24.5, -72.0]
};
