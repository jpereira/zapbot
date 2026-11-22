# `/tts` · user

Role `admin`: só você e os admins extras. O dono libera a uma pessoa ou grupo com
`/bot +u +cmd /tts` ([Delegando](index.md#delegando-um-comando-admin)).

Transforma texto numa **nota de voz** de robô pelo ChatGPT (a API de voz da OpenAI), como o
[`/gpt -voice`](gpt.md#voz--voice). Usa a chave da OpenAI (`OPENAI_API_KEY` no `config/.env` ou o setting
`gpt.api.key`). O modelo, a voz e o estilo vêm dos settings `gpt.tts.*`.

```text
/tts [-gpt|-g] [-local|-l] [-voice|-v <nome>] [-speed|-sp <%>] [-pitch|-pi <semitons>] [-volume|-vol <%>] [-pause|-pa <ms>] [-beat|-b <bpm>] [-beatvol|-bv <%>] [-quiet|-q] [-status|-s] [<texto>]
```

| Opção | Valor | Descrição |
|---|---|---|
| `-quiet`, `-q` | | Não mostra a dica do motor ("💡 ... por ChatGPT, Tesseract, Piper...") no fim da resposta. Para esconder sempre: o setting `tts.footer` em `off` |
| *(nenhuma)* | `[<texto>]` | O que falar, até `tts.maxChars` caracteres (32000; a voz local fala tudo, o ChatGPT em partes de 4096 que viram um áudio só). O texto digitado vale mais: respondendo uma mensagem com texto digitado, a resposta é ignorada; sem texto, fala a mensagem respondida |
| `-gpt`, `-g` | | Fala pelo ChatGPT (API de voz da OpenAI, gasta a sua conta) em vez da voz local do Piper. Sem `-gpt` nem `-local`, vale o setting [`tts.engine`](../settings.md) |
| `-local`, `-l` | | Fala com a voz local do Piper (sem chave, usa a CPU do servidor), mesmo com o `tts.engine` em `gpt` |
| `-voice`, `-v` | `<nome>` | A voz, pelo nome da pessoa. Local (Piper): português (Brasil): cadu, edresson, faber, jeff; português (Portugal): tugão; inglês (EUA): amy (low/medium), arctic, bryce, danny, hfc_female, hfc_male, hifi_tts_92, joe, john, kathleen (low/medium), kristin, kusal, l2arctic, lessac (low/medium/high), libritts, libritts_r, ljspeech (medium/high), mike, norman, reza_ibrahim, ryan (low/medium/high), sam; inglês (Reino Unido): alan (low/medium), alba, aru, cori (medium/high), jenny_dioco, northern_english_male, semaine, southern_english_female, vctk. Escreva só o nome (`faber`), o nome com a qualidade (`faber-medium`) ou o id completo (`pt_BR-faber-medium`); com várias qualidades, só o nome é a medium. O padrão é o `tts.voice.pt` ou o `tts.voice.en`, pelo idioma do texto; a que não está na imagem é baixada na primeira vez. Com `-gpt`: `alloy`, `ash`, `ballad`, `coral`, `echo`, `fable`, `nova`, `onyx`, `sage`, `shimmer`, `verse` (o padrão é o `gpt.tts.voice`). O `/tts -v` lista as vozes do Piper e o `/tts -g -v` as do ChatGPT. |
| `-speed`, `-sp` | `<percentual>` | A velocidade da voz, em % de 50 a 200 (`100` normal, `150` mais rápido, `75` mais devagar). O padrão é o setting `tts.speed` (`50`) na voz local e o `gpt.tts.speed` (`100`) com `-gpt` |
| `-pitch`, `-pi` | `<semitons>` | O tom da voz, em semitons de -12 a 12 (`0` normal, `3` mais agudo, `-3` mais grave). O padrão é o setting `tts.pitch` |
| `-volume`, `-vol` | `<percentual>` | O volume da voz, em % de 20 a 300 (`100` normal, `200` o dobro). O padrão é o setting `tts.volume` |
| `-pause`, `-pa` | `<ms>` | Com várias linhas: o silêncio depois da linha, em ms de 0 a 3000 (padrão: `tts.pause`, 300). Uma linha em branco dobra. Na primeira linha, vale para todas |
| `-beat`, `-b` | `<bpm>` | Uma batida de hip-hop por baixo da voz, de 60 a 180 bpm (`90` é um clássico). Ver [Várias linhas e uma batida](#várias-linhas-e-uma-batida) |
| `-beatvol`, `-bv` | `<percentual>` | O volume do `-beat`, em % de 5 a 100 (padrão: `35`) |
| `-status`, `-s` | | Acrescenta o consumo da chamada numa mensagem à parte: bytes enviados (TX) e recebidos (RX), tokens gastos, custo estimado e saldo. Para deixar sempre ligado: `/set gpt.status true` |

```text
/tts Bom dia!                     → uma nota de voz falando isso
/tts                              → respondendo um texto: fala a mensagem
/tts Isso é um teste!             → respondendo um texto: fala o que foi digitado, a resposta é ignorada
/tts -s olá, tudo bem?         → a nota de voz mais o consumo no rodapé
/tts -speed 130 -pitch 3 Oi!   → mais rápida e mais aguda
/tts -voice cadu Oi!           → outra voz local (cadu, cadu-medium ou pt_BR-cadu-medium)
/tts -voice jeff Olá!         → outra voz do Brasil
/tts -gpt -voice nova Oi!      → a voz nova do ChatGPT
/tts -v                       → lista as vozes do Piper
/tts -g -v                    → lista as vozes do ChatGPT
```

- Respondendo um **áudio**, ele é transcrito antes e a transcrição é falada.

## Várias linhas e uma batida

Um `/tts` com várias linhas faz **uma** nota de voz (e não uma por linha). A **primeira linha tem só as
opções**: elas são o padrão de todas as linhas. Cada linha de baixo é uma fala, e pode começar com as suas
próprias opções, que só valem para ela:

```text
/tts -local -voice tugão -speed 50 -pause 300 -beat 90
Yeah... Yeah... Chegou a Paçoquita!
-pitch 2 Direto da quebrada!
-speed 80 É a braba! É a bonita!

Respeita o amendoim!
```

- Uma linha **só com opções** (`-speed 80`) muda o padrão das próximas linhas. Uma **linha em branco** dobra
  a pausa (separa as estrofes).
- É um texto com linhas quando a primeira linha não tem texto ou alguma linha começa com uma opção. Um texto
  comum de várias linhas continua sendo uma fala só.
- Só com a voz local (o `-gpt` seria uma chamada paga por linha). Até 60 linhas; o `tts.maxChars` conta a
  soma. Os `{/comando}`s funcionam em cada linha.
- A pausa entre as linhas é o `-pause` (ms; padrão: o setting `tts.pause`).
- **`-beat <bpm>`** coloca uma batida de hip-hop (bumbo, caixa, chimbal e baixo, **feita pelo ffmpeg**: sem
  arquivo de áudio) por baixo da voz. Ela começa um compasso antes da voz e termina um depois; o `-beatvol` é
  o volume dela. Também vale num `/tts` de uma linha.
- Um pronto: [`examples/tts-hip-hop.zb`](https://github.com/jpereira/zapbot/blob/main/examples/tts-hip-hop.zb)
  (`/alias -yes -examples tts-hip-hop` cria o `/tts.hiphop`). Outro:
  [`examples/tts-lourival.zb`](https://github.com/jpereira/zapbot/blob/main/examples/tts-lourival.zb) (`/tts.lourival`,
  um rap do Lourival).

## Exemplo: um hip-hop

A música inteira do [`examples/tts-hip-hop.zb`](https://github.com/jpereira/zapbot/blob/main/examples/tts-hip-hop.zb),
numa mensagem só: uma batida de 95 bpm por baixo de uma voz que muda em cada parte (as linhas só com opções
mudam o tom, a velocidade, o volume e a pausa das linhas seguintes):

```text
/tts -l -v tugão -sp 55 -pi 0 -vol 100 -pa 250 -b 95 -bv 35
-pi -3 -sp 50 -pa 450
Yeah, yeah, ahn!
Direto da quebrada, chegando na fita...
Não é ouro, não é prata...
É PA-ÇO-QUI-TA!

-pi 0 -sp 75 -pa 150
Cheguei no mercado, já senti o clima,
Vi uma Paçoquita, minha autoestima anima!
Pequena no tamanho, gigante no sabor,
Amendoim na veia, é paixão, é amor!

Não quero diamante, nem relógio de grife,
Só quero Paçoquita pra melhorar meu pique!
Abri a embalagem, começou a emoção,
Deu uma esfarelada, caiu tudo no chão!

-pi -2 -sp 55 -vol 130 -pa 250
PA-PA-PA-PAÇOQUITA!
É A BRABA, É A BONITA!
PA-PA-PA-PAÇOQUITA!
DEU MOLE, A GENTE FRITA!

-sp 65 -pa 150
É doce, é gostosa, é pura tentação,
É o poder do amendoim dominando o mundão!

-pi 1 -sp 85 -vol 100 -pa 120
No bolso tem trocado, na mente um milhão,
Investimento certo é paçoca na mão!
Bitcoin sobe e desce, o mercado oscila,
Mas minha Paçoquita sempre me tranquiliza!

O DJ solta o beat, o grave faz tremer,
Abri outra paçoca, não consigo me conter!
Pode faltar dinheiro, pode faltar gasolina,
Mas não mexe na paçoca que a parada desafina!

-pi -2 -sp 55 -vol 130 -pa 250
PA-PA-PA-PAÇOQUITA!
É A BRABA, É A BONITA!
PA-PA-PA-PAÇOQUITA!
AMENDOIM QUE DOMINA!

-pi -3 -sp 50 -vol 100 -pa 600
Yeah... ahn...
Respeita o amendoim, meu parceiro...
Paçoquita no comando...
O resto é farelo!
```

- A primeira linha é o padrão: voz local (`tugão`), a batida e o volume dela. As partes são as linhas só com
  opções (voz grave na intro, flow acelerado nos versos, grave pesado no refrão e a velocidade caindo no
  outro). A letra é em português de propósito.
- A batida é a mesma no áudio todo: só a voz muda por parte.
- Para falar **qualquer texto** sobre a batida, o mesmo arquivo tem o `/tuga.rap`: responda um texto com ele (a
  voz é grave e lenta, e o que você digita depois dele vale mais: `/tuga.rap -b 110 -sp 80`).
- Para virar um atalho (`/tts.hiphop`, com as linhas como estão), carregue o exemplo:
  `/alias -yes -examples tts-hip-hop`. O que você digita depois do atalho vai na primeira linha, então
  `/tts.hiphop -b 110 -bv 55` muda a batida.

## Quem pode usar

O `/tts` é um comando de **usuário**: quem está em `+u` usa a voz local (Piper), que é grátis. Com o ChatGPT (`-gpt`, ou
o setting `tts.engine` em `gpt`) gasta a chave da OpenAI, então o usuário precisa de um
[limite de uso](bot.md#limite-de-uso-por-usuário-limit) para isso; sem ele o bot recusa e sugere a voz local. Só as
chamadas do ChatGPT contam no limite. Admins e o dono usam o ChatGPT sem limite.

```text
/bot +cmd /tts +limit 20/dia /Sofia Izabel/    → a Sofia usa o ChatGPT até 20 vezes por dia (a local é grátis)
```

## Comandos no texto

Os `{/comando args}` do texto rodam antes da fala, como no [`/me`](me.md) e no
[`/cron`](cron.md#comandos-no-texto), e a resposta entra no lugar deles. A **barra é opcional** para os
comandos que existem: `{/stocks USD}` e `{stocks USD}` são o mesmo, e `{nome}` (que não é comando) fica como texto.
Só rodam os comandos de consulta (`/crypto`, `/stocks`, `/weather`, `/uptime`, `/version`, `/news`, `/joke`...), as
opções que mudam alguma coisa são recusadas, e você precisa poder rodar cada um. A resposta é **limpa para ser
falada**: sem emoji, markdown, links nem separadores, e cada linha vira uma frase. O que você digitou é falado
como está. Um `\{` deixa a chave literal. As opções dentro das chaves são do comando, não do `/tts`.

```text
/tts O dólar agora está {/stocks USD}
/tts Bom dia! Hoje no Recife: {weather Recife}
/alias /preco /tts Bitcoin: {/crypto BTC}         → o /preco fala a cotação
```

Os comandos de consulta também têm um atalho: `-tts` (`/crypto -tts BTC`, `/stocks -tts USD`, `/weather -tts`,
`/joke -tts`, `/uptime -tts`, `/version -tts`) é o mesmo que `/tts -q {/crypto -q BTC}`, com a voz padrão e só o áudio (sem rodapé).

## Testando as vozes

Para ouvir uma frase em várias vozes, salve um [atalho](alias.md) com um [`/batch`](batch.md). O `$@` é o texto
inteiro digitado depois do atalho, e o `-q` faz cada `/tts` mandar só o áudio:

```text
/alias /vfazol /batch -q
  /tts -q -l -v cadu $@
  /tts -q -l -v edresson $@
  /tts -q -l -v faber $@

/vfazol FAZ O L!
```
