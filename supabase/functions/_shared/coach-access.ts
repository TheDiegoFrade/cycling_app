// Lanzamiento controlado (lo usan coach-chat y monthly-self-report) — el coach llama a Claude (dinero real por
// request) y todavía no está listo para abrirse a toda la base de
// usuarios. Solo estos user_id pueden usarlo mientras tanto. Quitar
// esta lista (o vaciarla) es la forma de abrirlo a todos después.
export const ALLOWED_USER_IDS = new Set([
  '68c9ddae-cee4-4d2f-8d0f-9553f9fe5782', // dperezcf@gmail.com — usuario dummy de pruebas
  '1d868aa6-bd45-4a1a-83aa-7d9f54c8d24b', // andrea.guerrero.guzman@gmail.com
  '95b1f5fc-a167-4c9e-ae16-95d158280c3d', // dpcfrade@gmail.com — dueño de la app y coach
]);
