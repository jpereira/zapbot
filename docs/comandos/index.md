# Commands

Commands are defined in
[`src/comandos/definicoes/`](https://github.com/jpereira/zapbot/tree/main/src/comandos/definicoes).
You can send them in **any chat** (private, group, or the chat with yourself).

## General syntax

```text
/comando [-opção] [-opção valor] [argumentos]
```

- Options use **a single hyphen** and accept the long or the short name: `-audio` = `-a`,
  `-startSec 10` = `-ss 10`. A value with a leading `-` is also fine when it's a time (`-ss -10`:
  the last 10 s).
- Every command accepts `-help` / `-h`: `/get -h` shows the help for that command only.
- `/help` lists the commands you can use (the owner and admins see all of them); `/help get` or
  `/help /get` show a specific one, and `/help -r` groups the list by role (`owner`, `admin`, and
  `user`).
- The commands have English names; every one has a fixed alias in Portuguese (`/desenhe`, `/tempo`,
  `/todos`, `/boletos`, `/cotacao`, `/traduzir`, `/enquete`, `/listageral`, `/notas`,
  `/mostrar`...) that keeps working. Aliases work just like the original command
  (`/download` = `/get`) and don't depend on the language. [`/alias`](alias.md) saves
  shortcuts with arguments or texts with several `{/comando}`; `/help alias` lists the shortcuts
  available to you.
- The language is the `zapbot.lang` setting (`en_US`, the default, or `pt_BR`; see
  [Language](../configuracao.md#language)). Today it translates `-h` and `/help`; the replies of
  the commands are still in Portuguese and are being migrated.
- Just type the beginning of the command: `/wat` or `/watc` become `/watch`. If the beginning
  matches more than one (`/wa`), the bot replies with the possible commands (`/walissu, /watch`).
  The exact name and the `/alias` shortcuts take priority.

## Destinations: contact, group, number, or email

Commands that send to destinations use **`-to`**: [`/cron`](cron.md), the alerts of
[`/rates`](rates.md#notify-another-chat-or-by-email) and [`/crypto`](crypto.md),
[`/defi -alerta`](defi.md#out-of-range-alert), [`/watch`](watch.md#notify-somewhere-else), and
[`/backup -send`](backup.md#send-the-file). `/bot -status` also accepts `-to`. These commands
accept several `-to`: the alert (or the message, or the file) goes out to each destination. The
target of [`/mute`](mute.md), the people in [`/bot +a`/`+u`](bot.md#extra-admins), and
[`/whois`](whois.md) use the same lookup. Without `-to`, alerts (and the `/backup` file) go to your
private chat, and `/cron` goes to the current chat.

| Form | Example | Finds |
|---|---|---|
| Name | `/Jorge Pereira/`, `"Jorge Pereira"` or `Jorge` | Searches contacts and groups; exact names take priority, and contacts win a tie. Your own name (the one saved in your contacts or the one in your profile) is your private chat |
| Group | `/Grupo L200/`, `"Grupo L200"` or `L200` | The group, with priority for the exact name |
| Mention | `@Fulano` (picked from WhatsApp's `@` list) | The mentioned person. Useful in a group, for someone who isn't in your contacts. A typed `@number` that isn't a mention is rejected |
| Number | `+5521999999999` | The number's private chat: country code + area code + number (the `+` is optional; the bot checks that it's on WhatsApp) |
| Email | `email`, `voce@exemplo.com` or `"a@x.com, b@y.com"` | In alerts (`/rates`, `/crypto`, and `/defi`), in `/watch`, in `/bot -status`, and in `/backup -send`: `email` is the `QRCODE_EMAIL_SMTP_TO`; it goes out through the bot's SMTP, without WhatsApp formatting ([Emails](../emails.md)) |

`/debug` uses `-copy-to` to copy logs to a chat, and doesn't accept email. `/watch -in` selects the
source of the messages: contact, group, or `@newsletter` channel.

The same forms, in a single command:

```text
/cron 8h -r diario -to /Jorge Pereira/ -to @Fulano Da Silva -to /Grupo L200/ -to +5521999999999 Bom dia!
/rates -alerta USD > 5.30 -to email           → by email (the QRCODE_EMAIL_SMTP_TO)
/crypto -alerta BTC < 90000 -to /Grupo L200/ -to email  → in the group and by email
/mute @Fulano Da Silva                          → the /mute target, by mention
/bot +a /Jorge Pereira/ +5511988887777         → /bot +a (and +u) accepts several people at once
```

- **Mention:** in a group, type `@` and pick the person from the WhatsApp list. In the message text
  it becomes an id (`@100000000000002`), and the bot identifies the person by the id that WhatsApp
  sends along. It works for someone who's in the group but not in your contacts. An `@number` typed
  by hand, without picking from the list, is rejected: for a number, use `+5521999999999`.
- `/cron` and `/mute` don't accept email: the `/cron` message goes out on WhatsApp, and `/mute`
  silences a person or a group. Admins (`/bot +a`) and `/whois` accept only people (contact,
  mention, or number); users (`/bot +u`), people and groups.
- A name matches when it has **all** the words, in any order, ignoring case and accents. In `-to`,
  names with spaces go between `/.../` or quotes (without them, only the first word counts); in
  `/mute`, the target is the rest of the text, with or without `/.../`.
- A **fully matching** name beats one that merely contains the words (and a contact beats a group).
- If more than one fits, the bot lists them and waits for you to **reply with just the number**,
  in the same chat, within 2 minutes:

```text
/mute /Jorge/
🔎 "Jorge" corresponde a 2 contatos:

1. 👤 Jorge Pereira · +5521999999999
2. 👤 Jorge Silva · +5511988888888

💡 Responda só com o nº (em até 2 minutos), ou repita o comando com mais palavras do nome.

1
🔇 Silenciado: 👤 Jorge Pereira — apagadas, editadas, status
```

With no reply in 2 minutes, nothing is done, and the list itself becomes the notice (no extra
message): `⌛ Nenhum nº escolhido para "Jorge" em 2 minutos: nada foi feito.`

## Permissions (`role`)

The person typing and each command have the same level: **owner > admin > user**. A command only
runs for someone with its level or higher.

| Level | Who | How they get in |
|---|---|---|
| `owner` | You: the account paired with the bot, from any device | Already are |
| `admin` | The extra admins (setting `bot.admins`) | `/bot +a /Jorge Pereira/`, `@Fulano Da Silva` or `+5521999999999` (see [Extra admins](bot.md#extra-admins)) |
| `user` | The people and groups in the `bot.users` setting | `/bot +u /Maria Lucia/ /Grupo Familia/` (see [Users](bot.md#users)) |

A command's `role` (the Role column in the table, and the `role` in the definition) is the minimum
level needed to use it:

| Role | Who uses it |
|---|---|
| `user` | Any of the three: the regular commands (`/get`, `/weather`, `/sticker`...) |
| `admin` | The admins and the owner (`/set`, `/alias`, `/backup`...) |
| `admin` · delegable | The admins and the owner, and the owner can **delegate** it to a user (or a group) by naming the command in a `+cmd` ("Only"): `/bot +u +cmd /gpt` |
| `owner` | Only the owner (no command today; the `/bot` options that change who has access are owner-only) |

Only the owner changes who has access: `+a`/`-a`, `+u`/`-u`, `+cmd`/`-cmd`, `-reset`, `-passwd`, and
`-flush-email`. An extra admin doesn't promote anyone, not even themselves. If someone tries a
command above their level, nothing happens in the chat; with [debug](debug.md) on, you get a notice
at `PHONE_NUMBER`:

```text
⚠️ Fulano tentou executar /show dentro de Família, mas sem permissão
```

`user` commands belong to whoever is in the `bot.users` setting, which **defaults to `false`**: only
you (and the extra admins) use commands. With `/bot +u /Maria Lucia/ /Grupo Familia/`, those people
(in any chat) and those groups (any member, inside the group) can use them too; a person's `/bot +u`
typed in a group only applies in that group; with `/set bot.users true`, everyone. `/bot +cmd` /
`-cmd` limits each user's commands. See [Users](bot.md#users). To find out your level (or, as
owner or admin, someone else's), use [`/whois`](whois.md). Anyone who isn't an admin has
[flood protection](bot.md#flood-protection): the same command, at most 3 times in 2 seconds.

### Delegating an admin command

A **delegable** `admin` command (the Summary table marks them) falls under the user rule only if
it's named in a `+cmd` ("Only"). `-cmd` ("All, except") and `bot.users = true` do **not** unlock it,
and `/bot +cmd` rejects a command the owner doesn't delegate (`/set`, `/bot`...).

```text
/bot +u +cmd /gpt                 → typed in the Familia group: everyone there uses only /gpt
/bot +u +cmd /gpt /Familia/       → the same, from any chat
/bot +cmd /show /Sofia Izabel/    → Sofia (who already has "Only") gets /show
/bot +u +cmd /rates,/gpt /Sofia Izabel/   → Sofia uses the named regular ones and /gpt
```

Even when delegated, the command doesn't let a user **adjust** anything: the options that change a
setting or delete data (`/gpt -model <modelo>`, `/stats -flush`, `/show -flush`...) reply
`⛔ Apenas o dono do bot (ou um admin) pode ...`. Only the owner and admins adjust things.

Whoever gets the command also sees **only the current chat**: whatever looks at other chats or at
your private chat replies `⛔ Apenas o dono do bot (ou um admin) pode ver outros chats.`

<!-- gerado:limites -->
| Command | Current chat only (left out) | Owner and admins only |
|---|---|---|
| `/crypto` |  | `-add`, `-del` |
| `/draw` |  | `-model` |
| `/gpt` |  | `-model`, `-img`, `-gif`, `-audio`, `-prices`, `-usage` |
| `/profile` | `[/contact/\|@mention\|+number]...` |  |
| `/rates` |  | `-add`, `-del` |
| `/show` | `-list`, `chat` | `-flush` |
| `/stats` | `-list`, `-me`, `</chat/>` | `-flush`, `-flush-all` |
| `/tldr` | `-chat`, `-pv` |  |
<!-- /gerado:limites -->

Someone who already uses all the regular commands (no rule, or "All, except") doesn't gain an
`admin` one with `+cmd`: the bot refuses and asks for the "Only" list with its commands. The
[`/alias`](alias.md) shortcuts follow the target: whoever can use `/gpt` uses the shortcuts for it,
and a shortcut's name doesn't go in `+cmd`.

<!-- gerado:roles -->
### Commands by role

**user** (whoever is in `bot.users`) (23):

[`/ascii`](ascii.md), [`/bills`](bills.md), [`/crypto`](crypto.md), [`/cve`](cve.md),
[`/get`](get.md), [`/giphy`](giphy.md), [`/help`](help.md), [`/joke`](joke.md),
[`/kernel`](kernel.md), [`/me`](me.md), [`/meme`](meme.md), [`/news`](news.md),
[`/noffa`](noffa.md), [`/ping`](ping.md), [`/pixelart`](pixelart.md), [`/rates`](rates.md),
[`/sticker`](sticker.md), [`/translate`](translate.md), [`/uptime`](uptime.md),
[`/version`](version.md), [`/walissu`](walissu.md), [`/weather`](weather.md), [`/whois`](whois.md)

**admin, delegable** (admins and the owner; the owner releases them to a user with `+cmd`) (9):

[`/draw`](draw.md), [`/everybody`](everybody.md), [`/gpt`](gpt.md), [`/members`](members.md),
[`/poll`](poll.md), [`/profile`](profile.md), [`/show`](show.md), [`/stats`](stats.md),
[`/tldr`](tldr.md)

**admin** (admins and the owner; never delegable) (19):

[`/alias`](alias.md), [`/backup`](backup.md), [`/batch`](batch.md), [`/block`](block.md),
[`/bot`](bot.md), [`/cache`](cache.md), [`/cron`](cron.md), [`/debug`](debug.md),
[`/defi`](defi.md), [`/join`](join.md), [`/leave`](leave.md), [`/monitor`](monitor.md),
[`/mute`](mute.md), [`/notes`](notes.md), [`/search`](search.md), [`/set`](set.md),
[`/unblock`](unblock.md), [`/unmute`](unmute.md), [`/watch`](watch.md)
<!-- /gerado:roles -->

The **bot's own replies** also go out through your account, but they're never treated as commands,
even if they start with `/`. Without that, someone could use a command that echoes text (e.g.,
`/noffa /cache -a`) to make the bot "type" an admin command.

## Summary

| Command | Aliases | Role | Description |
|---|---|:-:|---|
| [`/alias`](alias.md) | | `admin` | Registers, lists, and removes shortcuts for commands with arguments or texts with several `{/comando}` |
| [`/ascii`](ascii.md) | | `user` | The text in big ASCII letters, in a block that fits a phone screen |
| [`/backup`](backup.md) | `/bkp` | `admin` | Daily local backup and delivery through `backup.to`; lists, details, restores, and sends the database |
| [`/batch`](batch.md) | `/lote` | `admin` | Runs several commands from a single message, in sequence (each line that starts with a command opens a block), and replies with a summary; `-stop` and `-dry` |
| [`/bills`](bills.md) | `/boletos` | `user` | Draws 2 members to "pay a boleto" |
| [`/block`](block.md) | `/bloquear` | `admin` | Blocks one or more people on your WhatsApp account (replying to a message, whoever wrote it); with nothing, lists the blocked ones; `-mask` obfuscates phone numbers |
| [`/bot`](bot.md) | | `admin` | Bot status (24 h report and the users); turns commands on/off (`-on`/`-off`) and says who uses them: admins (`+a`/`-a`) and users (`+u`/`-u`, in any chat or just in one group, and each one's commands with `+cmd`/`-cmd`); `-reset` goes back to the default; `-status` (`-s`): report for the last 24 h, and `-s 06h` sends it every day; `-info` (`-i`): versions and system; `-test` (`-t`): tests cache, disk, database, WhatsApp, internet, SMTP, and programs |
| [`/cache`](cache.md) | | `admin` | Cache tree with sizes, message counts, and cleanup |
| [`/cron`](cron.md) | `/agenda`, `/lembrete` | `admin` | At the set time (`30m`, `às 18h`, `sexta 9h`...): sends a message (here or with `-to`, to one or several chats) or, as `/lembrete`, an ⏰ reminder; can repeat, be edited and paused, and run commands in the text (`{/crypto}`) |
| [`/crypto`](crypto.md) | `/bitcoio`, `/creptomoeda` | `user` | Quote for the enabled cryptos (default: BTC, ETH, SOL, and HYPE) or just the requested ones (`BTC ETH`); price alerts |
| [`/cve`](cve.md) | | `user` | Latest published CVEs (NVD); `-highscore` only the critical ones |
| [`/debug`](debug.md) | `/d`, `/dbg` | `admin` | Debug logs with levels, filtering, and copying to chats |
| [`/defi`](defi.md) | | `admin` | Liquidity positions on Orca and Project X: balance, range, price, and fees to collect, read on-chain; `-alerta` warns when it leaves and returns to the range and when fees go over a value. `liquidswap`: LP positions on Aptos. `morpho` and `aave`: position, loans, and risk on Morpho and Aave V3 |
| [`/draw`](draw.md) | `/desenhe`, `/desenha`, `/img` | `admin` · delegable | Draws an image or an animated GIF (`-gif`) with GPT Image (OpenAI); on a photo, edits or animates it |
| [`/everybody`](everybody.md) | `/todos`, `/todes` | `admin` · delegable | Mentions everyone in the group |
| [`/get`](get.md) | `/download` | `user` | Downloads video/audio from social networks or from the replied media |
| [`/giphy`](giphy.md) | `/gif` | `user` | GIPHY GIF by tag, URL, or ID, sent looping |
| [`/gpt`](gpt.md) | `/ai` | `admin` · delegable | Asks ChatGPT (OpenAI); `-img`, `-gif`, `-voz`, `-prices` and `-usage` |
| [`/help`](help.md) | `/h`, `/ajuda` | `user` | Help menu, only with the commands the requester can use |
| [`/join`](join.md) | `/entrar` | `admin` | Joins a group through the invite link (`-info` shows the group without joining); `-l` lists your groups |
| [`/joke`](joke.md) | `/piada`, `/humor` | `user` | Random joke in Portuguese |
| [`/kernel`](kernel.md) | | `user` | Current Linux kernel versions (kernel.org) |
| [`/leave`](leave.md) | `/sair` | `admin` | Leaves one or more groups, by name or by list number; `-l` lists your groups |
| [`/me`](me.md) | | `user` | Sends the typed message; `{/comando}` runs and the reply goes in its place, `\n` breaks the line |
| [`/members`](members.md) | `/listageral`, `/list` | `admin` · delegable | Lists the group's members |
| [`/meme`](meme.md) | | `user` | Random meme template (imgflip) |
| [`/monitor`](monitor.md) | | `admin` | 👀 Up to 5 contacts, limited history, per-contact filter, and online-presence alerts |
| [`/mute`](mute.md) | `/mudo` | `admin` | Silences the notices for deleted, edited, status, and reactions (and those from `/watch`) of a person, a group, or a community; replying to a notice, from where it came |
| [`/news`](news.md) | `/noticias` | `user` | Headlines from RSS feeds: `-hack`, `-g1`, `-gazeta`, `-brasil` |
| [`/noffa`](noffa.md) | `/🌈`, `/🏳️‍🌈` | `user` | Decorates the text with rainbows |
| [`/notes`](notes.md) | `/notas` | `admin` | Notes with ID and `#tag` (`-a`, `-l`, `-s`, `-r`): view with the media (`-v`), edit (`-u`), rename a tag (`-m`), describe a tag (`-d`), export to PDF (`-e`), and `-alerta` that notifies at a date/time |
| [`/ping`](ping.md) | | `user` | Checks whether the bot is alive |
| [`/pixelart`](pixelart.md) | `/ansi`, `/px` | `user` | Random ANSI/ASCII art (16colo.rs) |
| [`/poll`](poll.md) | `/enquete`, `/quiz` | `admin` · delegable | Creates a native WhatsApp poll in the chat; `-r` shows the result |
| [`/profile`](profile.md) | `/perfil` | `admin` · delegable | A contact's profile picture, with the name from your contacts and the phone number |
| [`/rates`](rates.md) | `/cotacao`, `/cambio` | `user` | EUR and USDT (and USD, GBP) quotes against the real: current, open, close, and change; price alerts |
| [`/search`](search.md) | `/buscar` | `admin` | Searches the WhatsApp Web history, not just the cache: in this chat or, in your private chat, in all of them (`-N` for more); `-mask` obfuscates phone numbers |
| [`/set`](set.md) | `/config` | `admin` | Lists and changes the settings; `-a`/`-rm` add and remove items in lists (e.g., `bot.admins` and `bot.users`) |
| [`/show`](show.md) | `/mostrar` | `admin` · delegable | In your private chat, lists the cache; redisplays deleted messages, edits (`-e`), status (`-s`), and removed or changed reactions (`-r`); `-q` searches (text or regex) and `-mask` obfuscates phone numbers |
| [`/stats`](stats.md) | `/estatisticas` | `admin` · delegable | Ranking for this chat or another (`/Grupo/`): who talks, deletes, and edits the most, peak hours; `-me` for yours, `-l` lists the chats, `-flush` deletes |
| [`/sticker`](sticker.md) | `/figurinha` | `user` | Sticker from an image, video, or link (the `/get -st`); with `-txt`, an animated text sticker |
| [`/tldr`](tldr.md) | `/resumo` | `admin` · delegable | Summarizes the chat's conversation with ChatGPT (`30m`, `2h`, `1d`, `1h30m` or `300` messages; replying to a message, from it on) |
| [`/translate`](translate.md) | `/traduzir` | `user` | Translates the text or the replied message with Google Translate, no key; `-para en` changes the language |
| [`/unblock`](unblock.md) | `/desbloquear` | `admin` | Unblocks a person: by name, by number, by the `/block` list number, or by replying to a message |
| [`/unmute`](unmute.md) | `/desmutar` | `admin` | Undoes the `/mute` silence: by name, by list number, by replying to a notice, or all (`-all`) |
| [`/uptime`](uptime.md) | | `user` | Run time and connection time |
| [`/version`](version.md) | `/versao` | `user` | Bot version (same banner as `/uptime`) |
| [`/walissu`](walissu.md) | `/ualisu` | `user` | Walissu CVE BOT: tags 2 members with a random CVE |
| [`/watch`](watch.md) | `/vigiar` | `admin` | Text/regex rules, with an optional source in `-in`; lists occurrences, searches them with `-q`, and notifies the `-to` destinations; `-mask` obfuscates phone numbers and `-mask N` turns on 🔒 for rule N |
| [`/weather`](weather.md) | `/tempo` | `user` | Weather now and the day's max/min (Open-Meteo); `/weather 16d` shows up to 16 days, counting today; without a city it uses `tempo.city` |
| [`/whois`](whois.md) | `/who`, `/id` | `user` | Who you are and what you can do in the bot, in this chat: 🤖 owner, 👑 admin, 🗣️ user, or 🚫 no permission; the owner and admins see others |
