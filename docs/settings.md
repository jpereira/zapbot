# Settings

Configurações gerais do bot guardadas na tabela `settings` do SQLite. Mudam na
hora, sem reiniciar, e sobrevivem a reinícios. Para ver e alterar, use o
[`/set`](comandos/set.md).

| Chave | Tipo | Padrão | Descrição |
|---|---|---|---|
| `agenda.max` | 1–500 | `50` | Máximo de itens do [`/cron`](comandos/cron.md), somando lembretes e mensagens |
| `alerta.intervalMin` | 1–60 | `5` | Intervalo, em minutos, entre as verificações dos [alertas de preço](comandos/cotacao.md#alertas-de-preço) |
| `alerta.max` | 1–100 | `20` | Máximo de alertas de preço (somando `/cotacao` e `/crypto`) |
| `backup.enabled` | on/off | `on` | [Backup automático](comandos/backup.md#backup-automático) do banco, uma vez por dia |
| `backup.hour` | 0–23 | `3` | Hora (de Brasília) do backup automático |
| `backup.keep` | 1–90 | `7` | Quantos backups automáticos (e de antes de restaurar) guardar; os manuais ficam até um `/backup -rm` |
| `bot.adminMode` | on/off | `on` | Modo admin: só você (e os do `bot.admins`) usa comandos (o mesmo do `/bot +admin`/`-admin`) |
| `bot.admins` | lista | *(vazia)* | Outras pessoas que também usam os comandos admin (inclusive no modo admin): número com DDI (`5521999999999`) ou, pelo `/set`, o nome do contato (`/Jorge Pereira/`). Só o dono altera. Veja [Admins extras](comandos/bot.md#admins-extras) |
| `bot.paused` | on/off | `off` | Bot desligado: todos os comandos ignorados, exceto o `/bot` (o mesmo do `/bot -on`/`-off`) |
| `cache.editedRetentionDays` | 1–365 | `30` | Dias que as mensagens editadas ficam guardadas para o `/show -e` |
| `cache.revokedRetentionDays` | 1–365 | `30` | Dias que as mensagens apagadas ficam guardadas para o `/show` |
| `commands.disabled` | lista | *(vazia)* | Comandos desativados em tempo de execução: o bot os ignora e eles somem do `/help`. O `/set` não pode ser desativado. Um comando que deixou de existir numa versão nova é ignorado (com aviso no log) e um renomeado vale pelo novo (`/agendar` → `/cron`) |
| `cotacao.coins` | lista | `EUR, USDT` | Moedas habilitadas no `/cotacao` (`USD`, `EUR`, `GBP`, `USDT`); normalmente alterada pelo `/cotacao -a`/`-d` |
| `crypto.coins` | lista | `BTC, ETH, SOL, HYPE` | Moedas do `/crypto` (só as suportadas); normalmente alterada pelo `/crypto -a`/`-d` |
| `cve.max` | 1–20 | `10` | Quantidade de CVEs exibidas pelo `/cve` (o `/cve <max>` sobrepõe) |
| `cve.maxDays` | 1–120 | `7` | Janela, em dias, do `/cve -highscore` |
| `debug.enabled` | on/off | `on` se `APP_ENV=dev` | Modo debug (o mesmo do `/debug`) |
| `defi.alerta.intervalMin` | 1–1440 | `10` | Intervalo (minutos) entre as verificações do [`/defi -alerta`](comandos/defi.md#alerta-de-saída-da-faixa); cada uma lê as posições no RPC da Solana |
| `defi.solana.rpc` | URL | `https://api.mainnet-beta.solana.com` | RPC da Solana usado pelo [`/defi`](comandos/defi.md#rpc-da-solana). Exibido mascarado (a URL costuma levar a chave) |
| `email.alerts` | on/off | `on` | Alertas por e-mail (crash, queda, reconexão...) pelo SMTP do QR Code. Veja [Alertas por e-mail](emails.md#alertas-por-e-mail) |
| `enquete.retentionDays` | 1–365 | `90` | Dias que as enquetes e os votos ficam guardados para o [`/enquete -r`](comandos/enquete.md#resultado) |
| `get.maxDownloadMB` | 10–2000 | `200` | Tamanho máximo baixado pelo yt-dlp no `/get`, antes da conversão |
| `get.maxSizeMB` | 1–100 | `20` | Tamanho máximo do arquivo do `/get` |
| `gif.tag` | texto | `fail` | Tag padrão do `/giphy` |
| `giphy.api.key` | texto (pode ser vazio) | *(vazio)* | Chave do GIPHY, usada quando `GIPHY_API_KEY` não está no `config/.env`. Exibida mascarada (`••••1234`); `/set -reset giphy.api.key` apaga |
| `monitor.max` | 1–1000 | `20` | Máximo de números monitorados |
| `news.brasil` | lista | 15 blogs do [feedspot](https://rss.feedspot.com/brazil_rss_feeds/) | Feeds RSS do `/news -brasil` |
| `news.g1` | lista | `https://g1.globo.com/dynamo/rss2.xml` | Feeds RSS do `/news -g1` |
| `news.gazeta` | lista | `https://www.gazetadopovo.com.br/feed/rss/brasil.xml` | Feeds RSS do `/news -gazeta` |
| `news.hack` | lista | The Hacker News, BleepingComputer, Krebs on Security | Feeds RSS do `/news -hack` |
| `news.max` | 1–10 | `5` | Manchetes exibidas pelo `/news` (o `/news <quantidade>` sobrepõe) |
| `openai.api.key` | texto (pode ser vazio) | *(vazio)* | Chave da OpenAI, usada quando `OPENAI_API_KEY` não está no `config/.env`. Exibida mascarada (`••••1234`); `/set -reset openai.api.key` apaga |
| `openai.api.model` | texto (da lista) | `gpt-4o-mini` | Modelo do `/gpt`, usado quando `OPENAI_MODEL` não está no `config/.env`. Aceitos: os listados por `/gpt -m` |
| `openai.timeout.ms` | 5000–300000 | `60000` | Timeout do `/gpt`, usado quando `OPENAI_TIMEOUT_MS` não está no `config/.env` |
| `pixelart.maxParts` | 1–10 | `3` | Máximo de partes do [`/pixelart`](comandos/pixelart.md) quando a arte é mais alta que 4096 px |
| `pixelart.packs` | lista | `chuck-norris-lvl` | Packs do 16colo.rs sorteados pelo [`/pixelart`](comandos/pixelart.md) sem argumentos |
| `show.alert.edited` | on/off | `on` | Avisa no seu privado quando alguém edita uma mensagem; `off` só guarda para o `/show -e` |
| `show.alert.status` | on/off | `on` | Recupera status apagados; `off` ignora (nem alerta, nem `/show`) |
| `show.delayMs` | 0–10000 | `700` | Intervalo entre os envios do `/show` |
| `show.max` | 1–100 | `20` | Máximo de mensagens por `/show -N` |
| `stats.enable` | on/off | `on` | Conta as mensagens de cada chat para o `/stats`; `off` para de contar (o histórico fica) |
| `stats.retentionDays` | 7–365 | `90` | Dias que os contadores do `/stats` ficam guardados (e período máximo do `/stats -N`) |
| `sticker.author` | texto | `https://github.com/jpereira/zapbot/` | Autor das figurinhas |
| `sticker.name` | texto | `ZapBot` | Nome do pacote das figurinhas |
| `tempo.city` | texto | `Niteroi, Rio de Janeiro, Brazil` | Cidade do `/tempo` quando nenhuma é informada |
| `tempo.maxDays` | 1–16 | `7` | Máximo de dias do `/tempo N` (ou `Nd`); 16 é o limite da Open-Meteo |
| `tldr.maxMsgs` | 10–2000 | `500` | Máximo de mensagens enviadas à OpenAI por [`/tldr`](comandos/tldr.md) |
| `traduzir.api.key` | texto (pode ser vazio) | *(vazio)* | Chave do Google Cloud Translation, usada quando `GOOGLE_TRANSLATE_API_KEY` não está no `config/.env`. Exibida mascarada (`••••1234`); `/set -reset traduzir.api.key` apaga |
| `traduzir.lang` | texto | `pt` | Idioma de destino padrão do [`/traduzir`](comandos/traduzir.md) (código: `pt`, `en`, `es`...) |
| `watch.hitsRetentionDays` | 1–365 | `30` | Dias que as ocorrências do `/watch` ficam guardadas |
| `watch.max` | 1–100 | `20` | Máximo de regras do `/watch` |
| `watch.rules` | lista (uma por linha) | *(vazia)* | Regras do `/watch`: texto ou `/regex/flags`. Normalmente alterada pelo `/watch -a`/`-rem` |
| `watch.showMax` | 1–100 | `20` | Máximo de ocorrências listadas por `/watch -show` |

Uma chave nova é declarada em `SETTINGS_SCHEMA` (`src/settings.js`), **em ordem
alfabética**, com padrão, tipo, descrição e limites (`allowEmpty` para texto
que pode ficar vazio, `secret` para mascarar o valor no `/set` e nos logs), e
lida com `getSetting('<chave>')`. Valores inválidos no banco são ignorados no
boot (vale o padrão, com aviso nos logs).

Para **renomear** uma chave sem perder o valor salvo, além de trocar o nome no
`SETTINGS_SCHEMA`, ponha `'antigo': 'novo'` em `SETTINGS_RENOMEADOS`: no boot, o
valor do nome antigo passa para o novo (se o novo ainda estiver no padrão) e o
antigo sai do banco. Assim já foram `edit.alert` → `show.alert.edit` → `show.alert.edited`,
`revoke.status` → `show.revoke.status` → `show.alert.status`, `stats.enabled` → `stats.enable`,
`gif.giphy.api.key` → `giphy.api.key` e `resumo.maxMsgs` → `tldr.maxMsgs`.
