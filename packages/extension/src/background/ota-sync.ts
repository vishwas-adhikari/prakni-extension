// [P1] OTA selector sync.
//
// Layer 1 of the self-healing extraction system (docs/dom-resilience.md): DOM selectors
// live as data, not code, so a Gmail UI change is a config update, not a store re-review.
// In P1 the config is bundled locally; P3 replaces this with a Supabase fetch. The OTA
// payload is JSON selector strings only — MV3 forbids remote code.

import selectors from './gmail-selectors.json';
import { setDomSelectors } from '../storage/local-state';

export async function runOtaSync(): Promise<void> {
  await setDomSelectors(selectors);
  console.log('[CredMail] OTA sync complete');
}
