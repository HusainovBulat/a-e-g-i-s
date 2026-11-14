'use client';

import React, { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { ConsoleProvider, useConsole } from '../../../lib/ConsoleProvider';
import type { CrewId } from '../../../lib/api/types';

export default function VisorStandalonePage() {
  return (
    <ConsoleProvider>
      <Suspense fallback={<div style={{ color: '#fff', background: '#000', height: '100vh', padding: 20 }}>INITIALIZING VISOR...</div>}>
        <VisorContent />
      </Suspense>
    </ConsoleProvider>
  );
}

function VisorContent() {
  const { frame, crew: contextCrew } = useConsole();
  const searchParams = useSearchParams();
  const paramCrew = searchParams.get('crew')?.toUpperCase() as CrewId | undefined;

  // If URL has ?crew=B, use B; otherwise use global active crew
  const myCrewId: CrewId = (paramCrew && ['A', 'B', 'C', 'D'].includes(paramCrew)) ? paramCrew : contextCrew;
  const myState = frame?.crews ? frame.crews[myCrewId] : null;
  const vitals = myState?.vitals;
  const modelB = myState?.model_b;

  const walkBackMin = modelB?.walk_back_min ?? 24.5;
  const isDizzy = vitals?.dizzy ?? false;

  // Buddy mapping: A <-> B (EVA pair), C <-> D (Base pair)
  const buddyId: CrewId = myCrewId === 'A' ? 'B' : myCrewId === 'B' ? 'A' : myCrewId === 'C' ? 'D' : 'C';
  const buddyState = frame?.crews ? frame.crews[buddyId] : null;

  // Check if Buddy has an active emergency (fall, critical alarm, fall countdown)
  const buddyHasFall = Boolean(buddyState?.vitals?.fall) ||
    (buddyState?.fall_countdown_s !== undefined && buddyState?.fall_countdown_s !== null && buddyState.fall_countdown_s > 0) ||
    Boolean(buddyState?.alarm?.reasons?.some(r => r.toLowerCase().includes('fall') || r.toLowerCase().includes('sos')));

  // Check if current astronaut has fallen
  const selfHasFall = Boolean(vitals?.fall) ||
    (myState?.fall_countdown_s !== undefined && myState?.fall_countdown_s !== null && myState.fall_countdown_s > 0);

  return (
    <div style={{
      width: '100vw',
      height: '100vh',
      background: '#010204',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      alignItems: 'center',
      padding: '40px',
      color: buddyHasFall ? '#FC3D21' : '#4C8DFF',
      fontFamily: 'var(--font-mono)',
      border: buddyHasFall ? '6px solid #FC3D21' : '4px solid #0B3D91',
      transition: 'all 0.3s ease',
    }}>
      <div style={{
        background: buddyHasFall ? 'rgba(30, 5, 5, 0.95)' : '#040914',
        border: buddyHasFall ? '2px solid #FC3D21' : '2px solid #4C8DFF',
        padding: '28px 42px',
        boxShadow: buddyHasFall ? '0 0 60px rgba(252, 61, 33, 0.6)' : '0 0 50px rgba(76, 141, 255, 0.4)',
        textAlign: 'center',
        maxWidth: '850px',
        width: '100%',
      }}>
        <div style={{
          fontSize: '14px',
          letterSpacing: '0.15em',
          color: buddyHasFall ? '#fca5a5' : '#94a3b8',
          marginBottom: '10px',
          display: 'flex',
          justifyContent: 'space-between',
        }}>
          <span>PROJECT A.E.G.I.S. // AR VISOR HUD</span>
          <span>ASTRONAUT [{myCrewId}] · BUDDY [{buddyId}]</span>
        </div>

        {/* CASE 1: BUDDY HAS FALLEN -> RESCUE RADAR ALERT */}
        {buddyHasFall ? (
          <div style={{ padding: '10px 0' }}>
            <div style={{ fontSize: '30px', fontWeight: 900, color: '#FC3D21', marginBottom: '8px' }}>
              🚨 BUDDY DOWN: CREW {buddyId} IMPACT DETECTED!
            </div>
            <div style={{
              fontSize: '44px',
              fontWeight: 900,
              color: '#F5B301',
              background: 'rgba(255, 0, 0, 0.15)',
              padding: '12px 20px',
              border: '1px dashed #FC3D21',
              display: 'inline-block',
              letterSpacing: '0.05em'
            }}>
              ↗ PROCEED TO BUDDY: 34 M · AZ 248°
            </div>
            <div style={{ fontSize: '15px', color: '#fca5a5', marginTop: '12px', fontWeight: 700 }}>
              AUTO-EVAC BEACON LOCKED // PREPARE SUIT RESCUE PROTOCOL
            </div>
          </div>
        ) : selfHasFall || isDizzy ? (
          /* CASE 2: SELF DOWN / DIZZY */
          <div style={{ fontSize: '38px', fontWeight: 900, color: '#FC3D21', padding: '16px 0' }}>
            ⚠️ {selfHasFall ? 'FALL DETECTED · STANDBY FOR RESCUE' : 'STOP · REST'}
          </div>
        ) : (
          /* CASE 3: NOMINAL TRAVERSE */
          <div style={{ fontSize: '42px', fontWeight: 900, color: '#4C8DFF', padding: '10px 0' }}>
            {Math.floor(walkBackMin).toString().padStart(2, '0')}:
            {Math.floor((walkBackMin % 1) * 60).toString().padStart(2, '0')} · STOP 60S · ↗ 34M
          </div>
        )}

        <div style={{
          marginTop: '18px',
          fontSize: '13px',
          color: '#94a3b8',
          display: 'flex',
          justifyContent: 'space-around',
          borderTop: '1px solid rgba(255,255,255,0.1)',
          paddingTop: '14px',
        }}>
          <span>SLOPE: {vitals?.slope ? vitals.slope.toFixed(0) : '12'}°</span>
          <span>HEADING: 248° SW</span>
          <span>O₂ TANK: {modelB?.o2_left_pct ? modelB.o2_left_pct.toFixed(0) : '78'}%</span>
          <span style={{ color: buddyHasFall ? '#FC3D21' : '#4C8DFF', fontWeight: 700 }}>
            BUDDY {buddyId}: {buddyHasFall ? '🔴 EMERGENCY' : '🟢 NOMINAL'}
          </span>
        </div>
      </div>
    </div>
  );
}
