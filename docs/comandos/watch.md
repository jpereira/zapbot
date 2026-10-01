# `/watch` (`/w`) · admin

Vigia as mensagens que chegam em **qualquer chat** (privados e grupos) e, quando
alguma casa com uma regra, manda o alerta **no seu privado**:

```
👀 WATCH: MENSAGEM DETECTADA

🔎 Regra #2: /pix\s*\d+/i
👥 Grupo: Família
👤 Nome: Fulano
📱 Número: +5521999999999
📅 Enviada em: 29/09/2026, 14:32:07
💬 Texto: "me manda um pix 50 aí"
```

Tipos de regra:

- **Texto**: casa se a mensagem *contém* o texto, sem diferenciar maiúsculas
  nem acentos (`promoção` casa com `PROMOCAO`).
- **`/regex/flags`**: expressão regular do JavaScript (ex.: `/^bom dia$/i`). As
  flags `g` e `y` são ignoradas.

As regras são testadas contra o texto original da mensagem (menções como
`@111780869222483`), mas no alerta e no `-show` as menções aparecem com o nome
do contato (`@Fulano`) e o grupo com o nome atual.

| Opção | Valor | Descrição |
|---|---|---|
| *(nenhuma)* | | O mesmo que `-show`: ocorrências de todas as regras |
| `-list`, `-l` | | Lista as regras, com o nº e a quantidade de ocorrências |
| `-show`, `-s` | `[-N]` | Resumo das mensagens que casaram com a regra nº N (sem `-N`: de todas). Máx. 20 (setting `watch.showMax`) |
| `-add`, `-a` | `<PATTERN\|/REGEX/>` | Adiciona uma regra (máx. 20, setting `watch.max`). Pode ter espaços |
| `-del`, `-d` | `-N` | Remove a regra nº N e as ocorrências dela. As seguintes são renumeradas |
| `-flush`, `-f` | `[-N]` | Apaga as ocorrências da regra nº N (sem `-N`: de todas, inclusive de regras já removidas). As regras são mantidas |

```
/watch -a promoção
/watch -a "bom dia grupo"
/watch -a /pix\s*\d+/i
/watch -l
/watch -s -2       → mensagens que casaram com a regra 2
/w -s              → de todas as regras (o mesmo que /watch)
/watch -f -2       → apaga as ocorrências da regra 2
/w -f              → apaga as ocorrências de todas as regras
/watch -d -1
```

Detalhes:

- As regras ficam no setting `watch.rules` (sobrevivem a reinícios); dá para
  vê-las também com `/set watch.rules`.
- **Suas próprias mensagens e comandos são ignorados** (senão os próprios
  alertas no seu privado casariam de novo).
- A mesma mensagem não gera dois alertas para a mesma regra; se casar com várias
  regras, vem um alerta só listando todas.
- `-list` e `-show` respondem no chat onde foram digitados. Eles mostram
  conversas de terceiros: num grupo, todos ali veem.
- As ocorrências ficam na tabela `watch_hits` por 30 dias (setting
  `watch.hitsRetentionDays`), ou até um `/watch -f`.
