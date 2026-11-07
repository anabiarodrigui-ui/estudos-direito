/**
 * Gerador de plano de estudos que respeita a ROTINA (funções puras, testáveis no Node).
 *
 * Como funciona:
 * 1. Para cada dia, parte da "janela" do dia (ex.: 07:00–22:30; dias de folga são pulados).
 * 2. Tira dessa janela tudo o que já ocupa o tempo:
 *    - compromissos fixos da rotina (aulas, deslocamento, terapia, cuidados pessoais…),
 *      com uma folga antes e depois de cada um;
 *    - tarefas e provas com horário já marcadas na agenda.
 * 3. Nos espaços que sobram, encaixa blocos de estudo (duração padrão; se o espaço for
 *    menor, um bloco mais curto, desde que tenha pelo menos o mínimo), até o limite de
 *    horas de estudo por dia.
 * 4. Escolhe a matéria de cada bloco: na véspera de uma prova, os primeiros blocos são
 *    "Revisão final"; os demais vão por prioridade (prova mais próxima e menos conteúdo
 *    estudado pesam mais; a mesma matéria perde peso a cada bloco no dia, para variar).
 * 5. Os títulos seguem os guias ainda não lidos ("Estudar: Capítulo X"); quando acabam,
 *    viram "Revisão + flashcards".
 *
 * replanMissed() usa a mesma lógica de espaços livres para remarcar blocos atrasados.
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

/**
 * Gera o plano.
 * @param {object} p
 * @param {Array}  p.subjects  [{id, name, examDate}]
 * @param {Array}  p.occurrences ocorrências já existentes (de expand(), com provas)
 * @param {Array}  p.routine   compromissos fixos [{title, weekdays, start, end}]
 * @param {Object} p.guidesBySubject { subjectId: [{title, status}] } em ordem
 * @param {Object} p.progressBySubject { subjectId: 0..100 }
 * @param {string} p.start     data inicial (AAAA-MM-DD)
 * @param {object} p.opts      { dailyMinutes, blockMinutes, breakMinutes, buffer, windows, reviewDayBefore, startFrom }
 *                             (compatível com o formato antigo: startTime, skipWeekdays)
 * @returns {Array} novos eventos (sem id), com generated: true
 */
export function generatePlan({ subjects, occurrences = [], routine = [], guidesBySubject = {}, progressBySubject = {}, start, opts }) {
  const o = { dailyMinutes: 240, blockMinutes: 50, breakMinutes: 10, buffer: 0, reviewDayBefore: true, ...opts };
  if (!o.windows) o.windows = defaultWindows({ startTime: o.startTime, skipWeekdays: o.skipWeekdays ?? [0], end: '23:00' });
  const withExam = subjects.filter((s) => s.examDate && s.examDate > start);
  if (!withExam.length || o.blockMinutes < MIN_BLOCK) return [];
  const lastExam = withExam.map((s) => s.examDate).sort().at(-1);

  // minutos de tarefas SEM horário já marcadas (contam no limite diário)
  const untimed = {};
  for (const oc of occurrences) if (oc.ev.type === 'task' && !oc.ev.time) untimed[oc.date] = (untimed[oc.date] || 0) + (oc.ev.duration || 0);
  const timedTaskMin = {};
  for (const oc of occurrences) if (oc.ev.type === 'task' && oc.ev.time) timedTaskMin[oc.date] = (timedTaskMin[oc.date] || 0) + (oc.ev.duration || 0);

  const guideIdx = Object.fromEntries(withExam.map((s) => [s.id, 0]));
  const pendingGuides = Object.fromEntries(withExam.map((s) => [s.id, (guidesBySubject[s.id] || []).filter((g) => g.status !== 'lido')]));
  const titleFor = (s, kind) => {
    if (kind === 'final') return `Revisão final — ${s.name}`;
    const list = pendingGuides[s.id];
    if (list.length && guideIdx[s.id] < list.length) return `Estudar: ${list[guideIdx[s.id]++].title} (${s.name})`;
    return `Revisão + flashcards — ${s.name}`;
  };

  const out = [];
  for (let d = start; d < lastExam; d = addDays(d, 1)) {
    const active = withExam.filter((s) => s.examDate > d);
    if (!active.length) continue;
    const examToday = withExam.some((s) => s.examDate === d);
    const budget = (examToday ? o.dailyMinutes / 2 : o.dailyMinutes) - (untimed[d] || 0) - (timedTaskMin[d] || 0);
    // no primeiro dia, pode começar só a partir de agora (startFrom, em minutos)
    const slots = slotsForDay(d, { ...o, routine, occurrences, budget, from: d === start ? (o.startFrom || 0) : 0 });
    if (!slots.length) continue;

    const kinds = []; // [{s, kind}]
    let free = slots.length;
    if (o.reviewDayBefore) {
      for (const s of active.filter((x) => diffDays(d, x.examDate) === 1)) {
        const n = Math.min(free, 2);
        for (let i = 0; i < n; i++) kinds.push({ s, kind: 'final' });
        free -= n;
      }
    }
    const count = {};
    for (let i = 0; i < free; i++) {
      let best = null, bestScore = -1;
      for (const s of active) {
        const days = Math.max(1, diffDays(d, s.examDate));
        const prog = (progressBySubject[s.id] || 0) / 100;
        const score = (1 / days) * (1.5 - prog) / (1 + (count[s.id] || 0) * 0.9);
        if (score > bestScore) { bestScore = score; best = s; }
      }
      count[best.id] = (count[best.id] || 0) + 1;
      kinds.push({ s: best, kind: 'study' });
    }

    slots.forEach(([t, len], i) => {
      const { s, kind } = kinds[i];
      out.push({
        type: 'task', title: titleFor(s, kind), subjectId: s.id, date: d,
        time: minToTime(t), duration: len, done: false, notes: '', recurrence: null,
        doneDates: [], skipDates: [], generated: true,
      });
    });
  }
  return out;
}

/**
 * Remarca blocos atrasados (não concluídos, de dias anteriores) nos próximos espaços livres.
 * @param {Array} missed eventos a remarcar [{id, subjectId, duration, ...}]
 * @param {object} p { today, occurrences (de hoje em diante), routine, examBySubject: {id: date}, opts, horizon }
 * @returns {{ moved: Array<{id, date, time, duration}>, notPlaced: Array<id> }}
 */
export function replanMissed(missed, { today, occurrences = [], routine = [], examBySubject = {}, opts = {}, horizon = 60 }) {
  const o = { dailyMinutes: 240, blockMinutes: 50, breakMinutes: 10, buffer: 0, ...opts };
  if (!o.windows) o.windows = defaultWindows({ startTime: o.startTime, skipWeekdays: o.skipWeekdays ?? [0], end: '23:00' });
  const occ = [...occurrences];
  const used = {};
  for (const oc of occ) if (oc.ev.type === 'task') used[oc.date] = (used[oc.date] || 0) + (oc.ev.duration || 0);
  const moved = [], notPlaced = [];
  // a prova mais próxima primeiro
  const queue = [...missed].sort((a, b) => (examBySubject[a.subjectId] || '9999') < (examBySubject[b.subjectId] || '9999') ? -1 : 1);
  const tryPlace = (ev, respectBudget) => {
    const limit = examBySubject[ev.subjectId] || addDays(today, horizon);
    for (let d = today; d < limit && d <= addDays(today, horizon); d = addDays(d, 1)) {
      const budget = respectBudget ? o.dailyMinutes - (used[d] || 0) : Infinity;
      const want = Math.max(MIN_BLOCK, ev.duration || o.blockMinutes);
      // hoje: só a partir de agora (arredondado para os próximos 5 min)
      const from = d === today ? Math.ceil((opts.nowMinutes ?? 0) / 5) * 5 : 0;
      const slot = slotsForDay(d, { ...o, blockMinutes: want, routine, occurrences: occ, budget, from })[0];
      if (!slot) continue;
      const [t, len] = slot;
      const upd = { id: ev.id, date: d, time: minToTime(t), duration: len };
      moved.push(upd);
      occ.push({ date: d, ev: { type: 'task', time: upd.time, duration: len + o.breakMinutes } }); // + intervalo até o próximo bloco
      used[d] = (used[d] || 0) + len;
      return true;
    }
    return false;
  };
  // 1ª tentativa: dentro do limite diário; 2ª: em qualquer horário livre da rotina
  for (const ev of queue) if (!tryPlace(ev, true) && !tryPlace(ev, false)) notPlaced.push(ev.id);
  return { moved, notPlaced };
}
