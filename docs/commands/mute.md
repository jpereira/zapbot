# `/mute` (`/m`, `/mudo`) · admin

Silencia os avisos que chegam no seu privado quando uma pessoa, um grupo ou uma
comunidade apaga mensagens, edita mensagens ou apaga status. **Só o aviso
some**: a mensagem continua guardada, e o [`/show`](show.md) (ou o `/show -e`)
a mostra. Só o alvo, sem opção, silencia tudo (o mesmo que o `-a`). Para
desfazer, o [`/unmute`](unmute.md).

```
/mute [OPÇÃO]... [/contato ou grupo/|@menção|+número]
```

| Opção | Valor | Descrição |
|---|---|---|
| `-deleted`, `-d` | | Silencia os avisos de mensagens apagadas |
| `-edited`, `-e` | | Silencia os avisos de edições |
| `-status`, `-s` | | Silencia os avisos de status apagados |
| `-all`, `-a` | | Tudo isso. É o padrão: `/mute /Grupo L200/` é o mesmo que `/mute -a /Grupo L200/` |
| `-list`, `-l` | | Lista os silenciados (o mesmo que `/mute` sem nada), com quantos avisos foram ignorados |
| `-rm` | `<nº\|all>` | Desfaz o silêncio do nº N da lista (ou de todos): o mesmo do [`/unmute`](unmute.md) |

O alvo é buscado como no `-to` ([Destinos](index.md#destinos-contato-grupo-número-ou-e-mail)):
**primeiro** um contato da sua agenda pelo nome (`/Jorge Pereira/`); se nenhum
casar, um grupo (`/Grupo L200/`, `"Grupo L200"` ou `L200`); ou um número
(`+5521999999999`), ou alguém mencionado com `@` (num grupo, escolhendo a pessoa
na lista do WhatsApp). Se o nome servir para mais de um, o bot lista e você
responde só com o nº. Num **grupo**, vale para todos dali; numa **pessoa**, para
o que ela fizer em qualquer chat, inclusive os status dela.

```
/mute /Grupo L200/          → nada do grupo avisa (o mesmo que /mute -a /Grupo L200/)
/mute /Jorge Pereira/       → nada do contato avisa
/mute -d -e +5521999999999  → apagadas e editadas desse número
/mute -s Fulano             → só os status apagados do contato
/m @Fulano Da Silva         → num grupo, mencionando a pessoa
/m /Jorge/                  → vários Jorge: lista, e você responde com o nº
/mute                       → a lista
```

## Respondendo um aviso

Respondendo um aviso (de mensagem apagada, editada ou de status apagado, ou o
que o `/show` reexibe), o `/mute` silencia de onde ele veio, sem precisar dizer
quem:

| O aviso veio de | O `/mute` silencia |
|---|---|
| Um privado ou um status | 👤 A pessoa |
| Um grupo | 👥 O grupo |
| Uma comunidade (o grupo de avisos dela) | 🏘️ A comunidade |

As opções valem do mesmo jeito: respondendo, `/mute -s` silencia só os status,
`/mute -d` só as apagadas, `/mute -e` só as edições e `/mute` (ou `/mute -a`)
tudo. Respondendo a mensagem de alguém (que não é um aviso), silencia quem a
mandou.

```
❌ MENSAGEM APAGADA DETECTADA

👥 Grupo: Grupo sobre L200
👤 Nome: Fulano
...

/mute                       (respondendo o aviso)
🔇 Silenciado: 👥 Grupo sobre L200 — apagadas, editadas, status
```

## A lista

```
/mute
🔇 Silenciados (3)

1. 👥 Grupo sobre L200 — apagadas, editadas, status (12 avisos ignorados)
2. 🏘️ Condomínio — apagadas, editadas, status
3. 👤 Fulano — status

💡 Desfaça com /unmute <nº|nome> (ou /unmute -all, todos).
```

Detalhes:

- As opções se combinam (`-d -e`), e silenciar de novo o mesmo alvo soma ao
  que já estava.
- Os silenciados ficam na tabela `mutes`; cada aviso cortado, em `mute_hits`
  (30 dias), de onde saem os números de ignorados da lista e do
  [`/bot -status`](bot.md#status-do-bot). A origem de cada aviso enviado fica em
  `alerts` (30 dias): é dela que o `/mute` respondendo sabe quem silenciar.
- Para desligar os avisos de todo mundo: `/set show.alert.deleted off` (apagadas),
  `/set show.alert.edited off` (edições) e `/set show.alert.status off` (status).
