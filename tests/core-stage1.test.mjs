// Testes das funções puras da etapa 1: datas, eventos/recorrência e gerador de plano.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as D from '../js/core/dates.js';
import { expand, occursOn, nextExam, subjectProgress } from '../js/core/events.js';
import { generatePlan } from '../js/core/planner.js';

test('datas: soma, diferença, semana e meses', () => {
  assert.equal(D.addDays('2026-02-28', 1), '2026-03-01');
  assert.equal(D.addDays('2026-11-06', -6), '2026-10-31');
  assert.equal(D.diffDays('2026-11-06', '2026-11-18'), 12);
  assert.equal(D.weekStart('2026-11-08'), '2026-11-02'); // domingo -> segunda anterior
  assert.equal(D.weekStart('2026-11-02'), '2026-11-02');
  assert.equal(D.addMonths('2026-01-31', 1), '2026-02-28');
  assert.equal(D.fmtBR('2026-11-06'), '06/11/2026');
  assert.equal(D.fmtMinutes(90), '1h30');
  assert.equal(D.countdownText(0), 'HOJE');
  assert.equal(D.range('2026-11-01', '2026-11-03').length, 3);
});

test('recorrência: diária, dias úteis, semanal, até e exceções', () => {
  const base = { id: 'a', type: 'task', date: '2026-11-02', title: 'x' }; // segunda
  assert.ok(occursOn({ ...base, recurrence: { freq: 'daily' } }, '2026-11-08'));
  assert.ok(!occursOn({ ...base, recurrence: { freq: 'weekdays' } }, '2026-11-08'));
  assert.ok(occursOn({ ...base, recurrence: { freq: 'weekly' } }, '2026-11-09'));
  assert.ok(!occursOn({ ...base, recurrence: { freq: 'weekly' } }, '2026-11-10'));
  assert.ok(!occursOn({ ...base, recurrence: { freq: 'daily', until: '2026-11-05' } }, '2026-11-06'));
  assert.ok(!occursOn({ ...base, recurrence: { freq: 'daily' }, skipDates: ['2026-11-03'] }, '2026-11-03'));
  const occ = expand([{ ...base, recurrence: { freq: 'weekdays' }, doneDates: ['2026-11-03'] }], [], '2026-11-01', '2026-11-08');
  assert.equal(occ.length, 5);
  assert.equal(occ.filter((o) => o.done).length, 1);
});

test('provas das matérias aparecem como eventos e contam os dias', () => {
  const subs = [{ id: 's1', name: 'Civil', examDate: '2026-11-18' }];
  const occ = expand([], subs, '2026-11-01', '2026-11-30');
  assert.equal(occ.length, 1);
  assert.equal(occ[0].ev.type, 'exam');
  assert.deepEqual(nextExam(subs[0], [], '2026-11-06'), { date: '2026-11-18', days: 12 });
  assert.equal(nextExam(subs[0], [], '2026-11-19'), null);
});

test('progresso: por guias lidos ou, sem guias, por tarefas concluídas', () => {
  const s = { id: 's1' };
  assert.equal(subjectProgress(s, [{ subjectId: 's1', status: 'lido' }, { subjectId: 's1', status: 'novo' }], []), 50);
  assert.equal(subjectProgress(s, [], [{ type: 'task', subjectId: 's1', done: true }, { type: 'task', subjectId: 's1', done: false }, { type: 'task', subjectId: 's1', done: false }, { type: 'task', subjectId: 's1', done: true }]), 50);
});

test('plano: prioriza a prova mais próxima, reserva a véspera e respeita domingos', () => {
  const subjects = [
    { id: 'a', name: 'Civil', examDate: '2026-11-12' },  // quinta
    { id: 'b', name: 'Penal', examDate: '2026-11-20' },
  ];
  const plan = generatePlan({
    subjects, start: '2026-11-06',
    guidesBySubject: { a: [{ title: 'Contratos', status: 'novo' }, { title: 'Lido', status: 'lido' }] },
    opts: { dailyMinutes: 200, blockMinutes: 50, breakMinutes: 10, startTime: '08:00', skipWeekdays: [0], reviewDayBefore: true },
  });
  assert.ok(plan.length > 0);
  assert.ok(plan.every((e) => e.generated && e.type === 'task'));
  assert.ok(!plan.some((e) => D.weekday(e.date) === 0), 'não deve haver blocos no domingo');
  assert.ok(!plan.some((e) => e.date >= '2026-11-20'));
  const before = plan.filter((e) => e.date < '2026-11-12');
  const a = before.filter((e) => e.subjectId === 'a').length, b = before.filter((e) => e.subjectId === 'b').length;
  assert.ok(a > b, `antes da 1ª prova Civil deve ter mais blocos (${a} x ${b})`);
  const eve = plan.filter((e) => e.date === '2026-11-11');
  assert.ok(eve[0].title.startsWith('Revisão final — Civil'));
  assert.ok(plan.some((e) => e.title.includes('Estudar: Contratos')));
  assert.ok(!plan.some((e) => e.title.includes('Lido')), 'guias já lidos não entram');
  // 4 blocos de 50 min começando às 08:00 com 10 min de intervalo
  const d1 = plan.filter((e) => e.date === '2026-11-06').map((e) => e.time);
  assert.deepEqual(d1, ['08:00', '09:00', '10:00', '11:00']);
});

test('plano: desconta tempo já ocupado e evita sobrepor horários', () => {
  const subjects = [{ id: 'a', name: 'Civil', examDate: '2026-11-10' }];
  const occurrences = [{ date: '2026-11-06', ev: { type: 'task', time: '09:00', duration: 60 } }];
  const plan = generatePlan({ subjects, occurrences, start: '2026-11-06',
    opts: { dailyMinutes: 180, blockMinutes: 50, breakMinutes: 10, startTime: '08:00', skipWeekdays: [], reviewDayBefore: false } });
  const d1 = plan.filter((e) => e.date === '2026-11-06');
  assert.equal(d1.length, 2); // (180-60)/50 = 2
  assert.deepEqual(d1.map((e) => e.time), ['08:00', '10:10']);
});
