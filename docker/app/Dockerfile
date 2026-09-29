# Node.js 24 LTS
FROM node:24-alpine

# fuso horário
ENV TZ=America/Sao_Paulo
ENV NODE_ENV=production
ENV APP_ENV=prod

# Usamos o chromium do Alpine; o puppeteer não precisa baixar o Chrome
# (inclusive no 'prepare' do whatsapp-web.js instalado via git)
ENV PUPPETEER_SKIP_DOWNLOAD=true

USER root
RUN apk add --no-cache \
    su-exec \
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
    chromium \
    nss \
    freetype \
    harfbuzz \
    ca-certificates \
    ttf-freefont \
    html2text \
    sqlite \
    python3 \
    py3-pip \
    ffmpeg \
    curl \
    htop \
    strace \
    lsof \
    tcpdump \
    net-tools

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

RUN npm install

COPY --chown=node:node . .

#RUN chown -R node:node /app

# Executa script de boot
ENTRYPOINT ["/bin/sh", "-x", "/app/docker/app/entrypoint.sh"]
CMD ["npm", "start"]
