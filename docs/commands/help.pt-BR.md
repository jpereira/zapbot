# `/help`

Exibe o menu com os comandos, ou a ajuda de um só. Cada um vê só o que pode usar:

- **Você** (o dono) e os [admins extras](bot.md#admins-extras): todos os comandos.
- **Os outros** (os [usuários](bot.md#usuários)): só os comandos de role `user`, os `user` da
  [tabela de comandos](index.md#resumo). O menu vem com `(os comandos que você pode usar)` no
  título, e o `/help` de um comando `admin` ou `owner` responde
  `⛔ O /show é só do dono do bot (e dos admins).`
  Quem está limitado a alguns comandos ([`/bot +cmd`](bot.md#comandos-de-cada-usuário)) vê só esses,
  e um `admin` que o dono liberou (`/bot +u +cmd /gpt`) aparece para quem o recebeu. O `/help` e o
  `/whois` sempre passam.

O `/help` sozinho lista os comandos só com o que cada um faz (o `summary` da definição
do comando): o comando em **negrito** e, na linha de baixo, a descrição em _itálico_ (formatação do WhatsApp,
então quebra sozinha na largura do celular, e todas as descrições começam na mesma margem), e termina com a dica de como ver o resto:

````text
/help

*/alias*
_Salva atalhos para comandos com argumentos_

*/ascii*
_O texto em letras grandes de ASCII_

*/backup*
_Backup do banco: lista, detalha, restaura, envia ou apaga_
...

💡 Utilize */help /comando* ou */comando -h* para mais informações.
````

**Atalhos no fim (para usuários).** Quem não é admin também recebe, depois dos comandos e antes da dica, os
[atalhos](alias.md) (aliases) que levam a comandos que pode usar: um alias funciona como o comando para o qual aponta,
então ele merece estar no menu (um alias para um comando que a pessoa não pode usar não aparece, nem um dentro de um
texto com um desses). Cada um é **o mesmo bloco da lista do [`/alias`](alias.md)** (o nome, o `-desc` e o comando para o
qual leva, com os argumentos), sem as marcas 🔇 e 🔒:

````text
🔗 *Atalhos* (2): funcionam como os comandos (/help alias mostra cada um por inteiro)

*/moeda*
→ /stocks USD

*/tuga*
📝 Fala com a voz do tugão
→ /tts -q -l -v tugão $@
````

O dono e os admins não recebem esta seção (têm o `/help alias`, que lista com a descrição inteira). O `/help alias`
de um usuário lista os mesmos atalhos, por inteiro.

| Opção | Valor | Descrição |
|---|---|---|
| `-role`, `-r` | | Lista os comandos separados por role, só os que você pode usar |

Com `-role` (ou `-r`), o menu sai separado por role (`owner`, `admin` e `user`, nessa ordem),
só com os que você pode usar (um role sem nenhum comando visível não aparece; hoje nenhum
comando é `owner`):

````text
/help -r

🔸 Role: admin

*/alias*
_Salva atalhos para comandos com argumentos_
...

🔸 Role: user

*/ascii*
_O texto em letras grandes de ASCII_
...
````

Para a ajuda completa de um comando:

```text
/help get
/help alias        → lista os atalhos cadastrados que você pode executar
/help /show
/help defi orca    → só a ajuda da Orca no /defi (o mesmo que /defi orca -help)
/help defi aave    → só a ajuda do Aave V3
/alias -help       → ajuda de cadastro, listagem e remoção dos atalhos
/watch -help       → ajuda do /watch, incluindo regras, origens e destinos
/show -h           → ajuda do /show
```

Todos os comandos ativos e seus aliases aceitam `-h` e `-help`. A ajuda é curta de propósito: o uso, o resumo de uma
linha, as opções e os argumentos (uma linha cada), até 3 exemplos e, no fim, o link da página do comando
no site (`Detalhes: ...`), onde está tudo explicado. `[]` indica algo opcional; `<>`, um valor a preencher; `...`, algo que pode
ser repetido. Uma linha iniciada por `Ex:` é um exemplo de comando.

Comandos desconhecidos ou desativados recebem uma resposta à mensagem para o dono, admins e usuários
com permissão no chat: `⚠️ Comando '/comando' desconhecido, tente: /help`. `/help /xyz`, com um comando que não existe, responde
`❌ Comando não encontrado: /xyz`.

## Idioma

O `-h`, o `-help` e o `/help` seguem o setting `zapbot.lang`: `en_US` (inglês, o padrão) ou `pt_BR`.
Vale também para as demais respostas, avisos, erros, datas e números do bot. Mude com
`/set zapbot.lang pt_BR` (ou `/set zapbot.lang=en_US`); vale na hora, sem reiniciar. As descrições
que o `/set` mostra de cada setting ainda são em português.

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
Usage: /ping
Verifica se o bot está respondendo (responde pong).

Ajuda: -help, -h
```
