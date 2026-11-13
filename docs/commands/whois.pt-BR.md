# `/whois`

Mostra quem é e o que pode no bot, **neste chat**: 🤖 dono, 👑 admin (`+a`), 🗣️ usuário (`+u`) ou 🚫
sem permissão. Sozinho, mostra você; com pessoas (ou respondendo uma mensagem), mostra elas, mas só
para o dono e os admins.

| Argumento | Descrição |
|---|---|
| *(nenhum)* | Você: o seu nível neste chat |
| `[pessoa...]` | Só o dono e os admins: `/Nome/`, `@menção` ou `+número`, vários de uma vez. A busca é a do `-to` ([Destinos](index.md#destinos-contato-grupo-número-ou-e-mail)) |
| *(respondendo uma mensagem)* | Só o dono e os admins: quem escreveu a mensagem respondida |

```text
/whois
Quem é? (1)
• 🗣️ +u · 👤 Rafael Silva · +15559998888

Permissões
👑 +a: admin, usa tudo
🗣️ +u: usuário, usa os comandos comuns

Digite /help para saber quais comandos estão disponíveis.
```

```text
/whois                          → você
/whois /Rafael Silva/ @Fulano     → (dono e admins) essas pessoas
/whois +5521999999999              → (dono e admins) pelo número
/whois                          → respondendo uma mensagem: quem a escreveu (dono e admins)
```

O nível é o mais alto que vale **no chat onde você digitou**:

| Nível | Quando |
|---|---|
| 🤖 dono | É a conta do bot: usa tudo |
| 👑 +a | É admin (`/bot +a`): usa tudo |
| 🗣️ +u | É usuário (`/bot +u`): usa os comandos comuns em qualquer chat, e os de role `admin` que o dono liberar (`+cmd`) |
| 🗣️ todos | Todos estão liberados (`/set bot.users true`) |
| 🗣️ +u pelo grupo | O grupo onde você digitou está liberado: todos ali usam os comuns, só dentro dele |
| 🗣️ +u neste grupo | A pessoa é usuária só neste grupo (o `/bot +u` digitado nele) |
| 🚫 sem permissão aqui (só em 👥 …) | A pessoa é usuária só noutros grupos: aqui, o bot ignora os comandos dela |
| 🚫 sem permissão | Nenhum dos de cima: o bot ignora os comandos da pessoa |

- Quem não tem permissão nenhuma não consegue usar o `/whois` (o bot ignora os comandos dela); quem
  tem descobre o próprio nível, mesmo limitado a alguns comandos (o `/whois` e o `/help` sempre
  passam). O dono e os admins veem o de qualquer um.
- Grupo e e-mail são recusados (o `/whois` é de pessoas), assim como um contato cujo telefone o
  WhatsApp não informou (use o número: `/whois +5521999999999`).
- Num grupo, o telefone de quem não participa dele sai escondido (`+5521•••••2222`), como no
  [`/bot`](bot.md#quem-aparece-na-lista).
- Quem está limitado a alguns comandos ([`/bot +cmd`](bot.md#comandos-de-cada-usuário)) tem a regra
  embaixo: `→ Apenas: /rates, /crypto` ou `→ Todos, menos: /meme`.
- Para ver os admins e os usuários de uma vez: o [`/bot -list-users`](bot.md#lista-de-usuários) (os deste
  chat) ou o `/bot -list-users all` (todos).
