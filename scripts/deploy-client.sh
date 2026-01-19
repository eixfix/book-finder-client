#!/usr/bin/env bash
set -e

RELEASE_DIR="${1:-}"
RELEASES_DIR="/opt/book-finder-client/releases"
SHARED_DIR="/opt/book-finder-client/shared"
CURRENT_DIR="/opt/book-finder-client/current"

if [ -z "$RELEASE_DIR" ]; then
  echo "Usage: deploy-client.sh /opt/book-finder-client/releases/<timestamp>" >&2
  exit 1
fi

ln -sfn "$SHARED_DIR/.env" "$RELEASE_DIR/.env"

cd "$RELEASE_DIR"
npm ci --omit=dev

ln -sfn "$RELEASE_DIR" "$CURRENT_DIR"
sudo systemctl restart book-finder-client

ls -dt "$RELEASES_DIR"/* | tail -n +6 | xargs -r rm -rf
