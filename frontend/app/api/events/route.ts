import { CREW_IDS, type ConsoleEventInput, type ConsoleEventType } from '../../../lib/api/types';
import { postConsoleEvent } from '../../../server/mock/store';

const eventTypes: ConsoleEventType[] = ['alarm_jump_to_emergency', 'visor_instruction', 'ack', 'commander_decision', 'routine_prompt'];

export async function POST(request: Request) {
  try {
    const payload = await request.json() as ConsoleEventInput;
    if (!CREW_IDS.includes(payload.crew) || !eventTypes.includes(payload.type) || typeof payload.text !== 'string') {
      return Response.json({ error: 'Invalid console event' }, { status: 400 });
    }
    postConsoleEvent(payload);
    return Response.json({ ok: true });
  } catch {
    return Response.json({ error: 'Invalid event payload' }, { status: 400 });
  }
}
