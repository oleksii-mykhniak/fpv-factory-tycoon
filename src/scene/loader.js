// Babylon-specific loader. Imports Babylon/WebGL — never import this in Node unit tests.
// Pure logic (cache, getModel, getAnchor) lives in modelCache.js.
import { SceneLoader } from '@babylonjs/core'
import '@babylonjs/loaders/glTF'        // registers glTF/glb support
import { MODELS } from '../assets/manifest.js'
import { _modelCache } from './modelCache.js'

export { getModel, getAnchor } from './modelCache.js'

// Load all manifest entries into the shared cache.
// Always resolves — missing / broken files are stored as null (fallback to primitives).
// onProgress(loaded, total) fires after each attempt.
export async function loadModels(scene, onProgress) {
  const entries = Object.entries(MODELS)
  let loaded = 0

  await Promise.all(entries.map(async ([key, entry]) => {
    if (_modelCache.has(key)) { onProgress?.(++loaded, entries.length); return }

    try {
      const result = await SceneLoader.ImportMeshAsync('', entry.url, '', scene)
      const root = result.meshes[0] ?? null
      if (root) root.setEnabled(false)    // hidden until scene explicitly shows it
      _modelCache.set(key, root)
    } catch (err) {
      console.warn(`[loader] "${key}" (${entry.url}) not loaded:`, err?.message ?? err)
      _modelCache.setFailed(key)
    }

    onProgress?.(++loaded, entries.length)
  }))
}
