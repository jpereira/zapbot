# `/invite` · admin

Role `admin`: only you and the extra admins. It can't be delegated: it exposes the group's invite link.

Groups only (anywhere else it replies `Only usable inside groups.`). Replies with the group's invite
link (`https://chat.whatsapp.com/...`). **Your account has to be an admin of the group** for WhatsApp
to give the link.

```text
/invite [-revoke|-r]
```

| Option | Value | Description |
|---|---|---|
| `-revoke`, `-r` | | Invalidates the current link and makes a new one |

```text
/invite                      → the current link
/invite -r                   → the old link stops working; here is the new one
```

- Whoever has the link can join the group: use `-revoke` if it got to the wrong hands.
- To join a group by link, see [`/join`](join.md).
