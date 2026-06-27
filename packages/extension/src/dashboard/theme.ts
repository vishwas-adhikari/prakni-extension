// [P1] Shared visual theme + UI primitives for the popup and dashboard pages.
//
// These are normal extension pages (not injected into Gmail), but we keep the same
// discipline: styles applied via Object.assign, nodes via createElement + textContent,
// no CSS files / <style> tags / innerHTML.

export const THEME = {
  colors: {
    primary: '#4F46E5',
    primaryLight: '#EEF2FF',
    primaryDark: '#3730A3',
    success: '#10B981',
    successLight: '#D1FAE5',
    warning: '#F59E0B',
    warningLight: '#FEF3C7',
    danger: '#DC2626',
    dangerLight: '#FEE2E2',
    bg: '#F9FAFB',
    card: '#FFFFFF',
    text: '#111827',
    textSecondary: '#6B7280',
    border: '#E5E7EB',
    headerBg: '#1E1B4B',
    headerText: '#FFFFFF',
  },
  shadows: {
    card: '0 1px 3px 0 rgba(0,0,0,0.1)',
    cardHover: '0 4px 6px -1px rgba(0,0,0,0.1)',
  },
  radius: { sm: '6px', md: '8px', lg: '12px' },
  transitions: {
    button: 'all 0.2s ease',
    toggle: 'all 0.3s ease',
  },
};

/**
 * A modern slider switch (pill track + sliding circle), built from divs and toggled
 * purely via Object.assign — not a checkbox/input. Returns the track element and an
 * imperative `set(on)` so callers can reflect external state changes (e.g. storage).
 */
export function createToggleSwitch(
  initial: boolean,
  onChange: (on: boolean) => void,
): { el: HTMLElement; set: (on: boolean) => void } {
  let on = initial;

  const track = document.createElement('div');
  Object.assign(track.style, {
    position: 'relative',
    width: '44px',
    height: '24px',
    borderRadius: '12px',
    cursor: 'pointer',
    flex: '0 0 auto',
    transition: THEME.transitions.toggle,
  });

  const knob = document.createElement('div');
  Object.assign(knob.style, {
    position: 'absolute',
    top: '2px',
    width: '20px',
    height: '20px',
    borderRadius: '50%',
    background: '#FFFFFF',
    boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
    transition: THEME.transitions.toggle,
  });
  track.appendChild(knob);

  const paint = (): void => {
    track.style.background = on ? THEME.colors.success : '#9CA3AF';
    knob.style.left = on ? '22px' : '2px';
    track.setAttribute('aria-checked', String(on));
  };

  const set = (next: boolean): void => {
    on = next;
    paint();
  };

  track.setAttribute('role', 'switch');
  track.addEventListener('click', () => {
    on = !on;
    paint();
    onChange(on);
  });

  paint();
  return { el: track, set };
}

/** A text button with a subtle hover darken, wired via mouseenter/leave (no CSS). */
export function createButton(
  label: string,
  onClick: () => void,
  opts: { bg?: string; color?: string } = {},
): HTMLButtonElement {
  const bg = opts.bg ?? THEME.colors.primary;
  const color = opts.color ?? '#FFFFFF';
  const btn = document.createElement('button');
  btn.textContent = label;
  Object.assign(btn.style, {
    padding: '8px 14px',
    fontSize: '13px',
    fontWeight: '600',
    fontFamily: 'inherit',
    color,
    background: bg,
    border: 'none',
    borderRadius: THEME.radius.sm,
    cursor: 'pointer',
    transition: THEME.transitions.button,
  });
  btn.addEventListener('mouseenter', () => {
    btn.style.filter = 'brightness(0.92)';
  });
  btn.addEventListener('mouseleave', () => {
    btn.style.filter = 'none';
  });
  btn.addEventListener('click', onClick);
  return btn;
}

/** A card container with the standard shadow / radius / padding. */
export function createCard(): HTMLDivElement {
  const card = document.createElement('div');
  Object.assign(card.style, {
    background: THEME.colors.card,
    boxShadow: THEME.shadows.card,
    borderRadius: THEME.radius.md,
    padding: '20px',
    boxSizing: 'border-box',
  });
  return card;
}
