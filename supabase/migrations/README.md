# Migraciones

`supabase/schema.sql` sigue siendo el esquema completo e idempotente (es el
baseline: lo que ya está en producción). Todo cambio nuevo va en DOS lugares:

1. un archivo aquí, `AAAAMMDDHHMMSS_descripcion.sql`, idempotente, para pegar
   en el SQL Editor de Supabase (o `supabase db push`);
2. el mismo SQL integrado en `schema.sql`, para que un proyecto nuevo quede igual.

`scripts/check-schema-sync.sh` verifica que cada `create index/function`
de las migraciones también esté en `schema.sql`.
