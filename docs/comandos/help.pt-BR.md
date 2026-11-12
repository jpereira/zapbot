# `/help` (`/h`, `/ajuda`)

Exibe o menu com os comandos, ou a ajuda de um só. Cada um vê só o que pode usar:

- **Você** (o dono) e os [admins extras](bot.md#admins-extras): todos os comandos.
- **Os outros** (os [usuários](bot.md#usuários)): só os comandos de role `user`, os `user` da
  [tabela de comandos](index.md#resumo). O menu vem com `(os comandos que você pode usar)` no
  título, e o `/help` de um comando `admin` ou `owner` responde
  `⛔ O /show é só do dono do bot (e dos admins).`
  Quem está limitado a alguns comandos ([`/bot +cmd`](bot.md#comandos-de-cada-usuário)) vê só esses,
  e um `admin` que o dono liberou (`/bot +u +cmd /gpt`) aparece para quem o recebeu. O `/help` e o
  `/whois` sempre passam.

O `/help` sozinho lista um comando por linha, só com o que ele faz (o `summary` da
definição do comando), num bloco monoespaçado (para manter o alinhamento no celular), e termina com a dica de como ver o resto:

````text
/help

```
 /alias - Salva atalhos para comandos com argumentos
 /ascii - O texto em letras grandes de ASCII
 ...
```

💡 Utilize */help /comando* ou */comando -h* para mais informações.
````

| Opção | Valor | Descrição |
|---|---|---|
| `-role`, `-r` | | Lista os comandos separados por role, só os que você pode usar |

Com `-role` (ou `-r`), o menu sai separado por role (`owner`, `admin` e `user`, nessa ordem),
só com os que você pode usar (um role sem nenhum comando visível não aparece; hoje nenhum
comando é `owner`):

````text
/help -r

```
Role: admin
 /alias - Salva atalhos para comandos com argumentos
 ...

Role: user
 /ascii - O texto em letras grandes de ASCII
 ...
```
````

Para a ajuda completa de um comando:

```text
/help get
/help alias        → lista os atalhos cadastrados que você pode executar
/h /show
/help defi orca    → só a ajuda da Orca no /defi (o mesmo que /defi orca -help)
/help defi aave    → só a ajuda do Aave V3
/alias -help       → ajuda de cadastro, listagem e remoção dos atalhos
/watch -help       → ajuda do /watch, incluindo regras, origens e destinos
/show -h           → ajuda do /show
```

Todos os comandos ativos e seus aliases aceitam `-h` e `-help`. A ajuda mostra o uso, as opções, os
argumentos e os aliases. `[]` indica algo opcional; `<>`, um valor a preencher; `...`, algo que pode
ser repetido. Uma linha iniciada por `Ex:` é um exemplo de comando.

Comandos desconhecidos ou desativados recebem uma resposta à mensagem para o dono, admins e usuários
com permissão no chat: `⚠️ Comando '/comando' desconhecido, tente: /help` (essa resposta ainda é em
português nos dois idiomas). `/help /xyz`, com um comando que não existe, responde
`❌ Comando não encontrado: /xyz`.

## Idioma

O `-h`, o `-help` e o `/help` seguem o setting `zapbot.lang`: `en_US` (inglês, o padrão) ou `pt_BR`.
Mude com `/set zapbot.lang pt_BR` (ou `/set zapbot.lang=en_US`); vale na hora, sem reiniciar. As
respostas dos outros comandos ainda são em português, e estão sendo migradas.

```text
/set zapbot.lang en_US
/ping -h
Usage: /ping
Checks whether the bot is responding (replies pong).

Help: -help, -h
```

```text
/set zapbot.lang pt_BR
/ping -h
Uso: /ping
Verifica se o bot está respondendo (responde pong).

Ajuda: -help, -h
```
