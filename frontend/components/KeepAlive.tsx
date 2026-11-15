'use client';

import { useEffect } from 'react';

import { getApiBase } from '../lib/api/client';
import { startKeepAlive } from '../lib/keepAlive';

/** Keeps a sleeping cloud Base Server (Render free tier) awake while any page is open. */
export function KeepAlive() {
  useEffect(() => startKeepAlive({ apiBase: getApiBase() }), []);
  return null;
}
