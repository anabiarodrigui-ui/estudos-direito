// Testes da etapa 2: Markdown e importação de guias.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseMarkdown, inline, slugify, plainText } from '../js/core/markdown.js';
import { splitGuides, titleFromFilename } from '../js/core/importers.js';
import { SAMPLE_GUIDE_CIVIL } from '../js/sample.js';

test('markdown: títulos, ênfase, listas, citação, tabela, código', () => {
  const md = `# Título
## Seção **um**
Texto com **negrito**, *itálico* e \`art. 422\`.
continuação

- item 1
- item 2
  - sub
1. primeiro
2. segundo

> citação
> longa

| A | B |
|---|:-:|
| 1 | 2 |

\`\`\`
<code>
\`\`\`
---`;
  const { html, toc, blocks } = parseMarkdown(md);
  assert.match(html, /<h1 id="titulo">Título<\/h1>/);
  assert.match(html, /<h2 id="secao-um">Seção <strong>um<\/strong><\/h2>/);
  assert.match(html, /<strong>negrito<\/strong>, <em>itálico<\/em> e <code>art. 422<\/code>/);
  assert.match(html, /<ul><li>item 1<\/li><li>item 2<ul><li>sub<\/li><\/ul><\/li><\/ul>/);
  assert.match(html, /<ol><li>primeiro<\/li><li>segundo<\/li><\/ol>/);
  assert.match(html, /<blockquote><p>citação longa<\/p><\/blockquote>/);
  assert.match(html, /<th style="text-align:center">B<\/th>/);
  assert.match(html, /<pre><code>&lt;code&gt;<\/code><\/pre>/);
  assert.match(html, /<hr>/);
  assert.deepEqual(toc.map((t) => t.id), ['titulo', 'secao-um']);
  assert.equal(blocks.find((b) => b.type === 'table').rows[0][1], '2');
});

test('markdown: escapa HTML e bloqueia links perigosos', () => {
  assert.equal(inline('<script>x</script>'), '&lt;script&gt;x&lt;/script&gt;');
  assert.doesNotMatch(inline('[x](javascript:alert(1))'), /href/);
  assert.match(inline('[STF](https://portal.stf.jus.br)'), /href="https:\/\/portal.stf.jus.br"/);
  assert.equal(inline('art_1_do_cc'), 'art_1_do_cc'); // sem itálico dentro de palavras
});

test('markdown: ids únicos e sem acento', () => {
  assert.equal(slugify('2.1 Funções da boa-fé'), '2-1-funcoes-da-boa-fe');
  const { toc } = parseMarkdown('## A\n## A');
  assert.deepEqual(toc.map((t) => t.id), ['a', 'a-2']);
});

test('guia de exemplo renderiza e gera texto pesquisável', () => {
  const { toc } = parseMarkdown(SAMPLE_GUIDE_CIVIL);
  assert.ok(toc.length >= 8);
  const txt = plainText(SAMPLE_GUIDE_CIVIL);
  assert.ok(txt.includes('exceptio non adimpleti contractus'));
  assert.ok(!txt.includes('**'));
});

test('importação: separar arquivo em guias por "# título"', () => {
  const g = splitGuides('intro\n# Cap 1\na\n```\n# não é título\n```\n# Cap 2\nb');
  assert.deepEqual(g.map((x) => x.title), ['Cap 1', 'Cap 2']);
  assert.match(g[0].content, /^intro/);
  assert.match(g[0].content, /# não é título/);
  assert.equal(splitGuides('## Só subtítulo\ntexto')[0].title, 'Só subtítulo');
  assert.equal(titleFromFilename('02-contratos_em-especie.md'), '02 contratos em especie');
});
