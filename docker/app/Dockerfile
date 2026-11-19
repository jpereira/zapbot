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
# 19 does not open audio with the current faster-whisper (error "metadata_errors"). The default model
# (stt.model) goes in the image: the first transcription does not wait for a download. Another model
# is downloaded to /opt/whisper the first time it is used.
ENV WHISPER_MODELS_DIR=/opt/whisper
RUN /venv/bin/pip install --no-cache-dir faster-whisper "av<17" \
 && /venv/bin/python -c "from faster_whisper import WhisperModel; WhisperModel('small', device='cpu', compute_type='int8', download_root='/opt/whisper')" \
 && chown -R node:node /opt/whisper

# Piper (local text to speech, CPU), used by "/tts". The default voices (tts.voice.pt and tts.voice.en) are downloaded to /opt/piper:
# the first speech does not wait for a download. Another voice is downloaded the first time it is used.
ENV PIPER_VOICES_DIR=/opt/piper
RUN mkdir -p /opt/piper \
 && /venv/bin/pip install --no-cache-dir piper-tts \
 && /venv/bin/python -c "from pathlib import Path; from piper.download_voices import download_voice; [download_voice(v, Path('/opt/piper')) for v in ('pt_BR-faber-medium', 'en_US-lessac-medium')]" \
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

# Runs the boot script
ENTRYPOINT ["/bin/sh", "-x", "/app/docker/app/entrypoint.sh"]
CMD ["npm", "start"]
