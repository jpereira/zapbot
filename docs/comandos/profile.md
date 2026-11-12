# `/profile` (`/perfil`) · admin

Role `admin`: only you and the extra admins. The owner delegates it to a person or group with
`/bot +u +cmd /profile` ([Delegating](index.md#delegating-an-admin-command)).
Whoever receives it sees only the current chat: giving a contact, mention or number is for the owner
and the extra admins.

Shows a contact's profile picture, with the name they have in **your address book** and the phone
number. With nobody given, it shows the person in the private chat (in your own private chat, your
profile) or, in a group, the group's picture; when replying to a message, the one who wrote it.

```text
/profile [/contato/|@menção|+número]...
```

| Option | Value | Description |
|---|---|---|
| *(none)* | `[/contato/\|@menção\|+número]...` | The people, separated by spaces: an address book contact by name or part of it (a name with spaces goes between `/.../` or quotes; if several match, you pick from the list), someone mentioned with `@` or a number. With nobody given, the person in the private chat (in your own, your profile), the group's picture in a group, or the one who wrote the message being replied to |
| `-mask`, `-m` | | Obfuscates phone numbers (10 to 15 consecutive digits) in this run's output, keeping the first five and the last two. E.g.: `+55219****44` |

The person is looked up like in `-to` ([Destinations](index.md#destinations-contact-group-number-or-email)),
among contacts only: groups are refused.

```text
/profile                        → in private, the person (yours, in yours); in a group, the group picture
/profile /Jorge Pereira/        → by address book name
/profile Jorge                  → part of the name (if it matches more than one, you pick by number)
/profile @Fulano                → in a group, mentioning the person
/profile +5521999999999         → by number
/profile /Ana/ /Beto/           → one picture for each
/profile                        → replying to a message: who wrote it
```

The picture comes with the caption:

```text
Contact: Jorge Pereira <+5521999999999>
```

- In a group, the caption is `Group: <name>`. The same person given twice shows once.
- The name is the one from your address book; someone who isn't in it shows up with their own
  profile name, or just the number.
- With no picture, or with the picture hidden by the contact's privacy settings, only the caption
  comes out, with a warning.
- The phone number of an `@lid` contact only shows up if WhatsApp provides it; otherwise, the
  caption comes without it.
