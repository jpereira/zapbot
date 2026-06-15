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
    sqlite

USER node

#ENV TZ=Brazil/East
ENV TZ=America/Sao_Paulo

COPY --chown=node:node . /app/
WORKDIR /app

# Expose the port if needed
EXPOSE 3000

# Tenta iniciar o projeto
#CMD ["/bin/bash"]

# Runs the boot script
ENTRYPOINT ["/bin/sh", "-x", "/app/docker/app/entrypoint.dev.sh"]
