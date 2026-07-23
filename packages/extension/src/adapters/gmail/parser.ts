// Copyright (c) 2026 KanthiraLabs. All rights reserved. Proprietary and confidential.
// [P1] Gmail parser: DOM → EmailData (docs/dom-resilience.md).
//
// Layer 1 — OTA selectors (querySelector, FIRST match per field).
// Layer 2 — structural heuristics for any field Layer 1 missed.
// Confidence gate — never hand the engine output we can't trust.
//
// Thread rule (trap C): read ONLY the current message, never the whole thread.
// We take the FIRST body match (the open message renders first) and read its
// `.innerText`, which excludes hidden quoted text — `.textContent` would not.

import type { EmailData } from '@credmail/core';
import { getDomSelectors } from '../../storage/local-state';
import { cleanText } from '../shared/clean-text';
import { extractLinks } from '../shared/extract-links';
import { checkConfidence } from '../shared/confidence';

type TelemetryType = 'parser_fallback' | 'extraction_low_confidence';

// Email shape used to recover an address from free text (looser than the
// confidence gate's anchored check — here we're scanning, not validating).
const EMAIL_IN_TEXT = /[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+/;

// Gmail renders the sender in the message HEADER area (above and outside the
// `.a3s` body container). When the OTA sender selectors miss, fall back to
// scanning these header areas for an `[email]` / `[data-hovercard-id]` element.
const SENDER_HEADER_AREAS = ['.ha', '.ade'];

/** Visible text of an element, preferring innerText (drops hidden nodes). */
function visibleText(el: Element): string {
  return (el as HTMLElement).innerText ?? el.textContent ?? '';
}

/** First element matching any selector, searched WITHIN `root` (default document).
 * OTA selectors are remote/untrusted, so a malformed string is skipped, not thrown. */
function firstMatch(selectors: string[], root: ParentNode = document): Element | null {
  for (const sel of selectors) {
    try {
      const el = root.querySelector(sel);
      if (el) return el;
    } catch {
      /* invalid OTA selector — ignore */
    }
  }
  return null;
}

// Gmail wraps each message in the thread in its own container. The sender header
// is a PARENT/SIBLING of the body, never inside it, so the lookup is document-wide.
// To avoid grabbing the FIRST sender on the page (the wrong one when several thread
// messages are expanded), we first PREFER the message wrapper that owns this body —
// the open message — then fall back to document level if that scoped lookup misses.
const MESSAGE_WRAPPERS = ['[data-message-id]', '.adn', '.gs', '.h7'];

/** The enclosing single-message wrapper for `container`, or document if none. */
function messageRoot(container: Element): ParentNode {
  for (const sel of MESSAGE_WRAPPERS) {
    const wrapper = container.closest(sel);
    if (wrapper) return wrapper;
  }
  return document;
}

function emailFromEl(el: Element): string {
  const attr = (el.getAttribute('email') ?? '').trim();
  if (attr) return attr;
  // Gmail's `.gD` sender often carries the address in `data-hovercard-id`. It can
  // also hold a numeric contact id, so accept it only when it looks like an email.
  const hovercard = (el.getAttribute('data-hovercard-id') ?? '').trim();
  if (EMAIL_IN_TEXT.test(hovercard)) return hovercard;
  const m = visibleText(el).match(EMAIL_IN_TEXT);
  return m ? m[0] : '';
}

function nameFromEl(el: Element): string {
  const attr = (el.getAttribute('name') ?? '').trim();
  if (attr) return attr;
  return cleanText(visibleText(el).replace(EMAIL_IN_TEXT, ''));
}

// --- Layer 2 heuristics -----------------------------------------------------

/** Fallback sender: scan the message header areas for an element carrying the
 * address. Prefer the open message's own header (`root`), then any document-level
 * header area, so a busy thread still resolves to a real sender. */
function heuristicSender(root: ParentNode): { email: string; name: string } {
  const scopes: ParentNode[] = [root];
  for (const sel of SENDER_HEADER_AREAS) {
    for (const area of Array.from(document.querySelectorAll(sel))) scopes.push(area);
  }
  for (const scope of scopes) {
    for (const el of Array.from(scope.querySelectorAll('[email], [data-hovercard-id]'))) {
      const email = emailFromEl(el);
      if (email) return { email, name: nameFromEl(el) };
    }
  }
  return { email: '', name: '' };
}

/** Largest visible heading = subject. */
function heuristicSubject(): string {
  let best = '';
  let bestArea = 0;
  for (const h of Array.from(document.querySelectorAll('h1, h2, h3'))) {
    const rect = h.getBoundingClientRect();
    const area = rect.width * rect.height;
    if (area > bestArea) {
      bestArea = area;
      best = cleanText(visibleText(h));
    }
  }
  return best;
}

/**
 * Block element with the longest innerText = the message body. innerText (not
 * textContent) keeps this to the visible current message, excluding collapsed /
 * quoted thread text.
 */
function heuristicBody(): { el: Element | null; text: string } {
  let bestEl: Element | null = null;
  let bestLen = 0;
  for (const el of Array.from(document.querySelectorAll('div, td, article, section'))) {
    const len = ((el as HTMLElement).innerText ?? '').length;
    if (len > bestLen) {
      bestLen = len;
      bestEl = el;
    }
  }
  return { el: bestEl, text: bestEl ? visibleText(bestEl) : '' };
}

function sendTelemetry(type: TelemetryType): void {
  // Best-effort: background may be asleep or the context invalidated on navigation.
  try {
    void Promise.resolve(
      chrome.runtime.sendMessage({ type, client: 'gmail' }),
    ).catch(() => undefined);
  } catch {
    /* extension context gone — drop it */
  }
}

/**
 * Extract the open message as EmailData, or null if extraction can't be trusted.
 * `container` is the body element the observer already confirmed (the first body
 * match — the current message). DOM extraction has no auth headers, so auth is
 * all "unknown" (the Gmail API in P4 supplies the real values).
 */
export async function extract(
  container: Element,
  messageId: string,
): Promise<EmailData | null> {
  const selectors = await getDomSelectors();

  // The sender header sits OUTSIDE the body container, so it's a document-level
  // lookup. To pick the open message's sender (not the first on the page in a
  // multi-message thread) we PREFER the wrapper that owns this body, then fall
  // back to document level when that scoped lookup misses.
  const msgRoot = messageRoot(container);

  // Layer 1 — OTA selectors. Body + links come from the confirmed container.
  const senderEl =
    firstMatch(selectors.sender ?? [], msgRoot) ?? firstMatch(selectors.sender ?? []);
  let senderEmail = senderEl ? emailFromEl(senderEl) : '';
  let senderName = senderEl ? nameFromEl(senderEl) : '';

  // Subject (h2.hP) sits at the thread level, OUTSIDE the message wrapper, so it
  // stays a document-level lookup — one open thread means one subject.
  const subjectEl = firstMatch(selectors.subject ?? []);
  let subject = subjectEl ? cleanText(visibleText(subjectEl)) : '';

  let bodyText = cleanText(visibleText(container));
  let links = extractLinks(container);

  // Layer 2 — heuristics fill only what Layer 1 missed.
  let usedFallback = false;
  if (!senderEmail) {
    const s = heuristicSender(msgRoot);
    senderEmail = s.email;
    senderName = senderName || s.name;
    usedFallback = true;
  }
  if (!subject) {
    subject = heuristicSubject();
    usedFallback = true;
  }
  if (!bodyText) {
    const b = heuristicBody();
    bodyText = cleanText(b.text);
    if (b.el) links = extractLinks(b.el);
    usedFallback = true;
  }

  // Confidence gate — abort + telemetry rather than score wrong text.
  const conf = checkConfidence({ senderEmail, subject, bodyText });
  if (!conf.pass) {
    console.warn(`[CredMail] low-confidence extraction for ${messageId}:`, conf.failures);
    sendTelemetry('extraction_low_confidence');
    return null;
  }
  if (usedFallback) sendTelemetry('parser_fallback');

  const emailData: EmailData = {
    id: messageId,
    senderName,
    senderEmail,
    subject,
    bodyText,
    links,
    auth: { spf: 'unknown', dkim: 'unknown', dmarc: 'unknown', aligned: null },
  };

  return emailData;
}
