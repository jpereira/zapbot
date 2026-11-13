# `/welcome` · admin

Role `admin`: só você e os admins extras. O dono libera a uma pessoa ou grupo com
`/bot +u +cmd /welcome` ([Delegando](index.md#delegando-um-comando-admin)).

Só em grupos (fora deles responde `Apenas utilizado dentro de grupos.`). A mensagem que o bot manda
no grupo quando alguém entra (pelo link de convite ou adicionado por um admin). Vale **por grupo**, e só existe onde você ligou. Veja também
[`/goodbye`](goodbye.md).

```text
/welcome [-on|-off|-test] [<texto>]
```

| Opção | Valor | Descrição |
|---|---|---|
| *(nenhuma)* | `[<texto>]` | A mensagem (até 1000 caracteres, pode ter várias linhas). Com ela, liga a mensagem neste grupo. Sem ela, mostra a atual |
| `-on` | | Liga com o texto padrão |
| `-off` | | Desliga neste grupo |
| `-test`, `-t` | | Manda a mensagem como ela ficaria, com você no lugar de quem entra, com o texto que você deu ou o atual |

```text
/welcome                         → mostra a mensagem deste grupo
/welcome Boas-vindas ao {group}, {name}!
/welcome -on                     → o texto padrão
/welcome -test                   → prévia
/welcome -off                    → desliga
```

- `{name}` é a pessoa e `{group}`, o nome do grupo. Na mensagem, `{name}` vira uma **menção** de quem entrou.
- O texto padrão é `👋 Boas-vindas ao {group}, {name}!` (no idioma do `zapbot.lang`).
- A própria conta do bot entrando num grupo não dispara a mensagem.
- Depende dos eventos do WhatsApp da conta, então vale nos grupos em que a sua conta é membro.
