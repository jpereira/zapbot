# `/sticker` (`/st`)

O `/sticker` é o [`/get -sticker`](get.md): aceita uma URL, ou o reply numa mensagem com link, num
vídeo/GIF ou numa imagem, e devolve a figurinha. Nome e autor da figurinha vêm dos settings
`sticker.name` e `sticker.author`.

- **URL ou link respondido**: baixa o vídeo com o yt-dlp e faz a figurinha animada. Se o link não
  tiver vídeo (uma matéria, um post de foto), usa a miniatura da prévia do link.
- **Vídeo ou GIF respondido**: figurinha animada pelo ffmpeg.
- **Imagem respondida**: um quadrado 512x512 **enquadrado no meio da imagem**: numa foto deitada as
  laterais são cortadas, numa em pé o topo e a base. GIFs (imagem) mantêm a animação. Figurinhas
  (WebP) vão como estão.

O vídeo vira um quadrado 512x512 enquadrado no meio, com no máximo seis segundos: sem `-es`, os seis
segundos a partir do `-ss` (ou do início). Enquanto baixa e converte, o bot mostra
"⏳ Processando seu sticker, aguarde.", que vira "✅ Sticker criado com sucesso!" (ou o erro).

```text
(reply numa foto)                /sticker
(reply num link)                 /st
(reply num vídeo)                /sticker -ss 12            → de 0:12 a 0:18
(reply num link)                 /sticker -ss 10 -es 13     → de 0:10 a 0:13
/sticker https://www.instagram.com/p/XXXXXXXX/
```

| Opção | Valor | Descrição |
|---|---|---|
| `-txt` | `<texto>` | Figurinha animada com o texto, sem precisar responder nada. Veja [Figurinha de texto](#figurinha-de-texto) |
| `-bg` | `<cor>` | Com `-txt`: a cor de fundo, em `#RRGGBB` (padrão `#FFFFFF`, branco) |
| `-fg` | `<cor>` | Com `-txt`: a cor da letra, em `#RRGGBB` (padrão `#000000`, preto) |
| `-startSec`, `-ss` | `<segundo>` | Vídeo: começa neste segundo (padrão 0) e pega os 6 s seguintes. Aceita decimal com ponto, como `1.5` |
| `-endSec`, `-es` | `<segundo>` | Vídeo: termina neste segundo, maior que o início; no máximo 6 s depois do `-ss` |
| `-verbose`, `-v` | | Mostra os parâmetros usados no yt-dlp/ffmpeg |
| `[url]` | | Link do vídeo; vale mais que a mensagem respondida |

Os limites e a proteção contra URLs da rede interna são os do [`/get`](get.md). A miniatura da
prévia, quando vem de outro endereço, passa pela mesma proteção.

## Figurinha de texto

O `-txt` cria uma figurinha animada com o texto, que **pisca** trocando as cores a cada meio
segundo: letra `-fg` no fundo `-bg`, depois o contrário. O texto quebra em linhas sozinho, e a letra
fica do maior tamanho que cabe.

```text
/sticker -txt "Bom dia!"                                → letra preta no fundo branco
/sticker -txt "Partiu praia?" -bg "#2980B9" -fg "#FFFFFF"
/st -txt Feliz aniversário, vó! -bg #C0392B -fg #fff
```

- O texto vai com ou sem aspas (até 200 caracteres); as cores, em `#RRGGBB` ou `#RGB`, com ou sem o
  `#`. A mesma cor no `-bg` e no `-fg` dá erro: o texto não apareceria.
- Tudo depois do `-txt` é texto. Antes dele, `-ss`, `-es`, `-v` ou uma URL dão erro: são do vídeo, e
  o `-txt` faz a figurinha só do texto (e ignora a mensagem respondida).
- Como é feita: o bot desenha os dois quadros em PNG (512x512) e o `ffmpeg` junta num WebP animado,
  que o WhatsApp aceita como figurinha sem conversão. Nome e autor vêm dos mesmos settings
  `sticker.name` e `sticker.author`.
