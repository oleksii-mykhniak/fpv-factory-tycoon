// Station types — what a machine is, as data.
//
// A station instance in the world points at one of these by `defId`. The
// station system interprets the definition; it knows nothing about workbenches
// specifically. Adding a test rig, a packing table or a 3D printer means adding
// an entry here and a slot in a layout — no new code path.
//
// stageSource: 'kit' — the work is the kit's own assemblySteps, so a station
// serves every drone type without listing them.

import { ZONE_DWELL_BENCH_MS } from '../state/config.js'

export const STATION_DEFS = Object.freeze({
  workbench: {
    id:   'workbench',
    name: 'Верстак',

    // Physical footprint (world units). Solid: characters walk around it.
    size:   { w: 300, h: 80 },
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
    zone: { w: 330, h: 120, offsetY: 100, dwellMs: ZONE_DWELL_BENCH_MS },

    // Output table, on the FAR side of the bench (S1.2). Work goes in at the
    // front and comes out at the back, so finishing a drone and collecting it
    // are two different places to stand: the technician who just soldered it
    // cannot also scoop it up without walking round, and a seller collecting
    // one never stands in the technician's spot.
    outZone: { w: 300, h: 110, offsetY: -100 },

    // Upgrade tracks that affect this station's output.
    upgrades: ['soldering', 'consumables'],
  },
})

export function stationDef(defId) {
  const def = STATION_DEFS[defId]
  if (!def) throw new Error(`stationDef: невідомий тип станції "${defId}"`)
  return def
}
