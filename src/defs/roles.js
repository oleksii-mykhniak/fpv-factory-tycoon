// Worker roles — who you can hire and what they will pick up off the job board.
//
// A role is a filter over task types plus per-level stats. Adding "прибиральник"
// or "комірник" later means adding an entry here and a matching task in
// defs/tasks.js; the AI, the job board and the hiring UI all read this registry.

import {
  HIRE_COST_BASE, HIRE_COST_GROWTH,
  COURIER_SPEED_BY_LEVEL, TECH_POINT_MS_BY_LEVEL, TECH_QUALITY_BY_LEVEL,
  SELLER_SPEED_BY_LEVEL,
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
    levels: COURIER_SPEED_BY_LEVEL.map(speed => ({ speed })),
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
    levels: TECH_POINT_MS_BY_LEVEL.map((pointMs, i) => ({
      speed:   COURIER_SPEED_BY_LEVEL[i] ?? COURIER_SPEED_BY_LEVEL[0],
      pointMs,
      quality: TECH_QUALITY_BY_LEVEL[i],
    })),
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
    levels: SELLER_SPEED_BY_LEVEL.map(speed => ({ speed })),
  },
})

export const ROLE_ORDER = Object.freeze(['courier', 'tech', 'seller'])

export function roleDef(roleId) {
  const role = ROLES[roleId]
  if (!role) throw new Error(`roleDef: невідома роль "${roleId}"`)
  return role
}

export function roleLevelData(roleId, level) {
  const role = roleDef(roleId)
  return role.levels[Math.min(level, role.levels.length - 1)]
}

// Hiring the n-th worker of a role costs base × growth^n — the curve is what
// keeps automation a goal rather than a first purchase.
export function hireCost(roleId, alreadyHired) {
  const { hire } = roleDef(roleId)
  return Math.round(hire.base * Math.pow(hire.growth, alreadyHired))
}

// Which roles can take this task type.
export const roleColor = (roleId) => ROLES[roleId]?.color ?? '#f0a030'
export const roleBadge = (roleId) => ROLES[roleId]?.badge ?? '•'

export function rolesFor(taskType) {
  return ROLE_ORDER.filter(id => ROLES[id].accepts.includes(taskType))
}
