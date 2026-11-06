/** Componentes e consultas compartilhados entre telas. */
import * as db from '../core/db.js';
import { esc } from './dom.js';

/**
 * Cores das matérias: 5 tons bem diferentes de rosa, de azul e de roxo
 * (do mais claro ao mais escuro). Diferença mínima entre tons da mesma família
 * medida em OKLab (ΔE ≥ 10) para que dê para distinguir as matérias.
 */
export const COLOR_FAMILIES = [
  { name: 'Rosas', colors: [['#f5b3cc', 'Rosa bebê'], ['#ee7aa6', 'Rosa chiclete'], ['#ff2e93', 'Pink choque'], ['#b83a6e', 'Amaranth'], ['#7f1f4a', 'Rosa vinho']] },
  { name: 'Azuis', colors: [['#9fd6f5', 'Azul bebê'], ['#4a90e2', 'Azul céu'], ['#2bb3c0', 'Azul turquesa'], ['#2f4fc0', 'Azul royal'], ['#1f3a6b', 'Azul marinho']] },
  { name: 'Roxos', colors: [['#cfb0f2', 'Lilás'], ['#a37ad6', 'Lavanda'], ['#9b4f96', 'Orquídea'], ['#7e3fbf', 'Violeta'], ['#4b2378', 'Roxo uva']] },
];
export const COLORS = COLOR_FAMILIES.flatMap((f) => f.colors.map(([c]) => c));

export const subjects = () => db.all('subjects').sort((a, b) => (a.examDate || '9999') < (b.examDate || '9999') ? -1 : (a.examDate || '9999') > (b.examDate || '9999') ? 1 : a.name.localeCompare(b.name));
export const subjectById = (id) => db.get('subjects', id);
export const subjectColor = (id) => subjectById(id)?.color || 'var(--muted)';
export const subjectName = (id) => subjectById(id)?.name || 'Sem matéria';

/** <option>s de matérias para um <select>. */
export function subjectOptions(selected = '', { allowNone = true, noneLabel = '— Sem matéria —' } = {}) {
  return (allowNone ? `<option value="">${noneLabel}</option>` : '') +
    subjects().map((s) => `<option value="${s.id}" ${s.id === selected ? 'selected' : ''}>${esc(s.name)}</option>`).join('');
}

/** Chips de filtro por matéria. selected = '' (todas) ou id. */
export function subjectChips(selected = '', attr = 'data-subject') {
  return `<div class="chips" role="group" aria-label="Filtrar por matéria">
    <button class="chip" ${attr}="" aria-pressed="${!selected}">Todas</button>
    ${subjects().map((s) => `<button class="chip" ${attr}="${s.id}" aria-pressed="${selected === s.id}"><span class="dot" style="background:${s.color}"></span>${esc(s.name)}</button>`).join('')}
  </div>`;
}

/** Datas com alguma atividade de estudo (para a sequência de dias). */
export function activeDates() {
  const set = new Set();
  for (const r of db.all('reviews')) set.add(r.date);
  for (const s of db.all('sessions')) set.add(s.date);
  for (const e of db.all('events')) {
    if (e.type !== 'task') continue;
    if (e.recurrence?.freq) (e.doneDates || []).forEach((d) => set.add(d));
    else if (e.done && e.doneAt) set.add(e.doneAt);
  }
  return [...set];
}
