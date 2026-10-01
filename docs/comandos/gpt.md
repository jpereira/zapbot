# `/gpt` (`/ai`) · admin

Pergunta ao ChatGPT pela API da OpenAI e responde no chat. Respondendo uma
mensagem, o texto dela entra antes da pergunta. Enquanto espera a resposta, o
bot aparece como "digitando...". Sem pergunta, mostra a ajuda.

```
/gpt explique o que é SSRF em 3 linhas
/ai qual a capital da Mongólia?
/gpt resuma          (respondendo uma mensagem)
/gpt -h              → ajuda do comando
```

## Configurando a chave

O `/gpt` precisa de uma API key da OpenAI (paga por uso: crie em
[platform.openai.com/api-keys](https://platform.openai.com/api-keys)). Ela é
procurada nesta ordem:

1. `OPENAI_API_KEY` no `config/.env` (vale no próximo start);
2. o setting `openai.api.key`, que dá para trocar pelo WhatsApp sem reiniciar:
   `/set openai.api.key sk-proj-...` (exibido mascarado; `/set -reset
   openai.api.key` apaga).

Sem nenhuma das duas o `/gpt` fica **desativado** e responde `API key da
OpenAI não encontrada`. O tempo máximo de espera segue a mesma ordem:
`OPENAI_TIMEOUT_MS` no `.env` ou o setting `openai.timeout.ms` (padrão 60000,
de 5000 a 300000). Um valor inválido no `.env` é ignorado (com aviso no log) e
vale o setting. O modelo vem do `OPENAI_MODEL` (padrão `gpt-4o-mini`).

Detalhes:

- É só do dono do bot para ninguém dos grupos gastar os seus créditos.
- Erros comuns têm resposta própria: chave inválida (`🔑`), limite ou créditos
  esgotados (`💸`) e demora maior que o timeout (`⏱️`). Os outros mostram a
  mensagem da API.
- A chave nunca vai para o chat nem para o log.
- Se a resposta começar com `/`, o bot põe um `🤖` na frente, para ela não
  ser lida como comando.
