import { CREW_IDS, type SensorInput } from '../../../lib/api/types';
import { getConsoleFrame, getScenarios, sendSensors } from '../../../server/mock/store';

export async function POST(request: Request) {
  try {
    const payload = await request.json() as SensorInput;
    if (!CREW_IDS.includes(payload.crew)) return Response.json({ error: 'Invalid crew ID' }, { status: 400 });
    if (payload.scenario && payload.scenario !== 'reset_all' && !getScenarios().some(scenario => scenario.id === payload.scenario)) {
      return Response.json({ error: 'Unknown scenario' }, { status: 400 });
    }
    sendSensors(payload);
    return Response.json({ ok: true, frame: getConsoleFrame() });
  } catch {
    return Response.json({ error: 'Invalid sensor payload' }, { status: 400 });
  }
}
