#!/usr/bin/env sh
set -eu

KEY="99ffac4d360ae77905d723414011ef72"
HOST="flashcard.thunderstudy.indevs.in"
KEY_LOCATION="https://${HOST}/${KEY}.txt"

curl -fsS "https://api.indexnow.org/indexnow" \
  -H "Content-Type: application/json; charset=utf-8" \
  -d "$(curl -fsS "https://${HOST}/sitemap.xml" | sed -n 's:.*<loc>\([^<]*\)</loc>.*:\1:p' | awk -v key="$KEY" -v host="$HOST" -v keyLocation="$KEY_LOCATION" 'BEGIN { printf "{\"host\":\"%s\",\"key\":\"%s\",\"keyLocation\":\"%s\",\"urlList\":[", host,key,keyLocation; first=1 } { if (!first) printf ","; printf "\"%s\"", $0; first=0 } END { print "]}" }')"
