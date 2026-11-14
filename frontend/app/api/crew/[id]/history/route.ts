import { CREW_IDS, type CrewId } from '../../../../../lib/api/types';
import { getCrewHistory } from '../../../../../server/mock/store';

export function GET(_request: Request, { params }: { params: { id: string } }) {
  const id = params.id.replace(/^crew[_-]?/i, '').toUpperCase() as CrewId;
  if (!CREW_IDS.includes(id)) return Response.json({ error: 'Unknown crew member' }, { status: 404 });
  return Response.json(getCrewHistory(id));
}
