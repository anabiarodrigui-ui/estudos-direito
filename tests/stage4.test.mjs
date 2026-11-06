// Testes da etapa 4: estatísticas semanais.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { weeklyStats } from '../js/core/stats.js';

test('estatísticas semanais: horas por dia/matéria, revisões e tarefas', () => {
  const st = weeklyStats({
    weekStart: '2026-11-02',
    subjects: [{ id: 'a', name: 'Civil', color: '#000' }, { id: 'b', name: 'Penal', color: '#111' }],
    sessions: [
      { subjectId: 'a', date: '2026-11-02', minutes: 50 }, { subjectId: 'a', date: '2026-11-03', minutes: 25 },
      { subjectId: 'b', date: '2026-11-03', minutes: 30 }, { subjectId: 'a', date: '2026-11-09', minutes: 99 }, // fora da semana
    ],
    reviews: [{ date: '2026-11-03', grade: 4, subjectId: 'a', wasNew: true }, { date: '2026-11-04', grade: 1, subjectId: 'b' }],
    events: [
      { id: 't1', type: 'task', date: '2026-11-03', done: true },
      { id: 't2', type: 'task', date: '2026-11-05', done: false },
      { id: 't3', type: 'task', date: '2026-11-02', recurrence: { freq: 'daily' }, doneDates: ['2026-11-02', '2026-11-03'] },
    ],
  });
  assert.equal(st.totalMinutes, 105);
  assert.deepEqual(st.days.map((d) => d.minutes), [50, 55, 0, 0, 0, 0, 0]);
  assert.deepEqual(st.bySubject.map((s) => [s.name, s.minutes]), [['Civil', 75], ['Penal', 30]]);
  assert.equal(st.reviewsTotal, 2);
  assert.equal(st.accuracy, 50);
  assert.equal(st.cardsNew, 1);
  assert.equal(st.tasksTotal, 2 + 7);
  assert.equal(st.tasksDone, 1 + 2);
});
