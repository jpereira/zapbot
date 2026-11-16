# `/usage`

Your **usage limits**: for each command the owner limited with `+limit`, how many calls you used,
the limit and when it renews. Only successful calls count: `-h`, usage, errors and failures do not.

| Option | Value | Description |
|---|---|---|
| *(none)* | | Your limits here: used, limit and when it renews |
| `-log`, `-l` | | The last calls that counted: when, command and parameters |

| Argument | Description |
|---|---|
| `[person...]` | Owner and admins only: `/name/`, `@mention` or `+number`. The lookup is the same as `-to` ([Destinations](index.md#destinations-contact-group-number-or-email)) |
| *(replying to a message)* | Owner and admins only: the limits of whoever wrote the message |

The limit is set by the owner in [`/bot`](bot.md#usage-limits-per-user-limit); the owner and the
admins never have one. `/usage` always goes through, like `/help` and [`/whois`](whois.md).

**What the user sees** (the limit is `/gpt` 3 per day):

```text
/usage
⏱️ *Usage limits*
• /gpt  2/3 per day · renews Tue 17/11 00:00
• /tldr  0/3 per day · renews Tue 17/11 00:00
```

```text
/usage -l
🕘 *Last calls that counted*
• Mon 16/11 09:37 · /gpt resuma o texto
• Mon 16/11 09:37 · /gpt -img um gato astronauta
• Mon 16/11 09:37 · /gpt quem descobriu o Brasil?
```

**When the limit runs out**, the command does not even run (so it does not spend your ChatGPT
credit):

```text
/gpt what is the capital of France?
🚫 /gpt limit reached: 3 of 3 per day. It renews on Tue 17/11 00:00.
```

**The owner looks up someone** (and sees the same thing in `/whois` and `/bot -list-users`):

```text
/usage +5521911111111
⏱️ *Usage limits*
• /gpt  3/3 per day · renews Tue 17/11 00:00
• /tldr  0/3 per day · renews Tue 17/11 00:00
```

```text
/usage                       → your limits
/usage -l                    → your last calls
/usage /Rafael Silva/        → (owner and admins) Rafael's limits
/usage -l @Fulano            → (owner and admins) his last calls
```

After each call that counted, the bot adds a footer with what is left (setting `usage.footer`, on by
default):

```text
📊 /gpt: 1 of 3 per day left
```

The history (`-l`) is kept for `usage.logDays` days (90 by default); the calls that still count for
a limit are never deleted before the period ends.
