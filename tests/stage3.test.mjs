// Testes da etapa 3: importação e geração local de flashcards; requisição à API.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseFlashcards } from '../js/core/importers.js';
import { generateCards, sentences } from '../js/core/cardgen.js';
import { buildRequest } from '../js/core/ai.js';
import { SAMPLE_GUIDE_CIVIL, SAMPLE_GUIDE_PENAL } from '../js/sample.js';

test('importar P:/R: com matéria, tópico, tags e resposta em várias linhas', () => {
  const c = parseFlashcards(`# Matéria: Civil
# Tópico: Boa-fé
P: Pergunta 1?
R: Resposta 1
continua aqui
Tags: a, b

P: Pergunta 2?
R: Resposta 2

# Tópico: Contratos
Pergunta: Pergunta 3?
Resposta: Resposta 3`);
  assert.equal(c.length, 3);
  assert.deepEqual(c[0], { front: 'Pergunta 1?', back: 'Resposta 1\ncontinua aqui', subject: 'Civil', topic: 'Boa-fé', tags: ['a', 'b'] });
  assert.equal(c[2].topic, 'Contratos');
});

test('importar TAB (Anki), "::" e JSON', () => {
  assert.equal(parseFlashcards('a?\tb\nc?\td\ttag1').length, 2);
  assert.deepEqual(parseFlashcards('a? :: b')[0].back, 'b');
  const j = parseFlashcards(JSON.stringify([{ pergunta: 'x?', resposta: 'y', materia: 'Penal', tags: ['t'] }, { front: 'f', back: 'b' }, { pergunta: 'sem resposta' }]));
  assert.equal(j.length, 2);
  assert.equal(j[0].subject, 'Penal');
  assert.equal(parseFlashcards(JSON.stringify({ cards: [{ pergunta: 'p', resposta: 'r' }] })).length, 1);
});

test('frases: não quebra em "art." nem em números', () => {
  assert.deepEqual(sentences('Conforme o art. 422 do CC. A boa-fé é dever. Prazo de 1.5 ano.'), ['Conforme o art. 422 do CC.', 'A boa-fé é dever.', 'Prazo de 1.5 ano.']);
});

test('geração local: títulos, definições, negrito e tabelas', () => {
  const cards = generateCards(SAMPLE_GUIDE_CIVIL);
  const fronts = cards.map((c) => c.front);
  assert.ok(cards.length >= 20, `poucos cartões: ${cards.length}`);
  assert.ok(fronts.includes('Explique: Princípios contratuais'));
  assert.ok(fronts.includes('O que é evicção?'));
  assert.ok(fronts.includes('Em que consiste a supressio?'));
  assert.ok(fronts.some((f) => f.startsWith('Complete:') && f.includes('_____')));
  assert.ok(cards.some((c) => c.source === 'tabela' && c.back === 'Consensual / Formal / Real'));
  assert.equal(new Set(fronts).size, fronts.length, 'sem repetidos');
  assert.ok(cards.every((c) => c.front && c.back && !c.back.includes('**')));
  const penal = generateCards(SAMPLE_GUIDE_PENAL).map((c) => c.front);
  assert.ok(penal.includes('O que é dolo?'));
  assert.ok(penal.includes('Em que consiste culpa?'));
  assert.ok(!penal.some((f) => f.startsWith('O que é o fato típico')), 'não é definição');
  assert.ok(!penal.includes('Explique: Atenção'));
});

test('requisição à API da Anthropic: modelo, saída estruturada e fallbacks', () => {
  const r = buildRequest({ model: 'claude-opus-5-5', guideTitle: 'G', markdown: '# x', subjectName: 'Civil', maxCards: 10 });
  assert.equal(r.model, 'claude-opus-5-5');
  assert.equal(r.output_config.format.type, 'json_schema');
  assert.deepEqual(r.output_config.format.schema.properties.cards.items.required, ['pergunta', 'resposta', 'topico']);
  assert.equal(r.fallbacks, 'default');
  assert.ok(r.messages[0].content.includes('<guia>\n# x\n</guia>'));
  assert.equal(buildRequest({ model: 'claude-haiku-5-5', guideTitle: 'G', markdown: '', fallbacks: false }).fallbacks, undefined);
});
