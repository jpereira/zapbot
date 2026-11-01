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
