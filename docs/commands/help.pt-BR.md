# `/help`

Mostra um índice curto com as categorias disponíveis para quem chamou. As listas respeitam
as permissões do chat, o role, as delegações do [`/bot +cmd`](bot.md) e os comandos desativados.

| Categoria | Conteúdo |
|---|---|
| `/help groups` | Ações do [`/g`](group.md), agrupadas por configuração, participantes, moderação, avisos e grupos da conta |
| `/help mod` ou `/help moderation` | Só as ações de moderação de grupos |
| `/help media` | Fotos, vídeos, figurinhas e áudio |
| `/help ai` | ChatGPT e ferramentas de IA |
| `/help finance` | Cotações, investimentos e alertas |
| `/help tools` | Agenda, notas e outras utilidades |
| `/help admin` | Permissões, configurações, backups e painel web |
| `/help aliases` | [Atalhos](alias.md) que você pode executar, com seus destinos |

| Opção | Valor | Descrição |
|---|---|---|
| `-full`, `-f` | | Lista todos os comandos disponíveis por categoria, uma linha por comando |
| `-role`, `-r` | | Lista os comandos disponíveis por role, na ordem owner, admin e user |

`/g -h` abre a mesma lista que `/help groups`. As ações de grupo aparecem com o nome
`/g.<ação>`. Os comandos avulsos continuam disponíveis conforme suas permissões.

Para ver sintaxe, opções e exemplos de um comando:

```text
/help get
/help /calendar
/help /g.warn
/g.warn -h
/help defi aave
```

## Idioma

O `-h`, o `-help` e o `/help` seguem o setting `zapbot.lang`: `en_US` (inglês, o padrão) ou `pt_BR`.
Vale também para as demais respostas, avisos, erros, datas e números do bot. Mude com
`/set zapbot.lang pt_BR` (ou `/set zapbot.lang=en_US`); vale na hora, sem reiniciar. As descrições
que o `/set` mostra de cada setting ainda são em português.

```text
/set zapbot.lang en_US
/ping -h
*/ping* · Checks whether the bot is responding

*Usage*
`/ping`

🔗 https://jpereira.github.io/zapbot/commands/ping/
```

```text
/set zapbot.lang pt_BR
/ping -h
*/ping* · Verifica se o bot está respondendo

*Uso*
`/ping`

🔗 https://jpereira.github.io/zapbot/pt-BR/commands/ping/
```
