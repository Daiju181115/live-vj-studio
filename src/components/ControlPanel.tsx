import React, { useEffect, useRef, useState } from 'react';
import { useVjStore } from '../store/vjStore';
import { DJMixerPanel } from './DJMixerPanel';
import { ChatTriggerPanel } from './ChatTriggerPanel';
import { useAudioEngine } from '../hooks/useAudioEngine';

export function ControlPanel() {
  const {
    audioPath, setAudioPath, isProcessing, processStep,
    segments, durationSec, setSegments, setRhymePairs,
    setProcessing, clearProcessing, isLiveActive, setLiveActive,
    isPlaying, currentTime, fx, setFx,
  } = useVjStore();

  const { loadAudioFile, play, pause, seek, getEngine } = useAudioEngine();

  const [urlInput, setUrlInput] = useState('');
  const [displays, setDisplays] = useState<any[]>([]);
  const [selectedDisplay, setSelectedDisplay] = useState<number | undefined>();

  // ステムレベル表示用（高頻度更新 → ref + setInterval）
  const [stemLevels, setStemLevels] = useState({ vocal: 0, drum: 0, bass: 0, other: 0 });
  const [bpm, setBpm] = useState(0);

  // ステムレベルの定期読み取り（100ms ごと）
  useEffect(() => {
    const id = setInterval(() => {
      const engine = getEngine();
      setStemLevels({ ...engine.stemLevels as any });
      if (engine.bpm > 40) setBpm(engine.bpm);
    }, 100);
    return () => clearInterval(id);
  }, [getEngine]);

  // ── IPC イベント購読 ─────────────────────────────────────────

  useEffect(() => {
    const unsubResult = window.api?.onResult?.((data) => {
      setSegments(data.segments as any);
      clearProcessing();
      // 韻検出を自動実行
      if (data.segments?.length) {
        window.api?.detectRhymes?.({ segments: data.segments });
      }
    });
    const unsubRhymes = window.api?.onRhymesResult?.((data) => {
      setRhymePairs(data.pairs as any);
    });
    const unsubDownload = window.api?.onDownloadResult?.((data) => {
      setAudioPath(data.audioPath);
      runAnalysis(data.audioPath);
      loadAudioFile(data.audioPath).catch(console.error);
    });
    const unsubProgress = window.api?.onProgress?.((data) => {
      setProcessing(data.step);
    });
    const unsubError = window.api?.onError?.((err) => {
      clearProcessing();
      console.error('[ControlPanel] Error:', err.message);
    });

    return () => {
      unsubResult?.();
      unsubRhymes?.();
      unsubDownload?.();
      unsubProgress?.();
      unsubError?.();
    };
  }, []);

  const handleOpenFile = async () => {
    const p = await window.api?.openFileDialog?.();
    if (!p) return;
    setAudioPath(p);
    await runAnalysis(p);
    await loadAudioFile(p);
  };

  const handleDownloadUrl = async () => {
    if (!urlInput.trim()) return;
    const tmpDir = 'C:/Users/fuuch/projects/live-vj-studio/_tmp';
    setProcessing('ダウンロード中...');
    await window.api?.downloadUrl?.({ url: urlInput, outputDir: tmpDir });
  };

  const runAnalysis = async (path: string) => {
    setProcessing('Whisper 解析中...');
    await window.api?.startAnalysis?.({ audioPath: path });
  };

  const handleOpenLive = async () => {
    const res = await window.api?.openLiveWindow?.(selectedDisplay);
    if (res?.success) setLiveActive(true);
  };

  const handleRefreshDisplays = async () => {
    const list = await window.api?.getDisplays?.();
    if (list) setDisplays(list);
  };

  const handlePlayPause = () => {
    if (isPlaying) pause();
    else play();
  };

  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${String(s).padStart(2, '0')}`;
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%', background: 'var(--bg-void)', overflow: 'hidden' }}>

      {/* ── ヘッダー ── */}
      <header style={{
        display: 'flex', alignItems: 'center', gap: '12px',
        padding: '10px 16px', borderBottom: '1px solid rgba(99, 102, 241, 0.2)',
        flexShrink: 0, background: 'var(--bg-deep)',
      }}>
        <h1 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--accent-cyber)', fontFamily: "'Space Mono', monospace", letterSpacing: '2px' }}>
          VJ STUDIO
        </h1>
        <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>v0.1.0</span>

        {bpm > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '2px 10px', background: 'rgba(34,211,238,0.1)', borderRadius: '20px', border: '1px solid rgba(34,211,238,0.3)' }}>
            <span style={{ fontSize: '11px', color: '#22d3ee', fontFamily: "'Space Mono', monospace" }}>♩ {bpm} BPM</span>
          </div>
        )}

        <button className="btn-neon" onClick={handleOpenFile} style={{ marginLeft: 'auto' }}>📂 ファイルを開く</button>
        <div style={{ display: 'flex', gap: '6px' }}>
          <input value={urlInput} onChange={e => setUrlInput(e.target.value)}
            placeholder="YouTube / SoundCloud URL..."
            style={{ padding: '6px 12px', background: 'var(--bg-input)', border: '1px solid var(--border-subtle)', borderRadius: '6px', color: 'var(--text-primary)', fontSize: '12px', width: '240px' }} />
          <button className="btn-neon" onClick={handleDownloadUrl}>⬇ 取込み</button>
        </div>
      </header>

      {/* ── メインエリア ── */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden', gap: '12px', padding: '12px' }}>

        {/* 左: 解析状況 + 再生コントロール + セクション */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '12px', overflow: 'auto' }}>

          {/* 処理ステータス */}
          {isProcessing && (
            <div className="glass-card" style={{ padding: '12px', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ width: '16px', height: '16px', border: '2px solid var(--accent-cyber)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
              <span style={{ fontSize: '13px', color: 'var(--accent-cyber)' }}>{processStep}</span>
            </div>
          )}

          {/* 再生コントロール + ステムレベル */}
          {audioPath && (
            <div className="glass-card" style={{ padding: '14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
                <button
                  className="btn-neon"
                  onClick={handlePlayPause}
                  style={{ fontSize: '18px', padding: '8px 20px', borderColor: isPlaying ? 'var(--accent-hot)' : 'var(--accent-cyber)' }}
                >
                  {isPlaying ? '⏸' : '▶'}
                </button>
                <div style={{ flex: 1 }}>
                  <input
                    type="range" min={0} max={durationSec} step={0.1}
                    value={currentTime}
                    onChange={(e) => seek(Number(e.target.value))}
                    className="fx-slider"
                    style={{ width: '100%', '--slider-thumb': '#22d3ee' } as any}
                  />
                </div>
                <span style={{ fontFamily: "'Space Mono', monospace", fontSize: '12px', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                  {formatTime(currentTime)} / {formatTime(durationSec)}
                </span>
              </div>

              {/* ステムレベルメーター */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' }}>
                {([
                  { key: 'drum', label: 'DRUM', color: '#f43f5e' },
                  { key: 'bass', label: 'BASS', color: '#f59e0b' },
                  { key: 'vocal', label: 'VOCAL', color: '#22d3ee' },
                  { key: 'other', label: 'OTHER', color: '#a855f7' },
                ] as const).map(({ key, label, color }) => (
                  <div key={key}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px' }}>
                      <span style={{ fontSize: '9px', fontFamily: "'Space Mono', monospace", color: '#4a4a7a', letterSpacing: '1px' }}>{label}</span>
                      <span style={{ fontSize: '9px', fontFamily: "'Space Mono', monospace", color }}>{Math.round(stemLevels[key] * 100)}</span>
                    </div>
                    <div style={{ height: '4px', background: 'rgba(255,255,255,0.05)', borderRadius: '2px', overflow: 'hidden' }}>
                      <div className="stem-bar" style={{ width: `${Math.min(100, stemLevels[key] * 800)}%`, background: color }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 歌詞セグメント一覧 */}
          {segments.length > 0 && (
            <div className="glass-card" style={{ padding: '12px' }}>
              <p style={{ fontSize: '12px', fontFamily: "'Space Mono', monospace", color: 'var(--text-muted)', marginBottom: '10px', letterSpacing: '1px' }}>
                LYRICS — {segments.length} セグメント
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '260px', overflow: 'auto' }}>
                {segments.map((seg, i) => {
                  const isActive = currentTime >= seg.start && currentTime < seg.end;
                  return (
                    <div
                      key={i}
                      className={`section-card ${isActive ? 'active' : ''}`}
                      onClick={() => seek(seg.start)}
                      style={{ padding: '6px 10px', cursor: 'pointer' }}
                    >
                      <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{seg.start.toFixed(1)}s</div>
                      <p style={{ fontSize: '13px', color: isActive ? '#22d3ee' : 'var(--text-primary)' }}>{seg.text}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* 右: DJミキサー + ライブ制御 + チャット */}
        <div style={{ width: '380px', display: 'flex', flexDirection: 'column', gap: '12px', flexShrink: 0, overflow: 'auto' }}>
          <DJMixerPanel />

          {/* ライブ投影コントロール */}
          <div className="glass-card" style={{ padding: '12px' }}>
            <p style={{ fontSize: '10px', fontFamily: "'Space Mono', monospace", color: 'var(--text-muted)', marginBottom: '10px', letterSpacing: '1px' }}>LIVE OUTPUT</p>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
              <select
                value={selectedDisplay ?? ''}
                onChange={e => setSelectedDisplay(e.target.value ? Number(e.target.value) : undefined)}
                style={{ flex: 1, padding: '6px', background: 'var(--bg-input)', border: '1px solid var(--border-subtle)', borderRadius: '6px', color: 'var(--text-primary)', fontSize: '12px' }}
              >
                <option value="">— ディスプレイを選択 —</option>
                {displays.map(d => (
                  <option key={d.id} value={d.id}>{d.label}{d.isPrimary ? ' (メイン)' : ''}</option>
                ))}
              </select>
              <button className="btn-neon" onClick={handleRefreshDisplays} title="更新">🔄</button>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button className={`btn-neon ${isLiveActive ? 'active' : ''}`} style={{ flex: 1 }} onClick={handleOpenLive} disabled={isLiveActive}>
                {isLiveActive ? '● LIVE中' : '▶ LIVE 開始'}
              </button>
              {isLiveActive && (
                <button className="btn-neon btn-danger" onClick={async () => { await window.api?.closeLiveWindow?.(); setLiveActive(false); }}>
                  ■ 停止
                </button>
              )}
            </div>
          </div>

          <ChatTriggerPanel />
        </div>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
