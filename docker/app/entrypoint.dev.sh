#!/bin/bash

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

