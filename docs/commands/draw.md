# `/draw` · admin

Role `admin`: only you and the extra admins. The owner enables it for a person or group with
`/bot +u +cmd /draw` ([Delegating](index.md#delegating-an-admin-command)). Whoever gets it can only
draw: `-model` (view and switch the model) is for the owner and admins. Each image **spends your
OpenAI account**.

Draws an image with OpenAI's GPT Image (`v1/images` API) and sends it to the chat, with the request
in the caption (cut at 200 characters). With `-gif`, it makes an **animated GIF**. On a **photo** (the
message's own, in the caption, or the replied one), the request **edits** the photo or, with
`-gif`, **animates** it.
Replying to a message, its text goes before the request. `/gpt -img` and `/gpt -gif` are the same
code: the result is the same.

```text
/draw um gato astronauta em aquarela
/draw um castelo na neve
/draw -gif um gato dançando
/draw -m                       → the current model and the ones your key sees
/draw -h                       → command help
```

If the **first word** looks like an option but doesn't exist (`/draw -price`), the bot replies
`❌ Unknown option: -price` and suggests `-h|-help`, without calling OpenAI.

| Option | Value | Description |
|---|---|---|
| `-gif`, `-g` | | Animated GIF (setting `openai.image.gifModel`). On a photo, or replying to one, animates the photo. See [Animated GIF](#animated-gif--gif) |
| `-frames`, `-f` | `<n>` | GIF frames, from 2 to 16 (default: `openai.gif.frames`, 9). Implies `-gif` |
| `-ms` | `<ms>` | Duration of each GIF frame, from 20 to 2000 ms (default: `openai.gif.frameMs`, 200). Implies `-gif` |
| `-model`, `-m` | `[model]` | Owner and admins only. Without a model, lists the current one and the ones your key sees; with a model, switches (`openai.image.model`; with `-gif`, `openai.image.gifModel`) |
| `-status`, `-s` | | Adds the call's usage to the footer: TX/RX bytes, tokens, cost and balance (image and GIF: in a separate message). See [Status](gpt.md#status--status) |
| `<request>` | | What to draw or animate. Replying to a message, its text goes before; on a photo, the request edits it |

Uses the same key as [`/gpt`](gpt.md): `OPENAI_API_KEY` in `config/.env` or the `openai.api.key`
setting (see [Setting up the key](gpt.md#setting-up-the-key)). The image can take more than a
minute: the timeout is `openai.timeout.ms`, but never less than 3 minutes (5 for the GIF).

## Edit a photo

Replying to a photo (or sending the photo with the caption `/draw ...`), OpenAI **edits** that
photo (`v1/images/edits`) according to the request. A sticker works too; a GIF or a sticker becomes
a PNG.

```text
(respondendo uma foto)  /draw coloque um chapéu nele
(foto com a legenda)    /draw transforme em desenho a lápis
```

## Animated GIF (`-gif`)

It's the `output_format: gif` of the `gpt-image-2.6-*` models, with `frame_count` frames of
`frame_duration_ms` each. On a photo, the GIF animates it; with no request, with a subtle, natural
movement.

```text
/draw -gif um gato dançando
→ ⏳ Processing /draw, hold on.
→ (the GIF, looping) 🎞️ um gato dançando

/draw -gif -f 6 -ms 300 uma bandeira ao vento
(respondendo uma foto)  /draw -gif como se estivesse nadando
```

- Uses the model from the `openai.image.gifModel` setting (default `gpt-image-2.6-flare`;
  `gpt-image-2.6-sunburst` is more detailed). Only the 2.6 family makes GIFs, and it **requires
  preview access**. Without it, the bot replies `🔒 Your account/model cannot make animated GIFs` with
  OpenAI's message.
- The GIF comes out with **9 frames of 200 ms** (1.8 s); the `openai.gif.frames` (2 to 16) and
  `openai.gif.frameMs` (20 to 2000) settings change that, and `-frames` and `-ms` override them on
  a call.
- `-frames` and `-ms` outside the range get `❌ -frames must be an integer from 2 to 16.` (or `-ms`,
  from 20 to 2000).
- Each frame comes out at **512x512**: OpenAI charges for the pixels of all the frames, so more
  frames cost more.
- OpenAI returns a `.gif`; the bot converts it to a silent MP4 with ffmpeg and sends it as a GIF
  (`sendVideoAsGif`), which is how WhatsApp plays a looping GIF, same as [`/giphy`](giphy.md). If the
  conversion fails, the `.gif` arrives as a document.
- On `/gpt`, "generate an animated gif..." replying to a photo also works, without `-gif`: the bot
  recognizes a creation verb (generate, create, make, animate, transform; or gere, crie, faça,
  anime) next to gif, animation, animated or video (or animação, animado, vídeo).

## Model the account doesn't have

The image models (`openai.image.model` and `openai.image.gifModel`) are free-text settings, because
the names change (`gpt-image-1` went offline on 2026-10-23, for example). If OpenAI replies that the
model doesn't exist, the bot lists the ones your key sees (similar to the feature) and shows the
`/set` to switch:

```text
❌ The model gpt-image-1 does not exist in your OpenAI account (image).
💡 Your key sees: gpt-image-2.5-flare, gpt-image-2.6-flare
💡 Change it with /set openai.image.model <model>
```

`/draw -m` shows the image model and the GIF one, and switches each (`/draw -gif -m <model>`).
A model your key doesn't see isn't saved.
