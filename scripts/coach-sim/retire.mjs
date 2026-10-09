import { fn, sql, DUMMY_ID } from './lib.mjs';
const r = await fn('coach-retire-plan', { status: 'abandoned' });
console.log('retire', r.status, JSON.stringify(r.body).slice(0, 200));
console.log(JSON.stringify(await sql(`select (select count(*) from training_plans where user_id='${DUMMY_ID}' and status='active') active, (select count(*) from workouts where user_id='${DUMMY_ID}') wk`)));
