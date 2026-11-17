# `/antitag` · admin

Role `admin`: only you and the extra admins. The owner can grant it to a person or group with
`/bot +u +cmd /antitag` ([Delegating](index.md#delegating-an-admin-command)).

Groups only (anywhere else it replies `Only usable inside groups.`). **Deletes the messages** from people who
are not admins of the group that tag lots of people at once, the "tag everyone" abuse. It is configured per
group and is **off by default**. For the bot to delete other people's messages, **your account has to be an
admin of the group**; without it, the messages stay (and `/antitag` warns about it).

```text
/antitag [-off|-delete|-warn|-remove] [-min <n>]
```

| Option | Value | Description |
|---|---|---|
| `-off` | | Turns it off in this group (the default) |
| `-delete` | | Deletes the message, for everyone |
| `-warn` | | Deletes and adds a [`/warn`](warn.md) warning; at the limit (`warn.max`) the person is removed |
| `-remove` | | Deletes and removes the person from the group right away |
| `-min` | `<n>` | From how many tags a message is caught (3 to 1000; default 10). In a small group, 80% of its members, but never less than 3 |
| *(none)* | | Shows the current mode and the minimum |

```text
/antitag
🏷️ Antitag: off
📏 Minimum: 10 tags in one message

/antitag -delete -min 6
🔗 Mode: delete.
📏 Minimum: 6 tags.
🏷️ Antitag: delete
📏 Minimum: 6 tags in one message
```

Then, in the group:

```text
(Fulano, not an admin)  @Ana @Beto @Caio @Duda @Edu @Fabi good morning, everyone!
🏷️ Message from Fulano deleted: it tagged too many people.
```

- **Who is never caught:** the admins of the group, you (the owner) and the bot admins.
- A message that starts with `/` (a command) is not checked.
- `-warn` uses [`/warn`](warn.md): each tag-everyone counts as a warning, and at `warn.max` the person
  leaves. `-remove` takes the person out on the first one.
- The minimum is what the message **tags**, not what it says: a plain "@everyone" with no mentions is not
  caught.
