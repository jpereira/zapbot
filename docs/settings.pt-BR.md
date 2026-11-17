# Settings

Configurações gerais do bot guardadas na tabela `settings` do SQLite. Mudam na hora, sem reiniciar,
e sobrevivem a reinícios. Para ver e alterar, use o [`/set`](commands/set.md) (as descrições dele são as mesmas daqui,
em português).

| Chave | Tipo | Padrão | Descrição |
|---|---|---|---|
| `agenda.max` | 1–500 | `50` | Máximo de itens do [`/cron`](commands/cron.md), somando lembretes e mensagens |
| `alert.intervalMin` | 1–60 | `5` | Intervalo, em minutos, entre as verificações dos [alertas de preço](commands/rates.md#alertas-de-preço) |
| `alert.max` | 1–100 | `20` | Máximo de alertas de preço (somando `/rates` e `/crypto`) |
| `api.enabled` | on/off | `off` | Liga a API HTTP local ([API e MCP](api.md)): `/health`, `/status`, `/notes` e `/send`, com a `api.key`. Vale ao reiniciar o bot |
| `api.host` | texto | `127.0.0.1` | Endereço em que a API escuta. O padrão só atende a própria máquina; fora dele, ponha um proxy com HTTPS na frente. Vale ao reiniciar |
| `api.key` | texto (pode ser vazio) | *(vazio)* | A chave da API (cabeçalho `Authorization: Bearer <chave>` ou `X-API-Key`). Vazia: a API não inicia. Exibida mascarada; use uma chave longa e aleatória |
| `api.port` | 1024–65535 | `3100` | Porta da API HTTP. Vale ao reiniciar |
| `api.sendTo` | lista | *(vazia)* | Para onde o `POST /send` e o `send_message` do MCP podem mandar além do seu próprio chat: telefones com DDI, ids de grupo (`…@g.us`) ou `all` (qualquer destino: só se você confia em quem tem a chave) |
| `ascii.defaultChar` | 1 caractere | `#` | Caractere do traço das letras do [`/ascii`](commands/ascii.md) quando `-char` não é informado |
| `backup.enabled` | on/off | `on` | [Backup automático](commands/backup.md#backup-automático) do banco, uma vez por dia |
| `backup.hour` | 0–23 | `3` | Hora (de Brasília) do backup automático |
| `backup.keep` | 1–90 | `7` | Quantos backups automáticos (e de antes de restaurar) guardar; os manuais ficam até um `/backup -rm` |
| `backup.to` | texto (pode ser vazio) | `""` | [Destino do backup diário](commands/backup.md#backup-automático), além da cópia local: contato, grupo, número ou e-mail, como no `-to`. Vazio: só local. Para vários, use `-to <destino> -to <destino>`. Envio automático, sem pedir `-yes` |
| `bot.admins` | lista | *(vazia)* | Outras pessoas que também usam os comandos `admin` e `owner`: número com DDI (`5521999999999`) ou, pelo `/set`, o nome do contato (`/Jorge Pereira/`) ou a menção. Só o dono altera; o `/bot +a`/`-a` é o atalho. Veja [Admins extras](commands/bot.md#admins-extras) |
| `bot.login` | texto (pode ser vazio) | `""` | Hash (scrypt) da senha do `/bot -login`, que faz quem é de fora virar admin. Vazio: login desligado. Defina pelo `/bot -passwd`, não pelo `/set`. Secreto |
| `bot.paused` | on/off | `off` | Bot desligado: todos os comandos ignorados, exceto o `/bot` (o mesmo do `/bot -on`/`-off`) |
| `bot.users` | lista | `false` | Quem usa os comandos comuns (os não-admin), além de você e do `bot.admins`: `false` (ninguém), `true` (todos) ou pessoas e grupos (num grupo, todos ali usam, mas só dentro dele); uma pessoa só num grupo fica como `telefone:id-do-grupo`. Só o dono altera; o `/bot +u`/`-u` é o atalho. Veja [Usuários](commands/bot.md#usuários) |
| `bot.users.cmds` | lista | *(vazia)* | Os comandos de cada usuário (o `/bot +cmd`/`-cmd`): `item=/a,/b` (só esses) ou `item=!/a,/b` (todos os comuns, menos esses), com o item do `bot.users`. Um comando `admin` (`/gpt`...) só vale na lista "só esses". Sem linha: todos os comuns. Veja [Comandos de cada usuário](commands/bot.md#comandos-de-cada-usuário) |
| `bot.users.limits` | lista | *(vazia)* | Limite de uso de cada usuário por comando (`/bot +cmd /gpt +limit 5/dia`): `item=/gpt:5/day,/tldr:3`. Veja [Limite de uso por usuário](commands/bot.md#limite-de-uso-por-usuário-limit) |
| `cache.editedRetentionDays` | 1–365 | `30` | Dias que as mensagens editadas ficam guardadas para o `/show -e` |
| `cache.messageMediaRetentionHours` | 68–2160 | `68` | Horas que as mídias das mensagens comuns (fotos, vídeos, áudios, documentos) ficam no disco (68; até 2160 = 90 dias). Nunca passam do `cache.messageRetentionHours`: a mídia sai junto com a mensagem. Ocupam espaço em `cache/media`; `/cache -media` libera só elas |
| `cache.messageRetentionHours` | 68–2160 | `68` | Horas que o texto das mensagens comuns fica no banco (68, a janela de apagar para todos; até 2160 = 90 dias): quanto mais, mais o `/tldr` alcança. As mídias têm o seu prazo, o `cache.messageMediaRetentionHours` |
| `cache.reactionRetentionDays` | 1–365 | `30` | Dias que as reações removidas ou trocadas ficam guardadas para o `/show -r` |
| `cache.revokedRetentionDays` | 1–365 | `30` | Dias que as mensagens apagadas ficam guardadas para o `/show` |
| `commands.disabled` | lista | *(vazia)* | Comandos desativados em tempo de execução: o bot os ignora e eles somem do `/help`. O `/set` não pode ser desativado. Nomes desconhecidos são ignorados com aviso no log; aliases válidos são normalizados |
| `contacts.cache` | on/off | `on` | Guarda as fotos de perfil baixadas pelo `/contacts` em `cache/contacts` (entram no backup). Desligado: baixa a cada exportação e não guarda nada |
| `contacts.cacheDays` | 1–365 | `30` | Dias que uma foto em `cache/contacts` vale antes de ser baixada de novo (`/contacts -r` força) |
| `contacts.delayMs` | 0–5000 | `300` | Pausa, em milissegundos, entre uma foto e outra no `/contacts`, para não consultar o WhatsApp em rajada |
| `crypto.coins` | lista | `BTC, ETH, SOL, HYPE` | Moedas do `/crypto` (só as suportadas); normalmente alterada pelo `/crypto -a`/`-d` |
| `cve.max` | 1–20 | `10` | Quantidade de CVEs exibidas pelo `/cve` (o `/cve <max>` sobrepõe) |
| `cve.maxDays` | 1–120 | `7` | Janela, em dias, do `/cve -highscore` |
| `debug.copyTo` | texto (pode ser vazio) | *(vazio)* | Chat que recebe a cópia dos logs; configure pelo [`/debug -copy-to`](commands/debug.md). Vazio: só console |
| `debug.enabled` | on/off | `off` | Modo debug (o mesmo do `/debug -on`/`-off`) |
| `debug.filter` | texto (pode ser vazio) | *(vazio)* | Filtro `/regex/flags` dos logs durante o debug. Vazio: sem filtro; `/debug -off` limpa. O filtro vale após a inicialização; matches são destacados no console com cores |
| `debug.level` | 0–3 | `0` | Nível cumulativo: básico, funções e comandos, integrações, desenvolvimento. Veja [`/debug`](commands/debug.md) |
| `defi.aave.chains` | lista | `1 8453` | Redes (chain id) em que o [`/defi aave`](commands/defi.md#aave-v3) procura as posições: `1` (Ethereum), `8453` (Base) |
| `defi.aave.wallet` | texto (pode ser vazio) | *(vazio)* | Carteira do [`/defi aave`](commands/defi.md#aave-v3) quando não há carteira cadastrada, usada quando `AAVE_WALLET_ADDRESS` não está no `config/.env` |
| `defi.alert.intervalMin` | 1–1440 | `10` | Intervalo (minutos) entre as verificações do [`/defi -alert`](commands/defi.md#alerta-de-saída-da-faixa); consulta as posições na Solana e na HyperEVM, conforme o protocolo |
| `defi.aptos.apikey` | texto (pode ser vazio) | *(vazio)* | Chave da API da Aptos ([Geomi](https://geomi.dev/docs/start)) usada pelo [`/defi liquidswap`](commands/defi.md#liquidswap), quando `APTOS_API_KEY` não está no `config/.env`. Opcional: sem ela, vale o limite anônimo por IP, que basta para o uso do bot. Exibido mascarado |
| `defi.aptos.indexer` | URL | `https://api.mainnet.aptoslabs.com/v1/graphql` | Indexador GraphQL da Aptos usado pelo [`/defi liquidswap`](commands/defi.md#liquidswap) para achar as posições da carteira |
| `defi.aptos.rpc` | URL | `https://api.mainnet.aptoslabs.com/v1` | API REST do fullnode da Aptos usada pelo [`/defi liquidswap`](commands/defi.md#liquidswap) para ler as pools e os tokens. Exibido mascarado |
| `defi.base.rpc` | URL | `https://mainnet.base.org` | RPC da Base usado pelo [`/defi aave`](commands/defi.md#aave-v3), quando `BASE_RPC_URL` não está no `config/.env`. O público limita as consultas. Exibido mascarado |
| `defi.ethereum.rpc` | URL | `https://ethereum-rpc.publicnode.com` | RPC da Ethereum usado pelo [`/defi aave`](commands/defi.md#aave-v3), quando `ETHEREUM_RPC_URL` não está no `config/.env`. O público limita as consultas. Exibido mascarado |
| `defi.hyperevm.rpc` | URL | `https://rpc.hyperliquid.xyz/evm` | RPC da HyperEVM usado pelo [`/defi`](commands/defi.md) no Project X. O público limita as consultas; um RPC próprio costuma ter a chave na URL. Exibido mascarado |
| `defi.morpho.api` | URL | `https://api.morpho.org/graphql` | API GraphQL oficial do Morpho, usada pelo [`/defi morpho`](commands/defi.md#morpho) |
| `defi.morpho.chains` | lista | `8453` | Redes (chain id) em que o [`/defi morpho`](commands/defi.md#morpho) procura as posições: `8453` (Base), `1` (Ethereum)... |
| `defi.morpho.wallet` | texto (pode ser vazio) | *(vazio)* | Carteira do [`/defi morpho`](commands/defi.md#morpho) quando não há carteira cadastrada, usada quando `MORPHO_WALLET_ADDRESS` não está no `config/.env` |
| `defi.solana.rpc` | URL | `https://api.mainnet-beta.solana.com` | RPC da Solana usado pelo [`/defi`](commands/defi.md#rpc-da-solana). Exibido mascarado (a URL costuma levar a chave) |
| `email.alerts` | on/off | `on` | Alertas por e-mail (crash, queda, reconexão...) pelo SMTP do QR Code. Veja [Alertas por e-mail](emails.md#alertas-por-e-mail) |
| `flood.intervalCommand` | 1–3600 | `2` | Proteção contra flood: a janela, em segundos, em que se conta o `flood.maxCommandRepeated`, e quanto tempo o bot ignora quem passou do limite. Veja [Proteção contra flood](commands/bot.md#proteção-contra-flood) |
| `flood.maxCommandRepeated` | 0–100 | `3` | Quantas vezes quem não é admin pode repetir o mesmo comando em `flood.intervalCommand` segundos; passou, o bot avisa uma vez e ignora a pessoa até o intervalo acabar. `0` desliga |
| `forward.delayMs` | 0–10000 | `1000` | Pausa (ms) entre as mensagens quando o [`/forward`](commands/forward.md) encaminha várias, para não encher o WhatsApp de uma vez |
| `forward.header` | on/off | `on` | Cabeçalho "Mensagem encaminhada pelo ZapBot!" no começo do que o [`/forward`](commands/forward.md) envia e a lista de quem recebeu no resultado; desligado, vai só a mensagem e o `✉️ ... com sucesso!` |
| `forward.max` | 1–50 | `10` | Máximo de mensagens que o [`/forward -N`](commands/forward.md#várias-mensagens--n) encaminha de uma vez |
| `forward.maxRecipients` | 1–200 | `30` | Máximo de destinatários de um [`/forward`](commands/forward.md#listas-de-destinatários) (listas e avulsos somados) e de cada lista |
| `get.cache.maxDays` | 1–365 | `2` | Dias que os downloads em cache (`get.cache.tmp`) ficam em `cache/tmp` antes de a limpeza periódica apagá-los |
| `get.cache.tmp` | on/off | `on` | Guarda em `cache/tmp` o que o yt-dlp baixa no `/get` e no `/sticker`: o mesmo link (e o mesmo trecho) não baixa de novo. Veja [Cache dos downloads](commands/get.md#cache-dos-downloads). `off` apaga o original a cada execução |
| `get.maxDownloadMB` | 10–2000 | `200` | Tamanho máximo baixado pelo yt-dlp no `/get` e no `/sticker`, antes da conversão |
| `get.maxSizeMB` | 1–100 | `20` | Tamanho máximo do arquivo convertido pelo ffmpeg no `/get` e no `/sticker` |
| `gif.tag` | texto | `fail` | Tag padrão do `/giphy` |
| `giphy.api.key` | texto (pode ser vazio) | *(vazio)* | Chave do GIPHY, usada quando `GIPHY_API_KEY` não está no `config/.env`. Exibida mascarada (`••••1234`); `/set -reset giphy.api.key` apaga |
| `gpt.admin.key` | texto (pode ser vazio) | *(vazio)* | Chave de admin da OpenAI (`sk-admin-...`) do `/gpt -usage`, usada quando `OPENAI_ADMIN_KEY` não está no `config/.env`. Exibida mascarada; `/set -reset gpt.admin.key` apaga |
| `gpt.api.key` | texto (pode ser vazio) | *(vazio)* | Chave da OpenAI, usada quando `OPENAI_API_KEY` não está no `config/.env`. Exibida mascarada (`••••1234`); `/set -reset gpt.api.key` apaga |
| `gpt.api.model` | texto (da lista) | `gpt-4o-mini` | Modelo do `/gpt`, usado quando `OPENAI_MODEL` não está no `config/.env`. Aceitos: os listados por `/gpt -m` |
| `gpt.credit.since` | texto (AAAA-MM-DD, pode ser vazio) | *(vazio)* | Data da compra dos créditos da OpenAI: o `/gpt -usage` soma o gasto desde ela para mostrar `$usado/$total` (vazio: os últimos 180 dias) |
| `gpt.credit.total` | 0–100000 | `0` | Total de créditos comprados na OpenAI, em dólares (a API não informa o saldo): o `/gpt -usage` mostra `$usado/$total`. `0`: não mostra |
| `gpt.gif.frameMs` | 20–2000 | `200` | Quanto dura cada quadro do GIF do `/draw -gif` e do `/gpt -gif`, em ms (o total é quadros x ms) |
| `gpt.gif.frames` | 2–16 | `9` | Quantos quadros tem o GIF do `/draw -gif` e do `/gpt -gif` (quanto mais quadros, mais caro) |
| `gpt.image.gifModel` | texto | `gpt-image-2.6-flare` | Modelo que gera o GIF do `/draw -gif` e do `/gpt -gif` (só os `gpt-image-2.6-*` fazem GIF e pedem acesso à prévia): o id que a sua conta tem (se não existir, o bot lista os que a chave vê) |
| `gpt.image.model` | texto | `gpt-image-2` | Modelo que gera e edita a imagem do `/draw` e do `/gpt -img`: o id que a sua conta tem (se não existir, o bot lista os que a chave vê). O GIF tem o seu, o `gpt.image.gifModel` |
| `gpt.pricing` | lista `modelo=entrada/saída` | *(vazia)* (o `/gpt -prices` ou a atualização automática preenche) | Preço por 1M de tokens, em dólares, para o custo estimado do rodapé de status do `/gpt` e do `/tldr` (modelo sem preço: `custo n/d`). Vale o nome exato ou o prefixo mais longo |
| `gpt.pricing.auto` | liga/desliga | `on` | Atualiza o `gpt.pricing` sozinho a cada 15 dias, lendo o site da OpenAI (como o `/gpt -prices`); só roda com a chave da OpenAI configurada. Desligado: só à mão |
| `gpt.pricing.updated` | `AAAA-MM-DD` | *(vazio)* | Data da última atualização do `gpt.pricing` (gravada pelo bot): vazio: ainda não atualizou |
| `gpt.status` | liga/desliga | `on` | Rodapé de status nas respostas do `/gpt` e do `/tldr`: bytes enviados (TX) e recebidos (RX), tokens gastos, custo estimado e saldo (com ele desligado, o `-status` liga só naquela vez) |
| `gpt.timeout.ms` | 5000–300000 | `60000` | Timeout do `/gpt`, usado quando `OPENAI_TIMEOUT_MS` não está no `config/.env` |
| `gpt.transcribe.model` | texto | `gpt-transcribe` | Modelo que transcreve o áudio respondido com o `/gpt`: o id que a sua conta tem (o `whisper-1` sai do ar em fev/2027) |
| `gpt.tts.instructions` | texto | `Fale como um robô: voz metálica, monótona e pausada, sem emoção.` | Estilo da voz do `/gpt -voice` (só o `gpt-4o-mini-tts` usa) |
| `gpt.tts.model` | texto | `gpt-4o-mini-tts` | Modelo que gera a voz do `/gpt -voice`: o id que a sua conta tem (só os `gpt-4o-*` seguem o estilo) |
| `gpt.tts.voice` | texto (da lista) | `onyx` | Voz do `/gpt -voice`: `alloy`, `ash`, `ballad`, `coral`, `echo`, `fable`, `nova`, `onyx`, `sage`, `shimmer` ou `verse` |
| `mcp.enabled` | on/off | `off` | **Experimental.** Liga o servidor MCP da API (`POST /mcp`), para um cliente de IA enviar mensagens (para o `api.sendTo`) e ler as suas `/notes`. Exige `api.enabled` e `api.key` |
| `me.maxRepeat` | 1–1000 | `500` | Máximo de repetições do [`/me -repeat`](commands/me.md) (`-r <n>`) |
| `monitor.enabled` | on/off | `on` | Consultas periódicas do [`/monitor`](commands/monitor.md); `off` pausa sem apagar contatos ou histórico |
| `monitor.max` | 1–5 | `5` | Máximo de contatos monitorados. Mais contatos aumentam as consultas e o risco de bloqueio; limite absoluto de 5. Remova contatos antes de reduzir abaixo do total cadastrado |
| `monitor.maxRecords` | 1–1000 | `30` | Máximo de horários guardados por contato e exibidos em `/monitor` e `/monitor -l`. Reduzir remove imediatamente os horários mais antigos excedentes |
| `monitor.pool` | 120–86400 | `300` | Intervalo mínimo em segundos por contato: padrão 5 min, mínimo 2 min. Intervalos curtos podem contribuir para bloqueio pelo WhatsApp; nenhum intervalo é garantidamente seguro |
| `news.brazil` | lista | 15 blogs do [feedspot](https://rss.feedspot.com/brazil_rss_feeds/) | Feeds RSS do `/news -brazil` |
| `news.g1` | lista | `https://g1.globo.com/dynamo/rss2.xml` | Feeds RSS do `/news -g1` |
| `news.gazeta` | lista | `https://www.gazetadopovo.com.br/feed/rss/brasil.xml` | Feeds RSS do `/news -gazeta` |
| `news.hack` | lista | The Hacker News, BleepingComputer, Krebs on Security | Feeds RSS do `/news -hack` |
| `news.max` | 1–10 | `5` | Manchetes exibidas pelo `/news` (o `/news <quantidade>` sobrepõe) |
| `pixelart.maxParts` | 1–10 | `3` | Máximo de partes do [`/pixelart`](commands/pixelart.md) quando a arte é mais alta que 4096 px |
| `pixelart.packs` | lista | `chuck-norris-lvl` | Packs do 16colo.rs sorteados pelo [`/pixelart`](commands/pixelart.md) sem argumentos |
| `poll.retentionDays` | 1–365 | `90` | Dias que as enquetes e os votos ficam guardados para o [`/poll -r`](commands/poll.md#resultado) |
| `rates.coins` | lista | `EUR, USDT` | Moedas habilitadas no `/rates` (`USD`, `EUR`, `GBP`, `USDT`); normalmente alterada pelo `/rates -a`/`-d` |
| `show.alert.deleted` | on/off | `on` | Avisa no seu privado quando alguém apaga uma mensagem; `off` só guarda para o `/show` |
| `show.alert.edited` | on/off | `on` | Avisa no seu privado quando alguém edita uma mensagem; `off` só guarda para o `/show -e` |
| `show.alert.reaction` | on/off | `on` | Avisa no seu privado quando alguém remove ou troca uma reação; `off` só guarda para o `/show -r` |
| `show.alert.status` | on/off | `on` | Recupera status apagados; `off` ignora (nem alerta, nem `/show`) |
| `show.delayMs` | 0–10000 | `700` | Intervalo entre os envios do `/show` |
| `show.max` | 1–100 | `20` | Máximo de mensagens por `/show -N` |
| `stats.enable` | on/off | `on` | Conta as mensagens de cada chat para o `/stats`; `off` para de contar (o histórico fica) |
| `stats.retentionDays` | 7–365 | `90` | Dias que os contadores do `/stats` ficam guardados (e período máximo do `/stats -N`) |
| `status.warnAfter` | 1–50 | `3` | A partir de quantas postagens no Status em 24 horas o `/status` avisa do risco de banimento (não bloqueia) |
| `sticker.author` | texto | `https://github.com/jpereira/zapbot/` | Autor das figurinhas |
| `sticker.name` | texto | `ZapBot` | Nome do pacote das figurinhas |
| `tldr.maxMsgs` | 10–2000 | `500` | Máximo de mensagens enviadas à OpenAI por [`/tldr`](commands/tldr.md) |
| `translate.lang` | texto | `pt` | Idioma de destino padrão do [`/translate`](commands/translate.md) (código: `pt`, `en`, `es`...) |
| `usage.footer` | on/off | `on` | Depois de um comando com limite de uso, avisa quantas chamadas restam (`📊 /gpt: restam 1 de 3 por dia`) |
| `usage.logDays` | 1–365 | `90` | Dias que o histórico das chamadas com limite (`/usage -l`) fica guardado |
| `warn.max` | 0–20 | `3` | Quantos avisos do [`/warn`](commands/warn.md) tiram a pessoa do grupo (o bot precisa ser admin dele). `0`: só conta, nunca remove |
| `watch.hitsRetentionDays` | 1–365 | `30` | Dias que as ocorrências do `/watch` ficam guardadas |
| `watch.max` | 1–100 | `20` | Máximo de regras do `/watch` |
| `watch.rules` | lista (uma por linha) | *(vazia)* | Regras do `/watch`: texto ou `/regex/flags`. Criadas por `/watch <regra>` e removidas por `/watch -rm N` |
| `watch.showMax` | 1–100 | `20` | Máximo de ocorrências exibidas pelo `/watch`, inclusive com `-N` e `-show` |
| `weather.city` | texto | `Niteroi, Rio de Janeiro, Brazil` | Cidade do `/weather` quando nenhuma é informada |
| `weather.maxDays` | 1–16 | `16` | Máximo de dias do `/weather N` (ou `Nd`), contando hoje; 16 é o limite da Open-Meteo |
| `weather.sources` | lista | `met`, `cptec` | Fontes extras do [`/weather`](commands/weather.md#outras-fontes), além da Open-Meteo: `met` (MET Norway) e `cptec` (CPTEC/INPE, só Brasil). Vazio: só a Open-Meteo |
| `weather.userAgent` | texto | `weather-bot/1.0` | O User-Agent das consultas às fontes extras. A MET Norway pede que ele identifique o cliente e dê um contato |
| `zapbot.lang` | `en_US`, `pt_BR` | `en_US` | Idioma do bot: a ajuda (`-h`, `/help`) e todas as respostas, avisos, erros, datas e números saem nele. `/set zapbot.lang pt_BR` (ou `/set zapbot.lang=pt_BR`) troca para o português; `pt-BR`, `pt` e `en` também valem. As descrições que o `/set` mostra de cada setting continuam em português |

Uma chave nova é declarada em `SETTINGS_SCHEMA` (`src/settings.js`), **em ordem alfabética**, com
padrão, tipo, descrição e limites (`allowEmpty` para texto que pode ficar vazio, `secret` para
mascarar o valor no `/set` e nos logs), e lida com `getSetting('<chave>')`. Valores inválidos no
banco são ignorados no boot (vale o padrão, com aviso nos logs).

Um setting de texto aceita de 1 a 100 caracteres; os `secret` (chaves de API, como `gpt.api.key`)
aceitam até 500, porque as `sk-proj-` da OpenAI passam de 160.
