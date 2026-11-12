# `/bot` · admin

Turns the bot on and off, says who can use it, and shows its status (the report for the last 24 h, the
users and the daily delivery), the versions of what it uses
([System information](#system-information)) and a general test with ✅/❌
([Bot test](#bot-test)). Everything survives restarts:

- **On/off** (default on): when off, the bot ignores **all** commands, including yours, except `/bot`
  itself. The admins and the users stay on the lists.
- **Who uses the commands**:
    - **You** (the owner) use everything.
    - The **admins** ([`+a`](#extra-admins)) also use everything.
    - The **users** ([`+u`](#users)) use the commands with the `user` role (see the Role column of
      the [command table](index.md#summary): `/get`, `/weather`...): in any chat, only in one group (the
      whole group) or only one person in a group. An `admin` command (`/gpt`, `/show`...) only with
      the [delegation](index.md#delegating-an-admin-command) of `+cmd`.
    - Everyone else is silently ignored. By default there are no users: only you (and the admins) use
      commands.

| Option | Description |
|---|---|
| *(none)* | The status: same as `-status`. See [Bot status](#bot-status) |
| `-on` | Turns the bot on |
| `-off` | Turns off all the bot's commands, except `/bot` (the admins and the users stay on the lists) |
| `+a`, `-a` | `[person...]`: adds (`+a`) and removes (`-a`) admins. With nobody, the person in the private chat where you typed it. See [Extra admins](#extra-admins) |
| `+u`, `-u` | `[person\|group...]`: adds (`+u`) and removes (`-u`) users. Typed in a group, the `+u` of a person only applies in that group. With nobody, the current chat: the group or the person in the private chat. See [Users](#users) |
| `+cmd`, `-cmd` | `<commands>`: a user's commands. With `+u`, sets them (`+cmd`: only these; `-cmd`: all, except these); alone, `+cmd` grants and `-cmd` removes. See [Each user's commands](#each-users-commands) |
| `-list-users`, `-lu` | `[all]`: the users of this chat; with `all`, everyone, in any chat (in a group, the phone of those from outside is hidden). Accepts `-mask`. See [User list](#user-list) |
| `-reset`, `-r` | `[force]`: removes all users and their limits (the extra admins and the on/off stay). With `force`, everything goes back to the default: it also removes the extra admins and turns the bot on. Both ask first. Accepts `-mask`; the other options are refused. Owner only. See [Back to the default](#back-to-the-default) |
| `-status`, `-s` | The status now and its daily delivery (`[<time>\|off]`). Accepts `-to` and `-mask`; the other options are refused. See [Bot status](#bot-status) |
| `-to` | `<destination>`: together with `-status`, where the report goes (person, group or email; repeat for several). See [Bot status](#bot-status) |
| `-info`, `-i` | Versions of the bot and of what it uses, and the system. Accepts `-mask`; the other options are refused. See [System information](#system-information) |
| `-test`, `-t` | Tests everything (cache, disk, database, WhatsApp, internet, speed, SMTP, IMAP and programs), with ✅ or ❌ on each item. The other options are refused. See [Bot test](#bot-test) |
| `-passwd` | `<password\|off>`: owner only. Sets the password for `-login` (min. 8 characters; only the scrypt hash is stored in the database, in the `bot.login` setting). With `off`, turns login off |
| `-login` | `<password>`: for outsiders, in private only. With the right password, the person goes into `bot.admins` and the owner is notified by WhatsApp and email. 5 wrong tries, 15 min blocked. The password is deleted from the message database. To revoke: `/bot -a +number` |
| `-flush-email`, `-fe` | `[true]`: connects to the email IMAP (needs `QRCODE_EMAIL_IMAP_HOST`) and shows how many messages are in Sent and Trash; with `true`, deletes them all. Only the owner deletes. The other options are refused. See [Cleaning the email](#cleaning-the-email) |
| `-mask`, `-m` | Obfuscates phone numbers in the output of this run. E.g.: `+55219****44` |

Use `/bot -list-users -mask` to show names with obfuscated phone numbers. The mask keeps the first
five and the last two digits, also applies to the report sent with `-to`, and is not enabled for the
daily deliveries. Permissions and destinations use the full numbers.

`-on`/ `-off` combines with `-list-users [all]` (`/bot -on -list-users` turns it on and shows the
users); `-on` with `-off` in the same command is refused. `+a`/ `-a`/ `+u`/ `-u` go one at a time;
together with them, `+cmd`/ `-cmd` (only with users) and `-list-users all` (the reply with everyone).

## User list

The list shows up in the status (`/bot` with no option), in `-list-users [all]` and in the reply of
`+a`/ `-a`/ `+u`/ `-u`. It joins the admins and the users, the way the rest of the bot shows a
destination: `👤 Name · +number` (or just `👤 +number`, without the contact in the address book) and
`👥 Group`; whoever only uses it in a group, with `só em 👥 Grupo` (or `só neste grupo`). Someone who
is both admin and user appears once, with both marks; you, if you are on it, with `🤖 dono`. Below,
the **Permissões** explain what each mark means.

```text
/bot -list-users               (no seu privado)
Usuários (4)
• 👑 +a · 👤 Jorge Pereira · +5521999999999
• 👑 +a 🗣️ +u · 👤 Ana Souza · +5511988887777
• 🗣️ +u · 👤 Maria Lucia · +5521999982222
• 🗣️ +u · 👤 Maria Lucia · +5521999986666 · só em 👥 Amigos Faculdade

Permissões
👑 +a: admin, usa tudo
🗣️ +u: usuário, usa os comandos comuns
```

### Who shows up in the list

The list is the one for the chat where you typed it:

| Where | Who shows up |
|---|---|
| In your private chat | Everyone |
| In a group | Those who are in it, the group itself and those who only use it there |
| In someone's private chat | Only that person |
| Anywhere, with `-list-users all` (`-lu all`) | Everyone |

When someone is left out, the list says how many and how to see everyone, being careful not to expose
in the group who isn't from there:

```text
/bot -list-users               (no grupo Amigos Faculdade)
Usuários (2) neste grupo
• 🗣️ +u · 👤 Jorge Chip L200 · +5521999983333
• 🗣️ +u · 👤 Sofia Izabel · +5521•••••7777 · só neste grupo

Permissões
👑 +a: admin, usa tudo
🗣️ +u: usuário, usa os comandos comuns

💡 Só quem é deste grupo; mais 1 fora daqui.
⚠️ Para listar todos: /bot -list-users all ou /bot -lu all. Cuidado: mostra também quem não é deste grupo.
```

In a group, the phone of someone who isn't in it is hidden (the country code, the area code and the
last 4 digits), also with `-list-users all`. In your private chat (or the person's), it shows in full.

With everyone allowed (`/set bot.users true`), the list shows only the admins, and `/bot` warns that
anyone is using the commands:

```text
▶️ Bot: ativo
🔓 Comandos: todos usam os comuns
⚠️ Atenção: qualquer pessoa pode executar os comandos comuns do bot, em qualquer chat. Para restringir: /set bot.users false (e depois /bot +u para liberar alguns).
```

When to use each option:

| Situation | Command |
|---|---|
| Someone is abusing the commands in a group | `/bot -u`, typed in the group (or `/bot -u /Grupo/`) |
| Allow the bot for the family, only in their group | `/bot +u`, typed in the group (or `/bot +u /Grupo Familia/` from any chat) |
| Allow it for one person, in any chat | `/bot +u /Maria Lucia/` |
| Allow only some commands for someone | `/bot +u +cmd /rates,/crypto /Sofia Izabel/` |
| Allow only `/gpt` for the Familia group | `/bot +u +cmd /gpt`, typed in the group (or `/bot +u +cmd /gpt /Familia/`) |
| Give someone the admin and owner commands | `/bot +a /Jorge Pereira/` |
| Stop the bot completely for a while, without taking down the container | `/bot -off` |
| Remove all users at once (the admins stay) | `/bot -reset` |
| Undo everything: only you again, no admins or users | `/bot -reset force` |

Details:

- With the bot off, `/set` is also ignored: to turn it on, always use `/bot -on`.
- If the bot restarts off, or with only you using commands, the startup message in your private chat
  warns you.
- Only the **commands** are affected: recovery of deleted and edited messages, `/watch` and the price
  alerts keep working.
- Ignored commands show up in the log: `Comando '/ping' ignorado: bot desligado` (always) and
  `Comando '/ping' de Fulano ignorado: fora do bot.users` (only with [debug](debug.md) on).
- "You" is the account paired with the bot, from any device. To turn off only some commands, for
  everyone, use the `commands.disabled` setting.

## Extra admins

Other people can use the **admin** and **owner** commands (the ones with that role in the
[command table](index.md#summary)), and also the common ones, in any chat, if you make them admins:

```text
/bot +a /Jorge Pereira/               → adds, by contact name
/bot +a +5521999999999                → or by number
/bot +a @Fulano Da Silva              → or, in a group, by mentioning the person
/bot +a                               → in someone's private chat: that person
/bot -a /Jorge Pereira/               → removes
/bot -list-users                           → the list: 👑 +a · 👤 Jorge Pereira · +5521999999999
```

The name is searched like in `-to` ([Destinations](index.md#destinations-contact-group-number-or-email)):
a contact from your address book, and if more than one fits, the list for you to reply with the no.
Names with spaces go between `/.../` or quotes; several at once, separated by space
(`/bot +a /Jorge Pereira/ "Ana Souza" +5511988887777`). What's stored is the **phone** (that's what
the bot compares with whoever sends the command), and the list shows the name next to it. Email is
refused, and so is a contact whose phone WhatsApp doesn't give, only the internal id (LID): use the
number.

- **A group can't be admin**: everyone in it would control the bot (`/set`, `/backup -send` with the
  whole database...). `/bot +a /Grupo/` (or `/bot +a` typed in a group) is refused and suggests
  `/bot +u`, which allows only the common commands.
- Only **you** (the owner, the paired account) add and remove admins: an extra admin can't give
  themselves (or others) that access.
- The number is compared with the phone of whoever sent the message. If WhatsApp only gives the
  person's LID (the internal id) and the bot can't get the phone, they aren't recognized as admin.
- An extra admin's commands act like yours: the notices that go "to your private chat" (alerts,
  `-pv`, `/watch`...) go to **your** private chat, not theirs. Admins also manage the currencies of
  `/rates` and `/crypto`, the price alerts and the `/show -f` cleanup.
- In a choice list (several contacts with the name), only whoever gave the command replies with the
  no.
- Give this access only to whoever you trust: an admin can, for example, delete the cache
  (`/cache -a`) or restore a backup.

## Users

Users use the commands with the **`user`** role (see the Role column of the
[command table](index.md#summary)). The `owner` ones stay only yours and the admins', and so do the
`admin` ones, unless you [delegate](index.md#delegating-an-admin-command) them with `+cmd`.

| Who | Where they use it |
|---|---|
| A person, added in your private chat or theirs (`/bot +u /Maria Lucia/`) | In any chat |
| A person, added in a group (`/bot +u /Maria Lucia/`, typed in the group) | Only in that group. In private, the bot replies where they can |
| A group (`/bot +u`, typed in the group, or `/bot +u /Amigos Faculdade/`) | Anyone, inside the group (not in each one's private chat) |
| Nobody, the default (`/set bot.users false`) | Only you and the admins use commands |
| Everyone (`/set bot.users true`) | Anyone, in any chat (`/bot` warns) |

```text
/bot +u /Maria Lucia/                      → no seu privado: a Maria, em qualquer chat
/bot +u /Maria Lucia/                      → no grupo Amigos Faculdade: a Maria, só nele
/bot +u                                    → digitado num grupo: o grupo; no privado de alguém: a pessoa
/bot +u /Amigos Faculdade/ @Fulano +5521999999999  → vários de uma vez
/bot -u /Maria Lucia/                      → no grupo: tira a permissão de lá
/bot -u /Maria Lucia/                      → no seu privado: tira todas as da Maria
/bot -u                                    → tira o chat atual
```

Someone who only has permission in groups and sends a command in private gets:

```text
🚫 Sem permissão para comandos no privado. Permitido apenas em: 👥 Amigos Faculdade.
```

The reply of `+a`/ `-a`/ `+u`/ `-u` is the chat's [user list](#user-list), with ✅ on whoever
just came in; whoever left comes in a 🗑️ line on top. With nobody on the list, it shows the line
about who uses the commands (`🔒 Comandos: só o dono`):

```text
/bot +u /Sofia Izabel/    (no grupo Amigos Faculdade)
Usuários (2) neste grupo
• 🗣️ +u · 👤 Jorge Chip L200 · +5521999983333
• 🗣️ +u · 👤 Sofia Izabel · +5521•••••7777 · só neste grupo ✅

Permissões
👑 +a: admin, usa tudo
🗣️ +u: usuário, usa os comandos comuns

💡 Só quem é deste grupo; mais 1 fora daqui.
Listar usuários: /bot -list-users
```

```text
/bot -u /Sofia Izabel/    (no grupo Amigos Faculdade)
🗑️ 👤 Sofia Izabel · +5521•••••7777 · só neste grupo

Usuários (1) neste grupo
• 🗣️ +u · 👤 Jorge Chip L200 · +5521999983333
...
```

- People are searched like admins (name, mention or number), and groups by name, like in `-to`. What's
  stored is the person's phone and the group's id; the list shows the names.
- In the group, `-u` removes that group's permission (or, if the person only has the any-chat one,
  that one); in your private chat, it removes all of the person's.
- Someone who already uses it in any chat gains nothing from `+u` in a group: the bot replies that
  they are already a user.
- With everyone allowed (`/set bot.users true`), `/bot +u /Fulano/` is refused: to allow only some,
  `/set bot.users false` first.
- `/bot +u` with nobody in **your** private chat is refused (you already use everything); so is one in
  the private chat of someone whose phone WhatsApp doesn't give, only the internal id (LID): use the
  number.
- Only **you** add and remove users, like the admins.

### Each user's commands

A user (a person or a group) can be limited to some common commands, or receive a command with the
`admin` role (`/gpt`, `/show`...). `/help` and `/whois` always go through (`/help` shows only theirs).

```text
/bot +cmd /rates,/crypto,/meme +u /Sofia Izabel/  → a Sofia entra só com esses
/bot +u +cmd /rates                               → digitado num grupo: o grupo inteiro, só /rates
/bot +u -cmd /meme /Fulano/                         → o Fulano usa todos, menos /meme
/bot +cmd /weather /Sofia Izabel/                     → acrescenta /weather aos dela
/bot -cmd /rates /Fulano Pereira/                 → tira /rates dos dele
/bot -cmd /meme /Grupo Familia/ /Fulano da Silva/   → vários de uma vez
/bot -cmd /meme                                     → do chat atual (o grupo, ou a pessoa do privado)
/bot +cmd all /Sofia Izabel/                        → a Sofia volta a usar todos os comuns
/bot +u +cmd /gpt                                   → digitado num grupo: todos ali usam só o /gpt
```

- `+cmd` on someone who isn't a user yet already adds the person (or the group), with only those
  commands. On someone who uses all, it changes nothing; on someone with "Todos, menos", it allows
  those again.
- `-cmd` on someone who uses all leaves "Todos, menos" those. Removing the last command of a list is
  refused: to remove the person, `/bot -u`; to allow all, `/bot +cmd all`.
- Commands go by name or alias (`/creptomoeda` becomes `/crypto`), separated by commas. An `owner`
  command (`/set`, `/bot`...) doesn't go in: the bot refuses. An `admin` one (`/gpt`, `/show`...)
  goes in only in an "Apenas" list: `-cmd` ("Todos, menos") and `bot.users = true` don't allow it,
  and someone who already uses all the common ones doesn't get it with `+cmd` (the bot refuses and
  asks for the "Apenas" list). To add an `admin` one to someone who uses the common ones, list their
  commands: `+u +cmd /rates,/gpt`.
- The name of a shortcut from [`/alias`](alias.md) doesn't go in `+cmd`: the shortcut inherits the
  permission of the target command (whoever can use `/gpt` uses the shortcuts for it).
- In a group, the person is the one from there (like in `+u`); if they are a user in any chat, that's
  the permission that changes.
- In the list, under the person, `→ Apenas: /rates, /crypto, /meme` or `→ Todos, menos: /meme`:

```text
Usuários (2)
• 🗣️ +u · 👤 Jorge Chip L200 · +5521999983333
• 🗣️ +u · 👤 Sofia Izabel · +5521999987777 ✅
 → Apenas: /rates, /crypto, /meme

Permissões
👑 +a: admin, usa tudo
🗣️ +u: usuário, usa os comandos comuns
```

- Outside the list, the bot replies `🚫 Limitado aos comandos: /rates, /crypto, /meme.` (or
  `🚫 O /meme não está liberado para você.`).
- If more than one permission applies there (the person and the group, for example), the broadest
  one wins: one with no limit allows all the common ones.
- `-u` and `-reset` (with or without `force`) remove the limits too.

### Flood protection

Whoever isn't an admin (the users and, with `/set bot.users true`, everyone) can repeat the same
command at most 3 times in 2 seconds. Past that, the bot warns once and ignores all of the person's
commands until the interval ends:

```text
⚠️ Não é permitido executar o mesmo comando mais de 3 vezes seguidas. Aguarde 2 segundos.
```

- Aliases count as the command (`/noffa` and `/🌈` are the same); different commands count
  separately.
- You and the admins have no limit.
- The limits are settings: `/set flood.maxCommandRepeated 5` (`0` turns it off) and
  `/set flood.intervalCommand 10` (in seconds). See [Settings](../settings.md).

## Back to the default

Two levels, both owner-only and both ask for confirmation: reply **sim** within 10 seconds, in the
same chat (**não**, or nothing, leaves everything as is; with no reply, the question becomes
`⌛ Nada mudou: sem sim em 10 s.`).

| | `/bot -reset` (`-r`) | `/bot -reset force` |
|---|---|---|
| Users (`bot.users`) and their limits (`+cmd`/ `-cmd`) | Removes all | Removes all |
| Extra admins (`bot.admins`) | Stay | Removes |
| On/off (`bot.paused`) | Stays as is | Back to the default (on) |
| Daily delivery of [`-status`](#bot-status) | Stays | Stays |

They accept `-mask`, but don't combine with the other options.

```text
/bot -reset
⚠️ Tirar todos os usuários? Ficam só você e os admins extras usando comandos.
💡 Responda sim em 10 s para confirmar (ou /bot -r force, para voltar tudo ao padrão).

sim
🧹 Usuários removidos (4): ficam só você e os admins extras.
```

```text
/bot -reset force
⚠️ Voltar tudo ao padrão? Tira os usuários e os admins extras e liga o bot: só você usa comandos.
💡 Responda sim em 10 s para confirmar.

sim
♻️ Padrão restaurado: bot ligado, sem admins extras e sem usuários.

▶️ Bot: ativo
🔒 Comandos: só o dono
```

## Bot status

`/bot` with no option (or `/bot -status`) shows the status: the bot's state, the report for the last
24 h, [the users](#user-list) (this chat's list) and, at the end, the daily delivery. With a
time, the report goes out every day at that time, to your private chat or to the `-to` destinations.

| Form | Description |
|---|---|
| `/bot` or `/bot -status` | The status now |
| `/bot -status <time>` | Time of the daily delivery, in Brasília time: `06h`, `6h30`, `06:00` or `às 18h`. Changing the time replaces the previous one (the destinations stay) |
| `/bot -status <time> -to <destination>` | The daily delivery to a person, a group or by email (`email` = the `QRCODE_EMAIL_SMTP_TO`), instead of your private chat; repeat `-to` for several |
| `/bot -status -to <destination>` | The report now, to the destinations |
| `/bot -status off` | Turns off the daily delivery |

```text
/bot                                     → o status agora
/bot -s                                  → o mesmo
/bot -status 06h                         → todo dia às 06:00, no seu privado
/bot -s 06h -to voce@exemplo.com         → todo dia às 06:00, por e-mail
/bot -s 7h -to /Grupo Familia/ -to email → no grupo e por e-mail
/bot -s às 18h30                         → todo dia às 18:30 (nos mesmos destinos)
/bot -s -to /Jorge Pereira/              → o relatório agora, no privado do contato
/bot -s off                              → para de enviar
```

```text
📊 Status do ZapBot 2.0.13 (devel) · últimas 24 h
qui 01/10 06:00

▶️ Bot: ativo
👥 Comandos: o dono e quem está na lista abaixo

🤖 No ar: 2 dias, 3 horas · conectado: 2 dias, 2 horas
🗄️ Cache: 45.20 MB (banco 4.20 MB · mídias 40.10 MB) · 1.234 mensagens
👀 Watch: 5 ocorrências (#1 pix: 3, #2 boleto: 2)
🗑️ Apagadas: 12
✏️ Editadas: 4
📸 Status apagados: 2
😶 Reações removidas ou trocadas: 1
🔇 Ignoradas (/mute): 8 (apagadas 5, editadas 2, watch 1) · 3 silenciados
💾 Último backup: qui 01/10 03:00 (automático)

Usuários (2)
• 🗣️ +u · 👤 Maria Lucia · +5521999982222
• 🗣️ +u · 👥 Grupo Familia

Permissões
👑 +a: admin, usa tudo
🗣️ +u: usuário, usa os comandos comuns

⏰ Status diário: todo dia às 06:00 → 📧 voce@exemplo.com, 👥 Grupo Familia
📅 Próximo: sex 02/10 06:00
💡 Mude com /bot -status <hora> ou desligue com /bot -status off.

ℹ️ Mais informações em /bot -h
```

What goes in:

- **No ar**: how long the process has been running and how long it has been connected to WhatsApp
  (same as [`/uptime`](uptime.md)).
- **Cache**: the size of `cache/` (database, media, backups and temporary files) and how many
  messages are stored.
- **Watch**: occurrences of the [`/watch`](watch.md) rules, with each rule's no. (the 5 that matched
  the most).
- **Apagadas**, **editadas**, **status apagados** and **reações removidas ou trocadas**: what was
  recovered in the last 24 h, including what [`/mute`](mute.md) silenced. With the alert turned off
  (`show.alert.deleted`, `show.alert.edited`, `show.alert.status` or `show.alert.reaction` set to
  `off`), the line says how to turn it back on:
  `✏️ Editadas: 4 (aviso desligado; ligue com /set show.alert.edited on)`.
- **Ignoradas (/mute)**: the alerts `/mute` cut in the last 24 h, by type (deleted, edited, status,
  reactions and `watch`, the ones from [`/watch`](watch.md)), and how many are silenced right now.
  With someone silenced, the 0 only means that none of their alerts came in the 24 h.
- **Último backup**: the most recent one from [`/backup`](backup.md).
- **Usuários**: this chat's list ([Who shows up in the list](#who-shows-up-in-the-list)). The report
  sent by `-to` or by the daily delivery goes without it.
- **Status diário**: the time, the destinations (👤 person, 👥 group or 📧 email; without `-to`, your
  private chat) and the next delivery, or `🔕 Status diário desligado`.

The daily delivery stays in the bot's schedule (`schedules` table), but doesn't show up in
[`/cron`](cron.md) nor count toward its limit. If the bot is down at that time, the report goes out
when it comes back.

## Bot test

`/bot -test` (or `-t`) runs a battery of tests and shows ✅ or ❌ on each item. It's for finding out,
right then, what's wrong: full disk, slow internet, wrong SMTP password, WhatsApp disconnected...

```text
/bot -test
🧪 *TESTE DO BOT*

✅ Cache — escrita e leitura de 256 KB (3 ms)
✅ Disco — 48.2 GB livres (62%)
✅ Banco SQLite — íntegro (2 ms)
✅ WhatsApp — CONNECTED (180 ms)
✅ DNS — web.whatsapp.com → 157.240.0.60 (14 ms)
✅ Internet — HTTP 200 (96 ms)
❌ E-mail (SMTP) — Invalid login: 535 5.7.0 (#AUTH005) Too many bad auth attempts.
➖ E-mail (IMAP) — não configurado (QRCODE_EMAIL_IMAP_HOST)
✅ Chromium — Chromium 131.0.6778.204
✅ yt-dlp — 2026.10.01
✅ ffmpeg — 7.1.1
✅ Velocidade — ↓ 92.4 Mbps · ↑ 21.8 Mbps

❌ 1 de 11 com falha
```

- **Cache**: writes, reads and deletes a 256 KB file in the cache directory. **Disco**: ❌ with less
  than 500 MB free.
- **WhatsApp**: the connection state (`CONNECTED`). **DNS** and **Internet**: resolve and open
  `web.whatsapp.com`.
- **Velocidade**: downloads 8 MB and uploads 1 MB on `speed.cloudflare.com`; ❌ on error or below
  1 Mbps. It runs last, alone, and the first reply (`🧪 Testando...`) warns that it takes a while.
- **E-mail (SMTP)**: only logs in, sends nothing; ➖ if SMTP isn't configured. If the login failed
  recently (`EAUTH`), the test doesn't try again during the 30-minute pause, so it doesn't extend the
  provider's block.
- **E-mail (IMAP)**: connects and logs in, touches nothing; ➖ if there's no `QRCODE_EMAIL_IMAP_HOST`.
- **Chromium**, **yt-dlp** and **ffmpeg**: run `--version`; ❌ if the program doesn't respond.
- A test that hangs (20 s) or throws an error becomes ❌ with the reason, without taking down the
  others.

## Cleaning the email

The bot sends emails (QR Code, alerts, `/cron`...) and they stay in Sent. `-flush-email` shows how
much space that takes and cleans it.

```text
/bot -flush-email
📧 *Caixa de e-mail:* 128 em Sent e 14 em Trash
💡 /bot -flush-email true para apagar tudo

/bot -flush-email true
⏳ Limpando a caixa de e-mail...        (editada ao concluir)
🧹 *E-mail limpo:* 128 em Sent e 14 em Trash (142 no total)
```

- Without `true`, it only counts; with `true`, it deletes everything from Sent and then from Trash
  (permanently). Only the owner deletes.
- It only works with `QRCODE_EMAIL_IMAP_HOST` in `config/.env` (e.g.: `imap.mail.yahoo.com`); without
  it the bot warns that it isn't configured. The login is the SMTP one (`QRCODE_EMAIL_SMTP_USER` and
  `_PASS`). The connection is IMAP with SSL (port 993). It's IMAP because POP3 only sees the inbox,
  with no Sent or Trash.
- The folders are found by the server's `\Sent`/`\Trash` attribute or, without it, by the common name
  (`Sent`, `Sent Items`, `[Gmail]/Trash`, `Lixeira`...).

## System information

`/bot -info` (or `-i`) shows the versions of what the bot uses and where it's running: useful to know
if the image needs to be rebuilt (`yt-dlp`, for example, changes often) and to report a problem. It
also warns when there's a new version of `yt-dlp` and `whatsapp-web.js`.

```text
/bot -info
ℹ️ ZapBot 2.0.13 (devel) · informações do sistema

🤖 Bot
• ZapBot: 2.0.13 (devel) (git+7a89b92/HEAD)
• Node.js: v24.9.0 (V8 13.6.233.10-node.27)
• whatsapp-web.js: 1.34.7 (commit 58ddf15) · ✅ a mais recente · ⬆️ 1 commit novo no main
• WhatsApp Web: 2.3000.1027123456
• SQLite: 3.50.4

🧰 Programas
• Chromium: Chromium 141.0.7390.54
• yt-dlp: 2026.09.21 · ⬆️ nova: 2026.9.30
• ffmpeg: 7.1.1

🖥️ Sistema
• Linux 9f2c1a7d3e4b 6.8.0-85-generic #85-Ubuntu SMP x86_64 Linux
• Host: 9f2c1a7d3e4b (Docker)
• CPU: 4× Intel(R) Core(TM) i5-8500T CPU @ 2.10GHz · carga 0.32 · 0.41 · 0.38
• Memória: 2.10 GB de 7.66 GB em uso · o bot usa 412.30 MB
• No ar: sistema há 12 dias, 3 horas · bot há 2 dias, 1 hora (PID 1)
```

- **ZapBot** shows the commit and the tag that are running (`git+4465374/vX.Y.Z`; outside a release,
  `(devel)` and `/HEAD`), recorded in the image on every `docker compose build` (see
  [`/version`](version.md)).
- **WhatsApp Web** is the version WhatsApp is serving to the bot (only shows when connected);
  **Chromium** comes from Puppeteer's browser, or from the binary when it hasn't connected yet.
- **New versions**: `yt-dlp` is compared with the latest on
  [PyPI](https://pypi.org/project/yt-dlp/), and `whatsapp-web.js` with the latest release on
  [GitHub](https://github.com/wwebjs/whatsapp-web.js/releases). Since the bot uses a pinned commit of
  `main` (in `package.json`), the new commits on `main` after it also show up. The lookups are cached
  for 6 h; without internet (or with the API down), the line comes out without the note. To update
  `yt-dlp`, rebuild the image (`docker compose build --no-cache zapbot`).
- A program that doesn't respond in 5 s (or doesn't exist, like `yt-dlp` outside Docker) shows up as
  _não encontrado_.
- **Carga** is the average number of processes in the system queue over 1, 5 and 15 minutes.
