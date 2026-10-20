#!/usr/bin/env bash
# Publica las Edge Functions de cobro, registro y coaches (y las que cambiaron
# con el acceso por plan) con las banderas correctas. Ver
# docs/cobro-y-registro.md, «Funciones».
#
#   npx supabase login            # una vez; abre el navegador
#   ./scripts/deploy-functions.sh # desde la raíz del repo
#
# Ojo con --no-verify-jwt: solo en las que NO reciben sesión de usuario
# (Mercado Pago y el cron). Las demás validan la sesión.
set -euo pipefail

PROJECT_REF="${SUPABASE_PROJECT_REF:-pmshhyyqoghoyjnsedza}"
SB="npx --yes supabase@latest"

cd "$(dirname "$0")/.."

deploy() {
  echo "→ $*"
  $SB functions deploy "$@" --project-ref "$PROJECT_REF"
}

# Nuevas
deploy billing
deploy billing-webhook --no-verify-jwt # avisos de Mercado Pago: se valida su firma (MP_WEBHOOK_SECRET)
deploy invite
deploy coach-apply

# Cambiaron con el acceso por plan
deploy coach-chat
deploy pinon-chat
deploy coach-retire-plan
deploy monthly-self-report --no-verify-jwt # la llama el cron con x-cron-secret, sin sesión

echo "Listo. Revisa en Supabase → Edge Functions que las 8 tengan fecha de hoy."
