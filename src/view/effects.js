// Event handlers — the presentation side of the sim's event stream.
//
// Replaces the ten callbacks initScene() used to take. A new sound, toast or
// haptic is a new case here; nothing has to be threaded through the scene.
//
// Handlers are keyed by event type; unknown types are ignored on purpose, so a
// system may emit an event before anyone cares about it.

import { EV } from '../sim/events.js'
import { playSfx } from '../audio/sfx.js'

export function createEffects({
  getRefs, haptic, onStateDirty, onColdSolder,
  onSaleMade, onMinigame, onPanel, onQuestDone,
}) {
  // Each station draws its own progress card (C3).
  const progressOf = (stationId) =>
    (getRefs()?.stations ?? []).find(v => v.id === stationId)?.progress

  // The rule for the whole sound and haptic set (A3/A5):
  //
  //   SOUND AND VIBRATION BELONG TO WHAT THE PLAYER DID.
  //
  // Everything a hired worker does is silent. Without this, a factory with
  // seven people on the floor is a continuous rattle of clicks and a phone
  // that never stops buzzing — and the first thing anyone would do is turn
  // both off, permanently, which costs us every sound in the game.
  //
  // `auto: true` is set by stationSystem (unattended benches); `agentId` comes
  // from the trigger zones, where 'player' is the player.
  const byPlayer = (e) => !e?.auto && (e?.agentId === undefined || e.agentId === 'player')

  const HANDLERS = {
    [EV.DELIVERY_ORDERED]: () => { playSfx('order'); haptic('medium') },

    [EV.STAGE_STARTED]: ({ stationId, label, total, done, durationMs }) => {
      progressOf(stationId)?.startStep(label, total, done, durationMs)
    },

    [EV.STAGE_DONE]: (e) => {
      progressOf(e.stationId)?.advanceDots(e.total, e.done)
      if (!byPlayer(e)) return          // a technician's work is their business
      playSfx('solder_good')
      haptic('light')
    },

    [EV.STAGE_COLD]: (e) => {
      // The warning banner is shown either way — a bad joint costs money
      // whoever made it — but only your own hands buzz.
      onColdSolder(e.missMsg)
      if (!byPlayer(e)) return
      playSfx('solder_cold')
      haptic('medium')
    },

    [EV.ASSEMBLY_DONE]: ({ stationId, quality, price }) => {
      const pct = Math.round(quality * 100)
      progressOf(stationId)?.showResult(`✓ Зібрано! ${pct}% → $${price.toFixed(0)}`)
      getRefs()?.worker?.notifySolderDone()
    },

    // A burnt kit is loud whoever burnt it: it costs the player money and it is
    // the one event that needs them to walk over and do something.
    [EV.KIT_BURNT]: () => { playSfx('overheat'); haptic('burn') },

    [EV.SALE_MADE]: (e) => {
      playSfx('sell')
      // Money landing is worth a buzz when you carried it there yourself; a
      // seller banking their tenth drone is not.
      if (byPlayer(e)) haptic('sale')
      onSaleMade?.(e)
    },

    [EV.BENCH_CLEARED]: ({ reason }) => {
      if (reason === 'abandoned') { playSfx('sell'); haptic('medium') }
    },

    [EV.PIGGY_COLLECTED]: () => { playSfx('piggy'); haptic('light') },

    // ── Trigger zones (C2) ───────────────────────────────
    // These fire for every courier on the floor. Before the byPlayer gate the
    // phone vibrated each time any of them touched anything.
    [EV.ITEM_PICKED]:  (e) => { if (byPlayer(e)) { playSfx('pickup'); haptic('light') } },
    [EV.ITEM_DROPPED]: (e) => { if (byPlayer(e)) { playSfx('drop');   haptic('light') } },
    [EV.ZONE_FIRED]:   () => onStateDirty(),

    // ── Things only the player can do (A3) ───────────────
    [EV.WORKER_HIRED]:    () => { playSfx('hire');    haptic('medium') },
    [EV.UPGRADE_BOUGHT]:  () => { playSfx('upgrade'); haptic('medium') },
    [EV.WORKER_PROMOTED]: () => { playSfx('promote'); haptic('medium') },
    [EV.HALL_UNLOCKED]:   () => { playSfx('hall');    haptic('heavy') },
    [EV.ROOM_UNLOCKED]:   () => { playSfx('hall');    haptic('heavy') },
    // Ціль виконано (П1) — та сама нагорода, що й за покупку, бо квест і є
    // покупкою, яку гравець собі пообіцяв.
    [EV.QUEST_DONE]:      (e) => { playSfx('upgrade'); haptic('medium'); onQuestDone?.(e) },
    [EV.LOCATION_CHANGED]: () => { playSfx('hall');   haptic('heavy') },

    // Pass the event through: dropping the payload here once crashed the whole
    // tick (the sim runs inside Excalibur's preupdate).
    [EV.MINIGAME_REQUESTED]: (e) => onMinigame?.(e),
    [EV.PANEL_REQUESTED]:    (e) => onPanel?.(e),

    [EV.STATE_DIRTY]: () => onStateDirty(),
  }

  function apply(events) {
    for (const evt of events) HANDLERS[evt.t]?.(evt)
  }

  return { apply }
}
