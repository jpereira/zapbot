# `/usage`

Os seus **limites de uso**: em cada comando que o dono limitou com `+limit`, quantas chamadas você
usou, o limite e quando renova. Só chamada que deu certo conta: `-h`, uso, erros e falhas não.

| Opção | Valor | Descrição |
|---|---|---|
| *(nenhuma)* | | Os seus limites aqui: usados, limite e quando renova |
| `-log`, `-l` | | As últimas chamadas que contaram: quando, comando e parâmetros |
| `-all`, `-a` | | Só o dono e os admins: o consumo de **todos**, em ranking por pessoa e grupo e por comando. Veja [Consumo de todos](#consumo-de-todos--all) |

| Argumento | Descrição |
|---|---|
| `[pessoa...]` | Só o dono e os admins: `/nome/`, `@menção` ou `+número`. A busca é a mesma do `-to` ([Destinos](index.md#destinos-contato-grupo-número-ou-e-mail)) |
| *(respondendo a uma mensagem)* | Só o dono e os admins: os limites de quem escreveu a mensagem |

O limite é definido pelo dono no [`/bot`](bot.md#limite-de-uso-por-usuário-limit); o dono e os admins
nunca têm um. O `/usage` sempre passa, como o `/help` e o [`/whois`](whois.md).

**O que o usuário vê** (o limite é de 3 por dia do `/gpt`):

```text
/usage
⏱️ *Limites de uso*
• /gpt  2/3 por dia · renova ter 17/11 00:00
• /tldr  0/3 por dia · renova ter 17/11 00:00
```

```text
/usage -l
🕘 *Últimas chamadas que contaram*
• seg 16/11 09:37 · /gpt resuma o texto
• seg 16/11 09:37 · /gpt -img um gato astronauta
• seg 16/11 09:37 · /gpt quem descobriu o Brasil?
```

**Quando o limite acaba**, o comando nem roda (então não gasta o seu crédito do ChatGPT):

```text
/gpt qual a capital da França?
🚫 Limite do /gpt atingido: 3 de 3 por dia. Renova em ter 17/11 00:00.
```

**O dono consulta alguém** (e vê o mesmo no `/whois` e no `/bot -list-users`):

```text
/usage +5521911111111
⏱️ *Limites de uso*
• /gpt  3/3 por dia · renova ter 17/11 00:00
• /tldr  0/3 por dia · renova ter 17/11 00:00
```

```text
/usage                       → os seus limites
/usage -l                    → as suas últimas chamadas
/usage /Rafael Silva/        → (dono e admins) os limites do Rafael
/usage -l @Fulano            → (dono e admins) as últimas chamadas dele
```

Depois de cada chamada que contou, o bot manda um rodapé com o que resta (setting `usage.footer`,
ligada por padrão):

```text
📊 /gpt: restam 1 de 3 por dia
```

O histórico (`-l`) fica `usage.logDays` dias (90 por padrão); as chamadas que ainda contam para um
limite nunca são apagadas antes do fim do período.

## Consumo de todos (`-all`)

Para o dono e os admins: quem está usando os comandos que têm limite, e quais comandos mais saem. O
top 10 de pessoas (ou grupos), com os comandos de cada uma, e o total por comando:

```text
/usage -a
📊 Consumo de todos (últimos 90 dias, 57 chamadas)
1. 👤 Rafael Silva — 31 (/gpt 24, /tldr 7)
2. 👥 Sobre L200 — 14 (/draw 14)
3. 👤 Maria Lucia — 9 (/gpt 9)
4. 👤 +5521933333333 — 3 (/tldr 3)

Por comando: /gpt 33 · /draw 14 · /tldr 10
```

- Conta os últimos `usage.logDays` dias (90 por padrão), a mesma janela do `-l`.
- Só os comandos com limite (`/bot +cmd /gpt +limit 5/day`) deixam rastro: um comando sem limite não
  aparece.
- As chamadas de uma pessoa em grupos diferentes somam nela; um limite posto num grupo aparece como o
  grupo (👥).
- Para ver **uma** pessoa em detalhe, use `/usage /Rafael Silva/` ou `/usage -l @Fulano`.

Para um usuário comum, o `-a` é recusado: `🔒 Só o dono e os admins veem os limites dos outros.`
