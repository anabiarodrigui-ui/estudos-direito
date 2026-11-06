/**
 * Utilitários de interface: escape de HTML, modais (bottom sheet), toasts,
 * confirmação, leitura de formulário e download/upload de arquivos.
 */
import { icon } from './icons.js';

/** Escapa texto para inserir com segurança em HTML. */
export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

/** Toast curto no rodapé. */
export function toast(msg, ms = 2600) {
  const box = document.getElementById('toasts');
  if (!box) return;
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  box.appendChild(el);
  while (box.children.length > 3) box.firstElementChild.remove();
  setTimeout(() => el.remove(), ms);
}

/**
 * Abre um modal (bottom sheet no retrato, centralizado em telas largas).
 * @param {object} o
 * @param {string} o.title
 * @param {string} o.body   HTML do conteúdo
 * @param {Array}  o.actions [{label, cls, id, onClick(close, sheetEl) -> false mantém aberto, left}]
 * @param {Function} o.onOpen (sheetEl, close)
 * @param {boolean} o.wide
 */
export function openModal({ title, body, actions = [], onOpen, wide = false, onClose }) {
  const overlay = document.createElement('div');
  overlay.className = 'overlay';
  overlay.innerHTML = `
    <div class="sheet ${wide ? 'wide' : ''}" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <div class="sheet-head"><h2>${esc(title)}</h2>
        <button class="btn icon ghost" data-x aria-label="Fechar">${icon('x')}</button></div>
      <div class="sheet-body">${body}</div>
      ${actions.length ? `<div class="sheet-foot">${actions.map((a, i) =>
        `${a.left ? '' : ''}<button class="btn ${a.cls || ''}" data-a="${i}" ${a.id ? `id="${a.id}"` : ''}>${a.label}</button>${a.left ? '<span class="spacer"></span>' : ''}`).join('')}</div>` : ''}
    </div>`;
  const sheet = overlay.firstElementChild;
  let closed = false;
  const close = () => {
    if (closed) return; closed = true;
    overlay.remove();
    document.removeEventListener('keydown', onKey);
    onClose?.();
  };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  overlay.addEventListener('click', async (e) => {
    if (e.target === overlay || e.target.closest('[data-x]')) return close();
    const b = e.target.closest('[data-a]');
    if (b) {
      const a = actions[+b.dataset.a];
      const r = a.onClick ? await a.onClick(close, sheet) : undefined;
      if (r !== false) close();
    }
  });
  document.addEventListener('keydown', onKey);
  document.body.appendChild(overlay);
  onOpen?.(sheet, close);
  const first = sheet.querySelector('input:not([type=hidden]):not([type=checkbox]):not([type=radio]), textarea, select');
  if (first && window.matchMedia('(pointer: fine)').matches) first.focus();
  return { close, el: sheet };
}

/** Confirmação simples. Retorna Promise<boolean>. */
export function confirmDialog(message, { ok = 'Confirmar', danger = false, title = 'Confirmar' } = {}) {
  return new Promise((resolve) => {
    let answered = false;
    openModal({
      title,
      body: `<p>${message}</p>`,
      actions: [
        { label: 'Cancelar', onClick: () => { answered = true; resolve(false); } },
        { label: ok, cls: danger ? 'danger solid' : 'primary', onClick: () => { answered = true; resolve(true); } },
      ],
      onClose: () => { if (!answered) resolve(false); },
    });
  });
}

/** Lê um <form> como objeto (checkboxes múltiplos viram array). */
export function formData(form) {
  const out = {};
  for (const el of form.elements) {
    if (!el.name) continue;
    if (el.type === 'checkbox') {
      const multi = form.querySelectorAll(`[name="${el.name}"]`).length > 1;
      if (multi) { out[el.name] ??= []; if (el.checked) out[el.name].push(el.value); }
      else out[el.name] = el.checked;
    } else if (el.type === 'radio') {
      if (el.checked) out[el.name] = el.value;
    } else out[el.name] = el.value;
  }
  return out;
}

/** Baixa um arquivo gerado no navegador. */
export function downloadFile(name, content, type = 'application/json') {
  const blob = new Blob([content], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

/** Abre o seletor de arquivos e devolve [{name, text}]. */
export function pickFiles(accept = '.md,.txt,.json', multiple = true) {
  return new Promise((resolve) => {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = accept; inp.multiple = multiple;
    inp.onchange = async () => {
      const files = [...inp.files];
      resolve(await Promise.all(files.map(async (f) => ({ name: f.name, text: await f.text() }))));
    };
    inp.click();
  });
}

/**
 * Detecta "toque longo" + arrastar (para mover eventos no calendário),
 * sem atrapalhar a rolagem normal com o dedo.
 * @param {HTMLElement} root   contêiner com delegação
 * @param {string} itemSel     seletor dos itens arrastáveis
 * @param {string} dropSel     seletor dos alvos (precisam de data-date)
 * @param {Function} onDrop    (itemEl, dropEl)
 */
export function enableLongPressDrag(root, itemSel, dropSel, onDrop) {
  let timer = null, dragging = null, ghost = null, start = null, over = null, suppressClick = false;

  const cleanup = () => {
    clearTimeout(timer); timer = null;
    dragging?.classList.remove('dragging');
    ghost?.remove(); over?.classList.remove('drop');
    dragging = ghost = over = start = null;
  };

  root.addEventListener('pointerdown', (e) => {
    const item = e.target.closest(itemSel);
    if (!item || e.button > 0) return;
    start = { x: e.clientX, y: e.clientY, item };
    const delay = e.pointerType === 'mouse' ? 150 : 380;
    timer = setTimeout(() => {
      dragging = item;
      item.classList.add('dragging');
      ghost = item.cloneNode(true);
      ghost.classList.add('drag-ghost');
      ghost.style.left = start.x + 'px'; ghost.style.top = start.y + 'px';
      document.body.appendChild(ghost);
      navigator.vibrate?.(15);
    }, delay);
  });

  const move = (x, y) => {
    if (!start) return;
    if (!dragging) {
      // se o dedo se mexeu antes do toque longo, é rolagem: cancela
      if (Math.hypot(x - start.x, y - start.y) > 10) { clearTimeout(timer); start = null; }
      return;
    }
    ghost.style.left = x + 'px'; ghost.style.top = y + 'px';
    const target = document.elementFromPoint(x, y)?.closest(dropSel);
    if (target !== over) { over?.classList.remove('drop'); over = target; over?.classList.add('drop'); }
  };
  root.addEventListener('pointermove', (e) => move(e.clientX, e.clientY));

  const end = () => {
    if (dragging) {
      suppressClick = true;
      setTimeout(() => (suppressClick = false), 50);
      if (over) onDrop(dragging, over);
    }
    cleanup();
  };
  root.addEventListener('pointerup', end);
  root.addEventListener('pointercancel', () => { if (!dragging) cleanup(); });
  // Impede a rolagem da página enquanto arrasta no touch.
  root.addEventListener('touchmove', (e) => {
    if (!dragging) return;
    e.preventDefault();
    const t = e.touches[0];
    if (t) move(t.clientX, t.clientY);
  }, { passive: false });
  root.addEventListener('touchend', () => { if (dragging) end(); });
  root.addEventListener('contextmenu', (e) => { if (e.target.closest(itemSel)) e.preventDefault(); });
  root.addEventListener('click', (e) => { if (suppressClick) { e.stopPropagation(); e.preventDefault(); } }, true);
}
