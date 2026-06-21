// Asset manifest — single source of truth for 2D sprites.
// URL served from public/sprites/ → dist/sprites/ → Android assets.
// Build never fails when a file is missing — loader catches 404s at runtime.
//
// anchors: 2D pixel offsets from the sprite's origin point.
// solderPoints array must have length === kit.solderPointCount for that drone type.

export const SPRITES = Object.freeze({
  mini_drone: {
    url: '/sprites/mini_drone.png',
    anchors: {
      solderPoints: [
        { x: -20, y:  10 },
        { x:  20, y:  10 },
        { x: -20, y: -10 },
        { x:  20, y: -10 },
      ],
    },
  },

  delivery_box: {
    url: '/sprites/delivery_box.png',
    anchors: {},
  },

  workbench: {
    url: '/sprites/workbench.png',
    anchors: {
      drone: { x:  0, y: -30 },
      box:   { x:  0, y:  20 },
      tool:  { x: 40, y:   0 },
    },
  },

  soldering_iron: {
    url: '/sprites/soldering_iron.png',
    anchors: {},
  },

  worker_walk: {
    url: '/sprites/worker_walk.png',
    anchors: {},
  },

  racing_drone: {
    url: '/sprites/racing_drone.png',
    anchors: {},
  },

  cinematic_drone: {
    url: '/sprites/cinematic_drone.png',
    anchors: {},
  },

  longrange_drone: {
    url: '/sprites/longrange_drone.png',
    anchors: {},
  },
})

// ── Helpers ───────────────────────────────────────────────

export function getManifestEntry(key) {
  return SPRITES[key] ?? null
}

export function spriteKeys() {
  return Object.keys(SPRITES)
}

// Returns a 2D anchor offset { x, y } for a named anchor, or null if absent.
export function getAnchor(key, anchorName) {
  return SPRITES[key]?.anchors?.[anchorName] ?? null
}
