// Copyright (c) 2026 KanthiraLabs. All rights reserved. Proprietary and confidential.
// [P1] Full-page dashboard (opens in its own tab). A shared zone (protection status,
// trusted domains, safe contacts, reported senders, about/privacy) over the global keys,
// plus a tabbed per-provider zone (stats + Recent Threats) over the {provider}:* keys.
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
  getStats,
  getScanRows,
  setScanRows,
} from '../storage/local-state';
import { getThreats, type ThreatRecord, type Provider } from '../storage/threats';
import freeProviders from '../../../../data/free-email-providers.json';

// Freemail providers must never be "trusted" — doing so would clear the gate for every
// sender on that domain. Checked when adding a trusted domain.
const FREE_PROVIDERS = new Set((freeProviders as string[]).map((d) => d.toLowerCase()));

const VERSION = chrome.runtime.getManifest().version;

// Detection sensitivity is fixed at Balanced — the engine reads scoring_config, which
// keeps its stored default. There is no UI to change it.
const PROVIDER_LABEL: Record<Provider, string> = {
  gmail: 'Gmail',
  outlook: 'Outlook',
  zoho: 'Zoho',
};

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

/** "just now" / "12m ago" / "3h ago" / "2d ago". */
function relTime(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

/** One entry in a provider's Recent Threats feed. */
function threatCard(t: ThreatRecord): HTMLDivElement {
  const highRisk = t.riskLevel === 'High Risk';
  const accent = highRisk ? THEME.colors.danger : '#ED6C02';

  const card = document.createElement('div');
  Object.assign(card.style, {
    padding: '14px',
    marginBottom: '10px',
    background: THEME.colors.bg,
    borderRadius: THEME.radius.md,
    borderLeft: `3px solid ${accent}`,
  });

  const top = document.createElement('div');
  Object.assign(top.style, {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '6px',
  });
  const badge = document.createElement('span');
  badge.textContent = highRisk ? '🚨 High Risk' : '⚠ Suspicious';
  Object.assign(badge.style, { fontWeight: '700', fontSize: '13px', color: accent });
  top.append(badge, muted(relTime(t.timestamp), '11px'));

  const sender = document.createElement('div');
  sender.textContent = t.sender;
  Object.assign(sender.style, {
    fontSize: '13px',
    fontWeight: '600',
    marginBottom: '2px',
    wordBreak: 'break-all',
  });

  // subjectPrefix is capped at 30 chars by the store — show an ellipsis when it hit the cap.
  const subj = document.createElement('div');
  subj.textContent = `"${t.subjectPrefix}${t.subjectPrefix.length >= 30 ? '…' : ''}"`;
  Object.assign(subj.style, {
    fontSize: '13px',
    color: THEME.colors.textSecondary,
    marginBottom: '8px',
  });

  card.append(top, sender, subj);

  for (const r of t.reasons) {
    const li = document.createElement('div');
    li.textContent = `• ${r}`;
    Object.assign(li.style, { fontSize: '12px', color: THEME.colors.text, marginBottom: '3px' });
    card.append(li);
  }
  if (t.maliciousUrl) {
    const url = document.createElement('div');
    url.textContent = `🔗 ${t.maliciousUrl}`;
    Object.assign(url.style, {
      fontSize: '12px',
      color: THEME.colors.primary,
      marginTop: '6px',
      wordBreak: 'break-all',
    });
    card.append(url);
  }
  return card;
}

// --- main -------------------------------------------------------------------

async function render(): Promise<void> {
  const stored = await chrome.storage.local.get({ is_active: true });
  const isActive = stored.is_active as boolean;
  const scanRows = await getScanRows();

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
  Object.assign(brand.style, { display: 'flex', alignItems: 'center', gap: '12px' });
  const brandLogo = document.createElement('img');
  brandLogo.src = chrome.runtime.getURL('icons/prakni_logo_nobg.png');
  Object.assign(brandLogo.style, { width: '60px', height: '60px', objectFit: 'contain' });
  // Wordmark is dark text on transparent bg; invert to white for the dark header.
  const brandWordmark = document.createElement('img');
  brandWordmark.src = chrome.runtime.getURL('icons/wordmark_nobg.png');
  Object.assign(brandWordmark.style, {
    height: '70px',
    objectFit: 'contain',
    
  });
  brand.append(brandLogo, brandWordmark);

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
  const shield = document.createElement('img');
  shield.src = chrome.runtime.getURL('icons/prakni_logo_nobg.png');
  Object.assign(shield.style, { width: '44px', height: '44px', objectFit: 'contain' });
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

  // Scan inbox rows toggle — global (applies to every provider's inbox).
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
  const scanToggle = createToggleSwitch(scanRows, (on) => void setScanRows(on));
  scanRow.append(scanLabel, scanToggle.el);

  protCard.append(protRow, scanRow);

  // --- About & privacy card -------------------------------------------------
  const aboutCard = createCard();
  aboutCard.appendChild(sectionTitle('About & Privacy'));
  const how = document.createElement('div');
  how.append(
    (() => {
      const t = document.createElement('div');
      t.textContent = 'How Prakni Works';
      Object.assign(t.style, { fontWeight: '600', fontSize: '13px', marginBottom: '4px' });
      return t;
    })(),
    muted(
      'Prakni reads the sender, content, and links of an open email together and ' +
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
    (() => {
      const link = document.createElement('a');
      link.textContent = 'Read our full Privacy Policy →';
      link.href = 'https://kanthiralabs.github.io/prakni-privacy/';
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      Object.assign(link.style, {
        display: 'inline-block',
        marginTop: '6px',
        color: '#4F46E5',
        fontSize: '13px',
        textDecoration: 'none',
        fontWeight: '600',
      });
      link.addEventListener('mouseenter', () => {
        link.style.textDecoration = 'underline';
      });
      link.addEventListener('mouseleave', () => {
        link.style.textDecoration = 'none';
      });
      return link;
    })(),
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
  bug.href = 'mailto:support@kanthira.com';
  bug.style.color = THEME.colors.primary;
  meta.append(ver, bug);

  const copyright = document.createElement('div');
  copyright.textContent = '© 2026 KanthiraLabs. All rights reserved.';
  Object.assign(copyright.style, {
    marginTop: '14px',
    fontSize: '12px',
    color: THEME.colors.textSecondary,
  });

  aboutCard.append(how, privacy, meta, copyright);

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

  leftCol.append(protCard);
  rightCol.append(trustedCard, safeContactsCard, blockedCard);
  grid.append(leftCol, rightCol);

  // --- Per-provider zone (tabbed) -------------------------------------------
  // Display-only: reads the {provider}:* keys, writes nothing, triggers no scan.
  const provWrap = document.createElement('div');
  Object.assign(provWrap.style, {
    maxWidth: '1100px',
    margin: '0 auto 24px',
    padding: '0 24px',
    boxSizing: 'border-box',
  });

  const tabBar = document.createElement('div');
  Object.assign(tabBar.style, { display: 'flex', gap: '4px', marginBottom: '16px' });

  const panel = createCard();
  let activeProvider: Provider = 'gmail';

  const renderPanel = async (): Promise<void> => {
    panel.textContent = '';
    const stats = await getStats(activeProvider);
    const threats = await getThreats(activeProvider);

    const statsRow = document.createElement('div');
    Object.assign(statsRow.style, { display: 'flex', gap: '12px', marginBottom: '20px' });
    const statBox = (label: string, value: number, accent: string): HTMLDivElement => {
      const b = document.createElement('div');
      Object.assign(b.style, {
        flex: '1 1 0',
        textAlign: 'center',
        padding: '14px 8px',
        background: THEME.colors.bg,
        borderRadius: THEME.radius.md,
      });
      const n = document.createElement('div');
      n.textContent = String(value);
      Object.assign(n.style, { fontSize: '24px', fontWeight: '700', color: accent });
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
    panel.append(statsRow, sectionTitle('Recent Threats'));

    if (threats.length === 0) {
      panel.append(muted(`No threats detected in ${PROVIDER_LABEL[activeProvider]} yet.`));
      return;
    }
    for (const t of threats) panel.append(threatCard(t));
  };

  const tabs: { el: HTMLDivElement; provider: Provider }[] = [];
  const repaintTabs = (): void => {
    for (const t of tabs) {
      const on = t.provider === activeProvider;
      t.el.style.background = on ? THEME.colors.card : 'transparent';
      t.el.style.color = on ? THEME.colors.primary : THEME.colors.textSecondary;
      t.el.style.borderBottom = on
        ? `2px solid ${THEME.colors.primary}`
        : '2px solid transparent';
    }
  };
  const makeTab = (provider: Provider): HTMLDivElement => {
    const tab = document.createElement('div');
    tab.textContent = PROVIDER_LABEL[provider];
    Object.assign(tab.style, {
      padding: '10px 20px',
      cursor: 'pointer',
      fontWeight: '600',
      fontSize: '14px',
      borderRadius: `${THEME.radius.md} ${THEME.radius.md} 0 0`,
      transition: THEME.transitions.button,
    });
    tab.addEventListener('click', () => {
      activeProvider = provider;
      repaintTabs();
      void renderPanel();
    });
    tabs.push({ el: tab, provider });
    return tab;
  };
  tabBar.append(makeTab('gmail'), makeTab('outlook'));
  provWrap.append(tabBar, panel);
  repaintTabs();
  void renderPanel();

  // About sits full-width at the very bottom, aligned with the per-provider zone.
  // Wrapper (not the card itself) carries the alignment so the card keeps its padding.
  const aboutWrap = document.createElement('div');
  Object.assign(aboutWrap.style, {
    maxWidth: '1100px',
    margin: '0 auto 24px',
    padding: '0 24px',
    boxSizing: 'border-box',
  });
  aboutWrap.append(aboutCard);

  document.body.append(topBar, grid, provWrap, aboutWrap);

  // Initial paint of all toggle-driven UI.
  syncActive(isActive);

  // Reflect protection changes made elsewhere (e.g. the popup) without a refresh.
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.is_active) syncActive(changes.is_active.newValue as boolean);
  });
}

void render();
