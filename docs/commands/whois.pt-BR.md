# `/whois`

Mostra quem é e o que pode no bot, **neste chat**: 🤖 dono, 👑 admin (`+a`), 🗣️ usuário (`+u`) ou 🚫
sem permissão. Sozinho, mostra você; com pessoas (ou respondendo uma mensagem), mostra elas, mas só
para o dono e os admins.

| Opção | Valor | Descrição |
|---|---|---|
| `-id` | | Os ids em vez do nível: o do chat e o de cada pessoa (telefone, `@c.us` e, quando o WhatsApp mandou, o `@lid` interno) |

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

## Os ids (`-id`)

O bot conversa com o WhatsApp por **ids**, não por nomes: um privado é `<telefone>@c.us`, um grupo é
`<número>@g.us`, e o WhatsApp às vezes esconde o telefone atrás de um `@lid` interno. O `-id` mostra
esses ids, o que ajuda quando você precisa do id de um grupo para um setting ou quer saber qual número
é de verdade a pessoa:

```text
/whois -id
*🆔 IDs*
👥 Grupo: 120363012345678901@g.us
• 📞 +5521911111111
  🪪 5521911111111@c.us
  🔗 98765432109876@lid
```

```text
/whois -id +5521999999999       → (dono e admins) os ids desse número
/whois -id                      → respondendo uma mensagem: os ids de quem a escreveu
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
  embaixo: `→ Apenas: /stocks, /crypto` ou `→ Todos, menos: /meme`.
- Quem tem um [limite de uso](bot.md#limite-de-uso-por-usuário-limit) (`/bot +cmd /gpt +limit 5/dia`) tem
  a linha `⏱️` com o que já usou e quando renova (o usuário vê o mesmo com o [`/usage`](usage.md)):

```text
/whois +5521911111111
*Quem é?* (1)
• 🗣️ +u · 👤 Fulano · +5521911111111
 → Apenas: /gpt, /tldr
 ⏱️ /gpt  3/3 por dia · renova ter 17/11 00:00; /tldr  0/3 por dia · renova ter 17/11 00:00

*Permissões*
👑 +a: admin, usa tudo
🗣️ +u: usuário, usa os comandos comuns

Digite /help para saber quais comandos estão disponíveis.
```

- Para ver os admins e os usuários de uma vez: o [`/bot -list-users`](bot.md#lista-de-usuários) (os deste
  chat) ou o `/bot -list-users all` (todos).
