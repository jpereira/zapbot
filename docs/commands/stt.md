# `/stt`

Transcribes the speech of a video or audio and replies with the **text**. It accepts a URL, or a
reply to a link, to a video or to an audio. [`/get -stt`](get.md#transcribe-the-speech--stt)
(or `/get -t`) is a shortcut to the same thing, for when you are already using `/get`.

It runs **inside the server**, with [faster-whisper](https://github.com/SYSTRAN/faster-whisper)
(open source, on the CPU): no OpenAI, no cost per minute, and the audio doesn't leave the homelab.

| Option | Value | Description |
|---|---|---|
| `-quiet`, `-q` | | Returns **only** the transcribed text: no header (language and duration), no engine tip and no `⏳` notice. With `-sum`, the summary and the text, with no titles. To hide the tip always: the `stt.footer` setting off |
| `-lang`, `-L` | `<code>` | The language of the speech: `pt`, `en`, `es`, `pt-br`... or `auto` (whisper detects it). With `-gpt`, it also goes to the OpenAI API. The default is the `stt.language` setting (`auto`). (`-l` is the short of `-local`) |
| `-model`, `-M` | `<name>` | The faster-whisper model (`tiny`, `base`, `small`, `medium`, `large-v3-turbo`...; bigger is better and slower; one that isn't in the image is downloaded the first time, or at the start with [`STT_MODELS`](../configuration.md#local-models-of-stt-and-tts)). With `-gpt`, the OpenAI model. The default is the `stt.model` setting |
| `-beam`, `-b` | `<1-10>` | The beam size of the local search: `1` is the fastest, more can get a little more right and takes longer. The default is the `stt.beam` setting |
| `-vad` | `<on\|off>` | `on`: skips the silence and the music before transcribing (where whisper invents text); `off`: transcribes it all. Local engine only. The default is the `stt.vad` setting |
| `-startSec`, `-ss` | `<time>` | Starts at this point (default 0), in seconds (`30`) or `min:sec` (`09:33`). With a `-` in front, counts from the **end** (`-60` is the last minute) |
| `-endSec`, `-es` | `<time>` | Ends at this point, in the same format as `-ss`; must be greater than the start |
| `-gpt`, `-g` | | Transcribes with ChatGPT (OpenAI API, spends your account) instead of the local faster-whisper. Without `-gpt` or `-local`, the [`stt.engine`](../settings.md) setting decides |
| `-local`, `-l` | | Transcribes with the local faster-whisper (no key, uses the server CPU), even with `stt.engine` at `gpt` |
| `-summary`, `-sum` | | Also summarizes the speech with ChatGPT (same key as [`/gpt`](gpt.md), which spends your OpenAI account): the summary in topics on top, the whole transcription below |
| `-verbose`, `-v` | | Shows the commands used in yt-dlp, ffmpeg and faster-whisper, and how long the transcription took |
| `<url>` | | Video or audio link; wins over the replied message |

```text
/stt https://www.instagram.com/reel/XXXXXXXX/
⏳ Transcribing the speech, this can take a while.   →   📝 Transcription · 🗣️ pt · 1:23
(the text)

/stt -ss 30 -es 90 https://youtu.be/XXXXXXXXXXX     → only from 0:30 to 1:30
/stt -sum https://www.instagram.com/reel/XXXXXXXX/
📝 Summary · 🗣️ pt · 1:23

• he shows how to make cheese bread
• three tips for it to puff up

📄 Transcription
(the whole text)

/stt -v <url>                                       → also shows the commands that ran
(reply to a message with a link)  /stt
(reply to a voice note)           /stt
(reply to any video or audio)     /stt
```

- **Any URL** that yt-dlp understands (Instagram, YouTube, X, TikTok...). The bot downloads only the
  **lowest-quality audio**, a few hundred KB per minute, not the video.
- **Any video or audio file** replied to: a voice note, a video, an `.mp3` or `.mp4` sent as a
  document. It is transcribed with no download. An image or a PDF is refused.
- The video or audio can also be sent with `/stt` as the caption (no reply).
- `-sum` also sends the text to ChatGPT (the `/gpt` key and model) and replies with the summary in
  topics on top and the whole transcription below. If ChatGPT fails (no balance, timeout), the
  transcription still comes, with the reason where the summary would be. Without a key, the bot says
  so before using the CPU.
- The language is detected by whisper; fix it with `/set stt.language pt` if it gets it
  wrong on a short clip. The model is `stt.model` (default `large-v3`, the best).
- At most `stt.maxMinutes` (default 20) of audio: for a longer one, pick a part with `-ss`
  and `-es`.
- A link with **no video or audio** (an Instagram carousel with only photos, for example) gets
  `This link has no video or audio to download (a post with only photos?)`.
- It shares the limit of 2 `/get` at once, and a URL to the internal network is refused. For
  Instagram and other sites that ask for login, it uses the same `cookies.txt` as
  [`/get`](get.md#content-that-needs-a-login). All the details are in
  [Transcribe the speech](get.md#transcribe-the-speech--stt).
