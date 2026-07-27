// Copyright (c) 2026 KanthiraLabs. All rights reserved. Proprietary and confidential.
// [P3] Outlook Web parser: DOM → EmailData.
//
// Strategy (ported from the old working prototype):
// - Scope: the PARENT of [data-test-id="mailMessageBodyContainer"] — it wraps both
//   the email header (sender) and the body. Falls back to .ReadingPaneContainer,
//   then [aria-label="Email message"], then the container the observer passed.
// - Sender: no reliable CSS selector — scan the scope's <span>s for an email regex.
//   HEADER-area spans first (exclude the body element), then all spans as a fallback,
//   so a forwarded message's quoted "From:" address can't beat the real sender.
// - Body: [data-test-id="mailMessageBodyContainer"] || .BodyFragment ||
//   div[aria-label="Message body"] || div[role="document"], INSIDE the scope.
// - Subject: [id$="_SUBJECT"] || heading level 3/2 inside the scope, then the tab
//   title (document.title), then the body's first line — a missing subject never
//   blocks extraction (body + links carry the detection signal).
// - Links: from the body element only.
//
// Layer 1 — OTA selectors (body/subject); Layer 2 — hardcoded fallbacks below.
// Confidence gate — never hand the engine output we can't trust.
// TIMING: the observer waits ~800ms after the container appears before calling this,
// so React has finished rendering the header + body (data-test-id appears late).

import type { EmailData } from '@credmail/core';
import { cleanText } from '../shared/clean-text';
import { extractLinks } from '../shared/extract-links';
import { checkConfidence } from '../shared/confidence';

type TelemetryType = 'parser_fallback' | 'extraction_low_confidence';

const EMAIL_REGEX = /([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)/;

// Hardcoded fallback selectors (used after any OTA selectors), ported from the old
// working prototype. div[role="document"] is an extra body fallback from our own DOM
// inspection, for layouts where data-test-id isn't present. Subject selectors are
// scoped INSIDE the reading-pane scope (so a heading query can't match the sidebar).
const FALLBACK_BODY = [
  '[data-test-id="mailMessageBodyContainer"]',
  '.BodyFragment',
  'div[aria-label="Message body"]',
  "div[role='document']",
];

function visibleText(el: Element): string {
  return (el as HTMLElement).innerText ?? el.textContent ?? '';
}

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

/**
 * Outlook sender extraction. The sender lives in the reading-pane HEADER, above the
 * body. Scan header-area spans FIRST (exclude any span inside the body element), so a
 * forwarded/quoted "From:" address in the body can't beat the real sender. Fall back
 * to scanning ALL spans (better than returning nothing). Outlook has no reliable
 * attribute for the sender email (unlike Gmail's [email]).
 */
function extractSender(container: Element): { email: string; name: string } {
  // Find the body element to exclude from the header scan.
  const bodyEl =
    container.querySelector('[data-test-id="mailMessageBodyContainer"]') ||
    container.querySelector('.BodyFragment') ||
    container.querySelector("div[role='document']") ||
    container.querySelector('div[aria-label="Message body"]');

  const spans = Array.from(container.querySelectorAll('span'));

  // Pass 1: header-area spans only (not inside the body element).
  for (const span of spans) {
    if (bodyEl && bodyEl.contains(span)) continue;
    const match = (span.textContent || '').match(EMAIL_REGEX);
    if (match) {
      const email = match[1].replace(/[<>]/g, '').trim().toLowerCase();
      if (email.includes('@')) {
        const name = cleanText(
          (span.textContent || '').replace(EMAIL_REGEX, '').replace(/[<>]/g, ''),
        );
        return { email, name: name || 'Unknown' };
      }
    }
  }

  // Pass 2: fall back to all spans (including the body) — better than nothing.
  for (const span of spans) {
    const match = (span.textContent || '').match(EMAIL_REGEX);
    if (match) {
      const email = match[1].replace(/[<>]/g, '').trim().toLowerCase();
      if (email.includes('@')) return { email, name: 'Unknown' };
    }
  }

  return { email: '', name: '' };
}

/**
 * The reading-pane scope that holds BOTH the subject heading and the message pane.
 * `#ConversationReadingPaneContainer` is a stable id (unlike the hashed Fluent UI
 * classes); fall back to the aria wrapper, then whatever the caller passed.
 */
function readingPaneScope(fallback: Element): Element {
  return (
    document.querySelector('#ConversationReadingPaneContainer') ||
    document.querySelector('[aria-label="Email message"]') ||
    fallback
  );
}

/**
 * Is this heading text a subject (vs. the sender line, recipient, date, or draft tag)?
 * Keyed on content shape so it survives Outlook's class-name churn.
 */
function isSubjectText(t: string): boolean {
  if (!t) return false;
  if (EMAIL_REGEX.test(t)) return false;
  if (/^to:/i.test(t)) return false;
  if (t === '[Draft]') return false;
  if (/\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/.test(t)) return false;
  if (/\b(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\b.*\d/.test(t)) return false;
  return true;
}

/** Subject from the first subject-shaped aria-level-3 heading in the scope. */
function extractSubjectFromHeadings(scope: Element): string {
  for (const h of Array.from(scope.querySelectorAll('[role="heading"][aria-level="3"]'))) {
    const t = cleanText(visibleText(h));
    if (isSubjectText(t)) return t;
  }
  return '';
}

/** Sender from the email-bearing aria-level-3 heading inside the Email message pane. */
function extractSenderFromHeadings(scope: Element): { email: string; name: string } | null {
  const pane = scope.querySelector('[aria-label="Email message"]') ?? scope;
  for (const h of Array.from(pane.querySelectorAll('[role="heading"][aria-level="3"]'))) {
    const raw = h.textContent || '';
    const match = raw.match(EMAIL_REGEX);
    if (match) {
      const email = match[1].replace(/[<>]/g, '').trim().toLowerCase();
      if (email.includes('@')) {
        const name = cleanText(raw.replace(EMAIL_REGEX, '').replace(/[<>]/g, ''));
        return { email, name: name || 'Unknown' };
      }
    }
  }
  return null;
}

/**
 * Outlook exposes the open message's subject in the tab title, e.g.
 * "Paypal update required - user@contoso.com" or "Subject - Outlook". Take the part
 * before the first " - " as the subject. Primary subject fallback when the CSS
 * selectors don't match (Outlook's subject is often a plain React span).
 */
function extractSubjectFromTitle(): string {
  const title = document.title || '';
  const parts = title.split(' - ');
  if (parts.length >= 2) {
    return parts[0].trim();
  }
  return '';
}

function sendTelemetry(type: TelemetryType): void {
  try {
    void Promise.resolve(
      chrome.runtime.sendMessage({ type, client: 'outlook' }),
    ).catch(() => undefined);
  } catch {
    /* extension context gone — drop it */
  }
}

/**
 * Extract the open email as EmailData, or null if extraction can't be trusted.
 *
 * @param container      the reading pane container confirmed by the observer
 * @param messageId      the URL-based ID from the observer
 * @param otaSelectors   OTA selectors for Outlook (body + subject keys)
 */
export async function extract(
  container: Element,
  messageId: string,
  otaSelectors: Record<string, string[]>,
): Promise<EmailData | null> {
  let usedFallback = false;

  // --- Scope: the reading-pane wrapper. Prefer the PARENT of the body container
  // (it wraps both the header, with the sender, and the body); fall back to the
  // reading pane, the aria wrapper, then whatever the observer passed. ---
  const scope: Element = readingPaneScope(
    document.querySelector('[data-test-id="mailMessageBodyContainer"]')?.parentElement ||
      document.querySelector('.ReadingPaneContainer') ||
      document.querySelector('[aria-label="Email message"]') ||
      container,
  );

  // --- Sender: prefer the email-bearing reading-pane heading (real header sender,
  // immune to forwarded/quoted body addresses); fall back to the span scan. ---
  const sender = extractSenderFromHeadings(scope) ?? extractSender(scope);
  const senderEmail = sender.email;
  const senderName = sender.name;

  // --- Body: OTA selectors first, then fallbacks, INSIDE the scope. ---
  const bodySelectors = [...(otaSelectors.body ?? []), ...FALLBACK_BODY];
  const bodyEl = firstMatch(bodySelectors, scope);
  let bodyText = '';
  let links = extractLinks(scope);
  if (bodyEl) {
    bodyText = cleanText(visibleText(bodyEl));
    links = extractLinks(bodyEl); // links from the body element only
  } else {
    // Heuristic: use the scope itself as the body.
    bodyText = cleanText(visibleText(scope));
    usedFallback = true;
  }

  // --- Subject: CSS selectors inside the scope (OTA + fallbacks), then the tab
  // title, then the body's first line. A missing subject must NOT block extraction —
  // the body and links carry the detection signal. ---
  const subjectSelectors = [...(otaSelectors.subject ?? [])];
  const subjectEl = firstMatch(subjectSelectors, scope);
  let subject = subjectEl ? cleanText(visibleText(subjectEl)) : '';
  if (!subject) subject = extractSubjectFromHeadings(scope);
  if (!subject) subject = extractSubjectFromTitle();
  if (!subject && bodyText) {
    subject = bodyText.trim().split('\n')[0].slice(0, 100);
    usedFallback = true;
  }

  // --- Confidence gate ---
  const conf = checkConfidence({ senderEmail, subject, bodyText });
  if (!conf.pass) {
    console.warn(`[Prakni] Outlook low-confidence extraction for ${messageId}:`, conf.failures);
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