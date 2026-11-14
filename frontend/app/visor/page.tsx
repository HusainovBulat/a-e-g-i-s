'use client';

import React from 'react';
import { ConsoleProvider, useConsole } from '../../lib/ConsoleProvider';

export default function VisorStandalonePage() {
  return (
    <ConsoleProvider>
      <VisorContent />
    </ConsoleProvider>
  );
}

function VisorContent() {
  const { currentCrew } = useConsole();
  const vitals = currentCrew?.vitals;
  const modelB = currentCrew?.model_b;

  const walkBackMin = modelB?.walk_back_min ?? 24.5;
  const isDizzy = vitals?.dizzy ?? false;

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
      color: '#4C8DFF',
      fontFamily: 'var(--font-mono)',
      border: '4px solid #0B3D91',
    }}>
      <div style={{
        background: '#040914',
        border: '2px solid #4C8DFF',
        padding: '24px 36px',
        boxShadow: '0 0 50px rgba(76, 141, 255, 0.4)',
        textAlign: 'center',
      }}>
        <div style={{ fontSize: '14px', letterSpacing: '0.15em', color: '#94a3b8', marginBottom: '8px' }}>
          PROJECT A.E.G.I.S. // AR VISOR HEAD-UP DISPLAY
        </div>

        {isDizzy ? (
          <div style={{ fontSize: '38px', fontWeight: 900, color: '#FC3D21' }}>
            ⚠️ STOP · REST
          </div>
        ) : (
          <div style={{ fontSize: '42px', fontWeight: 900, color: '#4C8DFF' }}>
            {Math.floor(walkBackMin).toString().padStart(2, '0')}:
            {Math.floor((walkBackMin % 1) * 60).toString().padStart(2, '0')} · STOP 60S · ↗ 34M
          </div>
        )}

        <div style={{ marginTop: '14px', fontSize: '13px', color: '#94a3b8', display: 'flex', justifyContent: 'space-around' }}>
          <span>SLOPE: {vitals?.slope ? vitals.slope.toFixed(0) : '12'}°</span>
          <span>HEADING: 248° SW</span>
          <span>O₂ TANK: {modelB?.o2_left_pct ? modelB.o2_left_pct.toFixed(0) : '78'}%</span>
        </div>
      </div>
    </div>
  );
}
