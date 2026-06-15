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

# User instance
USER node

# timezone
ENV TZ=America/Sao_Paulo

# main
COPY --chown=node:node . /app/
WORKDIR /app

# Expose the port if needed
EXPOSE 3000

# Runs the boot script
ENTRYPOINT ["/bin/sh", "-x", "/app/docker/app/entrypoint.dev.sh"]
