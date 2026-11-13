# `/promote` · admin

Role `admin`: only you and the extra admins. The owner can grant it to a person or group with
`/bot +u +cmd /promote` ([Delegating](index.md#delegating-an-admin-command)).

Groups only (anywhere else it replies `Only usable inside groups.`). Makes people admins of the group. The bot is
your account, so **your account has to be an admin of the group**; otherwise the bot says so and
changes nothing.

```text
/promote [/contact/|@mention|+number]...
```

| Option | Value | Description |
|---|---|---|
| *(none)* | `[/contact/\|@mention\|+number]...` | The people, separated by spaces: an address book contact by name or part of it (a name with spaces goes between `/.../` or quotes; if several match, you pick from the list), someone mentioned with `@`, or a number. With nobody, replying to a message, whoever wrote it |

```text
/promote @Fulano
/promote /Fulano de Tal/
/promote +5521999999999
/promote                         → replying to a message: who wrote it
```

- Someone who is already an admin gets a warning, and so does someone who is not in the group.
- If WhatsApp refuses the change, the reply has the reason.
