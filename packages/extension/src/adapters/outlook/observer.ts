// Copyright (c) 2026 KanthiraLabs. All rights reserved. Proprietary and confidential.
// [P3] Outlook Web open-email observer.
//
// Outlook is a React SPA: the reading pane renders 500-1000ms AFTER a click.
// Unlike Gmail (which uses URL hash changes), Outlook changes the URL path or
// swaps the reading pane in-place. We:
//   1. watch URL changes + MutationObserver on document.body (400ms debounce), THEN
//   2. poll for the body container (OTA selectors first, fallback last) every
//      200ms up to 15 times (~3s — Outlook's React is slower than Gmail).
// If the container never appears it was not an email view — abort silently.

const DEBOUNCE_MS = 400;
const POLL_INTERVAL_MS = 200;
const MAX_RETRIES = 15;
// Outlook's React renders the header + body (e.g. data-test-id) ~500-800ms AFTER the
// container first appears. Wait this long before extracting so the DOM is settled.
const REACT_RENDER_DELAY_MS = 800;

export type OnEmailOpen = (messageId: string, container: Element) => void;

// Outlook doesn't have clean message IDs in the URL like Gmail's hash.
// Use the full URL as a stable-enough identifier for dedup + caching.
function messageIdFromUrl(): string {
  return location.href;
}

// Container selectors — updated from DOM inspection (July 2026).
// [aria-label="Email message"] is the primary working selector.
// The old prototype's selectors are kept as fallbacks.
const CONTAINER_SELECTORS = [
  '[aria-label="Email message"]',
  '[data-test-id="mailMessageBodyContainer"]',
  '.ReadingPaneContainer',
];

function findContainer(otaSelectors: string[]): Element | null {
  // OTA selectors first, then hardcoded fallbacks.
  const all = [...otaSelectors, ...CONTAINER_SELECTORS];
  for (const sel of all) {
    try {
      const el = document.querySelector(sel);
      if (el) return el;
    } catch {
      /* invalid selector — skip */
    }
  }
  return null;
}

const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Start watching for opened emails in Outlook Web. `onEmailOpen` fires once per
 * opened message, only after its body container is confirmed in the DOM.
 *
 * @param getOtaSelectors  async function that returns OTA container selectors
 *                         (reads from chrome.storage.local outside this module)
 */
export function startOutlookObserver(
  onEmailOpen: OnEmailOpen,
  getOtaSelectors: () => Promise<string[]>,
): void {
  const processed = new Set<string>();
  let debounceTimer: number | undefined;
  let lastUrl = location.href;

  const pollForContainer = async (): Promise<void> => {
    const messageId = messageIdFromUrl();
    if (!messageId || processed.has(messageId)) return;

    const otaSelectors = await getOtaSelectors();

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      const container = findContainer(otaSelectors);
      if (container) {
        // Let React finish rendering the header + body before extracting, then
        // re-check the container still exists (navigation may have moved on).
        await delay(REACT_RENDER_DELAY_MS);
        const current = messageIdFromUrl();
        if (current !== messageId || processed.has(current)) return;
        const recheck = findContainer(otaSelectors);
        if (recheck) {
          processed.add(messageId);
          onEmailOpen(messageId, recheck);
        }
        return;
      }
      await delay(POLL_INTERVAL_MS);
    }
    // Container never appeared (~3s) → not an email view. Abort silently.
  };

  const trigger = (isNavigation: boolean): void => {
    if (isNavigation) {
      const id = messageIdFromUrl();
      if (id) processed.delete(id);
    }
    if (debounceTimer !== undefined) clearTimeout(debounceTimer);
    debounceTimer = window.setTimeout(() => void pollForContainer(), DEBOUNCE_MS);
  };

  // Outlook changes the URL path on navigation (not hash like Gmail).
  // MutationObserver catches in-place reading pane swaps.
  new MutationObserver(() => {
    const currentUrl = location.href;
    if (currentUrl !== lastUrl) {
      lastUrl = currentUrl;
      trigger(true);
    } else {
      trigger(false);
    }
  }).observe(document.body, { childList: true, subtree: true });

  // Cold load already sitting on an open email.
  trigger(true);
}