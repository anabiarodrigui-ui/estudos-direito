/**
 * Leitor de guias: texto limpo, fonte ajustável, índice navegável,
 * destaque com o dedo (marca-texto em 4 cores), anotações e status de leitura.
 *
 * Como destacar no tablet: segure o dedo sobre uma palavra para selecionar,
 * ajuste as alças da seleção e toque numa cor na barra que aparece embaixo.
 */
import * as db from '../core/db.js';
import { ls } from '../core/db.js';
import { esc, openModal, toast, confirmDialog, formData } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { subjectName, subjectOptions } from '../ui/common.js';
import { go } from '../app.js';
import { parseMarkdown } from '../core/markdown.js';
import { applyHighlights, markFind, selectionOffsets } from '../ui/highlights.js';
import { STATUS } from './library.js';

const COLORS = [['', 'var(--mark)', 'Amarelo'], ['green', 'var(--mark-green)', 'Verde'], ['blue', 'var(--mark-blue)', 'Azul'], ['pink', 'var(--mark-pink)', 'Rosa']];

export function render(root, { id, params }) {
  const g = db.get('guides', id);
  if (!g) { root.innerHTML = `<div class="card empty">Guia não encontrado. <a href="#/resumos">Voltar</a></div>`; return; }
  const s = db.getSettings();
  const { html, toc } = parseMarkdown(g.content);
  const tocHtml = toc.filter((t) => t.level >= 2 && t.level <= 4).map((t) => `<a href="#" data-toc="${t.id}" class="l${t.level}">${esc(t.text)}</a>`).join('');
  const hasToc = !!tocHtml;

  root.innerHTML = `
    <div class="reader-bar">
      <button class="btn icon ghost" data-back aria-label="Voltar">${icon('left')}</button>
      <div class="grow"><div class="title" style="font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(g.title)}</div>
        <div class="small muted">${esc(subjectName(g.subjectId))}</div></div>
      ${hasToc ? `<button class="btn icon reader-toc-inline" data-tocbtn aria-label="Índice">${icon('list')}</button>` : ''}
      <button class="btn icon" data-font aria-label="Texto e fonte">${icon('text')}</button>
      <button class="btn icon" data-notes aria-label="Destaques e anotações">${icon('note')}</button>
      <button class="btn icon" data-menu aria-label="Mais opções">${icon('more')}</button>
    </div>
    <div class="chips" role="group" aria-label="Status de leitura" style="margin-bottom:16px">
      ${Object.entries(STATUS).map(([k, v]) => `<button class="chip" data-status="${k}" aria-pressed="${(g.status || 'novo') === k}">${k === 'lido' ? icon('check') : ''}${v.label}</button>`).join('')}
    </div>
    <div class="reader-wrap ${hasToc ? 'with-toc' : ''}">
      <article class="reader" id="reader">${html}</article>
      ${hasToc ? `<aside class="reader-side"><nav class="reader-toc card" aria-label="Índice"><b>Índice</b>${tocHtml}</nav></aside>` : ''}
    </div>
    <div class="btn-row mt" style="justify-content:center">
      <button class="btn ${g.status === 'lido' ? '' : 'primary'}" data-status="lido">${icon('check')} Marcar como lido</button>
      <button class="btn" data-gen>${icon('cards')} Gerar flashcards deste guia</button>
    </div>
    <div class="hl-bar" id="hlbar" hidden>
      ${COLORS.map(([c, v, n]) => `<button class="sw" data-color="${c}" style="background:${v}" aria-label="Destacar em ${n}"></button>`).join('')}
      <button class="btn small" data-hlnote>${icon('note')} Nota</button>
    </div>
  `;

  const article = root.querySelector('#reader');
  const applyFont = () => {
    const st = db.getSettings();
    article.style.setProperty('--reader-size', st.readerSize + 'px');
    article.style.setProperty('--reader-lh', st.readerLineHeight);
    article.style.setProperty('--reader-font', st.readerFont === 'sans' ? 'var(--font-ui)' : 'var(--font-serif)');
  };
  applyFont();

  const paint = () => {
    article.innerHTML = html;
    applyHighlights(article, db.where('highlights', (h) => h.guideId === id));
  };
  paint();

  // busca vinda da biblioteca
  if (params.q) {
    const first = markFind(article, params.q);
    if (first) setTimeout(() => first.scrollIntoView({ block: 'center' }), 50);
  } else {
    const y = +ls.get('ed:pos:' + id) || 0;
    if (y) setTimeout(() => window.scrollTo(0, y), 30);
  }

  // ----- seleção -> barra de destaque -----
  const bar = root.querySelector('#hlbar');
  let pending = null;
  const onSel = () => {
    const off = selectionOffsets(article);
    pending = off;
    bar.hidden = !off;
  };
  document.addEventListener('selectionchange', onSel);

  const saveHighlight = async (color, note = '') => {
    if (!pending) return null;
    const h = await db.put('highlights', { guideId: id, ...pending, color, note });
    window.getSelection().removeAllRanges();
    pending = null; bar.hidden = true;
    paint();
    return h;
  };

  // posição de leitura
  let st;
  const onScroll = () => { clearTimeout(st); st = setTimeout(() => ls.set('ed:pos:' + id, String(Math.round(scrollY))), 300); };
  addEventListener('scroll', onScroll, { passive: true });

  root.addEventListener('click', async (e) => {
    const t = e.target;
    if (t.closest('[data-back]')) return history.length > 1 ? history.back() : go('resumos');
    const sw = t.closest('[data-color]');
    if (sw) { await saveHighlight(sw.dataset.color); return toast('Trecho destacado'); }
    if (t.closest('[data-hlnote]')) {
      const snap = pending;
      return openNote({ text: snap?.text }, async (note) => { pending = snap; await saveHighlight('', note); });
    }
    const mk = t.closest('mark.hl');
    if (mk && window.getSelection().isCollapsed) return editHighlight(mk.dataset.hl, paint);
    const tc = t.closest('[data-toc]');
    if (tc) { e.preventDefault(); return scrollToId(tc.dataset.toc); }
    if (t.closest('[data-tocbtn]')) return openToc(toc);
    if (t.closest('[data-font]')) return openFontDialog(applyFont);
    if (t.closest('[data-notes]')) return openNotesList(id, paint);
    if (t.closest('[data-menu]')) return openMenu(g);
    const stb = t.closest('[data-status]');
    if (stb) {
      g.status = stb.dataset.status;
      await db.put('guides', g);
      root.querySelectorAll('.chips [data-status]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.status === g.status));
      return toast(STATUS[g.status].label);
    }
    if (t.closest('[data-gen]')) { const m = await import('./flashcards.js'); return m.openGenerateDialog([g]); }
  });

  // a tela não é redesenhada automaticamente (para não perder a seleção/rolagem)
  return {
    keep: true,
    destroy() {
      document.removeEventListener('selectionchange', onSel);
      removeEventListener('scroll', onScroll);
      ls.set('ed:pos:' + id, String(Math.round(scrollY)));
    },
  };
}

function scrollToId(hid) {
  const el = document.getElementById(hid);
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function openToc(toc) {
  const { close } = openModal({
    title: 'Índice',
    body: `<nav class="reader-toc" style="max-height:none">${toc.map((t) => `<a href="#" data-id="${t.id}" class="l${Math.max(2, t.level)}">${esc(t.text)}</a>`).join('')}</nav>`,
    onOpen: (el, close) => el.addEventListener('click', (e) => {
      const a = e.target.closest('[data-id]');
      if (a) { e.preventDefault(); close(); setTimeout(() => scrollToId(a.dataset.id), 50); }
    }),
  });
  return close;
}

function openFontDialog(apply) {
  const render = (el) => {
    const s = db.getSettings();
    el.querySelector('#fs').textContent = s.readerSize + ' px';
    el.querySelectorAll('[data-ff]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.ff === s.readerFont));
    el.querySelectorAll('[data-lh]').forEach((b) => b.setAttribute('aria-pressed', +b.dataset.lh === s.readerLineHeight));
  };
  openModal({
    title: 'Texto',
    body: `<div class="stack">
      <div class="spread"><b>Tamanho</b><div class="btn-row"><button class="btn icon" data-size="-1" aria-label="Diminuir">A−</button><span id="fs" class="btn ghost" style="pointer-events:none"></span><button class="btn icon" data-size="1" aria-label="Aumentar">A+</button></div></div>
      <div class="spread"><b>Fonte</b><div class="seg"><button data-ff="serif" style="font-family:var(--font-serif)">Serifada</button><button data-ff="sans">Sem serifa</button></div></div>
      <div class="spread"><b>Espaçamento</b><div class="seg"><button data-lh="1.5">Compacto</button><button data-lh="1.7">Normal</button><button data-lh="1.95">Amplo</button></div></div>
    </div>`,
    onOpen: (el) => {
      render(el);
      el.addEventListener('click', (e) => {
        const s = db.getSettings();
        const sz = e.target.closest('[data-size]');
        if (sz) db.setSettings({ readerSize: Math.min(32, Math.max(14, s.readerSize + +sz.dataset.size)) });
        const ff = e.target.closest('[data-ff]');
        if (ff) db.setSettings({ readerFont: ff.dataset.ff });
        const lh = e.target.closest('[data-lh]');
        if (lh) db.setSettings({ readerLineHeight: +lh.dataset.lh });
        if (sz || ff || lh) { apply(); render(el); }
      });
    },
  });
}

function openNote(h, onSave) {
  openModal({
    title: 'Anotação',
    body: `${h.text ? `<blockquote class="small" style="margin:0 0 12px;border-left:4px solid var(--mark);padding-left:10px">${esc(h.text)}</blockquote>` : ''}
      <textarea class="input" id="note" rows="5" placeholder="Sua anotação…">${esc(h.note || '')}</textarea>`,
    actions: [{ label: 'Cancelar' }, { label: 'Salvar', cls: 'primary', onClick: (c, el) => onSave(el.querySelector('#note').value.trim()) }],
  });
}

function editHighlight(hid, repaint) {
  const h = db.get('highlights', hid);
  if (!h) return;
  openModal({
    title: 'Destaque',
    body: `<blockquote style="margin:0 0 12px;border-left:4px solid var(--mark);padding-left:10px">${esc(h.text)}</blockquote>
      <div class="field"><span>Cor</span><div class="btn-row">${COLORS.map(([c, v, n]) => `<button class="btn icon" data-c="${c}" aria-label="${n}" aria-pressed="${(h.color || '') === c}" style="background:${v};${(h.color || '') === c ? 'outline:3px solid var(--text)' : ''}"></button>`).join('')}</div></div>
      <label class="field"><span>Anotação</span><textarea class="input" id="note" rows="4">${esc(h.note || '')}</textarea></label>`,
    onOpen: (el) => el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-c]');
      if (b) { h.color = b.dataset.c; el.querySelectorAll('[data-c]').forEach((x) => (x.style.outline = x === b ? '3px solid var(--text)' : '')); }
    }),
    actions: [
      { label: `${icon('trash')} Remover`, cls: 'danger', left: true, onClick: async () => { await db.remove('highlights', hid); repaint(); } },
      { label: 'Cancelar' },
      { label: 'Salvar', cls: 'primary', onClick: async (c, el) => { h.note = el.querySelector('#note').value.trim(); await db.put('highlights', h); repaint(); } },
    ],
  });
}

function openNotesList(gid, repaint) {
  const list = db.where('highlights', (h) => h.guideId === gid).sort((a, b) => a.start - b.start);
  openModal({
    title: `Destaques e anotações (${list.length})`,
    body: list.length ? `<div class="note-list">${list.map((h) => `<div class="note" style="border-left-color:${COLORS.find((c) => c[0] === (h.color || ''))[1]}">
        <div>${esc(h.text)}</div>${h.note ? `<div class="small mt"><b>Nota:</b> ${esc(h.note)}</div>` : ''}
        <div class="btn-row mt"><button class="btn small" data-goto="${h.id}">Ir ao trecho</button></div></div>`).join('')}</div>`
      : '<p class="muted">Nenhum destaque ainda. Selecione um trecho com o dedo e toque numa cor.</p>',
    onOpen: (el, close) => el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-goto]');
      if (b) { close(); document.querySelector(`mark[data-hl="${b.dataset.goto}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
    }),
    actions: list.length ? [{ label: 'Copiar tudo', onClick: async () => {
      const txt = list.map((h) => `• ${h.text}${h.note ? `\n  Nota: ${h.note}` : ''}`).join('\n\n');
      try { await navigator.clipboard.writeText(txt); toast('Copiado'); } catch { toast('Não foi possível copiar'); }
      return false;
    } }, { label: 'Fechar', cls: 'primary' }] : [],
  });
}

function openMenu(g) {
  openModal({
    title: 'Opções do guia',
    body: `<ul class="list">
      <li><button class="row" data-edit>${icon('edit')}<span class="grow">Editar título, matéria e texto</span></button></li>
      <li><button class="row" data-dup>${icon('copy')}<span class="grow">Copiar Markdown</span></button></li>
      <li><button class="row" data-del style="color:var(--danger)">${icon('trash')}<span class="grow">Excluir guia</span></button></li>
    </ul>`,
    onOpen: (el, close) => el.addEventListener('click', async (e) => {
      if (e.target.closest('[data-edit]')) { close(); editGuide(g); }
      if (e.target.closest('[data-dup]')) { try { await navigator.clipboard.writeText(g.content); toast('Markdown copiado'); } catch { toast('Não foi possível copiar'); } }
      if (e.target.closest('[data-del]')) {
        close();
        const nc = db.where('cards', (c) => c.guideId === g.id).length;
        if (!(await confirmDialog(`Excluir o guia “${esc(g.title)}” e seus destaques?${nc ? ` Os ${nc} flashcard(s) gerados dele serão mantidos.` : ''}`, { ok: 'Excluir', danger: true }))) return;
        await db.removeMany('highlights', db.where('highlights', (h) => h.guideId === g.id).map((h) => h.id));
        await db.remove('guides', g.id);
        toast('Guia excluído');
        go('resumos');
      }
    }),
  });
}

function editGuide(g) {
  openModal({
    title: 'Editar guia',
    wide: true,
    body: `<form id="eg">
      <label class="field"><span>Título</span><input class="input" name="title" value="${esc(g.title)}"></label>
      <label class="field"><span>Matéria</span><select class="input" name="subjectId">${subjectOptions(g.subjectId)}</select></label>
      <label class="field"><span>Conteúdo (Markdown)</span><textarea class="input code" name="content" rows="16">${esc(g.content)}</textarea></label>
      <p class="small muted">Os destaques são reposicionados automaticamente se o trecho ainda existir.</p>
    </form>`,
    actions: [{ label: 'Cancelar' }, { label: 'Salvar', cls: 'primary', onClick: async (c, el) => {
      const d = formData(el.querySelector('#eg'));
      Object.assign(g, { title: d.title.trim() || g.title, subjectId: d.subjectId, content: d.content });
      await db.put('guides', g);
      toast('Guia salvo');
      go('guia/' + g.id, null, { replace: true });
    } }],
  });
}
