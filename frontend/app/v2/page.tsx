'use client';

import { useEffect, useRef, useState } from 'react';
import { CREW_IDS, type ConsoleMode, type CrewId } from '../../lib/api/types';
import { BodyMapScreen } from '../../components/v2/bodymap/BodyMapScreen';
import { Mode1Screen } from '../../components/v2/mode1/Mode1Screen';
import { Mode2Screen } from '../../components/v2/mode2/Mode2Screen';
import { Mode3Screen } from '../../components/v2/mode3/Mode3Screen';
import { DemoDrawer } from '../../components/v2/shell/DemoDrawer';
import { AlertStrip, TopBar } from '../../components/v2/shell/Header';
import { CrewTabs } from '../../components/v2/shell/CrewTabs';
import { ConsoleProvider, useConsole } from '../../lib/ConsoleProvider';
import { preloadVoskModel, usesOfflineVoiceModel } from '../../lib/speech';
import styles from './page.module.css';

export default function Home() {
  return <ConsoleProvider><Console /></ConsoleProvider>;
}

const viewParam: Record<string, ConsoleMode> = { overview: 'body_map', body: 'body_map', eva: 'mode1', emergency: 'mode2', evening: 'mode3' };

function Console() {
  const { mode, setMode, setCrew } = useConsole();
  const [demoOpen, setDemoOpen] = useState(false);

  // Firefox < 160 has no native speech recognition: warm up the offline Vosk model as soon as
  // the console opens, so "Describe by voice" is ready before anyone reaches the Emergency tab.
  useEffect(() => {
    if (usesOfflineVoiceModel()) preloadVoskModel().catch(() => {});
  }, []);

  // Deep links for demos and slide screenshots: /?view=emergency&crew=B (applied once)
  const deepLinked = useRef(false);
  useEffect(() => {
    if (deepLinked.current) return;
    deepLinked.current = true;
    const params = new URLSearchParams(window.location.search);
    const view = viewParam[params.get('view') ?? ''];
    const crew = params.get('crew')?.toUpperCase();
    if (view) setMode(view);
    if (crew && (CREW_IDS as string[]).includes(crew)) setCrew(crew as CrewId);
    if (params.get('demo') === '1') setDemoOpen(true);
  }, [setMode, setCrew]);
  return (
    <div className={styles.app}>
      <TopBar onOpenDemo={() => setDemoOpen(true)} />
      <div className={styles.body}>
        <CrewTabs />
        <div className={styles.main}>
          <AlertStrip />
          <main className={styles.content} key={mode}>
            {mode === 'body_map' && <BodyMapScreen />}
            {mode === 'mode1' && <Mode1Screen />}
            {mode === 'mode2' && <Mode2Screen />}
            {mode === 'mode3' && <Mode3Screen />}
          </main>
        </div>
      </div>
      <DemoDrawer open={demoOpen} onClose={() => setDemoOpen(false)} />
    </div>
  );
}
