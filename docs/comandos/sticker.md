# `/sticker` (`/st`)

Responda (reply) a uma imagem, vídeo/GIF ou mensagem com link com `/sticker`.
Com link, o bot usa a miniatura do preview. Nome e autor da figurinha vêm dos
settings `sticker.name` e `sticker.author`.

Imagens (inclusive a miniatura do link) viram um quadrado 512x512 **enquadrado
no meio da imagem**: numa foto deitada as laterais são cortadas, numa em pé o
topo e a base. GIFs mantêm a animação. Figurinhas (WebP) vão como estão, e
vídeos respondidos com `/sticker` seguem a conversão padrão (redimensionados
sem corte). Já o `/get -sticker` enquadra o vídeo no meio, do mesmo jeito.

```
(reply numa foto)  /sticker
(reply num link)   /st
```
