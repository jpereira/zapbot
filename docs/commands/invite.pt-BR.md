# `/invite` · admin

Role `admin`: só você e os admins extras. Não pode ser delegado: ele expõe o link de convite do grupo.

Só em grupos (fora deles responde `Apenas utilizado dentro de grupos.`). Responde com o link de
convite do grupo (`https://chat.whatsapp.com/...`). **A sua conta precisa ser admin do grupo** para o
WhatsApp dar o link.

```text
/invite [-revoke|-r]
```

| Opção | Valor | Descrição |
|---|---|---|
| `-revoke`, `-r` | | Invalida o link atual e gera um novo |

```text
/invite                      → o link atual
/invite -r                   → o link antigo deixa de valer; aqui está o novo
```

- Quem tem o link entra no grupo: use `-revoke` se ele foi parar em mãos erradas.
- Para entrar num grupo por link, veja o [`/join`](join.md).
