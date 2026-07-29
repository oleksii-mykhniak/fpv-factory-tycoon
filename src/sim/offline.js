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
  Phase, calcPrice, stationsOf, workersInRole, bumpStats,
  kitCost, kitBasePrice, kitSolderPointCount,
} from '../state/gameState.js'
import { salePriceMult } from '../state/upgrades.js'
import { roleLevelData, ROLE_ORDER } from '../defs/roles.js'
import { OFFLINE_CAP_MS, OFFLINE_EFFICIENCY, MANAGER_RESERVE } from '../state/config.js'
// Модель циклу й вибір комплекту — спільні з живим цехом (Стадія 11 / B).
// Ре-експорт, бо споживачі звикли брати темп саме звідси.
import { pointMsFor, kitCycleMs, bestKitByValue } from './economy.js'
export { pointMsFor, kitCycleMs }

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
  return sold ? { money, sold, earned, kitId: kit.id } : null
}

// Який комплект цех купував би всю ніч.
//
// Навмисно НЕ managerKitChoice: та функція питає «чи є вільний слот доставки і
// вільний верстак ЗАРАЗ», бо описує один тік живого менеджера. Тут же йдеться
// про кілька годин, і момент, у який гравець закрив гру, не має вирішувати, чи
// цех працював уночі. А от КРИТЕРІЙ вибору спільний і живе в `economy.js`
// (Стадія 11 / B): нічна зміна не має возити інший комплект, ніж той самий цех
// возив би на очах у гравця. Спільне з живим менеджером — те, що важить: тир і
// каса.
function offlineKit(game) {
  const tier = roleLevelData('manager', bestLevel(game, 'manager')).tier ?? 0
  return bestKitByValue(game, tier)
}

// Додати нічний підрахунок до збереженого. Обидві мапи монотонні, тож це
// звичайне додавання — але писати його двічі не варто: розійтись вони можуть
// тільки тут.
function mergeTally(saved = {}, add = {}) {
  const out = { ...saved }
  for (const [kitId, n] of Object.entries(add)) out[kitId] = (out[kitId] ?? 0) + n
  return out
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
  // По типах — теж (Стадія 11 / A1). Норма збірок на наступний Mk рахується
  // саме звідси, і нічна зміна не має бути дірою в ній: цех, який працює сам,
  // збирає по-справжньому.
  const builtByKit = {}
  const soldTally  = {}
  const tally = (map, kitId) => { if (kitId) map[kitId] = (map[kitId] ?? 0) + 1 }

  const stations = stationsOf(game).map(station => {
    // A bench mid-assembly finishes if something could work it.
    if (station.phase === Phase.ASSEMBLY && rate) {
      const left = kitSolderPointCount(game, station.kitId) - station.solderPoints.length
      if (left * rate.ms <= elapsedMs) {
        assembled++
        tally(builtByKit, station.kitId)
        const quality = Math.max(0, rate.q - station.coldPenalty)
        // Only a hired seller can bank it; otherwise it waits on the bench.
        if (hasSeller) {
          const price = calcPrice(kitBasePrice(game, station.kitId), quality, salePriceMult(game))
          money  += price
          earned += price
          sold++
          tally(soldTally, station.kitId)
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
      // Усі повні цикли — один і той самий комплект: менеджер обирає його раз
      // на всю ніч (`offlineKit`).
      builtByKit[full.kitId] = (builtByKit[full.kitId] ?? 0) + full.sold
      soldTally[full.kitId]  = (soldTally[full.kitId]  ?? 0) + full.sold
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
    soldByKit:      mergeTally(st.soldByKit, soldTally),
    assembledByKit: mergeTally(st.assembledByKit, builtByKit),
  }))
  return { elapsedMs, assembled, sold, earned, cycles, state }
}
