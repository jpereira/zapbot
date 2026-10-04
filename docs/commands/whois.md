# `/whois` (`/who`, `/id`)

Mostra quem é e o que pode no bot, **neste chat**: 🤖 dono, 👑 admin (`+o`),
🗣️ usuário (`+v`) ou 🚫 sem permissão. Sozinho, mostra você; com pessoas (ou
respondendo uma mensagem), mostra elas, mas só para o dono e os admins.

| Argumento | Descrição |
|---|---|
| *(nenhum)* | Você: o seu nível neste chat |
| `[pessoa...]` | Só o dono e os admins: `/Nome/`, `@menção` ou `+número`, vários de uma vez. A busca é a do `-to` ([Destinos](index.md#destinos-contato-grupo-número-ou-e-mail)) |
| *(respondendo uma mensagem)* | Só o dono e os admins: quem escreveu a mensagem respondida |

```
/whois
Quem é? (1)
• 🗣️ +v · 👤 Rafael Silva · +15559998888

Permissões
👑 +o: admin, usa tudo
🗣️ +v: usuário, usa os comandos comuns

Digite /help para saber quais comandos estão disponíveis.
```

```
/whois                          → você
/who /Rafael Silva/ @Fulano     → (dono e admins) essas pessoas
/id +5521999999999              → (dono e admins) pelo número
/whois                          → respondendo uma mensagem: quem a escreveu (dono e admins)
```

O nível é o mais alto que vale **no chat onde você digitou**:

| Nível | Quando |
|---|---|
| 🤖 dono | É a conta do bot: usa tudo |
| 👑 +o | É admin (`/bot +o`): usa tudo |
| 🗣️ +v | É usuário (`/bot +v`): usa os comandos comuns em qualquer chat |
| 🗣️ todos | Todos estão liberados (`/set bot.users true`) |
| 🗣️ +v pelo grupo | O grupo onde você digitou está liberado: todos ali usam os comuns, só dentro dele |
| 🗣️ +v neste grupo | A pessoa é usuária só neste grupo (o `/bot +v` digitado nele) |
| 🚫 sem permissão aqui (só em 👥 …) | A pessoa é usuária só noutros grupos: aqui, o bot ignora os comandos dela |
| 🚫 sem permissão | Nenhum dos de cima: o bot ignora os comandos da pessoa |

- Quem não tem permissão nenhuma não consegue usar o `/whois` (o bot ignora os
  comandos dela); quem tem descobre o próprio nível. O dono e os admins veem o
  de qualquer um.
- Num grupo, o telefone de quem não participa dele sai escondido
  (`+5521•••••2222`), como no [`/bot`](bot.md#quem-aparece-na-lista).
- Quem está limitado a alguns comandos ([`/bot +cmd`](bot.md#comandos-de-cada-usuário))
  tem a regra embaixo: `→ Apenas: /cotacao, /crypto` ou `→ Todos, menos: /meme`.
- Para ver todos os admins e usuários de uma vez, use o [`/bot`](bot.md).
