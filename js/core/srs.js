/**
 * Repetição espaçada — algoritmo SM-2 (SuperMemo 2, Piotr Woźniak, 1987).
 *
 * Cada cartão guarda em card.srs:
 *   ef       fator de facilidade (começa em 2,5; mínimo 1,3)
 *   interval intervalo atual em dias
 *   reps     acertos consecutivos
 *   lapses   quantas vezes foi esquecido
 *   due      próxima revisão (AAAA-MM-DD) — null = cartão novo
 *   last     data da última revisão
 *
 * Botões → nota (q) do SM-2:  Errei = 1 · Difícil = 3 · Bom = 4 · Fácil = 5
 *  - q < 3: reps = 0, intervalo = 1 dia (e o cartão volta ainda nesta sessão)
 *  - q ≥ 3: 1ª vez → 1 dia; 2ª → 6 dias; depois intervalo × EF
 *  - EF' = EF + (0,1 − (5 − q) × (0,08 + (5 − q) × 0,02)), nunca abaixo de 1,3
 */
import { addDays } from './dates.js';

export const GRADES = [
  { q: 1, key: 'again', label: 'Errei', cls: 'g1' },
  { q: 3, key: 'hard', label: 'Difícil', cls: 'g3' },
  { q: 4, key: 'good', label: 'Bom', cls: 'g4' },
  { q: 5, key: 'easy', label: 'Fácil', cls: 'g5' },
];

export function newSrs() {
  return { ef: 2.5, interval: 0, reps: 0, lapses: 0, due: null, last: null };
}

/** Calcula o novo estado após uma resposta com nota q (0–5) na data `today`. */
export function schedule(srs, q, today) {
  const s = { ...newSrs(), ...srs };
  let { ef, interval, reps, lapses } = s;
  if (q < 3) {
    reps = 0; interval = 1; lapses += 1;
  } else {
    reps += 1;
    if (reps === 1) interval = 1;
    else if (reps === 2) interval = 6;
    else interval = Math.max(1, Math.round(interval * ef));
  }
  ef = ef + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02));
  ef = Math.max(1.3, Math.round(ef * 100) / 100);
  return { ef, interval, reps, lapses, due: addDays(today, interval), last: today };
}

export const isNew = (card) => !card.srs || !card.srs.last;
export const isDue = (card, today) => !isNew(card) && card.srs.due && card.srs.due <= today;

/** Texto curto do próximo intervalo para cada botão (ex.: "1d", "6d", "2m"). */
export function intervalLabel(days) {
  if (days < 30) return `${days}d`;
  if (days < 365) return `${Math.round(days / 30)}m`;
  return `${(days / 365).toFixed(1).replace('.', ',')}a`;
}

/**
 * Monta a fila da sessão: primeiro os vencidos (mais atrasados antes), depois novos
 * até o limite diário (descontando os novos já estudados hoje).
 */
export function buildQueue(cards, today, { newLimit = 20, newSeenToday = 0 } = {}) {
  const due = cards.filter((c) => isDue(c, today)).sort((a, b) => (a.srs.due < b.srs.due ? -1 : 1));
  const fresh = cards.filter(isNew).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0))
    .slice(0, Math.max(0, newLimit - newSeenToday));
  return [...due, ...fresh];
}

/** Estatísticas de flashcards. reviews: [{date, grade}] */
export function cardStats(cards, reviews, today) {
  const recent = reviews.filter((r) => r.date >= addDays(today, -29));
  const correct = recent.filter((r) => r.grade >= 3).length;
  return {
    total: cards.length,
    novos: cards.filter(isNew).length,
    pendentes: cards.filter((c) => isDue(c, today)).length,
    acerto: recent.length ? Math.round((correct / recent.length) * 100) : null,
    revisadosHoje: reviews.filter((r) => r.date === today).length,
  };
}

/**
 * Sequência de dias estudados (streak): dias consecutivos, terminando hoje
 * (ou ontem, se hoje ainda não estudou), com alguma atividade registrada.
 */
export function streak(activeDates, today) {
  const set = new Set(activeDates);
  let d = set.has(today) ? today : addDays(today, -1);
  let n = 0;
  while (set.has(d)) { n++; d = addDays(d, -1); }
  return n;
}
