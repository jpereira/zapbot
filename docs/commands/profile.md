# `/profile` (`/perfil`) · admin

Role `admin`: só você e os admins extras. O dono libera a uma pessoa ou grupo com
`/bot +v +cmd /profile` ([Delegando](index.md#delegando-um-comando-admin)).
Quem recebe vê só o chat atual: informar um contato, menção ou número é do dono e dos admins extras.

Mostra a foto de perfil de um contato, com o nome que ele tem na **sua agenda** e o telefone. Sem
ninguém, mostra a pessoa do privado (no seu próprio privado, o seu perfil) ou, no grupo, a foto do grupo; respondendo uma mensagem, o de quem a escreveu.

```text
/profile [/contato/|@menção|+número]...
```

| Opção | Valor | Descrição |
|---|---|---|
| *(nenhuma)* | `[/contato/\|@menção\|+número]...` | As pessoas, separadas por espaço: contato da agenda pelo nome ou parte dele (nome com espaço entre `/.../` ou aspas; vários que servem: você escolhe na lista), alguém mencionado com `@` ou um número. Sem ninguém, a pessoa do privado (no seu próprio, o seu perfil), a foto do grupo no grupo, ou o de quem escreveu a mensagem respondida |
| `-mask`, `-m` | | Ofusca telefones na saída desta execução. Ex.: `+55219****44` |

A pessoa é buscada como no `-to` ([Destinos](index.md#destinos-contato-grupo-número-ou-e-mail)),
só entre os contatos: grupos são recusados.

```text
/profile                        → no privado, a pessoa (o seu, no seu); no grupo, a foto do grupo
/profile /Jorge Pereira/        → pelo nome da agenda
/profile Jorge                  → parte do nome (se servir para mais de um, você escolhe pelo nº)
/profile @Fulano                → num grupo, mencionando a pessoa
/profile +5521999999999         → pelo número
/profile /Ana/ /Beto/           → uma foto para cada
/profile                        → respondendo uma mensagem: quem a escreveu
```

A foto sai com a legenda:

```text
Contato: Jorge Pereira <+5521999999999>
```

- O nome é o da sua agenda; quem não está nela aparece com o nome do próprio perfil, ou só com o
  número.
- Sem foto, ou com a foto escondida pela privacidade do contato, sai só a legenda, com um aviso.
- O telefone de um contato `@lid` só aparece se o WhatsApp informar; senão, a legenda fica sem ele.
