#!/usr/bin/env bash
# Publica o Conduta Med na VPS: compila o app e o servidor aqui e manda só o que mudou.
#   deploy/deploy.sh          tudo
#   deploy/deploy.sh --web    só o app
#   deploy/deploy.sh --api    só o servidor
# O Caddyfile não vai sozinho: depois de mudar deploy/Caddyfile, rode deploy/deploy.sh --caddy.
set -euo pipefail
cd "$(dirname "$0")/.."

VPS_HOST="${VPS_HOST:?defina VPS_HOST, por exemplo usuario@seu-servidor}"
VPS_KEY="${VPS_KEY:-$HOME/.ssh/id_ed25519}"
SSH="ssh -i $VPS_KEY -o ConnectTimeout=20"
RSYNC="rsync -az --partial -e \"$SSH\""
what="${1:-all}"

if [ "$what" = "--caddy" ]; then
  echo "· caddy: conferindo e recarregando"
  eval $RSYNC deploy/Caddyfile "$VPS_HOST:/tmp/Caddyfile.novo"
  $SSH "$VPS_HOST" 'sudo cp /etc/caddy/Caddyfile /etc/caddy/Caddyfile.bak-$(date +%Y%m%d-%H%M) && { sudo caddy validate --config /tmp/Caddyfile.novo --adapter caddyfile >/tmp/caddy-validate.log 2>&1 || { tail -5 /tmp/caddy-validate.log; exit 1; }; } && sudo cp /tmp/Caddyfile.novo /etc/caddy/Caddyfile && sudo systemctl reload caddy && echo recarregado'
  exit 0
fi

if [ "$what" != "--api" ]; then
  echo "· app: compilando"
  (cd app && npm run build >/dev/null)
  node deploy/precompress.mjs app/dist
  echo "· app: enviando"
  eval $RSYNC --delete --exclude img/ app/dist/ "$VPS_HOST:/srv/conduta/web/"
  eval $RSYNC --ignore-existing app/public/img/ "$VPS_HOST:/srv/conduta/web/img/"
  if [ -d plugin/conduta-med ]; then
    (cd plugin && zip -qr /tmp/conduta-med.zip conduta-med -x '*.DS_Store')
    eval $RSYNC /tmp/conduta-med.zip "$VPS_HOST:/srv/conduta/web/plugin/"
    rm -f /tmp/conduta-med.zip
  fi
fi

if [ "$what" != "--web" ]; then
  echo "· servidor: compilando"
  (cd server && npm run build >/dev/null)
  echo "· servidor: enviando"
  eval $RSYNC --delete server/dist server/migrations server/package.json server/package-lock.json server/Dockerfile server/.dockerignore "$VPS_HOST:/opt/conduta/server/"
  eval $RSYNC deploy/docker-compose.yml "$VPS_HOST:/opt/conduta/docker-compose.yml"
  [ -d server/data/transcricoes ] && eval $RSYNC --delete server/data/transcricoes/ "$VPS_HOST:/srv/conduta/transcricoes/"
  [ -f server/data/banco-extra.json ] && eval $RSYNC server/data/banco-extra.json "$VPS_HOST:/srv/conduta/banco/"
  echo "· servidor: subindo"
  $SSH "$VPS_HOST" 'cd /opt/conduta && sudo docker compose up -d --build --wait 2>&1 | tail -4'
fi

echo "· conferindo"
curl -fsS ${PUBLIC_URL:-https://plataforma.exemplo.com.br}/api/health && echo
echo "pronto"
