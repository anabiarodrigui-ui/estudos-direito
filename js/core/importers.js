/**
 * Importação de guias e de flashcards (funções puras, testáveis no Node).
 *
 * FORMATO DE FLASHCARDS (texto) — veja também o README:
 *
 *   # Matéria: Direito Civil III        (opcional; vale para os cartões seguintes)
 *   # Tópico: Contratos                 (opcional; vale para os cartões seguintes)
 *
 *   P: Qual é a pergunta?
 *   R: Esta é a resposta.
 *      A resposta pode continuar em várias linhas.
 *   Tags: boa-fé, art. 422             (opcional)
 *
 *   P: Próxima pergunta...
 *   R: ...
 *
 * Também aceitos:
 *   - "Pergunta:" / "Resposta:" ou "Q:" / "A:" no lugar de P:/R:
 *   - Uma linha por cartão separada por TAB (pergunta<TAB>resposta[<TAB>tags]) — formato de exportação do Anki
 *   - Uma linha por cartão no formato "pergunta :: resposta"
 *   - JSON: [{ "pergunta": "...", "resposta": "...", "materia": "...", "topico": "...", "tags": ["..."] }]
 *     (também aceita as chaves front/back/subject/topic, ou um objeto { "cards": [...] })
 */

/** Detecta o formato e devolve [{front, back, subject, topic, tags}]. */
export function parseFlashcards(text) {
  const src = String(text || '').replace(/^\uFEFF/, '').trim();
  if (!src) return [];
  if (src.startsWith('[') || src.startsWith('{')) {
    try { return parseJsonCards(JSON.parse(src)); } catch { /* não é JSON válido: tenta texto */ }
  }
  if (/^\s*(P|Q|Pergunta|Frente)\s*:/im.test(src)) return parsePR(src);
  return parseLines(src);
}

function parseJsonCards(data) {
  const list = Array.isArray(data) ? data : Array.isArray(data.cards) ? data.cards : Array.isArray(data.flashcards) ? data.flashcards : [];
  return list.map((c) => ({
    front: String(c.pergunta ?? c.front ?? c.question ?? c.frente ?? '').trim(),
    back: String(c.resposta ?? c.back ?? c.answer ?? c.verso ?? '').trim(),
    subject: String(c.materia ?? c.matéria ?? c.subject ?? '').trim(),
    topic: String(c.topico ?? c.tópico ?? c.topic ?? '').trim(),
    tags: normTags(c.tags),
  })).filter((c) => c.front && c.back);
}

const Q_RE = /^\s*(?:P|Q|Pergunta|Frente)\s*:\s?(.*)$/i;
const A_RE = /^\s*(?:R|A|Resposta|Verso)\s*:\s?(.*)$/i;
const TAG_RE = /^\s*Tags?\s*:\s*(.*)$/i;
const SUBJ_RE = /^\s*#+\s*Mat[ée]ria\s*:\s*(.+)$/i;
const TOPIC_RE = /^\s*#+\s*T[óo]pico\s*:\s*(.+)$/i;

function parsePR(src) {
  const out = [];
  let subject = '', topic = '', cur = null, field = null;
  const flush = () => {
    if (cur && cur.front.trim() && cur.back.trim()) out.push({ ...cur, front: cur.front.trim(), back: cur.back.trim() });
    cur = null; field = null;
  };
  for (const line of src.split(/\r?\n/)) {
    let m;
    if ((m = line.match(SUBJ_RE))) { flush(); subject = m[1].trim(); continue; }
    if ((m = line.match(TOPIC_RE))) { flush(); topic = m[1].trim(); continue; }
    if ((m = line.match(Q_RE))) { flush(); cur = { front: m[1], back: '', subject, topic, tags: [] }; field = 'front'; continue; }
    if (!cur) continue;
    if ((m = line.match(A_RE)) && field === 'front') { cur.back = m[1]; field = 'back'; continue; }
    if ((m = line.match(TAG_RE))) { cur.tags = normTags(m[1]); field = 'tags'; continue; }
    if (!line.trim()) { if (field === 'back') field = 'gap'; continue; }
    if (field === 'front') cur.front += '\n' + line.trim();
    else if (field === 'back' || field === 'gap') { cur.back += '\n' + line.trim(); field = 'back'; }
  }
  flush();
  return out;
}

function parseLines(src) {
  const out = [];
  for (const line of src.split(/\r?\n/)) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    let parts = null;
    if (line.includes('\t')) parts = line.split('\t');
    else if (line.includes('::')) parts = line.split('::');
    else if (line.includes(';')) parts = line.split(';');
    if (!parts || parts.length < 2) continue;
    const [front, back, tags] = parts.map((p) => p.trim());
    if (front && back) out.push({ front, back, subject: '', topic: '', tags: normTags(tags) });
  }
  return out;
}

function normTags(t) {
  if (!t) return [];
  const arr = Array.isArray(t) ? t : String(t).split(/[,;]|\s{2,}/);
  return [...new Set(arr.map((x) => String(x).trim()).filter(Boolean))];
}

/**
 * Divide um arquivo Markdown grande em vários guias, um por título de nível 1 ("# ...").
 * Se houver um único "#", ou nenhum, devolve um guia só.
 */
export function splitGuides(markdown, fallbackTitle = 'Guia sem título') {
  const src = String(markdown || '').replace(/\r\n?/g, '\n');
  const parts = [];
  let cur = null;
  let inFence = false;
  for (const line of src.split('\n')) {
    if (/^\s*(```|~~~)/.test(line)) inFence = !inFence;
    const m = !inFence && line.match(/^#\s+(.+?)\s*#*\s*$/);
    if (m) { cur = { title: m[1].replace(/[*_`]/g, '').trim(), lines: [line] }; parts.push(cur); continue; }
    if (!cur) { cur = { title: '', lines: [] }; parts.push(cur); }
    cur.lines.push(line);
  }
  const guides = parts.map((p) => ({ title: p.title, content: p.lines.join('\n').trim() })).filter((p) => p.content);
  // texto antes do primeiro "#" se junta ao primeiro guia com título
  if (guides.length > 1 && !guides[0].title) { guides[1].content = guides[0].content + '\n\n' + guides[1].content; guides.shift(); }
  if (!guides.length) return [];
  if (guides.length === 1 && !guides[0].title) guides[0].title = firstHeading(src) || fallbackTitle;
  return guides;
}

function firstHeading(src) {
  const m = src.match(/^#{1,6}\s+(.+)$/m);
  return m ? m[1].replace(/[*_`#]/g, '').trim() : '';
}

/** Título a partir do nome do arquivo ("02-contratos_em_especie.md" -> "02 contratos em especie"). */
export function titleFromFilename(name) {
  return String(name).replace(/\.(md|markdown|txt)$/i, '').replace(/[-_]+/g, ' ').trim();
}
