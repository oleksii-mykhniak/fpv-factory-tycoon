import { defineConfig } from 'vite'

export default defineConfig({
  root: '.',
  base: process.env.GITHUB_ACTIONS ? '/fpv-factory-tycoon/' : '/',
  build: {
    outDir: 'dist',
  },
})
