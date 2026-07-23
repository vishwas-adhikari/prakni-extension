// Copyright (c) 2026 KanthiraLabs. All rights reserved. Proprietary and confidential.
// [P1] Gmail open-email observer (docs/dom-resilience.md "Algorithm").
//
// Gmail is a single-page app: the URL hash changes 300-1000ms BEFORE the message
// body renders. So a hash change is only a hint, never a go-signal. We:
//   1. debounce the hint by 300ms (collapses Gmail's mutation storms), THEN
//   2. poll for the body container (OTA selectors first, `.a3s` fallback) every
//      200ms up to 10 times (~2s). Only when it exists do we hand off to the parser.
// If the container never appears it was not an email view — abort silently.

import { getDomSelectors } from '../../storage/local-state';

const DEBOUNCE_MS = 300;
const POLL_INTERVAL_MS = 200;
const MAX_RETRIES = 10;
const FALLBACK_BODY_SELECTOR = '.a3s';

export type OnEmailOpen = (messageId: string, container: Element) => void;

/** Last path segment of the Gmail hash: "#inbox/FMfcg…" → "FMfcg…". */
function messageIdFromHash(): string {
  const parts = location.hash.replace(/^#/, '').split('/').filter(Boolean);
  return parts.length ? parts[parts.length - 1] : '';
}

/** First body candidate present in the DOM, or null. OTA strings are remote and
 * untrusted, so a malformed selector is skipped, never thrown. */
function findBodyContainer(selectors: string[]): Element | null {
  for (const sel of selectors) {
    try {
      const el = document.querySelector(sel);
      if (el) return el;
    } catch {
      /* invalid OTA selector — ignore */
    }
  }
  return null;
}

const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Start watching for opened emails. `onEmailOpen` fires once per opened message,
 * only after its body container is confirmed in the DOM.
 */
export function startObserver(onEmailOpen: OnEmailOpen): void {
  // Ids we've already handed to the parser. Guards against the MutationObserver
  // re-firing for the SAME open message (Gmail mutates the thread constantly).
  // A genuine re-navigation clears the target id first (see `trigger`), so
  // reopening an email DOES fire again — the verdict cache then short-circuits it.
  const processed = new Set<string>();
  let debounceTimer: number | undefined;

  const pollForContainer = async (): Promise<void> => {
    const messageId = messageIdFromHash();
    if (!messageId || processed.has(messageId)) return;

    const selectors = await getDomSelectors();
    const bodySelectors = [...(selectors.body ?? []), FALLBACK_BODY_SELECTOR];

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      const container = findBodyContainer(bodySelectors);
      if (container) {
        // The user may have navigated away during the poll — re-check the id.
        const current = messageIdFromHash();
        if (current !== messageId || processed.has(current)) return;
        processed.add(messageId);
        onEmailOpen(messageId, container);
        return;
      }
      await delay(POLL_INTERVAL_MS);
    }
    // Container never appeared (~2s) → not an email view. Abort silently.
  };

  const trigger = (isNavigation: boolean): void => {
    // A real navigation should re-fire even for an already-seen id (so the cache
    // can report a hit); mutation-driven triggers must stay deduped.
    if (isNavigation) {
      const id = messageIdFromHash();
      if (id) processed.delete(id);
    }
    if (debounceTimer !== undefined) clearTimeout(debounceTimer);
    debounceTimer = window.setTimeout(() => void pollForContainer(), DEBOUNCE_MS);
  };

  window.addEventListener('hashchange', () => trigger(true));

  // Gmail can swap the open message without a hashchange (in-place rerender), so
  // also watch the main content region. Debounce absorbs the resulting churn.
  const root = document.querySelector('[role="main"]') ?? document.body;
  new MutationObserver(() => trigger(false)).observe(root, {
    childList: true,
    subtree: true,
  });

  // Cold load already sitting on an open email.
  trigger(true);
}
