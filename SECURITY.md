# Security policy

> 🇧🇷 **Leia em português (pt_BR): [SECURITY.pt-BR.md](SECURITY.pt-BR.md).**

## Supported versions

Only the **latest release** (the most recent `vX.Y.Z` tag) receives security fixes. Fixes ship in a
new release; update following the
[documentation](https://jpereira.github.io/zapbot/installation/#update-to-a-new-version).

## How to report a vulnerability

**Do not open a public issue.** Report it privately, in one of these ways:

- through the repository's **Security** tab on GitHub (**Report a vulnerability**);
- by email to **jpereiran@gmail.com**.

If possible, include: the version (or the commit), the steps to reproduce, the impact you observed and,
if you have one, a suggested fix. The project is maintained by one person: the reply comes as soon as
possible, and you will be told when the fix is published.

## What is sensitive in this project

A few points deserve special attention in a report:

- **WhatsApp session** (`.wwebjs_auth`) and the **QR Code**: whoever has either of them controls the
  account. The QR can go by email (see the anti-phishing code in
  [Emails](https://jpereira.github.io/zapbot/emails/)).
- **Command levels** (owner > admin > user): any way for someone to run a command above their level,
  or one with the `admin` role without the owner having released it (`/bot +cmd`, only for the
  delegable ones), including making the bot "type" a command or through an `/alias` shortcut. Or for an
  extra admin (`/bot +a`) to change `bot.admins` or `bot.users`, which only the owner can change. Also
  counts someone outside `bot.users` being able to use the regular commands, or a user running a
  command outside their own (`/bot +cmd`).
- **`/get`**: `yt-dlp` runs on the server's network; URLs pointing to the internal network are
  refused (anti-SSRF).
- **API keys** (OpenAI, GIPHY, Google Translate) and the SMTP password: they must never show up in the
  chat or in the logs.
- **Web interface and API**: protect the dashboard password and TOTP secret, session cookies and
  the API key. A web session grants access to stored history, and the API sends messages as
  the linked account within its allowed destinations.
- **Protected notes** (`/notes -lock`): the text and the files of a protected tag are encrypted (AES-256-GCM, key
  from scrypt) and the password is never stored. It counts as a vulnerability any way to read them **without the
  password** or **outside your private chat or a web session that unlocked the tag**: in a group or someone's chat, sent with `-to`, in an alert, in
  the logs, in the history (`messages`) or in a backup; the password showing up anywhere the bot writes; or a tag
  staying unlocked after the time (`notes.lockMinutes`), a restart or `-now`. What it does not promise is in
  [Privacy scenarios](https://jpereira.github.io/zapbot/commands/notes/#privacy-scenarios).
- **Stored messages**: the database (`cache/zapbot.db`), the media in `cache/media` and the backups in
  `cache/backups` hold conversations of third parties. `/backup -send` to another chat asks for
  confirmation (`-yes`) for that reason.
