// Offline settlement — what happened while the game was closed.
//
// Deliberately NOT a fast-forward of the simulation. Two hours is 144 000 ticks
// with A* and collision resolution in each one: seconds of frozen screen on a
// phone, to compute something the player will read as one number. This settles
// the work that was already in flight instead, using the same rates the live
// systems use.
//
// It also does not invent income the shop could not have made. Which work was
// possible depends on the staff:
//
//   без повного штату — тільки те, що вже було в роботі: ніхто не замовляє
//                       комплекти, тож новий цикл почати нікому;
//   повний штат (Р6)  — повні цикли: менеджер замовляє, кур'єр носить, технік
//                       паяє, продавець продає. Петля закрита, і цех справді
//                       крутиться без гравця.

import {
  Phase, KIT_TYPES, calcPrice, stationsOf, workersInRole, bumpStats,
  kitCost, kitBasePrice, kitDeliveryMs, kitSolderPointCount,
} from '../state/gameState.js'
import { levelData, salePriceMult, deliveryMult } from '../state/upgrades.js'
import { roleLevelData, ROLE_ORDER } from '../defs/roles.js'
import { OFFLINE_CAP_MS, OFFLINE_EFFICIENCY, MANAGER_RESERVE } from '../state/config.js'
import { kitsForLocation } from '../state/locations.js'

// Milliseconds per solder point for a station, given who could work it.
// Returns null when nothing could have made progress unattended.
//
// Експортується (Стадія 10 / B4), бо картка комплекту рахує той самий темп: два
// уявлення про «як швидко тут паяють» неминуче розійшлися б, і одне з них
// показувалося б гравцеві.
export function pointMsFor(game) {
  const solder = levelData('soldering', game.upgrades.solderingLevel)
  const techs  = workersInRole(game, 'tech')

  const rates = []
  if (solder.qualityMin !== undefined) rates.push({ ms: solder.pointDelayMs, q: (solder.qualityMin + solder.qualityMax) / 2 })
  if (techs.length) {
    const t = roleLevelData('tech', Math.max(...techs.map(w => w.level)))
    rates.push({ ms: t.pointMs, q: t.quality })
  }
  if (!rates.length) return null
  // Best available on each axis, same rule the live station uses.
  return { ms: Math.min(...rates.map(r => r.ms)), q: Math.max(...rates.map(r => r.q)) }
}

// Чи може цех крутити петлю сам (Стадія 9 / Р6).
//
// Умова — по одному з КОЖНОЇ з чотирьох ролей, і саме тому вона тут одна, а не
// список винятків: кожна роль знімає свою ділянку петлі (менеджер — замовлення,
// кур'єр — коробки, технік — пайку, продавець — продаж), і якщо бракує однієї,
// петля стоїть на ній. Тобто це не «скільки в тебе людей», а «чи закритий
// цикл» — і саме це остання ланка ланцюга квестів просить зробити.
export function shopRunsItself(game) {
  return ROLE_ORDER.every(role => workersInRole(game, role).length > 0)
}

// Скільки повних циклів цех міг зробити сам і скільки на цьому заробив.
//
// Аналітично, а не проганянням тіка: дві години — це 144 000 кроків із A* у
// кожному, тобто секунди замороженого екрана заради одного числа, яке гравець
// прочитає як «+$340».
//
// Вузьке місце циклу — найповільніша з двох речей: доставка комплекту і пайка.
// Вони йдуть паралельно (поки один комплект паяється, наступний їде), тому це
// max, а не сума. Гроші витрачаються по-справжньому: кожен цикл спершу купує
// комплект, і якщо каса не дозволяє — цикли закінчились.
// Скільки триває один цикл цього комплекту.
//
// Вузьке місце — найповільніша з двох речей: доставка й пайка. Вони йдуть
// паралельно (поки один комплект паяється, наступний їде), тому max, а не сума.
export function kitCycleMs(game, kitId, rate) {
  const benches  = Math.max(1, stationsOf(game).length)
  const assembly = kitSolderPointCount(game, kitId) * rate.ms
  const delivery = kitDeliveryMs(game, kitId) * deliveryMult(game)
  return Math.max(assembly, delivery) / benches
}

function settleFullCycles(game, elapsedMs, rate) {
  const kit = offlineKit(game)
  if (!kit) return null

  const cycleMs = kitCycleMs(game, kit.id, rate)
  if (!(cycleMs > 0)) return null

  const affordable = Math.floor(elapsedMs * OFFLINE_EFFICIENCY / cycleMs)
  if (affordable <= 0) return null

  let money = game.money, sold = 0, earned = 0
  for (let i = 0; i < affordable; i++) {
    // Резерв той самий, що й у живого менеджера: інакше цех прокидається з
    // нульовою касою і гравець не може купити нічого.
    const cost = kitCost(game, kit.id)
    if (money < cost * MANAGER_RESERVE) break
    const price = calcPrice(kitBasePrice(game, kit.id), rate.q, salePriceMult(game))
    money  += price - cost
    earned += price - cost
    sold++
  }
  return sold ? { money, sold, earned } : null
}

// Який комплект цех купував би всю ніч.
//
// Навмисно НЕ managerKitChoice: та функція питає «чи є вільний слот доставки і
// вільний верстак ЗАРАЗ», бо описує один тік живого менеджера. Тут же йдеться
// про кілька годин, і момент, у який гравець закрив гру, не має вирішувати, чи
// цех працював уночі. Спільне з живим менеджером — те, що важить: тир рівня і
// каса.
function offlineKit(game) {
  const tier = roleLevelData('manager', bestLevel(game, 'manager')).tier ?? 0
  const affordable = kitsForLocation(game)
    .filter(id => KIT_TYPES[id]?.cost > 0)
    .sort((a, b) => kitCost(game, a) - kitCost(game, b))
    .filter((id, i) => i <= tier && game.money >= kitCost(game, id) * MANAGER_RESERVE)
    .map(id => KIT_TYPES[id])
  return affordable.length ? affordable[affordable.length - 1] : null
}

// Найвищий рівень серед працівників ролі — офлайн платить по найкращому, як і
// живий цех (workSource бере найкраще по кожній осі).
function bestLevel(game, role) {
  const ws = workersInRole(game, role)
  return ws.length ? Math.max(...ws.map(w => w.level ?? 0)) : 0
}

// Returns { elapsedMs, assembled, sold, earned, cycles, state } — a pure settlement.
export function settleOffline(game, awayMs, now = Date.now()) {
  const elapsedMs = Math.max(0, Math.min(awayMs, OFFLINE_CAP_MS))
  const empty = { elapsedMs, assembled: 0, sold: 0, earned: 0, cycles: 0, state: game }
  if (elapsedMs < 60_000) return empty

  const rate = pointMsFor(game)
  const hasSeller = workersInRole(game, 'seller').length > 0

  let money     = game.money
  let assembled = 0
  let sold      = 0
  let earned    = 0

  const stations = stationsOf(game).map(station => {
    // A bench mid-assembly finishes if something could work it.
    if (station.phase === Phase.ASSEMBLY && rate) {
      const kit  = KIT_TYPES[station.kitId]
      const left = kitSolderPointCount(game, station.kitId) - station.solderPoints.length
      if (left * rate.ms <= elapsedMs) {
        assembled++
        const quality = Math.max(0, rate.q - station.coldPenalty)
        // Only a hired seller can bank it; otherwise it waits on the bench.
        if (hasSeller) {
          const price = calcPrice(kitBasePrice(game, station.kitId), quality, salePriceMult(game))
          money  += price
          earned += price
          sold++
          return { ...station, phase: Phase.IDLE, kitId: null, solderPoints: [], quality: null, coldPenalty: 0 }
        }
        return { ...station, phase: Phase.READY, quality }
      }
      // Partial progress: award the points that fit in the time away.
      const done = Math.floor(elapsedMs / rate.ms)
      if (done > 0) {
        return {
          ...station,
          solderPoints: [...station.solderPoints, ...Array(Math.min(done, left)).fill(rate.q)],
        }
      }
    }
    return station
  })

  // Повні цикли — тільки для цеху, який справді працює без гравця (Р6). Це
  // йде ПОСЛЕ доведення того, що вже було в роботі: спершу цех закінчує
  // початий комплект, і лише потім починає нові.
  let cycles = 0
  if (shopRunsItself(game) && rate) {
    const full = settleFullCycles({ ...game, money }, elapsedMs, rate)
    if (full) {
      money   = full.money
      sold   += full.sold
      cycles  = full.sold
      earned += full.earned
      assembled += full.sold
    }
  }

  // Hand back the very same state when nothing happened, so a caller can skip
  // the save and the "while you were away" screen on identity alone.
  const changed = cycles > 0 || stations.some((st, i) => st !== stationsOf(game)[i])
  if (!changed) return { elapsedMs, assembled, sold, earned, cycles, state: game }

  // Лічильники квестів (Р1) мусять рахувати й нічну зміну: продані дрони
  // однаково продані, і ціль «продай 10» не має скидатись у того, чий цех
  // працює сам.
  const state = bumpStats({ ...game, money, stations }, (st) => ({
    sold:      st.sold + sold,
    assembled: st.assembled + assembled,
  }))
  return { elapsedMs, assembled, sold, earned, cycles, state }
}
