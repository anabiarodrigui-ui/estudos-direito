# Estudos de Direito — organizador para as provas finais

Aplicativo web (PWA) para organizar os estudos das provas finais de Direito, feito para usar principalmente em **tablet**. Ele funciona **offline**, pode ser **instalado na tela inicial** e guarda tudo **no próprio aparelho**. Não tem servidor nem login.

| Seção | O que faz |
|---|---|
| **Início** | Cartões por matéria com dias até a prova, % estudado e flashcards pendentes, mais as tarefas de hoje. |
| **Agenda** | Visões de mês, semana e dia; provas com contagem regressiva; tarefas e blocos de estudo (inclusive recorrentes); arrastar eventos; planejador diário com checklist; **Gerar plano de estudos**. |
| **Resumos** | Biblioteca de guias em Markdown por matéria: índice navegável, busca em tudo, status "já li / estudar de novo", leitor com fonte ajustável, **marca-texto com o dedo** e anotações. |
| **Cartões** | Flashcards com repetição espaçada (SM-2), gestos de deslizar, revisão rápida antes da prova, importação, geração automática a partir dos guias (local ou com IA) e estatísticas. |
| **Pomodoro** | Timer de foco ligado a uma matéria, que registra as horas estudadas. |
| **Estatísticas** | Semana a semana: horas (por dia e por matéria), flashcards revisados, taxa de acerto e tarefas concluídas. |

---

## Sumário

1. [Rodar localmente](#1-rodar-localmente)
2. [Publicar de graça (GitHub Pages ou Netlify)](#2-publicar-de-graça)
3. [Instalar no tablet](#3-instalar-no-tablet)
4. [Como usar](#4-como-usar)
5. [Formato dos guias (Markdown)](#5-formato-dos-guias-markdown)
6. [Formato dos flashcards para importar](#6-formato-dos-flashcards-para-importar)
7. [Geração automática de flashcards](#7-geração-automática-de-flashcards)
8. [Repetição espaçada (SM-2)](#8-repetição-espaçada-sm-2)
9. [Backup e segurança dos dados](#9-backup-e-segurança-dos-dados)
10. [Para quem for mexer no código](#10-para-quem-for-mexer-no-código)

---

## 1. Rodar localmente

O app não precisa de instalação nem de build. Precisa apenas ser aberto por um servidor HTTP: abrir o `index.html` com dois cliques não funciona, porque o navegador bloqueia módulos JavaScript em `file://`.

**Opção A, com Node.js (recomendada):**

```bash
git clone https://github.com/anabiarodrigui-ui/estudos-direito.git
cd estudos-direito
npm start            # ou: node scripts/serve.mjs
```

Abra **http://localhost:8080** no navegador.

**Opção B, com Python (vem instalado no macOS/Linux):**

```bash
cd estudos-direito
python3 -m http.server 8080
```

**Para testar no tablet sem publicar:** com o computador e o tablet na mesma rede Wi-Fi, rode o servidor e abra `http://IP-DO-COMPUTADOR:8080` no tablet (o IP aparece em Configurações de rede do computador). Nesse modo, a instalação como app e o uso offline podem não funcionar, porque os navegadores exigem HTTPS fora do `localhost`. Para usar de verdade, publique (passo 2).

**Testes automatizados:**

```bash
npm test             # testes unitários (Node 18+): datas, planejador, SM-2, Markdown, importação, geração de cartões
npm run test:e2e     # testes ponta a ponta num navegador simulando um tablet (precisa do Playwright: npm i -D playwright && npx playwright install chromium)
npm run test:e2e 2   # só uma etapa (1 = agenda, 2 = resumos, 3 = flashcards, 4 = extras)
```

---

## 2. Publicar de graça

### Opção A — GitHub Pages (o código já está no GitHub)

1. Junte o trabalho na branch principal: no GitHub, abra um *Pull Request* da branch `claude/direito-study-organizer-app-gpgaix` para `main` e clique em **Merge**. Outra opção é escolher essa branch diretamente no passo 4.
2. No repositório, vá em **Settings → Pages**.
3. Em **Build and deployment → Source**, escolha **Deploy from a branch**.
4. Em **Branch**, escolha `main` e a pasta **`/ (root)`**. Clique em **Save**.
5. Espere 1 a 2 minutos e recarregue a página. Aparece o endereço do site, algo como
   **`https://anabiarodrigui-ui.github.io/estudos-direito/`**.
6. Abra esse endereço no tablet e instale (passo 3).

> O repositório precisa ser **público** para usar o GitHub Pages no plano gratuito. Seus *dados* (matérias, guias, cartões) **não** vão para o GitHub: ficam só no tablet. O que fica público é apenas o código do app e os dados de exemplo.

### Opção B — Netlify (arrastar e soltar, sem GitHub)

1. Baixe o projeto como ZIP (no GitHub: **Code → Download ZIP**) e descompacte.
2. Acesse **https://app.netlify.com/drop** e crie uma conta gratuita.
3. Arraste a **pasta** `estudos-direito` para a página.
4. Pronto: o Netlify mostra um endereço `https://alguma-coisa.netlify.app`. Você pode trocar o nome em *Site configuration → Change site name*.

### Atualizações

Quando o código mudar, publique de novo do mesmo jeito. Antes, aumente o número em `CACHE_VERSION` no arquivo `sw.js` (ex.: `estudos-v1` → `estudos-v2`). Assim o tablet baixa a nova versão: o app avisa "Nova versão disponível" e basta fechar e abrir de novo.

---

## 3. Instalar no tablet

Depois de instalado, o app abre em tela cheia, como um app comum, e **funciona sem internet**. Só a geração de flashcards com IA precisa de conexão.

**iPad (Safari):**
1. Abra o endereço do site **no Safari** (no iPad, outros navegadores podem não oferecer a instalação).
2. Toque no botão **Compartilhar** (quadrado com seta para cima).
3. Escolha **Adicionar à Tela de Início** → **Adicionar**.

**Tablet Android (Chrome):**
1. Abra o endereço no **Chrome**.
2. Toque no menu **⋮** → **Instalar app** (ou **Adicionar à tela inicial**).
3. Confirme em **Instalar**.

> **Importante no iPad:** use sempre o app **pela tela inicial**. O Safari pode apagar dados de sites que ficam 7 dias sem uso, mas apps adicionados à tela inicial não sofrem essa limpeza. Mesmo assim, faça **backups** (seção 9).

---

## 4. Como usar

### Primeiros passos
1. Em **Início**, toque em **Carregar dados de exemplo** para ver o app funcionando (2 matérias, 2 guias, eventos e flashcards). Quando quiser, apague tudo em **Configurações → Dados de exemplo → Remover exemplos**: só os exemplos somem.
2. Em **Matérias** (no menu **Mais** em retrato, ou na barra lateral em paisagem), cadastre cada matéria com **nome, cor, professor(a) e data/horário da prova**.

### Agenda
- **Mês / Semana / Dia** no topo, **‹ Hoje ›** para navegar. Toque num dia para abrir o **planejador diário**.
- **+ (botão redondo)**: nova **tarefa/bloco de estudo** (horário, matéria, duração, repetir: todo dia, dias úteis ou toda semana) ou nova **prova**.
- **Arrastar:** segure o dedo sobre um evento por meio segundo e arraste até outro dia. Num evento recorrente, só aquela ocorrência é movida. Arrastar a prova de uma matéria muda a data da prova.
- **Planejador diário:** checklist do dia com barra de progresso, provas do dia em destaque e próximas provas com contagem regressiva.
- **Gerar plano:** informe quantas horas por dia, a duração dos blocos, o intervalo, o horário de início e os dias de folga. O app:
  - distribui blocos até a véspera de cada prova, dando **mais blocos às provas mais próximas** e às matérias com **menos conteúdo estudado**;
  - reserva a **véspera de cada prova para revisão final**;
  - usa os **guias ainda não lidos** como título dos blocos ("Estudar: Capítulo X"); quando eles acabam, os blocos viram "Revisão + flashcards";
  - **desconta o tempo** das tarefas que você já tem e **evita sobrepor horários**;
  - pode **substituir** um plano gerado antes, sem mexer nas suas tarefas manuais nem nos blocos já concluídos.

### Resumos (guias de estudo)
- **Importar guia:** escolha a matéria e **cole o Markdown** ou **escolha arquivos `.md`** (vários de uma vez). Marque "Separar em vários guias" para que cada `# Título` vire um capítulo. Com "Gerar flashcards automaticamente" marcado, você revisa os cartões sugeridos logo depois.
- **Busca:** o campo no topo procura em **todos os guias**. Toque num resultado para abrir o guia já no trecho.
- **Status:** "Não lido", "Já li" e "Estudar de novo". O "% estudado" da matéria é a fração de guias marcados como lidos.
- **Leitor:**
  - Ícone **T**: tamanho da letra, fonte (serifada ou sem serifa) e espaçamento.
  - Ícone **lista**: índice navegável. Em paisagem ele fica fixo ao lado.
  - **Marca-texto:** segure o dedo sobre uma palavra, ajuste as alças da seleção e toque numa **cor** na barra de baixo, ou em **Nota** para destacar com anotação. Toque num trecho destacado para mudar a cor, anotar ou remover.
  - Ícone **página**: lista de todos os destaques e notas do guia, com "Ir ao trecho" e "Copiar tudo".
  - O app lembra onde você parou de ler.
  - Menu **⋯**: editar o texto/título/matéria, copiar o Markdown ou excluir o guia.

### Flashcards
- **Estudar agora:** cartões vencidos + novos do dia (limite em Configurações; padrão 20 novos/dia). **Toque no cartão para virar** e avalie:

  | Botão | Gesto | Efeito |
  |---|---|---|
  | **Errei** | deslizar ← | volta amanhã e reaparece ainda nesta sessão |
  | **Difícil** | deslizar ↓ | intervalo menor, facilidade cai |
  | **Bom** | deslizar → | intervalo normal |
  | **Fácil** | deslizar ↑ | facilidade sobe (intervalos crescem mais rápido) |

  Embaixo de cada botão aparece em quantos dias o cartão volta.
- **Revisão rápida:** passa por **todos** os cartões do filtro, primeiro os que você mais erra, **sem mexer no agendamento**. Ideal na véspera da prova.
- **Filtros:** por matéria, por guia e por texto/tópico/tag.
- **Novo cartão / editar:** pergunta, resposta, matéria, guia, tópico e tags. Dá para reiniciar o progresso de um cartão.
- **Estatísticas:** pendentes hoje, novos, taxa de acerto (últimos 30 dias) e sequência de dias estudados.

### Pomodoro e estatísticas
- Escolha a matéria e toque em **Iniciar**. O timer continua certo mesmo trocando de tela ou bloqueando o tablet: quando o app está em outra tela, aparece uma "pílula" com o tempo no canto. Ao terminar um foco, os minutos são registrados para a matéria.
- **Pular** durante um foco registra o tempo já estudado. **Registrar tempo** permite lançar estudo feito fora do app.
- **Tempos:** ajuste foco, pausas e quantos focos até a pausa longa.
- **Estatísticas:** escolha a semana nas setas. Toque numa barra para ver o detalhe do dia; "Ver tabela da semana" mostra tudo em números.

### Configurações
Tema **automático / claro / escuro**, **backup**, cartões novos por dia, **chave da API** (opcional), dados de exemplo e **apagar tudo**.

---

## 5. Formato dos guias (Markdown)

O leitor entende o Markdown comum que outras IAs (Claude, ChatGPT, Gemini etc.) costumam produzir:

````markdown
# Título do guia                 ← título principal (vira capítulo se usar "Separar")

## 1. Seção                      ← entra no índice
### 1.1 Subseção                 ← entra no índice

Parágrafo com **negrito**, *itálico*, ~~riscado~~, `art. 422` e [links](https://www.planalto.gov.br).

- lista com marcadores
  - item aninhado (2 espaços)
1. lista numerada

> Citação / destaque (ex.: texto de lei, súmula, "cai na prova")

| Instituto | Prazo | Base legal |
|---|---|---|
| Vício redibitório (móvel) | 30 dias | art. 445 |

---                              ← linha divisória
````

Para gerar cartões melhores (seção 7): use **negrito nos termos-chave**, escreva definições no formato "**Termo** é…" ou "**Termo**: descrição", e use tabelas para comparações.

Um guia completo de exemplo está em [`exemplos/guia-exemplo-contratos.md`](exemplos/guia-exemplo-contratos.md).

**Sugestão de pedido para a IA que vai gerar os guias:**

> Crie um guia de estudo em Markdown sobre **[tema]** para a prova final de **[matéria]**. Use `#` para o título, `##` e `###` para seções, **negrito** nos conceitos-chave, definições no formato "**Termo** é…", listas para requisitos e classificações, tabelas para comparações e `>` para dispositivos legais e súmulas importantes. Cite os artigos de lei.

---

## 6. Formato dos flashcards para importar

Em **Cartões → Importar**, cole o texto ou escolha um arquivo. São aceitos quatro formatos (o app detecta sozinho):

### a) Texto `P:` / `R:` (recomendado)

```text
# Matéria: Direito Civil III — Contratos
# Tópico: Princípios contratuais

P: Qual artigo do Código Civil trata da função social do contrato?
R: Art. 421 — a liberdade contratual é exercida nos limites da função social.
Tags: princípios, art. 421

P: O que é a boa-fé objetiva?
R: Regra de conduta que impõe deveres de lealdade, cooperação e informação.
A resposta pode continuar em várias linhas.
```

- `P:` começa um cartão e `R:` começa a resposta, que pode ter várias linhas até o próximo `P:`.
- Também valem `Pergunta:` / `Resposta:` e `Q:` / `A:`.
- `# Matéria:` e `# Tópico:` são opcionais e valem para todos os cartões abaixo deles. A matéria é ligada pelo **nome** (sem diferenciar acentos/maiúsculas, aceita parte do nome). Se não achar, usa a "matéria padrão" escolhida na tela.
- `Tags:` é opcional (separadas por vírgula).

### b) Uma linha por cartão
- `pergunta<TAB>resposta<TAB>tags`: é o formato de exportação de texto do **Anki**.
- `pergunta :: resposta`

### c) JSON

```json
[
  { "pergunta": "O que é evicção?", "resposta": "Perda da coisa… (art. 447)", "materia": "Direito Civil III", "topico": "Evicção", "tags": ["art. 447"] }
]
```

Também aceita as chaves `front`/`back`/`subject`/`topic` e o formato `{ "cards": [...] }`.

Arquivos de exemplo: [`exemplos/flashcards-exemplo.txt`](exemplos/flashcards-exemplo.txt) e [`exemplos/flashcards-exemplo.json`](exemplos/flashcards-exemplo.json). Cartões com a mesma pergunta de um já existente são ignorados.

**Sugestão de pedido para a IA que vai gerar os flashcards:**

> A partir do guia abaixo, crie 30 flashcards para revisão com repetição espaçada, uma ideia por cartão, respostas curtas e fiéis ao texto, citando artigos de lei. Responda **somente** neste formato:
> ```
> # Matéria: [nome da matéria]
> # Tópico: [seção do guia]
> P: pergunta
> R: resposta
> ```

---

## 7. Geração automática de flashcards

### a) Local (offline, grátis)
Ao importar um guia, ou em **Cartões → Gerar de um guia**, ou no fim de qualquer guia, o app sugere cartões a partir de:

| Origem | Exemplo no guia | Cartão gerado |
|---|---|---|
| **Títulos** com texto logo abaixo | `## Formação do contrato` + parágrafo | "Explique: Formação do contrato" → parágrafo |
| **Definições** | "A **evicção** é a perda da coisa…" / "**Culpa** consiste na…" / "**Resolução**: extinção por…" | "O que é a evicção?" / "Em que consiste culpa?" / "O que é resolução?" |
| **Termos em negrito** | "…o Código adota a **teoria da expedição** como regra…" | "Complete: …adota a _____ como regra…" → teoria da expedição |
| **Tabelas** | linha "Forma" da tabela de classificação | "Classificação dos contratos — Critério “Forma”: espécies?" → Consensual / Formal / Real |

Antes de salvar, você vê a lista: **desmarque** o que não quiser e **edite** pergunta e resposta direto na lista. Cartões que já existem vêm desmarcados.

### b) Com IA (opcional) — Claude, da Anthropic
1. Crie uma conta em **https://console.anthropic.com**, adicione créditos e gere uma **API key** (começa com `sk-ant-`).
2. No app: **Configurações → Geração com IA** → cole a chave → **Salvar**. Se quiser, escolha o modelo: Opus 5.5 (melhor qualidade, padrão), Sonnet 5.5 (mais rápido e barato) ou Haiku 5.5 (o mais econômico).
3. Em **Gerar de um guia**, toque em **✨ Com IA (Claude)** → **Gerar com IA**. Revise e salve como no modo local.

- A chave fica **somente neste dispositivo** (no armazenamento local do navegador), **não** entra no backup e é enviada **apenas** para `api.anthropic.com`, junto com o texto do guia.
- O uso é cobrado na sua conta da Anthropic, normalmente alguns centavos de dólar por guia.
- Não use a chave em aparelhos compartilhados. Remova em **Configurações → Remover chave**.

---

## 8. Repetição espaçada (SM-2)

O app usa o algoritmo **SM-2** (SuperMemo 2). Cada cartão tem um **fator de facilidade (EF)**, que começa em 2,5, e um **intervalo** em dias:

- Botões → nota: **Errei = 1**, **Difícil = 3**, **Bom = 4**, **Fácil = 5**.
- Nota < 3 (errei): as repetições voltam a zero e o cartão volta em **1 dia**. Na sessão atual, ele reaparece daqui a alguns cartões.
- Nota ≥ 3: 1º acerto → **1 dia**; 2º → **6 dias**; depois → **intervalo × EF**.
- Depois de cada resposta: `EF' = EF + (0,1 − (5 − q) × (0,08 + (5 − q) × 0,02))`, com mínimo 1,3. "Fácil" aumenta o EF, "Difícil" reduz e "Errei" reduz bastante.

A **Revisão rápida** não altera esses valores; ela só registra acertos e erros para as estatísticas.

---

## 9. Backup e segurança dos dados

- Tudo fica no **IndexedDB** do navegador do tablet: nada é enviado para servidor nenhum. Por isso, **faça backup**.
- **Configurações → Exportar backup (JSON)** baixa um arquivo `estudos-direito-backup-AAAA-MM-DD.json` com matérias, eventos, guias, destaques, flashcards (com o progresso), revisões, sessões e configurações. A chave da API **não** entra no backup. Guarde o arquivo no Google Drive, iCloud ou e-mail.
- **Importar backup:**
  - **Substituir** apaga o que está no aparelho e restaura o backup (use para trocar de tablet ou recuperar dados).
  - **Mesclar** mantém o que existe e acrescenta/atualiza com o backup.
- A tela de Configurações mostra a data do último backup. Sugestão: exporte um backup **toda semana** e **antes das provas**.
- **Apagar tudo** (Configurações) limpa todos os dados deste aparelho. Não dá para desfazer.

---

## 10. Para quem for mexer no código

HTML/CSS/JavaScript puro com **módulos ES**, sem framework e sem etapa de build. Qualquer servidor estático serve o app.

```
index.html               página única (carrega js/app.js)
manifest.webmanifest     dados do PWA (nome, ícones, cores)
sw.js                    service worker: cache offline (aumente CACHE_VERSION ao publicar)
css/style.css            estilos (tokens de cor claro/escuro, alvos de toque ≥ 44px)
icons/                   ícones do app (SVG + PNG 192/512/maskable)
js/app.js                inicialização, navegação e roteamento (#/rota)
js/sample.js             dados de exemplo (marcados com sample: true)
js/core/                 lógica sem interface (testada no Node)
  db.js                  IndexedDB + cache em memória, configurações, backup
  dates.js               datas em "AAAA-MM-DD", formatação pt-BR
  events.js              eventos, recorrência, provas, progresso
  planner.js             gerador do plano de estudos
  srs.js                 SM-2, fila de estudo, estatísticas, sequência
  markdown.js            renderizador de Markdown próprio
  importers.js           importação de flashcards e divisão de guias
  cardgen.js             geração local de flashcards
  ai.js                  chamada à API da Anthropic (opcional)
  stats.js               estatísticas semanais
js/ui/                   ícones, modais, destaques (marca-texto), componentes
js/views/                uma tela por arquivo (dashboard, calendar, library, reader,
                         flashcards, study, pomodoro, stats, subjects, settings, more)
scripts/serve.mjs        servidor local sem dependências
tests/*.test.mjs         testes unitários (node --test)
tests/e2e/               testes ponta a ponta com Playwright (tablet 820×1180)
exemplos/                guia e flashcards de exemplo para importar
```

**Modelo de dados** (coleções no IndexedDB): `subjects`, `events`, `guides`, `highlights`, `cards`, `reviews`, `sessions`. As configurações ficam em `localStorage["ed:settings"]`.
