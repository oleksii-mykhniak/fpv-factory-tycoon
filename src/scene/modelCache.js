// Pure JS — no Babylon imports. Testable in Node without a WebGL context.
//
// Three cache states for a key:
//   undefined  — never attempted (has() returns false)
//   null       — attempted but failed (404 or parse error) → scene uses primitive fallback
//   TransformNode — loaded successfully → getModel() clones it

export function createModelCache() {
  const _map = new Map()

  return {
    set(key, mesh)  { _map.set(key, mesh) },
    setFailed(key)  { _map.set(key, null) },
    has(key)        { return _map.has(key) },
    // undefined = never attempted | null = failed | mesh = ok
    getRaw(key)     { return _map.get(key) },
  }
}

// Shared instance — lives for the lifetime of the page.
export const _modelCache = createModelCache()

// Returns a cloned, enabled instance of the model, or null if not loaded / failed.
// Cloning is a Babylon operation but only runs when root is non-null,
// so importing this in Node tests is safe as long as tests only exercise the null path.
export function getModel(key) {
  const root = _modelCache.getRaw(key)
  if (root == null) return null    // covers both null (failed) and undefined (not attempted)

  const instance = root.clone(`${key}_instance_${Date.now()}`, null)
  instance.setEnabled(true)
  return instance
}

// Returns a named anchor (Empty) from a model instance, or null if absent.
export function getAnchor(modelInstance, anchorName) {
  if (!modelInstance) return null
  return modelInstance.getChildTransformNodes(false)
    .find(n => n.name === anchorName) ?? null
}
