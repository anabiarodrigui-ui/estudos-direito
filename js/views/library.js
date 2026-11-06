/**
 * Biblioteca de resumos: guias por matéria, importação (colar ou arquivo .md),
 * busca em todo o conteúdo e status "novo / lido / estudar de novo".
 */
import * as db from '../core/db.js';
import { esc, openModal, formData, toast, pickFiles } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { subjects, subjectChips, subjectOptions, subjectName, subjectColor } from '../ui/common.js';
import { go } from '../app.js';
import { plainText } from '../core/markdown.js';
import { splitGuides, titleFromFilename } from '../core/importers.js';

export const STATUS = {
  novo: { label: 'Não lido', cls: '' },
  lido: { label: 'Já li', cls: 'ok' },
  revisar: { label: 'Estudar de novo', cls: 'warn' },
};

// cache do texto puro de cada guia para a busca
const textCache = new Map();
function guideText(g) {
  const key = g.id + ':' + g.updatedAt;
  if (!textCache.has(key)) textCache.set(key, plainText(g.content));
  return textCache.get(key);
}
const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

export function render(root, { params }) {
  const subj = params.s || '';
  const st = params.st || '';
  const q = params.q || '';
  const all = db.all('guides').sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.createdAt - b.createdAt);
  const list = all.filter((g) => (!subj || g.subjectId === subj) && (!st || (g.status || 'novo') === st));
  const setParams = (p) => go('resumos', Object.fromEntries(Object.entries({ s: subj, st, q, ...p }).filter(([, v]) => v)), { replace: true });

  root.innerHTML = `
    <div class="page-head"><h1>Resumos</h1>
      <div class="actions"><button class="btn primary" data-import>${icon('upload')} Importar guia</button></div></div>
    <label class="field"><span class="sr-only">Buscar</span>
      <input class="input" type="search" id="q" placeholder="Buscar em todos os guias…" value="${esc(q)}" enterkeyhint="search"></label>
    ${subjectChips(subj)}
    <div class="chips mt" role="group" aria-label="Filtrar por status">
      <button class="chip" data-st="" aria-pressed="${!st}">Todos</button>
      ${Object.entries(STATUS).map(([k, v]) => `<button class="chip" data-st="${k}" aria-pressed="${st === k}">${v.label}</button>`).join('')}
    </div>
    <div id="lib-body" class="mt"></div>
  `;
  const body = root.querySelector('#lib-body');

  const showList = () => {
    if (!all.length) {
      body.innerHTML = `<div class="card empty"><p>Nenhum guia ainda. Cole ou importe seus resumos em Markdown.</p>
        <button class="btn primary" data-import>${icon('upload')} Importar primeiro guia</button></div>`;
      return;
    }
    if (!list.length) { body.innerHTML = `<div class="card empty">Nenhum guia com esse filtro.</div>`; return; }
    const groups = subjects().map((s) => [s, list.filter((g) => g.subjectId === s.id)]).filter(([, gs]) => gs.length);
    const orphan = list.filter((g) => !db.get('subjects', g.subjectId));
    if (orphan.length) groups.push([{ id: '', name: 'Sem matéria', color: 'var(--muted)' }, orphan]);
    body.innerHTML = groups.map(([s, gs]) => {
      const read = gs.filter((g) => g.status === 'lido').length;
      return `<div class="section"><h2><span class="dot" style="background:${s.color}"></span> ${esc(s.name)}</h2><span class="small muted">${read}/${gs.length} lidos</span></div>
      <div class="card"><ul class="list">${gs.map((g) => guideRow(g)).join('')}</ul></div>`;
    }).join('');
  };

  const showSearch = (term) => {
    const t = norm(term.trim());
    if (t.length < 2) return showList();
    const results = [];
    for (const g of list) {
      const text = guideText(g);
      const hay = norm(text);
      let i = hay.indexOf(t), n = 0;
      const snippets = [];
      while (i !== -1) { n++; if (snippets.length < 3) snippets.push(i); i = hay.indexOf(t, i + t.length); }
      if (n) results.push({ g, n, snippets: snippets.map((p) => snippet(text, p, t.length)) });
    }
    body.innerHTML = results.length ? `<p class="small muted">${results.reduce((a, r) => a + r.n, 0)} ocorrência(s) em ${results.length} guia(s)</p>
      <div class="card search-results"><ul class="list">${results.map((r) => `<li><button class="row" data-open="${r.g.id}" data-q="${esc(term.trim())}">
        <span class="dot" style="background:${subjectColor(r.g.subjectId)}"></span>
        <span class="grow"><span class="title">${esc(r.g.title)}</span> <span class="badge">${r.n}</span>
        ${r.snippets.map((s) => `<div class="small muted">${s}</div>`).join('')}</span></button></li>`).join('')}</ul></div>`
      : `<div class="card empty">Nada encontrado para “${esc(term)}”.</div>`;
  };

  q ? showSearch(q) : showList();

  let tmr;
  root.querySelector('#q').addEventListener('input', (e) => {
    clearTimeout(tmr);
    tmr = setTimeout(() => {
      const v = e.target.value;
      history.replaceState(null, '', '#/resumos?' + new URLSearchParams(Object.fromEntries(Object.entries({ s: subj, st, q: v }).filter(([, x]) => x))));
      showSearch(v);
    }, 200);
  });

  root.addEventListener('click', (e) => {
    const t = e.target;
    if (t.closest('[data-import]')) return openImportDialog(subj);
    const s = t.closest('[data-subject]');
    if (s) return setParams({ s: s.dataset.subject });
    const stb = t.closest('[data-st]');
    if (stb) return setParams({ st: stb.dataset.st });
    const o = t.closest('[data-open]');
    if (o) return go('guia/' + o.dataset.open, o.dataset.q ? { q: o.dataset.q } : null);
  });
}

function guideRow(g) {
  const s = STATUS[g.status || 'novo'];
  const words = (g.content.match(/\S+/g) || []).length;
  const hl = db.where('highlights', (h) => h.guideId === g.id).length;
  return `<li><button class="row guide-row" data-open="${g.id}">
    ${icon('book')}
    <span class="grow"><span class="title">${esc(g.title)}</span><br>
      <span class="small muted">${Math.max(1, Math.round(words / 200))} min de leitura${hl ? ` · ${hl} destaque(s)` : ''}</span></span>
    <span class="badge st ${s.cls}">${s.label}</span></button></li>`;
}

function snippet(text, pos, len) {
  const a = Math.max(0, pos - 60), b = Math.min(text.length, pos + len + 80);
  return (a > 0 ? '…' : '') + esc(text.slice(a, pos)) + '<mark>' + esc(text.slice(pos, pos + len)) + '</mark>' + esc(text.slice(pos + len, b)) + (b < text.length ? '…' : '');
}

/** Diálogo de importação: colar Markdown ou escolher arquivos .md. */
export function openImportDialog(subjectId = '') {
  let files = [];
  openModal({
    title: 'Importar guia de estudo',
    wide: true,
    body: `<form id="imp">
      <label class="field"><span>Matéria</span><select class="input" name="subjectId">${subjectOptions(subjectId)}</select></label>
      <div class="btn-row field"><button type="button" class="btn" data-pick>${icon('upload')} Escolher arquivo(s) .md</button><span class="small muted" id="files"></span></div>
      <label class="field"><span>…ou cole o Markdown aqui</span>
        <textarea class="input code" name="md" rows="12" placeholder="# Título do guia&#10;&#10;## Seção&#10;Texto com **termos em negrito**, listas, tabelas e > citações."></textarea></label>
      <label class="field"><span>Título <span class="muted">(opcional — usa o primeiro título do texto)</span></span><input class="input" name="title"></label>
      <label class="check"><input type="checkbox" name="split"> Separar em vários guias/capítulos a cada título de nível 1 (# …)</label>
      <label class="check"><input type="checkbox" name="gen" checked> Gerar flashcards automaticamente (você revisa antes de salvar)</label>
    </form>`,
    onOpen: (el) => {
      el.querySelector('[data-pick]').onclick = async () => {
        files = await pickFiles('.md,.markdown,.txt,text/markdown,text/plain', true);
        el.querySelector('#files').textContent = files.map((f) => f.name).join(', ');
      };
    },
    actions: [
      { label: 'Cancelar' },
      { label: 'Importar', cls: 'primary', onClick: async (close, el) => {
        const d = formData(el.querySelector('#imp'));
        const sources = [...files.map((f) => ({ text: f.text, name: titleFromFilename(f.name) }))];
        if (d.md.trim()) sources.push({ text: d.md, name: d.title.trim() });
        if (!sources.length) { toast('Cole o texto ou escolha um arquivo'); return false; }
        const created = await importGuides(sources, d.subjectId, { split: d.split, title: d.title.trim() });
        toast(`${created.length} guia(s) importado(s)`);
        if (d.gen && created.length) {
          const m = await import('./flashcards.js');
          m.openGenerateDialog(created);
        } else if (created.length === 1) go('guia/' + created[0].id);
      } },
    ],
  });
}

/** Cria os guias no banco. sources = [{text, name}] */
export async function importGuides(sources, subjectId, { split = false, title = '' } = {}) {
  const existing = db.where('guides', (g) => g.subjectId === subjectId).length;
  const out = [];
  for (const src of sources) {
    const parts = split ? splitGuides(src.text, src.name || 'Guia') : [{ title: '', content: src.text.trim() }];
    for (const p of parts) {
      const t = (!split && title) || p.title || src.name || splitGuides(p.content)[0]?.title || 'Guia sem título';
      out.push({ subjectId, title: t, content: p.content, status: 'novo', order: existing + out.length });
    }
  }
  await db.putMany('guides', out);
  return out;
}

export { subjectName };
