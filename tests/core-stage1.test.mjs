// Testes das funções puras da etapa 1: datas, eventos/recorrência e gerador de plano.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as D from '../js/core/dates.js';
import { expand, occursOn, nextExam, subjectProgress } from '../js/core/events.js';
import { generatePlan, replanMissed, freeGaps, busyIntervals, freeMinutesByWeekday, defaultWindows, estimateStudyMinutes, guideMinutes } from '../js/core/planner.js';

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
    guidesBySubject: { a: [{ id: 'g1', title: 'Contratos', status: 'novo', minutes: 90 }, { id: 'g2', title: 'Lido', status: 'lido', minutes: 60 }] },
    opts: { dailyMinutes: 200, breakMinutes: 10, startTime: '08:00', skipWeekdays: [0], reviewDayBefore: true },
  });
  assert.ok(plan.length > 0);
  assert.ok(plan.every((e) => e.generated && e.type === 'task'));
  assert.ok(!plan.some((e) => D.weekday(e.date) === 0), 'não deve haver blocos no domingo');
  assert.ok(!plan.some((e) => e.date >= '2026-11-20'));
  const before = plan.filter((e) => e.date < '2026-11-12');
  const min = (id) => before.filter((e) => e.subjectId === id).reduce((x, e) => x + e.duration, 0);
  assert.ok(min('a') > min('b'), `antes da 1ª prova Civil deve ter mais tempo (${min('a')} x ${min('b')})`);
  const eve = plan.filter((e) => e.date === '2026-11-11');
  assert.ok(eve[0].title.startsWith('Revisão final — Civil'));
  // o guia ocupa exatamente o tempo dele (90 min), sem bloco fixo
  const guide = plan.filter((e) => e.guideId === 'g1');
  assert.equal(guide.reduce((x, e) => x + e.duration, 0), 90);
  assert.ok(guide[0].title.startsWith('Estudar: Contratos'));
  assert.ok(!plan.some((e) => e.title.includes('Lido')), 'guias já lidos não entram');
  // sem guia pendente: "Estudar <matéria>"; sem flashcards no plano
  assert.ok(plan.some((e) => e.title === 'Estudar Penal'));
  assert.ok(plan.some((e) => e.title === 'Estudar Civil'));
  assert.ok(!plan.some((e) => /flashcard/i.test(e.title)));
  assert.ok(Object.values(plan.reduce((m, e) => ((m[e.date] = (m[e.date] || 0) + e.duration), m), {})).every((m) => m <= 200));
});

test('plano: guia maior que o horário livre é dividido em partes numeradas', () => {
  const routine = [{ title: 'Aula', weekdays: [1, 2, 3, 4, 5, 6], start: '10:00', end: '18:00' }];
  const windows = Array.from({ length: 7 }, () => ({ start: '08:00', end: '20:00', off: false }));
  const plan = generatePlan({
    subjects: [{ id: 'a', name: 'Civil', examDate: '2026-11-20' }], routine, start: '2026-11-09',
    guidesBySubject: { a: [{ id: 'g1', title: 'Obrigações', status: 'novo', minutes: 200 }] },
    opts: { dailyMinutes: 600, breakMinutes: 10, buffer: 0, windows, reviewDayBefore: false },
  });
  const parts = plan.filter((e) => e.guideId === 'g1');
  // seg: 08:00–10:00 (120) + 18:00–20:00 (80 restantes)
  assert.deepEqual(parts.map((e) => [e.date, e.time, e.duration]), [['2026-11-09', '08:00', 120], ['2026-11-09', '18:00', 80]]);
  assert.deepEqual(parts.map((e) => e.title), ['Estudar: Obrigações (parte 1 de 2)', 'Estudar: Obrigações (parte 2 de 2)']);
});

test('plano: limite de sessão opcional, desconto de tarefas e guia que não cabe', () => {
  const plan = generatePlan({
    subjects: [{ id: 'a', name: 'Civil', examDate: '2026-11-10' }], start: '2026-11-09',
    occurrences: [{ date: '2026-11-09', ev: { type: 'task', time: '09:00', duration: 60 } }],
    guidesBySubject: { a: [{ id: 'g1', title: 'Longo', status: 'novo', minutes: 500 }] },
    opts: { dailyMinutes: 180, breakMinutes: 10, startTime: '08:00', skipWeekdays: [], reviewDayBefore: false, maxSession: 50 },
  });
  // 180 − 60 já ocupados = 120 min; sessões de no máx. 50 min, desviando da tarefa das 09:00;
  // os 20 min que sobram são menos que o mínimo (25) e ficam livres
  assert.deepEqual(plan.map((e) => [e.time, e.duration]), [['08:00', 50], ['10:00', 50]]);
  assert.equal(plan.unplanned.length, 1);
  assert.equal(plan.unplanned[0].minutes, 400);
});

test('tempo de estudo estimado dos guias', () => {
  assert.equal(estimateStudyMinutes('palavra '.repeat(1000)), 15); // 10 min, mas o mínimo é 15
  assert.equal(estimateStudyMinutes(''), 15);
  assert.equal(estimateStudyMinutes('a '.repeat(2400)), 25);
  assert.equal(guideMinutes({ studyMinutes: 95, content: 'x' }), 95);
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
    guidesBySubject: { a: [{ id: 'g1', title: 'Contratos', status: 'novo', minutes: 240 }] },
    opts: { dailyMinutes: 300, breakMinutes: 10, buffer: 15, windows: JANELAS },
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
    assert.ok(e.duration >= 25, 'nenhum pedaço menor que 25 min');
    assert.ok(a >= 420 && b <= 1320, 'dentro da janela do dia');
  }
  // seg: 07:00–07:45 (45) recebe o começo do guia; 13:15–19:15 recebe o resto
  const g = plan.filter((e) => e.guideId === 'g1');
  assert.deepEqual(g.map((e) => [e.date, e.time, e.duration]), [['2026-11-09', '07:00', 45], ['2026-11-09', '13:15', 195]]);
  const byDay = {}; for (const e of plan) byDay[e.date] = (byDay[e.date] || 0) + e.duration;
  assert.ok(Object.values(byDay).every((m) => m <= 300));
});

test('replanejar: atrasados vão para os próximos horários livres, antes da prova, divididos se preciso', () => {
  const missed = [{ id: 'm1', subjectId: 'a', duration: 50 }, { id: 'm2', subjectId: 'b', duration: 50 }];
  const r = replanMissed(missed, {
    today: '2026-11-09', routine: ROTINA, examBySubject: { a: '2026-11-10', b: '2026-11-30' },
    occurrences: [{ date: '2026-11-09', ev: { type: 'task', time: '07:00', duration: 50 } }],
    opts: { dailyMinutes: 300, breakMinutes: 10, buffer: 15, windows: JANELAS, nowMinutes: 14 * 60 },
  });
  assert.deepEqual(r.notPlaced, []);
  const m1 = r.moved.find((x) => x.id === 'm1'), m2 = r.moved.find((x) => x.id === 'm2');
  assert.equal(m1.date, '2026-11-09'); assert.equal(m1.time, '14:00'); // depois de agora, fora da rotina
  assert.equal(m2.date, '2026-11-09'); assert.equal(m2.time, '15:00'); // não sobrepõe m1
  // bloco de 3h com só 1h45 livre hoje (20:45 na seg) → dividido
  const big = replanMissed([{ id: 'x', subjectId: 'b', duration: 180 }], {
    today: '2026-11-09', routine: ROTINA, examBySubject: { b: '2026-11-30' },
    opts: { dailyMinutes: 600, breakMinutes: 10, buffer: 15, windows: JANELAS, nowMinutes: 17 * 60 + 45 },
  });
  assert.equal(big.moved[0].duration + big.added.reduce((x, p) => x + p.duration, 0), 180);
  assert.ok(big.added.length >= 1);
  const none = replanMissed([{ id: 'x', subjectId: 'a', duration: 50 }], { today: '2026-11-10', examBySubject: { a: '2026-11-10' }, opts: { windows: defaultWindows() } });
  assert.deepEqual(none.notPlaced, ['x']); // prova já é hoje: não há antes
});
