# `/profile` (`/perfil`) · admin

Role `admin`: só você e os admins extras. O dono libera a uma pessoa ou grupo com
`/bot +u +cmd /profile` ([Delegando](index.md#delegando-um-comando-admin)).
Quem recebe vê só o chat atual: informar um contato, menção ou número é do dono e dos admins extras.

Mostra a foto de perfil de um contato, com o nome que ele tem na **sua agenda** e o telefone. Sem
ninguém, mostra a pessoa do privado (no seu próprio privado, o seu perfil) ou, no grupo, a foto do grupo; respondendo uma mensagem, o de quem a escreveu.

```text
/profile [/contato/|@menção|+número]...  ou  /profile -set|-s
```

| Opção | Valor | Descrição |
|---|---|---|
| *(nenhuma)* | `[/contato/\|@menção\|+número]...` | As pessoas, separadas por espaço: contato da agenda pelo nome ou parte dele (nome com espaço entre `/.../` ou aspas; vários que servem: você escolhe na lista), alguém mencionado com `@` ou um número. Sem ninguém, a pessoa do privado (no seu próprio, o seu perfil), a foto do grupo no grupo, ou o de quem escreveu a mensagem respondida |
| `-set`, `-s` | | Troca a foto pela imagem que você respondeu (ou pela foto enviada com `/profile -set` na legenda): a do grupo, no grupo, ou a da sua conta, em qualquer outro chat. Só o dono e os admins, mesmo com o comando delegado |
| `-mask`, `-m` | | Ofusca telefones (10 a 15 dígitos seguidos) na saída desta execução, mantendo os cinco primeiros e os dois últimos. Ex.: `+55219****44` |

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

Para trocar a foto em vez de ver:

```text
/profile -set                   → respondendo uma imagem (ou enviando-a com esta legenda)
```

- No grupo, troca a foto **do grupo**. O WhatsApp só deixa os admins fazerem isso (a menos que o
  grupo deixe todos editarem); senão o bot avisa que foi recusado.
- Em qualquer outro chat, troca a foto **da sua conta** (é a sua conta que o bot usa).
- É do dono e dos admins extras: quem recebeu o comando por delegação não pode usar o `-set`.

A foto sai com a legenda:

```text
Contato: Jorge Pereira <+5521999999999>
```

- No grupo, a legenda é `Grupo: <nome>`. A mesma pessoa informada duas vezes sai uma vez só.
- O nome é o da sua agenda; quem não está nela aparece com o nome do próprio perfil, ou só com o
  número.
- Sem foto, ou com a foto escondida pela privacidade do contato, sai só a legenda, com um aviso.
- O telefone de um contato `@lid` só aparece se o WhatsApp informar; senão, a legenda fica sem ele.
