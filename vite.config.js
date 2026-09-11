import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'

// Що саме зараз у руках гравця (фікс «збірка ≠ dev», 2026-09-11).
//
// У налаштуваннях висів захардкожений «0.2.0-dev», який не змінювався від
// першого дня: з екрана телефона неможливо було сказати, чи це сьогоднішня
// збірка, чи APK тримісячної давнини. Тепер там хеш коміта й дата збірки —
// перше, що треба знати, коли перевіряєш стадію на залізі.
const pkg  = JSON.parse(readFileSync('./package.json', 'utf-8'))
const git  = (cmd, fallback) => {
  try { return execSync(cmd, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() }
  catch { return fallback }
}
const commit = git('git rev-parse --short HEAD', 'nogit')
const dirty  = git('git status --porcelain', '') ? '+' : ''
const built  = new Date().toISOString().slice(0, 16).replace('T', ' ')

export default defineConfig({
  root: '.',
  base: process.env.GITHUB_ACTIONS ? '/fpv-factory-tycoon/' : '/',
  build: {
    outDir: 'dist',
  },
  define: {
    __APP_VERSION__: JSON.stringify(`${pkg.version} · ${commit}${dirty} · ${built}`),
  },
})
