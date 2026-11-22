# `/tts` · user

Role `admin`: only you and the extra admins. The owner can grant it to a person or group with
`/bot +u +cmd /tts` ([Delegating](index.md#delegating-an-admin-command)).

Turns text into a **voice note**: by default with a local Piper voice (no key, Portuguese or English by the text) or,
with `-gpt`, with ChatGPT (the OpenAI speech API, like [`/gpt -voice`](gpt.md#voice--voice)), which uses the
OpenAI key (`OPENAI_API_KEY` in `config/.env` or the `gpt.api.key` setting; the model, the voice and the style come from
the `gpt.tts.*` settings). The voice, the speed, the pitch and the volume come from the options or from the
`tts.*` settings.

```text
/tts [-gpt|-g] [-local|-l] [-voice|-v <name>] [-speed|-sp <%>] [-pitch|-pi <semitones>] [-volume|-vol <%>] [-pause|-pa <ms>] [-beat|-b <bpm>] [-beatvol|-bv <%>] [-quiet|-q] [-status|-s] [<text>]
```

| Option | Value | Description |
|---|---|---|
| `-quiet`, `-q` | | Does not show the engine tip ("💡 ... by ChatGPT, Tesseract, Piper...") at the end of the reply. To hide it always: the `tts.footer` setting off |
| *(none)* | `[<text>]` | What to speak, up to `tts.maxChars` characters (32000; the local voice speaks it all, ChatGPT in parts of 4096 that are joined into one audio). Typed text wins: replying to a message with text typed, the reply is ignored; with no text, the replied message is spoken |
| `-gpt`, `-g` | | Speaks with ChatGPT (OpenAI speech API, spends your account) instead of the local Piper voice. Without `-gpt` or `-local`, the [`tts.engine`](../settings.md) setting decides |
| `-local`, `-l` | | Speaks with the local Piper voice (no key, uses the server CPU), even with `tts.engine` at `gpt` |
| `-voice`, `-v` | `<name>` | The voice, by the name of the person. Local (Piper): Portuguese (Brazil): cadu, edresson, faber, jeff; Portuguese (Portugal): tugão; English (US): amy (low/medium), arctic, bryce, danny, hfc_female, hfc_male, hifi_tts_92, joe, john, kathleen (low/medium), kristin, kusal, l2arctic, lessac (low/medium/high), libritts, libritts_r, ljspeech (medium/high), mike, norman, reza_ibrahim, ryan (low/medium/high), sam; English (UK): alan (low/medium), alba, aru, cori (medium/high), jenny_dioco, northern_english_male, semaine, southern_english_female, vctk. Write just the name (`faber`), the name with the quality (`faber-medium`) or the full id (`pt_BR-faber-medium`); with several qualities the name alone is the medium one. The default is `tts.voice.pt` or `tts.voice.en`, by the language of the text; one not in the image is downloaded the first time. With `-gpt`: `alloy`, `ash`, `ballad`, `coral`, `echo`, `fable`, `nova`, `onyx`, `sage`, `shimmer`, `verse` (the default is `gpt.tts.voice`). `/tts -v` lists the Piper voices and `/tts -g -v` the ChatGPT ones. |
| `-speed`, `-sp` | `<percent>` | The speed of the voice, in % from 50 to 200 (`100` normal, `150` faster, `75` slower). The default is the `tts.speed` setting (`50`) for the local voice and `gpt.tts.speed` (`100`) with `-gpt` |
| `-pitch`, `-pi` | `<semitones>` | The pitch of the voice, in semitones from -12 to 12 (`0` normal, `3` higher, `-3` lower). The default is the `tts.pitch` setting |
| `-volume`, `-vol` | `<percent>` | The volume of the voice, in % from 20 to 300 (`100` normal, `200` twice as loud). The default is the `tts.volume` setting |
| `-pause`, `-pa` | `<ms>` | With several lines: the silence after the line, in ms from 0 to 3000 (default: `tts.pause`, 300). A blank line doubles it. On the first line, it is the default of all of them |
| `-beat`, `-b` | `<bpm>` | A hip-hop beat under the voice, from 60 to 180 bpm (`90` is a classic). See [Several lines and a beat](#several-lines-and-a-beat) |
| `-beatvol`, `-bv` | `<percent>` | The volume of the `-beat`, in % from 5 to 100 (default: `35`) |
| `-status`, `-s` | | Adds the call usage to a separate message: bytes sent (TX) and received (RX), tokens spent, estimated cost, and balance. To keep it always on: `/set gpt.status true` |

```text
/tts Good morning!                → a voice note saying it
/tts                              → replying to a text: speaks the message
/tts This is a test!              → replying to a text: speaks what was typed, the reply is ignored
/tts -s hello, how are you?   → the voice note plus the usage in the footer
/tts -speed 130 -pitch 3 Hi!   → faster and higher
/tts -voice amy Hi!            → another local voice (amy, amy-medium or en_US-amy-medium)
/tts -voice ryan Hello!         → another English voice
/tts -gpt -voice nova Hi!      → the nova voice of ChatGPT
/tts -v                       → lists the Piper voices
/tts -g -v                    → lists the ChatGPT voices
```

- Replying to an **audio**, it is transcribed first and the transcription is spoken.

## Several lines and a beat

A `/tts` with several lines makes **one** voice note (not one per line). The **first line has only the
options**: they are the defaults of all the lines. Each line below is a speech, and it can start with its own
options, which only count for it:

```text
/tts -local -voice tugão -speed 50 -pause 300 -beat 90
Yeah... Yeah... Chegou a Paçoquita!
-pitch 2 Direto da quebrada!
-speed 80 É a braba! É a bonita!

Respeita o amendoim!
```

- A line **with only options** (`-speed 80`) changes the defaults of the next lines. A **blank line** doubles
  the pause (it separates the stanzas).
- It is a text with lines when the first line has no text or some line starts with an option. A plain
  multi-line text is still one speech.
- Local voice only (`-gpt` would be one paid call per line). Up to 60 lines; `tts.maxChars` counts the sum.
  `{/command}`s work in each line.
- The pause between lines is `-pause` (ms; default: the `tts.pause` setting).
- **`-beat <bpm>`** puts a hip-hop beat (kick, snare, hi-hat and bass, **made by ffmpeg**: no audio file)
  under the voice. It starts one bar before the voice and ends one bar after it; `-beatvol` is its volume.
  It also works in a one-line `/tts`.
- A ready one: [`examples/tts-hip-hop.zb`](https://github.com/jpereira/zapbot/blob/main/examples/tts-hip-hop.zb)
  (`/alias -yes -examples tts-hip-hop` creates `/tts.hiphop`). Another one:
  [`examples/tts-lourival.zb`](https://github.com/jpereira/zapbot/blob/main/examples/tts-lourival.zb) (`/tts.lourival`,
  a rap about Lourival).

## Example: a hip-hop

The whole song of [`examples/tts-hip-hop.zb`](https://github.com/jpereira/zapbot/blob/main/examples/tts-hip-hop.zb),
as one message: a beat at 95 bpm under a voice that changes in each section (the lines with only options
change the pitch, the speed, the volume and the pause of the lines after them):

```text
/tts -l -v tugão -sp 55 -pi 0 -vol 100 -pa 250 -b 95 -bv 35
-pi -3 -sp 50 -pa 450
Yeah, yeah, ahn!
Direto da quebrada, chegando na fita...
Não é ouro, não é prata...
É PA-ÇO-QUI-TA!

-pi 0 -sp 75 -pa 150
Cheguei no mercado, já senti o clima,
Vi uma Paçoquita, minha autoestima anima!
Pequena no tamanho, gigante no sabor,
Amendoim na veia, é paixão, é amor!

Não quero diamante, nem relógio de grife,
Só quero Paçoquita pra melhorar meu pique!
Abri a embalagem, começou a emoção,
Deu uma esfarelada, caiu tudo no chão!

-pi -2 -sp 55 -vol 130 -pa 250
PA-PA-PA-PAÇOQUITA!
É A BRABA, É A BONITA!
PA-PA-PA-PAÇOQUITA!
DEU MOLE, A GENTE FRITA!

-sp 65 -pa 150
É doce, é gostosa, é pura tentação,
É o poder do amendoim dominando o mundão!

-pi 1 -sp 85 -vol 100 -pa 120
No bolso tem trocado, na mente um milhão,
Investimento certo é paçoca na mão!
Bitcoin sobe e desce, o mercado oscila,
Mas minha Paçoquita sempre me tranquiliza!

O DJ solta o beat, o grave faz tremer,
Abri outra paçoca, não consigo me conter!
Pode faltar dinheiro, pode faltar gasolina,
Mas não mexe na paçoca que a parada desafina!

-pi -2 -sp 55 -vol 130 -pa 250
PA-PA-PA-PAÇOQUITA!
É A BRABA, É A BONITA!
PA-PA-PA-PAÇOQUITA!
AMENDOIM QUE DOMINA!

-pi -3 -sp 50 -vol 100 -pa 600
Yeah... ahn...
Respeita o amendoim, meu parceiro...
Paçoquita no comando...
O resto é farelo!
```

- The first line is the defaults: local voice (`tugão`), the beat and its volume. The sections are the
  lines with only options (deep voice in the intro, fast flow in the verses, heavy bass in the chorus, and the
  speed going down in the outro). The lyrics are in Portuguese on purpose.
- The beat is the same in the whole audio: it is only the voice that changes by section.
- To speak **any text** over the beat, the same file has `/tuga.rap`: reply to a text with it (the voice is deep
  and slow, and what you type after it wins: `/tuga.rap -b 110 -sp 80`).
- To make it a shortcut (`/tts.hiphop`, with the lines as they are), load the example:
  `/alias -yes -examples tts-hip-hop`. What you type after the shortcut goes in the first line, so
  `/tts.hiphop -b 110 -bv 55` changes the beat.

## Who can use it

`/tts` is a **user** command: whoever is in `+u` uses the local voice (Piper), which is free. With ChatGPT (`-gpt`, or
`tts.engine` set to `gpt`) it spends the OpenAI key, so a user needs a [usage limit](bot.md#usage-limits-per-user-limit)
for it; without one the bot refuses and suggests the local voice. Only the ChatGPT calls count toward the limit.
Admins and the owner use ChatGPT without a limit.

```text
/bot +cmd /tts +limit 20/day /Sofia Izabel/    → Sofia uses ChatGPT up to 20 times a day (the local one is free)
```

## Commands in the text

The `{/command args}` of the text run before the speech, as in [`/me`](me.md) and
[`/cron`](cron.md#commands-in-the-text), and the reply goes in their place. The **slash is optional** for the
commands that exist: `{/stocks USD}` and `{stocks USD}` are the same, and `{name}` (not a command) stays as text.
Only the query commands run (`/crypto`, `/stocks`, `/weather`, `/uptime`, `/version`, `/news`, `/joke`...), the
options that change something are refused, and you need to be allowed to run each one. The reply is **cleaned to
be spoken**: no emoji, markdown, links or separators, and each line becomes a sentence. What you typed is spoken
as it is. A `\{` keeps the brace literal. The options inside the braces are of the command, not of `/tts`.

```text
/tts The dollar now is {/stocks USD}
/tts Good morning! Today in Recife: {weather Recife}
/alias /price /tts Bitcoin: {/crypto BTC}         → /price speaks the quote
```

The query commands also have a shortcut: `-tts` (`/crypto -tts BTC`, `/stocks -tts USD`, `/weather -tts`,
`/joke -tts`, `/uptime -tts`, `/version -tts`) is the same as `/tts -q {/crypto -q BTC}`, with the default voice and only the voice note (no footer).

## Trying the voices

To hear one phrase in several voices, save a [shortcut](alias.md) with a [`/batch`](batch.md). The `$@` is the
whole text typed after the shortcut, and the `-q` makes each `/tts` send only the audio:

```text
/alias /vfazol /batch -q
  /tts -q -l -v amy $@
  /tts -q -l -v ryan $@
  /tts -q -l -v lessac $@

/vfazol DO THE L!
```
