import React, { useState, useEffect, useRef, useCallback } from 'react';
import type { ChatMessage } from '../../electron/preload';

// キーワード → エフェクトのマッピング
interface KeywordMapping {
  keyword: string;
  effect: string;
  isSuperChat?: boolean;
  minAmount?: number;
}

const DEFAULT_KEYWORD_MAPPINGS: KeywordMapping[] = [
  { keyword: '神', effect: 'drop' },
  { keyword: 'かわいい', effect: 'star' },
  { keyword: 'すごい', effect: 'zoom' },
  { keyword: '！', effect: 'flash' },
  { keyword: 'ﾔﾊﾞ', effect: 'blur' },
  { isSuperChat: true, minAmount: 500, keyword: 'スパチャ ¥500+', effect: 'drop' },
  { isSuperChat: true, minAmount: 5000, keyword: 'スパチャ ¥5000+', effect: 'flash' },
];

const EFFECT_LABELS: Record<string, string> = {
  flash: '⚡ FLASH', zoom: '🔍 ZOOM', blur: '💫 BLUR',
  rhyme: '🎵 RHYME', beat: '🥁 BEAT', spin: '🌀 SPIN',
  drop: '💥 DROP', star: '✨ STAR',
};

export function ChatTriggerPanel() {
  const [platform, setPlatform] = useState<'youtube' | 'tiktok'>('youtube');
  const [videoId, setVideoId] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [username, setUsername] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [chatTitle, setChatTitle] = useState('');
  const [messages, setMessages] = useState<(ChatMessage & { id: number; isNew: boolean })[]>([]);
  const [mappings, setMappings] = useState<KeywordMapping[]>(DEFAULT_KEYWORD_MAPPINGS);
  const [chatError, setChatError] = useState('');
  const [editingMap, setEditingMap] = useState<number | null>(null);
  const msgIdRef = useRef(0);
  const listRef = useRef<HTMLDivElement>(null);

  // チャットメッセージ受信
  useEffect(() => {
    const unsubMsg = window.api?.onChatMessage?.((msg) => {
      const id = ++msgIdRef.current;

      // キーワードマッチング → エフェクトトリガー
      for (const mapping of mappings) {
        if (mapping.isSuperChat) {
          if (!msg.isSuperChat) continue;
          // 金額チェック（スパチャのみ）
          const amountNum = parseFloat((msg.amount || '0').replace(/[^0-9.]/g, ''));
          if (mapping.minAmount && amountNum < mapping.minAmount) continue;
        } else {
          if (!msg.text.includes(mapping.keyword) && !msg.author.includes(mapping.keyword)) continue;
        }
        // エフェクト発火
        window.api?.sendVJControl?.({ type: 'triggerPad', key: mapping.effect });
        break;
      }

      setMessages(prev => {
        const next = [...prev, { ...msg, id, isNew: true }].slice(-50); // 直近50件
        return next;
      });

      // "新着"ハイライトを 1.5秒後に消す
      setTimeout(() => {
        setMessages(prev => prev.map(m => m.id === id ? { ...m, isNew: false } : m));
      }, 1500);
    });

    const unsubReady = window.api?.onChatReady?.((data) => {
      setChatTitle(data.title);
      setIsListening(true);
      setChatError('');
    });

    const unsubErr = window.api?.onChatError?.((data) => {
      setChatError(data.message);
      setIsListening(false);
    });

    return () => { unsubMsg?.(); unsubReady?.(); unsubErr?.(); };
  }, [mappings]);

  // オートスクロール
  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages]);

  const handleStart = async () => {
    setChatError('');
    const req = platform === 'youtube'
      ? { platform: 'youtube' as const, videoId, apiKey }
      : { platform: 'tiktok' as const, username };
    await window.api?.startChat?.(req);
  };

  const handleStop = async () => {
    await window.api?.stopChat?.();
    setIsListening(false);
    setChatTitle('');
  };

  const updateMapping = (index: number, field: keyof KeywordMapping, value: any) => {
    setMappings(prev => prev.map((m, i) => i === index ? { ...m, [field]: value } : m));
  };

  const addMapping = () => {
    setMappings(prev => [...prev, { keyword: '', effect: 'flash' }]);
    setEditingMap(mappings.length);
  };

  const removeMapping = (index: number) => {
    setMappings(prev => prev.filter((_, i) => i !== index));
  };

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      gap: '10px',
      background: 'rgba(5, 5, 20, 0.9)',
      border: '1px solid rgba(99, 102, 241, 0.3)',
      borderRadius: '12px',
      padding: '12px',
    }}>
      {/* ヘッダー */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '8px' }}>
        <span style={{ fontSize: '13px', fontFamily: "'Space Mono', monospace", color: '#8b8bcc' }}>
          💬 LIVE CHAT TRIGGER
        </span>
        {isListening && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginLeft: 'auto' }}>
            <div className="live-dot" />
            <span style={{ fontSize: '10px', fontFamily: "'Space Mono', monospace", color: '#10b981' }}>CONNECTED</span>
          </div>
        )}
      </div>

      {/* プラットフォーム選択 */}
      <div style={{ display: 'flex', gap: '6px' }}>
        {(['youtube', 'tiktok'] as const).map(p => (
          <button
            key={p}
            onClick={() => setPlatform(p)}
            style={{
              flex: 1,
              padding: '6px',
              borderRadius: '6px',
              border: `1px solid ${platform === p ? '#6366f1' : 'rgba(255,255,255,0.1)'}`,
              background: platform === p ? 'rgba(99, 102, 241, 0.2)' : 'transparent',
              color: platform === p ? '#a5b4fc' : '#8b8bcc',
              fontSize: '11px',
              fontFamily: "'Space Mono', monospace",
              cursor: 'pointer',
              textTransform: 'uppercase' as const,
            }}
          >
            {p === 'youtube' ? '▶ YouTube' : '♪ TikTok'}
          </button>
        ))}
      </div>

      {/* 接続情報入力 */}
      {!isListening && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {platform === 'youtube' ? (
            <>
              <input
                value={videoId}
                onChange={e => setVideoId(e.target.value)}
                placeholder="YouTube Video ID (例: dQw4w9WgXcQ)"
                style={inputStyle}
              />
              <input
                type="password"
                value={apiKey}
                onChange={e => setApiKey(e.target.value)}
                placeholder="YouTube Data API Key"
                style={inputStyle}
              />
            </>
          ) : (
            <input
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder="TikTok ユーザー名 (例: @your_name)"
              style={inputStyle}
            />
          )}
        </div>
      )}

      {chatError && (
        <div style={{ fontSize: '11px', color: '#f87171', padding: '6px 8px', background: 'rgba(248,113,113,0.1)', borderRadius: '6px', whiteSpace: 'pre-wrap' }}>
          ⚠ {chatError}
        </div>
      )}

      {chatTitle && (
        <div style={{ fontSize: '11px', color: '#10b981', padding: '4px 8px', background: 'rgba(16,185,129,0.1)', borderRadius: '6px' }}>
          ✓ {chatTitle}
        </div>
      )}

      {/* 接続ボタン */}
      <div style={{ display: 'flex', gap: '6px' }}>
        {!isListening ? (
          <button className="btn-neon" style={{ flex: 1 }} onClick={handleStart}>
            ▶ 接続開始
          </button>
        ) : (
          <button className="btn-neon btn-danger" style={{ flex: 1 }} onClick={handleStop}>
            ■ 切断
          </button>
        )}
      </div>

      {/* コメント一覧 */}
      {(messages.length > 0 || isListening) && (
        <div ref={listRef} style={{
          maxHeight: '150px',
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: '4px',
        }}>
          {messages.length === 0 && (
            <p style={{ fontSize: '11px', color: '#4a4a7a', textAlign: 'center', padding: '12px' }}>
              コメント待機中...
            </p>
          )}
          {messages.map(msg => (
            <div
              key={msg.id}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '6px',
                padding: '4px 8px',
                borderRadius: '6px',
                background: msg.isNew
                  ? (msg.isSuperChat ? 'rgba(251,191,36,0.15)' : 'rgba(99,102,241,0.15)')
                  : 'rgba(255,255,255,0.03)',
                border: `1px solid ${msg.isNew ? msg.color : 'transparent'}`,
                transition: 'background 0.5s, border 0.5s',
              }}
            >
              {msg.isSuperChat && (
                <span style={{ fontSize: '10px', fontFamily: "'Space Mono', monospace", color: msg.color, whiteSpace: 'nowrap', flexShrink: 0 }}>
                  {msg.amount}
                </span>
              )}
              <span style={{ fontSize: '11px', color: '#6366f1', flexShrink: 0, fontWeight: 600 }}>
                {msg.author}
              </span>
              <span style={{ fontSize: '11px', color: '#c7c7e8' }}>{msg.text}</span>
            </div>
          ))}
        </div>
      )}

      {/* キーワード → エフェクト マッピング */}
      <details style={{ marginTop: '4px' }}>
        <summary style={{ fontSize: '10px', fontFamily: "'Space Mono', monospace", color: '#4a4a7a', cursor: 'pointer', letterSpacing: '1px', listStyle: 'none' }}>
          ▸ KEYWORD MAPPING ({mappings.length})
        </summary>
        <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {mappings.map((m, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              {m.isSuperChat ? (
                <span style={{ fontSize: '10px', color: '#fbbf24', fontFamily: "'Space Mono', monospace", minWidth: '80px' }}>
                  スパチャ {m.minAmount && `¥${m.minAmount}+`}
                </span>
              ) : (
                <input
                  value={m.keyword}
                  onChange={e => updateMapping(i, 'keyword', e.target.value)}
                  placeholder="キーワード"
                  style={{ ...inputStyle, flex: 1, fontSize: '11px', padding: '4px 6px' }}
                />
              )}
              <select
                value={m.effect}
                onChange={e => updateMapping(i, 'effect', e.target.value)}
                style={{ ...inputStyle, fontSize: '10px', padding: '4px', flex: 'none', width: '90px' }}
              >
                {Object.entries(EFFECT_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
              <button
                onClick={() => removeMapping(i)}
                style={{ background: 'transparent', border: 'none', color: '#4a4a7a', cursor: 'pointer', fontSize: '14px', lineHeight: 1 }}
              >×</button>
            </div>
          ))}
          <button className="btn-neon" style={{ fontSize: '10px', padding: '4px 8px', marginTop: '4px' }} onClick={addMapping}>
            + キーワード追加
          </button>
        </div>
      </details>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  padding: '6px 10px',
  background: 'var(--bg-input)',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: '6px',
  color: 'var(--text-primary)',
  fontSize: '12px',
  width: '100%',
  outline: 'none',
};
