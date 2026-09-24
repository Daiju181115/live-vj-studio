import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useVjStore, FxParams } from '../store/vjStore';

const VISUAL_FX: Array<{ key: keyof FxParams; label: string; color: string }> = [
  { key: 'glowIntensity', label: 'グロウ',   color: '#a855f7' },
  { key: 'blurAmount',    label: 'ブラー',   color: '#22d3ee' },
  { key: 'hueShift',      label: '色相',     color: '#f59e0b' },
  { key: 'cameraSpeed',   label: 'カメラ速度', color: '#10b981' },
];

const AUDIO_FX: Array<{ key: keyof FxParams; label: string; color: string }> = [
  { key: 'reverbMix',  label: 'リバーブ', color: '#6366f1' },
  { key: 'delayMix',   label: 'ディレイ', color: '#22d3ee' },
  { key: 'pitchShift', label: 'ピッチ',   color: '#f43f5e' },
];

interface Pad {
  id: string;
  label: string;
  emoji: string;
  key: string;
  color: string;
}

const PADS: Pad[] = [
  { id: 'flash',  label: 'FLASH',  emoji: '⚡', key: 'q', color: '#fbbf24' },
  { id: 'zoom',   label: 'ZOOM',   emoji: '🔍', key: 'w', color: '#22d3ee' },
  { id: 'blur',   label: 'BLUR',   emoji: '💫', key: 'e', color: '#8b5cf6' },
  { id: 'rhyme',  label: 'RHYME',  emoji: '🎵', key: 'r', color: '#10b981' },
  { id: 'beat',   label: 'BEAT',   emoji: '🥁', key: 'a', color: '#f59e0b' },
  { id: 'spin',   label: 'SPIN',   emoji: '🌀', key: 's', color: '#6366f1' },
  { id: 'drop',   label: 'DROP',   emoji: '💥', key: 'd', color: '#f43f5e' },
  { id: 'star',   label: 'STAR',   emoji: '✨', key: 'f', color: '#ffffff' },
];

export function DJMixerPanel() {
  const { fx, setFx, isLiveActive } = useVjStore();
  const [firingPad, setFiringPad] = useState<string | null>(null);

  const firePad = useCallback((padId: string) => {
    setFiringPad(padId);
    // ライブウィンドウへのブリッジ
    window.api?.sendVJControl({ type: 'triggerPad', key: padId });
    setTimeout(() => setFiringPad(null), 200);
  }, []);

  // キーボードショートカット
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
      const pad = PADS.find(p => p.key === e.key.toLowerCase());
      if (pad) firePad(pad.id);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [firePad]);

  const handleSlider = (key: keyof FxParams, value: number) => {
    setFx(key, value);
    window.api?.sendVJControl({ type: 'fxSlider', key, value });
  };

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '1fr 1fr 1fr',
      gap: '12px',
      padding: '12px',
      background: 'rgba(5, 5, 20, 0.9)',
      border: '1px solid rgba(99, 102, 241, 0.3)',
      borderRadius: '12px',
    }}>

      {/* ヘッダー */}
      <div style={{
        gridColumn: '1 / -1',
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        paddingBottom: '8px',
        borderBottom: '1px solid rgba(255,255,255,0.08)',
      }}>
        <span style={{ fontSize: '13px', fontFamily: "'Space Mono', monospace", color: '#8b8bcc' }}>🎚️ DJ MIXER</span>
        {isLiveActive && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginLeft: 'auto' }}>
            <div className="live-dot" />
            <span style={{ fontFamily: "'Space Mono', monospace", fontSize: '11px', color: '#f43f5e', fontWeight: 700 }}>LIVE</span>
          </div>
        )}
      </div>

      {/* VISUAL FX */}
      <div>
        <p style={{ fontSize: '10px', fontFamily: "'Space Mono', monospace", color: '#4a4a7a', marginBottom: '10px', letterSpacing: '1px' }}>VISUAL FX</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {VISUAL_FX.map(({ key, label, color }) => (
            <div key={key}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                <span style={{ fontSize: '11px', color: '#8b8bcc' }}>{label}</span>
                <span style={{ fontSize: '10px', fontFamily: "'Space Mono', monospace", color }}>{Math.round(fx[key] * 100)}</span>
              </div>
              <input
                className="fx-slider"
                style={{ '--slider-thumb': color } as any}
                type="range" min={0} max={1} step={0.01}
                value={fx[key]}
                onChange={(e) => handleSlider(key, Number(e.target.value))}
              />
            </div>
          ))}
        </div>
      </div>

      {/* AUDIO FX */}
      <div>
        <p style={{ fontSize: '10px', fontFamily: "'Space Mono', monospace", color: '#4a4a7a', marginBottom: '10px', letterSpacing: '1px' }}>AUDIO FX</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {AUDIO_FX.map(({ key, label, color }) => (
            <div key={key}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                <span style={{ fontSize: '11px', color: '#8b8bcc' }}>{label}</span>
                <span style={{ fontSize: '10px', fontFamily: "'Space Mono', monospace", color }}>{Math.round(fx[key] * 100)}</span>
              </div>
              <input
                className="fx-slider"
                style={{ '--slider-thumb': color } as any}
                type="range" min={0} max={1} step={0.01}
                value={fx[key]}
                onChange={(e) => handleSlider(key, Number(e.target.value))}
              />
            </div>
          ))}
        </div>
      </div>

      {/* TRIGGER PADS */}
      <div>
        <p style={{ fontSize: '10px', fontFamily: "'Space Mono', monospace", color: '#4a4a7a', marginBottom: '10px', letterSpacing: '1px' }}>TRIGGER PADS</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px' }}>
          {PADS.map(pad => (
            <button
              key={pad.id}
              className={`trigger-pad ${firingPad === pad.id ? 'firing' : ''}`}
              style={{
                flexDirection: 'column',
                gap: '4px',
                padding: '8px 4px',
                borderColor: firingPad === pad.id ? pad.color : undefined,
                '--pad-color': pad.color,
              } as any}
              onClick={() => firePad(pad.id)}
              title={`[${pad.key.toUpperCase()}]`}
            >
              <span style={{ fontSize: '16px' }}>{pad.emoji}</span>
              <span style={{ fontSize: '9px', letterSpacing: '0.5px' }}>{pad.label}</span>
              <span style={{ fontSize: '8px', color: '#4a4a7a', fontFamily: "'Space Mono', monospace" }}>[{pad.key.toUpperCase()}]</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
