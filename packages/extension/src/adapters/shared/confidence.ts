// Copyright (c) 2026 KanthiraLabs. All rights reserved. Proprietary and confidential.
// [P1] Extraction confidence check (docs/dom-resilience.md, Layer 2).
//
// Heuristics fail SILENTLY — they grab a footer or a quoted thread and hand the
// engine a confident-looking but wrong EmailData. This gate validates the shape of
// what we extracted before the engine is allowed to score it. A wrong verdict is
// worse than no verdict, so when this fails the parser aborts and fires telemetry.

export interface ConfidenceInput {
  senderEmail: string;
  subject: string;
  bodyText: string;
}

export interface ConfidenceResult {
  pass: boolean;
  failures: string[]; // machine-readable reasons, for telemetry / debugging
}

// Deliberately loose — we are sanity-checking shape, not validating deliverability.
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_BODY = 10;
const MAX_BODY = 100000;

/** Validate heuristic output. `pass` is true only when every check holds. */
export function checkConfidence(input: ConfidenceInput): ConfidenceResult {
  const failures: string[] = [];

  if (!EMAIL_SHAPE.test(input.senderEmail.trim())) {
    failures.push('sender_not_email');
  }

  const body = input.bodyText.trim();
  if (body.length < MIN_BODY || body.length > MAX_BODY) {
    failures.push('body_length_implausible');
  }

  const subject = input.subject.trim();
  if (!subject) {
    failures.push('subject_empty');
  } else if (subject === body) {
    // subject === body means we grabbed the same node twice — extraction is confused.
    failures.push('subject_equals_body');
  }

  return { pass: failures.length === 0, failures };
}
