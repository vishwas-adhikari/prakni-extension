// Copyright (c) 2026 KanthiraLabs. All rights reserved. Proprietary and confidential.
// [P1] Popup — quick access from the extension icon (~350x450).
// Protection toggle + this-session stats + a button to the full dashboard.
// All styling via Object.assign, all nodes via createElement + textContent.

import { THEME, createToggleSwitch } from '../dashboard/theme';

const VERSION = chrome.runtime.getManifest().version;

interface SessionStats {
  scanned: number;
  detected: number;
  markedSafe: number;
}

const EMPTY_STATS: SessionStats = { scanned: 0, detected: 0, markedSafe: 0 };

function statCard(label: string, value: number, accent: string): HTMLDivElement {
  const card = document.createElement('div');
  Object.assign(card.style, {
    flex: '1 1 0',
    background: THEME.colors.card,
    border: `1px solid ${THEME.colors.border}`,
    borderRadius: THEME.radius.md,
    padding: '14px 10px',
    textAlign: 'center',
  });

  const num = document.createElement('div');
  num.textContent = String(value);
  Object.assign(num.style, { fontSize: '26px', fontWeight: '700', color: accent });

  const cap = document.createElement('div');
  cap.textContent = label;
  Object.assign(cap.style, {
    fontSize: '11px',
    color: THEME.colors.textSecondary,
    marginTop: '4px',
  });

  card.append(num, cap);
  return card;
}

async function render(): Promise<void> {
  const stored = await chrome.storage.local.get({ is_active: true, session_stats: EMPTY_STATS });
  const is_active = stored.is_active as boolean;
  const session_stats = stored.session_stats as SessionStats;

  Object.assign(document.body.style, {
    margin: '0',
    width: '350px',
    minHeight: '450px',
    fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
    background: THEME.colors.bg,
    color: THEME.colors.text,
    boxSizing: 'border-box',
  });
  document.body.textContent = '';

  // --- Header ---------------------------------------------------------------
  const header = document.createElement('div');
  Object.assign(header.style, {
    display: 'flex',
    alignItems: 'center',
    gap: '5px',
    background: THEME.colors.headerBg,
    color: THEME.colors.headerText,
    padding: '10px 16px',
  });
  const logo = document.createElement('img');
  logo.src = chrome.runtime.getURL('icons/prakni_logo_nobg.png');
  Object.assign(logo.style, { width: '58px', height: '58px', objectFit: 'contain' });
  // Wordmark is dark text on transparent bg; invert to white for the dark header.
  const wordmark = document.createElement('img');
  wordmark.src = chrome.runtime.getURL('icons/wordmark_nobg.png');
  Object.assign(wordmark.style, {
    height: '52px',
    objectFit: 'contain',
  
  });
  header.append(logo, wordmark);

  // --- Body -----------------------------------------------------------------
  const body = document.createElement('div');
  Object.assign(body.style, { padding: '16px', display: 'flex', flexDirection: 'column', gap: '16px' });

  // Protection status block.
  const status = document.createElement('div');
  Object.assign(status.style, {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    background: THEME.colors.card,
    border: `1px solid ${THEME.colors.border}`,
    borderRadius: THEME.radius.md,
    padding: '14px',
  });

  const shield = document.createElement('img');
  shield.src = chrome.runtime.getURL('icons/prakni_logo_nobg.png');
  Object.assign(shield.style, { width: '28px', height: '28px', objectFit: 'contain' });

  const statusText = document.createElement('div');
  Object.assign(statusText.style, { flex: '1 1 auto', fontWeight: '600', fontSize: '14px' });

  const paintStatus = (active: boolean): void => {
    shield.style.filter = active ? 'none' : 'grayscale(1) opacity(0.5)';
    statusText.textContent = active ? 'Protection Active' : 'Protection Paused';
    statusText.style.color = active ? THEME.colors.success : THEME.colors.textSecondary;
  };

  const toggle = createToggleSwitch(is_active, async (on) => {
    await chrome.storage.local.set({ is_active: on });
    paintStatus(on);
  });
  paintStatus(is_active);
  status.append(shield, statusText, toggle.el);

  // Stats cards.
  const stats = document.createElement('div');
  Object.assign(stats.style, { display: 'flex', gap: '10px' });
  stats.append(
    statCard('Emails scanned', session_stats.scanned, THEME.colors.primary),
    statCard('Threats detected', session_stats.detected, THEME.colors.danger),
  );

  // Open dashboard.
  const dashBtn = document.createElement('button');
  dashBtn.textContent = 'Open Dashboard';
  Object.assign(dashBtn.style, {
    width: '100%',
    padding: '11px',
    fontSize: '14px',
    fontWeight: '600',
    fontFamily: 'inherit',
    color: '#FFFFFF',
    background: THEME.colors.primary,
    border: 'none',
    borderRadius: THEME.radius.md,
    cursor: 'pointer',
    transition: THEME.transitions.button,
  });
  dashBtn.addEventListener('mouseenter', () => (dashBtn.style.filter = 'brightness(0.92)'));
  dashBtn.addEventListener('mouseleave', () => (dashBtn.style.filter = 'none'));
  dashBtn.addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('dashboard.html') });
  });

  body.append(status, stats, dashBtn);

  // --- Footer ---------------------------------------------------------------
  const footer = document.createElement('div');
  footer.textContent = `v${VERSION} · © 2026 KanthiraLabs`;
  Object.assign(footer.style, {
    padding: '12px 16px',
    fontSize: '11px',
    color: THEME.colors.textSecondary,
    textAlign: 'center',
  });

  document.body.append(header, body, footer);
}

void render();
