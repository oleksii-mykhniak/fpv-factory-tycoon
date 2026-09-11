// Контракти (Стадія 14 / К3) — ритм у продажу.
//
// Доти продаж був безликий: дрон лягав у ящик відвантаження, гроші капали, і
// жодна хвилина не відрізнялась від сусідньої. Контракт не додає дії — він
// додає ПРИЧИНУ зібрати саме цей тип саме зараз.
//
// Три правила, з яких усе інше випливає:
//
//   1. Контракт закривається ВІДВАНТАЖЕННЯМ (К3.3). Гравець не «здає» партію —
//      дрон, що лягає в скриньку, спершу закриває контракт свого типу й лише
//      потім продається за звичайною ціною. Тобто жодної нової дії; змінюється
//      тільки ціна.
//   2. Штраф — у репутації, не в грошах (К3.4). Тайкун, у якому дедлайн може
//      загнати в мінус, перестає бути грою про ріст.
//   3. Репутація — це ТЕ, ЗА ЩО дають кращі контракти. Саме тут трек
//      `reputation` нарешті означає щось, крім множника ціни.
//
// Чисті функції над станом, як і всі інші файли в state/: жодного таймера,
// жодного rng поза переданим.

import { KIT_TYPES } from './kits.js'
import { UPGRADE_TRACKS } from './upgrades.js'
import {
  CONTRACT_SLOTS, CONTRACT_QTY_BASE, CONTRACT_QTY_STEP,
  CONTRACT_MS_PER_UNIT, CONTRACT_MS_FLOOR,
  CONTRACT_BONUS_SHARE, CONTRACT_REP_REWARD, CONTRACT_REP_PENALTY,
} from './config.js'

export const contractsOf = (state) => state?.contracts ?? []

// Репутація, за якою генеруються контракти. Складається з купленого треку і
// заробленого на контрактах: трек — це «про вас чули», контракти — «з вами
// мали справу». Розділяти їх у стані обов'язково (трек купується за гроші й
// не має зменшуватись від провалу), складати для гри — теж.
export function contractStanding(state) {
  const track = state?.upgrades?.[UPGRADE_TRACKS.reputation.stateKey] ?? 0
  return Math.max(0, track + (state?.contractRep ?? 0))
}

// Скільки штук просить контракт цього рівня репутації.
export const contractQty = (standing) =>
  Math.max(1, Math.round(CONTRACT_QTY_BASE + CONTRACT_QTY_STEP * standing))

// Скільки часу на нього дається. Від КІЛЬКОСТІ, а не від репутації: більша
// партія — більше часу, інакше зростання репутації каралося б дедлайном.
export const contractWindowMs = (qty) =>
  Math.max(CONTRACT_MS_FLOOR, qty * CONTRACT_MS_PER_UNIT)

// Премія — частка від базової ціни партії, порахована в момент видачі й
// записана в контракт. Саме записана: базова ціна їде з Mk, і премія, яка
// перераховувалась би на льоту, змінювалась би під гравцем уже після того, як
// він вирішив цей контракт брати.
export const contractBonus = (kitId, qty) =>
  Math.round((KIT_TYPES[kitId]?.basePrice ?? 0) * qty * CONTRACT_BONUS_SHARE)

// Один новий контракт. `kitIds` — що цех узагалі вміє зараз (каталог локації),
// тож контракт ніколи не просить типу, якого гравцеві ще не відкрили.
export function rollContract(state, { kitIds, now, rng, id }) {
  if (!kitIds?.length) return null
  const kitId    = kitIds[Math.floor(rng() * kitIds.length) % kitIds.length]
  const standing = contractStanding(state)
  const qty      = contractQty(standing)
  return {
    id,
    kitId,
    qty,
    done:  0,
    dueAt: now + contractWindowMs(qty),
    bonus: contractBonus(kitId, qty),
  }
}

// Тримає слоти повними. Виклик щотика — тому й повертає ТОЙ САМИЙ стан, коли
// нічого не змінилось: інакше кожен тік писав би новий об'єкт стану й будь-яке
// порівняння «змінилось?» вище за течією зламалось би.
export function refillContracts(state, { kitIds, now, rng, makeId }) {
  const open = contractsOf(state)
  if (open.length >= CONTRACT_SLOTS) return state
  const added = []
  for (let i = open.length; i < CONTRACT_SLOTS; i++) {
    const c = rollContract(state, { kitIds, now, rng, id: makeId() })
    if (c) added.push(c)
  }
  if (!added.length) return state
  return { ...state, contracts: [...open, ...added] }
}

// Прострочені — геть, і по одиниці репутації за кожен. Повертає і стан, і
// список провалених: подія про провал має бути видною, інакше репутація
// просідає мовчки й гравець дізнається про це через півгодини по контрактах,
// які стали гіршими.
export function expireContracts(state, now) {
  const open   = contractsOf(state)
  const failed = open.filter(c => now >= c.dueAt)
  if (!failed.length) return { state, failed }
  return {
    state: {
      ...state,
      contracts:   open.filter(c => now < c.dueAt),
      // Підлоги немає у формулі, вона є в `contractStanding`: сам лічильник
      // хай лишається чесною історією, а от контракти гіршими за стартові не
      // стають ніколи.
      contractRep: (state.contractRep ?? 0) - CONTRACT_REP_PENALTY * failed.length,
    },
    failed,
  }
}

// Найстаріший незакритий контракт цього типу — той, що ближчий до дедлайну.
export const activeContractFor = (state, kitId) =>
  contractsOf(state)
    .filter(c => c.kitId === kitId && c.done < c.qty)
    .sort((a, b) => a.dueAt - b.dueAt)[0] ?? null

// Відвантажений дрон закриває контракт (К3.3).
//
// Повертає { state, contract, completed }: `contract` — у який зарахувалось
// (або null), `completed` — чи це була остання штука. Премія й репутація
// нараховуються ТУТ, щоб не існувало другого місця, яке вважає контракт
// виконаним.
export function creditShipment(state, kitId) {
  const target = activeContractFor(state, kitId)
  if (!target) return { state, contract: null, completed: false }

  const done      = target.done + 1
  const completed = done >= target.qty
  const updated   = { ...target, done }

  const contracts = contractsOf(state)
    .filter(c => c.id !== target.id)
    .concat(completed ? [] : [updated])

  return {
    state: {
      ...state,
      contracts,
      money:       state.money + (completed ? target.bonus : 0),
      contractRep: (state.contractRep ?? 0) + (completed ? CONTRACT_REP_REWARD : 0),
    },
    contract: updated,
    completed,
  }
}
