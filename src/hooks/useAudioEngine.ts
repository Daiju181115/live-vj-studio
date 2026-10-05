/**
 * useAudioEngine
 * 
 * AudioEngine + LyricTriggerEngine を React から扱うためのフック。
 * - エンジンのシングルトンを取得・初期化
 * - VjStore の FX パラメーター変化を監視してエンジンに伝達
 * - 楽曲ロード・再生・一時停止の API を提供
 */

import { useEffect, useRef, useCallback } from 'react';
import { getAudioEngine, disposeAudioEngine } from '../engine/AudioEngine';
import { LyricTriggerEngine, TriggerCallback } from '../engine/LyricTriggerEngine';
import { useVjStore } from '../store/vjStore';

/** VJ コントロールからのトリガーパッド発火 */
function fireTriggerPad(padId: string) {
  window.api?.sendVJControl?.({ type: 'triggerPad', key: padId });
}

export function useAudioEngine() {
  const lyricEngineRef = useRef<LyricTriggerEngine>(new LyricTriggerEngine());
  const audioBufferRef = useRef<AudioBuffer | null>(null);

  const {
    fx, segments, rhymePairs,
    setCurrentTime, setIsPlaying, setDuration,
    setProcessing, clearProcessing,
  } = useVjStore();

  // FX パラメーター → AudioEngine へ即時反映
  useEffect(() => {
    const engine = getAudioEngine();
    engine.setReverbMix(fx.reverbMix);
    engine.setDelayMix(fx.delayMix);
    engine.setMasterVolume(1.0);
  }, [fx.reverbMix, fx.delayMix]);

  // 歌詞・韻データ変化 → LyricTriggerEngine に渡す
  useEffect(() => {
    lyricEngineRef.current.setData(segments, rhymePairs);
  }, [segments, rhymePairs]);

  // LyricTriggerEngine のコールバック設定（初回のみ）
  useEffect(() => {
    const cb: TriggerCallback = (event) => {
      if (event.type === 'rhyme') {
        // 韻踏み → RHYME パッド発火
        fireTriggerPad('rhyme');
      }
      // 単語トリガーは将来のキーワードマッピングで拡張
    };
    lyricEngineRef.current.setCallback(cb);
  }, []);

  // AudioEngine のビート検出 → BEAT パッド発火
  useEffect(() => {
    const engine = getAudioEngine();
    engine.onBeat = (_bpm, _time) => {
      fireTriggerPad('beat');
    };
    engine.onTimeUpdate = (time) => {
      setCurrentTime(time);
      lyricEngineRef.current.tick(time);
    };
    engine.onEnded = () => {
      setIsPlaying(false);
      setCurrentTime(audioBufferRef.current?.duration || 0);
    };

    return () => {
      engine.onBeat = null;
      engine.onTimeUpdate = null;
      engine.onEnded = null;
    };
  }, [setCurrentTime, setIsPlaying]);

  // 解析ループ開始（マウント時）
  useEffect(() => {
    const engine = getAudioEngine();
    engine.startAnalysisLoop();
    return () => {
      engine.stopAnalysisLoop();
    };
  }, []);

  // ── 公開 API ─────────────────────────────────────────────────

  const loadAudioFile = useCallback(async (audioPath: string) => {
    setProcessing('音声ファイルを読み込み中...');
    try {
      const data = await window.api?.readFile?.(audioPath);
      if (!data) throw new Error('ファイルの読み込みに失敗しました');

      const engine = getAudioEngine();
      const arrayBuffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
      const audioBuffer = await engine.loadAudio(arrayBuffer);
      audioBufferRef.current = audioBuffer;
      setDuration(audioBuffer.duration);
      clearProcessing();
      return audioBuffer;
    } catch (e: any) {
      clearProcessing();
      throw e;
    }
  }, [setProcessing, clearProcessing, setDuration]);

  const play = useCallback((offset?: number) => {
    const engine = getAudioEngine();
    const buf = audioBufferRef.current;
    if (!buf) return;

    if (engine.stems.size > 0) {
      engine.playStems(offset ?? engine.getCurrentTime());
    } else {
      engine.playMaster(buf, offset ?? engine.getCurrentTime());
    }
    setIsPlaying(true);
  }, [setIsPlaying]);

  const pause = useCallback(() => {
    getAudioEngine().pause();
    setIsPlaying(false);
  }, [setIsPlaying]);

  const seek = useCallback((time: number) => {
    const engine = getAudioEngine();
    const wasPlaying = engine.isPlaying;
    engine.stop();
    lyricEngineRef.current.reset();
    if (wasPlaying) {
      const buf = audioBufferRef.current;
      if (!buf) return;
      if (engine.stems.size > 0) {
        engine.playStems(time);
      } else {
        engine.playMaster(buf, time);
      }
    }
  }, []);

  const loadStem = useCallback(async (
    name: 'vocal' | 'drum' | 'bass' | 'other',
    audioPath: string,
    color: string
  ) => {
    const data = await window.api?.readFile?.(audioPath);
    if (!data) return;
    const engine = getAudioEngine();
    const arrayBuffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
    const buffer = await engine.loadAudio(arrayBuffer);
    engine.registerStem(name, buffer, color);
  }, []);

  return {
    loadAudioFile,
    play,
    pause,
    seek,
    loadStem,
    getEngine: getAudioEngine,
  };
}
