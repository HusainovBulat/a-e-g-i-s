import { CREW_IDS, type EveningRequest } from '../../../lib/api/types';
import { runEvening } from '../../../server/mock/engine';
import { getConsoleFrame } from '../../../server/mock/store';

export async function POST(request: Request) {
  try {
    const payload = await request.json() as EveningRequest;
    if (!CREW_IDS.includes(payload.crew) || !payload.answers) {
      return Response.json({ error: 'A valid crew and check-in answers are required' }, { status: 400 });
    }
    const fatigue_score = payload.fatigue_score ?? getConsoleFrame().crews[payload.crew].model_a.fatigue_score;
    return Response.json(runEvening({ ...payload, fatigue_score }));
  } catch {
    return Response.json({ error: 'Invalid evening check-in' }, { status: 400 });
  }
}
