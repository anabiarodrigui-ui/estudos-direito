/**
 * Estatísticas semanais (função pura, testável no Node).
 */
import { addDays, range } from './dates.js';
import { expand } from './events.js';

/**
 * @param {object} p { sessions, reviews, events, subjects, weekStart }
 * @returns {{ days, bySubject, totalMinutes, reviewsTotal, accuracy, tasksDone, tasksTotal, cardsNew }}
 */
export function weeklyStats({ sessions = [], reviews = [], events = [], subjects = [], weekStart }) {
  const end = addDays(weekStart, 6);
  const dates = range(weekStart, end);
  const inWeek = (d) => d >= weekStart && d <= end;
  const ses = sessions.filter((s) => inWeek(s.date));
  const rev = reviews.filter((r) => inWeek(r.date));
  const tasks = expand(events, [], weekStart, end).filter((o) => o.ev.type === 'task');

  const days = dates.map((date) => ({
    date,
    minutes: ses.filter((s) => s.date === date).reduce((a, s) => a + (s.minutes || 0), 0),
    reviews: rev.filter((r) => r.date === date).length,
    tasksDone: tasks.filter((o) => o.date === date && o.done).length,
    tasksTotal: tasks.filter((o) => o.date === date).length,
  }));

  const bySubject = subjects.map((s) => ({
    id: s.id, name: s.name, color: s.color,
    minutes: ses.filter((x) => x.subjectId === s.id).reduce((a, x) => a + (x.minutes || 0), 0),
    reviews: rev.filter((r) => r.subjectId === s.id).length,
  }));
  const noSubj = ses.filter((x) => !subjects.some((s) => s.id === x.subjectId)).reduce((a, x) => a + (x.minutes || 0), 0);
  if (noSubj) bySubject.push({ id: '', name: 'Sem matéria', color: '', minutes: noSubj, reviews: 0 });

  const correct = rev.filter((r) => r.grade >= 3).length;
  return {
    days,
    bySubject: bySubject.sort((a, b) => b.minutes - a.minutes),
    totalMinutes: days.reduce((a, d) => a + d.minutes, 0),
    reviewsTotal: rev.length,
    accuracy: rev.length ? Math.round((correct / rev.length) * 100) : null,
    tasksDone: tasks.filter((o) => o.done).length,
    tasksTotal: tasks.length,
    cardsNew: rev.filter((r) => r.wasNew && !r.quick).length,
  };
}
