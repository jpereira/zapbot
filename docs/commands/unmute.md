# `/unmute` · admin

Undoes the silence from [`/mute`](mute.md): the warnings about deleted and edited messages, deleted
statuses and removed or changed reactions from the person, group or community come back.

| Option | Value | Description |
|---|---|---|
| *(none)* | `[/contact or group/\|@mention\|+number\|#]` | Who: looked up as in `/mute`, or the number from the `/mute` list. With no one, when replying to a warning, where it came from. With nothing, the list |
| `-all`, `-a` | | Undoes all the muted ones |

```text
/unmute /Jorge Pereira/     → the contact's warnings come back
/unmute /Grupo L200/        → the group's
/unmute 2                   → no. 2 from the /mute list
/unmute                     → replying to a warning: where it came from (the person, the group or the community)
/unmute -all                → all of them (same as /unmute -a or /mute -rm all)
```

- Someone who isn't muted: the bot lets you know (`ℹ️ 👤 Fulano is not muted.`, with a tip to
  see the `/mute` list).
- `/unmute -all` replies with how many were removed (`🔊 2 muted entries removed: the alerts are back.`).
- A number that isn't in the list: `❌ No. 9 does not exist. See the list with /mute`.
- With nothing (and not replying to a warning), shows the `/mute` list.
