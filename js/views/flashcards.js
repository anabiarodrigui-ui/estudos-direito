/**
 * Flashcards: estatísticas, filtros, lista, criação/edição manual, importação
 * e geração a partir dos guias (local ou com IA), sempre com revisão antes de salvar.
 */
import * as db from '../core/db.js';
import { esc, openModal, formData, toast, confirmDialog, pickFiles } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { subjects, subjectChips, subjectOptions, subjectName, subjectColor, activeDates } from '../ui/common.js';
import { go } from '../app.js';
import { todayISO, fmtBR, diffDays } from '../core/dates.js';
import { newSrs, isNew, isDue, cardStats, streak, buildQueue } from '../core/srs.js';
import { generateCards } from '../core/cardgen.js';
import { parseFlashcards } from '../core/importers.js';
import { generateCardsWithAI } from '../core/ai.js';

const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/** Aplica os filtros da URL (s = matéria, g = guia, t = texto/tag). */
export function filterCards(cards, { s = '', g = '', t = '' } = {}) {
  const term = norm(t);
  return cards.filter((c) => (!s || c.subjectId === s) && (!g || c.guideId === g) &&
    (!term || norm(c.front + ' ' + c.back + ' ' + (c.topic || '') + ' ' + (c.tags || []).join(' ')).includes(term)));
}

export function newSeenToday(today) {
  return db.where('reviews', (r) => r.date === today && r.wasNew && !r.quick).length;
}

export function render(root, { params }) {
  const today = todayISO();
  const { s = '', g = '', t = '' } = params;
  const all = db.all('cards');
  const list = filterCards(all, params).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  const reviews = db.all('reviews').filter((r) => !s || r.subjectId === s);
  const st = cardStats(list, reviews, today);
  const settings = db.getSettings();
  const queue = buildQueue(list, today, { newLimit: settings.newCardsPerDay, newSeenToday: newSeenToday(today) });
  const guides = db.all('guides').filter((x) => !s || x.subjectId === s);
  const setParams = (p) => go('cartoes', Object.fromEntries(Object.entries({ s, g, t, ...p }).filter(([, v]) => v)), { replace: true });
  const q = new URLSearchParams(Object.fromEntries(Object.entries({ s, g, t }).filter(([, v]) => v))).toString();

  root.innerHTML = `
    <div class="page-head"><h1>Flashcards</h1>
      <div class="actions">
        <button class="btn" data-gen>${icon('wand')} Gerar de um guia</button>
        <button class="btn" data-import>${icon('upload')} Importar</button>
      </div></div>
    <div class="stat-row">
      <div class="stat"><div class="v">${st.pendentes}</div><div class="l">pendentes hoje</div></div>
      <div class="stat"><div class="v">${st.novos}</div><div class="l">cartões novos</div></div>
      <div class="stat"><div class="v">${st.acerto == null ? '—' : st.acerto + '%'}</div><div class="l">taxa de acerto (30 dias)</div></div>
      <div class="stat"><div class="v">${streak(activeDates(), today)}</div><div class="l">dias seguidos estudando</div></div>
    </div>
    <div class="btn-row mt">
      <a class="btn primary" href="#/estudar${q ? '?' + q : ''}" ${queue.length ? '' : 'aria-disabled="true"'}>${icon('play')} Estudar agora (${queue.length})</a>
      <a class="btn" href="#/estudar?${new URLSearchParams({ ...Object.fromEntries(Object.entries({ s, g, t }).filter(([, v]) => v)), mode: 'rapida' })}">${icon('bolt')} Revisão rápida</a>
      <button class="btn" data-new>${icon('plus')} Novo cartão</button>
    </div>
    <p class="small muted">Revisão rápida: passa por todos os cartões do filtro (os mais difíceis primeiro), sem alterar o agendamento — ideal na véspera da prova.</p>

    <div class="mt">${subjectChips(s)}</div>
    <div class="field-row mt">
      <label class="field mb0"><span class="sr-only">Guia</span><select class="input" id="fg">
        <option value="">Todos os guias</option>
        ${guides.map((x) => `<option value="${x.id}" ${x.id === g ? 'selected' : ''}>${esc(x.title)}</option>`).join('')}
      </select></label>
      <label class="field mb0"><span class="sr-only">Buscar</span><input class="input" type="search" id="ft" placeholder="Buscar por texto, tópico ou tag…" value="${esc(t)}"></label>
    </div>

    <div class="section"><h2>${list.length} cartão(ões)</h2></div>
    ${list.length ? `<div class="card"><ul class="list">${list.slice(0, 300).map((c) => cardRow(c, today)).join('')}</ul>
      ${list.length > 300 ? `<p class="small muted">Mostrando 300 de ${list.length}. Use os filtros.</p>` : ''}</div>`
      : `<div class="card empty">${all.length ? 'Nenhum cartão com esses filtros.' : 'Nenhum flashcard ainda. Gere a partir de um guia, importe ou crie manualmente.'}</div>`}
  `;

  root.querySelector('#fg').addEventListener('change', (e) => setParams({ g: e.target.value }));
  let tm;
  root.querySelector('#ft').addEventListener('input', (e) => { clearTimeout(tm); tm = setTimeout(() => setParams({ t: e.target.value }), 400); });
  root.addEventListener('click', (e) => {
    const x = e.target;
    const sb = x.closest('[data-subject]');
    if (sb) return setParams({ s: sb.dataset.subject, g: '' });
    if (x.closest('[data-new]')) return openCardForm(null, { subjectId: s, guideId: g });
    if (x.closest('[data-import]')) return openImportCards(s);
    if (x.closest('[data-gen]')) return pickGuideToGenerate(s);
    const ed = x.closest('[data-card]');
    if (ed) return openCardForm(db.get('cards', ed.dataset.card));
    if (x.closest('[aria-disabled="true"]')) { e.preventDefault(); toast('Nenhum cartão para estudar agora 🎉'); }
  });
}

function cardRow(c, today) {
  let info;
  if (isNew(c)) info = '<span class="badge accent">novo</span>';
  else if (isDue(c, today)) info = '<span class="badge warn">para hoje</span>';
  else info = `<span class="badge">em ${diffDays(today, c.srs.due)}d</span>`;
  return `<li><button class="row" data-card="${c.id}">
    <span class="dot" style="background:${subjectColor(c.subjectId)}"></span>
    <span class="grow"><span class="title" style="display:block">${esc(c.front)}</span>
      <span class="small muted" style="display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(c.back)}</span>
      ${c.topic ? `<span class="small muted">${esc(c.topic)}</span>` : ''}</span>
    ${info}</button></li>`;
}

// ---------------------------------------------------------------------------

/** Criar/editar um cartão. */
export function openCardForm(card = null, preset = {}, onSaved = null) {
  const c = card || { front: '', back: '', subjectId: preset.subjectId || '', guideId: preset.guideId || '', topic: '', tags: [] };
  const guideOpts = (sid) => `<option value="">— Nenhum guia —</option>` + db.where('guides', (x) => !sid || x.subjectId === sid)
    .map((x) => `<option value="${x.id}" ${x.id === c.guideId ? 'selected' : ''}>${esc(x.title)}</option>`).join('');
  openModal({
    title: card ? 'Editar flashcard' : 'Novo flashcard',
    body: `<form id="cf">
      <label class="field"><span>Pergunta (frente)</span><textarea class="input" name="front" rows="3" required>${esc(c.front)}</textarea></label>
      <label class="field"><span>Resposta (verso)</span><textarea class="input" name="back" rows="4" required>${esc(c.back)}</textarea></label>
      <div class="field-row">
        <label class="field"><span>Matéria</span><select class="input" name="subjectId">${subjectOptions(c.subjectId)}</select></label>
        <label class="field"><span>Guia</span><select class="input" name="guideId">${guideOpts(c.subjectId)}</select></label>
      </div>
      <div class="field-row">
        <label class="field"><span>Tópico</span><input class="input" name="topic" value="${esc(c.topic || '')}" placeholder="Ex.: Boa-fé objetiva"></label>
        <label class="field"><span>Tags <span class="muted">(separadas por vírgula)</span></span><input class="input" name="tags" value="${esc((c.tags || []).join(', '))}"></label>
      </div>
      ${card && !isNew(card) ? `<p class="small muted">Próxima revisão: ${fmtBR(card.srs.due)} · intervalo ${card.srs.interval}d · facilidade ${card.srs.ef.toFixed(2).replace('.', ',')} · erros ${card.srs.lapses}</p>
        <label class="check"><input type="checkbox" name="reset"> Reiniciar progresso (voltar a ser cartão novo)</label>` : ''}
    </form>`,
    onOpen: (el) => {
      const f = el.querySelector('#cf');
      f.subjectId.addEventListener('change', () => { f.guideId.innerHTML = guideOpts(f.subjectId.value); });
    },
    actions: [
      ...(card ? [{ label: `${icon('trash')} Excluir`, cls: 'danger', left: true, onClick: async () => {
        if (!(await confirmDialog('Excluir este flashcard?', { ok: 'Excluir', danger: true }))) return false;
        await db.remove('cards', card.id); toast('Cartão excluído');
      } }] : []),
      { label: 'Cancelar' },
      { label: 'Salvar', cls: 'primary', onClick: async (close, el) => {
        const d = formData(el.querySelector('#cf'));
        if (!d.front.trim() || !d.back.trim()) { toast('Preencha pergunta e resposta'); return false; }
        await db.put('cards', {
          ...c, front: d.front.trim(), back: d.back.trim(), subjectId: d.subjectId, guideId: d.guideId, topic: d.topic.trim(),
          tags: d.tags.split(',').map((x) => x.trim()).filter(Boolean), srs: d.reset || !c.srs ? newSrs() : c.srs,
        });
        toast(card ? 'Cartão atualizado' : 'Cartão criado');
        onSaved?.();
      } },
    ],
  });
}

// ---------------------------------------------------------------------------
// Importar cartões prontos

export const IMPORT_EXAMPLE = `# Matéria: Direito Civil III
# Tópico: Boa-fé objetiva

P: Qual artigo do CC trata da boa-fé objetiva nos contratos?
R: Art. 422 do Código Civil.
Tags: boa-fé, CC

P: O que é a supressio?
R: Perda de um direito pelo não exercício prolongado,
gerando legítima expectativa na outra parte.`;

function openImportCards(defaultSubject = '') {
  openModal({
    title: 'Importar flashcards',
    wide: true,
    body: `<form id="ic">
      <div class="btn-row field"><button type="button" class="btn" data-pick>${icon('upload')} Escolher arquivo (.txt, .md, .json, .tsv)</button><span class="small muted" id="fn"></span></div>
      <label class="field"><span>…ou cole aqui</span><textarea class="input code" name="text" rows="10" placeholder="${esc(IMPORT_EXAMPLE)}"></textarea></label>
      <label class="field"><span>Matéria padrão <span class="muted">(para cartões sem “# Matéria:”)</span></span><select class="input" name="subjectId">${subjectOptions(defaultSubject)}</select></label>
      <p class="small muted" id="preview"></p>
      <details><summary class="small"><b>Formatos aceitos</b></summary>
        <p class="small">1) Texto com <span class="kbd">P:</span> e <span class="kbd">R:</span> (resposta pode ter várias linhas; linhas opcionais <span class="kbd"># Matéria:</span>, <span class="kbd"># Tópico:</span>, <span class="kbd">Tags:</span>):</p>
        <pre class="sample">${esc(IMPORT_EXAMPLE)}</pre>
        <p class="small">2) Uma linha por cartão: <span class="kbd">pergunta⇥resposta</span> (TAB, exportação do Anki) ou <span class="kbd">pergunta :: resposta</span>.</p>
        <p class="small">3) JSON: <span class="kbd">[{"pergunta": "...", "resposta": "...", "materia": "...", "topico": "...", "tags": ["..."]}]</span></p>
      </details>
    </form>`,
    onOpen: (el) => {
      const f = el.querySelector('#ic');
      const upd = () => {
        const n = parseFlashcards(f.text.value).length;
        el.querySelector('#preview').textContent = f.text.value.trim() ? `${n} cartão(ões) reconhecido(s).` : '';
      };
      f.text.addEventListener('input', upd);
      el.querySelector('[data-pick]').onclick = async () => {
        const [file] = await pickFiles('.txt,.md,.json,.tsv,.csv,text/plain,application/json', false);
        if (!file) return;
        f.text.value = file.text; el.querySelector('#fn').textContent = file.name; upd();
      };
    },
    actions: [{ label: 'Cancelar' }, { label: 'Importar', cls: 'primary', onClick: async (c, el) => {
      const d = formData(el.querySelector('#ic'));
      const parsed = parseFlashcards(d.text);
      if (!parsed.length) { toast('Nenhum cartão reconhecido. Veja os formatos aceitos.'); return false; }
      const n = await saveCards(parsed.map((p) => ({ ...p, subjectId: matchSubject(p.subject) || d.subjectId })));
      toast(`${n} cartão(ões) importado(s)`);
    } }],
  });
}

/** Encontra a matéria pelo nome (sem diferenciar acentos/maiúsculas, aceita nome parcial). */
function matchSubject(name) {
  if (!name) return '';
  const n = norm(name);
  const subs = subjects();
  return (subs.find((s) => norm(s.name) === n) || subs.find((s) => norm(s.name).includes(n) || n.includes(norm(s.name))))?.id || '';
}

async function saveCards(list) {
  const existing = new Set(db.all('cards').map((c) => norm(c.front)));
  const toSave = list.filter((c) => !existing.has(norm(c.front))).map((c) => ({
    front: c.front, back: c.back, subjectId: c.subjectId || '', guideId: c.guideId || '', topic: c.topic || '',
    tags: c.tags?.length ? c.tags : c.topic ? [c.topic] : [], srs: newSrs(),
  }));
  if (toSave.length) await db.putMany('cards', toSave);
  return toSave.length;
}

// ---------------------------------------------------------------------------
// Gerar cartões a partir de guias (local ou IA) com revisão antes de salvar

function pickGuideToGenerate(subjectId) {
  const guides = db.all('guides').filter((g) => !subjectId || g.subjectId === subjectId);
  if (!guides.length) return toast('Importe um guia em Resumos primeiro');
  openModal({
    title: 'Gerar flashcards de qual guia?',
    body: `<ul class="list">${guides.map((g) => `<li><button class="row" data-g="${g.id}"><span class="dot" style="background:${subjectColor(g.subjectId)}"></span>
      <span class="grow"><span class="title">${esc(g.title)}</span><br><span class="small muted">${esc(subjectName(g.subjectId))} · ${db.where('cards', (c) => c.guideId === g.id).length} cartões já criados</span></span>${icon('right')}</button></li>`).join('')}</ul>`,
    onOpen: (el, close) => el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-g]');
      if (b) { close(); openGenerateDialog([db.get('guides', b.dataset.g)]); }
    }),
  });
}

/** Mostra os cartões sugeridos para revisão/edição antes de salvar. */
export function openGenerateDialog(guides) {
  guides = guides.filter(Boolean);
  if (!guides.length) return;
  const hasKey = !!localStorage.getItem('ed:apiKey');
  const existing = new Set(db.all('cards').map((c) => norm(c.front)));
  let cands = [];
  let aborter = null;

  const localCands = () => guides.flatMap((g) => generateCards(g.content).map((c) => ({ ...c, guideId: g.id, subjectId: g.subjectId, on: !existing.has(norm(c.front)) })));

  const renderList = (el) => {
    const box = el.querySelector('#cands');
    const on = cands.filter((c) => c.on).length;
    el.querySelector('#count').textContent = `${on} de ${cands.length} selecionado(s)`;
    el.querySelector('#save').textContent = `Salvar ${on} cartão(ões)`;
    box.innerHTML = cands.length ? cands.map((c, i) => `<div class="cand ${c.on ? '' : 'off'}" data-i="${i}">
      <input type="checkbox" style="width:28px;height:28px;margin-top:6px;accent-color:var(--accent)" data-on ${c.on ? 'checked' : ''} aria-label="Incluir cartão">
      <div class="stack" style="--gap:6px">
        <div class="small muted">${esc(c.source || 'IA')} · ${esc(c.topic || '')}${existing.has(norm(c.front)) ? ' · <b>já existe</b>' : ''}</div>
        <textarea class="input" data-f="front" rows="2" aria-label="Pergunta">${esc(c.front)}</textarea>
        <textarea class="input" data-f="back" rows="3" aria-label="Resposta">${esc(c.back)}</textarea>
      </div></div>`).join('') : '<p class="muted">Nenhum cartão sugerido. Dica: termos em <b>negrito</b>, definições (“X é…”) e títulos com texto logo abaixo geram cartões.</p>';
  };

  openModal({
    title: guides.length === 1 ? `Flashcards: ${guides[0].title}` : `Flashcards de ${guides.length} guias`,
    wide: true,
    body: `
      <div class="seg" role="group" aria-label="Método">
        <button data-mode="local" aria-pressed="true">${icon('wand')} Automático (offline)</button>
        <button data-mode="ai" aria-pressed="false">✨ Com IA (Claude)</button>
      </div>
      <div id="aibox" class="mt" hidden>
        ${hasKey ? `<div class="btn-row"><label class="field mb0" style="flex:1;min-width:180px"><span>Quantidade máx.</span><input class="input" type="number" id="maxc" value="30" min="5" max="80"></label>
          <button class="btn primary" data-run-ai style="align-self:flex-end">Gerar com IA</button></div>
          <p class="small muted">Envia o texto do guia para a API da Anthropic usando sua chave. Pode levar até um minuto.</p>`
        : `<p>Para usar a IA, cadastre sua chave da API da Anthropic em <a href="#/config">Configurações</a>.</p>`}
        <p class="small" id="aistatus"></p>
      </div>
      <div class="spread mt"><b id="count"></b><div class="btn-row"><button class="btn small" data-all>Marcar todos</button><button class="btn small" data-none>Desmarcar todos</button></div></div>
      <div id="cands" class="mt"></div>`,
    onOpen: (el) => {
      cands = localCands();
      renderList(el);
      el.addEventListener('click', async (e) => {
        const m = e.target.closest('[data-mode]');
        if (m) {
          el.querySelectorAll('[data-mode]').forEach((b) => b.setAttribute('aria-pressed', b === m));
          el.querySelector('#aibox').hidden = m.dataset.mode !== 'ai';
          if (m.dataset.mode === 'local') { cands = localCands(); renderList(el); }
        }
        if (e.target.closest('[data-all]')) { cands.forEach((c) => (c.on = true)); renderList(el); }
        if (e.target.closest('[data-none]')) { cands.forEach((c) => (c.on = false)); renderList(el); }
        if (e.target.closest('[data-run-ai]')) {
          const status = el.querySelector('#aistatus');
          const btn = e.target.closest('[data-run-ai]');
          btn.disabled = true;
          status.textContent = 'Gerando com IA… aguarde.';
          aborter = new AbortController();
          try {
            const max = Math.min(80, Math.max(5, +el.querySelector('#maxc').value || 30));
            const results = [];
            for (const g of guides) {
              const r = await generateCardsWithAI({ guideTitle: g.title, markdown: g.content, subjectName: subjectName(g.subjectId), maxCards: max, model: db.getSettings().apiModel, signal: aborter.signal });
              results.push(...r.map((c) => ({ ...c, source: 'IA', guideId: g.id, subjectId: g.subjectId, on: !existing.has(norm(c.front)) })));
            }
            cands = results;
            status.textContent = `${results.length} cartões gerados pela IA. Revise abaixo.`;
            renderList(el);
          } catch (err) {
            status.textContent = '⚠️ ' + err.message;
          } finally { btn.disabled = false; aborter = null; }
        }
      });
      el.addEventListener('change', (e) => {
        const box = e.target.closest('[data-i]');
        if (!box) return;
        const c = cands[+box.dataset.i];
        if (e.target.matches('[data-on]')) { c.on = e.target.checked; box.classList.toggle('off', !c.on); renderCount(el); }
      });
      el.addEventListener('input', (e) => {
        const box = e.target.closest('[data-i]');
        if (box && e.target.dataset.f) cands[+box.dataset.i][e.target.dataset.f] = e.target.value;
      });
      const renderCount = () => {
        const on = cands.filter((c) => c.on).length;
        el.querySelector('#count').textContent = `${on} de ${cands.length} selecionado(s)`;
        el.querySelector('#save').textContent = `Salvar ${on} cartão(ões)`;
      };
    },
    onClose: () => aborter?.abort(),
    actions: [
      { label: 'Cancelar' },
      { label: 'Salvar', cls: 'primary', id: 'save', onClick: async () => {
        const chosen = cands.filter((c) => c.on && c.front.trim() && c.back.trim());
        if (!chosen.length) { toast('Nenhum cartão selecionado'); return false; }
        const n = await saveCards(chosen.map((c) => ({ ...c, front: c.front.trim(), back: c.back.trim() })));
        toast(`${n} flashcard(s) salvos`);
      } },
    ],
  });
}
