# `/members` (`/listageral`, `/list`) · admin

Role `admin`: only you and the extra admins. The owner can grant it to a person or group with
`/bot +u +cmd /members` ([Delegating](index.md#delegating-an-admin-command)).

Groups only (anywhere else it replies `Only usable inside groups.`): lists the members, one
per line as `+number - name`, with 👑 owner and ⭐ admin. A number WhatsApp hides shows as
`(hidden number)`; a contact it can't name, as `Unknown`.

```text
/members
/list           → the same, through the alias

👥 *Members of Group L200* (2)

+5521999999999 - Jorge Pereira 👑
+5521988888888 - Maria ⭐
```
