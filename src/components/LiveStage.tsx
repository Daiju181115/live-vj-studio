import React, { useRef, useEffect, useMemo } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useVjStore } from '../store/vjStore';
import { getAudioEngine } from '../engine/AudioEngine';

const FREQ_COUNT = 1024;

// ── FFT データテクスチャを保持するシングルトン ──────────────────
let fftTexture: THREE.DataTexture | null = null;

function getFFTTexture(): THREE.DataTexture {
  if (!fftTexture) {
    const data = new Uint8Array(FREQ_COUNT * 4);
    fftTexture = new THREE.DataTexture(data, FREQ_COUNT, 1, THREE.RGBAFormat);
    fftTexture.needsUpdate = true;
  }
  return fftTexture;
}

// ── パーティクルシェーダー ───────────────────────────────────────

const vertexShader = /* glsl */`
  uniform sampler2D uFFT;
  uniform float uTime;
  uniform float uGlow;
  uniform float uHue;
  uniform float uCameraSpeed;

  attribute float aIndex;

  varying float vEnergy;
  varying float vHue;

  void main() {
    // FFT からエネルギー取得
    float bin = aIndex / float(${FREQ_COUNT});
    float energy = texture2D(uFFT, vec2(bin, 0.5)).r;
    vEnergy = energy;
    vHue = uHue;

    // 位置をエネルギーで揺らす
    vec3 pos = position;
    float angle = aIndex * 0.01 + uTime * uCameraSpeed * 0.3;
    pos.x += sin(angle) * energy * 3.0;
    pos.y += cos(angle * 1.3) * energy * 2.0;
    pos.z += sin(angle * 0.7 + uTime * 0.2) * energy * 1.5;

    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
    gl_PointSize = (2.0 + energy * 8.0 * uGlow) * (300.0 / -gl_Position.z);
  }
`;

const fragmentShader = /* glsl */`
  uniform float uGlow;
  varying float vEnergy;
  varying float vHue;

  // HSL to RGB
  vec3 hsl2rgb(float h, float s, float l) {
    vec3 rgb = clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
    return l + s * (rgb - 0.5) * (1.0 - abs(2.0 * l - 1.0));
  }

  void main() {
    // 円形パーティクル
    vec2 center = gl_PointCoord - 0.5;
    float dist = length(center);
    if (dist > 0.5) discard;

    float alpha = (0.5 - dist) * 2.0 * (0.3 + vEnergy * 0.7);
    vec3 color = hsl2rgb(vHue, 0.8, 0.5 + vEnergy * 0.4);
    gl_FragColor = vec4(color * (1.0 + uGlow * 2.0), alpha);
  }
`;

// ── パーティクルフィールド（FFT連動） ───────────────────────────

function AudioParticles() {
  const meshRef = useRef<THREE.Points>(null);
  const matRef = useRef<THREE.ShaderMaterial>(null);

  const COUNT = 3000;

  const { positions, indices } = useMemo(() => {
    const positions = new Float32Array(COUNT * 3);
    const indices = new Float32Array(COUNT);
    for (let i = 0; i < COUNT; i++) {
      positions[i * 3]     = (Math.random() - 0.5) * 20;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 20;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 20;
      indices[i] = i % FREQ_COUNT;
    }
    return { positions, indices };
  }, []);

  const uniforms = useMemo(() => ({
    uFFT:         { value: getFFTTexture() },
    uTime:        { value: 0 },
    uGlow:        { value: 0.5 },
    uHue:         { value: 0 },
    uCameraSpeed: { value: 0.3 },
  }), []);

  useFrame((state) => {
    if (!matRef.current) return;
    const { fx } = useVjStore.getState();

    // FFT テクスチャ更新
    const engine = getAudioEngine();
    const tex = uniforms.uFFT.value as THREE.DataTexture;
    const data = tex.image.data as Uint8Array;
    for (let i = 0; i < FREQ_COUNT; i++) {
      const v = engine.freqData[i] ?? 0;
      data[i * 4]     = v;    // R
      data[i * 4 + 1] = v;    // G
      data[i * 4 + 2] = v;    // B
      data[i * 4 + 3] = 255;  // A
    }
    tex.needsUpdate = true;

    // uniforms 更新
    uniforms.uTime.value = state.clock.elapsedTime;
    uniforms.uGlow.value = fx.glowIntensity;
    uniforms.uHue.value  = fx.hueShift;
    uniforms.uCameraSpeed.value = fx.cameraSpeed;
  });

  return (
    <points ref={meshRef}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" array={positions} count={COUNT} itemSize={3} />
        <bufferAttribute attach="attributes-aIndex"   array={indices}   count={COUNT} itemSize={1} />
      </bufferGeometry>
      <shaderMaterial
        ref={matRef}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}

// ── 自動カメラ（FX連動） ─────────────────────────────────────────

function AutoCamera() {
  const { camera } = useThree();

  useFrame((state) => {
    const { fx } = useVjStore.getState();
    const t = state.clock.elapsedTime;
    const sp = fx.cameraSpeed * 0.4 + 0.05;
    camera.position.x = Math.sin(t * sp * 0.3) * 6;
    camera.position.y = Math.cos(t * sp * 0.2) * 3;
    camera.position.z = 10 + Math.sin(t * sp * 0.15) * 4;
    camera.lookAt(0, 0, 0);
  });

  return null;
}

// ── トリガーパッドエフェクト処理（Live ウィンドウ内） ────────────

function TriggerEffectHandler() {
  const engineRef = useRef({ flashIntensity: 0, zoomBurst: 0 });
  const { camera } = useThree();

  // メインウィンドウからのコントロール受信
  useEffect(() => {
    if (!window.api?.onLiveControl) return;

    const unlisten = window.api.onLiveControl((payload) => {
      if (payload.type === 'fxSlider' && payload.value !== undefined) {
        useVjStore.getState().setFx(payload.key as any, payload.value);
      }
      if (payload.type === 'triggerPad') {
        switch (payload.key) {
          case 'flash':
            engineRef.current.flashIntensity = 1.0;
            break;
          case 'zoom':
            engineRef.current.zoomBurst = 1.0;
            break;
        }
      }
    });

    return unlisten;
  }, []);

  useFrame((_, delta) => {
    // フラッシュ減衰
    engineRef.current.flashIntensity = Math.max(0, engineRef.current.flashIntensity - delta * 5);
    engineRef.current.zoomBurst = Math.max(0, engineRef.current.zoomBurst - delta * 3);
  });

  return null;
}

// ── LiveStage メイン ─────────────────────────────────────────────

export function LiveStage() {
  const { setLiveActive } = useVjStore();

  useEffect(() => {
    setLiveActive(true);
    return () => setLiveActive(false);
  }, []);

  return (
    <div style={{ width: '100vw', height: '100vh', background: '#000010', overflow: 'hidden' }}>
      <Canvas
        gl={{ antialias: false, alpha: false, powerPreference: 'high-performance' }}
        camera={{ position: [0, 0, 10], fov: 75 }}
        dpr={window.devicePixelRatio}
        style={{ width: '100%', height: '100%' }}
      >
        <color attach="background" args={['#000010']} />
        <AutoCamera />
        <TriggerEffectHandler />
        <AudioParticles />
      </Canvas>
    </div>
  );
}
