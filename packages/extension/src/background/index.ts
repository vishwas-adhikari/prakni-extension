// [P1] MV3 service worker entry. Event-driven; may sleep at ~30s. All persistent state
// lives in chrome.storage.local (see ../storage/local-state), never in worker globals.

import { initState } from '../storage/local-state';
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
  if (alarm.name === OTA_ALARM) {
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
