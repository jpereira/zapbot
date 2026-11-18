#!/usr/bin/env python3
"""
Transcreve um áudio localmente com o faster-whisper (CPU, int8). Usado pelo /get -stt.

  transcribe.py <audio> <modelo> <pasta-dos-modelos> [idioma]
  transcribe.py --version

Imprime um JSON na saída: {"language": "pt", "duration": 83.2, "text": "..."}.
Sem idioma (ou "auto"), o whisper detecta. Modelo que não está na pasta é baixado nela.

Com --version imprime as versões deste script e da API usada (o /bot -info mostra):
{"wrapper": "1.0.0", "faster_whisper": "1.2.0"}. Sai com erro se o faster-whisper não está instalado.
"""

import json
import sys

# This script's version: it goes up when the arguments or the output change
VERSAO = "1.0.0"


def versoes():
    # The same import as the transcription: if the API does not load, /bot -info shows "não encontrado"
    import faster_whisper
    from faster_whisper import WhisperModel  # noqa: F401

    print(json.dumps({"wrapper": VERSAO, "faster_whisper": faster_whisper.__version__}))
    return 0


def main():
    if len(sys.argv) == 2 and sys.argv[1] in ("--version", "-V"):
        return versoes()
    if len(sys.argv) < 4:
        print("uso: transcribe.py <audio> <modelo> <pasta-dos-modelos> [idioma] | --version", file=sys.stderr)
        return 2

    audio, modelo, pasta = sys.argv[1:4]
    idioma = sys.argv[4] if len(sys.argv) > 4 and sys.argv[4] not in ("", "auto") else None

    # The import is slow: only after validating the arguments
    from faster_whisper import WhisperModel

    whisper = WhisperModel(modelo, device="cpu", compute_type="int8", download_root=pasta)
    # vad_filter: skips silence and music, where whisper tends to hallucinate text
    segmentos, info = whisper.transcribe(audio, language=idioma, vad_filter=True, beam_size=1)
    texto = " ".join(s.text.strip() for s in segmentos).strip()

    print(json.dumps({"language": info.language, "duration": info.duration, "text": texto}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
