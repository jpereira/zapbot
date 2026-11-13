# `/ocr` · admin

Role `admin`: only you and the extra admins. The owner can grant it to a person or group with
`/bot +u +cmd /ocr` ([Delegating](index.md#delegating-an-admin-command)).

Reads the text in a **photo** with ChatGPT (vision) and replies with it. Reply to the photo, or send
the photo with `/ocr` as the caption. It uses the OpenAI key (`OPENAI_API_KEY` in `config/.env` or the
`openai.api.key` setting), like [`/gpt`](gpt.md).

```text
/ocr [-status|-s]
```

| Option | Value | Description |
|---|---|---|
| `-status`, `-s` | | Adds the call usage to the reply footer: bytes sent (TX) and received (RX), tokens spent, estimated cost, and balance. To keep it always on: `/set openai.status true` |

```text
/ocr                         → replying to a photo: the text in it
/ocr -s                      → with the usage footer
```

- The text comes with a 📝 in front and keeps the line breaks. A photo with no text gets a notice.
- Photos and stickers up to the same size limit as [`/gpt`](gpt.md#with-a-photo).
