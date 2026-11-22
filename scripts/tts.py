#!/usr/bin/env python3
"""
Fala um texto localmente com o Piper (CPU). Usado pelo /tts.

  tts.py <arquivo-de-texto> <voz> <pasta-das-vozes> <saida.wav>
  tts.py --version

Voz que não está na pasta é baixada nela. Com --version imprime as versões deste script e do Piper:
{"wrapper": "1.0.0", "piper": "1.3.0"}. Sai com erro se o Piper não está instalado.
"""

import json
import sys
import wave
from pathlib import Path

# This script's version: it goes up when the arguments or the output change
VERSAO = "1.0.0"


def versoes():
    import piper  # noqa: F401
    from importlib.metadata import version

    print(json.dumps({"wrapper": VERSAO, "piper": version("piper-tts")}))
    return 0


def falar(arquivo, voz, pasta, saida):
    from piper import PiperVoice

    pasta = Path(pasta)
    modelo = pasta / f"{voz}.onnx"
    if not modelo.exists():
        from piper.download_voices import download_voice

        pasta.mkdir(parents=True, exist_ok=True)
        download_voice(voz, pasta)

    with open(arquivo, encoding="utf-8") as f:
        texto = f.read()
    with wave.open(saida, "wb") as wav:
        PiperVoice.load(modelo).synthesize_wav(texto, wav)
    return 0


def main(argv):
    if argv[1:] == ["--version"]:
        return versoes()
    if len(argv) != 5:
        print(__doc__, file=sys.stderr)
        return 2
    return falar(*argv[1:])


if __name__ == "__main__":
    sys.exit(main(sys.argv))
