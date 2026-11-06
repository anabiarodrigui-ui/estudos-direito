/**
 * Eventos do calendário (funções puras, testáveis no Node).
 *
 * Modelo de um evento salvo (coleção "events"):
 * {
 *   id, type: 'task' | 'exam', title, subjectId, date: 'AAAA-MM-DD',
 *   time: 'HH:MM' | '', duration: minutos, done: boolean, notes,
 *   recurrence: null | { freq: 'daily'|'weekdays'|'weekly', until: 'AAAA-MM-DD'|'' },
 *   doneDates: [datas concluídas, só p/ recorrentes], skipDates: [ocorrências removidas],
 *   generated: boolean (criado pelo "Gerar plano")
 * }
 * A data da prova cadastrada na matéria também aparece como evento "virtual" do tipo exam.
 */
import { addDays, weekday, diffDays } from './dates.js';

/** A ocorrência cai nesta data? */
export function occursOn(ev, date) {
  if (!ev.recurrence || !ev.recurrence.freq) return ev.date === date;
  if (date < ev.date) return false;
  if (ev.recurrence.until && date > ev.recurrence.until) return false;
  if (ev.skipDates?.includes(date)) return false;
  const wd = weekday(date);
  switch (ev.recurrence.freq) {
    case 'daily': return true;
    case 'weekdays': return wd >= 1 && wd <= 5;
    case 'weekly': return wd === weekday(ev.date);
    default: return ev.date === date;
  }
}

/** Uma ocorrência está concluída? */
export function isDone(ev, date) {
  return ev.recurrence?.freq ? !!ev.doneDates?.includes(date) : !!ev.done;
}

/** Eventos virtuais de prova a partir das matérias com data de prova. */
export function subjectExams(subjects) {
  return subjects.filter((s) => s.examDate).map((s) => ({
    id: 'exam:' + s.id, virtual: true, type: 'exam', subjectId: s.id,
    title: 'Prova — ' + s.name, date: s.examDate, time: s.examTime || '', duration: 0,
  }));
}

/**
 * Expande eventos (inclusive recorrentes) no intervalo [from, to].
 * Retorna ocorrências: { key, ev, date, done }, ordenadas por data/hora (provas primeiro).
 */
export function expand(events, subjects, from, to) {
  const out = [];
  const list = [...subjectExams(subjects), ...events];
  for (const ev of list) {
    if (!ev.recurrence?.freq) {
      if (ev.date >= from && ev.date <= to) out.push({ key: ev.id + '@' + ev.date, ev, date: ev.date, done: isDone(ev, ev.date) });
      continue;
    }
    let d = ev.date > from ? ev.date : from;
    const end = ev.recurrence.until && ev.recurrence.until < to ? ev.recurrence.until : to;
    for (let guard = 0; d <= end && guard < 800; d = addDays(d, 1), guard++) {
      if (occursOn(ev, d)) out.push({ key: ev.id + '@' + d, ev, date: d, done: isDone(ev, d) });
    }
  }
  return out.sort(compareOcc);
}

export function compareOcc(a, b) {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1;
  if (a.ev.type !== b.ev.type) return a.ev.type === 'exam' ? -1 : 1;
  const ta = a.ev.time || '99:99', tb = b.ev.time || '99:99';
  return ta < tb ? -1 : ta > tb ? 1 : (a.ev.title || '').localeCompare(b.ev.title || '');
}

/** Próxima prova (>= hoje) de uma matéria, considerando a data da matéria e eventos de prova extras. */
export function nextExam(subject, events, today) {
  const dates = [];
  if (subject.examDate && subject.examDate >= today) dates.push(subject.examDate);
  for (const e of events) if (e.type === 'exam' && e.subjectId === subject.id && e.date >= today) dates.push(e.date);
  if (!dates.length) return null;
  const date = dates.sort()[0];
  return { date, days: diffDays(today, date) };
}

/**
 * Percentual estudado de uma matéria:
 * - se houver guias: % de guias marcados como "lido";
 * - senão: % de blocos de estudo (não recorrentes) concluídos.
 */
export function subjectProgress(subject, guides, events) {
  const g = guides.filter((x) => x.subjectId === subject.id);
  if (g.length) return Math.round((g.filter((x) => x.status === 'lido').length / g.length) * 100);
  const t = events.filter((e) => e.type === 'task' && e.subjectId === subject.id && !e.recurrence?.freq);
  if (!t.length) return 0;
  return Math.round((t.filter((e) => e.done).length / t.length) * 100);
}
