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

// Left of this x-coordinate is Gmail's nav/label sidebar — never the sender.
const SIDEBAR_MAX_X = 240;

/** Visible text of an element, preferring innerText (drops hidden nodes). */
function visibleText(el: Element): string {
  return (el as HTMLElement).innerText ?? el.textContent ?? '';
}

/** First element matching any selector. OTA selectors are remote/untrusted, so a
 * malformed string is skipped rather than thrown. */
function firstMatch(selectors: string[]): Element | null {
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

function emailFromEl(el: Element): string {
  const attr = (el.getAttribute('email') ?? '').trim();
  if (attr) return attr;
  const m = visibleText(el).match(EMAIL_IN_TEXT);
  return m ? m[0] : '';
}

function nameFromEl(el: Element): string {
  const attr = (el.getAttribute('name') ?? '').trim();
  if (attr) return attr;
  return cleanText(visibleText(el).replace(EMAIL_IN_TEXT, ''));
}

// --- Layer 2 heuristics -----------------------------------------------------

/** A visible, non-sidebar element whose text contains an email address. */
function heuristicSender(): { email: string; name: string } {
  for (const el of Array.from(document.querySelectorAll('span, a'))) {
    const text = (el.textContent ?? '').trim();
    if (!text || text.length > 120) continue;
    const m = text.match(EMAIL_IN_TEXT);
    if (!m) continue;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) continue; // hidden
    if (rect.left < SIDEBAR_MAX_X) continue; // sidebar, not the header
    return { email: m[0], name: cleanText(text.replace(m[0], '').replace(/[<>]/g, '')) };
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

  // Layer 1 — OTA selectors. Body + links come from the confirmed container.
  const senderEl = firstMatch(selectors.sender ?? []);
  let senderEmail = senderEl ? emailFromEl(senderEl) : '';
  let senderName = senderEl ? nameFromEl(senderEl) : '';

  const subjectEl = firstMatch(selectors.subject ?? []);
  let subject = subjectEl ? cleanText(visibleText(subjectEl)) : '';

  let bodyText = cleanText(visibleText(container));
  let links = extractLinks(container);

  // Layer 2 — heuristics fill only what Layer 1 missed.
  let usedFallback = false;
  if (!senderEmail) {
    const s = heuristicSender();
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

  return {
    id: messageId,
    senderName,
    senderEmail,
    subject,
    bodyText,
    links,
    auth: { spf: 'unknown', dkim: 'unknown', dmarc: 'unknown', aligned: null },
  };
}
