/**
 * VJ Studio - AudioEngine
 *
 * Web Audio API を使ったリアルタイム音声解析エンジン。
 * 主な機能:
 *   - FFT / Waveform のリアルタイム取得
 *   - ステム（Vocal / Drum / Bass / Other）別 AudioNode 管理
 *   - BPM 検出（ビート追跡）
 *   - Audio FX ノードグラフ（Reverb / Delay / Pitch）
 *   - シェーダーへ渡す Float32Array バッファの維持
 *
 * 設計上の注意:
 *   - useState / setState を一切使わない（高周波更新でReactの再レンダを避けるため）
 *   - データは直接 ref に書き込み、WebGL側が useFrame の中で読む
 */

const FFT_SIZE = 2048;
const FREQ_BIN_COUNT = FFT_SIZE / 2;   // 1024

export interface StemTrack {
  name: 'vocal' | 'drum' | 'bass' | 'other';
  audioPath: string;
  color: string;
  gainNode: GainNode;
  analyser: AnalyserNode;
  source?: AudioBufferSourceNode;
  buffer?: AudioBuffer;
}

export interface FxNodes {
  reverb:  ConvolverNode;
  reverbGain: GainNode;
  delay:   DelayNode;
  delayGain: GainNode;
  // ピッチシフトは AudioWorklet で実装（別ファイル）
}

export class AudioEngine {
  readonly ctx: AudioContext;

  // Master chain
  private masterGain: GainNode;
  private masterAnalyser: AnalyserNode;
  private fxNodes: FxNodes | null = null;

  // Stems
  readonly stems: Map<string, StemTrack> = new Map();

  // --- 共有バッファ（外部から直接読み取り可） ---
  /** マスターの周波数データ (0〜255, length=1024) */
  readonly freqData: Uint8Array = new Uint8Array(FREQ_BIN_COUNT);
  /** マスターの波形データ (0〜255, length=1024) */
  readonly timeData: Uint8Array = new Uint8Array(FREQ_BIN_COUNT);
  /** ステム別のRMSレベル (0〜1) */
  readonly stemLevels: Record<string, number> = { vocal: 0, drum: 0, bass: 0, other: 0 };

  // BPM 追跡
  private beatTimes: number[] = [];
  private _bpm = 120;
  private _lastBeatTime = 0;
  private _beatDetectBuffer: Float32Array = new Float32Array(256);
  private _beatIdx = 0;

  // アニメーションループ
  private _rafId: number | null = null;
  private _isRunning = false;

  // 再生制御
  private _startTime = 0;  // audioContext.currentTime at playback start
  private _pauseOffset = 0;
  private _isPlaying = false;

  // コールバック
  onBeat: ((bpm: number, time: number) => void) | null = null;
  onTimeUpdate: ((time: number) => void) | null = null;

  constructor() {
    this.ctx = new AudioContext({ latencyHint: 'interactive', sampleRate: 44100 });
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = 1.0;
    this.masterAnalyser = this.ctx.createAnalyser();
    this.masterAnalyser.fftSize = FFT_SIZE;
    this.masterAnalyser.smoothingTimeConstant = 0.8;

    this.masterGain.connect(this.masterAnalyser);
    this.masterAnalyser.connect(this.ctx.destination);

    this._initFxNodes();
  }

  // ── FXノードグラフ ─────────────────────────────────────────

  private async _initFxNodes() {
    const ctx = this.ctx;

    // Reverb (ConvolverNode with synthetic impulse response)
    const reverb = ctx.createConvolver();
    const irBuffer = await this._createSyntheticIR(2.0);
    reverb.buffer = irBuffer;
    const reverbGain = ctx.createGain();
    reverbGain.gain.value = 0;  // 初期はゼロ

    // Delay
    const delay = ctx.createDelay(2.0);
    delay.delayTime.value = 0.3;
    const delayGain = ctx.createGain();
    delayGain.gain.value = 0;  // 初期はゼロ
    const delayFeedback = ctx.createGain();
    delayFeedback.gain.value = 0.4;

    // ルーティング: masterGain → reverb → reverbGain → destination
    this.masterGain.connect(reverb);
    reverb.connect(reverbGain);
    reverbGain.connect(ctx.destination);

    // ルーティング: masterGain → delay → delayGain → destination (with feedback)
    this.masterGain.connect(delay);
    delay.connect(delayFeedback);
    delayFeedback.connect(delay);
    delay.connect(delayGain);
    delayGain.connect(ctx.destination);

    this.fxNodes = { reverb, reverbGain, delay, delayGain };
  }

  /** 合成インパルス応答（ルームリバーブの近似） */
  private async _createSyntheticIR(durationSec: number): Promise<AudioBuffer> {
    const sampleRate = this.ctx.sampleRate;
    const length = Math.floor(sampleRate * durationSec);
    const buf = this.ctx.createBuffer(2, length, sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const data = buf.getChannelData(ch);
      for (let i = 0; i < length; i++) {
        // 指数減衰ノイズ
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 2.5);
      }
    }
    return buf;
  }

  // ── FX パラメーター更新（DJミキサーから呼ばれる） ────────────

  setReverbMix(value: number) {  // 0〜1
    if (this.fxNodes) {
      this.fxNodes.reverbGain.gain.setTargetAtTime(value * 0.8, this.ctx.currentTime, 0.05);
    }
  }

  setDelayMix(value: number) {  // 0〜1
    if (this.fxNodes) {
      this.fxNodes.delayGain.gain.setTargetAtTime(value * 0.6, this.ctx.currentTime, 0.05);
    }
  }

  setMasterVolume(value: number) {
    this.masterGain.gain.setTargetAtTime(value, this.ctx.currentTime, 0.02);
  }

  // ── 楽曲ロード ──────────────────────────────────────────────

  async loadAudio(arrayBuffer: ArrayBuffer): Promise<AudioBuffer> {
    const decoded = await this.ctx.decodeAudioData(arrayBuffer);
    return decoded;
  }

  /** ステムを登録してノードグラフに接続 */
  registerStem(name: StemTrack['name'], buffer: AudioBuffer, color: string) {
    // 既存のステムを解放
    const existing = this.stems.get(name);
    if (existing?.source) {
      try { existing.source.disconnect(); } catch {}
    }

    const gainNode = this.ctx.createGain();
    gainNode.gain.value = 1.0;

    const analyser = this.ctx.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.75;

    gainNode.connect(analyser);
    analyser.connect(this.masterGain);

    const stem: StemTrack = { name, audioPath: '', color, gainNode, analyser, buffer };
    this.stems.set(name, stem);
    return stem;
  }

  /** マスター音源のみを再生（ステム未分離の場合） */
  playMaster(buffer: AudioBuffer, offset = 0) {
    this._stopAllSources();
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(this.masterGain);
    source.start(0, offset);
    this._startTime = this.ctx.currentTime - offset;
    this._isPlaying = true;
  }

  /** 全ステムを同期再生 */
  playStems(offset = 0) {
    this._stopAllSources();
    const startAt = this.ctx.currentTime + 0.05;  // 50ms バッファ
    this.stems.forEach(stem => {
      if (!stem.buffer) return;
      const source = this.ctx.createBufferSource();
      source.buffer = stem.buffer;
      source.connect(stem.gainNode);
      source.start(startAt, offset);
      stem.source = source;
    });
    this._startTime = startAt - offset;
    this._isPlaying = true;
  }

  pause() {
    this._pauseOffset = this.getCurrentTime();
    this._stopAllSources();
    this._isPlaying = false;
  }

  stop() {
    this._pauseOffset = 0;
    this._stopAllSources();
    this._isPlaying = false;
  }

  getCurrentTime(): number {
    if (!this._isPlaying) return this._pauseOffset;
    return this.ctx.currentTime - this._startTime;
  }

  private _stopAllSources() {
    this.stems.forEach(stem => {
      try { stem.source?.stop(); } catch {}
    });
  }

  // ── リアルタイム解析ループ ─────────────────────────────────

  startAnalysisLoop() {
    if (this._isRunning) return;
    this._isRunning = true;
    this._tick();
  }

  stopAnalysisLoop() {
    this._isRunning = false;
    if (this._rafId !== null) {
      cancelAnimationFrame(this._rafId);
      this._rafId = null;
    }
  }

  private _tick = () => {
    if (!this._isRunning) return;

    // マスター FFT / Waveform
    this.masterAnalyser.getByteFrequencyData(this.freqData);
    this.masterAnalyser.getByteTimeDomainData(this.timeData);

    // ステム別 RMS レベル
    this.stems.forEach((stem, name) => {
      const buf = new Float32Array(stem.analyser.fftSize);
      stem.analyser.getFloatTimeDomainData(buf);
      let rms = 0;
      for (let i = 0; i < buf.length; i++) rms += buf[i] * buf[i];
      this.stemLevels[name] = Math.sqrt(rms / buf.length);
    });

    // BPM 追跡（サブバンドエネルギー差分）
    this._detectBeat();

    // 時間通知
    if (this._isPlaying && this.onTimeUpdate) {
      this.onTimeUpdate(this.getCurrentTime());
    }

    this._rafId = requestAnimationFrame(this._tick);
  };

  // ── BPM / ビート検出 ────────────────────────────────────────

  private _detectBeat() {
    // Bass band energy (bins 0〜8, ~0〜172Hz)
    let energy = 0;
    for (let i = 0; i < 8; i++) energy += this.freqData[i];
    energy /= 8 * 255;

    // 移動平均との比較でビート判定
    this._beatDetectBuffer[this._beatIdx % 256] = energy;
    this._beatIdx++;

    if (this._beatIdx < 43) return;  // 最低1秒のデータが必要

    let avg = 0;
    for (let i = 0; i < 256; i++) avg += this._beatDetectBuffer[i];
    avg /= 256;

    const now = this.ctx.currentTime;
    const minInterval = 0.25;  // 最大240BPM

    if (energy > avg * 1.5 && now - this._lastBeatTime > minInterval) {
      this._lastBeatTime = now;
      this.beatTimes.push(now);
      if (this.beatTimes.length > 16) this.beatTimes.shift();

      // BPM 計算（直近の平均インターバル）
      if (this.beatTimes.length >= 4) {
        const intervals: number[] = [];
        for (let i = 1; i < this.beatTimes.length; i++) {
          intervals.push(this.beatTimes[i] - this.beatTimes[i - 1]);
        }
        const avgInterval = intervals.reduce((a, b) => a + b) / intervals.length;
        this._bpm = Math.round(60 / avgInterval);
        if (this._bpm > 40 && this._bpm < 250) {
          this.onBeat?.(this._bpm, now);
        }
      }
    }
  }

  get bpm(): number { return this._bpm; }
  get isPlaying(): boolean { return this._isPlaying; }

  // ── ステムゲイン制御 ─────────────────────────────────────────

  setStemGain(name: string, value: number) {
    const stem = this.stems.get(name);
    if (stem) {
      stem.gainNode.gain.setTargetAtTime(value, this.ctx.currentTime, 0.02);
    }
  }

  // ── クリーンアップ ───────────────────────────────────────────

  async dispose() {
    this.stopAnalysisLoop();
    this._stopAllSources();
    await this.ctx.close();
  }
}

// シングルトン（アプリ全体で1インスタンス）
let _engineInstance: AudioEngine | null = null;

export function getAudioEngine(): AudioEngine {
  if (!_engineInstance) {
    _engineInstance = new AudioEngine();
  }
  return _engineInstance;
}

export function disposeAudioEngine() {
  _engineInstance?.dispose();
  _engineInstance = null;
}
