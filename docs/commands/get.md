# `/get` (`/download`)

Baixa vídeos de Instagram, YouTube, X/Twitter, TikTok e outros sites
suportados pelo [yt-dlp](https://github.com/yt-dlp/yt-dlp). A URL pode vir como
argumento ou você pode dar reply numa mensagem que contenha o link.

| Opção | Valor | Descrição |
|---|---|---|
| `-sticker`, `-st` | | Envia como figurinha animada (até 6 s), enquadrada no meio do vídeo como no `/sticker` |
| `-audio`, `-a` | | Extrai só o áudio (`.mp3`) |
| `-startSec`, `-ss` | `<segundo>` | Começa a partir deste segundo |
| `-endSec`, `-es` | `<segundo>` | Corta neste segundo |
| `-verbose`, `-v` | | Mostra os parâmetros usados no yt-dlp/ffmpeg |
| `<url>` | | Link do vídeo |

O arquivo final é limitado a 20 MB (setting `get.maxSizeMB`).

Limites (o `/get` não é admin: com o modo admin desligado, qualquer um usa):

- Download de no máximo 200 MB antes da conversão (setting `get.maxDownloadMB`).
- Link de playlist baixa só o vídeo do link (`--no-playlist`).
- yt-dlp e ffmpeg são interrompidos após 5 minutos cada.
- No máximo 2 `/get` ao mesmo tempo. Os demais recebem um aviso para tentar de novo.

URLs que apontam para a rede interna (`localhost`, `10.x`, `192.168.x`,
`169.254.x`, IPv6 local etc.) são recusadas, para que o `/get` não sirva de
ponte para a sua rede (SSRF). A checagem é feita no host informado; redirects
feitos depois pelo yt-dlp não são verificados.

```
/get https://www.instagram.com/reel/XXXXXXXX/
/get -a https://youtu.be/XXXXXXXXXXX
/get -ss 10 -es 25 https://x.com/usuario/status/123456
/download -st -ss 3 -es 6 https://youtu.be/XXXXXXXXXXX
(reply numa mensagem com link)  /get -a
```
