// [P1.5] Link Shield warning page (extension context).
//
// Reached when the user opens a link that Cred Mail flagged: the Gmail adapter
// rewrote that link's href to point here (see adapters/gmail/interceptor.ts).
// Reads the intended destination from ?target= (the UNWRAPPED real URL) and the
// verdict reasons from ?reasons= (a JSON string array). Full-screen soft block:
// "Back to Safety" is primary; "Proceed Anyway" is de-emphasised and gated behind
// a 3-second countdown so a reflexive click can't bypass it.
//
// CSP/XSS discipline: every node via createElement + textContent (never innerHTML),
// every style via Object.assign (no CSS strings / <style> / classList).

const PROCEED_DELAY_SECONDS = 3;
const URL_DISPLAY_MAX = 70;

/** The flagged destination, query-stripped and truncated for safe display. */
function displayUrl(url: string): string {
  const stripped = url.split('?')[0];
  return stripped.length > URL_DISPLAY_MAX ? stripped.slice(0, URL_DISPLAY_MAX) + '…' : stripped;
}

/** Parse ?reasons= (JSON string array); tolerate anything malformed → []. */
function parseReasons(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((r) => typeof r === 'string') : [];
  } catch {
    return [];
  }
}

function render(): void {
  const params = new URLSearchParams(location.search);
  const targetUrl = params.get('target') ?? '';
  const reasons = parseReasons(params.get('reasons'));

  Object.assign(document.body.style, {
    margin: '0',
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '24px',
    boxSizing: 'border-box',
    background: '#1E1B4B',
    color: '#FFFFFF',
    fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
  });
  document.body.textContent = '';

  // --- Centered card --------------------------------------------------------
  const card = document.createElement('div');
  Object.assign(card.style, {
    background: '#FFFFFF',
    color: '#1F2937',
    borderRadius: '16px',
    boxShadow: '0 20px 60px rgba(0,0,0,0.35)',
    maxWidth: '540px',
    width: '100%',
    padding: '40px 36px',
    textAlign: 'center',
    boxSizing: 'border-box',
  });

  const icon = document.createElement('div');
  icon.textContent = '🛡️';
  Object.assign(icon.style, { fontSize: '64px', lineHeight: '1', marginBottom: '16px' });

  const headline = document.createElement('h1');
  headline.textContent = 'Phishing Link Blocked';
  Object.assign(headline.style, {
    fontSize: '26px',
    fontWeight: '800',
    margin: '0 0 12px',
    color: '#DC2626',
  });

  const subtext = document.createElement('p');
  subtext.textContent =
    'Cred Mail prevented you from visiting a potentially malicious website that may ' +
    'attempt to steal your passwords or install malware.';
  Object.assign(subtext.style, {
    fontSize: '15px',
    lineHeight: '1.5',
    color: '#4B5563',
    margin: '0 0 20px',
  });

  card.append(icon, headline, subtext);

  // --- Target URL box -------------------------------------------------------
  if (targetUrl) {
    const urlLabel = document.createElement('div');
    urlLabel.textContent = 'Blocked destination';
    Object.assign(urlLabel.style, {
      fontSize: '11px',
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: '0.05em',
      color: '#9CA3AF',
      marginBottom: '6px',
      textAlign: 'left',
    });

    const urlBox = document.createElement('div');
    urlBox.textContent = displayUrl(targetUrl);
    Object.assign(urlBox.style, {
      background: '#F3F4F6',
      border: '1px solid #E5E7EB',
      borderRadius: '8px',
      padding: '10px 12px',
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
      fontSize: '13px',
      color: '#DC2626',
      wordBreak: 'break-all',
      textAlign: 'left',
      marginBottom: '20px',
    });

    card.append(urlLabel, urlBox);
  }

  // --- Reasons --------------------------------------------------------------
  if (reasons.length > 0) {
    const reasonsLabel = document.createElement('div');
    reasonsLabel.textContent = 'Why it was flagged';
    Object.assign(reasonsLabel.style, {
      fontSize: '11px',
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: '0.05em',
      color: '#9CA3AF',
      marginBottom: '6px',
      textAlign: 'left',
    });

    const list = document.createElement('ul');
    Object.assign(list.style, {
      margin: '0 0 20px',
      padding: '0 0 0 18px',
      textAlign: 'left',
      color: '#4B5563',
      fontSize: '14px',
      lineHeight: '1.5',
    });
    for (const reason of reasons) {
      const li = document.createElement('li');
      li.textContent = reason;
      li.style.marginBottom = '4px';
      list.appendChild(li);
    }
    card.append(reasonsLabel, list);
  }

  // --- Primary: Back to Safety ----------------------------------------------
  const backBtn = document.createElement('button');
  backBtn.textContent = '← Back to Safety';
  Object.assign(backBtn.style, {
    display: 'block',
    width: '100%',
    padding: '14px',
    fontSize: '16px',
    fontWeight: '700',
    fontFamily: 'inherit',
    color: '#FFFFFF',
    background: '#4F46E5',
    border: 'none',
    borderRadius: '10px',
    cursor: 'pointer',
    marginBottom: '14px',
  });
  backBtn.addEventListener('click', () => {
    // window.close() only works for script-opened tabs; for a user-opened tab it's
    // blocked, so fall back to navigating back. (Middle-click new tabs may have no
    // history — a known browser limitation, not something we can close cleanly.)
    window.close();
    history.back();
  });

  // --- Secondary: Proceed Anyway (countdown-gated) --------------------------
  const proceedBtn = document.createElement('button');
  Object.assign(proceedBtn.style, {
    display: 'block',
    width: '100%',
    padding: '6px',
    fontSize: '13px',
    fontFamily: 'inherit',
    color: '#9CA3AF',
    background: 'transparent',
    border: 'none',
    textDecoration: 'underline',
    cursor: 'not-allowed',
  });
  proceedBtn.disabled = true;

  let remaining = PROCEED_DELAY_SECONDS;
  const paintCountdown = (): void => {
    proceedBtn.textContent = `Proceed anyway (${remaining}s)...`;
  };
  paintCountdown();

  const timer = window.setInterval(() => {
    remaining -= 1;
    if (remaining > 0) {
      paintCountdown();
      return;
    }
    window.clearInterval(timer);
    proceedBtn.disabled = false;
    proceedBtn.textContent = 'Proceed anyway (Unsafe)';
    Object.assign(proceedBtn.style, { cursor: 'pointer', color: '#9CA3AF' });
  }, 1000);

  proceedBtn.addEventListener('click', () => {
    if (proceedBtn.disabled || !targetUrl) return;
    window.location.href = targetUrl;
  });

  card.append(backBtn, proceedBtn);

  // --- Footer ---------------------------------------------------------------
  const footer = document.createElement('div');
  footer.textContent = 'Protected by Cred Mail · All analysis is local';
  Object.assign(footer.style, {
    marginTop: '24px',
    fontSize: '12px',
    color: '#9CA3AF',
  });

  document.body.append(card, footer);
}

render();
