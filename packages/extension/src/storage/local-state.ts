// Copyright (c) 2026 KanthiraLabs. All rights reserved. Proprietary and confidential.
// [P1] Typed async wrapper around chrome.storage.local.
//
// Hard rule (MV3): chrome.storage.local is asynchronous. Every export here returns a
// Promise and awaits the underlying API — there are no synchronous getters. The service
// worker may sleep at any time, so state lives here, never in worker globals.

import type { LocalState, ScoringConfig } from '@credmail/core';

// Bootstrap fallback for the scorer thresholds before any OTA config is delivered.
// Mirrors core's DEFAULT_CONFIG; OTA + the core scorer remain the real source of truth.
const DEFAULT_SCORING_CONFIG: ScoringConfig = {
  suspiciousThreshold: 30,
  highRiskThreshold: 70,
  weakCorroborationNeeded: 2,
};

const DEFAULTS: LocalState = {
  user_tier: 'free',
  auth_token: null,
  is_active: true,
  local_whitelist: [],
  safe_contacts: [],
  local_blocklist: [],
  dom_selectors: {}, // populated by the first OTA sync
  scoring_config: DEFAULT_SCORING_CONFIG,
  session_stats: { scanned: 0, detected: 0, markedSafe: 0 },
};

/** Domains/senders are case-insensitive — normalize before storing or comparing. */
function normalize(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * Persist any missing keys with their defaults without clobbering existing user data.
 * Idempotent — safe to call on every install/update.
 */
export async function initState(): Promise<void> {
  const stored = await chrome.storage.local.get(null);
  await chrome.storage.local.set({ ...DEFAULTS, ...stored });
}

/**
 * Full state, always merged over DEFAULTS. Even if storage is cleared or corrupted, this
 * returns a complete, sane LocalState rather than a partial object that would crash
 * consumers on a missing key (cold-start hardening).
 */
export async function getState(): Promise<LocalState> {
  const data = await chrome.storage.local.get(
    DEFAULTS as unknown as Record<string, unknown>,
  );
  return { ...DEFAULTS, ...data } as LocalState;
}

/** Shallow-merge a partial update into stored state. */
export async function setState(partial: Partial<LocalState>): Promise<void> {
  await chrome.storage.local.set(partial);
}

export async function getWhitelist(): Promise<string[]> {
  return (await getState()).local_whitelist;
}

export async function addToWhitelist(domain: string): Promise<void> {
  const list = await getWhitelist();
  const next = Array.from(new Set([...list, normalize(domain)]));
  await setState({ local_whitelist: next });
}

export async function removeFromWhitelist(domain: string): Promise<void> {
  const target = normalize(domain);
  const list = await getWhitelist();
  await setState({ local_whitelist: list.filter((d) => d !== target) });
}

/**
 * Full email addresses the user marked safe on a freemail domain (e.g.
 * "friend@gmail.com"). Kept separate from local_whitelist so we never trust a
 * whole public-provider domain — only the specific address.
 */
export async function getSafeContacts(): Promise<string[]> {
  return (await getState()).safe_contacts;
}

export async function addToSafeContacts(email: string): Promise<void> {
  const list = await getSafeContacts();
  const next = Array.from(new Set([...list, normalize(email)]));
  await setState({ safe_contacts: next });
}

export async function removeFromSafeContacts(email: string): Promise<void> {
  const target = normalize(email);
  const list = await getSafeContacts();
  await setState({ safe_contacts: list.filter((e) => e !== target) });
}

export async function getBlocklist(): Promise<string[]> {
  return (await getState()).local_blocklist;
}

export async function addToBlocklist(sender: string): Promise<void> {
  const list = await getBlocklist();
  const next = Array.from(new Set([...list, normalize(sender)]));
  await setState({ local_blocklist: next });
}

export async function removeFromBlocklist(sender: string): Promise<void> {
  const target = normalize(sender);
  const list = await getBlocklist();
  await setState({ local_blocklist: list.filter((s) => s !== target) });
}

/**
 * Cached OTA selectors. Flat field → selector[] map for the single (Gmail) provider in
 * P1; provider nesting arrives with the P3 multi-provider schema migration.
 */
export async function getDomSelectors(): Promise<Record<string, string[]>> {
  // dom_selectors holds mixed OTA config (string[] for engine selectors, an object
  // for `row`); engine consumers only read the string[] keys, so narrow here.
  return (await getState()).dom_selectors as Record<string, string[]>;
}

export async function setDomSelectors(
  selectors: Record<string, unknown>,
): Promise<void> {
  await setState({ dom_selectors: selectors });
}
