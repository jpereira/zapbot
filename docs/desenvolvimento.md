# Desenvolvimento

## Ambiente de desenvolvimento (Docker)

O serviço `zapbot-dev` monta o código-fonte em `/workspace` e usa
`config/.env.dev`. O `Makefile` tem atalhos:

```bash
make help    # lista todos os alvos
make build   # build da imagem zapbot-dev
make shell   # shell dentro do container de dev; rode "node app.js" lá dentro
make clean   # remove a imagem zapbot-dev
make destroy # clean + apaga os volumes de dev (sessão do WhatsApp e cache!)
```

Os alvos `deploy.*` do `Makefile` fazem deploy num Docker remoto via SSH;
ajuste `DOCKER_REMOTE_SERVER` para o seu host antes de usá-los. Eles usam
`docker --context homelab` em cada comando, sem trocar o contexto global do
Docker.

## Estrutura do código

O `app.js` só faz o bootstrap (carrega o `.env`, prepara o banco, cria o
cliente, registra os eventos e inicia as tarefas periódicas). O código fica em
`src/`:

```
app.js                  bootstrap, na ordem de inicialização
src/
  constantes.js         diretórios, janelas de tempo, APP_ENV
  estado.js             estado da conexão, compartilhado entre os módulos
  log.js                print* coloridos
  db.js                 SQLite (dbGet/dbAll/dbRun) e o sinal dbPronto
  inicializacao.js      tabelas + carga dos settings
  settings.js           SETTINGS_SCHEMA, getSetting/setSetting
  botConfig.js          src/comandos/comandos.json carregado
  cliente.js            cliente do whatsapp-web.js e a marca dos envios do bot
  conexao.js            QR Code, eventos de conexão, reinício e watchdog
  email.js              SMTP e alertas por e-mail
  heartbeat.js          prova de vida para o HEALTHCHECK do Docker
  processo.js           crash e sinais (docker stop)
  limpeza.js            retenção e limpeza periódica
  stats.js              contadores do /stats
  moedas.js, cotacoes.js, alertasPreco.js   /crypto, /cotacao e alertas de preço
  openai.js             modelos aceitos pelo /gpt
  contatos.js, opcoes.js                    contatos/@lid e o parser de opções
  watch/                regras e verificação do /watch
  eventos/              message_create, apagadas, editadas, presença
  comandos/             comandos.json (definição), um arquivo por comando,
                        index.js (HANDLERS) e base.js (ajuda e utilitários)
  util/                 arquivos, formatação, processos externos, URLs
tests/                  testes automatizados (veja Testes)
```

## Testes

Os testes usam o test runner do próprio Node (`node:test`), sem dependência
extra, e rodam em menos de um segundo. Fora do Docker precisam do **Node 22.13
ou mais novo** (por causa do `node:sqlite`) e das dependências instaladas
(`PUPPETEER_SKIP_DOWNLOAD=true npm install`); no container de dev (`make shell`)
é só rodar `npm test`.

```bash
npm test                                   # toda a suíte
npm run lint                               # ESLint (regras recomendadas, eslint.config.js)
node --test tests/watch.test.js            # um arquivo
DEBUG_TESTES=1 npm test                    # mostra o log do bot durante os testes
node --test --experimental-test-coverage --test-coverage-include='src/**' tests/*.test.js
```

No GitHub, o workflow **Testes** (`.github/workflows/ci.yml`) roda o
`npm run lint`, o `npm test` e o `mkdocs build --strict` a cada push no `main` e
em cada pull request; o selo no topo do README e da página inicial mostra o
resultado do último run.

Nada sai da máquina: o `tests/helpers/ambiente.js` troca, antes de carregar o
bot, o WhatsApp (um cliente falso que guarda o que o bot enviou), o SQLite (em
memória), a rede (`axios` com respostas registradas por URL; uma URL sem
resposta falha o teste), o SMTP, o `yt-dlp`/`ffmpeg` e o `sharp`. O banco e as
mídias ficam numa pasta temporária (`ZAPBOT_CACHE_DIR`), nunca no `cache/`.

As mensagens passam pelo `message_create` de verdade (gravação, `/stats`,
`/watch`, permissões e o parser de opções), e o teste falha se o bot registrar
um erro inesperado no log. O `tests/helpers/bot.js` tem os atalhos:
`bot.responder('/show -2')` devolve o que o bot respondeu, `bot.apagar(msg)` e
`bot.editar(msg, 'novo')` disparam os eventos, `bot.reiniciar()` limpa tudo
entre os casos.

| Arquivo | O que cobre |
|---|---|
| `configuracao.test.js` | `comandos.json`, settings, parser de opções, ajuda e a coerência entre config, código, README e `docs/` (inclusive a ordem alfabética e os links) |
| `mensagens.test.js` | Gravação, roteamento, permissões (`onlyAdmin`, modo admin, bot desligado) e a contagem do `/stats` |
| `comandos.test.js` | `/help`, `/debug`, `/uptime`, `/version`, `/ping`, `/noffa`, `/bot`, `/set` |
| `apagadas-editadas.test.js` | Eventos de apagar/editar, `/show` e `/edit` |
| `stats.test.js`, `watch.test.js`, `monitor.test.js` | `/stats`, `/watch`, `/monitor` e o aviso de presença |
| `cotacoes.test.js` | `/cotacao`, `/crypto` e os alertas de preço |
| `externos.test.js` | `/cve`, `/tempo`, `/news`, `/gpt`, `/gif`, `/meme`, `/joke`, `/kernel` |
| `grupo.test.js` | `/everyone`, `/boletos`, `/listageral`, `/walissu`, `/enquete`, `/sticker` |
| `get-cache.test.js` | `/get` (e o anti-SSRF), `/cache` e a limpeza periódica |
| `conexao-email.test.js` | Eventos de conexão, reinício, watchdog, alertas por e-mail, crash e `docker stop` |
| `heartbeat.test.js` | Heartbeat e o `docker/app/healthcheck.js` (executado de verdade) |
| `util.test.js` | Formatação, contatos/`@lid`, menções e arquivos do cache |

Um comando ou opção novos entram com os testes deles; o
`configuracao.test.js` falha se o comando não tiver a página dele em
`docs/comandos/`, se estiver fora de ordem ou se algum link estiver quebrado.

## Documentação

Esta documentação fica em `docs/`, em Markdown, e vira o site
[jpereira.github.io/zapbot](https://jpereira.github.io/zapbot/) com o
[MkDocs Material](https://squidfunk.github.io/mkdocs-material/) (`mkdocs.yml`
tem o menu e o tema). O site é publicado **só nas releases**: o workflow
`.github/workflows/docs.yml` roda quando uma tag `release-*` chega ao GitHub,
então ele sempre mostra a versão estável.

Para ver localmente (Python 3.12, num virtualenv):

```bash
python3 -m venv .venv-docs && . .venv-docs/bin/activate
pip install -r docs/requirements.txt
mkdocs serve                  # http://127.0.0.1:8000, recarrega ao salvar
mkdocs build --strict         # o que o workflow roda: falha em link quebrado
```

Ao mudar um comando, mude a página dele em `docs/comandos/` e as tabelas
Resumo (a do [site](comandos/index.md#resumo) e a do README); um comando novo
também entra no `nav` do `mkdocs.yml`, em ordem alfabética.

## Nova versão

O `bump.sh` incrementa a última tag `release-X.Y` (ex.: `release-X.Y` →
`release-X.Y+1`), troca a versão no `package.json`, no `package-lock.json` e nos
arquivos que citam a versão (ex.: README e `docs/`), commita e cria a tag anotada, as
duas com a mensagem `Bump para X.Y`. Precisa do working tree limpo e não faz
push.

```bash
./bump.sh -n    # dry-run: só mostra o que seria alterado
./bump.sh       # commit "Bump para X.Y" + tag release-X.Y
git push && git push origin release-X.Y   # o push da tag publica o site
```

O push da tag dispara o workflow da [documentação](#documentação), que publica
o site da release em alguns minutos (acompanhe em **Actions › Documentação**).

## Adicionando ou alterando comandos

Os comandos são definidos em `src/comandos/comandos.json`, ao lado dos
handlers. O arquivo tem uma chave `_about` (metadados do projeto, ignorada pelo
bot) e a lista `commands`. Cada entrada de `commands` segue este formato:

```jsonc
{
  "cmd": "/get",                     // nome principal
  "usage": "/get [OPTION]... <url>", // linha "Usage:" no -help
  "aliases": ["/download"],          // nomes alternativos
  "help": "Baixa vídeo ou áudio...", // descrição curta
  "cmd_opts": [
    { "opts": ["audio", "a"], "values": [], "desc": "..." },          // flag
    { "opts": ["startSec", "ss"], "values": ["<segundo>"], "desc": "..." }, // opção com valor
    { "argv": ["<url>"], "desc": "..." }                              // argumento posicional (só doc)
  ],
  "onlyAdmin": false,                // true = só a conta do bot pode usar
  "disabled": false                  // opcional; true = o bot ignora o comando
}
```

- Alterar `help`, `usage`, `aliases`, descrições, `onlyAdmin` ou `disabled`
  não exige código: basta refazer o build e recriar o container.
- Os textos (`usage`, `help` e `desc`) podem citar `${CACHE_DIR}`,
  `${MEDIA_DIR}` e `${TMP_DIR}`: a ajuda troca pelo caminho real (ex.: o
  `/cache -h`).
- Com `"disabled": true` o comando não é carregado: o bot não responde a ele
  nem aos aliases, e ele some do `/help`. No boot aparece nos logs
  `Disabled N callers (...)`. Para desativar sem rebuild, use o setting
  `commands.disabled` (`/set commands.disabled noffa`).
- Um comando **novo** precisa de um arquivo em `src/comandos/` e de uma
  entrada no objeto `HANDLERS` de `src/comandos/index.js`. No boot, o bot avisa
  nos logs se existir comando no JSON sem handler. Comandos, handlers, a
  tabela [Resumo](comandos/index.md#resumo) e as páginas de `docs/comandos/` ficam em **ordem
  alfabética** (o menu do `mkdocs.yml` também).
