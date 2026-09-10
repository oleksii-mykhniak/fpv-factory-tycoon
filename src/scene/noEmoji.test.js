// А1 — тест, який не дає емодзі повернутись на сцену.
//
// Йде першим у Стадії 13 і залишається назавжди. Без нього ми приберемо емодзі
// й отримаємо їх назад через дві стадії — рівно так, як вони й з'явились:
// ніхто не додає емодзі навмисно, їх додають «поки що».
//
// Перевіряються ФАЙЛИ, а не рантайм. Рантайм-перевірка ловить лише той шлях,
// яким пройшов тест, а вимога тут — «ніде».
//
// Межа проведена по СЦЕНІ, не по грі (А7): у HTML-панелях емодзі лишаються й
// працюють — вони в потоці тексту, у системному UI, і читаються як іконки
// списку. На сцені ж емодзі малюється шрифтом ОС, тобто на Android, iOS і в
// браузері це три різні набори картинок, які не мають стосунку до палітри гри.

import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join, relative } from 'node:path'
import { roleBadge, ROLES } from '../defs/roles.js'

const ROOT = new URL('../..', import.meta.url).pathname

// Діапазони: піктограми й емоції, різні символи (☀ ✓ ✗ ⚡), стрілки, ще стрілки.
const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}\u{FE0F}]/u

// Коментарі — не світ. Пояснення «тут стояв 🔥 Перегрів» має право лишитись у
// коді: воно розповідає, чому щось прибрано, і саме воно тримає рішення живим.
// Тому перед перевіркою коментарі вибілюються, а рядкові літерали — ні.
function stripComments(src) {
  let out = ''
  let i = 0
  // Груба евристика для regex-літералів: '/' починає regex лише після одного з
  // цих символів. Достатньо для нашого коду й не тягне парсер.
  const beforeRegex = /[([{=,:;!&|?+\-*%~^<>]\s*$/
  while (i < src.length) {
    const c = src[i]
    const c2 = src[i + 1]
    if (c === '/' && c2 === '/') {
      while (i < src.length && src[i] !== '\n') { out += ' '; i++ }
      continue
    }
    if (c === '/' && c2 === '*') {
      while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) {
        out += src[i] === '\n' ? '\n' : ' '
        i++
      }
      out += '  '; i += 2
      continue
    }
    if (c === '"' || c === "'" || c === '`') {
      const quote = c
      out += c; i++
      while (i < src.length) {
        if (src[i] === '\\') { out += src[i] + (src[i + 1] ?? ''); i += 2; continue }
        out += src[i]
        if (src[i] === quote) { i++; break }
        i++
      }
      continue
    }
    if (c === '/' && beforeRegex.test(out)) {
      out += c; i++
      while (i < src.length && src[i] !== '\n') {
        if (src[i] === '\\') { out += src[i] + (src[i + 1] ?? ''); i += 2; continue }
        out += src[i]
        if (src[i] === '/') { i++; break }
        i++
      }
      continue
    }
    out += c; i++
  }
  return out
}

function jsFiles(dir) {
  const found = []
  for (const entry of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
    const rel = `${dir}/${entry.name}`
    if (entry.isDirectory()) found.push(...jsFiles(rel))
    else if (entry.name.endsWith('.js') && !entry.name.endsWith('.test.js')) found.push(rel)
  }
  return found
}

const SCENE_DIRS = ['src/scene', 'src/view']

describe('Стадія 13 / А1 — на сцені немає емодзі', () => {
  const files = SCENE_DIRS.flatMap(jsFiles)

  it('усі файли сцени й проєкції знайдені', () => {
    expect(files.length).toBeGreaterThan(5)
  })

  it.each(files)('%s не малює жодного емодзі', (file) => {
    const code = stripComments(readFileSync(join(ROOT, file), 'utf8'))
    const offenders = code.split('\n')
      .map((line, i) => [i + 1, line])
      .filter(([, line]) => EMOJI.test(line))
      .map(([n, line]) => `${file}:${n}  ${line.trim()}`)
    expect(offenders, `\n${offenders.join('\n')}\n`).toEqual([])
  })

  // Бейдж ролі читає ТІЛЬКИ сцена, тож він живе за тим самим правилом, що й
  // файли вище — на відміну від `role.emoji`, який показують HTML-панелі.
  it('бейдж ролі — не гліф, а спрайт', () => {
    for (const id of Object.keys(ROLES)) {
      expect(EMOJI.test(roleBadge(id) ?? ''), `roles.${id}.badge`).toBe(false)
    }
  })

  // `kits.emoji` лишається — його показують панелі (А7). Правило вужче: сцена
  // його НЕ читає. Інакше емодзі повернеться на сцену чужим полем.
  it('сцена не читає поле .emoji ні в кого', () => {
    const readers = SCENE_DIRS.flatMap(jsFiles)
      .filter(f => /\.emoji\b/.test(stripComments(readFileSync(join(ROOT, f), 'utf8'))))
    expect(readers).toEqual([])
  })
})
