# `/block` (`/bloquear`) · admin

Blocks one or several people on your WhatsApp account, like **Block** on the phone: they can no
longer message or call you. Replying to a message, it blocks whoever wrote it. With nothing, it lists
the blocked ones, including those you blocked on the phone, numbered for
[`/unblock <nº>`](unblock.md).

```text
/block [/contato/|@menção|+número]...  ou  /block -l
```

| Option | Value | Description |
|---|---|---|
| *(none)* | `[/contato/\|@menção\|+número]...` | The people, separated by spaces: an address book contact by name or part of it (several matches: you choose from the list), someone mentioned with `@` or a number. With no one, replying to a message: whoever wrote it. See [Several people](#several-people) |
| `-list`, `-l` | | Lists the blocked ones (the same as `/block` with nothing) |
| `-mask`, `-m` | | Obfuscates phone numbers in this run's output. E.g.: `+55219****44` |

The person is looked up like in `-to` ([Destinations](index.md#destinations-contact-group-number-or-email)),
among contacts only: groups can't be blocked.

```text
/block /Fulano/             → blocks the contact
/block +5521999999999       → by number
/block @Fulano              → in a group, mentioning the person
/block +5521999999999 +5521988888888 /Ciclano Souza/  → several at once
/block                      → replying to a message: whoever wrote it (not replying: the list)
/block -l                   → the list
```

```text
/block /Fulano/
🚫 Bloqueado: 👤 Fulano
💡 Desfaça com /unblock; veja a lista com /block.

/block
🚫 Bloqueados (2)

1. 👤 Beltrano · +5521988887777
2. 👤 Fulano · +5521999999999

💡 Desbloqueie com /unblock <nº|nome>.
```

## Several people

Separate people with spaces: each number (`+5521…`), each `@mention` and each name in slashes
(`/Ciclano Souza/`) or quotes is one person. Loose words, with none of those, are a single name:
`/block Ciclano Souza` is Ciclano Souza, not Ciclano and Souza. Each name with more than one contact
asks you to choose from the list, one at a time; anyone not found gets the usual error, and the
others carry on. At the end, a single summary:

```text
/block +5521999999999 /Ciclano Souza/ @Beltrano
🚫 Bloqueados (2):
👤 Fulano
👤 Ciclano Souza

ℹ️ Já estavam bloqueados (1):
👤 Beltrano

💡 Desfaça com /unblock; veja a lista com /block.
```

The same person repeated counts once.

## Details

- The block is done by the person's internal id (`@lid`), which the bot asks WhatsApp for first; a
  number that WhatsApp Web didn't know yet also works. Afterwards, the bot checks WhatsApp's list:
  only someone who made it onto it counts as blocked.
- If WhatsApp refuses (or the person doesn't make it onto the list), the bot says why, instead of
  blocked:
  `⚠️ Não consegui bloquear 👤 Fulano: o WhatsApp recusou o bloqueio (erro "t").`. With several
  people, they go to `❌ Não bloqueados`, and the others carry on.
- Someone already blocked: the bot warns you (`ℹ️ 👤 Fulano já está bloqueado.`).
- The bot's own account can't be blocked.
- The list comes from WhatsApp, which stores blocks by internal id (`@lid`): the bot converts each one
  to the phone number and uses the name from your address book (or the profile's). Anyone without a
  known phone number appears by id, with `(id interno, sem telefone conhecido)`, after the others.
