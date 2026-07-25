// Interaction system — applies whatever zoneSystem decided should fire.
//
// Split from zoneSystem so "who is standing where" and "what that means" can be
// tested and changed independently. It is also the seam where a hired worker
// (C5) becomes indistinguishable from the player: both arrive here as an agent
// id attached to a trigger.

import { INTERACTIONS } from '../../defs/interactions.js'
import { EV, emit } from '../events.js'

export function interactionSystem(world, _dt, events) {
  const triggers = world.triggers ?? []
  if (!triggers.length) return

  for (const { zoneId, agentId, kind } of triggers) {
    const def   = INTERACTIONS[kind]
    const zone  = (world.zones ?? []).find(z => z.id === zoneId)
    const agent = (world.agents ?? []).find(a => a.id === agentId)
    if (!def || !zone || !agent) continue

    // The world may have moved on between detection and application (another
    // agent got there first); re-check rather than trusting the trigger.
    if (!def.enabled(world, zone, agent)) continue

    def.run(world, zone, agent, events)
    emit(events, EV.ZONE_FIRED, { zoneId, agentId, kind })
  }

  world.triggers = []
}
