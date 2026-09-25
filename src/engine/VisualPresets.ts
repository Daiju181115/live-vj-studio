/**
 * VJ Studio - Visual Preset Definitions
 *
 * プリセットはシェーダーの uniform 初期値とカメラ動作を定義する。
 * DJミキサーで瞬時に切り替え可能。
 */

export type PresetId = 'cyber' | 'cityPop' | 'lofi' | 'abstract' | 'darkness';

export interface VisualPreset {
  id: PresetId;
  label: string;
  emoji: string;
  bgColor: [number, number, number];     // RGB 0〜1
  particleHue: number;                   // 0〜1
  particleSaturation: number;
  glowIntensity: number;
  cameraSpeed: number;
  // エフェクトカラーオーバーライド
  flashColor: [number, number, number];
  accentColor: string;                   // CSS color for UI
}

export const VISUAL_PRESETS: Record<PresetId, VisualPreset> = {
  cyber: {
    id: 'cyber',
    label: 'CYBER',
    emoji: '⚡',
    bgColor: [0.0, 0.0, 0.04],
    particleHue: 0.58,          // cyan
    particleSaturation: 0.9,
    glowIntensity: 0.7,
    cameraSpeed: 0.35,
    flashColor: [0.13, 0.83, 0.94],
    accentColor: '#22d3ee',
  },
  cityPop: {
    id: 'cityPop',
    label: 'CITY POP',
    emoji: '🌆',
    bgColor: [0.05, 0.02, 0.08],
    particleHue: 0.83,          // pink-purple
    particleSaturation: 0.8,
    glowIntensity: 0.5,
    cameraSpeed: 0.2,
    flashColor: [0.96, 0.45, 0.7],
    accentColor: '#f472b6',
  },
  lofi: {
    id: 'lofi',
    label: 'LO-FI',
    emoji: '🎐',
    bgColor: [0.04, 0.04, 0.06],
    particleHue: 0.65,          // blue-indigo
    particleSaturation: 0.5,
    glowIntensity: 0.3,
    cameraSpeed: 0.12,
    flashColor: [0.7, 0.7, 0.9],
    accentColor: '#818cf8',
  },
  abstract: {
    id: 'abstract',
    label: 'ABSTRACT',
    emoji: '🌀',
    bgColor: [0.02, 0.0, 0.05],
    particleHue: 0.75,          // purple
    particleSaturation: 1.0,
    glowIntensity: 0.9,
    cameraSpeed: 0.5,
    flashColor: [0.67, 0.33, 1.0],
    accentColor: '#a855f7',
  },
  darkness: {
    id: 'darkness',
    label: 'DARKNESS',
    emoji: '🖤',
    bgColor: [0.0, 0.0, 0.0],
    particleHue: 0.0,           // red
    particleSaturation: 1.0,
    glowIntensity: 1.0,
    cameraSpeed: 0.4,
    flashColor: [1.0, 0.1, 0.1],
    accentColor: '#ef4444',
  },
};

export const PRESET_IDS = Object.keys(VISUAL_PRESETS) as PresetId[];
