# `/mute` (`/mudo`) · admin

Mutes the alerts that arrive in your private chat when a person, a group or a community deletes
messages, edits messages, deletes statuses or removes (or changes) a reaction. **Only the alert goes
away**: the message stays saved, and [`/show`](show.md) (or `/show -e`, `/show -r`) displays it. Just
the target, with no option, mutes everything (the same as `-a`). To undo, use [`/unmute`](unmute.md).

Whoever is muted, in any of the types, also doesn't trigger a [`/watch`](watch.md) alert in your
private chat: the occurrence stays saved in the `/watch` history, and rules with `-to` keep alerting
their destinations. These suppressed alerts also count as ignored, as `watch`.

```text
/mute [OPTION]... [/contact or group/|@mention|+number]
```

| Option | Value | Description |
|---|---|---|
| `-deleted`, `-d` | | Mutes alerts for deleted messages |
| `-edited`, `-e` | | Mutes alerts for edits |
| `-status`, `-s` | | Mutes alerts for deleted statuses |
| `-reaction`, `-r` | | Mutes alerts for removed or changed reactions |
| `-all`, `-a` | | All of the above (deleted, edited, status and reactions). It's the default: `/mute /Group L200/` is the same as `/mute -a /Group L200/` |
| `-list`, `-l` | | Lists the muted ones (the same as `/mute` with nothing), with how many alerts were ignored |
| `-rm` | `<no.\|all>` | Unmutes item N of the list (or all of them): the same as [`/unmute`](unmute.md) |

The target is looked up like in `-to` ([Destinations](index.md#destinations-contact-group-number-or-email)):
a contact from your address book (`/Jorge Pereira/`) or a group (`/Group L200/`, `"Group L200"` or
`L200`), with priority for exact names; or a number (`+5521999999999`), or someone mentioned with `@`
(in a group, picking the person from the WhatsApp list). If the name matches more than one, the bot
lists them and you reply with just the number. In a **group**, it applies to everyone there; for a
**person**, to whatever they do in any chat, including their statuses.

```text
/mute /Group L200/          → nothing from the group alerts (the same as /mute -a /Group L200/)
/mute /Jorge Pereira/       → nothing from the contact alerts
/mute -d -e +5521999999999  → deleted and edited from that number
/mute -s Fulano             → only the contact's deleted statuses
/mute -r /Group L200/       → only the reactions removed or changed in the group
/mute @Fulano Da Silva         → in a group, mentioning the person
/mute /Jorge/                  → several Jorges: lists them, and you reply with the number
/mute                       → the list
```

## Replying to an alert

Replying to an alert (for a deleted or edited message, a deleted status, a removed or changed
reaction, or whatever `/show` redisplays), `/mute` mutes wherever it came from, without you having to
say who:

| The alert came from | `/mute` mutes |
|---|---|
| A private chat or a status | 👤 The person |
| A group | 👥 The group |
| A community (its announcements group) | 🏘️ The community |

The bot uses the alert's recorded origin. Without that record, it reads the header: `👥 Group:` takes
priority and searches only groups, even if a contact with the same name exists. If the group isn't
found, it warns you and mutes no one. Without a group, it uses `📱 Number:` or `👤 Name:` to identify
the person. If there's more than one result, it asks you to choose from the list.

The options work the same way: when replying, `/mute -s` mutes only statuses, `/mute -d` only deleted
ones, `/mute -e` only edits, `/mute -r` only reactions and `/mute` (or `/mute -a`) everything. When
replying to someone's message (that isn't an alert), it mutes whoever sent it. Replying to a
message from the bot itself that isn't an alert, it doesn't know whose it is and asks you to say who.

```text
❌ DELETED MESSAGE DETECTED

👥 Group: About L200
👤 Name: John
...

/mute                       (replying to the alert)
🔇 Muted: 👥 About L200 — deleted, edited, status, reactions
💡 Only the alert goes away: the messages are still stored for /show. See the list with /mute; undo with /unmute.
```

## The list

```text
/mute
🔇 Muted (3)

1. 👥 About L200 — deleted, edited, status, reactions (12 alerts ignored)
2. 🏘️ Condo — deleted, edited, status, reactions
3. 👤 John — status

💡 Undo with /unmute <no.|name> (or /unmute -all, everyone).
```

Details:

- The options go before the target (`/mute -d -e /Group L200/`); an unknown one is refused.
- With nobody muted, the list says `🔇 Nobody muted.`.
- Options combine (`-d -e`), and muting the same target again adds to what was already there.
- The muted ones live in the `mutes` table; each suppressed alert goes in `mute_hits` (30 days),
  which is where the ignored counts in the list and in [`/bot -status`](bot.md#bot-status) come
  from. The origin of each alert sent is kept in `alerts` (30 days): that's how a replying `/mute`
  knows who to mute.
- Anyone who was fully muted before `-r` existed stays fully muted: reactions come along.
- To turn off alerts for everyone: `/set show.alert.deleted off` (deleted),
  `/set show.alert.edited off` (edits), `/set show.alert.status off` (status) and
  `/set show.alert.reaction off` (reactions).
