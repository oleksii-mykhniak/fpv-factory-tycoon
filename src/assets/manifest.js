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

  // Коробка з трьох ракурсів (див. scripts/imported-art.js). Який із них
  // показати, вирішує поза того, хто її несе: `carrySpriteKey`.
  delivery_box: {
    url: `${BASE}sprites/delivery_box.png`,
    anchors: {},
  },

  delivery_box_45: {
    url: `${BASE}sprites/delivery_box_45.png`,
    anchors: {},
  },

  delivery_box_open: {
    url: `${BASE}sprites/delivery_box_open.png`,
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
  // Sizes come from world units in scripts/gen-sprites.js, so
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

  // ── Значки ролей (Стадія 13 / А2) ────────────────────────────
  // Читає лише сцена, над головою робітника. Імена мають збігатися з
  // `ROLES[*].badgeSprite`, і це перевіряє manifest.test.js.
  badge_courier: { url: `${BASE}sprites/badge_courier.png`, anchors: {} },
  badge_tech: { url: `${BASE}sprites/badge_tech.png`, anchors: {} },
  badge_seller: { url: `${BASE}sprites/badge_seller.png`, anchors: {} },
  badge_manager: { url: `${BASE}sprites/badge_manager.png`, anchors: {} },
  badge_engineer: { url: `${BASE}sprites/badge_engineer.png`, anchors: {} },

  // ── Іконки комплектів і цифри (Стадія 13 / А3) ───────────────
  // Іконка — не зменшений повний спрайт, а своя фігура: 96×52, стиснуті до
  // третини, дають брудний піксель. Цифри — сімковий сегмент, з якого сцена
  // складає числа замість шрифта ОС.
  icon_mini_drone: { url: `${BASE}sprites/icon_mini_drone.png`, anchors: {} },
  icon_racing_drone: { url: `${BASE}sprites/icon_racing_drone.png`, anchors: {} },
  icon_cinematic_drone: { url: `${BASE}sprites/icon_cinematic_drone.png`, anchors: {} },
  icon_longrange_drone: { url: `${BASE}sprites/icon_longrange_drone.png`, anchors: {} },
  icon_fixedwing_drone: { url: `${BASE}sprites/icon_fixedwing_drone.png`, anchors: {} },
  icon_heavy_drone: { url: `${BASE}sprites/icon_heavy_drone.png`, anchors: {} },
  icon_proto_drone: { url: `${BASE}sprites/icon_proto_drone.png`, anchors: {} },
  digit_0: { url: `${BASE}sprites/digit_0.png`, anchors: {} },
  digit_1: { url: `${BASE}sprites/digit_1.png`, anchors: {} },
  digit_2: { url: `${BASE}sprites/digit_2.png`, anchors: {} },
  digit_3: { url: `${BASE}sprites/digit_3.png`, anchors: {} },
  digit_4: { url: `${BASE}sprites/digit_4.png`, anchors: {} },
  digit_5: { url: `${BASE}sprites/digit_5.png`, anchors: {} },
  digit_6: { url: `${BASE}sprites/digit_6.png`, anchors: {} },
  digit_7: { url: `${BASE}sprites/digit_7.png`, anchors: {} },
  digit_8: { url: `${BASE}sprites/digit_8.png`, anchors: {} },
  digit_9: { url: `${BASE}sprites/digit_9.png`, anchors: {} },
  digit_colon: { url: `${BASE}sprites/digit_colon.png`, anchors: {} },

  // ── Стани верстака (Стадія 13 / А4) ──────────────────────────
  state_overheat: { url: `${BASE}sprites/state_overheat.png`, anchors: {} },
  state_done: { url: `${BASE}sprites/state_done.png`, anchors: {} },

  desk:     { url: `${BASE}sprites/desk.png`,     anchors: {} },
  rack:     { url: `${BASE}sprites/rack.png`,     anchors: {} },
  jobboard: { url: `${BASE}sprites/jobboard.png`, anchors: {} },
  trashbin: { url: `${BASE}sprites/trashbin.png`, anchors: {} },

  // Кіт — п'ять завезених аркушів, по одному на позу (`CAT_SHEETS`). Був один
  // `cat_walk` на сім клітинок, з якого кіт умів іти лише боком.
  cat_walk_down: { url: `${BASE}sprites/cat_walk_down.png`, anchors: {} },
  cat_walk_up:   { url: `${BASE}sprites/cat_walk_up.png`,   anchors: {} },
  cat_walk_side: { url: `${BASE}sprites/cat_walk_side.png`, anchors: {} },
  cat_sit:       { url: `${BASE}sprites/cat_sit.png`,       anchors: {} },
  cat_sleep:     { url: `${BASE}sprites/cat_sleep.png`,     anchors: {} },

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

  // Гравець, арт із ШІ (Стадія 16): сітка 6×6, окремий аркуш на напрямок.
  // Внесені scripts/import-ai-sheet.js; вмикає їх CHARACTER_ART === 'ai'.
  player_idle: {
    url: `${BASE}sprites/player_idle.png`,
    anchors: {},
  },

  // Айдл спиною: коли гравець спинився, ідучи вгору, він НЕ розвертається до
  // глядача — стоїть, як стояв.
  player_idle_up: {
    url: `${BASE}sprites/player_idle_up.png`,
    anchors: {},
  },

  player_walk_down: {
    url: `${BASE}sprites/player_walk_down.png`,
    anchors: {},
  },

  player_walk_up: {
    url: `${BASE}sprites/player_walk_up.png`,
    anchors: {},
  },

  // Хода від глядача з предметом у руках. Руки в аркуші ПОРОЖНІ: коробку (або
  // дрон — носять і його) кладе сцена, бо предмет у руках буває різний.
  player_walk_up_carry: {
    url: `${BASE}sprites/player_walk_up_carry.png`,
    anchors: {},
  },

  // Бік намальований лише в один бік — протилежний рушій дзеркалить.
  player_walk_side: {
    url: `${BASE}sprites/player_walk_side.png`,
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

  // Стадія 14 / К5 — типи, що входять у гру через кімнату.
  fixedwing_drone: {
    url: `${BASE}sprites/fixedwing_drone.png`,
    anchors: {},
  },

  heavy_drone: {
    url: `${BASE}sprites/heavy_drone.png`,
    anchors: {},
  },

  proto_drone: {
    url: `${BASE}sprites/proto_drone.png`,
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
