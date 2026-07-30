// Copyright (c) 2026 KanthiraLabs. All rights reserved. Proprietary and confidential.
import type { Verdict } from '@credmail/core';

export type Provider = 'gmail' | 'outlook' | 'zoho';
const storeKey = (provider: Provider): string => `${provider}:recent_threats`;
const CAP = 20;
const SUBJECT_PREFIX_LEN = 30;

export interface ThreatRecord {
  key: string;
  sender: string;
  subjectPrefix: string; // first 30 normalized chars of the subject (readable; Option C)
  riskLevel: 'Suspicious' | 'High Risk';
  timestamp: number;
  reasons: string[];
  maliciousUrl: string;
}

/** Normalize subject/row text so truncated rows still contain the stored prefix. */
export function normalizeText(s: string): string {
  return (s || '').toLowerCase().trim().replace(/^(re|fwd|fw):\s*/i, '').replace(/\s+/g, ' ');
}

/** The 30-char normalized subject prefix used for containment matching + de-dup. */
export function subjectPrefixOf(subject: string): string {
  return normalizeText(subject).slice(0, SUBJECT_PREFIX_LEN);
}

/** De-dup / store key. */
function threatKey(senderEmail: string, subjectPrefix: string): string {
  return `${senderEmail.toLowerCase()}|${subjectPrefix}`;
}

/** First query-stripped malicious link across the verdict's reasons, or ''. */
function firstMaliciousUrl(verdict: Verdict): string {
  for (const r of verdict.reasons) {
    if (r.affectedLinks && r.affectedLinks.length > 0) return r.affectedLinks[0].split('?')[0];
  }
  return '';
}

/**
 * Record a flagged email locally (Option C: readable IOCs + 30-char subject prefix).
 * Threats only; Safe ignored. De-duped by key, capped CAP (FIFO, newest first).
 * NEVER touches the scanned/detected counters — display state, not stats.
 */
export async function recordThreat(
  provider: Provider,
  senderEmail: string,
  subject: string,
  verdict: Verdict,
): Promise<void> {
  if (verdict.riskLevel !== 'Suspicious' && verdict.riskLevel !== 'High Risk') return;
  try {
    const subjectPrefix = subjectPrefixOf(subject);
    if (!senderEmail || !subjectPrefix) return; // nothing to match on later
    const key = threatKey(senderEmail, subjectPrefix);
    const KEY = storeKey(provider);
    const stored = await chrome.storage.local.get({ [KEY]: [] });
    const list = (stored[KEY] as ThreatRecord[]) ?? [];
    const filtered = list.filter((t) => t.key !== key);
    const record: ThreatRecord = {
      key,
      sender: senderEmail.toLowerCase(),
      subjectPrefix,
      riskLevel: verdict.riskLevel,
      timestamp: Date.now(),
      reasons: verdict.reasons.map((r) => r.description),
      maliciousUrl: firstMaliciousUrl(verdict),
    };
    const next = [record, ...filtered].slice(0, CAP);
    await chrome.storage.local.set({ [KEY]: next });
  } catch (err) {
    console.error('[Prakni] recordThreat failed:', err);
  }
}

/** Lightweight list for row reflection: sender + prefix + level. */
export async function getThreatMatchers(provider: Provider): Promise<
  { sender: string; subjectPrefix: string; riskLevel: 'Suspicious' | 'High Risk' }[]
> {
  try {
    const KEY = storeKey(provider);
    const stored = await chrome.storage.local.get({ [KEY]: [] });
    const list = (stored[KEY] as ThreatRecord[]) ?? [];
    return list.map((t) => ({ sender: t.sender, subjectPrefix: t.subjectPrefix, riskLevel: t.riskLevel }));
  } catch {
    return [];
  }
}

/** Full threat records for a provider (newest first) — for the dashboard feed. */
export async function getThreats(provider: Provider): Promise<ThreatRecord[]> {
  try {
    const KEY = storeKey(provider);
    const stored = await chrome.storage.local.get({ [KEY]: [] });
    return (stored[KEY] as ThreatRecord[]) ?? [];
  } catch {
    return [];
  }
}

/**
 * Reflect: given a row's sender + full text, return the matched threat level or null.
 * Rule (unified across providers): exact sender match AND row text contains the prefix.
 */
export function reflectRow(
  matchers: { sender: string; subjectPrefix: string; riskLevel: 'Suspicious' | 'High Risk' }[],
  rowSenderEmail: string,
  rowFullText: string,
): 'Suspicious' | 'High Risk' | null {
  if (!rowSenderEmail) return null;
  const sender = rowSenderEmail.toLowerCase();
  const text = normalizeText(rowFullText);
  for (const m of matchers) {
    if (m.sender === sender && m.subjectPrefix && text.includes(m.subjectPrefix)) return m.riskLevel;
  }
  return null;
}
