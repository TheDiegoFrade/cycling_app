// Descarga los recursos de marca en alta resolución (Higgsfield) a public/brand/.
// Uso: node scripts/fetch-brand-assets.mjs
// Los .webp que ya vienen en public/brand/ son versiones chicas de respaldo;
// este script los reemplaza por los originales (objetos 1024 px con fondo
// transparente, escena 2688 × 1520). Si la red bloquea el dominio, corre el
// script en tu computadora y sube los archivos al repo.
import { mkdir, writeFile } from 'node:fs/promises';

const BASE = 'https://d8j0ntlcm91z4.cloudfront.net/user_3J45IBavaZOdO3BUDEyFeizX9Pl/';

/** archivo destino → nombre del original en Higgsfield (versión webp) */
const ASSETS = {
  'escena-hoy.webp': 'hf_20261015_032214_1faade25-5e59-4a50-9a2a-c2575e9d5b85_min.webp',
  'logo-torq.webp': 'hf_20261015_050008_f261a19e-0352-4c15-8df8-79b292e585f4_min.webp',
  'obj-end.webp': 'hf_20261015_032759_4fafd389-009d-4023-83c2-8c00f751791d_min.webp',
  'obj-ss.webp': 'hf_20261015_032800_66f33114-a3f9-4fa4-accb-da22b0b036d7_min.webp',
  'obj-ftp.webp': 'hf_20261015_032824_7ba82e0e-d986-4ef5-a6f4-56678ebd6f22_min.webp',
  'obj-vo2.webp': 'hf_20261015_032823_9b70b2b6-b2c1-410f-9dfd-aaef58009094_min.webp',
  'obj-rec.webp': 'hf_20261015_032848_f2e92ddc-f77c-4642-8aaa-d1d44f9b392e_min.webp',
  'obj-trainer.webp': 'hf_20261015_032847_421cd4fa-8411-4945-860e-10453a087b01_min.webp',
  'obj-hr.webp': 'hf_20261015_032913_e7a7ebd8-4c5f-449b-9d84-40bceb3c2966_min.webp',
  'obj-bolt.webp': 'hf_20261015_032913_e7ac2d4c-c332-4304-a04f-5b062529e94e_min.webp',
  'obj-moon.webp': 'hf_20261015_032935_b80b2ec7-0e96-4499-a1b7-d3dc1cfba89b_min.webp',
  'obj-trophy.webp': 'hf_20261015_032936_505599d6-6f4f-47ef-8584-ffe7686dd4d6_min.webp',
  // Fondo «Montañas» del login (video de Kling y su primer cuadro):
  'login-montanas.mp4': 'hf_20261015_045150_4829c7af-e102-4dcb-b160-0b017ac4a1a1.mp4',
  // Opcional, para la landing/login (escena del hombre subiéndose al rodillo):
  'login-subirse.mp4': 'hf_20261015_044738_7cb649a3-c53d-4ae5-8a56-085ef7441e2c.mp4',
  'login-escena-hombre.webp': 'hf_20261015_044343_6e6c6ac7-126e-439c-be11-ba500f3d1fb4_min.webp',
};

const dir = new URL('../public/brand/', import.meta.url);
await mkdir(dir, { recursive: true });

let failed = 0;
for (const [file, remote] of Object.entries(ASSETS)) {
  try {
    const res = await fetch(BASE + remote);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    await writeFile(new URL(file, dir), buf);
    console.log(`ok  ${file}  ${(buf.length / 1024).toFixed(0)} KB`);
  } catch (err) {
    failed++;
    console.error(`ERR ${file}: ${err.message}`);
  }
}
process.exit(failed ? 1 : 0);
