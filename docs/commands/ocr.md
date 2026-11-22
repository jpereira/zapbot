# `/ocr` · admin

Role `admin`: only you and the extra admins. The owner can grant it to a person or group with
`/bot +u +cmd /ocr` ([Delegating](index.md#delegating-an-admin-command)).

Reads the text in a **photo** and replies with it. Reply to the photo, or send the photo with `/ocr` as
the caption. There are two engines: **local** (Tesseract, runs on the server CPU, no key; the default)
and **ChatGPT** (vision, with `-gpt`), which uses the OpenAI key (`OPENAI_API_KEY` in `config/.env` or
the `gpt.api.key` setting), like [`/gpt`](gpt.md). The `ocr.engine` setting picks the default one and
`ocr.language` the languages of the local one (`por+eng`).

```text
/ocr [-gpt|-g] [-local|-l] [-status|-s]
```

| Option | Value | Description |
|---|---|---|
| `-gpt`, `-g` | | Reads with ChatGPT (OpenAI vision, spends your account) instead of the local Tesseract. Without `-gpt` or `-local`, the `ocr.engine` setting decides |
| `-local`, `-l` | | Reads with the local Tesseract (no key, runs on the server CPU), even when `ocr.engine` is `gpt` |
| `-status`, `-s` | | With `-gpt`: adds the call usage to the reply footer: bytes sent (TX) and received (RX), tokens spent, estimated cost, and balance. To keep it always on: `/set gpt.status true` |

```text
/ocr                         → replying to a photo: the text in it
/ocr -gpt                    → with ChatGPT
/ocr -s -gpt                 → with ChatGPT and the usage footer
```

- The text comes with a 📝 in front and keeps the line breaks, and a tip says which engine read it. A photo with no text gets a notice.
- Photos and stickers up to the same size limit as [`/gpt`](gpt.md#with-a-photo).
