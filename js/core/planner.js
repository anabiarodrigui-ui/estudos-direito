/**
 * Gerador de plano de estudos (função pura, testável no Node).
 *
 * Ideia:
 * 1. Considera cada dia de `start` até a véspera da última prova (pulando dias da semana escolhidos).
 * 2. Capacidade do dia = minutos diários disponíveis − minutos já ocupados por tarefas existentes.
 * 3. Na véspera de uma prova, os primeiros blocos vão para "Revisão final" daquela matéria.
 * 4. Os demais blocos são distribuídos por peso: quanto mais próxima a prova e menor o
 *    progresso da matéria, maior a prioridade. Dentro do dia, a mesma matéria vai perdendo
 *    peso a cada bloco recebido (para variar o estudo).
 * 5. Os títulos seguem os guias ainda não lidos de cada matéria ("Estudar: Capítulo X");
 *    quando acabam, viram "Revisão + flashcards".
 * 6. Os horários começam em `startTime` e evitam sobrepor tarefas com horário já marcadas.
 */
import { addDays, diffDays, weekday, timeToMin, minToTime } from './dates.js';

/**
 * @param {object} p
 * @param {Array} p.subjects  [{id, name, examDate}]
 * @param {Array} p.occurrences ocorrências já existentes (de expand()), para calcular ocupação
 * @param {Object} p.guidesBySubject { subjectId: [{title, status}] } em ordem
 * @param {Object} p.progressBySubject { subjectId: 0..100 }
 * @param {string} p.start    data inicial (AAAA-MM-DD)
 * @param {object} p.opts     { dailyMinutes, blockMinutes, breakMinutes, startTime, skipWeekdays:[0..6], reviewDayBefore }
 * @returns {Array} novos eventos (sem id), com generated: true
 */
export function generatePlan({ subjects, occurrences = [], guidesBySubject = {}, progressBySubject = {}, start, opts }) {
  const o = { dailyMinutes: 240, blockMinutes: 50, breakMinutes: 10, startTime: '08:00', skipWeekdays: [0], reviewDayBefore: true, ...opts };
  const withExam = subjects.filter((s) => s.examDate && s.examDate > start);
  if (!withExam.length || o.blockMinutes <= 0) return [];
  const lastExam = withExam.map((s) => s.examDate).sort().at(-1);

  // ocupação já existente por dia
  const busy = {};
  for (const oc of occurrences) {
    if (oc.ev.type !== 'task') continue;
    const b = (busy[oc.date] ||= { minutes: 0, slots: [] });
    b.minutes += oc.ev.duration || 0;
    const t = timeToMin(oc.ev.time);
    if (t != null) b.slots.push([t, t + (oc.ev.duration || 30)]);
  }

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
    if (o.skipWeekdays.includes(weekday(d))) continue;
    const active = withExam.filter((s) => s.examDate > d);
    if (!active.length) continue;
    const b = busy[d] || { minutes: 0, slots: [] };
    // em dia de prova de alguma matéria, metade da capacidade
    const examToday = withExam.some((s) => s.examDate === d);
    const cap = (examToday ? o.dailyMinutes / 2 : o.dailyMinutes) - b.minutes;
    let blocks = Math.floor(cap / o.blockMinutes);
    if (blocks <= 0) continue;

    const plan = []; // [{subject, kind}]
    if (o.reviewDayBefore) {
      for (const s of active.filter((s) => diffDays(d, s.examDate) === 1)) {
        const n = Math.min(blocks, 2);
        for (let i = 0; i < n; i++) plan.push({ s, kind: 'final' });
        blocks -= n;
      }
    }
    const count = {};
    for (let i = 0; i < blocks; i++) {
      let best = null, bestScore = -1;
      for (const s of active) {
        const days = Math.max(1, diffDays(d, s.examDate));
        const prog = (progressBySubject[s.id] || 0) / 100;
        const score = (1 / days) * (1.5 - prog) / (1 + (count[s.id] || 0) * 0.9);
        if (score > bestScore) { bestScore = score; best = s; }
      }
      count[best.id] = (count[best.id] || 0) + 1;
      plan.push({ s: best, kind: 'study' });
    }

    // horários sem sobreposição
    let t = timeToMin(o.startTime) ?? 480;
    const slots = [...b.slots].sort((x, y) => x[0] - y[0]);
    for (const item of plan) {
      let moved = true;
      while (moved) {
        moved = false;
        for (const [a, z] of slots) if (t < z && t + o.blockMinutes > a) { t = z + o.breakMinutes; moved = true; }
      }
      if (t + o.blockMinutes > 23 * 60) break;
      out.push({
        type: 'task', title: titleFor(item.s, item.kind), subjectId: item.s.id, date: d,
        time: minToTime(t), duration: o.blockMinutes, done: false, notes: '', recurrence: null,
        doneDates: [], skipDates: [], generated: true,
      });
      t += o.blockMinutes + o.breakMinutes;
    }
  }
  return out;
}
