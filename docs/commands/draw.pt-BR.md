# `/draw` · admin

Role `admin`: só você e os admins extras. O dono libera a uma pessoa ou grupo com
`/bot +u +cmd /draw` ([Delegando](index.md#delegando-um-comando-admin)). Quem recebe só desenha: o `-model`
(ver e trocar o modelo) é do dono e dos admins. Cada imagem **gasta a sua conta da OpenAI**.

Desenha uma imagem com o ChatGPT (GPT Image da OpenAI, API `v1/images`) e manda no chat, com o pedido na legenda (cortado em 200 caracteres).
Com `-gif`, faz um **GIF animado**. Numa **foto** (a da própria mensagem, na legenda, ou a respondida), o
pedido **edita** a foto ou, no `-gif`, a **anima**. Respondendo uma mensagem, o texto dela entra antes do
pedido. O `/gpt -img` e o `/gpt -gif` são o mesmo código: o resultado é igual.

```text
/draw um gato astronauta em aquarela
/draw um castelo na neve
/draw -g um gato dançando
/draw -m                       → o modelo atual e os que a sua chave vê
/draw -h                       → ajuda do comando
/draw -s um gato astronauta          → a imagem mais o consumo no rodapé
```

Se a **primeira palavra** parece uma opção mas não existe (`/draw -price`), o bot responde
`❌ Opção desconhecida: -price` e sugere o `-h|-help`, sem chamar a OpenAI.

| Opção | Valor | Descrição |
|---|---|---|
| `-quiet`, `-q` | | Não mostra a dica do motor ("💡 ... por ChatGPT, Tesseract, Piper...") no fim da resposta. Para esconder sempre: o setting `draw.footer` em `off` |
| `-gif`, `-g` | | GIF animado (setting `gpt.image.gifModel`). Numa foto, ou respondendo uma, anima a foto. Veja [GIF animado](#gif-animado--gif) |
| `-frames`, `-f` | `<n>` | Quadros do GIF, de 2 a 16 (padrão: `gpt.gif.frames`, 9). Vale como `-gif` |
| `-ms` | `<ms>` | Duração de cada quadro do GIF, de 20 a 2000 ms (padrão: `gpt.gif.frameMs`, 200). Vale como `-gif` |
| `-profile`, `-p` | | Junta a foto de perfil de uma ou mais pessoas às imagens (`-p /Rafael Silva/`, `@menção`, `+número`; sem ninguém: a pessoa do chat). Veja [Com a foto de perfil de alguém](#com-a-foto-de-perfil-de-alguém--profile) |
| `-model`, `-m` | `[modelo]` | Só dono e admins. Sem modelo, lista o atual e os que a sua chave vê; com modelo, troca (`gpt.image.model`; com `-gif`, `gpt.image.gifModel`) |
| `-quality`, `-ql` | `<low\|medium\|high\|auto>` | Só dono e admins. Qualidade da imagem (padrão: `gpt.image.quality`, `auto`). Quanto maior, mais cara; não vale para o GIF. Ver [Qualidade e tamanho](#qualidade-e-tamanho) |
| `-size`, `-sz` | `<auto\|square\|landscape\|portrait\|LxA>` | Só dono e admins. Tamanho da imagem (padrão: `gpt.image.size`, `auto`): `square` é 1024x1024, `landscape` 1536x1024, `portrait` 1024x1536. Quanto maior, mais cara; não vale para o GIF. Ver [Qualidade e tamanho](#qualidade-e-tamanho) |
| `-status`, `-s` | | Acrescenta no rodapé o consumo da chamada: bytes TX/RX, tokens, custo e saldo (imagem e GIF: numa mensagem à parte). Veja [Status](gpt.md#status--status) |
| `<pedido>` | | O que desenhar ou animar. Respondendo uma mensagem, o texto dela entra antes; numa foto, o pedido a edita |

Usa a mesma chave do [`/gpt`](gpt.md): `OPENAI_API_KEY` no `config/.env` ou o setting `gpt.api.key`
(veja [Configurando a chave](gpt.md#configurando-a-chave)). A imagem pode levar mais de um minuto: o
timeout é o `gpt.timeout.ms`, mas nunca menos de 3 minutos (5 no GIF).

## Qualidade e tamanho

Por padrão (`auto`) o bot não manda nenhum dos dois: a OpenAI escolhe a qualidade e o tamanho, e costuma
vir com uma imagem pequena e de qualidade média. Para pedir mais, por chamada ou sempre:

```text
/draw -ql high um gato astronauta em aquarela
/draw -sz landscape uma montanha ao pôr do sol
/draw -ql high -sz portrait um cartaz de um robô
/set gpt.image.quality high
/set gpt.image.size landscape
```

- `-quality`: `low`, `medium`, `high` ou `auto`. `-size`: `auto`, `square` (1024x1024), `landscape`
  (1536x1024), `portrait` (1024x1536) ou um `LxA` que o modelo aceite.
- **Aumenta o custo**: a imagem é cobrada por tokens, e a qualidade pesa mais (o `high` custa várias vezes o
  `medium`); um tamanho maior também custa mais. Compare com o `-s`, que mostra o custo da chamada.
- As duas opções são do **dono e dos admins** (quem recebeu o `/draw` por `+cmd` não consegue aumentar o
  custo); os settings `gpt.image.quality` e `gpt.image.size` valem para todos, e também para o
  `/gpt -img`. O GIF tem o seu tamanho fixo (512x512).

## Editar uma foto

Respondendo uma foto (ou mandando a foto com a legenda `/draw ...`), a OpenAI **edita** essa foto
(`v1/images/edits`) conforme o pedido. Uma figurinha também vale; um GIF ou uma figurinha viram PNG.

```text
(respondendo uma foto)  /draw coloque um chapéu nele
(foto com a legenda)    /draw transforme em desenho a lápis
```

## GIF animado (`-gif`)

É o `output_format: gif` dos modelos `gpt-image-2.6-*`, com `frame_count` quadros de `frame_duration_ms` cada.
Numa foto, o GIF a anima; sem pedido, com um movimento sutil e natural.

```text
/draw -g um gato dançando
→ ⏳ Processando o /draw, aguarde.   (vira: 🎞️ GIF gerado abaixo.)
→ (o GIF, em loop) 🎞️ um gato dançando

/draw -g -f 6 -ms 300 uma bandeira ao vento
(respondendo uma foto)  /draw -gif como se estivesse nadando
```

- Usa o modelo do setting `gpt.image.gifModel` (padrão `gpt-image-2.6-flare`; o
  `gpt-image-2.6-sunburst` é mais detalhado). Só a família 2.6 faz GIF, e ela **pede acesso à prévia**. Sem
  ele, o bot responde `🔒 A sua conta/modelo não faz GIF animado` com a mensagem da OpenAI.
- O GIF sai com **9 quadros de 200 ms** (1,8 s); os settings `gpt.gif.frames` (2 a 16) e
  `gpt.gif.frameMs` (20 a 2000) mudam, e o `-frames` e o `-ms` sobrepõem numa chamada.
- `-frames` e `-ms` fora do intervalo respondem `❌ -frames precisa ser um inteiro de 2 a 16.` (ou o
  `-ms`, de 20 a 2000).
- Cada quadro sai em **512x512**: a OpenAI cobra os pixels de todos os quadros, então mais quadros custam mais.
- A OpenAI devolve um `.gif`; o bot o converte em MP4 sem áudio com o ffmpeg e o manda como GIF
  (`sendVideoAsGif`), que é como o WhatsApp toca um GIF em loop, igual ao [`/giphy`](giphy.md). Se a
  conversão falhar, o `.gif` chega como documento.
- No `/gpt`, "gere um gif animado..." respondendo uma foto também vale, sem o `-gif`: o bot reconhece um
  verbo de criar (gere, crie, faça, anime, ou generate, create, make, animate, transform) junto
  de gif, animação, animado ou vídeo (ou animation, animated, video).

## O aviso de "Processando"

Uma imagem não dá para mandar editando uma mensagem; por isso o aviso "⏳ Processando o /draw,
aguarde." é editado para **🖼️ Imagem gerada abaixo.** (🎞️ no GIF, e 🔊 na voz do `/tts`) e fica no
chat; o resultado vem logo depois. Se falhar, o mesmo aviso vira o erro.

```text
/draw -p @me fulano desenhe nós dois escalando na Patagônia
⏳ Processando o /draw, aguarde.   →   🖼️ Imagem gerada abaixo.
(a imagem, com a legenda 🎨)
```

## Com a foto de perfil de alguém (`-profile`)

O `-profile` (`-p`) junta a **foto de perfil do WhatsApp** de uma ou mais pessoas às imagens enviadas
ao modelo, ao lado da foto que você responde. É o jeito de colocar um amigo num desenho, ou no GIF
de uma foto, sem baixar e mandar a imagem dele.

| Depois do `-p` | Quem é |
|---|---|
| Nome solto: `fulano beltrano` | O primeiro nome (ou o nome inteiro) de um contato da sua agenda, sem ligar para acento e caixa; a primeira palavra que **não** é contato começa o pedido. Se vários têm o mesmo, o bot pergunta qual |
| Nome: `/Rafael Silva/` | O contato pelo nome (como no [`/profile`](profile.md)); se mais de um servir, o bot pergunta qual |
| Menção: `@Rafael` | A pessoa mencionada |
| `@me` ou `$me` | **Você**: a sua própria foto de perfil (quem digitou o comando) |
| `@this` ou `$this` | **O chat em que você está**: num privado, a outra pessoa; num grupo, a **foto do grupo** |
| `@reply` ou `$reply` | **Quem escreveu a mensagem que você responde**, num privado ou num grupo (precisa de uma resposta) |
| Número: `+5521999999999` | Pelo número |
| *(ninguém)*, num privado | A pessoa do chat (no seu próprio chat, você) |
| *(ninguém)*, num grupo | Quem escreveu a mensagem que você responde |

```text
/draw -p /Rafael Silva/ desenhe ele como astronauta na lua
🎨 desenhe ele como astronauta na lua
```

**Uma foto e um perfil.** Responda a uma foto e o perfil vai ao lado dela, nesta ordem: a foto da
mensagem primeiro, depois os perfis:

```text
(respondendo a uma foto de um cachorro)
/draw -g -p /Rafael Silva/ faça um gif desse cachorro aplicando uma injeção no Rafael
🎞️ faça um gif desse cachorro aplicando uma injeção no Rafael
```

**Nomes soltos, vários de uma vez.** Depois do `-p` dá para digitar os nomes como estão na sua agenda,
sem barras, quantos quiser (até 4). As palavras que são o primeiro nome (ou o nome inteiro) de um
contato são pessoas; a primeira que não é começa o pedido. Junto com a foto que você respondeu:

```text
(respondendo a foto de um bolo de aniversário)
/draw -p fulano beltrano ponha os dois apagando as velas neste bolo
🎨 ponha os dois apagando as velas neste bolo
```

O bot manda 3 imagens ao modelo, nesta ordem: a foto do bolo, o perfil do Fulano e o do Beltrano. Se
dois contatos têm o mesmo nome (duas "Maria"), ele pergunta qual; para ser exato, use `/Maria Lucia/`.
Misturar também vale: `-p fulano @Maria +5521999999999 ...`.

**Você mesmo:** `@me` (ou `$me`) é a **sua** foto de perfil, para você também entrar na imagem,
sozinho ou com os amigos:

```text
/draw -p @me desenhe eu como um cavaleiro medieval
/draw -p @me fulano desenhe nós dois como piratas num navio
(no chat com o Bruno)  /draw -p @me @this desenhe nós dois como piratas
(num grupo)  /draw -p @this faça um cartaz com a foto deste grupo
🎨 desenhe nós dois como piratas num navio
```

**O chat em que você está:** o `@this` (ou `$this`) é a outra pessoa num privado e a **foto do grupo**
num grupo. Junto com o `@me`, é o jeito de você e a pessoa com quem fala entrarem na mesma imagem:

```text
(no chat com o Bruno)
/draw -p @me @this desenhe nós dois como astronautas
/draw -g -p @me @this nós dois dançando numa festa

(num grupo)
/draw -p @this faça um cartaz com a foto deste grupo
/draw -p @me @this ponha eu e o grupo numa tirinha
```

**Quem você está respondendo:** `@reply` (ou `$reply`) é quem escreveu a mensagem que você respondeu,
num grupo ou num privado. Bom para pôr alguém do grupo na imagem com você:

```text
(num grupo, respondendo a uma mensagem da Maria)
/draw -p @reply @me desenhe nós dois na praia
/draw @reply transforme ela numa super-heroína        (sem o -p, no começo do pedido)
```

Sem uma resposta, o bot diz `❌ O /draw @reply precisa de uma resposta: responda a uma mensagem da pessoa.`

**Sem o `-p`:** `@me`/`$me` e `@this`/`$this` no **começo do pedido** já valem como `-p`. Depois de
uma opção como `-g` também. Só essas quatro variáveis: uma `@menção` solta continua texto do pedido, e
uma variável no meio da frase é só texto:

```text
/draw @me @this desenhe nós dois como piratas           (igual a /draw -p @me @this ...)
/draw -g $me $this nós dois dançando
/draw desenhe @me de astronauta                         (sem foto: o @me é só texto)
```

**Várias pessoas** (até 4), como um retrato de grupo:

```text
/draw -p /Rafael Silva/ /Maria Lucia/ desenhe os dois numa festa de aniversário
🎨 desenhe os dois numa festa de aniversário
```

**Sem dizer quem:** no privado é a outra pessoa; num grupo, quem escreveu a mensagem que você
responde:

```text
(no privado com o Rafael)
/draw -p desenhe ele como um personagem de desenho animado
🎨 desenhe ele como um personagem de desenho animado

(num grupo, respondendo a uma mensagem da Maria)
/draw -p transforme ela numa super-heroína
🎨 transforme ela numa super-heroína
```

**Por menção ou número:**

```text
/draw -p @Rafael faça dele um pirata
/draw -p +5521999999999 faça um retrato em pop art
```

**O que o modelo recebe.** O bot diz qual imagem é qual, depois do seu pedido (você não vê):

```text
desenhe os dois numa festa de aniversário

Imagens anexadas, nesta ordem: 1) a foto de perfil de Rafael Silva; 2) a foto de perfil de Maria Lucia.
```

**Quando é recusado:**

```text
/draw -p desenhe
❌ No grupo, o /draw -p precisa de alguém: -p /Nome/, -p @menção ou responda a uma mensagem da pessoa.

/draw -p /Rafael Silva/ desenhe ele como astronauta
🙈 Fulano não tem foto de perfil que eu consiga ver (sem foto, ou escondida pela privacidade).
```

- Quem esconde a foto pela privacidade (ou não tem foto) é recusado, e nada vai para a OpenAI.
- Até **4** fotos de perfil por vez. Mais que isso é recusado.
- É uma chamada só, então conta uma vez no [limite de uso](bot.md#limite-de-uso-por-usuário-limit).
- Vale com `-gif`, `-frames` e `-ms`, e com o `/gpt -img` e o `/gpt -gif`.
- Não vale dentro do `/cron`: uma mensagem agendada não tem foto para responder.

## Modelo que a conta não tem

Os modelos de imagem (`gpt.image.model` e `gpt.image.gifModel`) são settings de texto livre, porque os
nomes mudam (o `gpt-image-1` saiu do ar em 23/10/2026, por exemplo). Se a OpenAI responder que o modelo não
existe, o bot lista os que a sua chave vê (parecidos com o recurso) e mostra o `/set` para trocar:

```text
❌ O modelo gpt-image-1 não existe na sua conta da OpenAI (imagem).
💡 A sua chave vê: gpt-image-2.5-flare, gpt-image-2.6-flare
💡 Troque com /set gpt.image.model <modelo>
```

O `/draw -m` mostra o modelo da imagem e o do GIF, e troca o de cada um (`/draw -gif -m <modelo>`).
O modelo que a sua chave não vê não é gravado.
