import React from 'react';
import { useLocation } from './hooks/useLocation';
import { ControlPanel } from './components/ControlPanel';
import { LiveStage } from './components/LiveStage';

/**
 * App のルーティング:
 *  - URL hash "#live" → ライブ投影ウィンドウ（全画面 WebGL シーン）
 *  - その他 → メインウィンドウ（DJ コントロールパネル）
 */
export default function App() {
  const isLive = window.location.hash === '#live';

  if (isLive) {
    return <LiveStage />;
  }

  return <ControlPanel />;
}
