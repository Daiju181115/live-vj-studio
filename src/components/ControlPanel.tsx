import React, { useState } from 'react';
import { useVjStore } from '../store/vjStore';
import { DJMixerPanel } from './DJMixerPanel';
import { ChatTriggerPanel } from './ChatTriggerPanel';

export function ControlPanel() {
  const {
    audioPath, setAudioPath, isProcessing, processStep,
    segments, durationSec, setSegments, setRhymePairs,
    setProcessing, clearProcessing, isLiveActive, setLiveActive
  } = useVjStore();

  const [urlInput, setUrlInput] = useState('');
  const [displays, setDisplays] = useState<any[]>([]);
  const [selectedDisplay, setSelectedDisplay] = useState<number | undefined>();

  /** ローカルファイル選択 */
  const handleOpenFile = async () => {
    const p = await window.api?.openFileDialog();
    if (!p) return;
    setAudioPath(p);
    await runAnalysis(p);
  };

  /** URL から楽曲ダウンロード */
  const handleDownloadUrl = async () => {
    if (!urlInput.trim()) return;
    const tmpDir = 'C:/Users/fuuch/projects/live-vj-studio/_tmp';
    setProcessing('ダウンロード中...');
    await window.api?.downloadUrl({ url: urlInput, outputDir: tmpDir });
    // onDownloadResult で続きを処理
  };

  /** Whisper 解析 → 韻検出 */
  const runAnalysis = async (audioPath: string) => {
    setProcessing('Whisper 解析中...');
    await window.api?.startAnalysis({ audioPath });
  };

  /** ライブウィンドウを開く */
  const handleOpenLive = async () => {
    const res = await window.api?.openLiveWindow(selectedDisplay);
    if (res?.success) setLiveActive(true);
  };

  /** ディスプレイ一覧取得 */
  const handleRefreshDisplays = async () => {
    const list = await window.api?.getDisplays();
    if (list) setDisplays(list);
  };

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      width: '100%',
      height: '100%',
      background: 'var(--bg-void)',
      overflow: 'hidden',
    }}>
      {/* ── ヘッダー ── */}
      <header style={{
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        padding: '10px 16px',
        borderBottom: '1px solid rgba(99, 102, 241, 0.2)',
        flexShrink: 0,
        background: 'var(--bg-deep)',
      }}>
        <h1 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--accent-cyber)', fontFamily: "'Space Mono', monospace", letterSpacing: '2px' }}>
          VJ STUDIO
        </h1>
        <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>v0.1.0</span>

        {/* 楽曲読み込みボタン */}
        <button className="btn-neon" onClick={handleOpenFile} style={{ marginLeft: 'auto' }}>
          📂 ファイルを開く
        </button>

        {/* URL 入力 */}
        <div style={{ display: 'flex', gap: '6px' }}>
          <input
            value={urlInput}
            onChange={e => setUrlInput(e.target.value)}
            placeholder="YouTube / SoundCloud URL..."
            style={{
              padding: '6px 12px',
              background: 'var(--bg-input)',
              border: '1px solid var(--border-subtle)',
              borderRadius: '6px',
              color: 'var(--text-primary)',
              fontSize: '12px',
              width: '240px',
            }}
          />
          <button className="btn-neon" onClick={handleDownloadUrl}>⬇ 取込み</button>
        </div>
      </header>

      {/* ── メインエリア ── */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden', gap: '12px', padding: '12px' }}>

        {/* 左: 解析状況 + セクション */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '12px', overflow: 'auto' }}>

          {/* 処理ステータス */}
          {isProcessing && (
            <div className="glass-card" style={{ padding: '12px', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ width: '16px', height: '16px', border: '2px solid var(--accent-cyber)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
              <span style={{ fontSize: '13px', color: 'var(--accent-cyber)' }}>{processStep}</span>
            </div>
          )}

          {/* 楽曲情報 */}
          {audioPath && !isProcessing && (
            <div className="glass-card" style={{ padding: '12px' }}>
              <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                📁 {audioPath.split('\\').pop() || audioPath.split('/').pop()}
              </p>
              <p style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                歌詞セグメント: {segments.length} | 尺: {Math.round(durationSec)}秒
              </p>
            </div>
          )}

          {/* セクションカード一覧（Phase 4で実装） */}
          {segments.length > 0 && (
            <div className="glass-card" style={{ padding: '12px' }}>
              <p style={{ fontSize: '12px', fontFamily: "'Space Mono', monospace", color: 'var(--text-muted)', marginBottom: '10px', letterSpacing: '1px' }}>
                SECTIONS — {segments.length} セグメント
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '300px', overflow: 'auto' }}>
                {segments.slice(0, 20).map((seg, i) => (
                  <div key={i} className="section-card" style={{ padding: '8px 12px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text-muted)' }}>
                      <span>{seg.start.toFixed(1)}s – {seg.end.toFixed(1)}s</span>
                    </div>
                    <p style={{ fontSize: '13px', marginTop: '2px' }}>{seg.text}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* 右: DJミキサー + ライブ制御 */}
        <div style={{ width: '380px', display: 'flex', flexDirection: 'column', gap: '12px', flexShrink: 0 }}>

          {/* DJミキサー */}
          <DJMixerPanel />

          {/* ライブ投影コントロール */}
          <div className="glass-card" style={{ padding: '12px' }}>
            <p style={{ fontSize: '10px', fontFamily: "'Space Mono', monospace", color: 'var(--text-muted)', marginBottom: '10px', letterSpacing: '1px' }}>
              LIVE OUTPUT
            </p>
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
              <button className="btn-neon" onClick={handleRefreshDisplays} title="ディスプレイ一覧を更新">🔄</button>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                className={`btn-neon ${isLiveActive ? 'active' : ''}`}
                style={{ flex: 1 }}
                onClick={handleOpenLive}
                disabled={isLiveActive}
              >
                {isLiveActive ? '● LIVE中' : '▶ LIVE 開始'}
              </button>
              {isLiveActive && (
                <button
                  className="btn-neon btn-danger"
                  onClick={async () => {
                    await window.api?.closeLiveWindow();
                    setLiveActive(false);
                  }}
                >
                  ■ 停止
                </button>
              )}
            </div>
          </div>
          {/* チャットトリガー */}
          <ChatTriggerPanel />
        </div>
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
