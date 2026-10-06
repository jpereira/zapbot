# `/sticker` (`/st`)

Responda (reply) a uma imagem, vídeo/GIF ou mensagem com link com `/sticker`. Com link, o bot usa a
miniatura do preview. Nome e autor da figurinha vêm dos settings `sticker.name` e `sticker.author`.

Imagens (inclusive a miniatura do link) viram um quadrado 512x512 **enquadrado no meio da imagem**:
numa foto deitada as laterais são cortadas, numa em pé o topo e a base. GIFs mantêm a animação.
Figurinhas (WebP) vão como estão, e vídeos respondidos com `/sticker` seguem a conversão padrão
(redimensionados sem corte). Já o `/get -sticker` enquadra o vídeo no meio, do mesmo jeito.

```text
(reply numa foto)  /sticker
(reply num link)   /st
```

| Opção | Valor | Descrição |
|---|---|---|
| `-txt` | `<texto>` | Figurinha animada com o texto, sem precisar responder nada. Veja [Figurinha de texto](#figurinha-de-texto) |
| `-bg` | `<cor>` | Com `-txt`: a cor de fundo, em `#RRGGBB` (padrão `#FFFFFF`, branco) |
| `-fg` | `<cor>` | Com `-txt`: a cor da letra, em `#RRGGBB` (padrão `#000000`, preto) |

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
- Como é feita: o bot desenha os dois quadros em PNG (512x512) e o `ffmpeg` junta num WebP animado,
  que o WhatsApp aceita como figurinha sem conversão. Nome e autor vêm dos mesmos settings
  `sticker.name` e `sticker.author`.
