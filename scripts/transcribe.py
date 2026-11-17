#!/usr/bin/env python3
"""
Transcreve um áudio localmente com o faster-whisper (CPU, int8). Usado pelo /get -transcribe.

  transcribe.py <audio> <modelo> <pasta-dos-modelos> [idioma]

Imprime um JSON na saída: {"language": "pt", "duration": 83.2, "text": "..."}.
Sem idioma (ou "auto"), o whisper detecta. Modelo que não está na pasta é baixado nela.
"""

import json
import sys


def main():
    if len(sys.argv) < 4:
        print("uso: transcribe.py <audio> <modelo> <pasta-dos-modelos> [idioma]", file=sys.stderr)
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
