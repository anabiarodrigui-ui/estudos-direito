/**
 * Dados de exemplo para testar o app. Todos os itens recebem `sample: true`,
 * para poderem ser removidos depois sem afetar os dados da usuária.
 */
import * as db from './core/db.js';
import { todayISO, addDays } from './core/dates.js';
import { newSrs, schedule } from './core/srs.js';
import { toast } from './ui/dom.js';

export const SAMPLE_GUIDE_CIVIL = `# Teoria Geral dos Contratos

> Guia de revisão para a prova final de Direito Civil III. Base legal: Código Civil (Lei 10.406/2002), arts. 421 a 480.

## 1. Conceito

**Contrato** é o negócio jurídico bilateral (ou plurilateral) pelo qual as partes, por acordo de vontades, criam, modificam ou extinguem relações jurídicas de natureza patrimonial.

Todo contrato é um negócio jurídico, mas nem todo negócio jurídico é contrato (ex.: o testamento é negócio jurídico unilateral).

## 2. Princípios contratuais

- **Autonomia privada**: liberdade de contratar, de escolher com quem contratar e de definir o conteúdo do contrato, dentro dos limites da lei.
- **Força obrigatória** (*pacta sunt servanda*): o contrato faz lei entre as partes e deve ser cumprido.
- **Relatividade dos efeitos**: o contrato, em regra, só produz efeitos entre as partes que o celebraram.
- **Função social do contrato** (art. 421): a liberdade contratual é exercida nos limites da função social do contrato.
- **Boa-fé objetiva** (art. 422): os contratantes devem guardar, na conclusão e na execução do contrato, os princípios de probidade e boa-fé.

### 2.1 Funções da boa-fé objetiva

1. Função **interpretativa** (art. 113): os negócios jurídicos devem ser interpretados conforme a boa-fé.
2. Função **de controle** (art. 187): comete ato ilícito quem excede manifestamente os limites impostos pela boa-fé.
3. Função **integrativa** (art. 422): cria deveres anexos — informação, cooperação, lealdade e proteção.

A **supressio** consiste na perda de um direito pelo seu não exercício por tempo prolongado, gerando na outra parte a legítima expectativa de que não seria mais exercido.

O **venire contra factum proprium** é a vedação ao comportamento contraditório.

## 3. Formação do contrato

A **proposta** (ou oferta) obriga o proponente, se o contrário não resultar dos termos dela, da natureza do negócio ou das circunstâncias do caso (art. 427).

A **aceitação** é a manifestação de vontade do destinatário da proposta que adere a ela. Aceitação fora do prazo, com adições, restrições ou modificações, importa **nova proposta** (art. 431).

Entre ausentes, o Código adota a **teoria da expedição** como regra: o contrato se torna perfeito desde que a aceitação é expedida (art. 434).

## 4. Classificação dos contratos

| Critério | Espécies | Exemplo |
|---|---|---|
| Obrigações das partes | Unilateral / Bilateral | Doação pura / Compra e venda |
| Vantagens | Gratuito / Oneroso | Comodato / Locação |
| Equivalência das prestações | Comutativo / Aleatório | Compra e venda / Seguro |
| Forma | Consensual / Formal / Real | Compra e venda de móvel / Fiança / Mútuo |
| Negociação | Paritário / De adesão | Contrato entre empresas / Contrato bancário |

Nos contratos de adesão, as cláusulas ambíguas ou contraditórias devem ser interpretadas da forma mais favorável ao aderente (art. 423).

## 5. Exceção do contrato não cumprido

A **exceptio non adimpleti contractus** é a defesa pela qual, nos contratos bilaterais, nenhum dos contratantes, antes de cumprida a sua obrigação, pode exigir o implemento da do outro (art. 476).

## 6. Vícios redibitórios e evicção

**Vícios redibitórios** são defeitos ocultos da coisa recebida em contrato comutativo, que a tornam imprópria ao uso a que é destinada ou lhe diminuem o valor (art. 441).

- O adquirente pode **rejeitar a coisa** (ação redibitória) ou pedir **abatimento no preço** (ação estimatória ou *quanti minoris*) — art. 442.
- Prazo decadencial: **30 dias** para móveis e **1 ano** para imóveis, contados da entrega efetiva (art. 445).

**Evicção** é a perda da coisa, pelo adquirente, em virtude de decisão judicial ou ato administrativo que a atribui a terceiro por direito anterior ao contrato (art. 447).

## 7. Extinção do contrato

- **Resolução**: extinção por inadimplemento ou por onerosidade excessiva (arts. 475 e 478).
- **Resilição**: extinção pela vontade de uma (unilateral, denúncia) ou de ambas as partes (bilateral, distrato) — arts. 472 e 473.
- **Rescisão**: termo usado para a extinção por lesão ou estado de perigo.

A **teoria da imprevisão** permite a resolução ou revisão do contrato de execução continuada ou diferida quando a prestação de uma das partes se torna excessivamente onerosa, com extrema vantagem para a outra, em virtude de acontecimentos extraordinários e imprevisíveis (art. 478).
`;

export const SAMPLE_GUIDE_PENAL = `# Teoria do Crime — Conceito Analítico

## Conceito analítico de crime

Pela teoria **tripartida**, adotada pela doutrina majoritária, crime é o **fato típico, ilícito e culpável**.

## Fato típico

O fato típico é composto por quatro elementos:

1. **Conduta** (ação ou omissão, dolosa ou culposa);
2. **Resultado**;
3. **Nexo causal** (art. 13 do CP — teoria da equivalência dos antecedentes);
4. **Tipicidade** (formal e material).

**Dolo** é a vontade consciente de realizar os elementos do tipo penal (art. 18, I).

**Culpa** consiste na inobservância do dever objetivo de cuidado, manifestada por imprudência, negligência ou imperícia (art. 18, II).

## Ilicitude (antijuridicidade)

As **excludentes de ilicitude** estão no art. 23 do CP:

- estado de necessidade (art. 24);
- legítima defesa (art. 25);
- estrito cumprimento de dever legal;
- exercício regular de direito.

## Culpabilidade

Elementos da culpabilidade (teoria normativa pura):

| Elemento | Excludente |
|---|---|
| Imputabilidade | Menoridade, doença mental, embriaguez completa por caso fortuito |
| Potencial consciência da ilicitude | Erro de proibição inevitável (art. 21) |
| Exigibilidade de conduta diversa | Coação moral irresistível e obediência hierárquica (art. 22) |

> Atenção: na prova, diferencie **erro de tipo** (exclui o dolo — art. 20) de **erro de proibição** (afeta a culpabilidade — art. 21).
`;

const SAMPLE_CARDS = {
  civil: [
    ['O que diz o princípio da força obrigatória dos contratos?', 'O contrato faz lei entre as partes (pacta sunt servanda) e deve ser cumprido.', 'Princípios contratuais'],
    ['Qual artigo do CC consagra a boa-fé objetiva nos contratos?', 'Art. 422: os contratantes devem guardar, na conclusão e na execução do contrato, os princípios de probidade e boa-fé.', 'Princípios contratuais'],
    ['Quais são as três funções da boa-fé objetiva?', 'Interpretativa (art. 113), de controle (art. 187) e integrativa (art. 422 — deveres anexos).', 'Funções da boa-fé objetiva'],
    ['Aceitação fora do prazo ou com modificações tem que efeito?', 'Importa nova proposta (art. 431).', 'Formação do contrato'],
    ['Qual o prazo decadencial para reclamar de vício redibitório?', '30 dias para bens móveis e 1 ano para imóveis, contados da entrega efetiva (art. 445).', 'Vícios redibitórios e evicção'],
    ['Diferencie resolução de resilição.', 'Resolução: extinção por inadimplemento ou onerosidade excessiva. Resilição: extinção pela vontade de uma ou de ambas as partes (denúncia ou distrato).', 'Extinção do contrato'],
  ],
  penal: [
    ['Pela teoria tripartida, o que é crime?', 'Fato típico, ilícito e culpável.', 'Conceito analítico de crime'],
    ['Quais os elementos do fato típico?', 'Conduta, resultado, nexo causal e tipicidade.', 'Fato típico'],
    ['Quais são as excludentes de ilicitude do art. 23 do CP?', 'Estado de necessidade, legítima defesa, estrito cumprimento de dever legal e exercício regular de direito.', 'Ilicitude (antijuridicidade)'],
    ['Erro de tipo × erro de proibição: qual a diferença?', 'Erro de tipo exclui o dolo (art. 20); erro de proibição afeta a culpabilidade — se inevitável, isenta de pena (art. 21).', 'Culpabilidade'],
  ],
};

export async function loadSample() {
  const t = todayISO();
  const civil = await db.put('subjects', { name: 'Direito Civil III — Contratos', color: '#b83a6e', teacher: 'Prof.ª Helena Duarte', examDate: addDays(t, 12), examTime: '19:00', sample: true });
  const penal = await db.put('subjects', { name: 'Direito Penal I', color: '#2f4fc0', teacher: 'Prof. Ricardo Nunes', examDate: addDays(t, 19), examTime: '08:30', sample: true });

  const g1 = await db.put('guides', { subjectId: civil.id, title: 'Teoria Geral dos Contratos', content: SAMPLE_GUIDE_CIVIL, status: 'novo', order: 0, sample: true });
  const g2 = await db.put('guides', { subjectId: penal.id, title: 'Teoria do Crime — Conceito Analítico', content: SAMPLE_GUIDE_PENAL, status: 'lido', order: 0, sample: true });

  // alguns cartões já revisados (com histórico), outros novos
  const cards = [];
  const reviews = [];
  for (const [key, subj, guide] of [['civil', civil, g1], ['penal', penal, g2]]) {
    SAMPLE_CARDS[key].forEach(([front, back, topic], i) => {
      let srs = newSrs();
      if (i % 2 === 0) {
        const d = addDays(t, -3);
        srs = schedule(srs, 4, d);
        reviews.push({ cardId: null, subjectId: subj.id, date: d, grade: 4, sample: true, _i: cards.length });
      }
      cards.push({ subjectId: subj.id, guideId: guide.id, front, back, topic, tags: [topic], srs, sample: true });
    });
  }
  await db.putMany('cards', cards);
  for (const r of reviews) { r.cardId = cards[r._i].id; delete r._i; }
  await db.putMany('reviews', reviews);

  await db.putMany('events', [
    { type: 'task', title: 'Ler: princípios contratuais', subjectId: civil.id, date: t, time: '09:00', duration: 50, done: true, doneAt: t, notes: '', recurrence: null, sample: true },
    { type: 'task', title: 'Flashcards de Penal', subjectId: penal.id, date: t, time: '10:00', duration: 30, done: false, notes: '', recurrence: null, sample: true },
    { type: 'task', title: 'Revisar excludentes de ilicitude', subjectId: penal.id, date: addDays(t, 1), time: '14:00', duration: 50, done: false, notes: '', recurrence: null, sample: true },
    { type: 'task', title: 'Revisão rápida diária (flashcards)', subjectId: '', date: t, time: '21:00', duration: 20, done: false, notes: 'Tarefa recorrente de exemplo', recurrence: { freq: 'weekdays', until: '' }, doneDates: [], skipDates: [], sample: true },
  ]);
  await db.putMany('sessions', [
    { subjectId: civil.id, date: addDays(t, -1), minutes: 50, start: Date.now() - 86400000, sample: true },
    { subjectId: penal.id, date: addDays(t, -2), minutes: 25, start: Date.now() - 2 * 86400000, sample: true },
  ]);
  toast('Dados de exemplo carregados');
}

export async function removeSample() {
  for (const c of db.COLLECTIONS) {
    const ids = db.where(c, (x) => x.sample).map((x) => x.id);
    if (ids.length) await db.removeMany(c, ids);
  }
}
