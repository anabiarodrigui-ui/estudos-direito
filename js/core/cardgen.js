/**
 * Geração LOCAL (sem internet) de flashcards a partir de um guia em Markdown.
 * Heurísticas:
 *  1. Títulos (##, ###…)  → "Explique: <título>"  /  resposta = primeiro parágrafo ou lista da seção
 *  2. Definições           → frases do tipo "X é…", "X consiste em…", "X significa…", "X: descrição"
 *  3. Termos em negrito    → lacuna: a frase com o termo trocado por "_____"
 *  4. Tabelas              → "Critério: linha — coluna?" / resposta = célula
 * Os cartões sugeridos são revisados e editados pela usuária antes de salvar.
 */
import { parseMarkdown, stripInline } from './markdown.js';

// [padrão do verbo (regex), início da pergunta]
const VERBS = [
  ['consistem (?:em|no|na|nos|nas)', 'Em que consistem'], ['consiste (?:em|no|na|nos|nas)', 'Em que consiste'],
  ['define-se como', 'Como se define'], ['caracteriza-se (?:por|pela|pelo)', 'O que caracteriza'],
  ['corresponde (?:a|ao|à)', 'O que é'], ['refere-se (?:a|ao|à)', 'O que é'], ['significa', 'O que significa'],
  ['são', 'O que são'], ['é', 'O que é'],
];
const VERB_RE = new RegExp(`^(.{2,90}?)\\s+(${VERBS.map((v) => v[0]).join('|')})\\s+(.{8,})$`, 'i');
const ARTICLE_RE = /^(o|a|os|as|um|uma)\s+/i;
const STOP_START = /^(isso|isto|ele|ela|eles|elas|que|se|não|também|assim|esse|essa|este|esta|aqui|nele|nela|todo|toda|o qual|a qual|cuja|cujo)\b/i;

// rótulos que não são conceitos ("Atenção: ...", "Exemplo: ...")
const NOT_LABEL = /^(aten[çc][ãa]o|obs|observa[çc][ãa]o|dica|nota|exemplo|ex|importante|cuidado|lembre-se|resumo|fonte|base legal)$/i;
// "X é composto por…", "X é previsto em…" não são definições
const NOT_DEF = /^(compost|formad|dividid|previst|regulad|aplicad|considerad|chamad|utilizad|exigid|adotad|feit|dad|tratad|disciplinad|cabível|possível|necessári|importante|fundamental|essencial)/i;

const clean = (s) => s.replace(/\s+/g, ' ').trim();
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const trunc = (s, n = 500) => (s.length > n ? s.slice(0, n).replace(/\s+\S*$/, '') + '…' : s);
const stripNumbering = (s) => s.replace(/^(\d+(\.\d+)*[.)]?|[IVXLC]+[.)-])\s+/i, '').trim();
const normKey = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

/** Divide um texto em frases (sem quebrar em "art.", "ex.", "inc.", números). */
export function sentences(text) {
  const protectedText = text.replace(/\b(art|arts|inc|ex|p|pp|n|nº|al|cf|fls|Dec|Min|Rel|Súm|v|vs|Prof|Profa|Dr|Dra|séc)\./gi, '$1\u0001')
    .replace(/(\d)\.(\d)/g, '$1\u0001$2');
  return protectedText.split(/(?<=[.!?;])\s+(?=[A-ZÁÉÍÓÚÂÊÔÃÕÇ*_"“(])/).map((s) => s.replace(/\u0001/g, '.').trim()).filter(Boolean);
}

function definitionCard(rawSentence, topic) {
  const plain = clean(stripInline(rawSentence)).replace(/^[-–•]\s*/, '');
  // "**Termo**: descrição" ou "Termo (art. x): descrição"
  const colon = rawSentence.match(/^\s*(\*\*[^*]{2,80}\*\*[^:]{0,40}|[^:]{2,60}):\s+(.{8,})$/);
  if (colon) {
    const label = clean(stripInline(colon[1]));
    if (label.split(' ').length <= 9 && !/^https?$/i.test(label) && !NOT_LABEL.test(label)) {
      const startsBold = /^\s*\*\*/.test(colon[1]);
      return { front: startsBold ? `O que é ${label}?` : `Explique: ${label}`, back: cap(clean(stripInline(colon[2]))), topic, source: 'definição' };
    }
  }
  const m = plain.match(VERB_RE);
  if (!m) return null;
  const art = (m[1].trim().match(ARTICLE_RE)?.[1] || '').toLowerCase();
  if (NOT_DEF.test(m[3])) return null;
  let term = m[1].trim().replace(ARTICLE_RE, '');
  const words = term.split(/\s+/).length;
  const boldAtStart = /^\s*(?:(?:o|a|os|as|um|uma)\s+)?\*\*/i.test(rawSentence);
  if (STOP_START.test(term) || (!boldAtStart && words > 6) || words > 10 || /[,;]$/.test(term)) return null;
  if (/^[a-zà-ú]/.test(term) && !boldAtStart && words > 4) return null;
  const verb = VERBS.find((v) => new RegExp(`^${v[0]}$`, 'i').test(m[2]));
  // "Evicção" -> "evicção" (mantém siglas e nomes como "STF", "Código Civil")
  if (/^[A-ZÁÉÍÓÚÂÊÔÃÕÇ][a-zà-ú]/.test(term) && !/\s[A-ZÁÉÍÓÚ]/.test(term)) term = term.charAt(0).toLowerCase() + term.slice(1);
  const q = `${verb[1]} ${art ? art + ' ' : ''}${term.replace(/[.:]$/, '')}?`;
  return { front: cap(q), back: cap(plain), topic, source: 'definição', term: normKey(term) };
}

function clozeCards(rawSentence, topic, usedTerms) {
  const out = [];
  const bolds = [...rawSentence.matchAll(/\*\*([^*]{2,60})\*\*/g)].map((x) => x[1]);
  for (const b of bolds) {
    const term = clean(stripInline(b));
    if (usedTerms.has(normKey(term))) continue;
    const plain = clean(stripInline(rawSentence)).replace(/^[-–•]\s*/, '');
    if (plain.length < 35 || plain.length > 320) continue;
    const idx = plain.indexOf(term);
    if (idx < 0) continue;
    const rest = (plain.slice(0, idx) + plain.slice(idx + term.length)).trim();
    if (rest.split(/\s+/).length < 5) continue;
    if (idx === 0 && /^\s*[(:;,]/.test(plain.slice(term.length))) continue; // "Termo (explicação)" vira lacuna pobre
    usedTerms.add(normKey(term));
    out.push({ front: `Complete: ${plain.slice(0, idx)}_____${plain.slice(idx + term.length)}`, back: term, topic, source: 'negrito' });
  }
  return out;
}

/**
 * Gera cartões candidatos.
 * @returns [{front, back, topic, source}]
 */
export function generateCards(markdown, { max = 120 } = {}) {
  const { blocks } = parseMarkdown(markdown);
  const cards = [];
  const usedTerms = new Set();

  // 1. títulos -> resumo da seção
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    if (b.type !== 'heading' || b.level < 2) continue;
    const next = blocks[i + 1];
    if (!next || next.type === 'heading' || next.type === 'code') continue;
    let back = '';
    if (next.type === 'paragraph' || next.type === 'quote') back = clean(stripInline(next.text));
    else if (next.type === 'list') back = next.items.map((it) => '• ' + clean(stripInline(it))).join('\n');
    else if (next.type === 'table') back = next.rows.map((r) => r.join(' — ')).join('\n');
    const title = stripNumbering(b.text);
    if (!back || !title) continue;
    cards.push({ front: `Explique: ${title}`, back: trunc(back), topic: b.text, source: 'título' });
  }

  // 2 e 3. definições e termos em negrito (parágrafos e itens de lista)
  for (const b of blocks) {
    const texts = b.type === 'paragraph' ? sentences(b.text) : b.type === 'list' ? b.items : b.type === 'quote' ? sentences(b.text) : [];
    for (const raw of texts) {
      const def = definitionCard(raw, b.section);
      if (def) { if (def.term) usedTerms.add(def.term); cards.push(def); continue; }
      cards.push(...clozeCards(raw, b.section, usedTerms));
    }
  }

  // 4. tabelas
  for (const b of blocks) {
    if (b.type !== 'table' || b.header.length < 2 || b.header.length > 5) continue;
    for (const row of b.rows) {
      if (!row[0]) continue;
      for (let k = 1; k < b.header.length; k++) {
        if (!row[k]) continue;
        const ctx = b.section ? stripNumbering(b.section) + ' — ' : '';
        cards.push({ front: `${ctx}${b.header[0]} “${row[0]}”: ${b.header[k].toLowerCase()}?`, back: row[k], topic: b.section, source: 'tabela' });
      }
    }
  }

  // remove repetidos
  const seen = new Set();
  return cards.filter((c) => {
    const k = normKey(c.front);
    if (!k || seen.has(k)) return false;
    seen.add(k);
    delete c.term;
    return true;
  }).slice(0, max);
}
