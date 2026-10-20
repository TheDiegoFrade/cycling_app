// Cuentas de cortesía: el equipo y las cuentas de pruebas tienen la IA sin
// suscripción. Antes era la lista de lanzamiento controlado (solo estas
// cuentas podían usar la IA); ahora el acceso lo decide _shared/access.ts
// (suscripción, coach o atleta con coach) y esta lista solo suma cortesías.
export const COMP_USER_IDS = new Set([
  '68c9ddae-cee4-4d2f-8d0f-9553f9fe5782', // dperezcf@gmail.com — usuario dummy de pruebas
  '1d868aa6-bd45-4a1a-83aa-7d9f54c8d24b', // andrea.guerrero.guzman@gmail.com
  '95b1f5fc-a167-4c9e-ae16-95d158280c3d', // dpcfrade@gmail.com — dueño de la app y coach
  '85983750-01e5-449f-adb6-0a87c7047682', // joemtb03@gmail.com — Joe Hernández, entrenador (UR Training)
  'cef1d388-39f1-4216-ab5d-8c272c323f73', // diego.sanchez.c95@gmail.com
  'b73d7ff9-adcb-494a-98fb-c94fdc509b3b', // joemtb03+pruebas@gmail.com — cuenta de pruebas de Joe (sin topes, ver coach-testers.ts)
]);

// Administradores: ven la lista de espera e invitan gente (admin-waitlist).
export const ADMIN_USER_IDS = new Set([
  '95b1f5fc-a167-4c9e-ae16-95d158280c3d', // dpcfrade@gmail.com — dueño de la app
]);
