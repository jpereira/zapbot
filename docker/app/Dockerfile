FROM node:22-alpine

RUN apk add --no-cache \
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
    curl

# cria venv
RUN python3 -m venv /venv

# yt-dlp via pip, needed by "/download"
RUN /venv/bin/pip install --no-cache-dir yt-dlp

# Instancia de usuario
USER node

# fuso horário
ENV TZ=America/Sao_Paulo

# main
COPY --chown=node:node . /app/
WORKDIR /app

# Exponha a porta se necessário
EXPOSE 3000

# Executa script de boot
ENTRYPOINT ["/bin/sh", "-x", "/app/docker/app/entrypoint.dev.sh"]
