import { runSummary } from '../../../server/mock/engine';
import type { EveningResponse } from '../../../lib/api/types';

export async function POST(request: Request) {
  try {
    const payload = await request.json() as EveningResponse;
    if (typeof payload.readiness_score !== 'number' || typeof payload.mismatch_detected !== 'boolean') {
      return Response.json({ error: 'A valid evening result is required' }, { status: 400 });
    }
    return Response.json(runSummary(payload));
  } catch {
    return Response.json({ error: 'Invalid summary request' }, { status: 400 });
  }
}
