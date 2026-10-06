# `/gpt` (`/ai`) · admin

Pergunta ao ChatGPT pela API da OpenAI e responde no chat. Respondendo uma
mensagem, o texto dela entra antes da pergunta. Enquanto espera a resposta, o
bot aparece como "digitando...". Sem pergunta, mostra a ajuda.

```
/gpt explique o que é SSRF em 3 linhas
/ai qual a capital da Mongólia?
/gpt resuma          (respondendo uma mensagem)
/gpt -m              → modelo atual e os aceitos
/gpt -m gpt-6-luna   → troca o modelo
/gpt -h              → ajuda do comando
```

| Opção | Valor | Descrição |
|---|---|---|
| `-model`, `-m` | `[modelo]` | Sem modelo, mostra o atual e a lista dos aceitos; com modelo, troca (setting `openai.api.model`) |

## Escolhendo o modelo

O modelo vem do `OPENAI_MODEL` no `config/.env` ou, se ele estiver vazio, do
setting `openai.api.model` (padrão `gpt-4o-mini`). O `/gpt -m <modelo>` e o
`/set openai.api.model <modelo>` trocam o setting na hora; com o
`OPENAI_MODEL` preenchido, ele continua tendo prioridade (o bot avisa).

O bot usa o endpoint `v1/chat/completions`. A lista de IDs aceitos fica em
`src/openai.js`; `/gpt -m` mostra essa lista e o modelo selecionado.

| Família | IDs aceitos |
|---|---|
| GPT-6 | `gpt-6-astra`, `gpt-6.1-sol`, `gpt-6-sol`, `gpt-6-luna` |
| GPT-5.6 | `gpt-5.6-sol`, `gpt-5.6-terra`, `gpt-5.6-luna` |
| GPT-5 | `gpt-5.5`, `gpt-5.4`, `gpt-5.4-mini`, `gpt-5.4-nano`, `gpt-5.2`, `gpt-5.1` |
| GPT-4 | `gpt-4.1`, `gpt-4.1-mini`, `gpt-4o`, `gpt-4o-mini` |

A disponibilidade depende da conta usada pela API. Consulte os
[modelos](https://developers.openai.com/api/docs/models/all) e os
[preços da OpenAI](https://developers.openai.com/api/docs/pricing) para escolher.

## Configurando a chave

O `/gpt` precisa de uma API key da OpenAI (paga por uso: crie em
[platform.openai.com/api-keys](https://platform.openai.com/api-keys)). Ela é
procurada nesta ordem:

1. `OPENAI_API_KEY` no `config/.env` (vale no próximo start);
2. o setting `openai.api.key`, que dá para trocar pelo WhatsApp sem reiniciar:
   `/set openai.api.key sk-proj-...` (exibido mascarado; `/set -reset
   openai.api.key` apaga).

Sem nenhuma das duas, perguntas respondem `API key da OpenAI não encontrada`.
A consulta e a configuração do modelo continuam disponíveis. O tempo máximo de espera segue a mesma ordem:
`OPENAI_TIMEOUT_MS` no `.env` ou o setting `openai.timeout.ms` (padrão 60000,
de 5000 a 300000). Um valor inválido no `.env` é ignorado (com aviso no log) e
vale o setting. Para o modelo, veja [Escolhendo o modelo](#escolhendo-o-modelo).

Detalhes:

- É restrito ao dono e aos admins extras (`+o`).
- Erros comuns têm resposta própria: chave inválida (`🔑`), limite ou créditos
  esgotados (`💸`) e demora maior que o timeout (`⏱️`). Os outros mostram a
  mensagem da API.
- A chave nunca vai para o chat nem para o log.
- Se a resposta começar com `/`, o bot põe um `🤖` na frente, para ela não
  ser lida como comando.
