// Asset manifest — single source of truth for 3D models.
// URL is a plain string served from public/models/ → dist/models/ → Android assets.
// Build never fails when a file is missing — loader catches 404s at runtime (see loader.js).
//
// anchors: named Empty nodes baked into the .glb; loader resolves them to world positions.
// solderPoints array must have length === kit.solderPointCount for that drone type.

export const MODELS = Object.freeze({
  mini_drone: {
    url: '/models/mini_drone.glb',
    anchors: {
      root:         'anchor_root',
      solderPoints: [
        'anchor_solder_1',
        'anchor_solder_2',
        'anchor_solder_3',
        'anchor_solder_4',
      ],
    },
  },

  delivery_box: {
    url: '/models/delivery_box.glb',
    anchors: {
      root: 'anchor_root',
    },
  },

  workbench: {
    url: '/models/workbench.glb',
    anchors: {
      drone: 'anchor_drone',  // where the drone model is placed
      box:   'anchor_box',    // where delivery box lands
      tool:  'anchor_tool',   // soldering iron position
    },
  },

  soldering_iron: {
    url: '/models/soldering_iron.glb',
    // sub-nodes level_0..level_3 are enabled/disabled by loader per upgrade level
    anchors: {
      root: 'anchor_root',
    },
  },
})

// ── Helpers ───────────────────────────────────────────────

// Returns the manifest entry for a key, or null if not registered.
export function getManifestEntry(key) {
  return MODELS[key] ?? null
}

// Returns all registered model keys.
export function modelKeys() {
  return Object.keys(MODELS)
}
