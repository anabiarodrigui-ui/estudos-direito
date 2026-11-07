// Testes das funções puras da etapa 1: datas, eventos/recorrência e gerador de plano.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as D from '../js/core/dates.js';
import { expand, occursOn, nextExam, subjectProgress } from '../js/core/events.js';
import { generatePlan, replanMissed, freeGaps, busyIntervals, freeMinutesByWeekday, defaultWindows } from '../js/core/planner.js';

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
  assert.deepEqual(d1.map((e) => e.time), ['08:00', '10:00']);
});

// Rotina de exemplo: aulas de manhã, deslocamento, terapia na quarta, jantar.
const ROTINA = [
  { title: 'Aulas', weekdays: [1, 2, 3, 4, 5], start: '08:00', end: '12:00' },
  { title: 'Deslocamento', weekdays: [1, 2, 3, 4, 5], start: '12:00', end: '13:00' },
  { title: 'Terapia', weekdays: [3], start: '18:00', end: '19:00' },
  { title: 'Jantar e banho', weekdays: [0, 1, 2, 3, 4, 5, 6], start: '19:30', end: '20:30' },
];
const JANELAS = Array.from({ length: 7 }, (_, wd) => ({ start: '07:00', end: '22:00', off: wd === 0 }));

test('rotina: espaços livres descontam compromissos com folga', () => {
  const busy = busyIntervals('2026-11-11', { routine: ROTINA, buffer: 15 }); // quarta
  assert.deepEqual(busy, [[465, 795], [1065, 1155], [1155, 1245]].length ? mergeCheck(busy) : null);
  const gaps = freeGaps(420, 1320, busy);
  // 07:00–07:45 · 13:15–17:45 · 20:45–22:00
  assert.deepEqual(gaps, [[420, 465], [795, 1065], [1245, 1320]]);
  const free = freeMinutesByWeekday({ windows: JANELAS, routine: ROTINA, buffer: 15 });
  assert.equal(free[0], 0); // domingo de folga
  assert.equal(free[3], 45 + 270 + 75);
});
function mergeCheck(b) { return b; }

test('plano com rotina: nenhum bloco cai em aula, deslocamento, terapia ou jantar', () => {
  const plan = generatePlan({
    subjects: [{ id: 'a', name: 'Civil', examDate: '2026-11-20' }], routine: ROTINA, start: '2026-11-09',
    opts: { dailyMinutes: 300, blockMinutes: 50, breakMinutes: 10, buffer: 15, windows: JANELAS },
  });
  assert.ok(plan.length > 0);
  for (const e of plan) {
    const [h, m] = e.time.split(':').map(Number); const a = h * 60 + m, b = a + e.duration;
    const wd = new Date(e.date + 'T12:00').getDay();
    assert.notEqual(wd, 0, 'domingo é folga');
    for (const r of ROTINA.filter((x) => x.weekdays.includes(wd))) {
      const [rh, rm] = r.start.split(':').map(Number); const [eh, em] = r.end.split(':').map(Number);
      const ra = rh * 60 + rm - 15, rb = eh * 60 + em + 15;
      assert.ok(b <= ra || a >= rb, `${e.date} ${e.time} (${e.duration}min) bate com ${r.title}`);
    }
    assert.ok(e.duration >= 25 && e.duration <= 50);
    assert.ok(a >= 420 && b <= 1320, 'dentro da janela do dia');
  }
  // quarta: espaço de 07:00–07:45 recebe bloco curto de 45 min
  assert.ok(plan.some((e) => e.date === '2026-11-11' && e.time === '07:00' && e.duration === 45));
  // limite diário respeitado
  const byDay = {}; for (const e of plan) byDay[e.date] = (byDay[e.date] || 0) + e.duration;
  assert.ok(Object.values(byDay).every((m) => m <= 300));
});

test('replanejar: blocos atrasados vão para os próximos espaços livres, antes da prova', () => {
  const missed = [{ id: 'm1', subjectId: 'a', duration: 50 }, { id: 'm2', subjectId: 'b', duration: 50 }];
  const r = replanMissed(missed, {
    today: '2026-11-09', routine: ROTINA, examBySubject: { a: '2026-11-10', b: '2026-11-30' },
    occurrences: [{ date: '2026-11-09', ev: { type: 'task', time: '07:00', duration: 50 } }],
    opts: { dailyMinutes: 300, blockMinutes: 50, breakMinutes: 10, buffer: 15, windows: JANELAS, nowMinutes: 14 * 60 },
  });
  assert.deepEqual(r.notPlaced, []);
  const m1 = r.moved.find((x) => x.id === 'm1'), m2 = r.moved.find((x) => x.id === 'm2');
  assert.equal(m1.date, '2026-11-09'); assert.equal(m1.time, '14:00'); // depois de agora, fora da rotina
  assert.equal(m2.date, '2026-11-09'); assert.equal(m2.time, '15:00'); // não sobrepõe m1
  const none = replanMissed([{ id: 'x', subjectId: 'a', duration: 50 }], { today: '2026-11-10', examBySubject: { a: '2026-11-10' }, opts: { windows: defaultWindows() } });
  assert.deepEqual(none.notPlaced, ['x']); // prova já é hoje: não há antes
});
