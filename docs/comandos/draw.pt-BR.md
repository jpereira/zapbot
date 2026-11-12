# `/draw` (`/desenhe`, `/desenha`, `/img`) · admin

Role `admin`: só você e os admins extras. O dono libera a uma pessoa ou grupo com
`/bot +u +cmd /draw` ([Delegando](index.md#delegando-um-comando-admin)). Quem recebe só desenha: o `-model`
(ver e trocar o modelo) é do dono e dos admins. Cada imagem **gasta a sua conta da OpenAI**.

Desenha uma imagem com o GPT Image da OpenAI (API `v1/images`) e manda no chat, com o pedido na legenda (cortado em 200 caracteres).
Com `-gif`, faz um **GIF animado**. Numa **foto** (a da própria mensagem, na legenda, ou a respondida), o
pedido **edita** a foto ou, no `-gif`, a **anima**. Respondendo uma mensagem, o texto dela entra antes do
pedido. O `/gpt -img` e o `/gpt -gif` são o mesmo código: o resultado é igual.

```text
/draw um gato astronauta em aquarela
/desenha um castelo na neve
/img -gif um gato dançando
/draw -m                       → o modelo atual e os que a sua chave vê
/draw -h                       → ajuda do comando
```

Se a **primeira palavra** parece uma opção mas não existe (`/draw -price`), o bot responde
`❌ Opção desconhecida: -price` e sugere o `-h|-help`, sem chamar a OpenAI.

| Opção | Valor | Descrição |
|---|---|---|
| `-gif`, `-g` | | GIF animado (setting `openai.image.gifModel`). Numa foto, ou respondendo uma, anima a foto. Veja [GIF animado](#gif-animado--gif) |
| `-frames`, `-f` | `<n>` | Quadros do GIF, de 2 a 16 (padrão: `openai.gif.frames`, 9). Vale como `-gif` |
| `-ms` | `<ms>` | Duração de cada quadro do GIF, de 20 a 2000 ms (padrão: `openai.gif.frameMs`, 200). Vale como `-gif` |
| `-model`, `-m` | `[modelo]` | Só dono e admins. Sem modelo, lista o atual e os que a sua chave vê; com modelo, troca (`openai.image.model`; com `-gif`, `openai.image.gifModel`) |
| `-status`, `-s` | | Acrescenta no rodapé o consumo da chamada: bytes TX/RX, tokens, custo e saldo (imagem e GIF: numa mensagem à parte). Veja [Status](gpt.md#status--status) |
| `<pedido>` | | O que desenhar ou animar. Respondendo uma mensagem, o texto dela entra antes; numa foto, o pedido a edita |

Usa a mesma chave do [`/gpt`](gpt.md): `OPENAI_API_KEY` no `config/.env` ou o setting `openai.api.key`
(veja [Configurando a chave](gpt.md#configurando-a-chave)). A imagem pode levar mais de um minuto: o
timeout é o `openai.timeout.ms`, mas nunca menos de 3 minutos (5 no GIF).

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
/img -gif um gato dançando
→ ⏳ Processando o /draw, aguarde.
→ (o GIF, em loop) 🎞️ um gato dançando

/img -gif -f 6 -ms 300 uma bandeira ao vento
(respondendo uma foto)  /draw -gif como se estivesse nadando
```

- Usa o modelo do setting `openai.image.gifModel` (padrão `gpt-image-2.6-flare`; o
  `gpt-image-2.6-sunburst` é mais detalhado). Só a família 2.6 faz GIF, e ela **pede acesso à prévia**. Sem
  ele, o bot responde `🔒 A sua conta/modelo não faz GIF animado` com a mensagem da OpenAI.
- O GIF sai com **9 quadros de 200 ms** (1,8 s); os settings `openai.gif.frames` (2 a 16) e
  `openai.gif.frameMs` (20 a 2000) mudam, e o `-frames` e o `-ms` sobrepõem numa chamada.
- `-frames` e `-ms` fora do intervalo respondem `❌ -frames precisa ser um inteiro de 2 a 16.` (ou o
  `-ms`, de 20 a 2000).
- Cada quadro sai em **512x512**: a OpenAI cobra os pixels de todos os quadros, então mais quadros custam mais.
- A OpenAI devolve um `.gif`; o bot o converte em MP4 sem áudio com o ffmpeg e o manda como GIF
  (`sendVideoAsGif`), que é como o WhatsApp toca um GIF em loop, igual ao [`/giphy`](giphy.md). Se a
  conversão falhar, o `.gif` chega como documento.
- No `/gpt`, "gere um gif animado..." respondendo uma foto também vale, sem o `-gif`: o bot reconhece um
  verbo de criar (gere, crie, faça, anime, ou generate, create, make, animate, transform) junto
  de gif, animação, animado ou vídeo (ou animation, animated, video).

## Modelo que a conta não tem

Os modelos de imagem (`openai.image.model` e `openai.image.gifModel`) são settings de texto livre, porque os
nomes mudam (o `gpt-image-1` saiu do ar em 23/10/2026, por exemplo). Se a OpenAI responder que o modelo não
existe, o bot lista os que a sua chave vê (parecidos com o recurso) e mostra o `/set` para trocar:

```text
❌ O modelo gpt-image-1 não existe na sua conta da OpenAI (imagem).
💡 A sua chave vê: gpt-image-2.5-flare, gpt-image-2.6-flare
💡 Troque com /set openai.image.model <modelo>
```

O `/draw -m` mostra o modelo da imagem e o do GIF, e troca o de cada um (`/draw -gif -m <modelo>`).
O modelo que a sua chave não vê não é gravado.
