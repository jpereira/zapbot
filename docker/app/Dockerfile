FROM node:22-alpine

# fuso horário
ENV TZ=America/Sao_Paulo
ENV NODE_ENV=production
ENV APP_ENV=prod

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
    htop

# cria venv
RUN python3 -m venv /venv

# yt-dlp via pip, needed by "/download"
RUN /venv/bin/pip install --no-cache-dir yt-dlp

# main
COPY package*.json ./
RUN npm install
RUN npm install puppeteer-core --save

COPY . .
COPY --chown=node:node . /app/
#COPY --chown=node:node --chmod=755 docker/app/entrypoint.sh

WORKDIR /app

# Misc
RUN echo "alias ls='ls --color=auto'" >> /etc/profile.d/aliases.sh && \
    echo "alias ll='ls -lah --color=auto'" >> /etc/profile.d/aliases.sh && \
    echo "alias la='ls -A --color=auto'" >> /etc/profile.d/aliases.sh

# Exponha a porta se necessário
#EXPOSE 3000

# Executa script de boot
ENTRYPOINT ["/bin/sh", "-x", "/app/docker/app/entrypoint.sh"]
CMD ["npm", "start"]
