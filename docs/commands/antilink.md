# `/antilink` · admin

Role `admin`: only you and the extra admins. The owner can grant it to a person or group with
`/bot +u +cmd /antilink` ([Delegating](index.md#delegating-an-admin-command)).

Groups only (anywhere else it replies `Only usable inside groups.`). **Deletes the links** sent by people
who are not admins of the group. It is configured per group and is **off by default**. For the bot to delete
other people's messages, **your account has to be an admin of the group**; without it, the links stay (and
`/antilink` warns about it).

```text
/antilink [-off|-delete|-warn|-remove] [-allow <domain>] [-deny <domain>]
```

| Option | Value | Description |
|---|---|---|
| `-off` | | Turns it off in this group (the default) |
| `-delete` | | Deletes the message with the link, for everyone |
| `-warn` | | Deletes and adds a [`/warn`](warn.md) warning; at the limit (`warn.max`) the person is removed |
| `-remove` | | Deletes and removes the person from the group right away |
| `-allow` | `<domain>` | Allows a domain (and its subdomains): links to it are not deleted |
| `-deny` | `<domain>` | Takes a domain off the allowed list |
| *(none)* | | Shows the current mode and the allowed domains |

## Turning it on

```text
/antilink
🔗 Antilink: off
✅ Allowed: none

/antilink -delete -allow youtube.com
🔗 Mode: delete.
✅ youtube.com allowed.
🔗 Antilink: delete
✅ Allowed: youtube.com
```

Then, in the group:

```text
(Fulano, not an admin)  look at this https://scam.xyz/promo
🔗 Link from Fulano deleted.

(Fulano)  https://m.youtube.com/watch?v=1       → stays: youtube.com is allowed
(Fulano)  good morning, how are you?             → stays: no link
```

## The modes

```text
/antilink -warn
(Fulano)  www.scam.xyz
🔗 Link from Fulano deleted.
⚠️ Warning 1/3 for Fulano: sent a link        (the 3rd one removes, like any /warn)

/antilink -remove
(Fulano)  https://scam.xyz
🚪 Fulano sent a link and was removed from the group.
```

## What counts as a link

- `http://` and `https://` links, `www.` and group invites (`chat.whatsapp.com/...`);
- loose domains with common endings (`site.com`, `example.com.br`, `foo.io`, ...). Words like
  `file.txt` or `version 2.5` are not links;
- an allowed domain also allows its subdomains (`youtube.com` allows `m.youtube.com`), but not
  `notyoutube.com`.

## Who is never caught

Admins of the group, you and the extra bot admins (`bot.admins`), and anything that starts with `/` (a
command). Messages in a group where the mode is `off` are not looked at.

!!! warning "Careful with `-remove`"
    A false positive removes a person. Start with `-delete` or `-warn` and watch it work before
    using `-remove`.
