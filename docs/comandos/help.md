# `/help` (`/h`)

Exibe o menu com os comandos, ou a ajuda de um só. Cada um vê só o que pode usar:

- **Você** (o dono) e os [admins extras](bot.md#admins-extras): todos os comandos.
- **Os outros** (os [usuários](bot.md#usuários)): só os comandos comuns, os sem ✅ na
  [tabela de comandos](index.md#resumo). O menu vem com `(os comandos que você pode usar)` no
  título, e o `/help` de um comando admin responde `⛔ O /show é só do dono do bot (e dos admins).`
  Quem está limitado a alguns comandos ([`/bot +cmd`](bot.md#comandos-de-cada-usuário)) vê só esses.

```text
/help
/help get
/h /show
/help defi orca    → só a ajuda da Orca no /defi (o mesmo que /defi orca -help)
/help defi aave    → só a ajuda do Aave V3
/watch -help       → ajuda do /watch, incluindo regras, origens e destinos
/show -h           → ajuda do /show
```

Todos os comandos ativos e seus aliases aceitam `-h` e `-help`. A ajuda mostra o uso, as opções, os
argumentos e os aliases. `[]` indica algo opcional; `<>`, um valor a preencher; `...`, algo que pode
ser repetido. Uma linha iniciada por `Ex:` é um exemplo de comando.

Comandos desconhecidos ou desativados recebem uma resposta à mensagem para o dono, admins e usuários
com permissão no chat: `⚠️ Comando '/comando' desconhecido, tente: /help`.
