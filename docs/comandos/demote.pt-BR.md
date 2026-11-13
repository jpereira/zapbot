# `/demote` · admin

Role `admin`: só você e os admins extras. O dono libera a uma pessoa ou grupo com
`/bot +u +cmd /demote` ([Delegando](index.md#delegando-um-comando-admin)).

Só em grupos (fora deles responde `Apenas utilizado dentro de grupos.`). Tira o admin de pessoas do grupo. O bot é a
sua conta, então **a sua conta precisa ser admin do grupo**; senão o bot avisa e não muda nada.

```text
/demote [/contato/|@menção|+número]...
```

| Opção | Valor | Descrição |
|---|---|---|
| *(nenhuma)* | `[/contato/\|@menção\|+número]...` | As pessoas, separadas por espaço: contato da agenda pelo nome ou parte dele (nome com espaço entre `/.../` ou aspas; vários que servem: você escolhe na lista), alguém mencionado com `@` ou um número. Sem ninguém, respondendo uma mensagem, quem a escreveu |

```text
/demote @Fulano
/demote /Fulano de Tal/
/demote +5521999999999
/demote                         → respondendo uma mensagem: quem a escreveu
```

- Quem não é admin recebe um aviso, e quem não está no grupo também.

- O criador do grupo não pode ter o admin retirado.
- Se o WhatsApp recusar a mudança, a resposta traz o motivo.
