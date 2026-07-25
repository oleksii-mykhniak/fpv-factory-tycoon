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
  onWorkRequested, onSellRequested, onMinigame,
}) {
  const HANDLERS = {
    [EV.DELIVERY_ORDERED]: () => { playSfx('order'); haptic('medium') },

    [EV.STAGE_STARTED]: ({ label, total, done, durationMs }) => {
      getRefs()?.benchProgress?.startStep(label, total, done, durationMs)
    },

    [EV.STAGE_DONE]: ({ total, done }) => {
      getRefs()?.benchProgress?.advanceDots(total, done)
      playSfx('solder_good')
      haptic('light')
    },

    [EV.STAGE_COLD]: ({ missMsg }) => {
      playSfx('solder_cold')
      haptic('medium')
      onColdSolder(missMsg)
    },

    [EV.ASSEMBLY_DONE]: ({ quality, price }) => {
      const pct = Math.round(quality * 100)
      getRefs()?.benchProgress?.showResult(`✓ Зібрано! ${pct}% → $${price.toFixed(0)}`)
      getRefs()?.worker?.notifySolderDone()
    },

    [EV.KIT_BURNT]: () => { playSfx('overheat'); haptic('heavy') },

    [EV.SALE_MADE]: () => { playSfx('sell'); haptic('heavy') },

    [EV.BENCH_CLEARED]: ({ reason }) => {
      if (reason === 'abandoned') { playSfx('sell'); haptic('medium') }
    },

    [EV.PIGGY_COLLECTED]: () => haptic('light'),

    // ── Trigger zones (C2) ───────────────────────────────
    [EV.ITEM_PICKED]:  () => haptic('light'),
    [EV.ITEM_DROPPED]: () => haptic('light'),
    [EV.ZONE_FIRED]:   () => onStateDirty(),

    [EV.WORK_REQUESTED]:     () => onWorkRequested?.(),
    [EV.SELL_REQUESTED]:     () => onSellRequested?.(),
    [EV.MINIGAME_REQUESTED]: (e) => onMinigame?.(e),

    [EV.STATE_DIRTY]: () => onStateDirty(),
  }

  function apply(events) {
    for (const evt of events) HANDLERS[evt.t]?.(evt)
  }

  return { apply }
}
