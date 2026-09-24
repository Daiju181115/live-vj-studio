/**
 * VJ Studio - Lyric Trigger Engine
 *
 * 再生時刻と歌詞タイムスタンプを照合し、
 * 単語到達時にコールバックを発火するエンジン。
 * requestAnimationFrame ループの中から呼ばれる。
 */

import type { LyricSegment, RhymePair } from '../store/vjStore';

export interface TriggerEvent {
  type: 'word' | 'rhyme' | 'section';
  word?: string;
  time: number;
  rhymePair?: RhymePair;
  sectionIndex?: number;
}

export type TriggerCallback = (event: TriggerEvent) => void;

export class LyricTriggerEngine {
  private segments: LyricSegment[] = [];
  private rhymePairs: RhymePair[] = [];
  private callback: TriggerCallback | null = null;

  // 発火済みトラッキング（巻き戻し後にリセット）
  private firedWords: Set<string> = new Set();
  private firedRhymes: Set<string> = new Set();
  private lastTime = -1;

  setData(segments: LyricSegment[], rhymePairs: RhymePair[]) {
    this.segments = segments;
    this.rhymePairs = rhymePairs;
    this.reset();
  }

  setCallback(cb: TriggerCallback) {
    this.callback = cb;
  }

  reset() {
    this.firedWords.clear();
    this.firedRhymes.clear();
    this.lastTime = -1;
  }

  /**
   * 毎フレーム呼び出す。現在時刻 (秒) を渡す。
   * 前回の時刻より小さければ巻き戻しとみなしてリセット。
   */
  tick(currentTime: number) {
    if (!this.callback) return;

    // 巻き戻し検出
    if (currentTime < this.lastTime - 0.5) {
      this.reset();
    }
    this.lastTime = currentTime;

    // 単語トリガー
    for (let si = 0; si < this.segments.length; si++) {
      const seg = this.segments[si];
      const words = seg.words || [{ word: seg.text, start: seg.start, end: seg.end }];

      for (let wi = 0; wi < words.length; wi++) {
        const w = words[wi];
        const key = `${si}-${wi}`;
        if (!this.firedWords.has(key) && currentTime >= w.start && currentTime < w.start + 0.5) {
          this.firedWords.add(key);
          this.callback({ type: 'word', word: w.word, time: w.start });
        }
      }
    }

    // 韻トリガー（2回目の単語 = rhymePair.time2 に到達したとき）
    for (let ri = 0; ri < this.rhymePairs.length; ri++) {
      const pair = this.rhymePairs[ri];
      const key = `rhyme-${ri}`;
      if (!this.firedRhymes.has(key) && currentTime >= pair.time2 && currentTime < pair.time2 + 0.5) {
        this.firedRhymes.add(key);
        this.callback({ type: 'rhyme', time: pair.time2, rhymePair: pair });
      }
    }
  }
}
