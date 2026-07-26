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

  // ── Kenney (CC0) ─────────────────────────────────────────
  // One tile = one character height (74 world units). Everything drawn from
  // these packs shares that ratio, which is what keeps the pixel size uniform
  // across the whole game — see docs/plan_stage6_visual.md, V4.
  k_asphalt: { url: `${BASE}sprites/kenney/k_asphalt.png`, anchors: {} },
  k_floor_concrete: { url: `${BASE}sprites/kenney/k_floor_concrete.png`, anchors: {} },
  k_floor_tile: { url: `${BASE}sprites/kenney/k_floor_tile.png`, anchors: {} },
  k_floor_wood: { url: `${BASE}sprites/kenney/k_floor_wood.png`, anchors: {} },
  k_bag: { url: `${BASE}sprites/kenney/k_bag.png`, anchors: {} },
  k_barrier: { url: `${BASE}sprites/kenney/k_barrier.png`, anchors: {} },
  k_bed_foot: { url: `${BASE}sprites/kenney/k_bed_foot.png`, anchors: {} },
  k_bed_head: { url: `${BASE}sprites/kenney/k_bed_head.png`, anchors: {} },
  k_bench: { url: `${BASE}sprites/kenney/k_bench.png`, anchors: {} },
  k_bicycle: { url: `${BASE}sprites/kenney/k_bicycle.png`, anchors: {} },
  k_bin: { url: `${BASE}sprites/kenney/k_bin.png`, anchors: {} },
  k_bookshelf: { url: `${BASE}sprites/kenney/k_bookshelf.png`, anchors: {} },
  k_bush: { url: `${BASE}sprites/kenney/k_bush.png`, anchors: {} },
  k_cabinet: { url: `${BASE}sprites/kenney/k_cabinet.png`, anchors: {} },
  k_car_red: { url: `${BASE}sprites/kenney/k_car_red.png`, anchors: {} },
  k_chair: { url: `${BASE}sprites/kenney/k_chair.png`, anchors: {} },
  k_counter: { url: `${BASE}sprites/kenney/k_counter.png`, anchors: {} },
  k_courier_front: { url: `${BASE}sprites/kenney/k_courier_front.png`, anchors: {} },
  k_courier_side: { url: `${BASE}sprites/kenney/k_courier_side.png`, anchors: {} },
  k_crate: { url: `${BASE}sprites/kenney/k_crate.png`, anchors: {} },
  k_crate_veg: { url: `${BASE}sprites/kenney/k_crate_veg.png`, anchors: {} },
  k_desk: { url: `${BASE}sprites/kenney/k_desk.png`, anchors: {} },
  k_hedge: { url: `${BASE}sprites/kenney/k_hedge.png`, anchors: {} },
  k_hydrant: { url: `${BASE}sprites/kenney/k_hydrant.png`, anchors: {} },
  k_lamppost: { url: `${BASE}sprites/kenney/k_lamppost.png`, anchors: {} },
  k_manager_front: { url: `${BASE}sprites/kenney/k_manager_front.png`, anchors: {} },
  k_manager_side: { url: `${BASE}sprites/kenney/k_manager_side.png`, anchors: {} },
  k_mirror: { url: `${BASE}sprites/kenney/k_mirror.png`, anchors: {} },
  k_painting: { url: `${BASE}sprites/kenney/k_painting.png`, anchors: {} },
  k_pallet: { url: `${BASE}sprites/kenney/k_pallet.png`, anchors: {} },
  k_plant: { url: `${BASE}sprites/kenney/k_plant.png`, anchors: {} },
  k_player_front: { url: `${BASE}sprites/kenney/k_player_front.png`, anchors: {} },
  k_player_side: { url: `${BASE}sprites/kenney/k_player_side.png`, anchors: {} },
  k_postbox: { url: `${BASE}sprites/kenney/k_postbox.png`, anchors: {} },
  k_rug: { url: `${BASE}sprites/kenney/k_rug.png`, anchors: {} },
  k_seller_front: { url: `${BASE}sprites/kenney/k_seller_front.png`, anchors: {} },
  k_seller_side: { url: `${BASE}sprites/kenney/k_seller_side.png`, anchors: {} },
  k_shelf_shop: { url: `${BASE}sprites/kenney/k_shelf_shop.png`, anchors: {} },
  k_sink: { url: `${BASE}sprites/kenney/k_sink.png`, anchors: {} },
  k_sofa_l: { url: `${BASE}sprites/kenney/k_sofa_l.png`, anchors: {} },
  k_sofa_r: { url: `${BASE}sprites/kenney/k_sofa_r.png`, anchors: {} },
  k_stove: { url: `${BASE}sprites/kenney/k_stove.png`, anchors: {} },
  k_table: { url: `${BASE}sprites/kenney/k_table.png`, anchors: {} },
  k_tech_front: { url: `${BASE}sprites/kenney/k_tech_front.png`, anchors: {} },
  k_tech_side: { url: `${BASE}sprites/kenney/k_tech_side.png`, anchors: {} },
  k_tree: { url: `${BASE}sprites/kenney/k_tree.png`, anchors: {} },
  k_vending: { url: `${BASE}sprites/kenney/k_vending.png`, anchors: {} },

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
