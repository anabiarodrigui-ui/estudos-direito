/**
 * Gerador de plano de estudos que respeita a ROTINA e o TEMPO DOS GUIAS
 * (funções puras, testáveis no Node).
 *
 * Como funciona:
 * 1. Para cada dia, parte da "janela" do dia (ex.: 07:00–22:30; dias de folga são pulados).
 * 2. Tira dessa janela tudo o que já ocupa o tempo: compromissos fixos da rotina (com uma
 *    folga antes e depois) e tarefas/provas com horário já marcadas.
 * 3. Nos espaços livres, encaixa o estudo até o limite de horas por dia:
 *    - cada guia pendente ocupa o TEMPO DE ESTUDO dele; se não couber num espaço, é
 *      dividido em partes ("parte 1 de 3") nos próximos espaços livres;
 *    - matéria sem guia pendente vira "Estudar <matéria>";
 *    - na véspera da prova, "Revisão final — <matéria>".
 * 4. A matéria de cada pedaço é escolhida por prioridade: prova mais próxima e menos
 *    conteúdo estudado pesam mais; quem já estudou mais no dia perde peso (para variar).
 *
 * replanMissed() usa os mesmos espaços livres para remarcar blocos atrasados.
 */
import { addDays, diffDays, weekday, timeToMin, minToTime } from './dates.js';

export const MIN_BLOCK = 25;      // bloco mais curto aceito (min)
const EXAM_BUSY = 180;            // uma prova ocupa ~3h na agenda

/** Janela de cada dia da semana (0 = dom … 6 = sáb): { start, end, off }. */
export function defaultWindows({ startTime = '08:00', skipWeekdays = [0], end = '22:00' } = {}) {
  return Array.from({ length: 7 }, (_, wd) => ({ start: startTime, end, off: skipWeekdays.includes(wd) }));
}

/** Compromissos fixos da rotina em um dia: [{start, end, item}] em minutos. */
export function routineOn(routine, date) {
  const wd = weekday(date);
  return routine
    .filter((r) => r.weekdays?.includes(wd) && timeToMin(r.start) != null && timeToMin(r.end) != null)
    .map((r) => ({ start: timeToMin(r.start), end: timeToMin(r.end), item: r }))
    .filter((r) => r.end > r.start)
    .sort((a, b) => a.start - b.start);
}

/**
 * Intervalos ocupados de um dia, em minutos: rotina (± folga) + tarefas/provas com horário.
 * @param {Array} occurrences ocorrências da agenda (de expand()) — só as deste dia são usadas
 */
export function busyIntervals(date, { routine = [], occurrences = [], buffer = 0 } = {}) {
  const busy = routineOn(routine, date).map((r) => [r.start - buffer, r.end + buffer]);
  for (const oc of occurrences) {
    if (oc.date !== date) continue;
    const t = timeToMin(oc.ev.time);
    if (t == null) continue;
    const dur = oc.ev.type === 'exam' ? EXAM_BUSY : (oc.ev.duration || 30);
    busy.push(oc.ev.type === 'exam' ? [t - buffer, t + dur + buffer] : [t, t + dur]);
  }
  return mergeIntervals(busy);
}

export function mergeIntervals(list) {
  const s = list.filter(([a, b]) => b > a).sort((x, y) => x[0] - y[0]);
  const out = [];
  for (const [a, b] of s) {
    if (out.length && a <= out.at(-1)[1]) out.at(-1)[1] = Math.max(out.at(-1)[1], b);
    else out.push([a, b]);
  }
  return out;
}

/** Espaços livres dentro da janela [ws, we] descontando os ocupados. */
export function freeGaps(ws, we, busy) {
  const gaps = [];
  let t = ws;
  for (const [a, b] of busy) {
    if (b <= t) continue;
    if (a >= we) break;
    if (a > t) gaps.push([t, Math.min(a, we)]);
    t = Math.max(t, b);
  }
  if (t < we) gaps.push([t, we]);
  return gaps;
}

/**
 * Lugares (horários) para blocos de estudo num dia.
 * @returns {Array<[inicio, duracao]>} em minutos
 */
export function slotsForDay(date, { windows, routine = [], occurrences = [], buffer = 0, blockMinutes = 50, breakMinutes = 10, minBlock = MIN_BLOCK, budget = Infinity, from = 0 }) {
  const w = windows[weekday(date)];
  if (!w || w.off) return [];
  const ws = Math.max(timeToMin(w.start) ?? 480, from), we = timeToMin(w.end) ?? 1320;
  const gaps = freeGaps(ws, we, busyIntervals(date, { routine, occurrences, buffer }));
  const slots = [];
  for (let [a, b] of gaps) {
    while (budget >= minBlock) {
      const len = Math.min(blockMinutes, b - a, budget);
      if (len < minBlock) break;
      slots.push([a, len]);
      budget -= len;
      a += len + breakMinutes;
    }
  }
  return slots;
}

/** Minutos livres por dia da semana (para mostrar na tela da rotina). */
export function freeMinutesByWeekday({ windows, routine = [], buffer = 0 }, refMonday = '2026-01-05') {
  return Array.from({ length: 7 }, (_, i) => {
    const date = addDays(refMonday, (i + 6) % 7); // i = dia da semana (0 = dom)
    const w = windows[i];
    if (!w || w.off) return 0;
    const gaps = freeGaps(timeToMin(w.start) ?? 480, timeToMin(w.end) ?? 1320, busyIntervals(date, { routine, buffer }));
    return gaps.reduce((acc, [a, b]) => acc + (b - a), 0);
  });
}

// ---------------------------------------------------------------------------
// Tempo de estudo dos guias

/** Palavras por minuto num estudo atento (ler, grifar, entender). */
export const STUDY_WPM = 100;

/** Estimativa de tempo de estudo de um guia em Markdown (múltiplos de 5 min, mínimo 15). */
export function estimateStudyMinutes(markdown) {
  const words = (String(markdown || '').replace(/[#>*_`|\-]/g, ' ').match(/\S+/g) || []).length;
  return Math.max(15, Math.ceil(words / STUDY_WPM / 5) * 5);
}

/** Tempo de estudo de um guia: o informado pela usuária ou a estimativa. */
export const guideMinutes = (g) => (g.studyMinutes > 0 ? g.studyMinutes : estimateStudyMinutes(g.content || ''));

/** Espaços livres de um dia (em minutos), já descontando rotina, folgas e agenda. */
export function dayGaps(date, { windows, routine = [], occurrences = [], buffer = 0, from = 0 }) {
  const w = windows[weekday(date)];
  if (!w || w.off) return [];
  const ws = Math.max(timeToMin(w.start) ?? 480, from), we = timeToMin(w.end) ?? 1320;
  return freeGaps(ws, we, busyIntervals(date, { routine, occurrences, buffer })).map(([x, y]) => [x, y]);
}

/**
 * Gera o plano respeitando o TEMPO DE CADA GUIA.
 * - Cada guia pendente vira uma tarefa com o tempo dele; se não couber num horário livre,
 *   é dividido em partes ("parte 1 de 3"), em sequência, nos próximos horários livres.
 * - Matéria sem guia pendente: "Estudar <matéria>" (sessões de `genericMinutes`).
 * - Véspera da prova: "Revisão final — <matéria>" (até `reviewMinutes`).
 *
 * @param {object} p
 * @param {Array}  p.subjects  [{id, name, examDate}]
 * @param {Array}  p.occurrences ocorrências já existentes (de expand(), com provas)
 * @param {Array}  p.routine   compromissos fixos [{title, weekdays, start, end}]
 * @param {Object} p.guidesBySubject { subjectId: [{id, title, status, minutes}] } em ordem
 * @param {Object} p.progressBySubject { subjectId: 0..100 }
 * @param {string} p.start     data inicial (AAAA-MM-DD)
 * @param {object} p.opts      { dailyMinutes, breakMinutes, buffer, windows, reviewDayBefore, startFrom,
 *                               maxSession (0 = sem limite), genericMinutes, reviewMinutes }
 * @returns {Array} novos eventos (sem id), com generated: true. A lista tem também
 *          `.unplanned` = guias (ou partes) que não couberam antes da prova.
 */
export function generatePlan({ subjects, occurrences = [], routine = [], guidesBySubject = {}, progressBySubject = {}, start, opts }) {
  const o = { dailyMinutes: 240, breakMinutes: 10, buffer: 0, reviewDayBefore: true, maxSession: 0, genericMinutes: 60, reviewMinutes: 120, ...opts };
  if (!o.windows) o.windows = defaultWindows({ startTime: o.startTime, skipWeekdays: o.skipWeekdays ?? [0], end: '23:00' });
  const maxSession = o.maxSession > 0 ? o.maxSession : Infinity;
  const withExam = subjects.filter((s) => s.examDate && s.examDate > start);
  const out = [];
  out.unplanned = [];
  if (!withExam.length) return out;
  const lastExam = withExam.map((s) => s.examDate).sort().at(-1);

  // minutos de tarefas já marcadas (contam no limite diário)
  const usedByDay = {};
  for (const oc of occurrences) if (oc.ev.type === 'task') usedByDay[oc.date] = (usedByDay[oc.date] || 0) + (oc.ev.duration || 0);

  // fila de trabalho de cada matéria: guias pendentes em ordem, depois "Estudar <matéria>"
  const queues = Object.fromEntries(withExam.map((s) => [s.id,
    (guidesBySubject[s.id] || []).filter((g) => g.status !== 'lido').map((g) => ({ kind: 'guide', guideId: g.id, title: g.title, remaining: Math.max(MIN_BLOCK, g.minutes || 60), pieces: [] }))]));
  const current = (s) => {
    const q = queues[s.id];
    // sobra de "Estudar <matéria>" menor que o mínimo é descartada (não vira bloco minúsculo)
    while (q.length && (q[0].remaining <= 0 || (q[0].kind === 'subject' && q[0].remaining < MIN_BLOCK))) q.shift();
    if (!q.length) q.push({ kind: 'subject', remaining: o.genericMinutes, pieces: [] });
    return q[0];
  };
  const finished = []; // itens com partes (para numerar depois)

  const lastGeneric = {}; // último "Estudar <matéria>" de cada matéria (para emendar sessões seguidas)
  /** Encaixa um pedaço; devolve quantos minutos do limite diário foram usados. */
  const place = (s, item, d, gap, len, title, budget) => {
    const prev = lastGeneric[s.id];
    if (item.kind === 'subject' && prev && prev.date === d && timeToMin(prev.time) + prev.duration + o.breakMinutes === gap[0]
      && prev.duration + o.breakMinutes + len <= maxSession && len + o.breakMinutes <= budget) {
      // continua a sessão anterior da mesma matéria (o intervalo vira estudo), sem criar outro bloco
      prev.duration += o.breakMinutes + len;
      gap[0] += len + o.breakMinutes;
      return len + o.breakMinutes;
    }
    const ev = {
      type: 'task', title, subjectId: s.id, date: d, time: minToTime(gap[0]), duration: len,
      done: false, notes: '', recurrence: null, doneDates: [], skipDates: [], generated: true,
      ...(item.guideId ? { guideId: item.guideId } : {}),
    };
    out.push(ev);
    item.pieces.push(ev);
    lastGeneric[s.id] = item.kind === 'subject' ? ev : null;
    if (!finished.includes(item)) finished.push(item);
    gap[0] += len + o.breakMinutes;
    return len;
  };

  for (let d = start; d < lastExam; d = addDays(d, 1)) {
    const active = withExam.filter((s) => s.examDate > d);
    if (!active.length) continue;
    const examToday = withExam.some((s) => s.examDate === d);
    let budget = (examToday ? o.dailyMinutes / 2 : o.dailyMinutes) - (usedByDay[d] || 0);
    const gaps = dayGaps(d, { ...o, routine, occurrences, from: d === start ? (o.startFrom || 0) : 0 });
    const minutesToday = {};
    const fits = (need) => {
      while (gaps.length && gaps[0][1] - gaps[0][0] < need) gaps.shift();
      return gaps.length > 0;
    };

    // véspera de prova: revisão final primeiro
    if (o.reviewDayBefore) {
      for (const s of active.filter((x) => diffDays(d, x.examDate) === 1)) {
        const review = { kind: 'review', remaining: o.reviewMinutes, pieces: [] };
        while (review.remaining > 0 && budget >= MIN_BLOCK && fits(MIN_BLOCK)) {
          const len = Math.min(review.remaining, gaps[0][1] - gaps[0][0], budget, maxSession);
          budget -= place(s, review, d, gaps[0], len, `Revisão final — ${s.name}`, budget);
          review.remaining -= len;
          minutesToday[s.id] = (minutesToday[s.id] || 0) + len;
        }
      }
    }

    // estudo: escolhe a matéria por prioridade e encaixa o próximo pedaço do item dela
    let guard = 0;
    while (budget >= MIN_BLOCK && gaps.length && guard++ < 200) {
      let best = null, bestScore = -1;
      for (const s of active) {
        const days = Math.max(1, diffDays(d, s.examDate));
        const prog = (progressBySubject[s.id] || 0) / 100;
        const score = (1 / days) * (1.5 - prog) / (1 + ((minutesToday[s.id] || 0) / 60) * 0.9);
        if (score > bestScore) { bestScore = score; best = s; }
      }
      const item = current(best);
      const need = Math.min(MIN_BLOCK, item.remaining); // um final curto de guia é aceito
      if (!fits(need)) break;
      const len = Math.min(item.remaining, gaps[0][1] - gaps[0][0], budget, maxSession);
      const title = item.kind === 'guide' ? `Estudar: ${item.title}` : `Estudar ${best.name}`;
      budget -= place(best, item, d, gaps[0], len, title, budget);
      item.remaining -= len;
      minutesToday[best.id] = (minutesToday[best.id] || 0) + len;
    }
  }

  // numera as partes dos guias divididos: "(parte 1 de 3)"
  for (const item of finished) {
    if (item.kind !== 'guide' || item.pieces.length < 2) continue;
    const total = item.pieces.length + (item.remaining > 0 ? 1 : 0);
    item.pieces.forEach((ev, i) => { ev.title = `${ev.title} (parte ${i + 1} de ${total})`; ev.part = i + 1; ev.parts = total; });
  }
  // guias que não couberam (inteiros ou o restante) antes da prova
  for (const s of withExam) {
    for (const item of queues[s.id]) if (item.kind === 'guide' && item.remaining > 0) out.unplanned.push({ subjectId: s.id, title: item.title, minutes: item.remaining });
  }
  return out;
}

/**
 * Remarca blocos atrasados (não concluídos, de dias anteriores) nos próximos espaços livres.
 * Se um bloco não couber inteiro num horário livre, é dividido em partes.
 * @param {Array} missed eventos a remarcar [{id, subjectId, duration, title, ...}]
 * @param {object} p { today, occurrences (de hoje em diante), routine, examBySubject: {id: date}, opts, horizon }
 * @returns {{ moved: Array<{id, date, time, duration}>, added: Array<{from, date, time, duration}>, notPlaced: Array<id> }}
 */
export function replanMissed(missed, { today, occurrences = [], routine = [], examBySubject = {}, opts = {}, horizon = 60 }) {
  const o = { dailyMinutes: 240, breakMinutes: 10, buffer: 0, ...opts };
  if (!o.windows) o.windows = defaultWindows({ startTime: o.startTime, skipWeekdays: o.skipWeekdays ?? [0], end: '23:00' });
  const occ = [...occurrences];
  const used = {};
  for (const oc of occ) if (oc.ev.type === 'task') used[oc.date] = (used[oc.date] || 0) + (oc.ev.duration || 0);
  const moved = [], added = [], notPlaced = [];
  // a prova mais próxima primeiro
  const queue = [...missed].sort((a, b) => (examBySubject[a.subjectId] || '9999') < (examBySubject[b.subjectId] || '9999') ? -1 : 1);

  const tryPlace = (ev, respectBudget) => {
    const limit = examBySubject[ev.subjectId] || addDays(today, horizon);
    let remaining = Math.max(1, ev.duration || 50);
    const pieces = [];
    const occAdded = [];
    for (let d = today; d < limit && d <= addDays(today, horizon) && remaining > 0; d = addDays(d, 1)) {
      let budget = respectBudget ? o.dailyMinutes - (used[d] || 0) : Infinity;
      const from = d === today ? Math.ceil((opts.nowMinutes ?? 0) / 5) * 5 : 0; // hoje: a partir de agora
      const gaps = dayGaps(d, { ...o, routine, occurrences: [...occ, ...occAdded], from });
      for (const g of gaps) {
        while (remaining > 0 && budget > 0) {
          const len = Math.min(remaining, g[1] - g[0], budget);
          if (len < Math.min(MIN_BLOCK, remaining)) break;
          pieces.push({ date: d, time: minToTime(g[0]), duration: len });
          occAdded.push({ date: d, ev: { type: 'task', time: minToTime(g[0]), duration: len + o.breakMinutes } });
          g[0] += len + o.breakMinutes; remaining -= len; budget -= len;
        }
        if (remaining <= 0) break;
      }
    }
    if (remaining > 0) return false;
    occ.push(...occAdded);
    for (const p of pieces) used[p.date] = (used[p.date] || 0) + p.duration;
    moved.push({ id: ev.id, ...pieces[0] });
    for (const p of pieces.slice(1)) added.push({ from: ev.id, ...p });
    return true;
  };
  // 1ª tentativa: dentro do limite diário; 2ª: em qualquer horário livre da rotina
  for (const ev of queue) if (!tryPlace(ev, true) && !tryPlace(ev, false)) notPlaced.push(ev.id);
  return { moved, added, notPlaced };
}
