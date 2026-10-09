// Prueba de punta a punta en el navegador: cuestionario inicial + crear plan,
// con la sesión del dummy, contra el Supabase de producción.
//
// 1. Levanta el frontend con las variables de producción:
//      VITE_SUPABASE_URL=$SUPABASE_URL VITE_SUPABASE_ANON_KEY=$SUPABASE_ANON_KEY npx vite --port 5180
// 2. node scripts/coach-sim/ui-test.mjs [carpeta-de-capturas]
//
// Crea un plan real (manda la bienvenida al correo del dummy): al terminar,
// dalo de baja con `node scripts/coach-sim/retire.mjs`. Usa la sesión del
// dummy inyectada en localStorage (sin contraseña), igual que lib.mjs.
import fs from 'node:fs';
import { DUMMY_EMAIL, REF, URL_ } from './lib.mjs';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const BASE_URL = process.env.BASE_URL ?? 'http://localhost:5180';
const shots = process.argv[2] ?? new URL('./out/ui', import.meta.url).pathname;
fs.mkdirSync(shots, { recursive: true });

const svc = { apikey: process.env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json' };
async function dummySession() {
  for (let attempt = 1; attempt <= 6; attempt++) {
    const g = await fetch(`${URL_}/auth/v1/admin/generate_link`, { method: 'POST', headers: svc, body: JSON.stringify({ type: 'magiclink', email: DUMMY_EMAIL }) }).then((r) => r.json());
    const v = await fetch(`${URL_}/auth/v1/verify`, {
      method: 'POST',
      headers: { apikey: process.env.SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'magiclink', token_hash: g.hashed_token ?? g.properties?.hashed_token }),
    }).then((r) => r.json());
    if (v.access_token) return { ...v, expires_at: Math.floor(Date.now() / 1000) + v.expires_in };
    await new Promise((r) => setTimeout(r, 15000)); // otp_expired: reintenta
  }
  throw new Error('no se pudo abrir sesión del dummy');
}

const session = await dummySession();
const browser = await chromium.launch();
const pg = await browser.newPage({ viewport: { width: 1280, height: 900 } });
pg.on('dialog', (d) => { console.log('dialog:', d.message().slice(0, 120)); void d.accept(); });
pg.on('pageerror', (e) => console.log('pageerror', e.message));
await pg.addInitScript(([key, s]) => localStorage.setItem(key, JSON.stringify(s)), [`sb-${REF}-auth-token`, session]);

await pg.goto(`${BASE_URL}/#/plan`);
await pg.waitForSelector('#coach-open-create', { timeout: 30000 });
await pg.click('#coach-open-create');

// El cuestionario solo sale si al perfil le falta algo.
if (await pg.waitForSelector('#onboarding-modal', { timeout: 5000 }).catch(() => null)) {
  console.log('cuestionario:', await pg.textContent('#ob-title'));
  await pg.locator('#onboarding-modal').screenshot({ path: `${shots}/1-cuestionario.png` });
  const submit = async (label) => {
    await pg.click('#onboarding-submit');
    await pg.waitForTimeout(300);
    console.log(label, await pg.textContent('#onboarding-status').catch(() => '(cerrado)'));
  };
  await submit('guardar sin tocar →');
  await pg.click('[data-sex="M"]');
  await pg.evaluate(() => {
    const i = document.querySelector('#ob-birth-date');
    i.value = '1992-03-15';
    i.dispatchEvent(new Event('change'));
  });
  await pg.fill('#ob-weight', '78');
  await pg.fill('#ob-height', '178');
  await pg.click('[data-level="returning_or_new_to_app"]');
  await pg.click('[data-level="active_cyclist"]');
  await pg.fill('#ob-years', '4');
  await pg.fill('#ob-structured-years', '1');
  await pg.click('[data-discipline="road"]');
  await pg.evaluate(() => {
    for (const id of ['#ob-no-ftp', '#ob-no-hrmax', '#ob-no-injuries']) {
      const c = document.querySelector(id);
      if (!c.checked) c.click();
    }
  });
  await submit('sin mejor resultado →');
  await pg.fill('#ob-best-result', 'Gran fondo de 100 km en 4 h');
  await submit('completo →');
}

await pg.waitForSelector('#coach-modal-backdrop', { timeout: 15000 });
await pg.fill('#coach-goal', 'Quiero terminar un gran fondo de 120 km en marzo con mejor ritmo que el anterior');
for (const d of ['tue', 'thu', 'sat', 'sun']) await pg.click(`#coach-days [data-day="${d}"]`);
await pg.fill('#coach-hours', '6');
await pg.fill('#coach-max-minutes', '60');
await pg.screenshot({ path: `${shots}/2-crear.png` });

// Espera la respuesta de coach-chat (create_plan tarda 1-3 min), no el texto
// de estado: «Revisando tu historial…» parece un error si se busca «revisa».
const response = pg.waitForResponse((r) => r.url().includes('/functions/v1/coach-chat'), { timeout: 300000 });
await pg.click('#coach-submit');
const r = await response;
console.log('coach-chat HTTP', r.status(), JSON.stringify(await r.json().catch(() => null)).slice(0, 600));
await pg.waitForTimeout(3000);
await pg.screenshot({ path: `${shots}/3-plan.png` });
await browser.close();
