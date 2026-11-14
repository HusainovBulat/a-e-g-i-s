import { CREW_IDS, type TriageRequest } from '../../../lib/api/types';
import { runTriage } from '../../../server/mock/engine';
import { getConsoleFrame } from '../../../server/mock/store';

export async function POST(request: Request) {
  try {
    const payload = await request.json() as TriageRequest;
    if (!CREW_IDS.includes(payload.crew) || !Array.isArray(payload.symptoms)) {
      return Response.json({ error: 'A valid crew and symptom list are required' }, { status: 400 });
    }
    const vitals = { ...getConsoleFrame().crews[payload.crew].vitals, ...payload.vitals };
    return Response.json(runTriage({ ...payload, vitals }));
  } catch {
    return Response.json({ error: 'Invalid triage request' }, { status: 400 });
  }
}
