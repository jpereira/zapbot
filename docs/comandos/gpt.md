# `/gpt` (`/ai`) · admin

Role `admin`: only you and the extra admins. The owner can grant it to a person or group with
`/bot +u +cmd /gpt` ([Delegating](index.md#delegating-an-admin-command)).
Whoever gets it can ask questions and use `-voz`: `-model`, `-audio`, `-img`, `-gif`, `-prices` and
`-usage`, `-u` are for the owner and admins.

Asks ChatGPT through the OpenAI API and replies in the chat. When you reply to a message, its text
goes before the question; when you reply to a **photo**, it's sent along and ChatGPT sees it (see
[With a photo](#with-a-photo)); when you reply to a **document** (text or PDF), its content goes along (see
[With a document](#with-a-document)); when you reply to an **audio**, it's transcribed (see
[With audio](#with-audio)); with `-voz`, the text becomes a robot voice note (see
[Voice](#voice--voz)); with `-img` and `-gif`, it creates an image and a GIF (see
[Image and GIF](#image-and-gif--img--gif)). While waiting for the answer, the bot shows as
"typing...". Without a question, it shows the help.

```text
/gpt explique o que é SSRF em 3 linhas
/ai qual a capital da Mongólia?
/gpt resuma          (respondendo uma mensagem)
/gpt qual a raça desse cachorro?   (respondendo uma foto)
/gpt agora transcreva isso         (respondendo um áudio)
/gpt resuma esse áudio             (respondendo um áudio)
/gpt -voz exterminar todos os humanos   → replies with a robot voice note
/gpt -img um robô nadando em aquarela   → creates an image (owner and admins only)
/gpt gere um gif animado dele nadando   → replying to a photo: a GIF (owner and admins only)
/gpt -m              → the models by use (questions, images, audio, voice), with the current one
/gpt -m gpt-6-luna   → changes the questions model
/gpt -m gpt-image-2.6-flare -gif   → changes the image and GIF model
/gpt -usage          → usage for the last 7 days and the current limits (owner and admins only)
/gpt -u 30           → (shortcut) usage for the last 30 days
/gpt -h              → command help
```

If the **first word** looks like an option but doesn't exist (`/gpt -price`), the bot replies
`❌ Opção desconhecida: -price` and suggests `-h|-help`, without calling OpenAI. Only the first word:
in the rest of the text, a `-x` is part of the question. `/tldr` and `/draw` behave the same (`-2h` and `-30m`
still work).

| Option | Value | Description |
|---|---|---|
| `-model`, `-m` | `[modelo]` | Owner and admins only. Lists the models by use, the ones your key sees, and changes each one (see [Choosing the model](#choosing-the-model)) |
| `-audio` | | Owner and admins only. Together with `-m`: the audio transcription model |
| `-img` | | Owner and admins only. Creates an image from the request (replying to a photo, it edits it). See [Image and GIF](#image-and-gif--img--gif) |
| `-gif` | | Owner and admins only. Creates a GIF (replying to a photo, it animates it). See [Image and GIF](#image-and-gif--img--gif) |
| `-voz`, `-v` | `[texto]` | Replies with a robot voice note of the text (or of the replied message). See [Voice](#voice--voz) |
| `-status`, `-s` | | Appends the call's usage to the reply footer: TX/RX bytes, tokens, cost and balance. See [Status](#status--status) |
| `-prices` | | Owner and admins only. Fetches the prices from OpenAI's site and updates `openai.pricing`. See [Status](#status--status) |
| `-usage`, `-u` | `[dias]` | Owner and admins only. Usage for the last days (default 7, up to 31) and the current limits. See [Usage and limits](#usage-and-limits--usage) |

## Formatting on WhatsApp

ChatGPT writes in Markdown, which WhatsApp doesn't understand (the `#` and `**` would show up as
stray characters, and a table would turn into a pile of bars). So the reply goes through two steps,
in `/gpt` and in `/tldr`:

1. **The request to the model**: the instructions tell it to write in WhatsApp format (`*bold*` with
   one asterisk, `_italic_`, `~strikethrough~`, lists with `- `, code between backticks) and without
   headings, tables, and `---`.
2. **The conversion** of whatever slips through (`src/util/whatsapp.js`):

| The model wrote | Arrives on WhatsApp |
|---|---|
| `# Título`, `## Título` | `*Título*` |
| `**negrito**`, `__negrito__` | `*negrito*` |
| `***forte***` | `*_forte_*` |
| `~~tachado~~` | `~tachado~` |
| `* item`, `+ item` | `- item` |
| `[texto](https://x.com)` | `texto (https://x.com)` |
| `![foto](https://x.com/a.png)` | `https://x.com/a.png` |
| `---` alone on a line | (disappears) |
| table with `\|` | a code block with the columns aligned |
| ` ```text ` | ` ``` ` (without the language name) |

What's inside a code block is left alone, and what's already in WhatsApp format stays as is. A table
becomes a monospaced block because it's the only way to keep the columns:

````text
```
Símbolo  Significado
-------  -----------
∈        Pertence
∉        Não pertence
```
````

## With a photo

When you reply to a photo (or sticker) with `/gpt`, the bot downloads the image and sends it along
with the question to the model, which sees it. The text comes from the photo's caption (if it has
one) and from what you typed, in that order. With no question at all, ChatGPT describes the photo.

```text
(respondendo a foto de um cachorro)
/gpt qual a raça desse cachorro?
🤖 Parece um labrador retriever, pelo focinho e pelo pelo curto...
```

- JPEG, PNG, WebP, and GIF are accepted, up to 15 MB. Another format, an image that
  has already expired on WhatsApp, or one that's too large gets a notice, and nothing is sent to
  OpenAI.
- A video isn't an image: `/gpt` uses only its text (the caption). Audio and documents have their
  own sections.
- The model has to be able to read images (the ones in the `-m` list can). The photo goes through
  OpenAI's server, like any question; it isn't saved in the bot's database.

## With a document

When you reply to a document with `/gpt`, the bot reads it and sends the content as text, after the
question (or alone, if you typed nothing).

```text
(respondendo um PDF)
/gpt resuma esse documento
```

- Plain text (txt, md, csv, json, xml, yaml, logs, source code, html...) and PDF are accepted, up to
  10 MB. A PDF is read with `pdftotext` (poppler-utils must be installed). Other formats (docx,
  xlsx...), an expired document, or one that's too large get a notice, and nothing is sent to
  OpenAI.
- Only the first 60 thousand characters go. A document without text (a scanned PDF) gets a notice.
- The content goes through OpenAI's server, like any question.

## With audio

When you reply to an audio or voice note with `/gpt`, the bot downloads the audio and transcribes it
through OpenAI's transcription API (`v1/audio/transcriptions`), in the language it detects:

```text
(respondendo uma nota de voz)
/gpt agora transcreva isso
🤖 Transcrição:
oi, tudo bem? te ligo mais tarde, só queria confirmar o horário da reunião.
```

- **With no question**, or only with "transcreva" (up to 6 words starting with `transcrev`:
  "transcreve", "agora transcreva isso"), it replies with the transcription as it came out.
- **With another question** ("resuma", "traduza para o inglês", "quais são os combinados?"), the bot
  sends the question and the transcription to the chat and answers based on it.
- The transcription model is the `openai.transcribe.model` setting (default `gpt-transcribe`;
  `whisper-1` is going away in Feb 2027): `/set openai.transcribe.model <modelo>`.
- ogg (the WhatsApp voice note), mp3, m4a, wav, webm, and flac are accepted, up to 25 MB. Another
  format (like raw aac), expired audio, or audio that's too large gets a notice, and nothing is sent
  to OpenAI. Audio without speech replies `Não ouvi fala nenhuma nesse áudio`.
- The transcription is billed per minute of audio, and the audio goes through OpenAI's server; it
  isn't saved in the bot's database.

## Image and GIF (`-img`, `-gif`)

`/gpt -img <pedido>` and `/gpt -gif [pedido]` are [`/draw`](draw.md) and `/draw -gif`: the
same code, so the result is the same (image, photo editing, animated GIF, a model the account
doesn't have). Both **spend your OpenAI account**, so they're for the owner and admins only, even if
`/gpt` was granted to a user. The image model is `openai.image.model` and the GIF one is
`openai.image.gifModel`.

```text
/gpt -img um robô nadando em aquarela
(respondendo uma foto)  /gpt -img coloque um chapéu nele
/gpt -gif um gato de óculos escuros
(respondendo uma foto)  /gpt gere um gif animado de como se estivesse nadando
```

Without `-gif`, "gere um gif animado..." replying to a photo also works. To adjust the frames and
the time of each one in a single call (`-frames`, `-ms`), use
[`/draw -gif`](draw.md#animated-gif--gif).

## Voice (`-voz`)

`/gpt -voz <texto>` asks OpenAI (`v1/audio/speech`) for a voice for the text and replies with a
**voice note** (Ogg/Opus, like WhatsApp's). The default style is the robot voice.

```text
/gpt -voz exterminar todos os humanos          → the voice note, in a robot voice
(respondendo um texto)  /gpt -voz              → speaks the replied message's text
(respondendo um texto)  /gpt -voz fale como um robô meio metálico → speaks the replied text in that style
```

- **With no typed text**, it speaks the replied message's (an audio is transcribed first). **With no
  reply**, it speaks the typed text. **With both**, it speaks the replied one and the typed one
  becomes the style (only `gpt-4o-mini-tts` follows the style). `-voz` can go anywhere in the text.
  Up to 4096 characters.
- Three settings choose how it sounds: `openai.tts.model` (`gpt-4o-mini-tts`; the id your account
  has), `openai.tts.voice` (`onyx`, the default, or `alloy`, `ash`, `ballad`, `coral`, `echo`,
  `fable`, `nova`, `sage`, `shimmer`, `verse`), and `openai.tts.instructions` (the style: the
  default asks for a robot voice; e.g.:
  `/set openai.tts.instructions Fale como um locutor de rádio animado`). Only `gpt-4o-mini-tts`
  follows the style: with `tts-1`, the voice comes out normal.
- The voice is billed per character, and the text goes through OpenAI's server.

## Status (`-status`)

With `-status` (or `-s`) the reply gets a footer with the call's usage. It's on by default in all
replies (also in `/tldr`); to turn it off, `/set openai.status false` (then only `-status` shows
it).

```text
/gpt -s explique SSRF em 3 linhas

🤖 SSRF é quando o servidor faz a requisição que o atacante pediu...

📡 ⬆️ 1.2 KB TX · ⬇️ 3.4 KB RX · 🪙 150 tokens (📥 120 · 📤 30)
💵 ~$0.000090 · 🏦 saldo ~$12.31 de $20.00
```

- **TX/RX**: bytes of the body sent and received (the JSON, the audio, the image), without headers
  or TLS.
- **Tokens**: the ones OpenAI reports (`usage`): total, input (📥), and output (📤). Voice doesn't
  report them.
- **💵 Cost**: estimated (the `~`), tokens × the model's price in the `openai.pricing` setting
  (`modelo=entrada/saída`, dollars per 1M tokens). Prices start out empty: with no price, or no
  tokens (voice), the footer shows `custo n/d`. To update the prices, `/gpt -prices` (owner and
  admins only) reads the Standard table on OpenAI's site and writes it to `openai.pricing`, showing
  what changed; whatever you added by hand that the page doesn't have stays as is. With the OpenAI
  key configured, the bot does this on its own every 15 days (`openai.pricing.auto`, on by default;
  `/set openai.pricing.auto false` to only update by hand). With prices older than 30 days, the
  footer warns (`⚠️ preços de N dias: /gpt -prices`). If the site changes format, the command warns
  and nothing is changed (use `/set openai.pricing`).
- **🏦 Balance**: only with the admin key and `openai.credit.total` (as in `-usage`). The spend comes
  from the Costs API, read every 5 minutes (it lags), plus the estimate of the calls made since
  then. Without `openai.credit.since`, it counts the last 180 days.
- **🔁 N chamadas**: shows up when the command made more than one (audio transcribed and then the chat).
- Voice, image, and GIF have no text for the footer: the status goes in a separate message.

## Usage and limits (`-usage`)

`/gpt -usage [dias]` combines two queries to OpenAI. Only the owner and admins use it, even if
`/gpt` was granted to a user.

**Usage** (Usage API, with the **admin** key): input, output, and cache tokens, and requests, for the
last days (default 7, up to 31), by day and by model. It's the equivalent of:

```bash
curl "https://api.openai.com/v1/organization/usage/completions?start_time=<7 dias atrás>&bucket_width=1d&limit=7&group_by[]=model" \
  -H "Authorization: Bearer $OPENAI_ADMIN_KEY"
```

The Usage API doesn't accept the regular key: it needs an Admin key (`sk-admin-...`, created at
platform.openai.com › Organization › Admin keys), in `OPENAI_ADMIN_KEY` in `config/.env` or in the
`openai.admin.key` setting (`/set openai.admin.key sk-admin-...`, shown masked). Days are in UTC.

**Money** (Costs API, also with the admin key): the dollar spend for the period, by day and by model,
and the "other costs" (image, voice, transcription). OpenAI's API **doesn't report the account
balance**, so the `$used/$total` comes from two settings of yours: `openai.credit.total` (the dollars
you bought) and `openai.credit.since` (the purchase date, `AAAA-MM-DD`). The used amount is the spend
since that date:

```text
/set openai.credit.total 10
/set openai.credit.since 2026-11-01
/gpt -usage
💰 Créditos: $1,51/$10,00 · restam $8,49 (gasto desde 01/11/2026)
```

**Other uses** (Usage API for images, voice, transcription, and embeddings): the requests and the
amount (images, characters, seconds of audio), only for those with usage in the period.

**Current limits** (regular key): the bot makes a minimal call to the chat (16 output tokens at most,
so it costs almost nothing) and reads the `x-ratelimit-*` headers from the response: the limit, what
remains in the current window, and when it resets, for tokens and requests of the model in use.

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

- **Without the admin key**: only the limits come out, with a hint on how to configure it. **Admin
  key rejected** (401 or 403): the warning that the Usage API needs an Admin key (or a key with the
  Usage scope in Read), and the limits come out anyway.
- **Without any key**: `⚠️ API key da OpenAI não encontrada`.
- There are no per-project limits here: the `organization/projects/<id>/rate_limits` endpoint needs
  the project id, and the headers already show the limit that applies to the key in use.

## Choosing the model

`/gpt -m` lists the models **by use**, the ones your key sees (`GET /v1/models`), with the current one
marked with ✅. Only the owner and admins use it. `-m <modelo>` changes the one for the use requested
by the option that comes with it:

| Use | Change with | Setting |
|---|---|---|
| Default (questions) | `/gpt -m <modelo>` | `openai.api.model` |
| Images | `/gpt -m <modelo> -img` | `openai.image.model` |
| GIF | `/gpt -m <modelo> -gif` | `openai.image.gifModel` |
| Audio transcription | `/gpt -m <modelo> -audio` | `openai.transcribe.model` |
| Voice | `/gpt -m <modelo> -voz` | `openai.tts.model` |

```text
/gpt -m
🤖 Modelos do /gpt

Padrão (perguntas) — /gpt -m <modelo>
✅ gpt-4o-mini
▫️ gpt-4.1

-img (imagens) — /gpt -m <modelo> -img
✅ gpt-image-2

-gif (GIF) — /gpt -m <modelo> -gif
✅ gpt-image-2.6-flare
▫️ gpt-image-2.5-flare

-audio (transcrição de áudio) — /gpt -m <modelo> -audio
✅ gpt-transcribe

-voz (voz) — /gpt -m <modelo> -voz
✅ gpt-4o-mini-tts

A lista é a da sua chave (GET /v1/models).

/gpt -m -gif                        → lists only the GIF one
/gpt -m gpt-image-2.5-flare -gif    → ✅ Modelo de GIF do /gpt: gpt-image-2.5-flare
```

- With an option and **no model** (`/gpt -m -gif`), it lists only that use.
- For images, GIF, audio, and voice, a model the key **doesn't see** isn't saved: the bot shows the ones it does see (`❌ A sua chave
  não vê o modelo gpt-image-1 (GIF)`). A current one the key doesn't see shows up with
  `⚠️ a sua chave não vê`.
- Without a key, or if OpenAI doesn't respond, the list falls back to the code's defaults (and the
  notice says so).
- The question models follow the fixed list below (`gpt-5-pro`, for example, isn't valid); the image,
  audio, and voice ones are free-form, because the names change.

The question model comes from `OPENAI_MODEL` in `config/.env` or, if it's empty, from the
`openai.api.model` setting (default `gpt-4o-mini`). `/gpt -m <modelo>` and
`/set openai.api.model <modelo>` change the setting right away; with `OPENAI_MODEL` filled in, it
still takes priority (the bot warns).

The bot uses the `v1/chat/completions` endpoint. The list of accepted IDs is in `src/openai.js`.

| Family | Accepted IDs |
|---|---|
| GPT-6 | `gpt-6-astra`, `gpt-6.1-sol`, `gpt-6-sol`, `gpt-6-luna` |
| GPT-5.6 | `gpt-5.6-sol`, `gpt-5.6-terra`, `gpt-5.6-luna` |
| GPT-5 | `gpt-5.5`, `gpt-5.4`, `gpt-5.4-mini`, `gpt-5.4-nano`, `gpt-5.2`, `gpt-5.1` |
| GPT-4 | `gpt-4.1`, `gpt-4.1-mini`, `gpt-4o`, `gpt-4o-mini` |

Availability depends on the account used by the API. Check the
[models](https://developers.openai.com/api/docs/models/all) and
[OpenAI pricing](https://developers.openai.com/api/docs/pricing) to choose.

## Setting up the key

`/gpt` needs an OpenAI API key (pay-as-you-go: create one at
[platform.openai.com/api-keys](https://platform.openai.com/api-keys)). It's looked up in this order:

1. `OPENAI_API_KEY` in `config/.env` (takes effect on the next start);
2. the `openai.api.key` setting, which you can change from WhatsApp without restarting:
   `/set openai.api.key sk-proj-...` (shown masked; `/set -reset openai.api.key` deletes it).

With neither, questions reply `API key da OpenAI não encontrada`. Querying and configuring the model
remain available. The maximum wait time follows the same order: `OPENAI_TIMEOUT_MS` in `.env` or the
`openai.timeout.ms` setting (default 60000, from 5000 to 300000). An invalid value in `.env` is
ignored (with a warning in the log) and the setting applies. For the model, see
[Choosing the model](#choosing-the-model).

Details:

- It's restricted to the owner and extra admins (`+a`); the owner can grant it to a user
  (`+u +cmd /gpt`).
- Common errors have their own replies: invalid key (`🔑`), limit or credits exhausted (`💸`), and a
  delay longer than the timeout (`⏱️`). The others show the API's message.
- The key never goes to the chat or the log.
- Every successful reply starts with `🤖`. This also keeps a reply that starts with `/` from being
  read as a command.
