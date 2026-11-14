import { getRouteProfile } from '../../../server/mock/store';

export function GET() {
  return Response.json(getRouteProfile());
}
