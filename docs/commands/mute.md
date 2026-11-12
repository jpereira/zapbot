# `/mute` (`/mudo`) · admin

Mutes the alerts that arrive in your private chat when a person, a group or a community deletes
messages, edits messages, deletes statuses or removes (or changes) a reaction. **Only the alert goes
away**: the message stays saved, and [`/show`](show.md) (or `/show -e`, `/show -r`) displays it. Just
the target, with no option, mutes everything (the same as `-a`). To undo, use [`/unmute`](unmute.md).

Whoever is muted, in any of the types, also doesn't trigger a [`/watch`](watch.md) alert in your
private chat: the occurrence stays saved in the `/watch` history, and rules with `-to` keep alerting
their destinations. These suppressed alerts also count as ignored, as `watch`.

```text
/mute [OPTION]... [/contato ou grupo/|@menção|+número]
```

| Option | Value | Description |
|---|---|---|
| `-deleted`, `-d` | | Mutes alerts for deleted messages |
| `-edited`, `-e` | | Mutes alerts for edits |
| `-status`, `-s` | | Mutes alerts for deleted statuses |
| `-reaction`, `-r` | | Mutes alerts for removed or changed reactions |
| `-all`, `-a` | | All of the above (deleted, edited, status and reactions). It's the default: `/mute /Grupo L200/` is the same as `/mute -a /Grupo L200/` |
| `-list`, `-l` | | Lists the muted ones (the same as `/mute` with nothing), with how many alerts were ignored |
| `-rm` | `<nº\|all>` | Unmutes item N of the list (or all of them): the same as [`/unmute`](unmute.md) |

The target is looked up like in `-to` ([Destinations](index.md#destinations-contact-group-number-or-email)):
a contact from your address book (`/Jorge Pereira/`) or a group (`/Grupo L200/`, `"Grupo L200"` or
`L200`), with priority for exact names; or a number (`+5521999999999`), or someone mentioned with `@`
(in a group, picking the person from the WhatsApp list). If the name matches more than one, the bot
lists them and you reply with just the number. In a **group**, it applies to everyone there; for a
**person**, to whatever they do in any chat, including their statuses.

```text
/mute /Grupo L200/          → nothing from the group alerts (the same as /mute -a /Grupo L200/)
/mute /Jorge Pereira/       → nothing from the contact alerts
/mute -d -e +5521999999999  → deleted and edited from that number
/mute -s Fulano             → only the contact's deleted statuses
/mute -r /Grupo L200/       → only the reactions removed or changed in the group
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

The bot uses the alert's recorded origin. Without that record, it reads the header: `👥 Grupo:` takes
priority and searches only groups, even if a contact with the same name exists. If the group isn't
found, it warns you and mutes no one. Without a group, it uses `📱 Número:` or `👤 Nome:` to identify
the person. If there's more than one result, it asks you to choose from the list.

The options work the same way: when replying, `/mute -s` mutes only statuses, `/mute -d` only deleted
ones, `/mute -e` only edits, `/mute -r` only reactions and `/mute` (or `/mute -a`) everything. When
replying to someone's message (that isn't an alert), it mutes whoever sent it. Replying to a
message from the bot itself that isn't an alert, it doesn't know whose it is and asks you to say who.

```text
❌ MENSAGEM APAGADA DETECTADA

👥 Grupo: Grupo sobre L200
👤 Nome: Fulano
...

/mute                       (replying to the alert)
🔇 Silenciado: 👥 Grupo sobre L200 — apagadas, editadas, status, reações
💡 Só o aviso some: as mensagens continuam guardadas para o /show. Veja a lista com /mute; desfaça com /unmute.
```

## The list

```text
/mute
🔇 Silenciados (3)

1. 👥 Grupo sobre L200 — apagadas, editadas, status, reações (12 avisos ignorados)
2. 🏘️ Condomínio — apagadas, editadas, status, reações
3. 👤 Fulano — status

💡 Desfaça com /unmute <nº|nome> (ou /unmute -all, todos).
```

Details:

- The options go before the target (`/mute -d -e /Grupo L200/`); an unknown one is refused.
- With nobody muted, the list says `🔇 Ninguém silenciado.`.
- Options combine (`-d -e`), and muting the same target again adds to what was already there.
- The muted ones live in the `mutes` table; each suppressed alert goes in `mute_hits` (30 days),
  which is where the ignored counts in the list and in [`/bot -status`](bot.md#bot-status) come
  from. The origin of each alert sent is kept in `alerts` (30 days): that's how a replying `/mute`
  knows who to mute.
- Anyone who was fully muted before `-r` existed stays fully muted: reactions come along.
- To turn off alerts for everyone: `/set show.alert.deleted off` (deleted),
  `/set show.alert.edited off` (edits), `/set show.alert.status off` (status) and
  `/set show.alert.reaction off` (reactions).
