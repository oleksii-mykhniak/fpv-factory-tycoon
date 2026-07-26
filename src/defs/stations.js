// Station types — what a machine is, as data.
//
// A station instance in the world points at one of these by `defId`. The
// station system interprets the definition; it knows nothing about workbenches
// specifically. Adding a test rig, a packing table or a 3D printer means adding
// an entry here and a slot in a layout — no new code path.
//
// stageSource: 'kit' — the work is the kit's own assemblySteps, so a station
// serves every drone type without listing them.

import { ZONE_DWELL_BENCH_MS, u } from '../state/config.js'

export const STATION_DEFS = Object.freeze({
  workbench: {
    id:   'workbench',
    name: 'Верстак',

    // Physical footprint, in character heights (V1). It was 300×80 — four times
    // the width of the person standing at it, which read as a market stall
    // rather than a desk. A workbench is about two people wide.
    size:   { w: u(1.7), h: u(0.72) },
    sprite: 'workbench',
    color:  '#6b4226',

    // What it consumes and produces. C2's carry system moves both.
    inputs:  [{ item: 'kit_box', capacity: 1 }],
    outputs: [{ item: 'drone',   capacity: 1 }],

    stageSource: 'kit',

    // Who may work here, and what the player's presence unlocks.
    work: {
      by:       ['player', 'worker'],
      minigame: 'solder',
    },

    // Interaction zone, placed relative to the station's centre. In front of
    // it, never on top — the station itself blocks movement.
    // The zone sits clear of the footprint: a bench you stand ON is a bench you
    // cannot walk up to. Offset must exceed (zone.h + size.h) / 2.
    zone: { w: u(2.0), h: u(1.24), offsetY: u(1.02), dwellMs: ZONE_DWELL_BENCH_MS },

    // Output table, on the FAR side of the bench (S1.2). Work goes in at the
    // front and comes out at the back, so finishing a drone and collecting it
    // are two different places to stand: the technician who just soldered it
    // cannot also scoop it up without walking round, and a seller collecting
    // one never stands in the technician's spot.
    outZone: { w: u(1.75), h: u(1.14), offsetY: u(-1.02) },

    // Upgrade tracks that affect this station's output.
    upgrades: ['soldering', 'consumables'],
  },
})

export function stationDef(defId) {
  const def = STATION_DEFS[defId]
  if (!def) throw new Error(`stationDef: невідомий тип станції "${defId}"`)
  return def
}
