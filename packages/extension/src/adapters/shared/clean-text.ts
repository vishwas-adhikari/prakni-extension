// Copyright (c) 2026 KanthiraLabs. All rights reserved. Proprietary and confidential.
// [P1] Shared text normalization for adapter extraction.
//
// Webmail bodies arrive padded with zero-width / invisible characters — a known
// trick to break keyword rules and to bloat length checks. Strip them and collapse
// whitespace so the engine sees the same text a human reads.

// Zero-width and invisible formatting characters, by code point so the source stays
// readable (no invisible literals):
//   U+00AD soft hyphen; U+200B-U+200F ZWSP/ZWNJ/ZWJ + LTR/RTL marks;
//   U+202A-U+202E bidi embedding/override; U+2060 word joiner; U+FEFF BOM/ZWNBSP.
const INVISIBLE_RANGES: ReadonlyArray<readonly [number, number]> = [
  [0x00ad, 0x00ad],
  [0x200b, 0x200f],
  [0x202a, 0x202e],
  [0x2060, 0x2060],
  [0xfeff, 0xfeff],
];

const hex = (n: number): string => '\\u' + n.toString(16).padStart(4, '0');

const INVISIBLE = new RegExp(
  '[' +
    INVISIBLE_RANGES.map(([lo, hi]) =>
      lo === hi ? hex(lo) : hex(lo) + '-' + hex(hi),
    ).join('') +
    ']',
  'g',
);

/** Drop invisible characters, collapse whitespace runs to single spaces, trim. */
export function cleanText(input: string): string {
  return input.replace(INVISIBLE, '').replace(/\s+/g, ' ').trim();
}
