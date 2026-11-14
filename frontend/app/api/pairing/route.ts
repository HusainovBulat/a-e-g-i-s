import { CREW_IDS, type CrewId } from '../../../lib/api/types';

export function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const requestedCrew = requestUrl.searchParams.get('crew') as CrewId | null;
  const crew = requestedCrew && CREW_IDS.includes(requestedCrew) ? requestedCrew : 'A';
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host') ?? requestUrl.host;
  const protocol = request.headers.get('x-forwarded-proto') ?? requestUrl.protocol.replace(':', '');
  return Response.json({ url: `${protocol}://${host}/phone?crew=${crew}`, crew });
}
