# `/unblock` (`/desbloquear`) · admin

Unblocks a person blocked by [`/block`](block.md) or on the phone, or everyone with `-all`. Replying
to a message, unblocks whoever wrote it. With nothing, shows the `/block` list.

```text
/unblock [/contato/|@menção|+número|nº]  ou  /unblock -all
```

| Option | Value | Description |
|---|---|---|
| *(none)* | `[/contato/\|@menção\|+número\|nº]` | The person, as in `/block`, or the number from the `/block` list. With nothing, the list |
| `-all`, `-a` | | Unblocks everyone blocked, including the ones you blocked on the phone |

```text
/unblock /Fulano/           → unblocks the contact
/unblock 2                  → no. 2 from the /block list
/unblock +5521999999999     → by number
/unblock -all               → everyone (same as /unblock -a)
```

```text
/unblock 2
✅ *Desbloqueado:* 👤 Fulano · +5521999999999

/unblock -all
⏳ Desbloqueando 36 contatos, aguarde.
```

At the end, that same message turns into the result (as in [`/get`](get.md)):

```text
✅ 36 desbloqueados.
```

- The number is from the last `/block` list you saw; with no list, the bot queries the blocked ones
  on the spot.
- WhatsApp stores blocks by internal id (`@lid`): the bot converts it to the phone number and uses
  the name from your address book. Someone with no known phone number shows up by id, with
  `(id interno, sem telefone conhecido)`, and `/unblock <nº>` works the same way.
- After unblocking, the bot checks WhatsApp's list: it only counts whoever left it. An old block,
  stored by phone number, can survive the first unblock (which is by internal id, `@lid`); whoever
  remains is unblocked again by the id that's in the list and, if still stuck, shows up as a failure
  (`o WhatsApp não desbloqueou (continua na lista)`), not as unblocked.
- `-all` unblocks one by one: a failure doesn't hold up the others, and the reply lists the failures
  (`⚠️ Não consegui desbloquear (1):`, with each one's reason).
- Someone who isn't blocked: the bot lets you know (`ℹ️ 👤 Fulano não está bloqueado.`, with a tip to
  see the `/block` list).
- A number that isn't in the list: `❌ Nº 9 não existe. Veja a lista com /block`. `/unblock -all` with
  no one blocked: `🚫 Ninguém bloqueado.`
