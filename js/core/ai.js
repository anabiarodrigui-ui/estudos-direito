/**
 * Geração de flashcards com a API da Anthropic (opcional).
 *
 * A chamada é feita direto do navegador com a chave da própria usuária, guardada só
 * no dispositivo (localStorage "ed:apiKey"). Usamos fetch (HTTP puro) porque o app é
 * estático, sem etapa de build para empacotar o SDK.
 * O cabeçalho "anthropic-dangerous-direct-browser-access" é exigido pela API para
 * aceitar chamadas vindas de um navegador.
 */

export const API_MODELS = [
  { id: 'claude-opus-5-5', label: 'Claude Opus 5.5 — melhor qualidade (padrão)', fallbacks: true },
  { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5 — mais rápido e barato', fallbacks: true },
  { id: 'claude-haiku-5-5', label: 'Claude Haiku 5.5 — o mais econômico', fallbacks: false },
];

const SYSTEM = `Você é professor(a) de Direito brasileiro e especialista em técnicas de memorização.
Crie flashcards em português do Brasil a partir do guia de estudo fornecido, para revisão com repetição espaçada antes de provas finais da graduação.
Regras:
- Uma ideia por cartão; pergunta clara e objetiva; resposta curta (até ~3 frases), precisa e fiel ao texto.
- Cubra conceitos, requisitos/elementos, classificações, prazos, distinções entre institutos, exceções, súmulas e artigos de lei citados no guia.
- Inclua cartões de comparação ("Diferencie X de Y") quando o guia trouxer contrastes ou tabelas.
- Não invente conteúdo que não esteja no guia. Não repita cartões.
- Em "topico", use o título da seção do guia de onde o cartão saiu.`;

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['cards'],
  properties: {
    cards: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['pergunta', 'resposta', 'topico'],
        properties: {
          pergunta: { type: 'string' },
          resposta: { type: 'string' },
          topico: { type: 'string' },
        },
      },
    },
  },
};

/** Monta o corpo da requisição (exportado para teste). */
export function buildRequest({ model, guideTitle, markdown, subjectName, maxCards = 40, fallbacks = true }) {
  const body = {
    model,
    max_tokens: 16000,
    system: SYSTEM,
    output_config: { effort: 'medium', format: { type: 'json_schema', schema: SCHEMA } },
    messages: [{
      role: 'user',
      content: `Matéria: ${subjectName || '(não informada)'}\nGuia: ${guideTitle}\n\nGere até ${maxCards} flashcards a partir do guia abaixo.\n\n<guia>\n${markdown}\n</guia>`,
    }],
  };
  // Se o modelo recusar por engano (classificadores de segurança), a API tenta outro modelo automaticamente.
  if (fallbacks) body.fallbacks = 'default';
  return body;
}

/**
 * Chama a API e devolve [{front, back, topic}].
 * Lança Error com mensagem em português em caso de falha.
 */
export async function generateCardsWithAI({ guideTitle, markdown, subjectName, maxCards = 40, model, apiKey, signal }) {
  apiKey ||= localStorage.getItem('ed:apiKey');
  if (!apiKey) throw new Error('Cadastre sua chave da API em Configurações.');
  const meta = API_MODELS.find((m) => m.id === model) || API_MODELS[0];

  const send = async (withFallbacks) => {
    const headers = {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2026-10-21',
      'anthropic-dangerous-direct-browser-access': 'true',
    };
    if (withFallbacks) headers['anthropic-beta'] = 'server-side-fallback-2026-07-01';
    return fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST', headers, signal,
      body: JSON.stringify(buildRequest({ model: meta.id, guideTitle, markdown, subjectName, maxCards, fallbacks: withFallbacks })),
    });
  };

  let res;
  try {
    res = await send(meta.fallbacks);
    // Se a conta/modelo não aceitar o recurso de fallback, tenta de novo sem ele.
    if (res.status === 400 && meta.fallbacks) {
      const txt = await res.clone().text();
      if (/fallback/i.test(txt)) res = await send(false);
    }
  } catch (e) {
    if (e.name === 'AbortError') throw new Error('Geração cancelada.');
    throw new Error('Sem conexão com a internet (a geração com IA precisa de rede).');
  }

  let data;
  try { data = await res.json(); } catch { data = null; }
  if (!res.ok) {
    const msg = data?.error?.message || res.statusText;
    if (res.status === 401) throw new Error('Chave da API inválida. Confira em Configurações.');
    if (res.status === 429) throw new Error('Limite de uso atingido. Tente novamente em instantes.');
    if (res.status === 529 || res.status >= 500) throw new Error('Serviço da Anthropic indisponível no momento. Tente de novo.');
    throw new Error(`Erro da API (${res.status}): ${msg}`);
  }
  if (data.stop_reason === 'refusal') throw new Error('O modelo recusou este conteúdo. Tente outro trecho ou outro modelo.');
  if (data.stop_reason === 'max_tokens') throw new Error('Resposta cortada por tamanho. Tente um guia menor ou menos cartões.');
  const text = (data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
  let parsed;
  try { parsed = JSON.parse(text); } catch { throw new Error('Não foi possível ler a resposta da IA.'); }
  return (parsed.cards || [])
    .filter((c) => c.pergunta && c.resposta)
    .map((c) => ({ front: c.pergunta.trim(), back: c.resposta.trim(), topic: (c.topico || '').trim() }));
}
