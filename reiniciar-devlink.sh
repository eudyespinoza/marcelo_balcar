#!/usr/bin/env bash
set -Eeuo pipefail

cd -- "$(dirname -- "${BASH_SOURCE[0]}")"

docker_command=(docker)
if ! docker info >/dev/null 2>&1; then
  docker_command=(sudo docker)
fi

compose=("${docker_command[@]}" compose -f docker-compose.yml -f docker-compose.devlink.yml)

"${docker_command[@]}" network inspect traefik_proxy >/dev/null
"${compose[@]}" up -d --build --force-recreate
"${compose[@]}" ps
