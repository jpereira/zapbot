# `/members` (`/listageral`, `/list`) · admin

Role `admin`: only you and the extra admins. The owner can grant it to a person or group with
`/bot +u +cmd /members` ([Delegating](index.md#delegating-an-admin-command)).

Groups only (anywhere else it replies `Apenas utilizado dentro de grupos.`): lists the members, one
per line as `number - name`, with 👑 owner and ⭐ admin. A number WhatsApp hides shows as
`(número oculto)`; a contact it can't name, as `Desconhecido`.

```text
/members
/list           → the same, through the alias
```
