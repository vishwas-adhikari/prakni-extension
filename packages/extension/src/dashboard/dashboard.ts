// [P1] Full-page dashboard (opens in its own tab). Protection status, trusted-domain
// and blocked-sender management, detection sensitivity, and about/privacy.
// A normal extension page: styles via Object.assign, nodes via createElement +
// textContent, all storage access async. No CSS files, no innerHTML.

import { THEME, createToggleSwitch, createButton, createCard } from './theme';
import {
  getWhitelist,
  addToWhitelist,
  removeFromWhitelist,
  getSafeContacts,
  addToSafeContacts,
  removeFromSafeContacts,
  getBlocklist,
  addToBlocklist,
  removeFromBlocklist,
} from '../storage/local-state';
import freeProviders from '../../../../data/free-email-providers.json';

// Freemail providers must never be "trusted" — doing so would clear the gate for every
// sender on that domain. Checked when adding a trusted domain.
const FREE_PROVIDERS = new Set((freeProviders as string[]).map((d) => d.toLowerCase()));

const VERSION = chrome.runtime.getManifest().version;

interface ScoringConfig {
  suspiciousThreshold: number;
  highRiskThreshold: number;
  weakCorroborationNeeded: number;
}

interface SessionStats {
  scanned: number;
  detected: number;
  markedSafe: number;
}

const DEFAULT_SCORING: ScoringConfig = {
  suspiciousThreshold: 30,
  highRiskThreshold: 70,
  weakCorroborationNeeded: 2,
};
const EMPTY_STATS: SessionStats = { scanned: 0, detected: 0, markedSafe: 0 };

type Sensitivity = 'Conservative' | 'Balanced' | 'Aggressive';
const SENSITIVITY: Record<Sensitivity, { suspiciousThreshold: number; highRiskThreshold: number }> = {
  Conservative: { suspiciousThreshold: 50, highRiskThreshold: 80 },
  Balanced: { suspiciousThreshold: 30, highRiskThreshold: 70 },
  Aggressive: { suspiciousThreshold: 20, highRiskThreshold: 50 },
};

function sensitivityFromConfig(c: ScoringConfig): Sensitivity {
  for (const key of Object.keys(SENSITIVITY) as Sensitivity[]) {
    if (SENSITIVITY[key].suspiciousThreshold === c.suspiciousThreshold) return key;
  }
  return 'Balanced';
}

// --- small builders ---------------------------------------------------------

function sectionTitle(text: string): HTMLDivElement {
  const h = document.createElement('div');
  h.textContent = text;
  Object.assign(h.style, {
    fontSize: '15px',
    fontWeight: '700',
    marginBottom: '14px',
    color: THEME.colors.text,
  });
  return h;
}

function muted(text: string, size = '13px'): HTMLDivElement {
  const d = document.createElement('div');
  d.textContent = text;
  Object.assign(d.style, { fontSize: size, color: THEME.colors.textSecondary });
  return d;
}

/** A managed list card (trusted domains / blocked senders). */
function listSection(opts: {
  title: string;
  subtitle?: string;
  emptyText: string;
  placeholder: string;
  validate: (v: string) => boolean;
  invalidText: string;
  // Extra gate after basic validation; return an error message to show (and reject), or null.
  extraReject?: (v: string) => string | null;
  load: () => Promise<string[]>;
  add: (v: string) => Promise<void>;
  remove: (v: string) => Promise<void>;
}): HTMLElement {
  const card = createCard();
  const heading = sectionTitle(opts.title);
  card.appendChild(heading);
  if (opts.subtitle) {
    const sub = muted(opts.subtitle, '12px');
    sub.style.marginBottom = '12px';
    card.appendChild(sub);
  }

  const list = document.createElement('div');
  Object.assign(list.style, {
    maxHeight: '220px',
    overflowY: 'auto',
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    marginBottom: '12px',
  });
  card.appendChild(list);

  const error = muted('', '12px');
  error.style.color = THEME.colors.danger;
  error.style.minHeight = '16px';

  const input = document.createElement('input');
  input.type = 'text';
  input.placeholder = opts.placeholder;
  Object.assign(input.style, {
    flex: '1 1 auto',
    padding: '8px 10px',
    fontSize: '13px',
    fontFamily: 'inherit',
    border: `1px solid ${THEME.colors.border}`,
    borderRadius: THEME.radius.sm,
    boxSizing: 'border-box',
  });

  const rebuild = async (): Promise<void> => {
    const items = await opts.load();
    heading.textContent = `${opts.title} (${items.length})`;
    list.textContent = '';
    if (items.length === 0) {
      list.appendChild(muted(opts.emptyText));
      return;
    }
    for (const item of items) {
      const row = document.createElement('div');
      Object.assign(row.style, {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '8px',
        padding: '6px 10px',
        background: THEME.colors.bg,
        border: `1px solid ${THEME.colors.border}`,
        borderRadius: THEME.radius.sm,
      });
      const label = document.createElement('span');
      label.textContent = item;
      Object.assign(label.style, { fontSize: '13px', wordBreak: 'break-all' });

      const x = document.createElement('button');
      x.textContent = '✕';
      x.title = `Remove ${item}`;
      Object.assign(x.style, {
        flex: '0 0 auto',
        width: '22px',
        height: '22px',
        lineHeight: '1',
        fontSize: '12px',
        color: THEME.colors.danger,
        background: 'transparent',
        border: 'none',
        cursor: 'pointer',
        borderRadius: THEME.radius.sm,
      });
      x.addEventListener('click', async () => {
        await opts.remove(item);
        await rebuild();
      });
      row.append(label, x);
      list.appendChild(row);
    }
  };

  // A small, self-dismissing red note below the add row (no alert()).
  const showTransientError = (msg: string): void => {
    const div = document.createElement('div');
    div.textContent = msg;
    Object.assign(div.style, { color: '#DC2626', fontSize: '12px', marginTop: '4px' });
    card.appendChild(div);
    setTimeout(() => div.remove(), 5000);
  };

  const submit = async (): Promise<void> => {
    const value = input.value.trim();
    if (!value) return;
    if (!opts.validate(value)) {
      error.textContent = opts.invalidText;
      return;
    }
    error.textContent = '';
    const rejection = opts.extraReject?.(value) ?? null;
    if (rejection) {
      input.value = '';
      showTransientError(rejection);
      return;
    }
    input.value = '';
    await opts.add(value);
    await rebuild();
  };

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') void submit();
  });

  const addRow = document.createElement('div');
  Object.assign(addRow.style, { display: 'flex', gap: '8px' });
  addRow.append(input, createButton('Add', () => void submit()));

  card.append(error, addRow);
  void rebuild();
  return card;
}

// --- main -------------------------------------------------------------------

async function render(): Promise<void> {
  const stored = await chrome.storage.local.get({
    is_active: true,
    scoring_config: DEFAULT_SCORING,
    session_stats: EMPTY_STATS,
    scan_inbox_rows: true,
  });
  const isActive = stored.is_active as boolean;
  const scoring = stored.scoring_config as ScoringConfig;
  const stats = stored.session_stats as SessionStats;
  const scanRows = stored.scan_inbox_rows as boolean;

  Object.assign(document.body.style, {
    margin: '0',
    fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
    background: THEME.colors.bg,
    color: THEME.colors.text,
    minHeight: '100vh',
  });
  document.body.textContent = '';

  // Keep both protection toggles + status text in sync.
  const setters: Array<(on: boolean) => void> = [];
  const syncActive = (on: boolean): void => setters.forEach((s) => s(on));
  const persistActive = async (on: boolean): Promise<void> => {
    await chrome.storage.local.set({ is_active: on });
    syncActive(on);
  };

  // --- Top bar --------------------------------------------------------------
  const topBar = document.createElement('div');
  Object.assign(topBar.style, {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    background: THEME.colors.headerBg,
    color: THEME.colors.headerText,
    padding: '14px 24px',
  });
  const brand = document.createElement('div');
  brand.textContent = '🛡️  Cred Mail';
  Object.assign(brand.style, { fontSize: '18px', fontWeight: '700' });

  const topRight = document.createElement('div');
  Object.assign(topRight.style, { display: 'flex', alignItems: 'center', gap: '10px' });
  const topStatus = document.createElement('span');
  Object.assign(topStatus.style, { fontSize: '13px', fontWeight: '600' });
  const topToggle = createToggleSwitch(isActive, (on) => void persistActive(on));
  setters.push((on) => {
    topToggle.set(on);
    topStatus.textContent = on ? 'Active' : 'Paused';
    topStatus.style.color = on ? THEME.colors.success : '#C7C5E0';
  });
  topRight.append(topStatus, topToggle.el);
  topBar.append(brand, topRight);

  // --- Grid -----------------------------------------------------------------
  const grid = document.createElement('div');
  Object.assign(grid.style, {
    display: 'grid',
    gap: '20px',
    maxWidth: '1100px',
    margin: '0 auto',
    padding: '24px',
    boxSizing: 'border-box',
  });
  const applyLayout = (): void => {
    grid.style.gridTemplateColumns = window.innerWidth < 768 ? '1fr' : '1fr 1fr';
  };
  applyLayout();
  window.addEventListener('resize', applyLayout);

  const leftCol = document.createElement('div');
  Object.assign(leftCol.style, { display: 'flex', flexDirection: 'column', gap: '20px' });
  const rightCol = document.createElement('div');
  Object.assign(rightCol.style, { display: 'flex', flexDirection: 'column', gap: '20px' });

  // --- Protection status card ----------------------------------------------
  const protCard = createCard();
  const protRow = document.createElement('div');
  Object.assign(protRow.style, { display: 'flex', alignItems: 'center', gap: '14px' });
  const shield = document.createElement('div');
  shield.textContent = '🛡️';
  shield.style.fontSize = '40px';
  const protText = document.createElement('div');
  Object.assign(protText.style, { flex: '1 1 auto', fontSize: '17px', fontWeight: '700' });
  const cardToggle = createToggleSwitch(isActive, (on) => void persistActive(on));
  setters.push((on) => {
    cardToggle.set(on);
    shield.style.filter = on ? 'none' : 'grayscale(1) opacity(0.5)';
    protText.textContent = on ? 'Protection Active' : 'Protection Paused';
    protText.style.color = on ? THEME.colors.success : THEME.colors.textSecondary;
  });
  protRow.append(shield, protText, cardToggle.el);

  const statsRow = document.createElement('div');
  Object.assign(statsRow.style, { display: 'flex', gap: '12px', marginTop: '18px' });
  const statBox = (label: string, value: number, accent: string): HTMLDivElement => {
    const b = document.createElement('div');
    Object.assign(b.style, {
      flex: '1 1 0',
      textAlign: 'center',
      padding: '12px 8px',
      background: THEME.colors.bg,
      borderRadius: THEME.radius.md,
    });
    const n = document.createElement('div');
    n.textContent = String(value);
    Object.assign(n.style, { fontSize: '22px', fontWeight: '700', color: accent });
    const c = muted(label, '11px');
    c.style.marginTop = '2px';
    b.append(n, c);
    return b;
  };
  statsRow.append(
    statBox('Scanned', stats.scanned, THEME.colors.primary),
    statBox('Detected', stats.detected, THEME.colors.danger),
    statBox('Marked Safe', stats.markedSafe, THEME.colors.success),
  );
  protCard.append(protRow, statsRow);

  // --- Detection settings card ---------------------------------------------
  const detCard = createCard();
  detCard.appendChild(sectionTitle('Detection Settings'));

  let currentSensitivity = sensitivityFromConfig(scoring);
  const optionEls = new Map<Sensitivity, HTMLDivElement>();
  const sensWrap = document.createElement('div');
  Object.assign(sensWrap.style, { display: 'flex', flexDirection: 'column', gap: '8px' });

  const paintSensitivity = (): void => {
    for (const [key, el] of optionEls) {
      const on = key === currentSensitivity;
      el.style.borderColor = on ? THEME.colors.primary : THEME.colors.border;
      el.style.background = on ? THEME.colors.primaryLight : THEME.colors.card;
    }
  };

  const SENS_DESC: Record<Sensitivity, string> = {
    Conservative: 'Fewer warnings, might miss edge cases',
    Balanced: 'Recommended',
    Aggressive: 'More warnings, more false positives',
  };
  for (const key of Object.keys(SENSITIVITY) as Sensitivity[]) {
    const opt = document.createElement('div');
    Object.assign(opt.style, {
      padding: '10px 12px',
      border: `2px solid ${THEME.colors.border}`,
      borderRadius: THEME.radius.md,
      cursor: 'pointer',
      transition: THEME.transitions.button,
    });
    const name = document.createElement('div');
    name.textContent = key;
    Object.assign(name.style, { fontWeight: '600', fontSize: '13px' });
    opt.append(name, muted(SENS_DESC[key], '12px'));
    opt.addEventListener('click', async () => {
      currentSensitivity = key;
      paintSensitivity();
      await chrome.storage.local.set({
        scoring_config: { ...SENSITIVITY[key], weakCorroborationNeeded: scoring.weakCorroborationNeeded },
      });
    });
    optionEls.set(key, opt);
    sensWrap.appendChild(opt);
  }
  paintSensitivity();
  detCard.appendChild(sensWrap);

  // Scan inbox rows toggle.
  const scanRow = document.createElement('div');
  Object.assign(scanRow.style, {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '12px',
    marginTop: '16px',
    paddingTop: '16px',
    borderTop: `1px solid ${THEME.colors.border}`,
  });
  const scanLabel = document.createElement('div');
  scanLabel.textContent = 'Scan inbox rows';
  Object.assign(scanLabel.style, { fontWeight: '600', fontSize: '13px' });
  const scanToggle = createToggleSwitch(scanRows, async (on) => {
    await chrome.storage.local.set({ scan_inbox_rows: on });
  });
  scanRow.append(scanLabel, scanToggle.el);
  detCard.appendChild(scanRow);

  // --- About & privacy card -------------------------------------------------
  const aboutCard = createCard();
  aboutCard.appendChild(sectionTitle('About & Privacy'));
  const how = document.createElement('div');
  how.append(
    (() => {
      const t = document.createElement('div');
      t.textContent = 'How Cred Mail Works';
      Object.assign(t.style, { fontWeight: '600', fontSize: '13px', marginBottom: '4px' });
      return t;
    })(),
    muted(
      'Cred Mail reads the sender, content, and links of an open email together and ' +
        'warns only when independent signals agree it is suspicious. Most mail is safe, ' +
        'so it stays silent unless there is something worth flagging.',
    ),
  );
  const privacy = document.createElement('div');
  privacy.style.marginTop = '14px';
  privacy.append(
    (() => {
      const t = document.createElement('div');
      t.textContent = 'Your Privacy';
      Object.assign(t.style, { fontWeight: '600', fontSize: '13px', marginBottom: '4px' });
      return t;
    })(),
    muted('All analysis happens on your device. Email content is never sent to any server.'),
  );

  const meta = document.createElement('div');
  Object.assign(meta.style, {
    marginTop: '14px',
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    fontSize: '12px',
    color: THEME.colors.textSecondary,
  });
  const ver = document.createElement('span');
  ver.textContent = `Version ${VERSION}`;
  const bug = document.createElement('a');
  bug.textContent = 'Report a Bug';
  bug.href = 'mailto:support@credmail.app';
  bug.style.color = THEME.colors.primary;
  meta.append(ver, bug);

  aboutCard.append(how, privacy, meta);

  // --- Lists ----------------------------------------------------------------
  const trustedCard = listSection({
    title: 'Trusted Domains',
    emptyText: 'No trusted domains yet',
    placeholder: 'example.com',
    invalidText: 'Enter a valid domain (e.g. example.com) — no spaces or http://',
    validate: (v) => v.includes('.') && !/\s/.test(v) && !v.toLowerCase().includes('http://'),
    extraReject: (v) =>
      FREE_PROVIDERS.has(v.toLowerCase())
        ? 'Cannot trust public email providers like gmail.com — this would disable protection for all emails from this domain.'
        : null,
    load: getWhitelist,
    add: addToWhitelist,
    remove: removeFromWhitelist,
  });

  const safeContactsCard = listSection({
    title: 'Safe Contacts',
    subtitle:
      "Individual email addresses you've marked safe. Used for public email providers " +
      'like Gmail where trusting the whole domain would be unsafe.',
    emptyText:
      'No safe contacts yet. When you mark an email safe from a public provider like ' +
      'Gmail, it appears here.',
    placeholder: 'friend@gmail.com',
    invalidText: 'Enter a valid email address (must contain @)',
    validate: (v) => v.includes('@') && !/\s/.test(v),
    extraReject: (v) =>
      FREE_PROVIDERS.has((v.split('@')[1] ?? '').toLowerCase())
        ? null
        : 'Use Trusted Domains instead for non-public email providers.',
    load: getSafeContacts,
    add: addToSafeContacts,
    remove: removeFromSafeContacts,
  });

  const blockedCard = listSection({
    title: 'Reported Senders',
    emptyText: 'No reported senders yet',
    placeholder: 'sender@example.com',
    invalidText: 'Enter a valid email address (must contain @)',
    validate: (v) => v.includes('@') && !/\s/.test(v),
    load: getBlocklist,
    add: addToBlocklist,
    remove: removeFromBlocklist,
  });

  leftCol.append(protCard, detCard, aboutCard);
  rightCol.append(trustedCard, safeContactsCard, blockedCard);
  grid.append(leftCol, rightCol);

  document.body.append(topBar, grid);

  // Initial paint of all toggle-driven UI.
  syncActive(isActive);

  // Reflect protection changes made elsewhere (e.g. the popup) without a refresh.
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.is_active) syncActive(changes.is_active.newValue as boolean);
  });
}

void render();
