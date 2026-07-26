import { describe, it, expect, beforeEach, vi } from 'vitest'
import { saveGame, loadGame, clearSave, SAVE_VERSION, MIN_LOADABLE_VERSION } from './storage.js'

const KEY = 'fpv_factory_save'

// Minimal localStorage — the module only uses get/set/remove.
function stubStorage() {
  const map = new Map()
  globalThis.localStorage = {
    getItem:    (k) => (map.has(k) ? map.get(k) : null),
    setItem:    (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  }
  return map
}

const write = (payload) => globalThis.localStorage.setItem(KEY, JSON.stringify(payload))

describe('save/storage — версія сейву', () => {
  let store

  beforeEach(() => {
    store = stubStorage()
    vi.spyOn(console, 'info').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  it('порожнє сховище — просто немає сейву', () => {
    expect(loadGame()).toBeNull()
  })

  it('щойно записаний сейв читається назад', () => {
    saveGame({ money: 42 }, [{ price: 10 }])
    const loaded = loadGame()
    expect(loaded.state.money).toBe(42)
    expect(loaded.salesLog).toHaveLength(1)
    expect(JSON.parse(store.get(KEY)).version).toBe(SAVE_VERSION)
  })

  it('застарілий сейв не читається — і не лишається лежати', () => {
    write({ version: MIN_LOADABLE_VERSION - 1, state: { money: 9999 }, salesLog: [] })
    expect(loadGame()).toBeNull()
    expect(store.has(KEY)).toBe(false)
  })

  it('сейв без поля version вважається найдавнішим', () => {
    write({ state: { money: 1 }, salesLog: [] })
    expect(loadGame()).toBeNull()
    expect(store.has(KEY)).toBe(false)
  })

  it('сейв із новішої збірки ігнорується, але НЕ видаляється', () => {
    write({ version: SAVE_VERSION + 1, state: { money: 1 }, salesLog: [] })
    expect(loadGame()).toBeNull()
    expect(store.has(KEY)).toBe(true)
  })

  it('версія в межах [MIN, SAVE] читається — бамп сам по собі не стирає', () => {
    for (let v = MIN_LOADABLE_VERSION; v <= SAVE_VERSION; v++) {
      write({ version: v, state: { money: v }, salesLog: [] })
      expect(loadGame()?.state.money, `версія ${v}`).toBe(v)
    }
  })

  it('битий JSON не кладе гру', () => {
    globalThis.localStorage.setItem(KEY, '{ це не json')
    expect(loadGame()).toBeNull()
  })

  it('clearSave прибирає сейв', () => {
    saveGame({ money: 1 }, [])
    clearSave()
    expect(loadGame()).toBeNull()
  })
})
