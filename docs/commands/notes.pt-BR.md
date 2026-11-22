# `/notes` · admin

Anotações salvas no banco, que valem para qualquer chat (grupo ou privado). Cada uma tem um ID, e o
`-alert` avisa dela numa data/hora. Só o dono (e os admins) usa.

> 🔐 **Notas privadas:** uma tag pode ser **protegida com senha** (`/notes -lock #stash`): o texto e os arquivos são
> cifrados, só liberam e abrem no **seu próprio privado**, travam de novo sozinhos e nunca saem com `-to`. Veja
> [Tags protegidas](#tags-protegidas--lock) e os [cenários de privacidade](#cenários-de-privacidade).

```text
/notes [-list|-l] [#tag...] [-to <destino>]...
/notes -compact|-c [#tag...]
/notes -search|-s [#tag...] <texto|/regex/flags> [-to <destino>]...
/notes -update|-u <id> [#tag] <novo texto>
/notes -view|-v <id...|#tag...> [-to <destino>]...
/notes -move|-m #tag #novatag
/notes -desc|-d #tag [<descrição>|-rm]
/notes -export|-e [#tag...] [-to <destino>]...
/notes #tag <texto>
/notes -add|-a #tag <texto> [-alert <quando> [-to <destino>]...]
/notes -rm|-r <id...|#tag...|all>
/notes -alert [<id|#tag...> [<quando> [-to <destino>]...]]
/notes -alert -r <id...|#tag...|all>
/notes -lock|-lo [<senha>] #tag [-now|-n|-no | -clean -yes]
/notes -view|-export|-list|-search -lock [<senha>] #tag
```

| Opção | Valor | Descrição |
|---|---|---|
| `-list`, `-l` | `[#tag...]` | Lista as anotações com o ID, agrupadas por `#tag` (o `/notes` sozinho mostra as tags; `/notes #casa` lista as dela). Com uma ou mais tags, só as delas |
| `-compact`, `-c` | `[#tag...]` | Lista com uma linha por nota (título, os ícones 🖼️ mídia, ⏰ alerta e 🔗 link, e a hora), agrupadas por dia. Também vale no fim: `/notes #pt -c`, `/notes -l -c` |
| `-search`, `-s` | `[#tag...] <texto\|/regex/flags>` | Só as anotações que casam, agrupadas como na lista. Veja [Buscar](#buscar) |
| `-update`, `-u` | `<id> [#tag] <novo texto>` | Troca o texto da anotação (e a tag, se vier uma; o alerta e a imagem ficam). Em resposta a uma mensagem, sem texto, usa o dela (com o ↩️) |
| `-view`, `-v` | `<id...\|#tag...>` | Mostra a anotação com a mídia (texto na legenda; sem mídia, só o texto). A tag pode vir pela metade. Com `-to`, manda nos destinos (ou por e-mail, com a imagem anexada) |
| `-move`, `-m` | `#tag #novatag` | Renomeia a tag em todas as anotações. Se a nova já existe, as duas se juntam |
| `-desc`, `-d` | `#tag [<descrição>\|-rm]` | Descrição da tag, que aparece na lista e no `/notes` sozinho. Sem texto, mostra a atual; com `-rm`, apaga. O `-move` leva a descrição junto |
| `-export`, `-e` | `[#tag...]` | Manda as anotações num PDF, com as imagens e o texto como legenda (cabeçalho, rodapé com versão, host, data e hora, e paginação). Com tags, só as delas. Veja [Exportar](#exportar) |
| `-lock`, `-lo` | `[senha] #tag` | Protege uma tag com senha (texto e arquivos cifrados) ou libera; a senha pode vir no comando. Veja [Tags protegidas](#tags-protegidas--lock) e [Senha no comando](#senha-no-comando) |
| `-now`, `-n`, `-no` | | Trava a tag agora, sozinha ou com `-lock` em qualquer ordem (`-n #foo`, `-lock #foo -now`, `-n -lock #foo`) |
| `-clean` | | Com `-lock #tag`: apaga do histórico os comandos antigos que você digitou para a tag (precisa de `-yes`) |
| `#tag <texto>` | | Sem opção na frente, vira uma anotação nova, igual ao `-add`: `/notes #casa não esquecer de remover a opção tal`. A `#tag` é obrigatória: `/notes meu texto` dá erro. Só `/notes #casa`, sem texto, lista as da tag |
| `-add`, `-a` | `#tag <texto>` | Adiciona uma anotação; a `#tag` é obrigatória e vem no começo do texto. O texto vai até o `-alert`, se houver, e aceita várias linhas |
| `-rm`, `-r` | `<id...\|#tag...\|all>` | Remove as anotações com esses IDs (`-r 2`, `-r 1 2 3` ou `-r 1,2,3`), de uma tag (`-r #casa`) ou todas (`all`). Com uma `#tag`, os números são as **posições na lista dela** (`-r #casa 1` é a 1ª da `#casa`), não IDs. Uma tag inteira ou `all` pede o `-yes`. Se algum ID, posição ou tag não existe, nenhuma sai. Junto com `-alert`, tira só o alerta, mantendo as anotações |
| `-yes`, `-y` | | Com `-rm`: confirma a remoção de uma tag inteira ou de todas as anotações (sem ele, o bot só diz quantas sairiam) |
| `-alert` | `<quando>` | Avisa da anotação (ou de todas as de uma `#tag`) numa data/hora. Veja [Alertas](#alertas) |
| `-to` | `<destino>` | Com `-alert`: avisa num contato, grupo, número ou e-mail em vez do seu privado. Com a lista (`-l`, `#tag`) ou o `-export`: manda a lista ou o PDF lá, em vez de responder no chat. Repita para vários |

```text
/notes -a #casa comprar leite
/notes #casa comprar pão                             → o mesmo que -a
/notes -a #contatos ligar pro João -alert amanhã 9h
/notes -l
/notes -r 2
/notes -r all -yes
/notes -u 3 comprar pão e leite             → troca o texto da nº 3
/notes -u #3 #casa comprar pão\ne leite          → troca o texto e passa para a #casa
/notes -m #casa #lar                           → renomeia a #casa para #lar
/notes -d #casa Coisas da casa                 → descrição da #casa
/notes -v 76                                   → a nº 76 com a imagem, se tiver
/notes                                            → #casa: 3, #duvidas: 1, sem tag: 2
/notes -compact                → uma linha por nota, por dia
```

## Tags

```text
/notes #casa Lembrar de comprar pão
/notes -a #duvidas Olhar sobre como funciona as ETFs
/notes                → as tags, com a quantidade de anotações
/notes -l             → lista tudo, uma mensagem por #tag (as sem tag, de antes, por último)
/notes #casa          → só as da #casa (o mesmo que /notes -l #casa)
/notes -r #casa 1 3   → remove a 1ª e a 3ª da #casa (as posições na lista dela)
/notes -r #casa -yes → remove todas as da #casa (sem o -yes, só diz quantas sairiam)
/notes -r all -yes   → remove tudo
```

- Respondendo uma mensagem, `/notes #lembrete` (ou `/notes -a #lembrete`) anota o texto dela, com o
  ↩️ na frente. Com texto digitado junto (`/notes #lembrete Lembrar de salvar isso!`), o que você digitou
  vem primeiro (é o título) e a mensagem respondida vem depois, após uma linha em branco, com ↩️; a mídia
  dela (imagem, documento, áudio, vídeo) é guardada na mesma anotação. Dá para juntar com
  `-alert`: `/notes -a #lembrete -alert amanhã 9h`. No PDF, o ↩️ vira `[resp.]`.
- No texto da anotação, `\n` vira quebra de linha (`/notes #casa pão\nleite`); `\\n` fica como está.
- A primeira linha é o título (o único em negrito), o resto vem como foi digitado e todo link
  `http(s)://` sai de onde estava e vai para o fim, em bullets sob `🔗 Links` (na lista, no `-view`,
  no e-mail e no PDF, onde fica só `Links`, sem o emoji). Isso é feito ao exibir: o texto guardado
  não muda.
- A imagem sai com uma borda preta fina no `-view` (chat e e-mail) e no PDF; o gif vai como está.
- **Mídias:** mande uma imagem, documento, áudio ou vídeo com a legenda `/notes #minhatag Texto` ou
  responda uma mídia com `/notes #tag [texto]`. O texto é opcional (numa resposta com legenda,
  vale a legenda, com o ↩️). O arquivo fica em `cache/notes/` (fora do `cache/media/`, então o
  `/cache -media` não apaga), com o nome original no caso de documentos, e a lista mostra
  `🖼️ imagem`, `🎬 vídeo`, `🎵 áudio` ou `📎 nome-do-arquivo`. Para receber o arquivo de volta, use o
  [`-view`](#ver-e-organizar) (o áudio não tem legenda: o texto vai em outra mensagem). O `-rm`
  apaga o arquivo junto, e o [`/backup`](backup.md) leva as mídias num arquivo à parte.
- A tag pode vir pela metade na lista, na busca, no `-view`, no `-desc` e no `-export`:
  `/notes #idei` acha a `#ideias`. A exata ganha; senão valem as que começam com o que você
  digitou, depois as que contêm. Onde mexe nos dados (`-rm`, `-move` e o `-alert` com `<quando>`),
  a tag vai inteira.
- Cada anotação tem no máximo uma tag, a do começo do texto. Maiúsculas e minúsculas valem igual.
- Para anotar a tag é obrigatória: `/notes meu texto` (sem tag) dá erro. `/notes #casa` sozinho lista
  as da tag; numa resposta ou com mídia, anota o que veio nela.

## Ver e organizar

```text
/notes -v 76                  → a nº 76: a mídia com o texto na legenda (sem mídia, só o texto)
/notes -v 3 5                 → várias de uma vez, uma mensagem para cada
/notes -v #idei               → todas da #ideias
/notes -v 76 -to /Família/    → manda no grupo (por e-mail, o arquivo vai anexado)
/notes -m #casa #lar       → renomeia a tag em todas as anotações
/notes -d #lar Coisas da casa   → descrição da tag
/notes -d #lar                → mostra a descrição
/notes -d #lar -r            → apaga a descrição
```

A lista compacta (`/notes -c`) traz uma linha por anotação, agrupada por tag e por dia, com a descrição da
tag em itálico, o ID, o começo do texto, os ícones e a hora:

```text
📝 *ANOTAÇÕES* (6)

🏷️ casa (3) · 🔗 1
👉 Coisas do apartamento

📆 03/11/2026
#12 Comprar um chuveiro novo · 09:15
#13 Ligar para o encanador sobre o vazamento · 09:20
#14 resenha-tomada-inteligente.exemplo.com/melho… 🔗 · 20:02

🏷️ ideias (3)
👉 Ideias para o projeto de fim de semana

📆 05/11/2026
#15 Parede de fotos com as imagens da viagem · 18:40
#16 Montar uma estante com paletes · 18:44
#17 Conhecer a trilha nova perto da lagoa · 22:03

💡 _🖼️ mídia · ⏰ alerta · 🔗 link_
💡 _-v <nº> abre a nota inteira_
💡 _sem o -c, a lista completa_
```

- O cabeçalho do `-view` traz o ID, a tag e a data. Um ID ou tag que não existe cancela tudo, sem
  enviar nada.
- O `-move` para a tag nova que já existe junta as anotações das duas. A descrição vai junto; se a
  nova já tinha uma, fica a dela. Tag de origem que não existe, ou igual à nova, é recusada.
- A descrição aparece embaixo do nome da tag na lista (em itálico) e ao lado dela no `/notes` sozinho:
  `#casa: 3 · Coisas da casa`. Dá para descrever uma tag que ainda não tem anotações; ela só
  aparece na lista quando tiver.

## Buscar

O mesmo `-q` do [`/show`](show.md) e do [`/watch`](watch.md): texto sem diferenciar maiúsculas e
acentos, ou `/regex/flags`.

```text
/notes -s pao                    → as que têm "pão" (e "PAO", "Pão"...)
/notes -s /etf|bolsa/i      → regex
/notes -s "comprar pão"          → com espaços, o texto vale direto (as aspas são opcionais)
/notes -s #casa leite            → só as da #casa que casam
/notes -s casa                   → também casa o nome da tag (as da #casa)
/notes -s etf -to /Família/      → manda o resultado nos destinos
```

- Regex com risco de travar o bot (como `(x+)+`) é recusada.

## Exportar

```text
/notes -e          → ZapBot_notes_20261027_1530.pdf, com tudo, agrupado por #tag
/notes -e #casa    → ZapBot_notes_tag-casa_20261027_1530.pdf, só as da #casa
/notes -e -to /Família/                  → o PDF no grupo Família
/notes #casa -to /Jorge Pereira/ -to email  → a lista da #casa no contato e por e-mail
```

O `-to` funciona como nos outros comandos (veja
[Avisar em outro chat ou por e-mail](stocks.md#avisar-em-outro-chat-ou-por-e-mail)). Não vale no
`-rm`.

- Sai como documento no próprio chat (com `-to`, nos destinos; por e-mail, em anexo). A data e a
  hora do nome são de Brasília.
- A descrição da tag (`-desc`) vem logo abaixo do título da tag (`#casa (3)`), para cada tag que
  tem. O título também resume quantas anotações têm mídia, alerta e link.
- As imagens entram no PDF, em cima do texto da anotação (que serve de legenda), reduzidas para caber
  (JPEG, fundo branco no lugar de transparência). Uma imagem que não abre fica de fora, com um aviso
  na linha da anotação. Documentos, áudios e vídeos não entram no PDF; a linha da anotação avisa.
- A fonte do PDF é Latin-1: acentos saem normais, mas emojis e símbolos fora dela são omitidos.

## Tags protegidas (`-lock`)

> **As notas protegidas só são liberadas e acessadas no seu próprio privado** (as mensagens com você mesmo). Num grupo,
> no chat de outra pessoa ou com `-to` (para mandá-las a algum lugar), elas continuam travadas para quem lê: só aparece
> o 🔒, mesmo com a tag liberada no seu privado.

Para notas que não podem ser lidas por quem pegar o banco ou um backup. Uma **tag protegida** tem o texto das notas e
os arquivos cifrados (AES-256-GCM) com uma chave feita de uma senha que **nunca é guardada**.

```text
/notes -lock #foo
🔑 Crie uma senha para a #foo:             ← primeira vez: pede duas vezes; sem recuperação
(você digita a senha; o bot apaga a sua mensagem e a mantém fora do histórico)
🔓 A tag #foo agora está protegida (3 notas cifradas) e liberada, vai ser travada em 5m sem interagir.

/notes -lock #foo                          ← depois: libera
🔑 Digite sua senha:
🔓 A tag #foo está liberada, vai ser travada em 5m sem interagir.

/notes -lock #foo -now                     → trava agora (também /notes -n #foo, /notes -n -lock #foo)

/notes -v -lock #foo                       → pede a senha e depois mostra as notas (também -e, -l e -s)
```

- **Liberada**, a tag funciona como qualquer outra (anotar, listar, buscar, ver, PDF). Cada uso renova o tempo; passados
  `notes.lockMinutes` ([setting](../settings.md), padrão 5) sem uso ela **trava sozinha**, e reiniciar o bot trava
  tudo.
- **Tudo em uma linha:** `/notes -v -lock #foo` (ou `-e`, `-l`, `-s`) pede a senha e, liberada a tag, já executa o
  comando. Se a tag já estiver liberada, só mostra. Precisa de uma tag protegida.
- **Só no seu privado:** liberar (a senha), ler (`-v`, `-l`, `-s`, `-e`, uma `#tag` sozinha), anotar (`/notes #foo ...`) e
  editar (`-u`) só funcionam lá. Em qualquer outro chat a mesma tag, mesmo liberada, se comporta como travada: listas,
  busca e PDF mostram só o 🔒, anotar e editar são recusados (`🔒 As notas da #foo só abrem no seu próprio privado`) e o
  comando que você digitou ali fica fora do histórico.
- **Nunca enviadas a outros:** `-v`, `-e`, `-l` ou `-s` de uma tag protegida com `-to` (um contato, um grupo ou um e-mail)
  é recusado (`🔒 As notas da #foo são protegidas: não vão para outros chats nem e-mails (sem -to)`). Uma lista de todas
  as notas enviada com `-to` mostra o 🔒 onde estão as protegidas, nunca o texto. O alerta de uma nota protegida diz só
  que existe uma.
- **Travada**, listas, busca e PDF mostram só `🔒 (nota protegida)`, um alerta diz apenas que há uma nota, e anotar nela é
  recusado (antes, `/notes -lock #foo`).
- **A senha só é digitada no seu próprio privado** (as mensagens com você mesmo), como resposta à pergunta. O bot apaga
  a sua mensagem e a troca no histórico; se o WhatsApp não deixar apagar, ele pede que você apague. 5 senhas erradas
  bloqueiam a tag por 15 minutos.
- **Nada fica em claro:** uma nota salva numa tag protegida tem o comando e a mídia que você mandou removidos do
  histórico. Para os comandos que você digitou **antes** de proteger, `/notes -lock #foo -clean -yes` apaga.
- **Não há recuperação:** esqueceu a senha, perdeu as notas. Os backups levam só o conteúdo cifrado.
- Uma tag protegida não pode ser renomeada nem unida (`-move`) e as notas dela não mudam de tag.

### Senha no comando

A senha também pode vir no comando, no lugar da pergunta: uma mensagem só e pronto.

```text
/notes -v -lock minhasenha #stash        → libera a #stash e mostra as notas
/notes -lock "minha senha longa" #stash  → só libera (aspas para uma senha com espaços)
/stash.lock minhasenha                   → com um alias como /alias -q /stash.lock /notes -v -lock $@ #stash
```

A senha é a primeira palavra depois do `-lock` (ou `-lo`, ou `-l` ao lado de `-v`/`-e`/`-s`/`-c`) que não começa com `#` nem
`-`; o `-lock` precisa estar entre as opções do início (um `-lock palavra` no texto de uma nota é só texto). Seja qual
for o resultado, **a mensagem com a senha é apagada** (certa, errada, tag que não é protegida, grupo, tag que falta): a
certa libera e mostra, a errada responde `❌ Senha incorreta` (5 erros bloqueiam a tag por 15 minutos, como na
pergunta) e `❌ A tag #x não é protegida` explica que a senha só **abre** (criar a proteção continua pedindo duas
vezes, com `/notes -lock #tag`).

O que o bot esconde, para a senha não ficar em nada que ele escreve:

| Onde | O que aparece |
|---|---|
| O log (`docker logs`, inclusive o debug) | `executed '/notes -v -lock *** #stash'` |
| O eco de um alias sem `-q` | `🔗 Alias /stash.lock -> /notes -v -lock *** #stash` |
| A tabela de mensagens (histórico, `/show`, backups) | o comando com `***` (e `/stash.lock ***` no alias) |
| As respostas do bot | nunca a repetem; são mensagens diretas, não respostas ao seu comando |

Só funciona no seu próprio privado (em grupo o bot apaga a mensagem e diz onde digitar). **É menos seguro que a
pergunta:** a senha viaja dentro de um comando comum, então a pré-visualização da notificação no celular e os aparelhos
com o WhatsApp Web vinculado podem vê-la no instante antes de ela ser apagada, e um alias guarda no chat a palavra que
você digitou antes disso. No dia a dia prefira a pergunta (`/notes -lock #stash`); use a senha no comando só se você
aceita isso.

### Cenários de privacidade

O que uma tag protegida protege, e o que não protege, nas situações que importam:

| Cenário | O que acontece |
|---|---|
| O banco ou um backup vaza (`cache/zapbot.db`, `cache/backups`, `cache/notes`) | O texto e os arquivos das notas protegidas estão cifrados (AES-256-GCM); só a senha abre. Sem ela, é ruído |
| Você empresta o celular, ou alguém vê o seu WhatsApp Web | Trave a tag antes (`/notes -lock #foo -now`): só aparece `🔒 (nota protegida)`. Ela também trava sozinha após `notes.lockMinutes` sem uso |
| Você compartilha a tela, ou digita num grupo por engano | As notas protegidas só liberam e abrem no **seu próprio privado**; num grupo ou no chat de outra pessoa continuam travadas mesmo com a tag liberada, e anotar e editar são recusados |
| `-to` por engano (mandar uma visualização, uma lista ou um PDF para alguém) | Recusado: as notas protegidas nunca vão para outros chats nem e-mails. Uma lista de todas as notas enviada com `-to` mostra `🔒` onde elas estão |
| Um alerta de uma nota protegida | Diz só que há uma nota na tag, nunca o texto |
| Alguém lê os logs, o `/show` ou o histórico | A senha nunca aparece (`-lock ***`), e os comandos que você digitou para a tag saem da tabela `messages` |
| Alguém com acesso ao bot rodando **enquanto a tag está liberada** | Consegue ler: a chave fica na memória até travar. Trave ao parar de usar (`-now`), ou deixe o `notes.lockMinutes` baixo |
| Você esquece a senha | As notas se perdem. Não há recuperação, de propósito |

O que **não** cobre: as mensagens originais que você respondeu ou enviou (ficam no chat do WhatsApp e, se tinham mídia, em
`cache/media`: o `/show -f` ou o `/cache` removem), os **backups feitos antes** de proteger a tag (guardam o texto em claro:
apague com o `/backup`) e a senha digitada **no comando** (a pré-visualização da notificação no celular pode mostrá-la por
um instante; a pergunta é mais segura).

### Exemplo: uma tag secreta com atalhos

Para uma tag que você usa toda hora (a `#stash` abaixo), três [aliases](alias.md) deixam cada uso em uma palavra. Eles
estão em [`examples/secret-notes.zb`](https://github.com/jpereira/zapbot/blob/main/examples/secret-notes.zb) (carregue
com `/alias -examples secret-notes`), ou crie à mão. O `-desc` de cada um o explica no `/alias`:

```text
/alias -q /stash.add  -desc "Guarda uma nota na tag protegida #stash, cifrada. A tag precisa estar liberada antes (/stash.view); travada, ou fora do seu privado (um grupo, o chat de outra pessoa), ela recusa e o comando fica fora do histórico"  /notes #stash $@
/alias -q /stash.lock -desc "Trava a tag protegida #stash agora: depois só aparece um cadeado. Use antes de emprestar o celular ou compartilhar a tela (ela também trava sozinha após notes.lockMinutes sem uso e quando o bot reinicia)"  /notes -lock #stash -now
/alias -q /stash.view -desc "Libera a tag protegida #stash e mostra as notas: pede a senha no seu privado (ou /stash.view senha, menos seguro: viaja num comando comum, o bot a apaga e a esconde dos logs e do histórico). Nunca abre em grupo nem com -to; trava de novo após notes.lockMinutes sem uso"  /notes -v -lock $1 #stash
```

Uma vez, à mão, proteja a tag (ela pede a senha **nova** duas vezes, não há recuperação):

```text
/notes -lock #stash
```

Depois disso, um dia normal:

```text
/stash.view                          → 🔑 Digite sua senha:      (você digita; o bot apaga a sua mensagem)
                                       🔓 A tag #stash está liberada, vai ser travada em 5m sem interagir.
                                       (e as notas dela, exibidas)
/stash.add o PIN do banco é 1234     → 📝 #7 · #stash · 🔒     (cifrada; a sua mensagem some do histórico)
/stash.lock                          → 🔒 A tag #stash foi travada.   (ou espere 5 minutos sem usar)
/stash.view minhasenha               → o mesmo que /stash.view, com a senha no comando (o $1)
```

O `/stash.add` só funciona com a tag liberada (travada, responde `🔒 A tag #stash está travada`) e no seu próprio
privado. O `/stash.view` pede a senha e, com uma digitada depois, a pega do comando (veja
[Senha no comando](#senha-no-comando)). Ele **não** cria a proteção (um erro de digitação na tag pediria uma
senha do nada): para uma tag que não é protegida ele manda usar `/notes -lock #tag`.

## Alertas

O mesmo esquema do `-alert` do [`/stocks`](stocks.md#alertas-de-preço): lista, `-rm`, `-to` e
uma verificação periódica (a cada minuto). Aqui a condição é uma data/hora, e o aviso é a própria
anotação.

```text
/notes -a #contatos ligar pro João -alert amanhã 9h       → anota e avisa amanhã às 9h
/notes -alert 3 +2h                              → avisa da anotação 3 daqui a 2 horas
/notes -alert 3 sexta 18:30 -to /Família/        → avisa no grupo Família
/notes -alert #casa +2h -to /Família/            → avisa de todas as da #casa, no grupo Família
/notes -a #contas pagar boleto -alert 25/12 10h -to /Jorge Pereira/ -to email
/notes -alert                                    → lista só as anotações com alerta
/notes -alert #casa                              → só as da #casa que têm alerta
/notes -alert -r 3                              → tira o alerta da nº 3 (a anotação fica)
/notes -alert -r #casa                          → tira os alertas da #casa
/notes -alert -r all                            → tira todos os alertas
```

- O `<quando>` é o mesmo do [`/cron`](cron.md): `+2h`, `30m`, `1h30m`, `18h`, `18:30`, `hoje 18h`,
  `amanhã [9h]`, `sexta [18h]`, `25/12 [10h]`, `25/12/2027 10h` (sem hora: 9h). Máximo de 365 dias à
  frente; datas passadas são recusadas.
- O alerta dispara **uma vez** e some; a anotação continua na lista. Para repetir, crie outro
  `-alert <id> <quando>` (ele troca o anterior).
- O `-to` no `-add` só vale junto com o `-alert`; no `-alert` sozinho (a lista) dá erro: os
  destinos só são definidos ao criar o alerta.
- Com `#tag`, o alerta vai em todas as anotações da tag (trocando os que já tinham), e na hora saem
  uma mensagem por anotação. Se a tag não existe, nada é mexido.
- Sem `-to`, o aviso vai para o seu privado. O `-to` aceita os mesmos destinos dos outros alertas
  (veja [Avisar em outro chat ou por e-mail](stocks.md#avisar-em-outro-chat-ou-por-e-mail)).
- Se o bot estava fora do ar na hora, o aviso sai assim que ele voltar.
