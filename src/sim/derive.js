// Values derived from the game state that more than one consumer needs.
//
// Kept here so the zone that opens the piggy bank and the actor that draws it
// can never disagree about whether it exists — they were two separate
// expressions before, and one of them was quietly wrong for a month (the
// scrap kit's cost of 0 dragged the minimum kit cost to zero, so the rescue
// mini-game never appeared).

import {
  KIT_TYPES, busyStations, idleStations, Phase, stationsOf, nextHireCost, freeSlots, kitCost,
  workersInRole, nextHallId, canUnlockHall, nextRoomId, canUnlockRoom,
  calcPrice, kitBasePrice, DeliveryStatus, cheapestKitCost,
} from '../state/gameState.js'
import {
  GUIDANCE_ORDERS, GUIDANCE_SCRAP_RUNS, INCOME_WINDOW_MS,
  SALVAGE_RATE, ARROW_FREE_STEPS,
} from '../state/config.js'
import { levelData, UPGRADE_TRACKS, trackMaxLevel, nextCost, salePriceMult } from '../state/upgrades.js'
import { kitRatePerSec, bestKitByValue } from './economy.js'
import {
  kitsForLocation, hiringAllowed, roleCapHere, roleCapInHall, capFor, ruleAt,
  canMoveToLocation, LOCATION_ORDER, LOCATIONS,
} from '../state/locations.js'
import { roomDef } from '../defs/layouts/rooms.js'
import { hallDef } from '../defs/layouts/factory.js'
import { ROLE_ORDER, roleLevelData } from '../defs/roles.js'
import { questZoneKind, questIsLoop, questIndex } from './quests.js'
import { trackIntroduced } from './unlocks.js'

// Найдешевший комплект переїхав у gameState (поруч із `kitCost`, з якого й
// рахується) і ре-експортується звідси: споживачів у нього багато, і всі вони
// звикли брати «чи гравець на мілині» саме тут.
export { cheapestKitCost }

// Темп комплекту переїхав у `sim/economy.js` — туди ж, де тепер живе вибір
// менеджера (Стадія 11 / B): це одне число на двох, і два його дублікати вже
// один раз розійшлись. Ре-експорт, бо картка комплекту бере його звідси.
export { kitRatePerSec }

// The piggy bank is a rescue: it shows only when the player is stuck — too poor
// for any kit, with nothing already in flight.
export function piggyShouldShow(game) {
  if (!ruleAt(game, 'hasPiggy')) return false
  const busy = (game.deliveries ?? []).length > 0 || busyStations(game).length > 0
  return game.money < cheapestKitCost(game) && !busy
}

// ── Does this object want the player's attention? (S2) ────
//
// The badges that used to live on the bottom bar moved onto the objects the
// panels now sit behind. Kept here rather than in the view because the trigger
// zone, the pulsing prop and the guidance arrow must agree — three copies of
// "is there anything worth doing at the desk" is exactly how the piggy bank
// went wrong.

// The desk: somewhere to put a kit, and enough money to buy one.
export function shopNeedsAttention(game) {
  if (!idleStations(game).length) return false
  const affordable = kitsForLocation(game)
    .filter(id => KIT_TYPES[id]?.cost > 0)
    .some(id => game.money >= kitCost(game, id))
  return affordable
}

// Everything the rack can sell right now: upgrade levels, the next room or
// hall, the move to the next location. `{ id, label, cost, blocked }` each —
// `blocked` marks what is unlocked but has an unmet requirement other than
// money (a move that still needs the garage), so it can be listed without
// being counted as "affordable".
//
// One list instead of two loops: "does the rack want attention" and "what is
// the next thing I can buy" are the same question asked twice, and answering
// it in two places is how the badge and the progress bar would end up
// disagreeing about whether anything is for sale (Стадія 10 / D2).
export function purchaseOptions(game) {
  const out = []

  // "Would this be allowed if money were no object?" — the only honest way to
  // separate "you cannot afford it yet" from "money is not what is stopping
  // you". Asking `game.money >= cost` instead looks equivalent and is not: a
  // player who is BOTH too poor and missing the requirement would read as
  // merely poor, and the progress bar would spend the next ten minutes filling
  // towards a move the rack refuses to sell.
  const onlyMoneyMissing = (check) => check(Infinity).can

  for (const [id, track] of Object.entries(UPGRADE_TRACKS)) {
    const level = game.upgrades[track.stateKey] ?? 0
    if (level >= Math.min(trackMaxLevel(id), capFor(game, id))) continue
    // Те саме правило, за яким трек видно в панелі (Стадія 9 / Р5). Без нього
    // смужка вела б до «Репутація · $50», гравець дійшов би до стелажа — і не
    // знайшов там такого рядка: панель ховає невведене, а ці двоє про нього не
    // знали. Нескінченні треки зробили діру помітною, бо вони доступні завжди.
    if (!trackIntroduced(game, id)) continue
    out.push({ id: `upgrade:${id}`, label: track.name, cost: nextCost(id, level) })
  }

  // The rack is also where the floor plan is bought: a room at home (П2), a
  // hall on the factory (F2).
  const roomId = nextRoomId(game)
  if (roomId) {
    out.push({
      id: `room:${roomId}`, label: roomDef(roomId)?.name ?? roomId,
      cost: roomDef(roomId)?.cost ?? Infinity,
      blocked: !onlyMoneyMissing(m => canUnlockRoom({ ...game, money: m }, roomId)),
    })
  }

  const hallId = nextHallId(game)
  if (hallId) {
    out.push({
      id: `hall:${hallId}`, label: hallDef(hallId)?.name ?? hallId,
      cost: hallDef(hallId)?.cost ?? Infinity,
      blocked: !onlyMoneyMissing(m => canUnlockHall({ ...game, money: m }, hallId)),
    })
  }

  const currentIdx = LOCATION_ORDER.indexOf(game.locationId ?? 'apartment')
  const nextLocId  = LOCATION_ORDER[currentIdx + 1]
  if (nextLocId) {
    out.push({
      id: `move:${nextLocId}`, label: LOCATIONS[nextLocId]?.name ?? nextLocId,
      cost: LOCATIONS[nextLocId]?.unlockCost ?? Infinity,
      blocked: !onlyMoneyMissing(m => canMoveToLocation({ ...game, money: m }, nextLocId)),
    })
  }

  return out
}

// The rack: an upgrade (or a move) is affordable.
//
// This used to go quiet while any bench was mid-build — a rule from the era of
// a single bench that WAS the game. With parallel stations and hired staff the
// shop is essentially never idle, so "between cycles" meant "never": buying a
// better iron is not something that has to wait for the current drone.
export function upgradeNeedsAttention(game) {
  return purchaseOptions(game).some(o => !o.blocked && game.money >= o.cost)
}

// The board: hiring is allowed here, and some role has both room and a price
// the player can meet. Room is per role now, so a full courier bench no longer
// hides the fact that a technician could still be taken on.
export function hireNeedsAttention(game, hallId = null) {
  if (!hiringAllowed(game)) return false
  return ROLE_ORDER.some(id =>
    workersInRole(game, id, hallId).length < roleCapInHall(game, hallId, id) &&
    game.money >= nextHireCost(game, id))
}

// ── The rescue kit (F1.5) ─────────────────────────────────
//
// Every location needs a way out of "spent the last money on an upgrade, cannot
// afford a kit, nothing in flight" — otherwise the shop is dead and the save is
// over. The apartment and the garage have two: the piggy bank and the salvage
// bin. The factory has neither, so the way out is a free kit: the manager
// orders one off the laptop, and you can too if you have not hired them yet.
//
// Deliberately gated on genuinely stuck rather than on "cheap kit available",
// so it is a rescue and not a strategy: with money for a real kit, a real kit
// is always the better buy.
export function rescueKitAvailable(game) {
  // Where a rescue mechanic already exists, this one must not: two of them
  // would make the salvage bin pointless.
  if (ruleAt(game, 'hasPiggy') || ruleAt(game, 'hasTrash')) return false
  if ((game.deliveries ?? []).length) return false
  if (!idleStations(game).length) return false
  return game.money < cheapestKitCost(game)
}

export const RESCUE_KIT_ID = 'scrap_drone'

// ── Procurement (S3) ──────────────────────────────────────
//
// Which kit a manager of this level should buy right now, or null when they
// should keep their hands in their pockets. The rule is deliberately plain:
// the best kit they are trained for, that there is room for, and that leaves
// the reserve intact — a manager who spends down to zero would quietly stop
// the player ever affording an upgrade.
export function managerKitChoice(game, level = 0) {
  if (!freeSlots(game)) return null
  if (!idleStations(game).length) return null

  // Що саме брати — рахує `sim/economy.js`: найвигідніший по $/сек серед тих,
  // які цей тир узагалі веде (Стадія 11 / B). Тут лишаються тільки умови
  // ЖИВОГО менеджера — вільний слот доставки й вільний верстак, — яких офлайн
  // не має.
  return bestKitByValue(game, roleLevelData('manager', level).tier ?? 0)
}

// What the manager should order right now: the best kit they can afford, or —
// when the shop has run itself dry — the free rescue kit. Returning the kit
// object either way keeps the desk zone from having to know the difference.
export function managerOrderChoice(game, level = 0) {
  return managerKitChoice(game, level)
    ?? (rescueKitAvailable(game) ? KIT_TYPES[RESCUE_KIT_ID] : null)
}

// ── Income on screen (F7) ─────────────────────────────────
//
// Money actually banked in the last minute, divided by that minute. Not a
// forecast and not a capacity model: the player can watch a sale land and see
// the number move, which is the only reason to trust it.
//
// Sales older than the window are not pruned from the log — it is also the
// history the game shows elsewhere — they are simply filtered out here.
export function incomePerSec(salesLog = [], now = Date.now(), hallId = undefined) {
  const since = now - INCOME_WINDOW_MS
  const total = salesLog
    .filter(s => (s.at ?? 0) >= since)
    .filter(s => hallId === undefined || (s.hallId ?? null) === hallId)
    .reduce((sum, s) => sum + s.price, 0)
  return total / (INCOME_WINDOW_MS / 1000)
}

// The station the player is standing at, if it has a kit on it (C6).
//
// Shared by the view (to show the soldering strip) and by anything else that
// cares about presence, so what you see and what the sim believes cannot
// disagree — the same mistake the piggy bank made for a month.
// Does this iron do the soldering on its own once someone is at the bench?
// Levels 2–3 do; 0–1 need the mini-game. Used to decide whether to offer it.
export function ironIsHandsOff(game) {
  return levelData('soldering', game.upgrades.solderingLevel).qualityMin !== undefined
}

export function playerStation(world) {
  const player = (world.agents ?? []).find(a => a.kind === 'player')
  if (!player) return null

  for (const zone of world.zones ?? []) {
    if (zone.kind !== 'bench') continue
    if (Math.abs(player.x - zone.cx) > zone.w / 2) continue
    if (Math.abs(player.y - zone.cy) > zone.h / 2) continue
    const station = stationsOf(world.game).find(s => s.id === zone.meta?.stationId)
    if (station?.phase === Phase.ASSEMBLY) return station
  }
  return null
}

// Where the player should go next, as a zone — the game never explains itself
// otherwise, and "walk out to the street" is not guessable from a HUD line.
//
// Reuses the zones' own `enabled` predicate, so the arrow can only ever point
// at something that will actually do something when you arrive.
// Training wheels come off once the loop is familiar — but per topic, not all
// at once. A player can get through five clean orders without ever burning a
// kit, and would then have no idea where the salvage bin is; scrap runs get
// their own short allowance.
export function guidanceActive(game) {
  return (game.ordersPlaced ?? 0) <= GUIDANCE_ORDERS
}

export function scrapGuidanceActive(game) {
  return (game.scrapRuns ?? 0) <= GUIDANCE_SCRAP_RUNS
}

// ── Позаланцюгові вставки (Стадія 9 / Р1) ─────────────────
//
// Дві ситуації ламають будь-який ланцюг: комплект згорів і грошей нема. Обидві
// трапляються не «на кроці N», а коли трапляються, і обидві мають рішення, про
// яке гравець сам не здогадається — стати біля верстака, щоб списати брухт;
// піти до смітника по безкоштовні деталі; струсити скарбничку.
//
// Тому вони НЕ в ланцюгу. Умови тут не монотонні (згорілий комплект прибирають,
// гроші з'являються), а весь ланцюг тримається на тому, що виконане не
// повертається. Вставка просто перебиває картку на той час, поки триває, і не
// рухає індекс.
//
// Живе в derive, а не в quests.js, бо спирається на piggyShouldShow і
// cheapestKitCost — а два різні уявлення про «чи є в гравця гроші» вже раз
// розійшлись на місяць (див. коментар на початку файлу).
export function interruptQuest(game) {
  const burnt = stationsOf(game).find(s => s.phase === Phase.BURNT)
  if (burnt) {
    const salvage = kitCost(game, burnt.kitId) * SALVAGE_RATE
    return {
      id:       'fix_burnt',
      kind:     'do',
      zoneKind: 'bench',
      title:    'Прибери згорілий комплект',
      why:      salvage > 0
        ? `Стань біля того верстака — за брухт дадуть $${salvage.toFixed(0)}`
        : 'Стань біля того верстака, щоб звільнити його',
      need: 0, have: 0, ready: false, hint: null,
    }
  }

  // Порожня каса: спершу те, що дає деталі безкоштовно, потім скарбничка.
  const broke = game.money < cheapestKitCost(game) && !(game.deliveries ?? []).length
    && !busyStations(game).length
  if (!broke) return null

  // Смітник — тільки якщо там справді є що зробити: вільний верстак, куди
  // принести деталі. Стрілка на зону, яка при підході нічого не зробить, гірша
  // за жодну — і саме це тут раніше й було, бо смітник вимагав «замовлення» в
  // ноутбуці.
  if (ruleAt(game, 'hasTrash') && idleStations(game).length) {
    return {
      id:       'salvage_run',
      kind:     'do',
      zoneKind: 'trashbin',
      title:    'Розбери брухт у смітнику',
      why:      'Грошей на комплект нема — деталі звідти безкоштовні',
      need: 0, have: 0, ready: false, hint: null,
    }
  }

  if (piggyShouldShow(game)) {
    return {
      id:       'piggy_shake',
      kind:     'do',
      zoneKind: 'piggy',
      title:    'Струсни скарбничку',
      why:      'Вистачить рівно на найдешевший комплект',
      need: 0, have: 0, ready: false, hint: null,
    }
  }

  return null
}

// Чи стрілка взагалі має право бути на екрані (фікс після валідації).
//
// Стрілка вчить петлю, а потім починає мозолити око: показує на місце, куди
// гравець і сам ішов, і робить це весь час. Тому три причини її показати, і
// поза ними — нічого:
//
//   перші кроки ланцюга — гравець ще вчиться, де тут що;
//   цех застряг         — згорілий комплект або порожня каса: саме тоді рішення
//                         не вгадується, і ховати підказку жорстоко;
//   гравець попросив    — тап по картці цілі. `arrowUntil` живе у world, не в
//                         сейві: це не стан цеху, а те, що гравець хоче бачити
//                         протягом наступних секунд.
export function arrowAllowed(world) {
  if (questIndex(world.game) < ARROW_FREE_STEPS) return true
  if (interruptQuest(world.game)) return true
  return (world.arrowUntil ?? 0) > world.now
}

export function nextObjective(world, interactions) {
  const player = (world.agents ?? []).find(a => a.kind === 'player')
  if (!player) return null
  if (!arrowAllowed(world)) return null

  const nearest = (kind, live = false) => {
    const zones = (world.zones ?? []).filter(z =>
      z.kind === kind && (!live || interactions[kind]?.enabled(world, z, player)))
    if (!zones.length) return null
    return zones.reduce((best, z) =>
      Math.hypot(z.cx - player.x, z.cy - player.y) <
      Math.hypot(best.cx - player.x, best.cy - player.y) ? z : best)
  }

  // Те, що вже почато, — раніше за все інше і БЕЗ огляду на підказки.
  //
  // Фікс після валізації: стрілка залишалась на смітнику з брухтом у руках і
  // на ноутбуці із замовленим комплектом. Обидва рази з тієї самої причини —
  // почату дію рахував лише `loopObjective`, який мовчить, коли підказки вже
  // вимкнено, і тоді слово брала вставка («порожня каса» → смітник) або ціль
  // ланцюга (→ ноутбук). А місце, куди гравець щойно сходив, — це найгірше з
  // усього, на що стрілка може показувати: воно каже «повернись», коли робота
  // насправді вже в руках.
  const carrying = (player.carrying ?? []).map(i => i.type)
  if (carrying.includes('drone')) {
    const box = nearest('mailbox')
    if (box) return box
  }
  if (carrying.includes('kit_box') || carrying.includes('scrap')) {
    const bench = nearest('bench', true)
    if (bench) return bench
  }

  // Кур'єр у дорозі. Коробка ще не тут, вести до порожнього слота нема сенсу, а
  // назад до ноутбука — тим паче: замовлення вже зроблено. Кілька секунд без
  // стрілки — це і є правильна відповідь («чекаємо»), і саме її картка квесту
  // проговорює словами.
  const pending = (world.game.deliveries ?? []).some(d =>
    d.status === DeliveryStatus.TRANSIT && d.readyAt > world.now)

  // Стрілка петлі працює, поки діють підказки — АБО поки ланцюг просить саму
  // петлю («продай 3 дрони»). Друге дописано після тесту: без нього гра казала
  // «продай ще два» і не показувала, що для цього треба зробити далі.
  const general = guidanceActive(world.game) || questIsLoop(world.game)
  const scrap   = scrapGuidanceActive(world.game)

  // Порядок у Стадії 9 перевернуто. До неї закріплений квест бив усе — і
  // стрілка тягла до шафи, поки в руках була коробка. Тепер спершу незавершена
  // ФІЗИЧНА дія (щось у руках, готовий дрон на верстаку, згорілий верстак), і
  // лише коли петля чиста — зона активного квесту.
  const loop = loopObjective(world, interactions, player, general, scrap, false, pending)
  if (loop) return loop

  // Вставка (згорілий комплект, порожня каса) — раніше за ціль ланцюга: вона
  // про те, що прямо зараз стоїть на місці.
  const stuck = interruptQuest(world.game)
  if (stuck) {
    const zone = nearest(stuck.zoneKind)
    if (zone) return zone
  }

  // Ціль ланцюга (Р1) не замовкає разом з підказками: підказки вчать петлю,
  // ланцюг веде по грі, і він потрібен якраз тоді, коли петля вже звична.
  const questKind = questZoneKind(world.game)
  if (!(pending && questKind === 'desk')) {
    const quest = nearest(questKind)
    if (quest) return quest
  }

  // Стіл — остання інстанція. Замовити ще один комплект завжди «можна», тому
  // без цього розділення стіл забирав стрілку в кожної цілі, поки діють
  // підказки: гроші на паяльник — це майже завжди й гроші на комплект.
  return loopObjective(world, interactions, player, general, scrap, true, pending)
}

// Найближча корисна зона в межах одного оберту петлі — те, чим стрілка була до
// Стадії 9. Повертає null, коли робити нічого або підказки вже вимкнено.
function loopObjective(world, interactions, player, general, scrap, withDesk = false, pending = false) {
  if (!general && !scrap) return null

  // Order matters: finish what is in your hands before starting something new.
  // The output table sits just under the mailbox: a finished drone is worth
  // collecting before fetching the next box (S1.2).
  // The desk sits last: fetch, build and sell what is already in the shop
  // before ordering more.
  const PRIORITY = [
    'mailbox', 'bench_out', 'bench', 'delivery_slot', 'trashbin', 'piggy', 'desk',
  ]

  let best = null
  let bestRank = Infinity
  for (const zone of world.zones ?? []) {
    // The bin keeps its arrow after the general hints have stopped.
    if (zone.kind === 'trashbin' ? !scrap : !general) continue
    // Стіл розглядається лише в другому заході — після цілі ланцюга (Стадія 9).
    // І ніколи, поки їде вже замовлене: коробка в дорозі — це не привід іти
    // назад до ноутбука.
    if (zone.kind === 'desk' && (!withDesk || pending)) continue
    const rank = PRIORITY.indexOf(zone.kind)
    if (rank < 0 || rank > bestRank) continue
    const def = interactions[zone.kind]
    if (!def?.enabled(world, zone, player)) continue
    // A desk you cannot usefully use must not pull the arrow (S2).
    if (def.attention && !def.attention(world, zone, player)) continue

    if (rank < bestRank) { bestRank = rank; best = zone; continue }
    // Same kind: take the nearer one.
    if (Math.hypot(zone.cx - player.x, zone.cy - player.y) <
        Math.hypot(best.cx - player.x, best.cy - player.y)) best = zone
  }
  return best
}
