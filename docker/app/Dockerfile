FROM node:20-alpine AS builder
USER node
COPY --chown=node:node . /app/
WORKDIR /app
RUN yarn install && yarn build

FROM node:20-alpine
RUN apk add tzdata
ENV TZ=Brazil/East
USER node
ENV NODE_ENV=production
COPY --from=builder --chown=node:node /app/package.json /app/
WORKDIR /app
RUN yarn install
COPY --from=builder --chown=node:node /app/config config
COPY --from=builder --chown=node:node /app/dist dist
CMD [ "yarn", "start" ]

HEALTHCHECK NONE
