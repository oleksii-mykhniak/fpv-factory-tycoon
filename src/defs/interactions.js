// What each kind of trigger zone does.
//
// This is the table the plan calls "one implementation, two sources of intent":
// a hired worker standing in a zone (C5) runs exactly the same `run` as the
// player's character does. Nothing here knows which one it is.
//
// Each entry:
//   dwellMs   — time inside before it fires (0 = instant)
//   repeat    — may it fire again while the character keeps standing there?
//               True for work (a bench keeps producing); false for anything
//               that opens a mini-game, or standing at the bin would restart
//               the salvage game every 900 ms and its counter would never move.
//   accepts   — 'player' | 'worker' | 'any'
//   enabled   — is there anything to do right now? A disabled zone shows no
//               progress ring and never fires, so the player is never asked to
//               stand and wait for nothing
//   run       — apply the effect; may mutate world.game and push events

import {
  Phase, DeliveryStatus, KIT_TYPES,
  pickupDelivery, startAssembly, startScrapAssembly, getStation,
  sell as sellStation, calcPrice, takeOutput, abandonBurntDrone,
  beginScrapRun, idleStations,
  kitCost, kitBasePrice,
  dismantleKit, researchYield, researchPoints, rejectDrone,
} from '../state/gameState.js'
import { salePriceMult } from '../state/upgrades.js'
import {
  ZONE_DWELL_INSTANT_MS, ZONE_DWELL_BENCH_MS, ZONE_DWELL_OUTPUT_MS,
  ZONE_DWELL_MAILBOX_MS, ZONE_DWELL_TRASH_MS, ZONE_DWELL_PANEL_MS,
  CARRY_CAPACITY, MANAGER_COOLDOWN_MS, SALVAGE_RATE, RESEARCH_DWELL_MS,
  FLIGHT_MS, FLIGHT_PRICE_BONUS, FLIGHT_REJECT_QUALITY, FLIGHT_SKIP_REP_PENALTY,
} from '../state/config.js'
import { EV, emit } from '../sim/events.js'
import {
  piggyShouldShow, shopNeedsAttention, upgradeNeedsAttention, hireNeedsAttention,
  rescueKitAvailable, cheapestKitCost,
  managerOrderChoice,
} from '../sim/derive.js'
import { hiringAllowed } from '../state/locations.js'
import { roleLevelData } from './roles.js'
import { creditShipment } from '../state/contracts.js'
import { orderKitInto } from '../sim/intake.js'

// ── Carry helpers ─────────────────────────────────────────

export const carriedType = (agent, type) => (agent.carrying ?? []).find(i => i.type === type)
export const carryFull   = (agent) => (agent.carrying ?? []).length >= CARRY_CAPACITY
export const carryEmpty  = (agent) => (agent.carrying ?? []).length === 0

function take(agent, item) {
  agent.carrying = [...(agent.carrying ?? []), item]
}

function drop(agent, type) {
  const idx = (agent.carrying ?? []).findIndex(i => i.type === type)
  if (idx < 0) return null
  const [item] = agent.carrying.splice(idx, 1)
  return item
}

// Someone else already has this delivery in hand.
const someoneCarrying = (world) =>
  (world.game.deliveries ?? []).some(d => d.status === DeliveryStatus.CARRYING)

// ── Interaction registry ──────────────────────────────────

export const INTERACTIONS = {
  // Street slot: grab an arrived box.
  delivery_slot: {
    dwellMs: ZONE_DWELL_INSTANT_MS,
    repeat:  false,
    accepts:  'any',
    enabled(world, zone, agent) {
      if (carryFull(agent) || someoneCarrying(world)) return false
      return !!arrivedIn(world, zone)
    },
    run(world, zone, agent, events) {
      const delivery = arrivedIn(world, zone)
      if (!delivery) return
      world.game = pickupDelivery(world.game, delivery.id, world.now, agent.id)
      take(agent, { type: 'kit_box', kitId: delivery.kitId, deliveryId: delivery.id })
      emit(events, EV.DELIVERY_PICKED, { id: delivery.id, kitId: delivery.kitId, slotIndex: delivery.slotIndex })
      emit(events, EV.ITEM_PICKED, { agentId: agent.id, item: 'kit_box' })
    },
  },

  // Приймальний ящик цеху (Стадія 12 / Д1). Навмисно ТЕ САМЕ визначення, що й
  // у вуличного слоту: робота кур'єра не змінилась, змінилось тільки місце, де
  // чекає коробка.
  intake: null,   // filled in below, from delivery_slot

  // Workbench, front side: drop a box to start assembly, or — while it is being
  // assembled — work at it. Collecting the result happens at `bench_out`.
  bench: {
    dwellMs: ZONE_DWELL_BENCH_MS,
    repeat:  true,
    accepts:  'any',
    enabled(world, zone, agent) {
      const station = stationOf(world, zone)
      if (!station) return false
      const { phase } = station
      const hasBox = carriedType(agent, 'kit_box')
      // A box can only be put down where there is a delivery to consume.
      if (hasBox) return phase === Phase.IDLE
      if (carriedType(agent, 'scrap')) return phase === Phase.IDLE
      // A burnt kit is cleared by whoever walks up to the bench with free
      // hands. Until now nothing could clear one at all: the modal that owned
      // that decision stopped being opened when soldering moved onto the floor
      // in C6, so a burnt station stayed BURNT for the rest of the save.
      if (phase === Phase.BURNT) return carryEmpty(agent)
      // ASSEMBLY is not a trigger any more (C6): working a bench is continuous
      // presence, shown by the soldering strip, not a one-shot dwell.
      return false
    },
    run(world, zone, agent, events) {
      const station   = stationOf(world, zone)
      const stationId = station.id

      if (carriedType(agent, 'kit_box')) {
        drop(agent, 'kit_box')
        world.game = startAssembly(world.game, stationId)
        emit(events, EV.ITEM_DROPPED, { agentId: agent.id, item: 'kit_box', stationId })
        emit(events, EV.STATE_DIRTY)
        return
      }
      if (carriedType(agent, 'scrap')) {
        drop(agent, 'scrap')
        world.game = startScrapAssembly(world.game, stationId)
        emit(events, EV.SCRAP_STARTED, { stationId })
        emit(events, EV.STATE_DIRTY)
        return
      }
      if (station.phase === Phase.BURNT) {
        const kit     = KIT_TYPES[station.kitId]
        const salvage = kit ? kitCost(world.game, kit.id) * SALVAGE_RATE : 0
        world.game = abandonBurntDrone(world.game, stationId, SALVAGE_RATE)
        emit(events, EV.MONEY_GAINED, { amount: salvage, reason: 'salvage' })
        emit(events, EV.BENCH_CLEARED, { reason: 'abandoned', stationId })
        emit(events, EV.STATE_DIRTY)
        return
      }
    },
  },

  // Workbench, output side: the only place a finished drone can be collected.
  bench_out: {
    dwellMs: ZONE_DWELL_OUTPUT_MS,
    repeat:  false,
    accepts:  'any',
    enabled(world, zone, agent) {
      const station = stationOf(world, zone)
      if (!station) return false
      // `takenBy` is what stops the drone being taken twice: before it existed
      // the station stayed READY while the drone was already in somebody's
      // hands, so the job board sent a seller to fetch a second, imaginary one.
      if (station.phase !== Phase.READY || station.takenBy) return false
      return !carryFull(agent)
    },
    run(world, zone, agent, events) {
      const station = stationOf(world, zone)
      if (!station || station.phase !== Phase.READY || station.takenBy) return
      world.game = takeOutput(world.game, station.id, agent.id)
      take(agent, { type: 'drone', kitId: station.kitId, stationId: station.id })
      emit(events, EV.ITEM_PICKED, { agentId: agent.id, item: 'drone', stationId: station.id })
      emit(events, EV.STATE_DIRTY)
    },
  },

  // Mailbox: hand over a finished drone.
  mailbox: {
    dwellMs: ZONE_DWELL_MAILBOX_MS,
    repeat:  false,
    accepts:  'any',
    enabled: (_world, _zone, agent) => !!carriedType(agent, 'drone'),
    run(world, zone, agent, events) {
      const drone = drop(agent, 'drone')
      emit(events, EV.ITEM_DROPPED, { agentId: agent.id, item: 'drone' })

      // The drone remembers which station built it, so the right one clears.
      const stationId = drone?.stationId ??
        (world.game.stations ?? []).find(s => s.phase === Phase.READY)?.id
      if (!stationId) return

      const station = getStation(world.game, stationId)
      if (station.phase !== Phase.READY) return

      const kit     = KIT_TYPES[station.kitId]
      const quality = station.quality
      // Обліт (Стадія 14 / К4.2) змінює рівно одне число — ціну. Усе інше в
      // продажу лишилось тим самим, і це й був сенс зробити обліт зупинкою на
      // маршруті, а не окремою дією.
      const flown = drone?.flown === true
      const price = calcPrice(kitBasePrice(world.game, kit.id), quality, salePriceMult(world.game))
        * (flown ? 1 + FLIGHT_PRICE_BONUS : 1)

      // `at` and `hallId` are what make income measurable (F7): a rolling
      // window needs times, and "which hall paid for itself" needs a place.
      // Both are cheap to record and impossible to reconstruct later.
      world.salesLog.push({ quality, price, at: world.now, hallId: stationHallOf(world, stationId) })
      world.game = sellStation(world.game, stationId)

      // Брак, пропущений повз майданчик. Ціну репутацією платить тільки той,
      // у кого майданчик Є: доти в грі немає що пропускати, і мовчазний мінус
      // у лічильник до появи кімнати був би пасткою.
      if (!flown && quality < FLIGHT_REJECT_QUALITY && hasFlightPad(world)) {
        world.game = {
          ...world.game,
          contractRep: (world.game.contractRep ?? 0) - FLIGHT_SKIP_REP_PENALTY,
        }
        emit(events, EV.BAD_SHIPPED, { kitId: kit.id, quality, zoneId: zone?.id })
      }

      // Контракт закривається САМЕ ТУТ (Стадія 14 / К3.3): дрон спершу йде в
      // рахунок активного замовлення свого типу й лише потім продається за
      // звичайною ціною. Для гравця це нуль нових дій — змінюється тільки те,
      // скільки лягає на рахунок.
      const credited = creditShipment(world.game, kit.id)
      world.game = credited.state
      if (credited.completed) {
        emit(events, EV.CONTRACT_FILLED, {
          id: credited.contract.id, kitId: kit.id,
          qty: credited.contract.qty, bonus: credited.contract.bonus,
          zoneId: zone?.id,
        })
        emit(events, EV.MONEY_GAINED, { amount: credited.contract.bonus, reason: 'contract' })
      }

      // zoneId — щоб «+$47» вилетіло над ТІЄЮ скринькою, куди донесли дрон
      // (Стадія 10 / D3). У фабрики скриньок кілька (F4), тож без цього текст
      // з'являвся б над першою-ліпшою — той самий клас помилки, що й одна
      // пульсація на всі дошки найму.
      emit(events, EV.SALE_MADE, {
        kitId: kit.id, quality, price, stationId, agentId: agent.id, zoneId: zone?.id,
      })
      emit(events, EV.MONEY_GAINED, { amount: price, reason: 'sale' })
      emit(events, EV.BENCH_CLEARED, { reason: 'sold' })
      emit(events, EV.STATE_DIRTY)
    },
  },

  // Дослідницький стенд (Стадія 14 / К2).
  //
  // Того самого крою, що й верстак: місце, яке щось робить, ПОКИ БІЛЯ НЬОГО
  // ХТОСЬ СТОЇТЬ. Комплект у руках перетворюється на очки — саме тому стенд
  // нічого не виробляє й не має фази: усе, що від нього лишається, лежить у
  // банку очок, а не на столі.
  //
  // `accepts: 'any'` — лабораторія без інженера не працює САМА, але гравець
  // може постояти там своїми руками, як і за верстаком.
  research: {
    dwellMs: RESEARCH_DWELL_MS,
    repeat:  false,
    accepts: 'any',
    enabled: (_world, _zone, agent) => !!carriedType(agent, 'kit_box'),
    run(world, zone, agent, events) {
      const box = carriedType(agent, 'kit_box')
      if (!box) return
      // Рівень інженера множить ВИХІД, а не швидкість: підвищення тут має
      // означати «розбирає глибше», інакше це був би ще один трек швидкості.
      const mult = agent.role === 'engineer'
        ? (roleLevelData('engineer', agent.level ?? 0).yieldMult ?? 1)
        : 1
      const points = researchYield(world.game, box.kitId, mult)
      drop(agent, 'kit_box')
      world.game = dismantleKit(world.game, mult)
      emit(events, EV.ITEM_DROPPED, { agentId: agent.id, item: 'kit_box' })
      emit(events, EV.RESEARCH_DONE, {
        kitId: box.kitId, points, total: researchPoints(world.game),
        agentId: agent.id, zoneId: zone?.id,
      })
      emit(events, EV.STATE_DIRTY)
    },
  },

  // Майданчик обльоту (Стадія 14 / К4).
  //
  // Готовий дрон літає над майданчиком, перш ніж піти у відвантаження. Це
  // додає рівно одну ланку в маршрут продавця — і саме тому кімната має
  // стояти поруч із цехами (інваріант Д4 Стадії 12 поширюється на неї).
  //
  // Що дає: облітаний дрон коштує дорожче, а брак ловиться ТУТ і не доїжджає
  // до клієнта. Пропустити обліт можна завжди — дешевше й ризикованіше.
  flight_pad: {
    dwellMs: FLIGHT_MS,
    repeat:  false,
    accepts: 'any',
    enabled(world, zone, agent) {
      const drone = carriedType(agent, 'drone')
      if (!drone || drone.flown) return false
      // К4.3 — один майданчик обробляє один дрон за раз. Це нормально і навіть
      // потрібно: перше вузьке місце, яке не лікується купівлею ще одного
      // верстака.
      return !padBusy(world, zone, agent)
    },
    run(world, zone, agent, events) {
      const drone = carriedType(agent, 'drone')
      if (!drone) return
      const station = drone.stationId ? stationById(world, drone.stationId) : null
      const quality = station?.quality ?? drone.quality ?? 1

      if (quality < FLIGHT_REJECT_QUALITY && station) {
        // Брак, спійманий на обльоті: дрон не летить до клієнта, з комплекту
        // повертається утиль. Дорого — і рівно тому оснастка (якість пайки)
        // вперше має видиму ціну.
        const salvage = kitCost(world.game, station.kitId) * SALVAGE_RATE
        drop(agent, 'drone')
        world.game = rejectDrone(world.game, station.id, SALVAGE_RATE)
        emit(events, EV.MONEY_GAINED, { amount: salvage, reason: 'flight_reject' })
        emit(events, EV.FLIGHT_REJECTED, {
          kitId: station.kitId, quality, salvage, zoneId: zone?.id,
        })
        emit(events, EV.BENCH_CLEARED, { reason: 'rejected', stationId: station.id })
        emit(events, EV.STATE_DIRTY)
        return
      }

      drone.flown = true
      emit(events, EV.FLIGHT_PASSED, {
        kitId: drone.kitId, quality, agentId: agent.id, zoneId: zone?.id,
      })
    },
  },

  // Стіл контрактів (Стадія 14 / К3.2) — те саме, що дошка найму: місце,
  // яке відкриває панель. Жодної нової механіки, інший список усередині.
  contracts: {
    dwellMs: ZONE_DWELL_PANEL_MS,
    repeat:  false,
    accepts: 'player',
    enabled: () => true,
    run: (_world, _zone, agent, events) =>
      emit(events, EV.PANEL_REQUESTED, { agentId: agent.id, panel: 'contracts' }),
  },

  // Trash bin: salvage parts, or throw away a burnt kit.
  trashbin: {
    dwellMs: ZONE_DWELL_TRASH_MS,
    repeat:  false,
    accepts:  'any',
    // Самообслуговування: копирсатись у смітнику можна будь-коли, аби були
    // вільні руки й вільний верстак, куди принести деталі. Умови «спершу
    // замов брухт у ноутбуці» більше немає — саме вона робила безкоштовний
    // порятунок платним у кроках.
    enabled: (world, _zone, agent) =>
      carryEmpty(agent) && idleStations(world.game).length > 0,
    // Копирсатись можна завжди, але РАДИТИ це варто лише коли інакше ніяк:
    // безкоштовний дрон із брухту дешевий, і стрілка, яка тягне до смітника
    // при повній касі, вчила б грати гірше. `enabled` — «тут щось станеться»,
    // `attention` — «сюди зараз варто».
    // `cheapestKitCost(world.game)`, а не `cheapestKitCost`: без виклику це
    // порівняння числа з функцією, тобто завжди false — смітник не світився
    // навіть на порожній касі.
    attention: (world) => world.game.money < cheapestKitCost(world.game),
    run(world, _zone, agent, events) {
      world.game = beginScrapRun(world.game)
      emit(events, EV.MINIGAME_REQUESTED, { agentId: agent.id, game: 'scrap' })
      emit(events, EV.STATE_DIRTY)
    },
  },

  // ── Panels as places (S2) ───────────────────────────────
  //
  // Ordering a kit, buying an upgrade and hiring used to be buttons on a bar
  // pinned over the game. They are objects in the room now: the same
  // request-and-answer path the mini-games already use, so no modal had to be
  // rewritten — only where you ask for it changed.
  //
  // accepts: 'player' — a hired worker has no business opening the player's
  // shop. `repeat: false` means the panel opens once per visit, so closing it
  // while still standing at the desk does not immediately reopen it.

  // Desk with a laptop: order kits.
  //
  // Two sources of intent at one object, exactly as at the bench (C2): the
  // player standing here opens the shop, a procurement manager standing here
  // places the order themselves (S3). Neither knows about the other.
  //
  // `enabled` and `attention` differ here for the first time. The player may
  // always walk up and look at the shop — a panel that refuses to open because
  // you are broke would just look broken. What the desk must NOT do is glow and
  // drag the guidance arrow over when there is nothing worth buying.
  desk: {
    dwellMs: ZONE_DWELL_PANEL_MS,
    repeat:  false,
    accepts: 'any',
    enabled(world, _zone, agent) {
      if (agent.kind === 'player') return true
      if (agent.role !== 'manager') return false
      if (world.now < (world.managerNextOrderAt ?? 0)) return false
      return !!managerOrderChoice(world.game, agent.level ?? 0)
    },
    attention: (world, _zone, agent) =>
      agent?.kind === 'player'
        ? shopNeedsAttention(world.game) || rescueKitAvailable(world.game)
        : true,
    run(world, _zone, agent, events) {
      if (agent.kind === 'player') {
        emit(events, EV.PANEL_REQUESTED, { agentId: agent.id, panel: 'shop' })
        return
      }
      const kit = managerOrderChoice(world.game, agent.level ?? 0)
      if (!kit) return
      orderKitInto(world, kit.id, () => `kit-${world.seq++}`)
      // A short cooldown so a rich manager does not fill every slot in one walk.
      world.managerNextOrderAt = world.now + MANAGER_COOLDOWN_MS
      emit(events, EV.DELIVERY_ORDERED, { kitId: kit.id, byAgent: agent.id })
      emit(events, EV.MONEY_SPENT, { amount: kitCost(world.game, kit.id), reason: 'order' })
      emit(events, EV.STATE_DIRTY)
    },
  },

  // Upgrade rack: the workshop's own kit.
  rack: {
    dwellMs: ZONE_DWELL_PANEL_MS,
    repeat:  false,
    accepts: 'player',
    enabled: () => true,
    attention: (world) => upgradeNeedsAttention(world.game),
    run: (_world, _zone, agent, events) =>
      emit(events, EV.PANEL_REQUESTED, { agentId: agent.id, panel: 'upgrade' }),
  },

  // Job board: hiring. Dark where nobody may be hired, so the player is never
  // walked over to a board that can only say no.
  jobboard: {
    dwellMs: ZONE_DWELL_PANEL_MS,
    repeat:  false,
    accepts: 'player',
    enabled: (world) => hiringAllowed(world.game),
    attention: (world, zone) => hireNeedsAttention(world.game, zone.meta?.hallId ?? null),
    run: (_world, zone, agent, events) =>
      emit(events, EV.PANEL_REQUESTED, {
        agentId: agent.id, panel: 'hire', hallId: zone.meta?.hallId ?? null,
      }),
  },

  // Piggy bank: the rescue mini-game.
  piggy: {
    dwellMs: ZONE_DWELL_INSTANT_MS,
    repeat:  false,
    accepts:  'player',   // a hired worker has no use for the player's piggy bank
    enabled: (world) => piggyShouldShow(world.game),
    run: (_world, _zone, agent, events) =>
      emit(events, EV.MINIGAME_REQUESTED, { agentId: agent.id, game: 'piggy' }),
  },
}

// Ящик прийому — ЦЕ вуличний слот, який стоїть в іншому місці. Аліас, а не
// копія: якщо підбір коробки колись зміниться, він зміниться в одному місці й
// обидва лишаться згодні.
INTERACTIONS.intake = INTERACTIONS.delivery_slot

// Should this zone be lit up and pointed at? Defaults to "is there anything to
// do here at all" — only the panels (S2) draw the distinction.
export function zoneWantsAttention(def, world, zone, agent) {
  if (!def?.enabled(world, zone, agent)) return false
  return def.attention ? def.attention(world, zone, agent) : true
}

// Which hall a station stands in (F2). Null where the layout has no halls.
function stationHallOf(world, stationId) {
  const i = (world.game.stations ?? []).findIndex(s => s.id === stationId)
  return world.layout?.stationSlots?.[i]?.hallId ?? null
}

// Чи стоїть на плані майданчик обльоту. Питаємо в зон, а не в сейву: кімната
// існує тоді, коли вона є на поверсі.
const hasFlightPad = (world) => (world.zones ?? []).some(z => z.kind === 'flight_pad')

// Хтось інший уже на майданчику з дроном у руках (К4.3).
function padBusy(world, zone, self) {
  return (world.agents ?? []).some(a =>
    a !== self &&
    (a.carrying ?? []).some(i => i.type === 'drone') &&
    Math.abs(a.x - zone.cx) <= zone.w / 2 &&
    Math.abs(a.y - zone.cy) <= zone.h / 2)
}

const stationById = (world, id) => {
  try { return getStation(world.game, id) } catch { return null }
}

// The station a bench zone belongs to.
function stationOf(world, zone) {
  try { return getStation(world.game, zone.meta?.stationId) } catch { return null }
}

// The arrived, unclaimed delivery waiting in this zone, if any.
//
// Про це питають два різні типи зон: вуличний слот (звіряється по slotIndex) і
// приймальний ящик цеху (по hallId). Одна функція на обох — саме те, що дозволяє
// ящику перевикористати взаємодію слоту цілком.
function arrivedIn(world, zone) {
  const byHall = zone.kind === 'intake'
  return (world.game.deliveries ?? []).find(d =>
    (byHall ? d.hallId === zone.meta?.hallId : d.slotIndex === zone.meta?.slotIndex) &&
    d.status === DeliveryStatus.TRANSIT &&
    d.readyAt <= world.now
  )
}

// Convenience for the view: what the carried item should look like.
//
// `pose` — назва пози того, хто несе (`pickPose`). Коробка завезена з трьох
// ракурсів, і бічна хода — єдиний випадок, коли фас бреше: людина йде профілем,
// а ящик у неї в руках дивиться в камеру. Три чверті збігаються з профілем
// рівно так само, як бічний аркуш персонажа збігається з фасом у решті поз.
//
// Дрон ракурсів не має: він один і той самий з усіх боків, і додавати йому
// «бічний» спрайт означало б малювати сім нових картинок заради пози, у якій
// його видно чверть секунди.
export function carrySpriteKey(item, pose = null) {
  if (item.type === 'kit_box')
    return pose === 'side' ? 'delivery_box_45' : 'delivery_box'
  if (item.type === 'drone' || item.type === 'burnt')
    return KIT_TYPES[item.kitId]?.spriteKey ?? 'mini_drone'
  return 'delivery_box'
}
