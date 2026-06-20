// Quality below this = miss (cold solder or overheat).
export const COLD_SOLDER_THRESHOLD = 0.40

// Of all misses, this fraction escalates to overheating (part burned).
export const OVERHEAT_CHANCE = 0.25

// Fraction of kit cost returned as scrap when abandoning a burnt drone.
// Ensures player can always reorder after one burn from starting money:
// $120 → order $72 → $48 left → burn → +$28.80 salvage → $76.80 → can reorder ($72).
export const SALVAGE_RATE = 0.40
