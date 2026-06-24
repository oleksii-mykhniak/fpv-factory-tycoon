import { ADS_ENABLED } from '../state/config.js'

// Placement IDs — wire to real SDK here when ADS_ENABLED=true.
export const PLACEMENTS = Object.freeze({
  REWARD_PIGGY_DOUBLE:          'reward_piggy_double',
  REWARD_SKIP_DELIVERY:         'reward_skip_delivery',
  REWARD_DOUBLE_SALE:           'reward_double_sale',
  REWARD_PIGGY_COOLDOWN_RESET:  'reward_piggy_cooldown_reset',
  INTERSTITIAL_LOCATION_UNLOCK: 'interstitial_location_unlock',
})

/**
 * Show a rewarded ad. Dev stub resolves `true` (reward granted) when ADS_ENABLED=true.
 * Returns Promise<boolean> — true means reward should be applied.
 */
export function showRewarded(_placementId) {
  if (!ADS_ENABLED) return Promise.resolve(false)
  return Promise.resolve(true)  // TODO: replace with real SDK call
}

/**
 * Show an interstitial. No-op stub; wire real SDK here.
 * Returns Promise<void>.
 */
export function showInterstitial(_placementId) {
  if (!ADS_ENABLED) return Promise.resolve()
  return Promise.resolve()  // TODO: replace with real SDK call
}
