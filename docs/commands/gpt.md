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

Se a **primeira palavra** parece uma opção mas não existe (`/gpt -price`), o bot responde
`❌ Opção desconhecida: -price` e sugere o `-h|-help`, sem chamar a OpenAI. Só a primeira palavra: no
resto do texto, um `-x` é pergunta. O `/tldr` age igual (o `-2h` e o `-30m` continuam valendo).

| Opção | Valor | Descrição |
|---|---|---|
| `-model`, `-m` | `[modelo]` | Só dono e admins. Lista os modelos por uso, os que a sua chave vê, e troca o de cada um (veja [Escolhendo o modelo](#escolhendo-o-modelo)) |
| `-audio` | | Só dono e admins. Junto do `-m`: o modelo da transcrição de áudio |
| `-img` | | Só dono e admins. Cria uma imagem com o pedido (respondendo uma foto, a edita). Veja [Imagem e GIF](#imagem-e-gif--img--gif) |
| `-gif` | | Só dono e admins. Cria um GIF (respondendo uma foto, a anima). Veja [Imagem e GIF](#imagem-e-gif--img--gif) |
| `-voz`, `-v` | `[texto]` | Responde uma nota de voz de robô com o texto (ou com o da mensagem respondida). Veja [Voz](#voz--voz) |
| `-status`, `-s` | | Acrescenta no rodapé da resposta o consumo da chamada: bytes TX/RX e tokens. Veja [Status](#status--status) |
| `-prices` | | Só dono e admins. Busca os preços no site da OpenAI e atualiza o `openai.pricing`. Veja [Status](#status--status) |
| `-usage`, `-u` | `[dias]` | Só dono e admins. O consumo dos últimos dias (padrão 7, até 31) e os limites de agora. Veja [Consumo e limites](#consumo-e-limites--usage) |

## Formatação no WhatsApp

O ChatGPT escreve em Markdown, que o WhatsApp não entende (os `#` e os `**` apareceriam soltos, e uma
tabela viraria um monte de barras). Por isso a resposta passa por duas etapas, no `/gpt` e no `/tldr`:

1. **O pedido ao modelo**: as instruções dizem para escrever no formato do WhatsApp (`*negrito*` com um
   asterisco, `_itálico_`, `~tachado~`, listas com `- `, código entre crases) e sem títulos, tabelas e `---`.
2. **A conversão** do que escapar (`src/util/whatsapp.js`):

| O modelo escreveu | Chega no WhatsApp |
|---|---|
| `# Título`, `## Título` | `*Título*` |
| `**negrito**`, `__negrito__` | `*negrito*` |
| `***forte***` | `*_forte_*` |
| `~~tachado~~` | `~tachado~` |
| `* item`, `+ item` | `- item` |
| `[texto](https://x.com)` | `texto (https://x.com)` |
| `![foto](https://x.com/a.png)` | `https://x.com/a.png` |
| `---` sozinho na linha | (some) |
| tabela com `\|` | um bloco de código com as colunas alinhadas |
| ` ```text ` | ` ``` ` (sem o nome da linguagem) |

O que está dentro de um bloco de código não é mexido, e o que já está no formato do WhatsApp fica como
está. Uma tabela vira um bloco monoespaçado porque é o único jeito de manter as colunas:

````text
```
Símbolo  Significado
-------  -----------
∈        Pertence
∉        Não pertence
```
````

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

O `/gpt -img <pedido>` e o `/gpt -gif [pedido]` são o [`/desenhe`](desenhe.md) e o `/desenhe -gif`: o mesmo
código, então o resultado é igual (imagem, edição de foto, GIF animado, modelo que a conta não tem). Os dois
**gastam a sua conta da OpenAI**, então são só do dono e dos admins, mesmo que o `/gpt` tenha sido liberado a
um usuário. O modelo da imagem é o `openai.image.model` e o do GIF, o `openai.image.gifModel`.

```text
/gpt -img um robô nadando em aquarela
(respondendo uma foto)  /gpt -img coloque um chapéu nele
/gpt -gif um gato de óculos escuros
(respondendo uma foto)  /gpt gere um gif animado de como se estivesse nadando
```

Sem o `-gif`, "gere um gif animado..." respondendo uma foto também vale. Para ajustar os quadros e o tempo
de cada um numa chamada (`-frames`, `-ms`), use o [`/desenhe -gif`](desenhe.md#gif-animado--gif).

## Voz (`-voz`)

O `/gpt -voz <texto>` pede à OpenAI (`v1/audio/speech`) uma voz para o texto e responde com uma **nota de
voz** (Ogg/Opus, como as do WhatsApp). O estilo padrão é a voz de robô.

```text
/gpt -voz exterminar todos os humanos          → a nota de voz, em voz de robô
(respondendo um texto)  /gpt -voz              → fala o texto da mensagem respondida
(respondendo um texto)  /gpt -voz fale como um robô meio metálico → fala o texto respondido nesse estilo
```

- **Sem texto digitado**, fala o da mensagem respondida (um áudio é transcrito antes). **Sem resposta**, fala o
  digitado. **Com os dois**, fala o respondido e o digitado vira o estilo (só o `gpt-4o-mini-tts` segue o estilo). O `-voz` pode
  vir em qualquer lugar do texto. Até 4096 caracteres.
- Três settings escolhem como soa: `openai.tts.model` (`gpt-4o-mini-tts`; o id que a sua conta tem),
  `openai.tts.voice` (`onyx`, o padrão, ou `alloy`, `ash`, `ballad`, `coral`, `echo`, `fable`, `nova`,
  `sage`, `shimmer`, `verse`) e `openai.tts.instructions` (o estilo: o padrão pede voz de robô; ex.:
  `/set openai.tts.instructions Fale como um locutor de rádio animado`). Só o `gpt-4o-mini-tts` segue o estilo:
  com o `tts-1`, a voz sai normal.
- A voz é cobrada por caractere, e o texto passa pelo servidor da OpenAI.

## Status (`-status`)

Com `-status` (ou `-s`) a resposta ganha um rodapé com o consumo da chamada. Vem ligado por padrão em todas as respostas
(também no `/tldr`); para desligar, `/set openai.status false` (aí só o `-status` mostra).

```text
/gpt -s explique SSRF em 3 linhas

🤖 SSRF é quando o servidor faz a requisição que o atacante pediu...

📡 ⬆️ 1.2 KB TX · ⬇️ 3.4 KB RX · 🪙 150 tokens (📥 120 · 📤 30)
💵 ~$0.000090 · 🏦 saldo ~$12.31 de $20.00
```

- **TX/RX**: bytes do corpo enviado e recebido (o JSON, o áudio, a imagem), sem cabeçalhos nem TLS.
- **Tokens**: os que a OpenAI informa (`usage`): total, entrada (📥) e saída (📤). A voz não informa.
- **💵 Custo**: estimado (o `~`), tokens × o preço do modelo no setting `openai.pricing`
  (`modelo=entrada/saída`, dólares por 1M de tokens). Os preços vêm vazios: sem preço, ou sem tokens (a voz), o rodapé mostra `custo n/d`. Para atualizar os preços, `/gpt -prices` (só dono e admins) lê a tabela Standard do site da
  OpenAI e grava no `openai.pricing`, mostrando o que mudou; o que você adicionou à mão e a página não tem
  fica como está. Com a chave da OpenAI configurada, o bot faz isso sozinho a cada 15 dias
  (`openai.pricing.auto`, ligado por padrão; `/set openai.pricing.auto false` para só atualizar à mão).
  Com os preços de mais de 30 dias, o rodapé avisa (`⚠️ preços de N dias: /gpt -prices`). Se o site mudar de formato, o comando avisa e nada é alterado (use `/set openai.pricing`).
- **🏦 Saldo**: só com a chave de admin e o `openai.credit.total` (como no `-usage`). O gasto vem da Costs API,
  lido a cada 5 minutos (ela atrasa), mais a estimativa das chamadas feitas desde então.
- **🔁 N chamadas**: aparece quando o comando fez mais de uma (áudio transcrito e depois o chat).
- Voz, imagem e GIF não têm texto para o rodapé: o status vai numa mensagem à parte.

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

**Dinheiro** (Costs API, também com a chave de admin): o gasto em dólares do período, por dia e por modelo,
e os "outros custos" (imagem, voz, transcrição). A API da OpenAI **não informa o saldo** da conta, então o
`$usado/$total` vem de dois settings seus: `openai.credit.total` (os dólares que você comprou) e
`openai.credit.since` (a data da compra, `AAAA-MM-DD`). O usado é o gasto desde essa data:

```text
/set openai.credit.total 10
/set openai.credit.since 2026-11-01
/gpt -usage
💰 Créditos: $1,51/$10,00 · restam $8,49 (gasto desde 01/11/2026)
```

**Outros usos** (Usage API de imagens, voz, transcrição e embeddings): as requisições e a quantidade
(imagens, caracteres, segundos de áudio), só dos que tiveram uso no período.

**Limites de agora** (chave normal): o bot faz uma chamada mínima ao chat (16 tokens de saída no
máximo, ou seja, gasta quase nada) e lê os cabeçalhos `x-ratelimit-*` da resposta: o limite, o que
ainda resta na janela atual e quando reseta, de tokens e de requisições do modelo em uso.

```text
/gpt -usage
💰 Créditos: $1,51/$10,00 · restam $8,49 (gasto desde 01/11/2026)

📊 Consumo da OpenAI — últimos 7 dias
💵 Gasto: $0,04
🔢 3.560 tokens · entrada 3.050 (cache 400) · saída 510
🔁 13 requisições

📅 Por dia (UTC)
• 07/11 · 1.260 tokens · 6 req · $0,0007
• 08/11 · 2.300 tokens · 7 req · $0,04

🧠 Por modelo
• gpt-4o-mini · 3.500 tokens · 12 req · $0,0019
• gpt-6-sol · 60 tokens · 1 req · $0,00

🧾 Outros custos
• gpt-image-2.6-flare · $0,04

🧰 Outros usos
• 🖼️ Imagens · 3 imagens · 2 req
• 🔊 Voz · 1.200 caracteres · 1 req
• 🎙️ Transcrição · 42 s de áudio · 1 req

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
