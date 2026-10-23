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
| `-startSec`, `-ss` | `<tempo>` | Começa neste ponto do vídeo original (padrão 0), em segundos (`22`, `1.5`) ou em `min:seg` (`09:33`, ou `h:min:seg`). Com `-` na frente, conta do **final** do vídeo (`-10`, `-01:44`) |
| `-endSec`, `-es` | `<tempo>` | Termina neste ponto do vídeo original, no mesmo formato do `-ss` (`-es -5` termina 5 s antes do fim); deve ser maior que o início. Vale também sem `-ss` e para figurinhas |
| `-verbose`, `-v` | | Mostra os parâmetros usados no yt-dlp/ffmpeg |
| `<url>` | | Link do vídeo; vale mais que a mensagem respondida |

O arquivo convertido é limitado a 20 MB (setting `get.maxSizeMB`). O arquivo original de uma mídia
respondida vai como veio do WhatsApp; sem nome (uma foto da câmera, por exemplo), ganha um como
`zapbot.jpeg`.

Escolha áudio ou figurinha por execução. Figurinhas têm no máximo seis segundos: sem `-es`, pegam os
seis segundos a partir do `-ss` (ou do início), e um trecho menor definido por `-ss` e `-es` mantém a
duração pedida. O vídeo e o áudio são enviados como documento.

De um link, com `-ss`, `-es` ou `-st`, o yt-dlp baixa só o trecho pedido (`--download-sections`,
cortado no tempo exato com `--force-keyframes-at-cuts`), sem o vídeo inteiro. Se o site não deixar
baixar o trecho, o `/get` baixa o vídeo inteiro e o ffmpeg corta.

#### Tempo contado do final

`-ss` e `-es` aceitam o tempo com `-` na frente, que conta a partir do final do vídeo:

- `-ss -10` começa 10 s antes do fim, ou seja, os **últimos 10 segundos**; `-ss -01:44` começa 1:44
  antes do fim. Se o vídeo for menor que isso, começa do 0.
- `-es -5` termina 5 s antes do fim.
- Dá para misturar (`-ss 150 -es -10`). Se o final cair antes do início, o bot recusa.
- `-0` não vale, e `-ss -10 -es -20` é recusado como qualquer outro final antes do início.

Para saber o ponto exato o bot precisa da duração: de um link, pergunta ao yt-dlp (`--print
duration`) e baixa só o trecho; se o site não informar, baixa o vídeo inteiro e mede o arquivo com o
`ffprobe` (que vem com o ffmpeg). Numa mídia respondida, mede o arquivo com o `ffprobe`.

Na mídia respondida:

- Imagem: `-st` faz a figurinha enquadrada no meio, como o `/sticker`; `-ss`, `-es` e `-a` são
  recusados.
- Áudio: com `-ss` ou `-es`, o trecho sai em `.mp3`; figurinha é recusada.
- Outros arquivos (PDF, documentos) são recusados.

#### Conteúdo sensível do X

O X só entrega vídeos marcados como sensíveis (NSFW) para quem está logado, e o yt-dlp sem login
falha nesses links. A saída é dar a ele os cookies de uma conta logada (de preferência uma só para
isso):

```bash
./scripts/get-cookie.sh x.com twitter.com    # lê os cookies do Chrome e grava ./cookies.txt (chmod 600)
make DOCK_REMOTE=1 cookies           # copia para o container: /app/cache/cookies.txt
rm cookies.txt
```

- O `get-cookie.sh` usa o `yt-dlp --cookies-from-browser` (`-b firefox` troca o navegador; `-o`
  muda o arquivo de saída) e guarda só os domínios pedidos. Ele avisa se faltar `auth_token`/`ct0`,
  ou seja, se a conta não estiver logada no navegador.
- O `make cookies` usa `docker cp` e dá `chmod 600`. O arquivo cai no volume do cache, então
  sobrevive a `make recreate`; sem `DOCK_REMOTE=1`, vai para o container de dev. `FILE=outro.txt`
  escolhe outro arquivo.
- Se `cache/cookies.txt` existe, o bot passa `--cookies` ao yt-dlp em todo download, de qualquer
  site. Sem o arquivo, baixa sem cookies. Para desligar, apague o arquivo do container.
- O arquivo dá acesso à conta: não vai para o git (`cookies.txt` está no `.gitignore`) nem pelo
  WhatsApp. Quando o X deslogar a sessão, o `/get` volta a falhar nesses links: gere e copie de novo.

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
etc.) são recusadas, para que o `/get` não sirva de ponte para a sua rede (SSRF). A checagem
recusa também respostas de DNS mistas (um endereço público e um interno), que indicam rebinding.
Como o yt-dlp resolve o DNS de novo e segue redirects por conta própria, a defesa de raiz é um
firewall de egresso no container (`docker/app/egress-firewall.sh`, ligado por
`ZAPBOT_EGRESS_FIREWALL=1`), que bloqueia todo acesso à rede interna a partir do bot.

```text
/get https://www.instagram.com/reel/XXXXXXXX/
/get -a https://youtu.be/XXXXXXXXXXX
/get -ss 10 -es 25 https://x.com/usuario/status/123456
/get -es 15 https://youtu.be/XXXXXXXXXXX
/get -ss 09:33 -es 09:45 https://youtu.be/XXXXXXXXXXX
/get -ss -10 https://youtu.be/XXXXXXXXXXX            → os últimos 10 segundos
/get -ss -01:44 -es -00:30 https://youtu.be/XXXXXXXXXXX → de 1:44 a 0:30 antes do fim
/download -st -ss 3 -es 6 https://youtu.be/XXXXXXXXXXX
(reply numa mensagem com link)  /get -a
(reply num vídeo do WhatsApp)   /get -a              → só o áudio, em .mp3
(reply num vídeo do WhatsApp)   /get -ss 5 -es 20    → o trecho, como documento
```
