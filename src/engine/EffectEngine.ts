/**
 * VJ Studio - EffectEngine
 *
 * トリガーパッドやトリガーイベントを受け取り、
 * エフェクトのアクティブ状態・強度・減衰を管理するエンジン。
 * React state を使わずに ref に書き込む設計（高頻度更新対応）。
 */

export type EffectId =
  | 'flash' | 'zoom' | 'blur' | 'rhyme'
  | 'beat'  | 'spin' | 'drop' | 'star';

interface EffectState {
  intensity: number;    // 0〜1（現在の強度）
  decay: number;        // 1フレームあたりの減衰量
  color: [number, number, number]; // RGB 0〜1
}

export class EffectEngine {
  private effects: Map<EffectId, EffectState> = new Map();

  // カスタムエフェクトコールバック（外部から設定可能）
  onEffect: ((id: EffectId, intensity: number) => void) | null = null;

  constructor() {
    const ids: EffectId[] = ['flash', 'zoom', 'blur', 'rhyme', 'beat', 'spin', 'drop', 'star'];
    ids.forEach(id => {
      this.effects.set(id, { intensity: 0, decay: 3.0, color: [1, 1, 1] });
    });

    // エフェクト別のパラメーター設定
    this.effects.get('flash')!.decay = 4.0;
    this.effects.get('zoom')!.decay  = 2.5;
    this.effects.get('blur')!.decay  = 1.5;
    this.effects.get('rhyme')!.decay = 2.0;
    this.effects.get('beat')!.decay  = 8.0;  // ビートは短い
    this.effects.get('spin')!.decay  = 1.0;
    this.effects.get('drop')!.decay  = 2.0;
    this.effects.get('star')!.decay  = 1.5;

    // エフェクト別カラー
    this.effects.get('flash')!.color  = [1.0, 1.0, 1.0];
    this.effects.get('zoom')!.color   = [0.13, 0.83, 0.94];
    this.effects.get('blur')!.color   = [0.66, 0.33, 0.98];
    this.effects.get('rhyme')!.color  = [0.13, 0.83, 0.94];
    this.effects.get('beat')!.color   = [0.96, 0.75, 0.14];
    this.effects.get('spin')!.color   = [0.39, 0.40, 0.95];
    this.effects.get('drop')!.color   = [0.96, 0.25, 0.37];
    this.effects.get('star')!.color   = [1.0,  0.95, 0.85];
  }

  /** エフェクトを発火（強度1.0でセット） */
  fire(id: EffectId, intensity = 1.0) {
    const fx = this.effects.get(id);
    if (fx) {
      fx.intensity = Math.min(1.0, fx.intensity + intensity);
      this.onEffect?.(id, fx.intensity);
    }
  }

  /** 毎フレーム呼び出す（delta = 前フレームからの秒数） */
  tick(delta: number) {
    this.effects.forEach(fx => {
      if (fx.intensity > 0) {
        fx.intensity = Math.max(0, fx.intensity - fx.decay * delta);
      }
    });
  }

  get(id: EffectId): EffectState {
    return this.effects.get(id) ?? { intensity: 0, decay: 0, color: [0, 0, 0] };
  }

  /** まとめてアクセスしやすいスナップショット */
  snapshot() {
    const result: Record<string, number> = {};
    this.effects.forEach((fx, id) => { result[id] = fx.intensity; });
    return result;
  }
}

// シングルトン
let _effectEngine: EffectEngine | null = null;
export function getEffectEngine(): EffectEngine {
  if (!_effectEngine) _effectEngine = new EffectEngine();
  return _effectEngine;
}
