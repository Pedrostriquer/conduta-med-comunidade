#!/usr/bin/env bash
# Cópia diária do banco. Mantém 14 dias em /var/backups/conduta. Instalado como conduta-backup.timer.
set -euo pipefail
D=$(date +%F-%H%M)
docker exec conduta-db pg_dump -U conduta -d conduta -Fc > "/var/backups/conduta/conduta-$D.dump.tmp"
mv "/var/backups/conduta/conduta-$D.dump.tmp" "/var/backups/conduta/conduta-$D.dump"
find /var/backups/conduta -name 'conduta-*.dump' -mtime +14 -delete
