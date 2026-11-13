# `/backup` · admin

Database backup (`cache/zapbot.db`): one automatic per day, and from WhatsApp you can create, list,
compare, restore, receive the file or delete. With no option, it shows the current database and the
backups.
The backup includes the registrations, histories and settings of [`/monitor`](monitor.md).
Removing contacts or reducing the local history doesn't change the backups that already exist.

| Option | Value | Description |
|---|---|---|
| *(none)* | | Current database (size and entries of each table), how many backups there are, the last one and the next automatic one |
| `-now`, `-n` | | Creates a backup now (manual: stays until deleted) |
| `-list`, `-l` | | Lists the backups, numbered from newest to oldest, with date, size and reason |
| `-info`, `-i` | `<no.>` | Backup details: date, reason, version of the bot that created it (with the commit, e.g.: `X.Y.Z (git+4465374/vX.Y.Z)`) and the entries of each table, compared with the current database |
| `-restore`, `-r` | `<no.\|name>` | Restores the backup. Without `-sim`, it only shows what will happen and the command to confirm |
| `-sim` | | Confirms: with `-restore`, the restore; with `-send -to` another chat, the sending |
| `-send`, `-s` | `[no.]` | Sends the backup file (without no.: the most recent) to your private chat or to the `-to` destinations. See [Send the file](#send-the-file) |
| `-to` | `<destination>` | With `-send`: by email, as an attachment (`email` is the `QRCODE_EMAIL_SMTP_TO`, or an address), or to another chat: a contact (`/Jorge Pereira/`), a mention (`@Fulano Da Silva`), a group (`/Grupo L200/`) or a number (`+5521999999999`) (asks for `-sim`). Repeat for several. See [Destinations](index.md#destinations-contact-group-number-or-email) |
| `-rm` | `<no.\|all>` | Deletes backup no. N (or all of them) |

```text
/backup                                 → the current database and the backups
/backup -now                            → creates one now
/backup -l                                 → the list
/backup -i 2                            → what's in no. 2, compared with the current database
/backup -r 2                            → shows what will happen and asks for confirmation
/backup -r zapbot-20261001-030000 -sim  → restores
/backup -s                              → the most recent file in your private chat
/backup -s -to eu@gmail.com             → the most recent, by email
/backup -s 2 -to email                  → no. 2, to the QRCODE_EMAIL_SMTP_TO
/backup -s -to /Jorge Pereira/ -sim     → in a contact's private chat
/backup -s -to @Fulano Da Silva -sim    → in the mentioned person's private chat
/backup -s -to email -to /Jorge Pereira/ -sim  → by email and in the contact's private chat
/backup -rm 3                           → deletes no. 3
```

```text
💾 Backup

• 🗄️ Current database: 4.20 MB
   ◦ message_edits: 12
   ◦ messages: 1.234
   ◦ polls: 3
   ◦ ...
• 📦 Backups: 7 (8.40 MB) in /app/cache/backups
• 🕐 Last: Thu 01/10 03:00 (automatic, 1.10 MB)
• ⏭️ Next automatic: Fri 02/10 03:00 (every day at 3h, keeps 7)
• 📤 Automatic destination: local only

💡 Tips
/backup -now creates one now
/backup -l lists
/backup -i <no.> shows details
/backup -r <no.> restores
/backup -s [no.] [-to <destination>] sends the file
/backup -rm <no.|all> deletes
```

```text
/backup -l
💾 Backups (3)

1. Thu 01/10 03:00 · 1.10 MB · automatic
2. Wed 30/09 15:20 · 1.00 MB · manual
3. Wed 30/09 03:00 · 1.00 MB · automatic

💡 /backup -i <no.> shows the entries
💡 /backup -r <no.> restores
```

## Automatic backup

Every day, from 3 AM Brasília time (setting `backup.hour`, 0 to 23), the bot creates a backup. If
it's down at that time, the backup is made as soon as it's back, on the same day. Turn it off with
`/set backup.enabled off`.

The `backup.to` setting defines where to send the daily file **in addition to saving it locally**.
The default is `""` (local only). It accepts the `-to` destinations: `email` (the
`QRCODE_EMAIL_SMTP_TO`), email addresses, contact or group name and number with country code. For
several destinations, write one `-to` for each in the setting.

```text
/set backup.to email
/set backup.to voce@exemplo.com
/set backup.to /Grupo Familia/
/set backup.to +5521999999999
/set backup.to "-to email -to /Grupo Familia/"
/set backup.to ""
```

Setting `backup.to` authorizes sending the entire database to the destination every day, without
asking for `-sim` each day. For names with more than one result, use the full name or the number:
the automatic sending doesn't open a choice list. For a person mentioned in a command, set their
name or number in the setting. Emails use the bot's SMTP and the same 20 MB limit as manual
sending. Manual backups and the ones made before restoring aren't sent through this setting.

The 7 most recent automatic ones are kept (setting `backup.keep`, 1 to 90); older ones are deleted
with each new backup. The same count applies to the "before restoring" backups. **Manual** ones (`-now`)
are never deleted automatically.

If the daily backup fails (e.g., disk full), the error goes to the log and to the
[email alerts](../emails.md#email-alerts) (`💾 Backup failed`). If sending fails, the
local file is preserved and the failure goes to the log and to the alerts
(`💾 Backup sending failed`). Sending is attempted once a day, when the backup is created; another
check on the same day doesn't repeat the sending. The other destinations are attempted even if one
of them fails.

## What's included

The entire database: stored messages (including deleted and edited ones), settings, `/watch` rules
and hits, price alerts, reminders and scheduled messages, polls and statistics.
The copy is made with SQLite's `VACUUM INTO` (consistent, without stopping the
bot) and compressed with gzip.

`/notes` images (`cache/notes`) go in a separate file, only when there are any, and come back
along with `-r`. `-send` and the automatic backup send only the database (the images may exceed the
attachment limit).

**The other media (`cache/media`) is not included**: after a restore, a deleted message with media
that is no longer on disk says the file isn't available. The WhatsApp session (volume
`wwebjs_auth`) isn't included either.

Each backup is two or three files in `cache/backups/`, in the `app_cache` volume:

- `zapbot-AAAAMMDD-HHMMSS.db.gz`: the compressed database;
- `zapbot-AAAAMMDD-HHMMSS.notes.tar.gz`: the `/notes` images (only if there are any);
- `zapbot-AAAAMMDD-HHMMSS.json`: date, reason, bot version and the entries of each table.

## Restore

`/backup -r <no.>` shows the date and reason and asks for confirmation, already with the backup name
(a new backup in the meantime would change the numbers):

```text
/backup -r 2 -sim
♻️ Backup restored: Wed 30/09 15:20
message_edits 10 · messages 1,180 · settings 47 · ...

💾 The previous state was kept in backup zapbot-20261001-101530: to undo, /backup -r zapbot-20261001-101530 -sim
```

- The entire database goes back to that moment; whatever came in afterward is lost. That's why,
  before restoring, the bot makes a backup of the current state (reason "before restoring"), and
  the reply already includes the command to undo.
- Settings are reloaded right away, without restarting.
- A backup from an earlier version works too: tables and columns it didn't have stay
  empty.

## Send the file

`-send` sends the `.db.gz` file to your private chat. With `-to`, it goes elsewhere, as in the
other commands ([Destinations](index.md#destinations-contact-group-number-or-email)):

- **Email**: `-to email` (the `QRCODE_EMAIL_SMTP_TO`) or one or more addresses
  (`-to "a@x.com, b@y.com"`). It goes as an attachment, through the same SMTP as the QR Code and the
  alerts (`QRCODE_EMAIL_SMTP_*`, see [Configuration](../configuracao.md#email-qr-code-and-alerts)).
- **Another chat**: a contact, a group or a number. Since the database has the stored messages of
  **all** chats, the bot asks for confirmation: repeat with `-sim`.
- **Several**: repeat `-to`. All the emails go in a single email; each chat receives the file (if
  one fails, the others still receive it).

```text
/backup -s -to fulano@gmail.com
📧 Backup from Thu 01/10 03:00 sent to fulano@gmail.com.

/backup -s -to /Jorge Pereira/
⚠️ The backup has the whole database: the saved messages of all chats, the deleted ones, the settings...
To send it to 👤 Jorge Pereira anyway, repeat with -sim: /backup -send -to /Jorge Pereira/ -sim

/backup -s -to email -to /Jorge Pereira/ -to /Grupo L200/
⚠️ The backup has the whole database: the saved messages of all chats, the deleted ones, the settings...
To send it to 👤 Jorge Pereira, 👥 Grupo sobre L200 anyway, repeat with -sim: /backup -send -to email -to /Jorge Pereira/ -to /Grupo L200/ -sim
```

- The email includes the anti-phishing code, like the bot's other emails, and the restore
  instructions.
- Backups above 20 MB don't go by email (providers refuse large attachments): use `-s` without
  `-to`.
- Without SMTP configured (`QRCODE_EMAIL_SMTP_HOST` and `_USER`), the bot warns you.
- The old form, with the emails directly in `-s` (`/backup -s 2 email`), still works.

## Keep it off the server

Backups live on the same volume as the database: if the volume is deleted (e.g.,
`make DOCK_REMOTE=1 destroy`), they go with it. [`/cache -a`](cache.md) and `/cache -b` also
delete the backups. To keep a copy elsewhere, use `/backup -s` (the file arrives in your WhatsApp),
send it by email (`/backup -s -to seu@email.com`) or copy the folder:

```bash
docker cp zapbot:/app/cache/backups ./backups-zapbot
```
