#!/bin/bash
#
# Prod
#
export UID=$(id -u)
export GID=$(id -g)

echo "Iniciando com UID=$UID e GID=$GID"

# cleanup
rm -vf \
  .wwebjs_auth/**/SingletonLock \
  .wwebjs_auth/**/SingletonSocket \
  .wwebjs_auth/**/SingletonCookie

mkdir -vp $PWD/.wwebjs_auth
mkdir -vp $PWD/cache

chown -R node:node $PWD/.wwebjs_auth || true
chown -R node:node $PWD/cache || true

# busyloop
echo "Starting as node:"
echo "CMD: $@"
exec gosu node "$@"
