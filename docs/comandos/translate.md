# `/translate` (`/traduzir`)

Translates text with Google Translate, no key and no cost. When replying to a message, it translates
that message's text. The source language is detected automatically; the target is Portuguese, or the
one given with `-para`.

| Option | Value | Description |
|---|---|---|
| `[texto]` | | The text (up to 5000 characters, line breaks included). Without it, the replied message |
| `-para`, `-p` | `<idioma>` | Target language, by code: `en`, `es`, `fr`, `it`, `de`, `ja`, `zh-CN`... Case doesn't matter. Default: setting `traduzir.lang` (`pt`) |
| `-list`, `-l` | | Lists the accepted languages, with their code |

```text
/translate Where is the nearest pharmacy?
/translate -para en Onde fica a farmácia mais próxima?
/translate -p es               (replying to a message)
/translate -l                   → the languages and codes
/set traduzir.lang en          → changes the default language
```

```text
/translate Where is the nearest pharmacy?
🌐 Tradução (en → pt)

Onde fica a farmácia mais próxima?
```

If the text is already in the target language, the reply adds a tip to use `-para` with another
language.

It's not admin: anyone in `bot.users` can use it (with it set to `true`, anyone).

## How it works

The bot uses the [`google-translate-api-x`](https://github.com/AidanWelch/google-translate-api)
package, which makes the same request as the `translate.google.com` site. That's why it needs no key,
no Google Cloud project and no billing.

It's an **unofficial** access: Google doesn't guarantee it will stay the same and may limit usage per
IP address. If that happens, the bot warns you:

| Reply | Cause |
|---|---|
| `💸 O Google Translate limitou os pedidos deste servidor` | Too many requests from the same IP in a short time. Try again later |
| `⛔ O Google recusou o pedido deste servidor` | Google blocked the IP. Try again later |
| `⏱️ O Google Translate não respondeu` | Over 15 seconds without a response |
| `❌ Idioma inválido` | The code doesn't exist: see the accepted ones with `/translate -l` |

For heavy use or use that can't fail, Google has the official paid API (Cloud Translation); the bot
no longer uses that API.
