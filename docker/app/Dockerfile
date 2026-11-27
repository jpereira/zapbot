# Node.js 24 LTS on Debian 13 (trixie), Debian's stable version
FROM node:24-trixie-slim

# timezone
ENV TZ=America/Sao_Paulo

# We use Debian's chromium; puppeteer does not need to download Chrome
# (including in the 'prepare' of whatsapp-web.js installed through git)
ENV PUPPETEER_SKIP_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

USER root
# gosu: switches to the node user in the entrypoint (Alpine's su-exec)
RUN apt-get update && apt-get install -y --no-install-recommends \
    gosu \
    poppler-utils \
    tzdata \
    git \
    bash \
    vim \
    curl \
    wget \
    openssh-client \
    less \
    grep \
    sed \
    coreutils \
    findutils \
    file \
    procps \
    chromium \
    iptables \
    libnss3 \
    libfreetype6 \
    libharfbuzz0b \
    ca-certificates \
    fonts-freefont-ttf \
    html2text \
    sqlite3 \
    python3 \
    python3-venv \
    python3-pip \
    ffmpeg \
    tesseract-ocr \
    tesseract-ocr-eng \
    tesseract-ocr-por \
    htop \
    strace \
    lsof \
    tcpdump \
    net-tools \
 && rm -rf /var/lib/apt/lists/*

# cria venv
RUN python3 -m venv /venv

# yt-dlp via pip, needed by "/download"
RUN /venv/bin/pip install --no-cache-dir yt-dlp

# dependencies
RUN /venv/bin/python -m pip install -U yt-dlp

# faster-whisper (local transcription, CPU), used by "/get -stt". The av stays below 17:
# 19 does not open audio with the current faster-whisper (error "metadata_errors"). The default model, large-v3
# (stt.model, STT_MODEL: the best), goes in the image (/opt/whisper, WHISPER_IMAGE_DIR): the first transcription
# does not wait for a download. The others (the first use, or STT_MODELS="all") go to the cache volume,
# WHISPER_MODELS_DIR: they survive a new image (src/models.js).
ENV WHISPER_IMAGE_DIR=/opt/whisper WHISPER_MODELS_DIR=/app/cache/models/whisper
RUN /venv/bin/pip install --no-cache-dir faster-whisper "av<17" \
 && /venv/bin/python -c "from faster_whisper import WhisperModel; WhisperModel('large-v3', device='cpu', compute_type='int8', download_root='/opt/whisper')" \
 && chown -R node:node /opt/whisper

# Piper (local text to speech, CPU), used by "/tts". The default voices (tts.voice.pt: pt_PT-tugão-medium, the tuga
# one; tts.voice.en: en_US-lessac-high) go in the image (/opt/piper, PIPER_IMAGE_DIR): the first speech does not
# wait for a download. The others (the first use, or TTS_VOICES="all") go to the cache volume, PIPER_VOICES_DIR.
# The URL of a voice with an accent (tugão) is encoded here: piper builds it without encoding (scripts/tts.py too).
ENV PIPER_IMAGE_DIR=/opt/piper PIPER_VOICES_DIR=/app/cache/models/piper
RUN mkdir -p /opt/piper \
 && /venv/bin/pip install --no-cache-dir piper-tts \
 && /venv/bin/python -c "from pathlib import Path; from urllib.parse import quote; import piper.download_voices as dv; o = dv.urlopen; dv.urlopen = lambda u, *a, **k: o(quote(u, safe=':/?=&%'), *a, **k); [dv.download_voice(v, Path('/opt/piper')) for v in ('pt_PT-tugão-medium', 'en_US-lessac-high')]" \
 && chown -R node:node /opt/piper

# Misc
RUN echo "alias ls='ls --color=auto'" >> /etc/profile.d/aliases.sh && \
    echo "alias ll='ls -lah --color=auto'" >> /etc/profile.d/aliases.sh && \
    echo "alias la='ls -A --color=auto'" >> /etc/profile.d/aliases.sh

# main
WORKDIR /app

COPY package*.json ./
COPY patches ./patches
COPY scripts/apply-patches.js ./scripts/apply-patches.js

RUN npm install --omit=dev

COPY --chown=node:node . .

#RUN chown -R node:node /app

# Health: the bot writes /tmp/zapbot-heartbeat.json every 30 s while it works
# (src/heartbeat.js); stopped for more than 90 s = unhealthy. start-period covers the boot.
HEALTHCHECK --interval=30s --timeout=10s --start-period=2m --retries=3 \
    CMD ["node", "/app/docker/app/healthcheck.js"]

# The web interface (zapbot.web.*, off by default): inside the container it listens on every interface, and the
# docker-compose.yml decides who reaches it from outside (127.0.0.1:3200 by default)
ENV ZAPBOT_WEB_HOST=0.0.0.0
EXPOSE 3200

# Runs the boot script
ENTRYPOINT ["/bin/sh", "-x", "/app/docker/app/entrypoint.sh"]
CMD ["npm", "start"]
