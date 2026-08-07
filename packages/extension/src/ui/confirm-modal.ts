// Copyright (c) 2026 KanthiraLabs. All rights reserved. Proprietary and confidential.
// Lightweight in-page confirmation modal (createElement + Object.assign only; no innerHTML).
// Used when an action needs explicit confirmation (e.g. marking a reported sender safe).

export interface ConfirmModalOptions {
  title: string;
  bodyLines: string[];   // each rendered as its own paragraph
  highlight?: string;    // optional phrase inside a bodyLine to emphasize in red
  email?: string;        // optional email shown in a divider row
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  onCancel?: () => void;
}

const MODAL_ID = 'prakni-confirm-modal';

export function showConfirmModal(opts: ConfirmModalOptions): void {
  document.getElementById(MODAL_ID)?.remove(); // idempotent

  const overlay = document.createElement('div');
  overlay.id = MODAL_ID;
  Object.assign(overlay.style, {
    position: 'fixed', inset: '0', zIndex: '2147483647',
    background: 'rgba(30,30,50,0.55)', display: 'flex',
    alignItems: 'center', justifyContent: 'center',
    fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
  });

  const card = document.createElement('div');
  Object.assign(card.style, {
    background: '#fff', borderRadius: '16px', padding: '32px',
    maxWidth: '440px', width: '90%', textAlign: 'center',
    boxShadow: '0 20px 60px rgba(0,0,0,0.3)', boxSizing: 'border-box',
  });

  const icon = document.createElement('div');
  icon.textContent = '⚠';
  Object.assign(icon.style, { fontSize: '40px', color: '#ED6C02', marginBottom: '12px' });

  const h = document.createElement('div');
  h.textContent = opts.title;
  Object.assign(h.style, { fontSize: '26px', fontWeight: '700', color: '#1a1a2e', marginBottom: '16px' });

  card.append(icon, h);

  for (const line of opts.bodyLines) {
    const p = document.createElement('p');
    Object.assign(p.style, { fontSize: '15px', color: '#3a3a52', margin: '8px 0', lineHeight: '1.5' });
    if (opts.highlight && line.includes(opts.highlight)) {
      const [before, after] = line.split(opts.highlight);
      p.append(document.createTextNode(before));
      const em = document.createElement('span');
      em.textContent = opts.highlight;
      Object.assign(em.style, { color: '#DC2626', fontWeight: '700' });
      p.append(em, document.createTextNode(after));
    } else {
      p.textContent = line;
    }
    card.append(p);
  }

  if (opts.email) {
    const divider = document.createElement('div');
    Object.assign(divider.style, {
      borderTop: '1px dashed #d0d0e0', borderBottom: '1px dashed #d0d0e0',
      padding: '12px 0', margin: '16px 0', display: 'flex',
      alignItems: 'center', justifyContent: 'center', gap: '10px',
    });
    const label = document.createElement('span');
    label.textContent = 'Email:';
    Object.assign(label.style, { color: '#8888a0', fontSize: '13px' });
    const addr = document.createElement('span');
    addr.textContent = opts.email;
    Object.assign(addr.style, { color: '#1a1a2e', fontSize: '15px', fontWeight: '600', wordBreak: 'break-all' });
    divider.append(label, addr);
    card.append(divider);
  }

  const btnRow = document.createElement('div');
  Object.assign(btnRow.style, { display: 'flex', gap: '12px', marginTop: '20px' });

  const close = (): void => overlay.remove();

  const cancelBtn = document.createElement('button');
  cancelBtn.textContent = opts.cancelLabel;
  Object.assign(cancelBtn.style, {
    flex: '1', padding: '14px', fontSize: '15px', fontWeight: '600',
    borderRadius: '10px', border: '1px solid #d0d0e0', background: '#fff',
    color: '#3a3a52', cursor: 'pointer',
  });
  cancelBtn.addEventListener('click', () => { close(); opts.onCancel?.(); });

  const confirmBtn = document.createElement('button');
  confirmBtn.textContent = opts.confirmLabel;
  Object.assign(confirmBtn.style, {
    flex: '1', padding: '14px', fontSize: '15px', fontWeight: '700',
    borderRadius: '10px', border: 'none', background: '#5B3FE8',
    color: '#fff', cursor: 'pointer',
  });
  confirmBtn.addEventListener('click', () => { close(); opts.onConfirm(); });

  btnRow.append(cancelBtn, confirmBtn);
  card.append(btnRow);

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) { close(); opts.onCancel?.(); }
  });

  overlay.append(card);
  document.body.append(overlay);
}
