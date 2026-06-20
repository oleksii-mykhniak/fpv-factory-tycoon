// Kit (product) registry — data-driven. Add a new drone/aircraft type by adding an
// entry here: the FSM, pricing and UI all read kit data from this object, so no logic
// changes are needed.
//
// Per-kit economy (cost, basePrice) and structure (solderPointCount, steps) are content
// data and live with the entry. Global balance knobs (price formula, failure thresholds)
// stay in config.js.
export const KIT_TYPES = Object.freeze({
  mini_drone: {
    id:               'mini_drone',
    name:             'Міні-дрон',
    cost:             72,
    basePrice:        95,
    solderPointCount: 4,
    modelKey:         'mini_drone',   // key into the 3D asset manifest; loader falls back to a primitive
    assemblySteps: [
      'Збираю раму',
      'Встановлюю мотори',
      'Паяю регулятори (ESC)',
      'Прошиваю польотний контролер',
    ],
  },
})
