// Promote zones — the only moving trigger zones in the game (F5).
//
// Upgrading someone is not a menu entry: you walk over and stand next to them
// for a second, exactly like every other action in the shop. That means the
// zone has to follow the person, so it is rebuilt each tick on top of the fixed
// ones rather than living in the layout.
//
// Everything downstream — dwell progress, the floor mark, the guidance arrow,
// the interaction itself — treats it as an ordinary zone and needed no changes,
// which is the whole reason zones were made data in C2.

import { workersOf } from '../../state/gameState.js'
import { ruleAt } from '../../state/locations.js'
import { PROMOTE_ZONE_SIZE } from '../../state/config.js'

export function promoteZoneSystem(world) {
  const statics = world.staticZones ?? world.zones ?? []
  const agents  = world.agents ?? []

  // Локація може не мати підвищень узагалі (`hasPromote`). Вимикається тут, а
  // не в UI: без зони не буде ні мітки на підлозі, ні стрілки, ні панелі — усе
  // це вже вміє працювати з тим, що зони просто немає.
  if (!ruleAt(world.game, 'hasPromote')) {
    world.zones = statics
    return
  }

  const dynamic = []
  for (const worker of workersOf(world.game)) {
    const agent = agents.find(a => a.id === worker.id)
    if (!agent) continue
    dynamic.push({
      id:   `promote_${worker.id}`,
      kind: 'promote',
      cx:   agent.x,
      cy:   agent.y,
      w:    PROMOTE_ZONE_SIZE,
      h:    PROMOTE_ZONE_SIZE,
      x:    agent.x - PROMOTE_ZONE_SIZE / 2,
      y:    agent.y - PROMOTE_ZONE_SIZE / 2,
      meta: { workerId: worker.id },
    })
  }

  world.zones = dynamic.length ? [...statics, ...dynamic] : statics
}
