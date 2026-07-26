// Asset manifest — single source of truth for 2D sprites.
// URL served from public/sprites/ → dist/sprites/ → Android assets.
// Build never fails when a file is missing — loader catches 404s at runtime.
//
// anchors: 2D pixel offsets from the sprite's origin point.
// solderPoints array must have length === kit.solderPointCount for that drone type.

const BASE = import.meta.env.BASE_URL

export const SPRITES = Object.freeze({
  mini_drone: {
    url: `${BASE}sprites/mini_drone.png`,
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
    url: `${BASE}sprites/delivery_box.png`,
    anchors: {},
  },

  workbench: {
    url: `${BASE}sprites/workbench.png`,
    anchors: {
      drone: { x:  0, y: -30 },
      box:   { x:  0, y:  20 },
      tool:  { x: 40, y:   0 },
    },
  },

  // ── Generated furniture, outdoors, floors and walls (V6) ─────
  // Sizes come from world units in scripts/gen-placeholder-sprites.js, so
  // every one of these lands at the character's pixel density.
  door_tile: { url: `${BASE}sprites/door_tile.png`, anchors: {} },
  f_bed: { url: `${BASE}sprites/f_bed.png`, anchors: {} },
  f_bookshelf: { url: `${BASE}sprites/f_bookshelf.png`, anchors: {} },
  f_chair: { url: `${BASE}sprites/f_chair.png`, anchors: {} },
  f_counter: { url: `${BASE}sprites/f_counter.png`, anchors: {} },
  f_crate: { url: `${BASE}sprites/f_crate.png`, anchors: {} },
  f_fridge: { url: `${BASE}sprites/f_fridge.png`, anchors: {} },
  f_painting: { url: `${BASE}sprites/f_painting.png`, anchors: {} },
  f_pallet: { url: `${BASE}sprites/f_pallet.png`, anchors: {} },
  f_plant: { url: `${BASE}sprites/f_plant.png`, anchors: {} },
  f_rug: { url: `${BASE}sprites/f_rug.png`, anchors: {} },
  f_sink: { url: `${BASE}sprites/f_sink.png`, anchors: {} },
  f_sofa: { url: `${BASE}sprites/f_sofa.png`, anchors: {} },
  f_stove: { url: `${BASE}sprites/f_stove.png`, anchors: {} },
  f_table: { url: `${BASE}sprites/f_table.png`, anchors: {} },
  o_barrier: { url: `${BASE}sprites/o_barrier.png`, anchors: {} },
  o_bench: { url: `${BASE}sprites/o_bench.png`, anchors: {} },
  o_bicycle: { url: `${BASE}sprites/o_bicycle.png`, anchors: {} },
  o_bin: { url: `${BASE}sprites/o_bin.png`, anchors: {} },
  o_bush: { url: `${BASE}sprites/o_bush.png`, anchors: {} },
  o_car: { url: `${BASE}sprites/o_car.png`, anchors: {} },
  o_hedge: { url: `${BASE}sprites/o_hedge.png`, anchors: {} },
  o_hydrant: { url: `${BASE}sprites/o_hydrant.png`, anchors: {} },
  o_lamppost: { url: `${BASE}sprites/o_lamppost.png`, anchors: {} },
  o_postbox: { url: `${BASE}sprites/o_postbox.png`, anchors: {} },
  o_shelf: { url: `${BASE}sprites/o_shelf.png`, anchors: {} },
  o_tree: { url: `${BASE}sprites/o_tree.png`, anchors: {} },
  o_vending: { url: `${BASE}sprites/o_vending.png`, anchors: {} },
  tile_asphalt: { url: `${BASE}sprites/tile_asphalt.png`, anchors: {} },
  tile_asphalt_0: { url: `${BASE}sprites/tile_asphalt_0.png`, anchors: {} },
  tile_asphalt_1: { url: `${BASE}sprites/tile_asphalt_1.png`, anchors: {} },
  tile_asphalt_2: { url: `${BASE}sprites/tile_asphalt_2.png`, anchors: {} },
  tile_concrete: { url: `${BASE}sprites/tile_concrete.png`, anchors: {} },
  tile_concrete_0: { url: `${BASE}sprites/tile_concrete_0.png`, anchors: {} },
  tile_concrete_1: { url: `${BASE}sprites/tile_concrete_1.png`, anchors: {} },
  tile_concrete_2: { url: `${BASE}sprites/tile_concrete_2.png`, anchors: {} },
  tile_wood: { url: `${BASE}sprites/tile_wood.png`, anchors: {} },
  tile_wood_0: { url: `${BASE}sprites/tile_wood_0.png`, anchors: {} },
  tile_wood_1: { url: `${BASE}sprites/tile_wood_1.png`, anchors: {} },
  tile_wood_2: { url: `${BASE}sprites/tile_wood_2.png`, anchors: {} },
  wall_tile: { url: `${BASE}sprites/wall_tile.png`, anchors: {} },

  desk:     { url: `${BASE}sprites/desk.png`,     anchors: {} },
  rack:     { url: `${BASE}sprites/rack.png`,     anchors: {} },
  jobboard: { url: `${BASE}sprites/jobboard.png`, anchors: {} },
  trashbin: { url: `${BASE}sprites/trashbin.png`, anchors: {} },

  cat_walk: {
    url: `${BASE}sprites/cat_walk.png`,
    anchors: {},
  },

  soldering_iron: {
    url: `${BASE}sprites/soldering_iron.png`,
    anchors: {},
  },

  worker_walk: {
    url: `${BASE}sprites/worker_walk.png`,
    anchors: {},
  },

  // Player character — same 4-frame walk cycle, distinct palette (C1).
  player_walk: {
    url: `${BASE}sprites/player_walk.png`,
    anchors: {},
  },

  racing_drone: {
    url: `${BASE}sprites/racing_drone.png`,
    anchors: {},
  },

  cinematic_drone: {
    url: `${BASE}sprites/cinematic_drone.png`,
    anchors: {},
  },

  longrange_drone: {
    url: `${BASE}sprites/longrange_drone.png`,
    anchors: {},
  },

  lamp: {
    url: `${BASE}sprites/lamp.png`,
    anchors: {},
  },

  mailbox: {
    url: `${BASE}sprites/mailbox.png`,
    anchors: {},
  },

  piggy: {
    url: `${BASE}sprites/piggy.png`,
    anchors: {},
  },

  // Objective arrow (C7) — points down; the scene rotates it toward the target.
  arrow: {
    url: `${BASE}sprites/arrow.png`,
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
