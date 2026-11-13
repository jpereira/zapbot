# `/tts` · admin

Role `admin`: only you and the extra admins. The owner can grant it to a person or group with
`/bot +u +cmd /tts` ([Delegating](index.md#delegating-an-admin-command)).

Turns text into a robot **voice note** with the OpenAI speech API, like [`/gpt -voz`](gpt.md#voice--voz).
It uses the OpenAI key (`OPENAI_API_KEY` in `config/.env` or the `openai.api.key` setting). The model,
the voice and the style come from the `openai.tts.*` settings.

```text
/tts [-status|-s] [<text>]
```

| Option | Value | Description |
|---|---|---|
| *(none)* | `[<text>]` | What to speak, up to 4096 characters. Replying to a message, the style of the speech |
| `-status`, `-s` | | Adds the call usage to a separate message: bytes sent (TX) and received (RX), tokens spent, estimated cost, and balance. To keep it always on: `/set openai.status true` |

```text
/tts Good morning!                → a voice note saying it
/tts                              → replying to a text: speaks the message
/tts speak slowly                 → replying to a text: speaks it in that style
```

- Replying to an **audio**, it is transcribed first and the transcription is spoken.
