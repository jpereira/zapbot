# `/gpt` (`/ai`) · admin

Role `admin`: só você e os admins extras. O dono libera a uma pessoa ou grupo com
`/bot +u +cmd /gpt` ([Delegando](index.md#delegando-um-comando-admin)).
Quem recebe só pergunta: o `-model` (ver e trocar o modelo) e o `-usage`, `-u` (consumo e limites) são do
dono e dos admins.

Pergunta ao ChatGPT pela API da OpenAI e responde no chat. Respondendo uma mensagem, o texto dela
entra antes da pergunta; respondendo uma **foto**, ela vai junto e o ChatGPT a vê (veja
[Com foto](#com-foto)); respondendo um **áudio**, ele é transcrito (veja [Com áudio](#com-áudio)); com `-voz`, o texto vira
uma nota de voz de robô (veja [Voz](#voz--voz)); com `-img` e `-gif`, ele cria uma imagem e um GIF (veja
[Imagem e GIF](#imagem-e-gif--img--gif)). Enquanto espera a resposta, o bot aparece como "digitando...". Sem
pergunta, mostra a ajuda.

```text
/gpt explique o que é SSRF em 3 linhas
/ai qual a capital da Mongólia?
/gpt resuma          (respondendo uma mensagem)
/gpt qual a raça desse cachorro?   (respondendo uma foto)
/gpt agora transcreva isso         (respondendo um áudio)
/gpt resuma esse áudio             (respondendo um áudio)
/gpt -voz exterminar todos os humanos   → responde uma nota de voz de robô
/gpt -img um robô nadando em aquarela   → cria uma imagem (só dono e admins)
/gpt gere um gif animado dele nadando   → respondendo uma foto: um GIF (só dono e admins)
/gpt -m              → os modelos por uso (perguntas, imagens, áudio, voz), com o atual
/gpt -m gpt-6-luna   → troca o modelo das perguntas
/gpt -m gpt-image-2.6-flare -gif   → troca o modelo das imagens e do GIF
/gpt -usage          → consumo dos últimos 7 dias e os limites de agora (só dono e admins)
/gpt -u 30           → (atalho) o consumo dos últimos 30 dias
/gpt -h              → ajuda do comando
```

| Opção | Valor | Descrição |
|---|---|---|
| `-model`, `-m` | `[modelo]` | Só dono e admins. Lista os modelos por uso, os que a sua chave vê, e troca o de cada um (veja [Escolhendo o modelo](#escolhendo-o-modelo)) |
| `-audio` | | Só dono e admins. Junto do `-m`: o modelo da transcrição de áudio |
| `-img` | | Só dono e admins. Cria uma imagem com o pedido (respondendo uma foto, a edita). Veja [Imagem e GIF](#imagem-e-gif--img--gif) |
| `-gif` | | Só dono e admins. Cria um GIF (respondendo uma foto, a anima). Veja [Imagem e GIF](#imagem-e-gif--img--gif) |
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
- O modelo de transcrição é o setting `openai.transcribe.model` (padrão `gpt-transcribe`; o `whisper-1` sai do ar
  em fev/2027): `/set openai.transcribe.model <modelo>`.
- Valem ogg (a nota de voz do WhatsApp), mp3, m4a, wav, webm e flac, até 25 MB. Outro formato (como
  aac puro), áudio expirado ou grande demais respondem com um aviso, e nada é enviado à OpenAI. Áudio sem
  fala responde `Não ouvi fala nenhuma nesse áudio`.
- A transcrição é cobrada por minuto de áudio, e o áudio passa pelo servidor da OpenAI; ele não fica
  salvo no banco do bot.

## Imagem e GIF (`-img`, `-gif`)

Os dois **gastam a sua conta da OpenAI**, então são só do dono e dos admins, mesmo que o `/gpt` tenha sido
liberado a um usuário. Os dois usam a API de imagens (`v1/images`) e o modelo do setting
`openai.image.model` (padrão `gpt-image-2.6-flare`).

**`/gpt -img <pedido>`** cria uma imagem e responde com ela. Respondendo uma foto, a OpenAI **edita** essa
foto (`v1/images/edits`) conforme o pedido.

```text
/gpt -img um robô nadando em aquarela
(respondendo uma foto)  /gpt -img coloque um chapéu nele
```

**`/gpt -gif [pedido]`** cria um **GIF animado**: é o `output_format: gif` dos modelos `gpt-image-2.6-*`, com
`frame_count` quadros de `frame_duration_ms` cada. Respondendo uma foto, ela é a base e o GIF a anima.
Sem o `-gif`, "gere um gif animado..." respondendo uma foto também vale; o bot reconhece um verbo de criar
(gere, crie, faça, anime) junto de gif, animação, animado ou vídeo.

```text
(respondendo uma foto)  /gpt gere um gif animado de como se estivesse nadando
(o GIF, em loop)
/gpt -gif um gato de óculos escuros      → sem foto, só pelo texto
```

- O GIF sai com **9 quadros de 200 ms** (1,8 s); os settings `openai.gif.frames` (2 a 16) e
  `openai.gif.frameMs` (20 a 2000) mudam. Mais quadros custam mais.
- A OpenAI devolve um `.gif`; o bot o converte em MP4 sem áudio com o ffmpeg e o manda como GIF
  (`sendVideoAsGif`), que é como o WhatsApp toca um GIF em loop, igual ao [`/giphy`](giphy.md).
- O GIF **pede acesso à prévia** do modelo. Sem ele, o bot responde `🔒 A sua conta/modelo não faz GIF
  animado` com a mensagem da OpenAI.
- **Modelo que a conta não tem**: os modelos de imagem, voz e transcrição (`openai.image.model`,
  `openai.tts.model`, `openai.transcribe.model`) são settings de texto livre, porque os nomes mudam (o
  `gpt-image-1` saiu do ar em 23/10/2026, por exemplo). Se a OpenAI responder que o modelo não existe, o bot
  lista os que a sua chave vê (parecidos com o recurso) e mostra o `/set` para trocar:

  ```text
  ❌ O modelo gpt-image-1 não existe na sua conta da OpenAI (imagem).
  💡 A sua chave vê: gpt-image-2.5-flare, gpt-image-2.6-flare
  💡 Troque com /set openai.image.model <modelo>
  ```

## Voz (`-voz`)

O `/gpt -voz <texto>` pede à OpenAI (`v1/audio/speech`) uma voz para o texto e responde com uma **nota de
voz** (Ogg/Opus, como as do WhatsApp). O estilo padrão é a voz de robô.

```text
/gpt -voz exterminar todos os humanos          → a nota de voz, em voz de robô
(respondendo um texto)  /gpt -voz              → fala o texto da mensagem respondida
```

- **Sem texto digitado**, fala o da mensagem respondida; com texto digitado, fala o digitado. O `-voz` pode
  vir em qualquer lugar do texto. Até 4096 caracteres.
- Três settings escolhem como soa: `openai.tts.model` (`gpt-4o-mini-tts`; o id que a sua conta tem),
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

O `/gpt -m` lista os modelos **por uso**, os que a sua chave enxerga (`GET /v1/models`), com o atual
marcado por ✅. Só o dono e os admins usam. O `-m <modelo>` troca o do uso pedido pela opção que vem junto:

| Uso | Troca com | Setting |
|---|---|---|
| Padrão (perguntas) | `/gpt -m <modelo>` | `openai.api.model` |
| Imagens e GIF | `/gpt -m <modelo> -gif` (ou `-img`) | `openai.image.model` |
| Transcrição de áudio | `/gpt -m <modelo> -audio` | `openai.transcribe.model` |
| Voz | `/gpt -m <modelo> -voz` | `openai.tts.model` |

```text
/gpt -m
🤖 Modelos do /gpt

Padrão (perguntas) — /gpt -m <modelo>
✅ gpt-4o-mini
▫️ gpt-4.1

-img, -gif (imagens e GIF) — /gpt -m <modelo> -gif
✅ gpt-image-2.6-flare
▫️ gpt-image-2.5-flare

-audio (transcrição de áudio) — /gpt -m <modelo> -audio
✅ gpt-transcribe

-voz (voz) — /gpt -m <modelo> -voz
✅ gpt-4o-mini-tts

A lista é a da sua chave (GET /v1/models).

/gpt -m -gif                        → lista só as imagens
/gpt -m gpt-image-2.5-flare -gif    → ✅ Modelo de imagens e GIF do /gpt: gpt-image-2.5-flare
```

- Com uma opção e **sem modelo** (`/gpt -m -gif`), lista só aquele uso.
- O modelo que a chave **não vê** não é gravado: o bot mostra os que ela vê (`❌ A sua chave não vê o modelo
  gpt-image-1 (imagens e GIF)`). Um atual que a chave não vê aparece com `⚠️ a sua chave não vê`.
- Sem chave, ou se a OpenAI não responder, a lista cai nos padrões do código (e o aviso diz isso).
- Os modelos das perguntas seguem a lista fixa abaixo (`gpt-5-pro`, por exemplo, não vale); os de imagem,
  áudio e voz são livres, porque os nomes mudam.

O modelo das perguntas vem do `OPENAI_MODEL` no `config/.env` ou, se ele estiver vazio, do setting
`openai.api.model` (padrão `gpt-4o-mini`). O `/gpt -m <modelo>` e o `/set openai.api.model <modelo>`
trocam o setting na hora; com o `OPENAI_MODEL` preenchido, ele continua tendo prioridade (o bot
avisa).

O bot usa o endpoint `v1/chat/completions`. A lista de IDs aceitos fica em `src/openai.js`.

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
