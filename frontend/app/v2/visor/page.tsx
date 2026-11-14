'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { VisorHud } from '../../../components/v2/visor/VisorHud';
import { ConsoleProvider, useConsole } from '../../../lib/ConsoleProvider';
import { CREW_IDS, type CrewId } from '../../../lib/api/types';
import { visorModel } from '../../../lib/visor';
import styles from './visor.module.css';

export default function VisorPage() {
  return (
    <ConsoleProvider>
      <Suspense fallback={<div className={styles.screen} />}>
        <Visor />
      </Suspense>
    </ConsoleProvider>
  );
}

function Visor() {
  const { frame, crew: consoleCrew } = useConsole();
  const param = useSearchParams().get('crew')?.toUpperCase() as CrewId | undefined;
  const me: CrewId = param && CREW_IDS.includes(param) ? param : consoleCrew;
  return (
    <div className={styles.screen}>
      <VisorHud model={visorModel(frame, me)} />
    </div>
  );
}
