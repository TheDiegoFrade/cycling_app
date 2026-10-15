// Lanzamiento controlado (lo usan coach-chat y monthly-self-report) — el coach llama a Claude (dinero real por
// request) y todavía no está listo para abrirse a toda la base de
// usuarios. Solo estos user_id pueden usarlo mientras tanto. Quitar
// esta lista (o vaciarla) es la forma de abrirlo a todos después.
export const ALLOWED_USER_IDS = new Set([
  '68c9ddae-cee4-4d2f-8d0f-9553f9fe5782', // dperezcf@gmail.com — usuario dummy de pruebas
  '1d868aa6-bd45-4a1a-83aa-7d9f54c8d24b', // andrea.guerrero.guzman@gmail.com
  '95b1f5fc-a167-4c9e-ae16-95d158280c3d', // dpcfrade@gmail.com — dueño de la app y coach
  '85983750-01e5-449f-adb6-0a87c7047682', // joemtb03@gmail.com — Joe Hernández, entrenador (UR Training)
  'cef1d388-39f1-4216-ab5d-8c272c323f73', // diego.sanchez.c95@gmail.com
  'b73d7ff9-adcb-494a-98fb-c94fdc509b3b', // joemtb03+pruebas@gmail.com — cuenta de pruebas de Joe (sin topes, ver coach-testers.ts)
]);
