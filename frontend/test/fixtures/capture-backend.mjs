// Re-captures real Base Server responses used by the contract tests.
//   1) start the backend (start.bat / docker compose up)   2) node test/fixtures/capture-backend.mjs
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const API = process.env.AEGIS_API ?? 'http://localhost:8000';
const OUT = join(dirname(fileURLToPath(import.meta.url)), 'backend');
const save = (name, data) => writeFileSync(join(OUT, `${name}.json`), JSON.stringify(data, null, 2) + '\n');
const post = (path, body) =>
  fetch(API + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(r => r.json());
const sleep = ms => new Promise(r => setTimeout(r, ms));

await post('/reset', {});
const ws = new WebSocket(API.replace(/^http/, 'ws') + '/ws/console');
const messages = [];
ws.onmessage = e => messages.push(JSON.parse(e.data));
await new Promise(r => (ws.onopen = r));
await sleep(500);

await post('/scenarios/steep_climb/play', { crew: 'Crew_A', rate_hz: 1 });
await sleep(40000);
await post('/scenarios/chest_pain/play', { crew: 'Crew_B', rate_hz: 1 });
await sleep(2000);
await post('/sensors', { type: 'fall', crew: 'Crew_C' });
await sleep(500);
await post('/scenarios/stop', { crew: 'Crew_A' });
await post('/scenarios/stop', { crew: 'Crew_B' });
await post('/events', { type: 'ack', crew: 'Crew_C' });

const first = type => messages.find(m => m.type === type);
const lastState = crew => [...messages].reverse().find(m => m.type === 'state' && m.crew === crew);
save('ws_hello', first('hello'));
save('ws_state_steep_climb', lastState('Crew_A'));
save('ws_alarm_chest_pain', first('alarm_jump_to_emergency'));
save('ws_event', first('event'));
save('ws_fall_countdown', first('fall_countdown'));

const triage = await post('/triage', {
  crew: 'Crew_A',
  vitals: { hr: 118, sys: 82, dia: 50, spo2: 94.5, resp: 24, st: 0.286, temp: 36.8 },
  symptom_flags: { chest_pain: true, cold_sweat: true, dizzy: true },
});
save('triage_chest_pain', triage);
const evening = await post('/evening', {
  crew: 'Crew_A', sleep: 9, energy: 9, mood: 9, pain_free: 9, nutrition: 9,
  blood_sugar_mgdl: 108, bp_sys: 118, bp_dia: 76, temp: 36.8, completed_quests: ['hydration'],
});
save('evening_masking', evening);
save('summary_from_backend_evening', await post('/summary', { evening, crew: 'Crew_A', offline: true }));
save('history_crew_a', await fetch(API + '/crew/Crew_A/history').then(r => r.json()));
save('pairing', await fetch(API + '/api/pairing?crew=A').then(r => r.json()));
ws.close();
await post('/reset', {});
console.log('saved fixtures to', OUT);
