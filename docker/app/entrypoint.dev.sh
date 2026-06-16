#!/bin/bash

# cleanup
rm -vf \
  .wwebjs_auth/**/SingletonLock \
  .wwebjs_auth/**/SingletonSocket \
  .wwebjs_auth/**/SingletonCookie

mkdir -p $PWD/cache

if [ ! -f "/tmp/npm.install.ok" ]; then
   npm install
   touch /tmp/npm.install.ok
else
   echo "WARN: Already called 'npm install', skipping."
fi

# busyloop
while true; do 
   npm start
done

