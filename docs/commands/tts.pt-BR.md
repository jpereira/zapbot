# `/tts` · admin

Role `admin`: só você e os admins extras. O dono libera a uma pessoa ou grupo com
`/bot +u +cmd /tts` ([Delegando](index.md#delegando-um-comando-admin)).

Transforma texto numa **nota de voz** de robô pelo ChatGPT (a API de voz da OpenAI), como o
[`/gpt -voice`](gpt.md#voz--voice). Usa a chave da OpenAI (`OPENAI_API_KEY` no `config/.env` ou o setting
`gpt.api.key`). O modelo, a voz e o estilo vêm dos settings `gpt.tts.*`.

```text
/tts [-gpt|-g] [-local|-l] [-voice|-v <nome>] [-speed|-sp <%>] [-pitch|-pi <semitons>] [-volume|-vol <%>] [-quiet|-q] [-status|-s] [<texto>]
```

| Opção | Valor | Descrição |
|---|---|---|
| `-quiet`, `-q` | | Não mostra a dica do motor ("💡 ... por ChatGPT, Tesseract, Piper...") no fim da resposta. Para esconder sempre: o setting `tts.footer` em `off` |
| *(nenhuma)* | `[<texto>]` | O que falar, até `tts.maxChars` caracteres (32000; a voz local fala tudo, o ChatGPT em partes de 4096 que viram um áudio só). Respondendo uma mensagem, o estilo da fala |
| `-gpt`, `-g` | | Fala pelo ChatGPT (API de voz da OpenAI, gasta a sua conta) em vez da voz local do Piper. Sem `-gpt` nem `-local`, vale o setting [`tts.engine`](../settings.md) |
| `-local`, `-l` | | Fala com a voz local do Piper (sem chave, usa a CPU do servidor), mesmo com o `tts.engine` em `gpt` |
| `-voice`, `-v` | `<nome>` | A voz, pelo nome da pessoa. Local (Piper): português (Brasil): cadu, edresson, faber, jeff; português (Portugal): tugão; inglês (EUA): amy (low/medium), arctic, bryce, danny, hfc_female, hfc_male, hifi_tts_92, joe, john, kathleen (low/medium), kristin, kusal, l2arctic, lessac (low/medium/high), libritts, libritts_r, ljspeech (medium/high), mike, norman, reza_ibrahim, ryan (low/medium/high), sam; inglês (Reino Unido): alan (low/medium), alba, aru, cori (medium/high), jenny_dioco, northern_english_male, semaine, southern_english_female, vctk. Escreva só o nome (`faber`), o nome com a qualidade (`faber-medium`) ou o id completo (`pt_BR-faber-medium`); com várias qualidades, só o nome é a medium. O padrão é o `tts.voice.pt` ou o `tts.voice.en`, pelo idioma do texto; a que não está na imagem é baixada na primeira vez. Com `-gpt`: `alloy`, `ash`, `ballad`, `coral`, `echo`, `fable`, `nova`, `onyx`, `sage`, `shimmer`, `verse` (o padrão é o `gpt.tts.voice`). O `/tts -v` lista as vozes do Piper e o `/tts -g -v` as do ChatGPT. |
| `-speed`, `-sp` | `<percentual>` | A velocidade da voz, em % de 50 a 200 (`100` normal, `150` mais rápido, `75` mais devagar). O padrão é o setting `tts.speed` (`50`) na voz local e o `gpt.tts.speed` (`100`) com `-gpt` |
| `-pitch`, `-pi` | `<semitons>` | O tom da voz, em semitons de -12 a 12 (`0` normal, `3` mais agudo, `-3` mais grave). O padrão é o setting `tts.pitch` |
| `-volume`, `-vol` | `<percentual>` | O volume da voz, em % de 20 a 300 (`100` normal, `200` o dobro). O padrão é o setting `tts.volume` |
| `-status`, `-s` | | Acrescenta o consumo da chamada numa mensagem à parte: bytes enviados (TX) e recebidos (RX), tokens gastos, custo estimado e saldo. Para deixar sempre ligado: `/set gpt.status true` |

```text
/tts Bom dia!                     → uma nota de voz falando isso
/tts                              → respondendo um texto: fala a mensagem
/tts fale devagar                 → respondendo um texto: fala no estilo pedido
/tts -s olá, tudo bem?         → a nota de voz mais o consumo no rodapé
/tts -speed 130 -pitch 3 Oi!   → mais rápida e mais aguda
/tts -voice cadu Oi!           → outra voz local (cadu, cadu-medium ou pt_BR-cadu-medium)
/tts -voice jeff Olá!         → outra voz do Brasil
/tts -gpt -voice nova Oi!      → a voz nova do ChatGPT
/tts -v                       → lista as vozes do Piper
/tts -g -v                    → lista as vozes do ChatGPT
```

- Respondendo um **áudio**, ele é transcrito antes e a transcrição é falada.

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
