// Worker roles — who you can hire and what they will pick up off the job board.
//
// A role is a filter over task types plus per-level stats. Adding "прибиральник"
// or "комірник" later means adding an entry here and a matching task in
// defs/tasks.js; the AI, the job board and the hiring UI all read this registry.

import {
  HIRE_COST_BASE, HIRE_COST_GROWTH,
  WORKER_UPGRADE_BASE, WORKER_LEVEL_GROWTH,
  ROLE_CURVES, roleCurveValue, managerTier,
} from '../state/config.js'

export const ROLES = Object.freeze({
  courier: {
    id: 'courier',
    name: "Кур'єр",
    emoji: '🏃',
    // Livery (S1.4): the shop is read at a glance, so who is who has to be a
    // colour and not a job title. `color` tints the sprite and the ring under
    // the feet; `badge` rides above the head.
    color: '#4a8ef0',
    badge: '📦',
    hint: 'Носить коробки з вулиці на верстак',
    accepts: ['haul_delivery'],
    hire: { base: HIRE_COST_BASE.courier, growth: HIRE_COST_GROWTH },
  },

  tech: {
    id: 'tech',
    name: 'Технік',
    emoji: '🔧',
    color: '#f0a030',
    badge: '🔧',
    hint: 'Паяє за вас — навіть з ручним паяльником',
    accepts: ['assemble'],
    hire: { base: HIRE_COST_BASE.tech, growth: HIRE_COST_GROWTH },
    // A hired tech works the bench at their own pace and quality; the soldering
    // upgrade adds on top. Without this, hiring one at soldering level 0 would
    // do nothing at all — exactly when the player most wants the help.
  },

  seller: {
    id: 'seller',
    name: 'Продавець',
    emoji: '📮',
    color: '#4fbf6a',
    badge: '💵',
    hint: 'Відносить готові дрони до скриньки',
    accepts: ['sell_drone'],
    hire: { base: HIRE_COST_BASE.seller, growth: HIRE_COST_GROWTH },
  },

  // Procurement (S3): works the laptop, so the player stops being the one who
  // has to remember to order. With this role hired alongside the other three
  // the loop closes — order, haul, solder, sell — and the player becomes the
  // one who speeds things up rather than the one it stops without.
  manager: {
    id: 'manager',
    name: 'Менеджер',
    emoji: '🧑‍💼',
    hint: 'Сам замовляє комплекти за ноутбуком',
    color: '#a06ad8',
    badge: '🧾',
    accepts: ['order_kit'],
    hire: { base: HIRE_COST_BASE.manager, growth: HIRE_COST_GROWTH },
  },
})

export const ROLE_ORDER = Object.freeze(['courier', 'tech', 'seller', 'manager'])

export function roleDef(roleId) {
  const role = ROLES[roleId]
  if (!role) throw new Error(`roleDef: невідома роль "${roleId}"`)
  return role
}

// Характеристики ролі на цьому рівні (Стадія 10 / C).
//
// Була таблиця з трьох рядків — тобто два підвищення на людину за все життя.
// Тепер це криві з `ROLE_CURVES`, які йдуть до асимптоти: стелі немає, але
// кур'єр не розганяється до телепорту, а технік не паяє за нуль секунд.
//
// `levels` як масив у ролях більше немає навмисно: доти дві речі описували ту
// саму характеристику — таблиця тут і числа в config.js, — і розійтися вони
// могли будь-коли.
export function roleLevelData(roleId, level) {
  const curves = ROLE_CURVES[roleDef(roleId).id] ?? {}
  const lvl    = Math.max(0, level ?? 0)
  const out    = {}
  for (const [key, curve] of Object.entries(curves)) out[key] = roleCurveValue(curve, lvl)
  if (roleId === 'manager') out.tier = managerTier(lvl)
  return out
}

// Hiring the n-th worker of a role costs base × growth^n — the curve is what
// keeps automation a goal rather than a first purchase.
export function hireCost(roleId, alreadyHired) {
  const { hire } = roleDef(roleId)
  return Math.round(hire.base * Math.pow(hire.growth, alreadyHired))
}

// Стелі більше немає (Стадія 10 / C). Лишається функцією, а не константою, бо
// на неї спираються і панель, і бирка над головою: хай питання «докуди можна»
// має одну відповідь, навіть коли відповідь — «докуди завгодно».
export function roleMaxLevel() {
  return Infinity
}

// Promoting somebody from `level` to the next one (F5). Ніколи не null:
// підвищувати можна завжди, ціна і є обмежувачем.
export function promoteCost(roleId, level) {
  const base = WORKER_UPGRADE_BASE[roleId] ?? 300
  return Math.round(base * Math.pow(WORKER_LEVEL_GROWTH, level))
}

// Which roles can take this task type.
export const roleColor = (roleId) => ROLES[roleId]?.color ?? '#f0a030'
export const roleBadge = (roleId) => ROLES[roleId]?.badge ?? '•'

export function rolesFor(taskType) {
  return ROLE_ORDER.filter(id => ROLES[id].accepts.includes(taskType))
}
