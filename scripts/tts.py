#!/usr/bin/env python3
"""
tts.py - speaks a text locally with Piper (CPU). Used by /tts.

Run "tts.py --man" for the full manual.

Project:   ZapBot - https://github.com/jpereira/zapbot
Author:    Jorge Pereira
Copyright: (c) 2026 Jorge Pereira
License:   MIT (see the LICENSE file at the root of the project)
Created:   2026-11-19
"""

import getopt
import json
import os
import sys
import wave
from pathlib import Path

# This script's version: it goes up when the options or the output change
VERSION = "2.0.0"
PROG = os.path.basename(sys.argv[0]) if sys.argv and sys.argv[0] else "tts.py"
DEFAULT_DIR = os.environ.get("PIPER_VOICES_DIR", "/opt/piper")

SHORT_OPTIONS = "hmVDlpi:t:v:d:o:s:r:n:w:"
LONG_OPTIONS = [
    "help", "man", "version", "debug", "list", "prefetch",
    "input=", "text=", "voice=", "dir=", "output=", "speed=", "speaker=", "noise=", "noise-w=",
]

USAGE = f"""\
usage: {PROG} -v VOICE -o OUTPUT.wav (-i FILE | -t TEXT) [-d DIR] [-s SPEED] [-r ID] [-n N] [-w N] [-D]
       {PROG} -p -v VOICE [-d DIR]
       {PROG} -l [-d DIR]
       {PROG} -h | -m | -V

  -i, --input FILE     text file to speak ("-" reads the standard input)
  -t, --text TEXT      text to speak (instead of --input)
  -v, --voice VOICE    voice id, like pt_BR-faber-medium (downloaded to DIR if missing)
  -d, --dir DIR        folder of the voices (default: $PIPER_VOICES_DIR or {DEFAULT_DIR})
  -o, --output FILE    WAV file to write
  -s, --speed N        speed multiplier: 1.0 normal, 1.5 faster, 0.8 slower (default 1.0)
  -r, --speaker ID     speaker number, for voices with more than one
  -n, --noise N        variation of the voice (Piper noise_scale)
  -w, --noise-w N      variation of the rhythm (Piper noise_w_scale)
  -p, --prefetch       only downloads the voice, speaks nothing
  -l, --list           lists the voices that are in DIR
  -D, --debug          prints on the stderr what the script received and what it will do
  -V, --version        prints the versions of this script and of Piper, as JSON
  -h, --help           this help
  -m, --man            the manual
"""

MANUAL = f"""\
NAME
    {PROG} - speaks a text locally with Piper (CPU)

SYNOPSIS
    {PROG} -v VOICE -o OUTPUT.wav (-i FILE | -t TEXT) [options]
    {PROG} -p -v VOICE [-d DIR]
    {PROG} -l [-d DIR]
    {PROG} -h | -m | -V

DESCRIPTION
    Turns a text into a WAV file with a Piper voice. It is the engine of the bot's /tts command,
    which then converts the WAV to the Ogg/Opus voice note (ffmpeg). A voice that is not in the
    voices folder is downloaded to it the first time (names with an accent, like
    pt_PT-tugão-medium, included).

OPTIONS
    -i, --input FILE
        The text comes from FILE (UTF-8). "-" reads the standard input.
    -t, --text TEXT
        The text itself. Use it or --input, not both.
    -v, --voice VOICE
        The voice id: <language>-<name>-<quality>, like en_US-lessac-medium or pt_BR-faber-medium.
    -d, --dir DIR
        The folder where the voices (.onnx and .onnx.json) are, and where the missing ones go.
        Default: the PIPER_VOICES_DIR environment variable or {DEFAULT_DIR}.
    -o, --output FILE
        The WAV file to write.
    -s, --speed N
        Speed multiplier, greater than 0: 1.0 normal, 1.5 faster, 0.8 slower. Piper's length_scale
        is the inverse (1 / N). Default 1.0.
    -r, --speaker ID
        Speaker number, for voices with more than one (an integer from 0).
    -n, --noise N
        Piper noise_scale: the variation of the voice (0 flat; the voice's own value if omitted).
    -w, --noise-w N
        Piper noise_w_scale: the variation of the rhythm (the voice's own value if omitted).
    -p, --prefetch
        Only downloads the voice; needs --voice and speaks nothing.
    -l, --list
        Prints the ids of the voices that are in the folder, one per line.
    -D, --debug
        Prints on the stderr the arguments received, the options understood and each step.
    -V, --version
        Prints {{"wrapper": "...", "piper": "..."}} and exits with an error if Piper is not installed.
    -h, --help
        Short help.
    -m, --man
        This manual.

EXIT STATUS
    0  done
    1  failed while running (voice not found or not downloadable, no write permission, ...);
       the last line of the stderr says why
    2  wrong usage (unknown option, missing or invalid value)

EXAMPLES
    {PROG} -i text.txt -v pt_BR-faber-medium -o out.wav
    {PROG} -t "Good morning!" -v en_US-amy-medium -s 1.3 -o out.wav
    {PROG} -p -v pt_PT-tugão-medium
    {PROG} -l -d /opt/piper
    echo "Hello" | {PROG} -i - -v en_US-lessac-medium -o out.wav

FILES
    $PIPER_VOICES_DIR (default {DEFAULT_DIR})   the voices: <voice>.onnx and <voice>.onnx.json

AUTHOR
    Jorge Pereira - ZapBot, https://github.com/jpereira/zapbot

COPYRIGHT
    (c) 2026 Jorge Pereira. Released under the MIT License (see the LICENSE file).
"""


class UsageError(Exception):
    """Wrong usage: exit status 2."""


def fail(message, status=1):
    print(f"{PROG}: error: {message}", file=sys.stderr)
    return status


def parse(argv):
    """Turns the arguments into a dict of options. Raises UsageError."""
    try:
        pairs, rest = getopt.getopt(argv, SHORT_OPTIONS, LONG_OPTIONS)
    except getopt.GetoptError as err:
        raise UsageError(str(err))
    if rest:
        raise UsageError(f"unexpected argument: {' '.join(rest)}")

    opts = {"dir": DEFAULT_DIR, "speed": 1.0, "speaker": None, "noise": None, "noise_w": None,
            "input": None, "text": None, "voice": None, "output": None,
            "action": "speak", "debug": False}

    def number(name, value, minimum=None, integer=False):
        try:
            n = int(value) if integer else float(value)
        except ValueError:
            raise UsageError(f"{name}: '{value}' is not a number")
        if minimum is not None and n <= minimum:
            raise UsageError(f"{name}: must be greater than {minimum}")
        return n

    for flag, value in pairs:
        if flag in ("-h", "--help"):
            opts["action"] = "help"
        elif flag in ("-m", "--man"):
            opts["action"] = "man"
        elif flag in ("-V", "--version"):
            opts["action"] = "version"
        elif flag in ("-l", "--list"):
            opts["action"] = "list"
        elif flag in ("-p", "--prefetch"):
            opts["action"] = "prefetch"
        elif flag in ("-D", "--debug"):
            opts["debug"] = True
        elif flag in ("-i", "--input"):
            opts["input"] = value
        elif flag in ("-t", "--text"):
            opts["text"] = value
        elif flag in ("-v", "--voice"):
            opts["voice"] = value.strip()
        elif flag in ("-d", "--dir"):
            opts["dir"] = value
        elif flag in ("-o", "--output"):
            opts["output"] = value
        elif flag in ("-s", "--speed"):
            opts["speed"] = number("--speed", value, minimum=0)
        elif flag in ("-r", "--speaker"):
            opts["speaker"] = number("--speaker", value, minimum=-1, integer=True)
        elif flag in ("-n", "--noise"):
            opts["noise"] = number("--noise", value, minimum=-1)
        elif flag in ("-w", "--noise-w"):
            opts["noise_w"] = number("--noise-w", value, minimum=-1)

    if opts["action"] == "speak":
        if not opts["voice"]:
            raise UsageError("--voice is required")
        if not opts["output"]:
            raise UsageError("--output is required")
        if (opts["input"] is None) == (opts["text"] is None):
            raise UsageError("give the text with --input or with --text (one of them)")
    elif opts["action"] == "prefetch" and not opts["voice"]:
        raise UsageError("--voice is required")
    return opts


def debug(opts, message):
    if opts["debug"]:
        print(f"{PROG}: {message}", file=sys.stderr)


def versions():
    import piper  # noqa: F401
    from importlib.metadata import version

    print(json.dumps({"wrapper": VERSION, "piper": version("piper-tts")}))
    return 0


def list_voices(opts):
    folder = Path(opts["dir"])
    for model in sorted(folder.glob("*.onnx")):
        print(model.stem)
    return 0


def prepare_download():
    # Voice names with an accent (pt_PT-tugão-medium) make piper build a URL that http.client does not encode
    import piper.download_voices as dv
    from urllib.parse import quote

    original = dv.urlopen
    dv.urlopen = lambda url, *a, **k: original(quote(url, safe=":/?=&%"), *a, **k)


def ensure_voice(opts):
    """Returns the path of the voice model, downloading it if it is not in the folder."""
    folder = Path(opts["dir"])
    model = folder / f"{opts['voice']}.onnx"
    if model.exists():
        debug(opts, f"voice already in {folder}")
        return model

    from piper.download_voices import download_voice

    prepare_download()
    debug(opts, f"downloading {opts['voice']} to {folder}")
    folder.mkdir(parents=True, exist_ok=True)
    download_voice(opts["voice"], folder)
    return model


def read_text(opts):
    if opts["text"] is not None:
        return opts["text"]
    if opts["input"] == "-":
        return sys.stdin.read()
    with open(opts["input"], encoding="utf-8") as f:
        return f.read()


def speak(opts):
    from piper import PiperVoice, SynthesisConfig

    model = ensure_voice(opts)
    text = read_text(opts)
    if not text.strip():
        raise ValueError("the text is empty")

    config = SynthesisConfig(
        length_scale=1.0 / opts["speed"],
        speaker_id=opts["speaker"],
        noise_scale=opts["noise"],
        noise_w_scale=opts["noise_w"],
    )
    debug(opts, f"synthesizing {len(text)} characters with {model.name}, length_scale={config.length_scale:.4f}")
    with wave.open(opts["output"], "wb") as out:
        PiperVoice.load(model).synthesize_wav(text, out, syn_config=config)
    debug(opts, f"wrote {opts['output']}")
    return 0


def main(argv):
    # What the script received, exactly (before any parsing)
    if "-D" in argv or "--debug" in argv or any(a.startswith("-") and not a.startswith("--") and "D" in a for a in argv):
        print(f"{PROG}: argv={argv!r}", file=sys.stderr)

    try:
        opts = parse(argv)
    except UsageError as err:
        print(USAGE, file=sys.stderr)
        return fail(err, 2)  # the error goes last: it is the line the bot shows to the user

    debug(opts, f"options={opts!r}")
    action = opts["action"]
    try:
        if action == "help":
            print(USAGE, end="")
            return 0
        if action == "man":
            print(MANUAL, end="")
            return 0
        if action == "version":
            return versions()
        if action == "list":
            return list_voices(opts)
        if action == "prefetch":
            ensure_voice(opts)
            return 0
        return speak(opts)
    except Exception as err:  # the last line of the stderr is what the bot shows to the user
        if opts["debug"]:
            import traceback

            traceback.print_exc()
        return fail(f"{type(err).__name__}: {err}")


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
