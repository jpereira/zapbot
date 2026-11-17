# `/warn` · admin

Role `admin`: only you and the extra admins. The owner can grant it to a person or group with
`/bot +u +cmd /warn` ([Delegating](index.md#delegating-an-admin-command)).

Groups only (anywhere else it replies `Only usable inside groups.`). Adds a **warning** to someone in the
group, with a reason if you want. When the person reaches the limit (setting `warn.max`, **3** by
default), the bot **removes them** from the group and zeroes the count. To remove, **your account has to be
an admin of the group**; otherwise the bot warns and says it could not remove.

```text
/warn [/contact/|@mention|+number] [reason]
/warn -list|-clear [person]
```

| Option | Value | Description |
|---|---|---|
| `-list`, `-l` | | Lists the warnings of the group (who has how many) or, with a person, each one with date and reason |
| `-clear`, `-c` | | Zeroes the warnings of a person (or of whoever wrote the message you replied to) |
| *(none)* | `[/contact/\|@mention\|+number] [reason]` | Who to warn: a contact (a name with spaces goes between `/.../`), someone mentioned with `@` or a number, followed by the reason. Replying to a message, the person is its author and all the text is the reason |

## Warning someone

```text
/warn @Fulano posted a link
⚠️ Warning 1/3 for Fulano: posted a link

/warn /Fulano de Tal/
⚠️ Warning 2/3 for Fulano de Tal

(replying to a message)  /warn off-topic
⚠️ Warning 3/3 for Fulano de Tal: off-topic
🚪 Fulano de Tal reached 3 warnings and was removed from the group.
```

- Group admins (and the bot itself) do not get warnings: `❌ Fulano is a group admin: no warnings.`
- With the bot not being an admin: `🚫 Fulano reached 3 warnings, but I could not remove them: the bot has to be a
  group admin.` The count stays, so the next `/warn` tries again.
- `/set warn.max 5` changes the limit; **`0` only counts** and never removes.
- The warnings are per group: the same person can have 2 in one group and none in another.

## Listing and zeroing

```text
/warn -l
⚠️ Group warnings (2)

1. Fulano de Tal — 2/3
2. Ciclano — 1/3

💡 See the reasons with /warn -l @person; zero them with /warn -c @person.

/warn -l @Fulano
⚠️ Warnings of Fulano de Tal (2/3)

1. Tue 17/11 14:02 · posted a link
2. Tue 17/11 14:05

/warn -c @Fulano
✅ Warnings of Fulano de Tal zeroed (2).
```

A removed person starts from zero if they come back.
