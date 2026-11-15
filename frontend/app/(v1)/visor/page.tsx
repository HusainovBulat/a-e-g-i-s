'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { VisorHud } from '../../../components/v2/visor/VisorHud';
import { ConsoleProvider, useConsole } from '../../../lib/ConsoleProvider';
import { CREW_IDS, type CrewId } from '../../../lib/api/types';
import { visorModel } from '../../../lib/visor';

export default function VisorStandalonePage() {
  return (
    <ConsoleProvider>
      <Suspense fallback={<div style={{ width: '100vw', height: '100vh', background: '#010204' }} />}>
        <VisorView />
      </Suspense>
    </ConsoleProvider>
  );
}

function VisorView() {
  const { frame, crew: consoleCrew } = useConsole();
  const param = useSearchParams().get('crew')?.toUpperCase() as CrewId | undefined;
  const me: CrewId = param && (CREW_IDS as string[]).includes(param) ? param : consoleCrew;
  const model = visorModel(frame, me);

  return (
    <div style={{
      width: '100vw',
      height: '100vh',
      background: '#010204',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
    }}>
      <div style={{ width: '100%', height: '100%', maxWidth: '177.78vh', maxHeight: '56.25vw' }}>
        <VisorHud model={model} />
      </div>
    </div>
  );
}
