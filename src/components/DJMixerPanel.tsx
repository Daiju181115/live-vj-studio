import React, { useEffect, useCallback, useState } from 'react';
import { useVjStore, FxParams } from '../store/vjStore';
import { getEffectEngine, EffectId } from '../engine/EffectEngine';
import { VISUAL_PRESETS, PRESET_IDS, PresetId } from '../engine/VisualPresets';

const VISUAL_FX: Array<{ key: keyof FxParams; label: string; color: string }> = [
  { key: 'glowIntensity', label: 'グロウ',    color: '#a855f7' },
  { key: 'blurAmount',    label: 'ブラー',    color: '#22d3ee' },
  { key: 'hueShift',      label: '色相',      color: '#f59e0b' },
  { key: 'cameraSpeed',   label: 'カメラ速度', color: '#10b981' },
];

const AUDIO_FX: Array<{ key: keyof FxParams; label: string; color: string }> = [
  { key: 'reverbMix',  label: 'リバーブ', color: '#6366f1' },
  { key: 'delayMix',   label: 'ディレイ', color: '#22d3ee' },
  { key: 'pitchShift', label: 'ピッチ',   color: '#f43f5e' },
];

interface PadDef {
  id: EffectId;
  label: string;
  emoji: string;
  key: string;
  color: string;
}

const PADS: PadDef[] = [
  { id: 'flash', label: 'FLASH', emoji: '⚡', key: 'q', color: '#fbbf24' },
  { id: 'zoom',  label: 'ZOOM',  emoji: '🔍', key: 'w', color: '#22d3ee' },
  { id: 'blur',  label: 'BLUR',  emoji: '💫', key: 'e', color: '#8b5cf6' },
  { id: 'rhyme', label: 'RHYME', emoji: '🎵', key: 'r', color: '#10b981' },
  { id: 'beat',  label: 'BEAT',  emoji: '🥁', key: 'a', color: '#f59e0b' },
  { id: 'spin',  label: 'SPIN',  emoji: '🌀', key: 's', color: '#6366f1' },
  { id: 'drop',  label: 'DROP',  emoji: '💥', key: 'd', color: '#f43f5e' },
  { id: 'star',  label: 'STAR',  emoji: '✨', key: 'f', color: '#ffffff' },
];

export function DJMixerPanel() {
  const { fx, setFx, isLiveActive } = useVjStore();
  const [firingPad, setFiringPad] = useState<string | null>(null);
  const [currentPreset, setCurrentPreset] = useState<PresetId>('cyber');

  const firePad = useCallback((padId: EffectId) => {
    setFiringPad(padId);
    // ローカルのEffectEngineにも直接発火（メインウィンドウ側プレビュー用）
    getEffectEngine().fire(padId);
    // ライブウィンドウへブリッジ
    window.api?.sendVJControl?.({ type: 'triggerPad', key: padId });
    setTimeout(() => setFiringPad(null), 180);
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
    window.api?.sendVJControl?.({ type: 'fxSlider', key, value });
  };

  const handlePreset = (id: PresetId) => {
    setCurrentPreset(id);
    window.api?.sendVJControl?.({ type: 'themeChange', key: id });
  };

  return (
    <div style={{
      background: 'rgba(5, 5, 20, 0.95)',
      border: '1px solid rgba(99, 102, 241, 0.35)',
      borderRadius: '12px',
      padding: '12px',
      display: 'flex',
      flexDirection: 'column',
      gap: '12px',
    }}>
      {/* ヘッダー */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', paddingBottom: '8px', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
        <span style={{ fontSize: '12px', fontFamily: "'Space Mono', monospace", color: '#8b8bcc' }}>🎚️ DJ MIXER</span>
        {isLiveActive && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginLeft: 'auto' }}>
            <div className="live-dot" />
            <span style={{ fontFamily: "'Space Mono', monospace", fontSize: '10px', color: '#f43f5e', fontWeight: 700 }}>LIVE</span>
          </div>
        )}
      </div>

      {/* ── ビジュアルプリセット ── */}
      <div>
        <p style={{ fontSize: '9px', fontFamily: "'Space Mono', monospace", color: '#4a4a7a', marginBottom: '7px', letterSpacing: '1px' }}>VISUAL PRESET</p>
        <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
          {PRESET_IDS.map(id => {
            const p = VISUAL_PRESETS[id];
            const isActive = currentPreset === id;
            return (
              <button
                key={id}
                onClick={() => handlePreset(id)}
                style={{
                  padding: '5px 10px',
                  borderRadius: '6px',
                  border: `1px solid ${isActive ? p.accentColor : 'rgba(255,255,255,0.1)'}`,
                  background: isActive ? `${p.accentColor}22` : 'transparent',
                  color: isActive ? p.accentColor : '#4a4a7a',
                  fontFamily: "'Space Mono', monospace",
                  fontSize: '9px',
                  cursor: 'pointer',
                  letterSpacing: '0.5px',
                  transition: 'all 0.15s',
                  boxShadow: isActive ? `0 0 10px ${p.accentColor}44` : 'none',
                }}
              >
                {p.emoji} {p.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── メインコントロールグリッド ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>

        {/* VISUAL FX */}
        <div>
          <p style={{ fontSize: '9px', fontFamily: "'Space Mono', monospace", color: '#4a4a7a', marginBottom: '8px', letterSpacing: '1px' }}>VISUAL FX</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {VISUAL_FX.map(({ key, label, color }) => (
              <div key={key}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px' }}>
                  <span style={{ fontSize: '10px', color: '#8b8bcc' }}>{label}</span>
                  <span style={{ fontSize: '9px', fontFamily: "'Space Mono', monospace", color }}>{Math.round(fx[key] * 100)}</span>
                </div>
                <input
                  className="fx-slider"
                  style={{ '--slider-thumb': color } as any}
                  type="range" min={0} max={1} step={0.01}
                  value={fx[key]}
                  onChange={e => handleSlider(key, Number(e.target.value))}
                />
              </div>
            ))}
          </div>
        </div>

        {/* AUDIO FX */}
        <div>
          <p style={{ fontSize: '9px', fontFamily: "'Space Mono', monospace", color: '#4a4a7a', marginBottom: '8px', letterSpacing: '1px' }}>AUDIO FX</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {AUDIO_FX.map(({ key, label, color }) => (
              <div key={key}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px' }}>
                  <span style={{ fontSize: '10px', color: '#8b8bcc' }}>{label}</span>
                  <span style={{ fontSize: '9px', fontFamily: "'Space Mono', monospace", color }}>{Math.round(fx[key] * 100)}</span>
                </div>
                <input
                  className="fx-slider"
                  style={{ '--slider-thumb': color } as any}
                  type="range" min={0} max={1} step={0.01}
                  value={fx[key]}
                  onChange={e => handleSlider(key, Number(e.target.value))}
                />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── TRIGGER PADS ── */}
      <div>
        <p style={{ fontSize: '9px', fontFamily: "'Space Mono', monospace", color: '#4a4a7a', marginBottom: '7px', letterSpacing: '1px' }}>TRIGGER PADS  <span style={{ color: '#2a2a4a' }}>[ Q W E R / A S D F ]</span></p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '5px' }}>
          {PADS.map(pad => {
            const isFiring = firingPad === pad.id;
            return (
              <button
                key={pad.id}
                className={`trigger-pad ${isFiring ? 'firing' : ''}`}
                onClick={() => firePad(pad.id)}
                title={`[${pad.key.toUpperCase()}]`}
                style={{
                  flexDirection: 'column',
                  gap: '3px',
                  padding: '8px 4px',
                  borderColor: isFiring ? pad.color : undefined,
                  boxShadow: isFiring ? `0 0 16px ${pad.color}88` : undefined,
                  transition: 'all 0.1s',
                } as any}
              >
                <span style={{ fontSize: '18px', lineHeight: 1 }}>{pad.emoji}</span>
                <span style={{ fontSize: '8px', letterSpacing: '0.5px', color: isFiring ? '#fff' : '#8b8bcc' }}>{pad.label}</span>
                <span style={{ fontSize: '7px', color: '#2a2a4a', fontFamily: "'Space Mono', monospace" }}>[{pad.key.toUpperCase()}]</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
