// Copyright (c) 2026 KanthiraLabs. All rights reserved. Proprietary and confidential.
// [P1] MV3 service worker entry. Event-driven; may sleep at ~30s. All persistent state
// lives in chrome.storage.local (see ../storage/local-state), never in worker globals.

import { getState, initState } from '../storage/local-state';
import { runOtaSync } from './ota-sync';
import { handleTelemetryMessage, isTelemetryMessage } from './telemetry';

const OTA_ALARM = 'ota-sync';
const OTA_PERIOD_MINUTES = 12 * 60; // every 12 hours

console.log('[CredMail] background alive');

// First install / update: seed default state, then run the first OTA sync.
chrome.runtime.onInstalled.addListener(async () => {
  await initState();
  await runOtaSync();
  // Counters are per-session — reset them on install/update.
  await chrome.storage.local.set({ session_stats: { scanned: 0, detected: 0, markedSafe: 0 } });
  chrome.alarms.create(OTA_ALARM, { periodInMinutes: OTA_PERIOD_MINUTES });
});

// 12-hour OTA refresh cycle.
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== OTA_ALARM) return;
  await runOtaSync();
  // Self-heal: if selectors are still missing (e.g. a networked sync failed in a future
  // version), retry now rather than leaving extraction degraded until the next 12h cycle.
  const { dom_selectors } = await getState();
  if (!dom_selectors || Object.keys(dom_selectors).length === 0) {
    await runOtaSync();
  }
});

// Telemetry from content scripts. Synchronous listener returning false: the channel is
// not kept open (an async listener returns a Promise that Chrome reads as "will respond",
// a known MV3 foot-gun). Telemetry only logs, so no response is sent.
chrome.runtime.onMessage.addListener((message) => {
  if (isTelemetryMessage(message)) {
    handleTelemetryMessage(message);
  }
  return false;
});
