# `/gpt` (`/ai`) · admin

Role `admin`: só você e os admins extras. O dono libera a uma pessoa ou grupo com
`/bot +u +cmd /gpt` ([Delegando](index.md#delegando-um-comando-admin)).
Quem recebe só pergunta: o `-model` (ver e trocar o modelo) e o `-usage`, `-u` (consumo e limites) são do
dono e dos admins.

Pergunta ao ChatGPT pela API da OpenAI e responde no chat. Respondendo uma mensagem, o texto dela
entra antes da pergunta; respondendo uma **foto**, ela vai junto e o ChatGPT a vê (veja
[Com foto](#com-foto)); respondendo um **áudio**, ele é transcrito (veja [Com áudio](#com-áudio)); com `-voz`, o texto vira
uma nota de voz de robô (veja [Voz](#voz--voz)). Enquanto espera a resposta, o bot aparece como "digitando...". Sem
pergunta, mostra a ajuda.

```text
/gpt explique o que é SSRF em 3 linhas
/ai qual a capital da Mongólia?
/gpt resuma          (respondendo uma mensagem)
/gpt qual a raça desse cachorro?   (respondendo uma foto)
/gpt agora transcreva isso         (respondendo um áudio)
/gpt resuma esse áudio             (respondendo um áudio)
/gpt -voz exterminar todos os humanos   → responde uma nota de voz de robô
/gpt -m              → modelo atual e os aceitos
/gpt -m gpt-6-luna   → troca o modelo
/gpt -usage          → consumo dos últimos 7 dias e os limites de agora (só dono e admins)
/gpt -u 30           → (atalho) o consumo dos últimos 30 dias
/gpt -h              → ajuda do comando
```

| Opção | Valor | Descrição |
|---|---|---|
| `-model`, `-m` | `[modelo]` | Só dono e admins. Sem modelo, mostra o atual e a lista dos aceitos; com modelo, troca (setting `openai.api.model`) |
| `-voz`, `-v` | `[texto]` | Responde uma nota de voz de robô com o texto (ou com o da mensagem respondida). Veja [Voz](#voz--voz) |
| `-usage`, `-u` | `[dias]` | Só dono e admins. O consumo dos últimos dias (padrão 7, até 31) e os limites de agora. Veja [Consumo e limites](#consumo-e-limites--usage) |

## Com foto

Respondendo uma foto (ou figurinha) com o `/gpt`, o bot baixa a imagem e a manda junto da pergunta
para o modelo, que a vê. O texto vem da legenda da foto (se tiver) e do que você digitou, nessa
ordem. Sem pergunta nenhuma, o ChatGPT descreve a foto.

```text
(respondendo a foto de um cachorro)
/gpt qual a raça desse cachorro?
🤖 Parece um labrador retriever, pelo focinho e pelo pelo curto...
```

- Valem JPEG, PNG, WebP e GIF (sem animação), até 15 MB. Outro formato, imagem que já expirou no
  WhatsApp ou grande demais respondem com um aviso, e nada é enviado à OpenAI.
- Vídeo, áudio e documento não são imagens: o `/gpt` usa só o texto (a legenda) deles.
- O modelo precisa ler imagens (os da lista do `-m` leem). A foto passa pelo servidor da OpenAI,
  como qualquer pergunta; ela não fica salva no banco do bot.

## Com áudio

Respondendo um áudio ou uma nota de voz com o `/gpt`, o bot baixa o áudio e o transcreve pela API de
transcrição da OpenAI (`v1/audio/transcriptions`), no idioma que ela detectar:

```text
(respondendo uma nota de voz)
/gpt agora transcreva isso
🤖 Transcrição:
oi, tudo bem? te ligo mais tarde, só queria confirmar o horário da reunião.
```

- **Sem pergunta**, ou só com "transcreva" (até 6 palavras começando em `transcrev`: "transcreve",
  "agora transcreva isso"), responde a transcrição como ela saiu.
- **Com outra pergunta** ("resuma", "traduza para o inglês", "quais são os combinados?"), o bot manda a
  pergunta e a transcrição para o chat e responde em cima dela.
- O modelo de transcrição é o setting `openai.transcribe.model` (`whisper-1`; também
  `gpt-4o-mini-transcribe` e `gpt-4o-transcribe`): `/set openai.transcribe.model gpt-4o-mini-transcribe`.
- Valem ogg (a nota de voz do WhatsApp), mp3, m4a, wav, webm e flac, até 25 MB. Outro formato (como
  aac puro), áudio expirado ou grande demais respondem com um aviso, e nada é enviado à OpenAI. Áudio sem
  fala responde `Não ouvi fala nenhuma nesse áudio`.
- A transcrição é cobrada por minuto de áudio, e o áudio passa pelo servidor da OpenAI; ele não fica
  salvo no banco do bot.

## Voz (`-voz`)

O `/gpt -voz <texto>` pede à OpenAI (`v1/audio/speech`) uma voz para o texto e responde com uma **nota de
voz** (Ogg/Opus, como as do WhatsApp). O estilo padrão é a voz de robô.

```text
/gpt -voz exterminar todos os humanos          → a nota de voz, em voz de robô
(respondendo um texto)  /gpt -voz              → fala o texto da mensagem respondida
```

- **Sem texto digitado**, fala o da mensagem respondida; com texto digitado, fala o digitado. O `-voz` pode
  vir em qualquer lugar do texto. Até 4096 caracteres.
- Três settings escolhem como soa: `openai.tts.model` (`gpt-4o-mini-tts`, `tts-1` ou `tts-1-hd`),
  `openai.tts.voice` (`onyx`, o padrão, ou `alloy`, `ash`, `ballad`, `coral`, `echo`, `fable`, `nova`,
  `sage`, `shimmer`, `verse`) e `openai.tts.instructions` (o estilo: o padrão pede voz de robô; ex.:
  `/set openai.tts.instructions Fale como um locutor de rádio animado`). Só o `gpt-4o-mini-tts` segue o estilo:
  com o `tts-1`, a voz sai normal.
- A voz é cobrada por caractere, e o texto passa pelo servidor da OpenAI.

## Consumo e limites (`-usage`)

O `/gpt -usage [dias]` junta duas consultas à OpenAI. Só o dono e os admins usam, mesmo que o `/gpt`
tenha sido liberado a um usuário.

**Consumo** (Usage API, com a chave de **admin**): os tokens de entrada, de saída e de cache, e as
requisições, dos últimos dias (padrão 7, até 31), por dia e por modelo. É o equivalente a:

```bash
curl "https://api.openai.com/v1/organization/usage/completions?start_time=<7 dias atrás>&bucket_width=1d&limit=7&group_by[]=model" \
  -H "Authorization: Bearer $OPENAI_ADMIN_KEY"
```

A Usage API não aceita a chave normal: precisa de uma Admin key (`sk-admin-...`, criada em
platform.openai.com › Organization › Admin keys), no `OPENAI_ADMIN_KEY` do `config/.env` ou no setting
`openai.admin.key` (`/set openai.admin.key sk-admin-...`, exibido mascarado). Os dias são em UTC.

**Limites de agora** (chave normal): o bot faz uma chamada mínima ao chat (16 tokens de saída no
máximo, ou seja, gasta quase nada) e lê os cabeçalhos `x-ratelimit-*` da resposta: o limite, o que
ainda resta na janela atual e quando reseta, de tokens e de requisições do modelo em uso.

```text
/gpt -usage
📊 Consumo da OpenAI — últimos 7 dias
🔢 3.560 tokens · entrada 3.050 (cache 400) · saída 510
🔁 13 requisições

📅 Por dia (UTC)
• 07/11 · 1.260 tokens · 6 req
• 08/11 · 2.300 tokens · 7 req

🧠 Por modelo
• gpt-4o-mini · 3.500 tokens · 12 req
• gpt-6-sol · 60 tokens · 1 req

⏱️ Limites agora — gpt-4o-mini
• tokens: 199.984 de 200.000 · reseta em 6ms
• requisições: 4.999 de 5.000 · reseta em 12ms
```

- **Sem a chave de admin**: sai só os limites, com a dica de como configurar. **Chave de admin
  recusada** (401 ou 403): o aviso de que a Usage API pede uma Admin key, e os limites saem do mesmo
  jeito.
- **Sem nenhuma chave**: `⚠️ API key da OpenAI não encontrada`.
- Não há limites por projeto aqui: o endpoint `organization/projects/<id>/rate_limits` precisa do id
  do projeto, e os cabeçalhos já mostram o limite que vale para a chave em uso.

## Escolhendo o modelo

O modelo vem do `OPENAI_MODEL` no `config/.env` ou, se ele estiver vazio, do setting
`openai.api.model` (padrão `gpt-4o-mini`). O `/gpt -m <modelo>` e o `/set openai.api.model <modelo>`
trocam o setting na hora; com o `OPENAI_MODEL` preenchido, ele continua tendo prioridade (o bot
avisa).

O bot usa o endpoint `v1/chat/completions`. A lista de IDs aceitos fica em `src/openai.js`;
`/gpt -m` mostra essa lista e o modelo selecionado.

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
[platform.openai.com/api-keys](https://platform.openai.com/api-keys)). Ela é procurada nesta ordem:

1. `OPENAI_API_KEY` no `config/.env` (vale no próximo start);
2. o setting `openai.api.key`, que dá para trocar pelo WhatsApp sem reiniciar:
   `/set openai.api.key sk-proj-...` (exibido mascarado; `/set -reset openai.api.key` apaga).

Sem nenhuma das duas, perguntas respondem `API key da OpenAI não encontrada`. A consulta e a
configuração do modelo continuam disponíveis. O tempo máximo de espera segue a mesma ordem:
`OPENAI_TIMEOUT_MS` no `.env` ou o setting `openai.timeout.ms` (padrão 60000, de 5000 a 300000). Um
valor inválido no `.env` é ignorado (com aviso no log) e vale o setting. Para o modelo, veja
[Escolhendo o modelo](#escolhendo-o-modelo).

Detalhes:

- É restrito ao dono e aos admins extras (`+a`); o dono pode liberar a um usuário (`+u +cmd /gpt`).
- Erros comuns têm resposta própria: chave inválida (`🔑`), limite ou créditos esgotados (`💸`) e
  demora maior que o timeout (`⏱️`). Os outros mostram a mensagem da API.
- A chave nunca vai para o chat nem para o log.
- Toda resposta de sucesso começa com `🤖`. Isso também evita que uma resposta que comece com `/`
  seja lida como comando.
