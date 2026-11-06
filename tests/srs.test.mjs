// Testes do SM-2 e das estatísticas de flashcards.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newSrs, schedule, buildQueue, cardStats, streak, isNew, isDue } from '../js/core/srs.js';

test('SM-2: intervalos 1, 6 e depois × EF', () => {
  let s = newSrs();
  s = schedule(s, 4, '2026-11-01'); assert.equal(s.interval, 1); assert.equal(s.due, '2026-11-02');
  s = schedule(s, 4, '2026-11-02'); assert.equal(s.interval, 6);
  s = schedule(s, 4, '2026-11-08'); assert.equal(s.interval, 15); // 6 × 2.5
  assert.equal(s.ef, 2.5);
});

test('SM-2: fácil aumenta EF, difícil reduz, errei zera repetições', () => {
  assert.equal(schedule(newSrs(), 5, '2026-11-01').ef, 2.6);
  assert.equal(schedule(newSrs(), 3, '2026-11-01').ef, 2.36);
  const s = schedule({ ...newSrs(), reps: 4, interval: 30, ef: 2.5, last: '2026-10-01' }, 1, '2026-11-01');
  assert.equal(s.reps, 0); assert.equal(s.interval, 1); assert.equal(s.lapses, 1);
  assert.equal(s.ef, 1.96);
  let low = { ...newSrs(), ef: 1.3 };
  assert.equal(schedule(low, 1, '2026-11-01').ef, 1.3); // mínimo
});

test('fila: vencidos primeiro e limite de novos', () => {
  const cards = [
    { id: 'n1', createdAt: 1, srs: newSrs() }, { id: 'n2', createdAt: 2, srs: newSrs() }, { id: 'n3', createdAt: 3, srs: newSrs() },
    { id: 'd1', srs: { ...newSrs(), last: '2026-11-01', due: '2026-11-05' } },
    { id: 'd0', srs: { ...newSrs(), last: '2026-11-01', due: '2026-11-03' } },
    { id: 'f', srs: { ...newSrs(), last: '2026-11-01', due: '2026-11-30' } },
  ];
  const q = buildQueue(cards, '2026-11-06', { newLimit: 2, newSeenToday: 1 });
  assert.deepEqual(q.map((c) => c.id), ['d0', 'd1', 'n1']);
  assert.ok(isNew(cards[0])); assert.ok(isDue(cards[3], '2026-11-06')); assert.ok(!isDue(cards[5], '2026-11-06'));
});

test('estatísticas e sequência de dias', () => {
  const st = cardStats([{ srs: newSrs() }, { srs: { ...newSrs(), last: '2026-11-01', due: '2026-11-02' } }],
    [{ date: '2026-11-06', grade: 4 }, { date: '2026-11-05', grade: 1 }], '2026-11-06');
  assert.deepEqual(st, { total: 2, novos: 1, pendentes: 1, acerto: 50, revisadosHoje: 1 });
  assert.equal(streak(['2026-11-06', '2026-11-05', '2026-11-04', '2026-11-01'], '2026-11-06'), 3);
  assert.equal(streak(['2026-11-05', '2026-11-04'], '2026-11-06'), 2); // hoje ainda não estudou
  assert.equal(streak(['2026-11-03'], '2026-11-06'), 0);
});
