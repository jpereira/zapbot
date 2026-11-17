# `/antibadword` · admin

Role `admin`: only you and the extra admins. The owner can grant it to a person or group with
`/bot +u +cmd /antibadword` ([Delegating](index.md#delegating-an-admin-command)).

Groups only (anywhere else it replies `Only usable inside groups.`). **Deletes the messages** from people who
are not admins of the group that have a word (or phrase) from the group's list. It is configured per group
and is **off by default**. For the bot to delete other people's messages, **your account has to be an admin
of the group**; without it, the messages stay (and `/antibadword` warns about it).

```text
/antibadword [-off|-delete|-warn|-remove] [-add <word>] [-rm <word>] [-list]
```

| Option | Value | Description |
|---|---|---|
| `-off` | | Turns it off in this group (the default) |
| `-delete` | | Deletes the message, for everyone |
| `-warn` | | Deletes and adds a [`/warn`](warn.md) warning; at the limit (`warn.max`) the person is removed |
| `-remove` | | Deletes and removes the person from the group right away |
| `-add` | `<word>` | Adds a word to the list (up to 100), one per command. For a phrase, use quotes |
| `-rm` | `<word>` | Takes a word off the list |
| `-list`, `-l` | | Shows the words of the list |
| *(none)* | | Shows the current mode and how many words there are |

```text
/antibadword -add idiot
✅ "idiot" added to the list.
🤬 Antibadword: off
📚 Words: 1

/antibadword -add "go to hell"
/antibadword -delete
/antibadword -list
🤬 Antibadword: delete
📚 Words: 2
idiot, go to hell
/antibadword -rm idiot
```

Then, in the group:

```text
(Fulano, not an admin)  you are an IDIOT!!
🤬 Message from Fulano deleted: banned word.
```

- **It ignores case, accents and punctuation:** `IDIOT`, `idiot!` and `ídiot` are the same word.
- **Only the whole word counts:** with `ass` on the list, `class` and `assistant` pass.
- **Who is never caught:** the admins of the group, you (the owner) and the bot admins.
- A message that starts with `/` (a command) is not checked.
- `-warn` uses [`/warn`](warn.md): each message counts as a warning, and at `warn.max` the person leaves.
  `-remove` takes the person out on the first one.
- The list is **per group** and is not private: any admin of the bot sees it with `-list`.
