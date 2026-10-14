# `/get` (`/download`)

Baixa vídeos de Instagram, YouTube, X/Twitter, TikTok e outros sites suportados pelo
[yt-dlp](https://github.com/yt-dlp/yt-dlp). A URL pode vir como argumento ou você pode dar reply
numa mensagem que contenha o link. A URL digitada vale mais que a mensagem respondida.

Dando reply num vídeo, numa imagem ou num áudio do WhatsApp, o `/get` usa a própria mídia, sem o
yt-dlp: sem opção, devolve o arquivo original como documento; com `-a`, `-st`, `-ss` ou `-es`, passa
pelo ffmpeg. Se a mídia tiver um link na legenda, vale a mídia.

| Opção | Valor | Descrição |
|---|---|---|
| `-sticker`, `-st` | | Envia como figurinha animada (até 6 s), enquadrada no meio do vídeo. É o mesmo que o [`/sticker`](sticker.md) |
| `-audio`, `-a` | | Extrai só o áudio (`.mp3`) |
| `-startSec`, `-ss` | `<tempo>` | Começa neste ponto do vídeo original (padrão 0), em segundos (`22`, `1.5`) ou em `min:seg` (`09:33`, ou `h:min:seg`) |
| `-endSec`, `-es` | `<tempo>` | Termina neste ponto do vídeo original, no mesmo formato do `-ss`; deve ser maior que o início. Vale também sem `-ss` e para figurinhas |
| `-verbose`, `-v` | | Mostra os parâmetros usados no yt-dlp/ffmpeg |
| `<url>` | | Link do vídeo; vale mais que a mensagem respondida |

O arquivo convertido é limitado a 20 MB (setting `get.maxSizeMB`). O arquivo original de uma mídia
respondida vai como veio do WhatsApp; sem nome (uma foto da câmera, por exemplo), ganha um como
`zapbot.jpeg`.

Escolha áudio ou figurinha por execução. Figurinhas têm no máximo seis segundos: sem `-es`, pegam os
seis segundos a partir do `-ss` (ou do início), e um trecho menor definido por `-ss` e `-es` mantém a
duração pedida. O vídeo e o áudio são enviados como documento.

Na mídia respondida:

- Imagem: `-st` faz a figurinha enquadrada no meio, como o `/sticker`; `-ss`, `-es` e `-a` são
  recusados.
- Áudio: com `-ss` ou `-es`, o trecho sai em `.mp3`; figurinha é recusada.
- Outros arquivos (PDF, documentos) são recusados.

Limites (o `/get` não é admin: quem estiver no `bot.users` usa; com ele em `true`, qualquer um):

- Download de no máximo 200 MB antes da conversão (setting `get.maxDownloadMB`).
- Link de playlist baixa só o vídeo do link (`--no-playlist`).
- yt-dlp e ffmpeg são interrompidos após 5 minutos cada.
- Opção desconhecida é recusada (`❌ Opção desconhecida: -x`), em vez de virar a URL.
- No máximo 2 `/get` (ou `/sticker`) com yt-dlp ou ffmpeg ao mesmo tempo. Os demais recebem um aviso
  para tentar de novo.

Enquanto baixa e converte, o bot mostra "⏳ Processando…". No fim, essa mesma mensagem vira
"✅ Mídia baixada com sucesso!" (ou "✅ Sticker criado com sucesso!"), ou o erro, sem uma mensagem a
mais.

URLs que apontam para a rede interna (`localhost`, `10.x`, `192.168.x`, `169.254.x`, IPv6 local
etc.) são recusadas, para que o `/get` não sirva de ponte para a sua rede (SSRF). A checagem é feita
no host informado; redirects feitos depois pelo yt-dlp não são verificados.

```text
/get https://www.instagram.com/reel/XXXXXXXX/
/get -a https://youtu.be/XXXXXXXXXXX
/get -ss 10 -es 25 https://x.com/usuario/status/123456
/get -es 15 https://youtu.be/XXXXXXXXXXX
/get -ss 09:33 -es 09:45 https://youtu.be/XXXXXXXXXXX
/download -st -ss 3 -es 6 https://youtu.be/XXXXXXXXXXX
(reply numa mensagem com link)  /get -a
(reply num vídeo do WhatsApp)   /get -a              → só o áudio, em .mp3
(reply num vídeo do WhatsApp)   /get -ss 5 -es 20    → o trecho, como documento
```
