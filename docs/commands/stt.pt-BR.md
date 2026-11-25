# `/stt`

Transcreve a fala de um vídeo ou áudio e responde com o **texto**. Aceita uma URL, ou uma resposta
a um link, a um vídeo ou a um áudio. O [`/get -stt`](get.md#transcrever-a-fala--stt)
(ou `/get -t`) é um atalho para a mesma coisa, para quando você já está usando o `/get`.

Roda **dentro do servidor**, com o [faster-whisper](https://github.com/SYSTRAN/faster-whisper)
(open source, na CPU): sem OpenAI, sem custo por minuto, e o áudio não sai do homelab.

| Opção | Valor | Descrição |
|---|---|---|
| `-quiet`, `-q` | | Devolve **só** o texto transcrito: sem cabeçalho (idioma e duração), sem a dica do motor e sem o aviso `⏳`. Com `-sum`, o resumo e o texto, sem títulos. Para esconder a dica sempre: o setting `stt.footer` em `off` |
| `-lang`, `-L` | `<código>` | O idioma da fala: `pt`, `en`, `es`, `pt-br`... ou `auto` (o whisper detecta). Com `-gpt`, também vai para a API da OpenAI. O padrão é o setting `stt.language` (`auto`). (O `-l` é o atalho do `-local`) |
| `-model`, `-M` | `<nome>` | O modelo do faster-whisper (`tiny`, `base`, `small`, `medium`, `large-v3-turbo`...; maior é melhor e mais lento; o que não está na imagem é baixado na primeira vez). Com `-gpt`, o modelo da OpenAI. O padrão é o setting `stt.model` |
| `-beam`, `-b` | `<1-10>` | O tamanho do beam da busca local: `1` é o mais rápido, mais pode acertar um pouco mais e demora mais. O padrão é o setting `stt.beam` |
| `-vad` | `<on\|off>` | `on`: pula o silêncio e a música antes de transcrever (onde o whisper inventa texto); `off`: transcreve tudo. Só no motor local. O padrão é o setting `stt.vad` |
| `-startSec`, `-ss` | `<tempo>` | Começa neste ponto (padrão 0), em segundos (`30`) ou em `min:seg` (`09:33`). Com `-` na frente, conta do **final** (`-60` é o último minuto) |
| `-endSec`, `-es` | `<tempo>` | Termina neste ponto, no mesmo formato do `-ss`; deve ser maior que o início |
| `-gpt`, `-g` | | Transcreve pelo ChatGPT (API da OpenAI, gasta a sua conta) em vez do faster-whisper local. Sem `-gpt` nem `-local`, vale o setting [`stt.engine`](../settings.md) |
| `-local`, `-l` | | Transcreve com o faster-whisper local (sem chave, usa a CPU do servidor), mesmo com o `stt.engine` em `gpt` |
| `-summary`, `-sum` | | Também resume a fala com o ChatGPT (a mesma chave do [`/gpt`](gpt.md), que gasta a sua conta da OpenAI): o resumo em tópicos no alto, a transcrição inteira embaixo |
| `-verbose`, `-v` | | Mostra os comandos usados no yt-dlp, no ffmpeg e no faster-whisper, e quanto tempo a transcrição levou |
| `<url>` | | Link do vídeo ou áudio; vale mais que a mensagem respondida |

```text
/stt https://www.instagram.com/reel/XXXXXXXX/
⏳ Transcrevendo a fala, pode levar um tempo.   →   📝 Transcrição · 🗣️ pt · 1:23
(o texto)

/stt -ss 30 -es 90 https://youtu.be/XXXXXXXXXXX     → só de 0:30 a 1:30
/stt -sum https://www.instagram.com/reel/XXXXXXXX/
📝 Resumo · 🗣️ pt · 1:23

• ele mostra como fazer pão de queijo
• três dicas para ele crescer

📄 Transcrição
(o texto inteiro)

/stt -v <url>                                       → mostra também os comandos que rodaram
(reply numa mensagem com link)  /stt
(reply numa nota de voz)        /stt
(reply em qualquer vídeo ou áudio)  /stt
```

- **Qualquer URL** que o yt-dlp entenda (Instagram, YouTube, X, TikTok...). O bot baixa só o
  **áudio de menor qualidade**, umas centenas de KB por minuto, não o vídeo.
- **Qualquer arquivo de vídeo ou áudio** respondido: nota de voz, vídeo, um `.mp3` ou `.mp4` mandado
  como documento. Transcreve sem baixar nada. Imagem ou PDF é recusado.
- O vídeo ou áudio também pode ir com `/stt` na legenda (sem reply).
- O `-sum` manda também o texto ao ChatGPT (a chave e o modelo do `/gpt`) e responde com o resumo em
  tópicos no alto e a transcrição inteira embaixo. Se o ChatGPT falhar (sem saldo, timeout), a
  transcrição sai mesmo assim, com o motivo no lugar do resumo. Sem chave, o bot avisa antes de
  gastar a CPU.
- O idioma é detectado pelo whisper; fixe com `/set stt.language pt` se ele errar num
  trecho curto. O modelo é o `stt.model` (padrão `small`).
- No máximo `stt.maxMinutes` (padrão 20) de áudio: para um mais longo, escolha um trecho
  com `-ss` e `-es`.
- Um link **sem vídeo nem áudio** (um carrossel do Instagram só com fotos, por exemplo) recebe
  `Esse link não tem vídeo nem áudio para baixar (é um post só de fotos?)`.
- Divide o limite de 2 `/get` ao mesmo tempo, e uma URL da rede interna é recusada. Para o Instagram
  e outros sites que pedem login, usa o mesmo `cookies.txt` do [`/get`](get.md#conteúdo-com-login).
  Todos os detalhes estão em [Transcrever a fala](get.md#transcrever-a-fala--stt).
