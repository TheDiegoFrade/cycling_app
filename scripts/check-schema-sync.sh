#!/usr/bin/env bash
# Verifica que todo create index / create function de supabase/migrations
# también aparezca (misma línea normalizada) en supabase/schema.sql.
set -euo pipefail
cd "$(dirname "$0")/.."
norm() { tr -s ' \t\n' ' ' < "$1"; }
schema=$(norm supabase/schema.sql)
fail=0
for f in supabase/migrations/*.sql; do
  while IFS= read -r name; do
    if ! grep -qiE "create (or replace )?(unique )?(index|function)( if not exists)? $name[ (]" <<<"$schema"; then
      echo "FALTA en schema.sql: $name (de $f)"; fail=1
    fi
  done < <(grep -ioE "create (or replace )?(unique )?(index|function)( if not exists)? [a-z_0-9.]+" "$f" | awk '{print $NF}')
done
[ $fail = 0 ] && echo "schema.sql incluye todas las migraciones" || exit 1
