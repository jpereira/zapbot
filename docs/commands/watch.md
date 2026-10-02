# `/watch` (`/w`) · admin

Vigia as mensagens que chegam em **qualquer chat** (privados e grupos) e, quando
alguma casa com uma regra, manda o alerta **no seu privado** (ou, com `-to`, em
outro chat ou por e-mail; veja [Avisar em outro lugar](#avisar-em-outro-lugar)):

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
`@100000000000001`), mas no alerta e no `-show` as menções aparecem com o nome
do contato (`@Fulano`) e o grupo com o nome atual.

| Opção | Valor | Descrição |
|---|---|---|
| *(nenhuma)* | | O mesmo que `-show`: ocorrências de todas as regras |
| `-list`, `-l` | | Lista as regras, com o nº e a quantidade de ocorrências |
| `-show`, `-s` | `[-N]` | Resumo das mensagens que casaram com a regra nº N (sem `-N`: de todas). Máx. 20 (setting `watch.showMax`) |
| `-add`, `-a` | `<PATTERN\|/REGEX/>` | Adiciona uma regra (máx. 20, setting `watch.max`). Pode ter espaços |
| `-rem`, `-r` | `-N` | Remove a regra nº N e as ocorrências dela. As seguintes são renumeradas |
| `-flush`, `-f` | `[-N]` | Apaga as ocorrências da regra nº N (sem `-N`: de todas, inclusive de regras já removidas). As regras são mantidas |
| `-to` | `<destino\|off>` | Para onde vão os avisos de uma regra: com `-add` (a regra nova) ou com `-N` (troca o destino). Um contato (`/Jorge Pereira/`), uma menção (`@Fulano Da Silva`), um grupo (`/Grupo L200/`), um número (`+5521999999999`) ou e-mail; `off` volta ao seu privado. Repita para vários: a regra avisa em todos. Veja [Avisar em outro lugar](#avisar-em-outro-lugar) |

```
/watch -a promoção
/watch -a "bom dia grupo"
/watch -a /pix\s*\d+/i
/watch -l
/watch -s -2       → mensagens que casaram com a regra 2
/w -s              → de todas as regras (o mesmo que /watch)
/watch -f -2       → apaga as ocorrências da regra 2
/w -f              → apaga as ocorrências de todas as regras
/watch -r -1
/watch -a promoção -to /Grupo Ofertas/   → a regra nova avisa no grupo
/watch -2 -to email                      → a regra 2 passa a avisar por e-mail
/watch -2 -to off                        → e volta ao seu privado
```

Detalhes:

- As regras ficam no setting `watch.rules` (sobrevivem a reinícios); dá para
  vê-las também com `/set watch.rules`.
- **Suas próprias mensagens e comandos são ignorados** (senão os próprios
  alertas no seu privado casariam de novo).
- A mesma mensagem não gera dois alertas para a mesma regra; se casar com várias
  regras, vem um alerta só listando todas (um por destino, se elas tiverem
  `-to` diferentes).
- `-list` e `-show` respondem no chat onde foram digitados. Eles mostram
  conversas de terceiros: num grupo, todos ali veem.
- As ocorrências ficam na tabela `watch_hits` por 30 dias (setting
  `watch.hitsRetentionDays`), ou até um `/watch -f`.

## Avisar em outro lugar

Cada regra pode mandar os avisos para outro lugar em vez do seu privado: um
contato, um grupo, um número ou e-mail, com a mesma busca dos outros comandos
([Destinos](index.md#destinos-contato-grupo-número-ou-e-mail)).

```
/watch -a "vaga de emprego" -to /Grupo Carreira/  → cria a regra já com o destino
/watch -3 -to /Jorge Pereira/                     → troca o destino da regra 3
/watch -3 -to @Fulano Da Silva                    → num grupo, mencionando a pessoa
/watch -3 -to +5521999999999                      → no privado do número
/watch -3 -to email                               → por e-mail (QRCODE_EMAIL_SMTP_TO)
/watch -3 -to /Grupo Carreira/ -to email          → no grupo e por e-mail
/watch -3 -to off                                 → volta ao seu privado
```

- O `/watch -l` mostra o destino de cada regra que não avisa no seu privado:
  `#3  vaga de emprego  (2)  → 👥 Grupo Carreira, 📧 voce@exemplo.com`.
- Com vários `-to`, a regra avisa em todos (o mesmo repetido conta uma vez); o
  `-N -to` troca todos de uma vez. O `-to off` vai sozinho, sem outros `-to`.
- Se uma mensagem casar com regras de destinos diferentes, cada destino recebe
  um aviso só com as regras dele.
- O aviso sai da sua conta, como qualquer mensagem do bot; por e-mail, vai sem
  a formatação do WhatsApp (assunto `[ZapBot] 👀 Watch: #3 vaga de emprego`).
  Num grupo, todos ali veem a mensagem que casou.
- A regra do `-add` não pode ter um ` -to ` solto no meio: ele é lido como o
  destino.
- Os destinos ficam na tabela `watch_destinations`; remover a regra (`-rem`)
  apaga os destinos dela.
