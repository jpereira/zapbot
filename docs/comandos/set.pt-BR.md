# `/set` · admin

Lista e altera as configurações do bot guardadas na tabela `settings` (veja
[Settings](../settings.md)). A mudança vale na hora e sobrevive a reinícios.

| Opção | Valor | Descrição |
|---|---|---|
| *(nenhuma)* | | Lista todas as chaves e valores e, no seu privado, as variáveis do `config/.env` |
| `<chave>` | | Mostra valor, padrão, tipo e descrição (a descrição ainda é em português) |
| `<trecho>` ou `/regex/` | | Não sendo uma chave: lista as chaves que contêm o trecho (sem diferenciar maiúsculas) ou casam com a regex. Ex.: `/set alerta`, `/set /^show\./` |
| `<chave> <valor>` | | Altera. Listas: itens separados por vírgula ou espaço (`watch.rules`: uma regra por linha; `bot.users.cmds`: separados por espaço, pois cada item tem vírgulas); `""` esvazia |
| `<chave>=<valor>` | | O mesmo que `<chave> <valor>`, para qualquer chave. Ex.: `/set zapbot.lang=pt_BR` |
| `-append`, `-a` | `<chave> <valor>` | Numa lista, acrescenta os itens (os que já estão ficam). Ex.: `/set -a bot.admins +5521999999999` (no `bot.admins` e no `bot.users` vale também `/Jorge Pereira/` e `@Fulano Da Silva`; no `bot.users`, grupos) |
| `-rm` | `<chave> <valor>` | Numa lista, tira os itens. Ex.: `/set -rm commands.disabled noffa` |
| `-reset`, `-r` | `<chave>` | Volta ao valor padrão |
| `<VARIÁVEL>` | | Uma variável do `config/.env` (ex.: `OPENAI_MODEL`): mostra o valor, só no seu privado |

```text
/set
/set show.max
/set alerta          → só as chaves com "alerta" (alerta.intervalMin, alerta.max, defi.alerta.intervalMin)
/set /^news\./       → as que casam com a regex
/set show.max 10
/set monitor.pool=300
/set monitor.maxRecords=30
/set zapbot.lang=pt_BR  → o mesmo que /set zapbot.lang pt_BR
/set debug.enabled off
/set sticker.name "Meu Bot"
/set commands.disabled noffa everybody
/set commands.disabled ""
/set -r crypto.coins
/set watch.rules ""
/set -a commands.disabled walissu   → desativa mais um, sem reescrever a lista
/set -rm commands.disabled noffa   → reativa só esse
/set -a bot.admins /Jorge Pereira/  → um admin extra, pelo nome do contato (veja o /bot)
/set bot.users /Grupo Familia/      → libera os comandos comuns no grupo (veja o /bot)
```

## Monitor de contatos

Como qualquer outra chave, os quatro settings do [`/monitor`](monitor.md) aceitam
`<chave> <valor>` ou `chave=valor`:
`monitor.enabled`, `monitor.pool`, `monitor.max` e `monitor.maxRecords`.

```text
/set monitor.pool 300
/set monitor.pool=300
/set monitor.max=5
/set monitor.maxRecords=30
/set monitor.enabled=false
```

`monitor.pool` é o intervalo mínimo em segundos por contato (120 a 86400, padrão 300), e
`monitor.max` limita os cadastros (1 a 5, padrão 5). `monitor.maxRecords` limita o histórico no
banco e nas listas por pessoa (1 a 1000, padrão 30); reduzir esse valor
remove imediatamente os horários mais antigos excedentes. `monitor.enabled=false` pausa sem
apagar cadastros ou histórico. As mudanças valem sem reiniciar.

## Listas: `-append` e `-rm`

Nas chaves que são listas (`bot.admins`, `bot.users`, `commands.disabled`, `crypto.coins`,
`watch.rules`, os feeds do `news.*`...), o `<chave> <valor>` troca a lista inteira; o `-append`
(`-a`) acrescenta itens e o `-rm` tira, sem mexer no resto. Os itens passam pela mesma validação do
`<chave> <valor>`: um número de telefone vira só os dígitos, um comando vira o nome principal
(`/set -rm commands.disabled /mute` tira o `/mute`).

```text
/set -a crypto.coins hype
✅ crypto.coins + HYPE
= BTC, ETH, SOL, HYPE
```

Numa chave que não é lista (`show.max`, `debug.enabled`...), o `-append` e o `-rm` são recusados:
troque o valor com `/set <chave> <valor>` ou volte ao padrão com `/set -reset <chave>` (`-r`).

O `bot.admins` e o `bot.users` só o dono altera (inclusive com `-append`, `-rm` e `-reset`): um
admin extra não pode se dar (nem dar a outros) esse acesso. Neles, além do número, vale o nome do
contato (`/Jorge Pereira/`) ou a menção: o bot guarda o telefone e mostra o nome ao lado
([Admins extras](bot.md#admins-extras)). O `bot.users` aceita também grupos (guarda o id e mostra
`👥 Nome`) e `true`/`false` ([Usuários](bot.md#usuários)).

## Variáveis do `config/.env`

No seu privado (o chat com você mesmo), o `/set` mostra também as variáveis do
[`config/.env`](../configuracao.md) que o bot lê, **somente para leitura**: elas mudam no arquivo, e
valem quando o container é recriado. As chaves e as senhas aparecem mascaradas (`••••1234`).

```text
🔒 config/.env (somente leitura: mude no arquivo e recrie o container)

GIPHY_API_KEY                   ••••a1b2
OPENAI_MODEL                    (vazio)
PHONE_NUMBER                    5521999999999
QRCODE_EMAIL_SMTP_PASS          ••••mnop
...
```

Em outro chat (um grupo, por exemplo), no lugar delas vem só o aviso
`🔒 As variáveis do config/.env (somente leitura) aparecem só no seu privado.` Tentar alterar uma
(`/set OPENAI_MODEL gpt-4.1`) é recusado.

