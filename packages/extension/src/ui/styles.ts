// [P1] UI styles + the local verdict shape the UI renders.
//
// CSP discipline (CLAUDE.md "MV3", docs/design.md "Style isolation"): every style
// here is a plain camelCase JS object applied with `Object.assign(el.style, …)`.
// No CSS strings, no <style> element, no classList — those trip MV3's CSP. Values
// are strings because that is what `CSSStyleDeclaration` accepts.

export type StyleMap = Record<string, string>;

/**
 * What the UI needs from a Verdict — declared locally on purpose. The UI layer must
 * not import from @credmail/core (keeps it self-contained and core DOM-free); this
 * is a structural subset of core's `Verdict`.
 */
export interface VerdictView {
  riskLevel: 'Safe' | 'Suspicious' | 'High Risk';
  score: number;
  silent: boolean;
  reasons: { description: string; affectedLinks?: string[] }[];
}

// --- Banner -----------------------------------------------------------------

/** Shared across both risk levels; merged with a colour map below. */
export const bannerBase: StyleMap = {
  padding: '12px',
  margin: '8px 0',
  borderRadius: '6px',
  fontSize: '13px',
  fontFamily: 'inherit',
  zIndex: '9999',
  position: 'relative',
};

export const bannerSuspicious: StyleMap = {
  background: '#FFF7ED',
  borderLeft: '4px solid #ED6C02',
  color: '#7C2D12',
};

export const bannerHighRisk: StyleMap = {
  background: '#FEF2F2',
  borderLeft: '4px solid #C62828',
  color: '#7F1D1D',
};

export const bannerHeader: StyleMap = {
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
  fontWeight: '600',
  marginBottom: '6px',
};

export const reasonList: StyleMap = {
  margin: '6px 0',
  paddingLeft: '18px',
};

export const reasonItem: StyleMap = {
  marginBottom: '2px',
};

export const affectedLink: StyleMap = {
  fontFamily: 'monospace',
  fontSize: '12px',
  wordBreak: 'break-all',
  opacity: '0.85',
};

export const buttonRow: StyleMap = {
  display: 'flex',
  gap: '8px',
  marginTop: '8px',
};

export const button: StyleMap = {
  padding: '4px 10px',
  fontSize: '12px',
  fontFamily: 'inherit',
  borderRadius: '4px',
  border: '1px solid currentColor',
  background: 'transparent',
  color: 'inherit',
  cursor: 'pointer',
};

export const footer: StyleMap = {
  marginTop: '8px',
  fontSize: '11px',
  opacity: '0.7',
};

// --- Pill -------------------------------------------------------------------

export const pillBase: StyleMap = {
  display: 'inline-block',
  marginLeft: '8px',
  padding: '1px 6px',
  borderRadius: '4px',
  fontSize: '11px',
  fontWeight: '600',
  fontFamily: 'inherit',
  verticalAlign: 'middle',
};

export const pillSuspicious: StyleMap = {
  background: '#FFF7ED',
  color: '#7C2D12',
  border: '1px solid #ED6C02',
};

export const pillHighRisk: StyleMap = {
  background: '#FEF2F2',
  color: '#7F1D1D',
  border: '1px solid #C62828',
};
