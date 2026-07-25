// Intent system — turns the player's input vector into agent velocity.
//
// The view writes `world.input` (already merged and deadzoned by
// input/inputVector.js) before each advance; the sim only ever sees plain
// numbers, so it stays pure and testable.
//
// C5 gives AI agents their own intent producer. Both end up writing vx/vy on an
// agent, and moveSystem does not care which wrote them.

export function intentSystem(world) {
  const input = world.input ?? { x: 0, y: 0 }

  for (const agent of world.agents ?? []) {
    if (agent.kind !== 'player') continue
    // A path takes over only when the player is not steering (C4/C5).
    if (agent.path && input.x === 0 && input.y === 0) continue
    agent.vx = input.x * agent.speed
    agent.vy = input.y * agent.speed
    if (input.x !== 0) agent.facing = input.x > 0 ? 1 : -1
  }
}
