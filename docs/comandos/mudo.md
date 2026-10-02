# `/mudo` (`/m`, `/mute`) · admin

Silencia os avisos que chegam no seu privado quando uma pessoa ou um grupo
apaga mensagens, edita mensagens ou apaga status. **Só o aviso some**: a
mensagem continua guardada, e o [`/show`](show.md) (ou o `/show -e`) a mostra.

```
/mudo <OPÇÃO>... </contato ou grupo/|@menção|+número>
```

| Opção | Valor | Descrição |
|---|---|---|
| `-deleted`, `-d` | | Silencia os avisos de mensagens apagadas |
| `-edited`, `-e` | | Silencia os avisos de edições |
| `-status`, `-s` | | Silencia os avisos de status apagados |
| `-all`, `-a` | | Tudo isso |
| `-list`, `-l` | | Lista os silenciados (o mesmo que `/mudo` sem nada), com quantos avisos foram ignorados |
| `-rm` | `<nº\|all>` | Desfaz o silêncio do nº N da lista (ou de todos) |

O alvo é buscado como no `-to` ([Destinos](index.md#destinos-contato-grupo-número-ou-e-mail)):
**primeiro** um contato da sua agenda pelo nome (`/Jorge Pereira/`); se nenhum
casar, um grupo (`/Grupo L200/`, `"Grupo L200"` ou `L200`); ou um número
(`+5521999999999`), ou alguém mencionado com `@` (num grupo, escolhendo a pessoa
na lista do WhatsApp). Se o nome servir para mais de um, o bot lista e você
responde só com o nº. Num **grupo**, vale para todos dali; numa **pessoa**, para
o que ela fizer em qualquer chat, inclusive os status dela.

```
/mudo -a /Grupo L200/       → nada do grupo avisa
/mudo -a /Jorge Pereira/    → nada do contato avisa
/mudo -d -e +5521999999999  → apagadas e editadas desse número
/mute -s Fulano             → só os status apagados do contato
/m -a @Fulano Da Silva      → num grupo, mencionando a pessoa
/m -a /Jorge/               → vários Jorge: lista, e você responde com o nº
/mudo                       → a lista
/mudo -rm 2                 → os avisos do nº 2 voltam
```

```
/mudo
🔇 Silenciados (2)

1. 👥 Grupo sobre L200 — apagadas, editadas, status (12 avisos ignorados)
2. 👤 Fulano — status

💡 Desfaça com /mudo -rm <nº|all>.
```

Detalhes:

- As opções se combinam (`-d -e`), e silenciar de novo o mesmo alvo soma ao
  que já estava.
- Os silenciados ficam na tabela `mutes`; cada aviso cortado, em `mute_hits`
  (30 dias), de onde saem os números de ignorados da lista e do
  [`/bot -status`](bot.md#status-do-bot).
- Para desligar os avisos de todo mundo: `/set show.alert.deleted off` (apagadas),
  `/set show.alert.edited off` (edições) e `/set show.alert.status off` (status).
