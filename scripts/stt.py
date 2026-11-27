#!/usr/bin/env python3
"""
stt.py - transcribes an audio locally with faster-whisper (CPU, int8). Used by /stt and /get -stt.

Run "stt.py --man" for the full manual.

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
from pathlib import Path

# This script's version: it goes up when the options or the output change
VERSION = "2.1.0"
PROG = os.path.basename(sys.argv[0]) if sys.argv and sys.argv[0] else "stt.py"
DEFAULT_DIR = os.environ.get("WHISPER_MODELS_DIR", "/opt/whisper")
# The models that come in the Docker image (read-only): used from there, never downloaded again to DIR
IMAGE_DIR = os.environ.get("WHISPER_IMAGE_DIR", "")
DEFAULT_MODEL = "large-v3"

SHORT_OPTIONS = "hmVDlpSni:M:d:L:b:f:"
LONG_OPTIONS = [
    "help", "man", "version", "debug", "list", "prefetch", "status", "no-vad",
    "input=", "model=", "dir=", "language=", "beam=", "format=",
]

USAGE = f"""\
usage: {PROG} -i AUDIO [-M MODEL] [-d DIR] [-L LANG] [-b N] [-n] [-f json|text] [-D]
       {PROG} -p [-M MODEL] [-d DIR]
       {PROG} -l [-d DIR]
       {PROG} -S [-d DIR]
       {PROG} -h | -m | -V

  -i, --input FILE     audio to transcribe (any format ffmpeg/PyAV reads)
  -M, --model MODEL    faster-whisper model: tiny, base, small, medium, large-v3-turbo... (default {DEFAULT_MODEL})
  -d, --dir DIR        folder of the models (default: $WHISPER_MODELS_DIR or {DEFAULT_DIR})
  -L, --language CODE  language of the speech: pt, en, es... ("auto" or empty: whisper detects it)
  -b, --beam N         beam size of the search (default 1: the fastest)
  -n, --no-vad         does not skip the silence and the music before transcribing
  -f, --format FORMAT  json (default: one JSON line) or text (only the text)
  -p, --prefetch       only downloads the model to DIR, transcribes nothing
  -l, --list           lists the models that are in DIR (and in $WHISPER_IMAGE_DIR)
  -S, --status         the models that exist and the installed ones (where, size), as JSON
  -D, --debug          prints on the stderr what the script received and what it will do
  -V, --version        prints the versions of this script and of faster-whisper, as JSON
  -h, --help           this help
  -m, --man            the manual
"""

MANUAL = f"""\
NAME
    {PROG} - transcribes an audio locally with faster-whisper (CPU)

SYNOPSIS
    {PROG} -i AUDIO [options]
    {PROG} -p [-M MODEL] [-d DIR]
    {PROG} -l [-d DIR]
    {PROG} -h | -m | -V

DESCRIPTION
    Turns the speech of an audio into text with faster-whisper on the CPU (int8). It is the engine of the
    bot's /stt command and of /get -stt, which first convert the audio to a 16 kHz mono WAV with ffmpeg. A
    model that is not in the models folder is downloaded to it the first time.

OPTIONS
    -i, --input FILE
        The audio file. Required to transcribe.
    -M, --model MODEL
        The faster-whisper model: tiny, base, small, medium, large-v3-turbo... Bigger is better and slower.
        Default: {DEFAULT_MODEL}.
    -d, --dir DIR
        The folder of the models, and where a missing one goes. Default: the WHISPER_MODELS_DIR environment
        variable or {DEFAULT_DIR}.
    -L, --language CODE
        The language of the speech (pt, en, es...). "auto" or empty: whisper detects it (the default).
    -b, --beam N
        Beam size of the search, an integer from 1. Bigger can be a little more precise and slower. Default 1.
    -n, --no-vad
        By default the silence and the music are skipped (VAD filter), where whisper tends to hallucinate text.
        With -n the whole audio is transcribed.
    -f, --format FORMAT
        json: one line {{"language": "pt", "duration": 83.2, "text": "..."}} (the default, what the bot reads).
        text: only the text.
    -p, --prefetch
        Only downloads the model (-M) to the folder (-d) and exits.
    -l, --list
        Prints the installed models (in DIR and in $WHISPER_IMAGE_DIR), one per line.
    -S, --status
        One JSON line: "available" (every name faster-whisper downloads by itself), "installed" (each one
        with "where": image or dir, and "bytes"), "dir" and "image". The bot reads it at startup.
    -D, --debug
        Prints on the stderr the arguments received, the options understood and each step.
    -V, --version
        Prints {{"wrapper": "...", "faster_whisper": "..."}} and exits with an error if faster-whisper is not installed.
    -h, --help
        Short help.
    -m, --man
        This manual.

OUTPUT
    The JSON (or the text) goes to the stdout, and it is the last line: faster-whisper may print warnings before it.

EXIT STATUS
    0  done
    1  failed while running (file not found, model not downloadable, no write permission, ...);
       the last line of the stderr says why
    2  wrong usage (unknown option, missing or invalid value)

EXAMPLES
    {PROG} -i speech.wav
    {PROG} -i speech.wav -M medium -L pt -f text
    {PROG} -p -M large-v3-turbo
    {PROG} -l -d /opt/whisper

FILES
    $WHISPER_MODELS_DIR (default {DEFAULT_DIR})   the models (Hugging Face cache: models--*--faster-whisper-<name>)
    $WHISPER_IMAGE_DIR   models that come in the image (read-only): used from there, never downloaded again

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

    opts = {"input": None, "model": DEFAULT_MODEL, "dir": DEFAULT_DIR, "language": None, "beam": 1,
            "vad": True, "format": "json", "action": "transcribe", "debug": False}

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
        elif flag in ("-S", "--status"):
            opts["action"] = "status"
        elif flag in ("-D", "--debug"):
            opts["debug"] = True
        elif flag in ("-n", "--no-vad"):
            opts["vad"] = False
        elif flag in ("-i", "--input"):
            opts["input"] = value
        elif flag in ("-M", "--model"):
            opts["model"] = value.strip()
        elif flag in ("-d", "--dir"):
            opts["dir"] = value
        elif flag in ("-L", "--language"):
            opts["language"] = None if value.strip().lower() in ("", "auto") else value.strip()
        elif flag in ("-b", "--beam"):
            try:
                opts["beam"] = int(value)
            except ValueError:
                raise UsageError(f"--beam: '{value}' is not an integer")
            if opts["beam"] < 1:
                raise UsageError("--beam: must be 1 or more")
        elif flag in ("-f", "--format"):
            if value not in ("json", "text"):
                raise UsageError(f"--format: '{value}' is not json or text")
            opts["format"] = value

    if opts["action"] == "transcribe" and not opts["input"]:
        raise UsageError("--input is required")
    if opts["action"] in ("transcribe", "prefetch") and not opts["model"]:
        raise UsageError("--model cannot be empty")
    return opts


def debug(opts, message):
    if opts["debug"]:
        print(f"{PROG}: {message}", file=sys.stderr)


def versions():
    # The same import as the transcription: if the API does not load, /bot -info shows "not found"
    import faster_whisper
    from faster_whisper import WhisperModel  # noqa: F401

    print(json.dumps({"wrapper": VERSION, "faster_whisper": faster_whisper.__version__}))
    return 0


def known_models():
    """The names faster-whisper downloads by itself, and the Hugging Face repository of each one."""
    from faster_whisper.utils import _MODELS

    return dict(_MODELS)


def repo_folder(model):
    """The folder of a model in a download_root (the Hugging Face cache layout): models--<org>--<name>."""
    repo = known_models().get(model) or (model if "/" in model else None)
    return f"models--{repo.replace('/', '--')}" if repo else None


def installed_in(model, folder):
    """The snapshot folder of the model in FOLDER (it has model.bin), or None."""
    name = repo_folder(model)
    if not folder or not name:
        return None
    for snapshot in sorted((Path(folder) / name / "snapshots").glob("*")):
        if (snapshot / "model.bin").exists():
            return snapshot
    return None


def folder_size(path):
    # model.bin and the rest are symlinks to blobs/: the size of the targets, once each
    seen, total = set(), 0
    for item in Path(path).rglob("*"):
        target = item.resolve()
        if target.is_file() and target not in seen:
            seen.add(target)
            total += target.stat().st_size
    return total


def status(opts):
    """The models that exist (by name) and the installed ones: where (image or DIR) and how big."""
    models = known_models()
    installed, repos = [], set()
    for name, repo in models.items():
        if repo in repos:
            continue  # an alias (large, turbo): the first name of the repository
        for where, folder in (("image", IMAGE_DIR), ("dir", opts["dir"])):
            snapshot = installed_in(name, folder)
            if snapshot:
                repos.add(repo)
                installed.append({"model": name, "where": where, "bytes": folder_size(snapshot.parent.parent)})
                break
    print(json.dumps({"available": list(models), "installed": installed, "dir": opts["dir"], "image": IMAGE_DIR or None}))
    return 0


def list_models(opts):
    repos = set()
    for name, repo in known_models().items():
        if repo not in repos and any(installed_in(name, folder) for folder in (IMAGE_DIR, opts["dir"])):
            repos.add(repo)
            print(name)
    return 0


def load_model(opts):
    # The import is slow: only after validating the arguments
    from faster_whisper import WhisperModel

    # In the image (read-only) it is used from there; otherwise DIR, where it is downloaded the first time
    root = IMAGE_DIR if installed_in(opts["model"], IMAGE_DIR) else opts["dir"]
    Path(root).mkdir(parents=True, exist_ok=True)
    debug(opts, f"loading {opts['model']} from {root} (downloads it if it is not there)")
    return WhisperModel(opts["model"], device="cpu", compute_type="int8", download_root=root)


def transcribe(opts):
    if not os.path.isfile(opts["input"]):
        raise FileNotFoundError(f"audio not found: {opts['input']}")
    model = load_model(opts)
    debug(opts, f"transcribing {opts['input']} (language={opts['language'] or 'auto'}, beam={opts['beam']}, vad={opts['vad']})")
    segments, info = model.transcribe(opts["input"], language=opts["language"], vad_filter=opts["vad"],
                                      beam_size=opts["beam"])
    text = " ".join(s.text.strip() for s in segments).strip()
    debug(opts, f"language={info.language} duration={info.duration:.1f}s characters={len(text)}")

    if opts["format"] == "text":
        print(text)
    else:
        print(json.dumps({"language": info.language, "duration": info.duration, "text": text}, ensure_ascii=False))
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
            return list_models(opts)
        if action == "status":
            return status(opts)
        if action == "prefetch":
            load_model(opts)
            return 0
        return transcribe(opts)
    except Exception as err:  # the last line of the stderr is what the bot shows to the user
        if opts["debug"]:
            import traceback

            traceback.print_exc()
        return fail(f"{type(err).__name__}: {err}")


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
