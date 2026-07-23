// Copyright (c) 2026 KanthiraLabs. All rights reserved. Proprietary and confidential.
// [P1] Metadata-only telemetry.
//
// Privacy hard rule: telemetry is metadata only — never bodyText/subject/sender or any
// PII, never URLs with query strings. P1 only logs locally; the real webhook lands in P3.

/** Anonymous extraction-health signals fired by a content-script adapter. */
export interface TelemetryMessage {
  type: 'parser_fallback' | 'extraction_low_confidence';
  client: string; // provider name, e.g. "gmail"
}

const TELEMETRY_TYPES: ReadonlySet<string> = new Set([
  'parser_fallback',
  'extraction_low_confidence',
]);

/** True if a runtime message is a telemetry signal this handler owns. */
export function isTelemetryMessage(msg: unknown): msg is TelemetryMessage {
  return (
    typeof msg === 'object' &&
    msg !== null &&
    TELEMETRY_TYPES.has((msg as { type?: unknown }).type as string)
  );
}

/** Log metadata only. Synchronous and fire-and-forget — no response is sent. */
export function handleTelemetryMessage(msg: TelemetryMessage): void {
  console.log('[CredMail] telemetry', {
    event: msg.type,
    client: msg.client,
    version: chrome.runtime.getManifest().version,
    ts: new Date().toISOString(),
  });
}
