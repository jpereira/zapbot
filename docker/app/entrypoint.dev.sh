#!/bin/bash
#
# Dev
#
export UID=$(id -u)
export GID=$(id -g)

echo "Iniciando com UID=$UID e GID=$GID"

# cleanup
rm -vf \
  .wwebjs_auth/**/SingletonLock \
  .wwebjs_auth/**/SingletonSocket \
  .wwebjs_auth/**/SingletonCookie

mkdir -p $PWD/cache

# busyloop
npm start
