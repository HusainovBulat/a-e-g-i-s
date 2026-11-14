import { getScenarios } from '../../../server/mock/store';

export function GET() {
  return Response.json(getScenarios());
}
