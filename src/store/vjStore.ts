import { create } from 'zustand';

export type VisualPreset = 'cyber' | 'cityPop' | 'lofi' | 'abstract' | 'nature';

export interface WordSegment {
  word: string;
  start: number;
  end: number;
}

export interface LyricSegment {
  start: number;
  end: number;
  text: string;
  words?: WordSegment[];
}

export interface RhymePair {
  word1: string; time1: number;
  word2: string; time2: number;
  vowelMatch: boolean;
}

export interface Section {
  id: string;
  label: string;
  start: number;
  end: number;
  preset: VisualPreset;
}

/** DJミキサーのFXパラメーター（0〜1に正規化） */
export interface FxParams {
  // Visual FX
  glowIntensity: number;
  blurAmount: number;
  hueShift: number;       // 0〜1 → シェーダーで 0〜360° にマップ
  cameraSpeed: number;
  // Audio FX
  reverbMix: number;
  delayMix: number;
  pitchShift: number;     // 0.5〜1→ -6半音, 0.5→ 0, 1→ +6半音
}

export interface VjStore {
  // 楽曲
  audioPath: string | null;
  durationSec: number;
  currentTime: number;
  isPlaying: boolean;

  // 歌詞・韻
  segments: LyricSegment[];
  rhymePairs: RhymePair[];

  // セクション
  sections: Section[];

  // FX
  fx: FxParams;

  // 状態
  isProcessing: boolean;
  processStep: string;
  isLiveActive: boolean;

  // Actions
  setAudioPath: (p: string | null) => void;
  setDuration: (d: number) => void;
  setCurrentTime: (t: number) => void;
  setIsPlaying: (v: boolean) => void;
  setSegments: (s: LyricSegment[]) => void;
  setRhymePairs: (r: RhymePair[]) => void;
  setSections: (s: Section[]) => void;
  setFx: (key: keyof FxParams, value: number) => void;
  setProcessing: (step: string) => void;
  clearProcessing: () => void;
  setLiveActive: (v: boolean) => void;
}

const DEFAULT_FX: FxParams = {
  glowIntensity: 0.5,
  blurAmount: 0,
  hueShift: 0,
  cameraSpeed: 0.3,
  reverbMix: 0,
  delayMix: 0,
  pitchShift: 0.5,
};

export const useVjStore = create<VjStore>((set) => ({
  audioPath: null,
  durationSec: 0,
  currentTime: 0,
  isPlaying: false,
  segments: [],
  rhymePairs: [],
  sections: [],
  fx: DEFAULT_FX,
  isProcessing: false,
  processStep: '',
  isLiveActive: false,

  setAudioPath: (p) => set({ audioPath: p }),
  setDuration: (d) => set({ durationSec: d }),
  setCurrentTime: (t) => set({ currentTime: t }),
  setIsPlaying: (v) => set({ isPlaying: v }),
  setSegments: (s) => set({ segments: s }),
  setRhymePairs: (r) => set({ rhymePairs: r }),
  setSections: (s) => set({ sections: s }),
  setFx: (key, value) => set(state => ({ fx: { ...state.fx, [key]: value } })),
  setProcessing: (step) => set({ isProcessing: true, processStep: step }),
  clearProcessing: () => set({ isProcessing: false, processStep: '' }),
  setLiveActive: (v) => set({ isLiveActive: v }),
}));
