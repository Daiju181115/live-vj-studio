import React, { useRef, useEffect, useMemo, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useVjStore } from '../store/vjStore';
import { getAudioEngine } from '../engine/AudioEngine';
import { getEffectEngine, EffectId } from '../engine/EffectEngine';
import { VISUAL_PRESETS, PresetId, PRESET_IDS } from '../engine/VisualPresets';

const FREQ_COUNT = 1024;

// ── FFT テクスチャ ─────────────────────────────────────────────
let _fftTex: THREE.DataTexture | null = null;
function getFFTTexture() {
  if (!_fftTex) {
    _fftTex = new THREE.DataTexture(new Uint8Array(FREQ_COUNT * 4), FREQ_COUNT, 1, THREE.RGBAFormat);
    _fftTex.needsUpdate = true;
  }
  return _fftTex;
}

// ═══════════════════════════════════════════════════════════════
// シェーダー定義
// ═══════════════════════════════════════════════════════════════

const PARTICLE_VERT = /* glsl */`
uniform sampler2D uFFT;
uniform float uTime;
uniform float uGlow;
uniform float uHue;
uniform float uCameraSpeed;
uniform float uFlash;
uniform float uSpin;
uniform float uDrop;

attribute float aIdx;
attribute vec3  aVelocity;

varying float vEnergy;
varying float vAlpha;
varying vec3  vColor;

vec3 hsl2rgb(float h, float s, float l) {
  vec3 rgb = clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
  return l + s * (rgb - 0.5) * (1.0 - abs(2.0 * l - 1.0));
}

void main() {
  float bin  = aIdx / float(${FREQ_COUNT});
  float freq = texture2D(uFFT, vec2(bin, 0.5)).r;
  vEnergy = freq;

  vec3 pos = position;

  // スピンエフェクト: 角速度を上げる
  float angle = aIdx * 0.01 + uTime * (uCameraSpeed * 0.4 + uSpin * 2.0);
  pos.x += sin(angle) * (1.5 + freq * 4.0);
  pos.y += cos(angle * 1.3) * (1.0 + freq * 3.0);
  pos.z += sin(angle * 0.7 + uTime * 0.3) * (0.5 + freq * 2.0);

  // ドロップエフェクト: 全パーティクルが爆発的に広がる
  pos += aVelocity * uDrop * 6.0;

  gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);

  float size = 2.0 + freq * 6.0 * (1.0 + uGlow) + uFlash * 4.0;
  gl_PointSize = size * (300.0 / max(0.001, -gl_Position.z));

  // 色相: FX + フラッシュで白飛び
  float h = uHue + freq * 0.15;
  float l = 0.4 + freq * 0.4 + uFlash * 0.4;
  vColor = mix(hsl2rgb(h, 0.85, l), vec3(1.0), uFlash * 0.7);
  vAlpha = (0.4 + freq * 0.6) * (1.0 + uGlow * 0.5);
}
`;

const PARTICLE_FRAG = /* glsl */`
varying float vEnergy;
varying float vAlpha;
varying vec3  vColor;

void main() {
  vec2  c    = gl_PointCoord - 0.5;
  float dist = length(c);
  if (dist > 0.5) discard;

  float edge  = smoothstep(0.5, 0.2, dist);
  gl_FragColor = vec4(vColor, edge * vAlpha);
}
`;

// フルスクリーンフラッシュ用シェーダー
const FLASH_VERT = /* glsl */`
void main() {
  gl_Position = vec4(position, 1.0);
}
`;
const FLASH_FRAG = /* glsl */`
uniform float uIntensity;
uniform vec3  uColor;
void main() {
  gl_FragColor = vec4(uColor, uIntensity * 0.9);
}
`;

// ═══════════════════════════════════════════════════════════════
// コンポーネント
// ═══════════════════════════════════════════════════════════════

// ── FFT連動パーティクルフィールド ────────────────────────────────
function AudioParticles({ presetId }: { presetId: PresetId }) {
  const matRef = useRef<THREE.ShaderMaterial>(null);
  const preset = VISUAL_PRESETS[presetId];
  const COUNT  = 4000;

  const { positions, velocities, indices } = useMemo(() => {
    const positions  = new Float32Array(COUNT * 3);
    const velocities = new Float32Array(COUNT * 3);
    const indices    = new Float32Array(COUNT);
    for (let i = 0; i < COUNT; i++) {
      positions[i*3]   = (Math.random() - 0.5) * 22;
      positions[i*3+1] = (Math.random() - 0.5) * 22;
      positions[i*3+2] = (Math.random() - 0.5) * 22;
      velocities[i*3]  = (Math.random() - 0.5) * 2;
      velocities[i*3+1]= (Math.random() - 0.5) * 2;
      velocities[i*3+2]= (Math.random() - 0.5) * 2;
      indices[i] = i % FREQ_COUNT;
    }
    return { positions, velocities, indices };
  }, []);

  const uniforms = useMemo(() => ({
    uFFT:         { value: getFFTTexture() },
    uTime:        { value: 0.0 },
    uGlow:        { value: preset.glowIntensity },
    uHue:         { value: preset.particleHue },
    uCameraSpeed: { value: preset.cameraSpeed },
    uFlash:       { value: 0.0 },
    uSpin:        { value: 0.0 },
    uDrop:        { value: 0.0 },
  }), []);

  useFrame((state, delta) => {
    if (!matRef.current) return;
    const { fx } = useVjStore.getState();
    const fxEng  = getEffectEngine();
    const engine = getAudioEngine();
    fxEng.tick(delta);

    // FFT テクスチャ更新
    const tex  = uniforms.uFFT.value as THREE.DataTexture;
    const data = tex.image.data as Uint8Array;
    for (let i = 0; i < FREQ_COUNT; i++) {
      const v = engine.freqData[i] ?? 0;
      data[i*4] = data[i*4+1] = data[i*4+2] = v;
      data[i*4+3] = 255;
    }
    tex.needsUpdate = true;

    // uniforms 更新
    const u = matRef.current.uniforms;
    u.uTime.value        = state.clock.elapsedTime;
    u.uGlow.value        = fx.glowIntensity;
    u.uHue.value         = fx.hueShift + preset.particleHue;
    u.uCameraSpeed.value = fx.cameraSpeed + preset.cameraSpeed * 0.3;
    u.uFlash.value       = fxEng.get('flash').intensity + fxEng.get('drop').intensity * 0.5;
    u.uSpin.value        = fxEng.get('spin').intensity;
    u.uDrop.value        = fxEng.get('drop').intensity;
  });

  return (
    <points>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position"  array={positions}  count={COUNT} itemSize={3} />
        <bufferAttribute attach="attributes-aVelocity" array={velocities} count={COUNT} itemSize={3} />
        <bufferAttribute attach="attributes-aIdx"      array={indices}    count={COUNT} itemSize={1} />
      </bufferGeometry>
      <shaderMaterial
        ref={matRef}
        vertexShader={PARTICLE_VERT}
        fragmentShader={PARTICLE_FRAG}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}

// ── フルスクリーンフラッシュオーバーレイ ─────────────────────────
function FlashOverlay({ presetId }: { presetId: PresetId }) {
  const matRef = useRef<THREE.ShaderMaterial>(null);
  const preset = VISUAL_PRESETS[presetId];

  const uniforms = useMemo(() => ({
    uIntensity: { value: 0.0 },
    uColor: { value: new THREE.Color(...preset.flashColor) },
  }), []);

  useFrame(() => {
    if (!matRef.current) return;
    const fxEng = getEffectEngine();
    const flash = fxEng.get('flash').intensity;
    const star  = fxEng.get('star').intensity  * 0.4;
    matRef.current.uniforms.uIntensity.value = Math.min(1, flash + star);
    matRef.current.uniforms.uColor.value.set(...preset.flashColor);
  });

  return (
    <mesh renderOrder={10}>
      <planeGeometry args={[2, 2]} />
      <shaderMaterial
        ref={matRef}
        vertexShader={FLASH_VERT}
        fragmentShader={FLASH_FRAG}
        uniforms={uniforms}
        transparent
        depthTest={false}
        depthWrite={false}
      />
    </mesh>
  );
}

// ── 歌詞テキスト（3Dスクロール） ─────────────────────────────────
function LyricDisplay() {
  const { segments, currentTime } = useVjStore();
  const groupRef = useRef<THREE.Group>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const texRef = useRef<THREE.CanvasTexture | null>(null);
  const meshRef = useRef<THREE.Mesh>(null);
  const lastTextRef = useRef('');

  // Canvas テキストレンダラー（troika-three-text の代わりにCanvasTextureで実装）
  useEffect(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 256;
    canvasRef.current = canvas;
    texRef.current = new THREE.CanvasTexture(canvas);
    if (meshRef.current) {
      (meshRef.current.material as THREE.MeshBasicMaterial).map = texRef.current;
    }
  }, []);

  useFrame((state, delta) => {
    if (!groupRef.current || !canvasRef.current || !texRef.current || !meshRef.current) return;

    // 現在の歌詞を検索
    const time = useVjStore.getState().currentTime;
    const segs = useVjStore.getState().segments;
    const active = segs.find(s => time >= s.start && time < s.end);
    const text = active?.text ?? '';

    if (text !== lastTextRef.current) {
      lastTextRef.current = text;
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d')!;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      if (text) {
        const fxEng = getEffectEngine();
        const rhyme = fxEng.get('rhyme').intensity;
        const isRhyme = rhyme > 0.3;

        // 背景グラデーション（韻踏み時はゴールド）
        const grad = ctx.createLinearGradient(0, 0, canvas.width, 0);
        if (isRhyme) {
          grad.addColorStop(0, 'rgba(251,191,36,0.0)');
          grad.addColorStop(0.5, 'rgba(251,191,36,0.3)');
          grad.addColorStop(1, 'rgba(251,191,36,0.0)');
        }
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // テキスト
        ctx.font = `bold ${Math.min(80, Math.floor(900 / text.length + 10))}px "Outfit", sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        // グロウ効果
        ctx.shadowColor = isRhyme ? '#fbbf24' : '#22d3ee';
        ctx.shadowBlur = 20 + (isRhyme ? 20 : 0);
        ctx.fillStyle = isRhyme ? '#fef3c7' : '#ffffff';
        ctx.fillText(text, canvas.width / 2, canvas.height / 2, canvas.width - 40);

        // 二重描画でグロウを強調
        ctx.shadowBlur = 40;
        ctx.fillText(text, canvas.width / 2, canvas.height / 2, canvas.width - 40);
      }

      texRef.current.needsUpdate = true;
    }

    // 位置を揺らす（beat エフェクトで跳ねる）
    const beat = getEffectEngine().get('beat').intensity;
    if (groupRef.current) {
      groupRef.current.position.y = -3.5 + beat * 0.3;
      groupRef.current.scale.setScalar(1.0 + beat * 0.05);
    }
  });

  return (
    <group ref={groupRef} position={[0, -3.5, 0]}>
      <mesh ref={meshRef}>
        <planeGeometry args={[12, 3]} />
        <meshBasicMaterial transparent opacity={0.95} depthWrite={false} />
      </mesh>
    </group>
  );
}

// ── 韻エコーパーティクル ────────────────────────────────────────
function RhymeEchoRing() {
  const ringRef = useRef<THREE.Mesh>(null);

  useFrame((_, delta) => {
    if (!ringRef.current) return;
    const rhyme = getEffectEngine().get('rhyme').intensity;
    ringRef.current.visible = rhyme > 0.01;
    if (rhyme > 0) {
      const scale = 1 + (1 - rhyme) * 8;
      ringRef.current.scale.setScalar(scale);
      (ringRef.current.material as THREE.MeshBasicMaterial).opacity = rhyme * 0.6;
    }
  });

  return (
    <mesh ref={ringRef} visible={false}>
      <ringGeometry args={[2.8, 3, 64]} />
      <meshBasicMaterial color="#22d3ee" transparent opacity={0} side={THREE.DoubleSide} depthWrite={false} />
    </mesh>
  );
}

// ── オートカメラ（FX + エフェクト連動） ─────────────────────────
function AutoCamera({ presetId }: { presetId: PresetId }) {
  const { camera } = useThree();
  const preset = VISUAL_PRESETS[presetId];
  const fovRef = useRef(75);

  useFrame((state) => {
    const { fx } = useVjStore.getState();
    const fxEng  = getEffectEngine();
    const t = state.clock.elapsedTime;
    const sp = (fx.cameraSpeed + preset.cameraSpeed * 0.3) * 0.4 + 0.05;

    camera.position.x = Math.sin(t * sp * 0.3) * 7;
    camera.position.y = Math.cos(t * sp * 0.2) * 3;
    camera.position.z = 12 + Math.sin(t * sp * 0.15) * 5;
    camera.lookAt(0, 0, 0);

    // ズームバーストエフェクト
    const zoom = fxEng.get('zoom').intensity;
    const targetFov = 75 - zoom * 30;
    fovRef.current += (targetFov - fovRef.current) * 0.15;
    (camera as THREE.PerspectiveCamera).fov = fovRef.current;
    (camera as THREE.PerspectiveCamera).updateProjectionMatrix();
  });

  return null;
}

// ── トリガー受信・EffectEngine 発火 ─────────────────────────────
function TriggerBridge() {
  useEffect(() => {
    if (!window.api?.onLiveControl) return;

    const unlisten = window.api.onLiveControl((payload) => {
      const fxEng = getEffectEngine();
      if (payload.type === 'fxSlider' && payload.value !== undefined) {
        useVjStore.getState().setFx(payload.key as any, payload.value);
      }
      if (payload.type === 'triggerPad') {
        fxEng.fire(payload.key as EffectId);
      }
    });

    return unlisten;
  }, []);

  return null;
}

// ── ビートでパーティクルを点滅させる背景メッシュ ────────────────
function BeatPulse({ presetId }: { presetId: PresetId }) {
  const matRef = useRef<THREE.MeshBasicMaterial>(null);
  const preset = VISUAL_PRESETS[presetId];

  useFrame(() => {
    if (!matRef.current) return;
    const beat = getEffectEngine().get('beat').intensity;
    const [r, g, b] = preset.flashColor;
    matRef.current.color.setRGB(r * beat * 0.3, g * beat * 0.3, b * beat * 0.3);
  });

  return (
    <mesh position={[0, 0, -15]}>
      <planeGeometry args={[200, 200]} />
      <meshBasicMaterial ref={matRef} color="#000000" />
    </mesh>
  );
}

// ═══════════════════════════════════════════════════════════════
// LiveStage メインコンポーネント
// ═══════════════════════════════════════════════════════════════

export function LiveStage() {
  const { setLiveActive } = useVjStore();
  const [presetId, setPresetId] = useState<PresetId>('cyber');
  const preset = VISUAL_PRESETS[presetId];

  useEffect(() => {
    setLiveActive(true);

    // AudioEngine 解析ループを開始（LiveStage でも）
    const engine = getAudioEngine();
    engine.startAnalysisLoop();

    // BEATトリガー
    engine.onBeat = () => { getEffectEngine().fire('beat', 0.8); };

    return () => {
      setLiveActive(false);
      engine.onBeat = null;
    };
  }, []);

  // プリセット切り替えはメインウィンドウから VJControlPayload で受信
  useEffect(() => {
    if (!window.api?.onLiveControl) return;
    const unlisten = window.api.onLiveControl((payload) => {
      if (payload.type === 'themeChange' && PRESET_IDS.includes(payload.key as PresetId)) {
        setPresetId(payload.key as PresetId);
      }
    });
    return unlisten;
  }, []);

  const bgColor = `rgb(${preset.bgColor.map(v => Math.round(v * 255)).join(',')})`;

  return (
    <div style={{ width: '100vw', height: '100vh', background: bgColor, overflow: 'hidden' }}>
      <Canvas
        gl={{
          antialias: false,
          alpha: false,
          powerPreference: 'high-performance',
          stencil: false,
          depth: true,
        }}
        camera={{ position: [0, 0, 12], fov: 75 }}
        dpr={Math.min(window.devicePixelRatio, 2)}
        style={{ width: '100%', height: '100%' }}
      >
        <color attach="background" args={[preset.bgColor[0], preset.bgColor[1], preset.bgColor[2]]} />

        {/* ブリッジ */}
        <TriggerBridge />

        {/* カメラ */}
        <AutoCamera presetId={presetId} />

        {/* 背景ビート */}
        <BeatPulse presetId={presetId} />

        {/* パーティクル */}
        <AudioParticles presetId={presetId} />

        {/* 韻エコーリング */}
        <RhymeEchoRing />

        {/* 歌詞 */}
        <LyricDisplay />

        {/* フラッシュオーバーレイ（最前面） */}
        <FlashOverlay presetId={presetId} />
      </Canvas>
    </div>
  );
}
