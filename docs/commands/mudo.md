# `/mudo` (`/mute`) · admin

Silencia os avisos que chegam no seu privado quando uma pessoa ou um grupo
apaga mensagens, edita mensagens ou apaga status. **Só o aviso some**: a
mensagem continua guardada, e o [`/show`](show.md) (ou o `/show -e`) a mostra.

```
/mudo <OPÇÃO>... <@número|/nome do grupo/>
```

| Opção | Valor | Descrição |
|---|---|---|
| `-deleted`, `-d` | | Silencia os avisos de mensagens apagadas |
| `-edited`, `-e` | | Silencia os avisos de edições |
| `-status`, `-s` | | Silencia os avisos de status apagados |
| `-all`, `-a` | | Tudo isso |
| `-list`, `-l` | | Lista os silenciados (o mesmo que `/mudo` sem nada), com quantos avisos foram ignorados |
| `-rm` | `<nº\|all>` | Desfaz o silêncio do nº N da lista (ou de todos) |

O alvo é escrito como no [`-to`](cotacao.md#avisar-outra-pessoa-ou-um-grupo):
uma pessoa (`@5521999999999`, ou mencionada com `@`) ou um grupo pelo nome ou
parte dele (`/Grupo L200/`, `"Grupo L200"` ou `L200`). Num **grupo**, vale para
todos dali; numa **pessoa**, para o que ela fizer em qualquer chat, inclusive os
status dela.

```
/mudo -a /Grupo L200/          → nada do grupo avisa
/mudo -d -e @5521999999999     → apagadas e editadas dessa pessoa
/mute -s @Fulano               → só os status apagados dela
/mudo                          → a lista
/mudo -rm 2                    → os avisos do nº 2 voltam
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
  (30 dias), de onde sai o número de ignorados da lista.
- Para desligar os avisos de todo mundo: `/set show.alert.edit off` (edições)
  e `/set show.revoke.status off` (status).
