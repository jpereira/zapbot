# `/group` · admin

## Group namespace

Use `/g <action>`, `/g.<action>` or `/group <action>`. Run `/g -h` to see the actions available
to you, or `/g members -h` for help with one action. A unique prefix of at least two characters
works with either spelling. If several actions match, the bot lists the ones you can use.

```text
/g members
/g.members
/g.mem
/g invite -revoke
/g.warn spam
```

- Current group settings: `info`, `name`, `desc`, `photo`, `remove-photo`, `admins`, `send`,
  `edit` and `add`. Example: `/g send admins -for 30m`.
- Members and moderation: `members`, `invite`, `promote`, `demote`, `warn`, `antilink`,
  `antibadword`, `antitag`, `welcome`, `goodbye` and `mention-all`.
- Account participation: `join`, `leave` and `list`.

Each action keeps the permissions of the corresponding command. Use the full name when
delegating an action, for example `/bot +u +cmd /g.members`. Replying to a message still selects
its author for actions that accept replies, such as `/g.warn spam`. The `/group` option syntax
and standalone commands remain available.

Role `admin`: only you and the extra admins. The owner can grant it to a person or group with
`/bot +u +cmd /group` ([Delegating](index.md#delegating-an-admin-command)).

Groups only (anywhere else it replies `Only usable inside groups.`). **Shows and changes the group** where
you typed it: name, description, photo and who can send messages, edit the info and add people. To change
anything, **your account has to be an admin of the group**. The invite link is in [`/invite`](invite.md).

| Option | Value | Description |
|---|---|---|
| `-info`, `-i` | | The info of the group (the same as `/group` with nothing) |
| `-admins`, `-a` | | Lists the admins (👑 creator, ⭐ admin) |
| `-name` | `<text>` | Changes the group name. It runs to the end of the command (may have spaces) |
| `-desc` | `[text]` | Changes the description. With no text, clears it |
| `-pic` | | Sets the group photo from the image you reply to (or the one sent with `/group -pic` as the caption) |
| `-rmpic`, `-rp` | | Removes the group photo |
| `-send` | `<admins\|all>` | Who can send messages: `admins` closes the group for the others |
| `-edit` | `<admins\|all>` | Who can change the name, description and photo |
| `-add` | `<admins\|all>` | Who can add people to the group |
| `-for` | `<time>` | With `-send admins`: closes only for that time (`30m`, `2h`, `1d`, `1h30m`) |

```text
/group
/group -admins
/group -name L200 Friends
/group -desc Rules: be nice, no spam
/group -desc                              → clears the description
(replying to a photo)  /group -pic
/group -rmpic
/group -send admins                       → only admins talk
/group -send admins -for 30m              → closes and reopens by itself in 30 minutes
/group -send all                          → everyone talks again
/group -edit admins -add admins           → several at once
```

## The info

```text
/group
👥 L200 Friends
👤 24 members · ⭐ 3 admins
👑 Creator: +5521999999999 - Jorge Pereira
📅 Created on 03/15/2024 10:30

📝 Rules: be nice, no spam

💬 Send messages: everyone
✏️ Edit the group info: only admins
➕ Add people: only admins
🤖 Your account is an admin
```

## Closing for a while

`/group -send admins -for 30m` closes the group (only admins send) and **reopens it by itself**, saying
`🔓 The group is open again`. The time is saved in the database, so it works even if the bot restarts in the
middle: on the next check (every 30 seconds) it reopens whatever is overdue. `/group -send all` before
that cancels the schedule.

```text
/group -send admins -for 1h
🔒 Only admins can send messages. It reopens by itself on 11/17 16:30.
```

## Notes

- `-name` and `-desc` take the rest of the command as the text, so use one at a time.
- If WhatsApp refuses a change, the reply says which one (`❌ WhatsApp refused -name (is your account an
  admin?)`) and the others still run.
- Showing the info or the admins (`-info`, `-admins`) doesn't need your account to be an admin.
- Disappearing messages (24 h, 7 d) are not in the list: `whatsapp-web.js` has no call for them.
