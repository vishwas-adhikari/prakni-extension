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
//
// Two-column layout: [icon circle] [content grid]. The content grid is
// `1fr auto` — reasons on the left, a stacked button + footer column on the
// right — with the header spanning both. Colour maps are merged onto the bases.

/** Outer container: flex row, shared across both risk levels. */
export const bannerBase: StyleMap = {
  display: 'flex',
  flexDirection: 'row',
  alignItems: 'center',
  gap: '16px',
  padding: '16px 20px',
  marginBottom: '16px',
  borderRadius: '12px',
  boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
  fontSize: '14px',
  fontFamily: 'inherit',
  zIndex: '9999',
  position: 'relative',
};

export const bannerSuspicious: StyleMap = {
  background: '#FFF8F0',
  borderLeft: '5px solid #FF9800',
};

export const bannerHighRisk: StyleMap = {
  background: '#FFF0F0',
  borderLeft: '5px solid #C62828',
};

/** Left column: large circular icon (the PNG has its own circle baked in). */
export const bannerIcon: StyleMap = {
  width: '72px',
  height: '72px',
  objectFit: 'contain',
  flexShrink: '0',
  alignSelf: 'center',
};

/** Right column: grid holding header (full width), reasons (left), actions (right). */
export const contentGrid: StyleMap = {
  flex: '1',
  minWidth: '0',
  display: 'grid',
  gridTemplateColumns: '1fr auto',
  columnGap: '20px',
  rowGap: '10px',
  alignItems: 'start',
  borderLeft: '1px solid rgba(0,0,0,0.08)',
  paddingLeft: '16px',
};

export const bannerHeader: StyleMap = {
  gridColumn: '1 / -1',
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  fontWeight: '700',
  fontSize: '16px',
  lineHeight: '1.3',
};

export const headerSuspicious: StyleMap = {
  color: '#E65100',
};

export const headerHighRisk: StyleMap = {
  color: '#C62828',
};

export const reasonList: StyleMap = {
  gridColumn: '1',
  marginTop: '8px',
  marginBottom: '8px',
  paddingLeft: '20px',
  listStyleType: 'disc',
  fontSize: '14px',
  color: '#424242',
  lineHeight: '1.7',
};

export const reasonItem: StyleMap = {
  marginBottom: '4px',
};

export const affectedLink: StyleMap = {
  fontFamily: 'monospace',
  fontSize: '12px',
  color: '#757575',
  wordBreak: 'break-all',
  marginTop: '4px',
};

/** Right-hand action column: stacked buttons + footer. */
export const rightColumn: StyleMap = {
  gridColumn: '2',
  justifySelf: 'end',
  alignSelf: 'center',
  minWidth: '160px',
  display: 'flex',
  flexDirection: 'column',
  gap: '12px',
};

export const buttonBase: StyleMap = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '6px',
  width: '100%',
  minWidth: '140px',
  boxSizing: 'border-box',
  padding: '10px 20px',
  fontSize: '14px',
  fontFamily: 'inherit',
  fontWeight: '600',
  borderRadius: '8px',
  cursor: 'pointer',
  whiteSpace: 'nowrap',
  transition: 'background 0.15s ease, border-color 0.15s ease',
};

export const buttonMarkSafe: StyleMap = {
  background: '#FFFFFF',
  border: '1.5px solid #9E9E9E',
  color: '#424242',
};

export const buttonMarkSafeHover: StyleMap = {
  borderColor: '#616161',
};

export const buttonReport: StyleMap = {
  background: '#C62828',
  border: '1.5px solid #C62828',
  color: '#FFFFFF',
};

export const buttonReportHover: StyleMap = {
  background: '#A81E1E',
  borderColor: '#A81E1E',
};

export const footer: StyleMap = {
  fontSize: '12px',
  color: '#9E9E9E',
  textAlign: 'right',
  marginTop: '4px',
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
