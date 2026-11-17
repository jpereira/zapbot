# `/transcribe`

Transcreve a fala de um vídeo ou áudio e responde com o **texto**. Aceita uma URL, ou uma resposta
a um link, a um vídeo ou a um áudio. O [`/get -transcribe`](get.md#transcrever-a-fala--transcribe)
(ou `/get -t`) é um atalho para a mesma coisa, para quando você já está usando o `/get`.

Roda **dentro do servidor**, com o [faster-whisper](https://github.com/SYSTRAN/faster-whisper)
(open source, na CPU): sem OpenAI, sem custo por minuto, e o áudio não sai do homelab.

| Opção | Valor | Descrição |
|---|---|---|
| `-startSec`, `-ss` | `<tempo>` | Começa neste ponto (padrão 0), em segundos (`30`) ou em `min:seg` (`09:33`). Com `-` na frente, conta do **final** (`-60` é o último minuto) |
| `-endSec`, `-es` | `<tempo>` | Termina neste ponto, no mesmo formato do `-ss`; deve ser maior que o início |
| `-summary`, `-sum` | | Também resume a fala com o ChatGPT (a mesma chave do [`/gpt`](gpt.md), que gasta a sua conta da OpenAI): o resumo em tópicos no alto, a transcrição inteira embaixo |
| `-verbose`, `-v` | | Mostra os comandos usados no yt-dlp, no ffmpeg e no faster-whisper, e quanto tempo a transcrição levou |
| `<url>` | | Link do vídeo ou áudio; vale mais que a mensagem respondida |

```text
/transcribe https://www.instagram.com/reel/XXXXXXXX/
⏳ Transcrevendo a fala, pode levar um tempo.   →   📝 Transcrição · 🗣️ pt · 1:23
(o texto)

/transcribe -ss 30 -es 90 https://youtu.be/XXXXXXXXXXX     → só de 0:30 a 1:30
/transcribe -sum https://www.instagram.com/reel/XXXXXXXX/
📝 Resumo · 🗣️ pt · 1:23

• ele mostra como fazer pão de queijo
• três dicas para ele crescer

📄 Transcrição
(o texto inteiro)

/transcribe -v <url>                                       → mostra também os comandos que rodaram
(reply numa mensagem com link)  /transcribe
(reply numa nota de voz)        /transcribe
(reply em qualquer vídeo ou áudio)  /transcribe
```

- **Qualquer URL** que o yt-dlp entenda (Instagram, YouTube, X, TikTok...). O bot baixa só o
  **áudio de menor qualidade**, umas centenas de KB por minuto, não o vídeo.
- **Qualquer arquivo de vídeo ou áudio** respondido: nota de voz, vídeo, um `.mp3` ou `.mp4` mandado
  como documento. Transcreve sem baixar nada. Imagem ou PDF é recusado.
- O vídeo ou áudio também pode ir com `/transcribe` na legenda (sem reply).
- O `-sum` manda também o texto ao ChatGPT (a chave e o modelo do `/gpt`) e responde com o resumo em
  tópicos no alto e a transcrição inteira embaixo. Se o ChatGPT falhar (sem saldo, timeout), a
  transcrição sai mesmo assim, com o motivo no lugar do resumo. Sem chave, o bot avisa antes de
  gastar a CPU.
- O idioma é detectado pelo whisper; fixe com `/set transcribe.language pt` se ele errar num
  trecho curto. O modelo é o `transcribe.model` (padrão `small`).
- No máximo `transcribe.maxMinutes` (padrão 20) de áudio: para um mais longo, escolha um trecho
  com `-ss` e `-es`.
- Um link **sem vídeo nem áudio** (um carrossel do Instagram só com fotos, por exemplo) recebe
  `Esse link não tem vídeo nem áudio para baixar (é um post só de fotos?)`.
- Divide o limite de 2 `/get` ao mesmo tempo, e uma URL da rede interna é recusada. Para o Instagram
  e outros sites que pedem login, usa o mesmo `cookies.txt` do [`/get`](get.md#conteúdo-sensível-do-x).
  Todos os detalhes estão em [Transcrever a fala](get.md#transcrever-a-fala--transcribe).
