import React, { useRef, useEffect, useMemo } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useVjStore } from '../store/vjStore';

// ── Audio-reactive particle system (Phase 3 placeholder) ──
function ParticleField() {
  const meshRef = useRef<THREE.Points>(null);
  const { fx, currentTime } = useVjStore();

  const { positions, count } = useMemo(() => {
    const count = 3000;
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      positions[i * 3]     = (Math.random() - 0.5) * 20;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 20;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 20;
    }
    return { positions, count };
  }, []);

  useFrame((state) => {
    if (!meshRef.current) return;
    const t = state.clock.elapsedTime;
    const speed = fx.cameraSpeed * 0.5 + 0.1;
    meshRef.current.rotation.y = t * speed * 0.2;
    meshRef.current.rotation.x = Math.sin(t * speed * 0.1) * 0.3;

    // グロウ強度を材質の sizeAttenuation で表現
    const mat = meshRef.current.material as THREE.PointsMaterial;
    mat.size = 0.04 + fx.glowIntensity * 0.08;
    mat.opacity = 0.5 + fx.glowIntensity * 0.5;

    // 色相シフト
    const hue = fx.hueShift;
    mat.color.setHSL(hue, 0.8, 0.6);
  });

  return (
    <points ref={meshRef}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          array={positions}
          count={count}
          itemSize={3}
        />
      </bufferGeometry>
      <pointsMaterial
        size={0.06}
        transparent
        opacity={0.8}
        sizeAttenuation
        color="#6366f1"
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </points>
  );
}

// ── Camera auto-fly ──
function AutoCamera() {
  const { camera } = useThree();
  const { fx, currentTime } = useVjStore();

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const speed = fx.cameraSpeed;

    camera.position.x = Math.sin(t * speed * 0.3) * 5;
    camera.position.y = Math.cos(t * speed * 0.2) * 2;
    camera.position.z = 8 + Math.sin(t * speed * 0.15) * 3;
    camera.lookAt(0, 0, 0);
  });

  return null;
}

// ── Live canvas scene ──
function VJScene() {
  return (
    <>
      <color attach="background" args={['#000008']} />
      <ambientLight intensity={0.1} />
      <AutoCamera />
      <ParticleField />
    </>
  );
}

/**
 * ライブウィンドウ（外部ディスプレイ投影用）
 * App.tsx から hash="#live" のときにレンダーされる
 */
export function LiveStage() {
  const { setFx, isLiveActive, setLiveActive } = useVjStore();

  // メインウィンドウからのDJコントロールを受信
  useEffect(() => {
    if (!window.api?.onLiveControl) return;

    const unlisten = window.api.onLiveControl((payload) => {
      if (payload.type === 'fxSlider' && payload.value !== undefined) {
        setFx(payload.key as any, payload.value);
      }
      if (payload.type === 'triggerPad') {
        handleTriggerPad(payload.key);
      }
    });

    setLiveActive(true);
    return () => {
      unlisten();
      setLiveActive(false);
    };
  }, []);

  const handleTriggerPad = (padId: string) => {
    // Phase 3 でシェーダーへの直接インジェクションに置き換える
    console.log('[LiveStage] Trigger pad:', padId);
  };

  return (
    <div style={{ width: '100vw', height: '100vh', background: '#000008', overflow: 'hidden' }}>
      <Canvas
        gl={{ antialias: true, alpha: false }}
        camera={{ position: [0, 0, 8], fov: 75 }}
        style={{ width: '100%', height: '100%' }}
      >
        <VJScene />
      </Canvas>
    </div>
  );
}
