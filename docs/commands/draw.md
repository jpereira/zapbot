# `/draw` · admin

Role `admin`: only you and the extra admins. The owner enables it for a person or group with
`/bot +u +cmd /draw` ([Delegating](index.md#delegating-an-admin-command)). Whoever gets it can only
draw: `-model` (view and switch the model) is for the owner and admins. Each image **spends your
OpenAI account**.

Draws an image with ChatGPT (OpenAI's GPT Image, `v1/images` API) and sends it to the chat, with the request
in the caption (cut at 200 characters). With `-gif`, it makes an **animated GIF**. On a **photo** (the
message's own, in the caption, or the replied one), the request **edits** the photo or, with
`-gif`, **animates** it.
Replying to a message, its text goes before the request. `/gpt -img` and `/gpt -gif` are the same
code: the result is the same.

```text
/draw an astronaut cat in watercolor
/draw um castelo na neve
/draw -g a dancing cat
/draw -m                       → the current model and the ones your key sees
/draw -h                       → command help
/draw -s an astronaut cat           → the image plus the usage in the footer
```

If the **first word** looks like an option but doesn't exist (`/draw -price`), the bot replies
`❌ Unknown option: -price` and suggests `-h|-help`, without calling OpenAI.

| Option | Value | Description |
|---|---|---|
| `-gif`, `-g` | | Animated GIF (setting `gpt.image.gifModel`). On a photo, or replying to one, animates the photo. See [Animated GIF](#animated-gif--gif) |
| `-frames`, `-f` | `<n>` | GIF frames, from 2 to 16 (default: `gpt.gif.frames`, 9). Implies `-gif` |
| `-ms` | `<ms>` | Duration of each GIF frame, from 20 to 2000 ms (default: `gpt.gif.frameMs`, 200). Implies `-gif` |
| `-profile`, `-p` | | Adds the profile photo of one or more people to the images (`-p /Rafael Silva/`, `@mention`, `+number`; without anyone: the person of the chat). See [With the profile photo of someone](#with-the-profile-photo-of-someone--profile) |
| `-model`, `-m` | `[model]` | Owner and admins only. Without a model, lists the current one and the ones your key sees; with a model, switches (`gpt.image.model`; with `-gif`, `gpt.image.gifModel`) |
| `-status`, `-s` | | Adds the call's usage to the footer: TX/RX bytes, tokens, cost and balance (image and GIF: in a separate message). See [Status](gpt.md#status--status) |
| `<request>` | | What to draw or animate. Replying to a message, its text goes before; on a photo, the request edits it |

Uses the same key as [`/gpt`](gpt.md): `OPENAI_API_KEY` in `config/.env` or the `gpt.api.key`
setting (see [Setting up the key](gpt.md#setting-up-the-key)). The image can take more than a
minute: the timeout is `gpt.timeout.ms`, but never less than 3 minutes (5 for the GIF).

## Edit a photo

Replying to a photo (or sending the photo with the caption `/draw ...`), OpenAI **edits** that
photo (`v1/images/edits`) according to the request. A sticker works too; a GIF or a sticker becomes
a PNG.

```text
(replying to a photo)  /draw put a hat on it
(photo with the caption)    /draw turn it into a pencil drawing
```

## Animated GIF (`-gif`)

It's the `output_format: gif` of the `gpt-image-2.6-*` models, with `frame_count` frames of
`frame_duration_ms` each. On a photo, the GIF animates it; with no request, with a subtle, natural
movement.

```text
/draw -g a dancing cat
→ ⏳ Processing /draw, hold on.      (becomes: 🎞️ GIF generated below.)
→ (the GIF, looping) 🎞️ a dancing cat

/draw -g -f 6 -ms 300 a flag in the wind
(replying to a photo)  /draw -gif as if it were swimming
```

- Uses the model from the `gpt.image.gifModel` setting (default `gpt-image-2.6-flare`;
  `gpt-image-2.6-sunburst` is more detailed). Only the 2.6 family makes GIFs, and it **requires
  preview access**. Without it, the bot replies `🔒 Your account/model cannot make animated GIFs` with
  OpenAI's message.
- The GIF comes out with **9 frames of 200 ms** (1.8 s); the `gpt.gif.frames` (2 to 16) and
  `gpt.gif.frameMs` (20 to 2000) settings change that, and `-frames` and `-ms` override them on
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

## The "Processing" notice

An image can't be sent by editing a message, so the "⏳ Processing /draw, hold on." notice is edited
into **🖼️ Image generated below.** (🎞️ for a GIF, and 🔊 for the voice of `/tts`) and stays in the
chat; the result comes right after it. If it fails, the same notice becomes the error.

```text
/draw -p @me fulano draw the two of us rock climbing in Patagonia
⏳ Processing /draw, hold on.   →   🖼️ Image generated below.
(the image, with the 🎨 caption)
```

## With the profile photo of someone (`-profile`)

`-profile` (`-p`) adds the **WhatsApp profile photo** of one or more people to the images sent to
the model, next to the photo you reply to. It is how you put a friend in a drawing, or in the GIF of
a photo, without having to download and send their picture.

| After `-p` | Who it is |
|---|---|
| Name, plain: `fulano beltrano` | The first name (or the full name) of a contact in your address book, accent and case free; the first word that is **not** a contact starts the request. If several share it, the bot asks which |
| Name: `/Rafael Silva/` | The contact by name (like in [`/profile`](profile.md)); if several fit, the bot asks which |
| Mention: `@Rafael` | The mentioned person |
| `@me` or `$me` | **You**: your own profile photo (whoever typed the command) |
| `@this` or `$this` | **The chat you are in**: in a private chat, the other person; in a group, the **group photo** |
| `@reply` or `$reply` | **Who wrote the message you reply to**, in a private chat or in a group (needs a reply) |
| Number: `+5521999999999` | By number |
| *(nobody)*, in a private chat | The person of the chat (in your own chat, you) |
| *(nobody)*, in a group | Whoever wrote the message you reply to |

```text
/draw -p /Rafael Silva/ draw him as an astronaut on the moon
🎨 draw him as an astronaut on the moon
```

**A photo plus a profile.** Reply to a photo and the profile goes next to it, in this order: the
photo of the message first, then the profiles:

```text
(replying to a photo of a dog)
/draw -g -p /Rafael Silva/ make a gif of this dog giving Rafael a shot
🎞️ make a gif of this dog giving Rafael a shot
```

**Plain names, several at once.** After `-p` you can type the names as they are in your address book,
without slashes, as many as you want (up to 4). The words that are the first name (or the full
name) of a contact are people; the first one that is not starts the request. Joined with the photo
you replied to:

```text
(replying to a photo of a birthday cake)
/draw -p fulano beltrano put the two of them blowing out the candles on this cake
🎨 put the two of them blowing out the candles on this cake
```

The bot sends the model 3 images, in this order: the cake photo, Fulano's profile and Beltrano's. If
two contacts share the name (two "Maria"), it asks which one; to be exact, use `/Maria Lucia/`.
Mixing works too: `-p fulano @Maria +5521999999999 ...`.

**Yourself:** `@me` (or `$me`) is **your** profile photo, so you can be in the picture too, alone or
with friends:

```text
/draw -p @me draw me as a medieval knight
/draw -p @me fulano draw the two of us as pirates on a ship
(in the chat with Bruno)  /draw -p @me @this draw the two of us as pirates
(in a group)  /draw -p @this make a poster with this group's photo
🎨 draw the two of us as pirates on a ship
```

**The chat you are in:** `@this` (or `$this`) is the other person in a private chat and the
**group photo** in a group. Together with `@me`, it is how you and the person you are talking to
get into the same picture:

```text
(in the chat with Bruno)
/draw -p @me @this draw the two of us as astronauts
/draw -g -p @me @this the two of us dancing at a party

(in a group)
/draw -p @this make a poster with this group's photo
/draw -p @me @this put me and the group in a comic strip
```

**Who you are replying to:** `@reply` (or `$reply`) is whoever wrote the message you replied to, in a
group or in a private chat. Handy to put someone from the group in a picture with you:

```text
(in a group, replying to a message from Maria)
/draw -p @reply @me draw the two of us at the beach
/draw @reply turn her into a superhero        (without -p, at the start of the request)
```

Without a reply, the bot says `❌ /draw @reply needs a reply: answer a message from the person.`

**Without the `-p`:** `@me`/`$me` and `@this`/`$this` at the **start of the request** already count as
`-p`. The same goes after a flag like `-g`. Only these four variables: a loose `@mention` stays as
request text, and a variable in the middle of the sentence is just text:

```text
/draw @me @this draw the two of us as pirates          (same as /draw -p @me @this ...)
/draw -g $me $this the two of us dancing
/draw draw @me as an astronaut                         (no photo: @me is just text)
```

**Several people** (up to 4), as a group portrait:

```text
/draw -p /Rafael Silva/ /Maria Lucia/ draw the two of them at a birthday party
🎨 draw the two of them at a birthday party
```

**Without saying who:** in a private chat it is the other person; in a group, whoever wrote the
message you reply to:

```text
(in the private chat with Rafael)
/draw -p draw him as a cartoon character
🎨 draw him as a cartoon character

(in a group, replying to a message from Maria)
/draw -p turn her into a superhero
🎨 turn her into a superhero
```

**By mention or number:**

```text
/draw -p @Rafael make him a pirate
/draw -p +5521999999999 make a pop-art portrait
```

**What the model gets.** The bot tells which image is which, after your request (you don't see it):

```text
draw the two of them at a birthday party

Attached images, in this order: 1) the profile photo of Rafael Silva; 2) the profile photo of Maria Lucia.
```

**When it is refused:**

```text
/draw -p desenhe
❌ In a group, /draw -p needs someone: -p /Name/, -p @mention or reply to a message from the person.

/draw -p /Rafael Silva/ draw him as an astronaut
🙈 Fulano has no profile photo I can see (no photo, or hidden by privacy).
```

- Whoever has the photo hidden by privacy (or no photo) is refused, and nothing goes to OpenAI.
- Up to **4** profile photos at a time. More than that is refused.
- It is a single call, so it counts once in the [usage limit](bot.md#usage-limits-per-user-limit).
- It works with `-gif`, `-frames` and `-ms`, and with `/gpt -img` and `/gpt -gif`.
- Not allowed inside `/cron`: a scheduled message has no photo to reply to.

## Model the account doesn't have

The image models (`gpt.image.model` and `gpt.image.gifModel`) are free-text settings, because
the names change (`gpt-image-1` went offline on 2026-10-23, for example). If OpenAI replies that the
model doesn't exist, the bot lists the ones your key sees (similar to the feature) and shows the
`/set` to switch:

```text
❌ The model gpt-image-1 does not exist in your OpenAI account (image).
💡 Your key sees: gpt-image-2.5-flare, gpt-image-2.6-flare
💡 Change it with /set gpt.image.model <model>
```

`/draw -m` shows the image model and the GIF one, and switches each (`/draw -gif -m <model>`).
A model your key doesn't see isn't saved.
