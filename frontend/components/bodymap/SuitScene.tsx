'use client';

import { Html, Line, OrbitControls, useGLTF } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Component, Suspense, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import * as THREE from 'three';
import type { ZoneId } from '../../lib/api/types';
import { SvgFallback } from './SvgFallback';
import { bodyZones, homeCamera, scoreColor, suitHeight, suitOffset, suitRotationY } from './zones';
import styles from './BodyMap.module.css';

interface SuitSceneProps {
  scores: Record<ZoneId, number>;
  heartRate: number;
  respiration: number;
  selectedZone: ZoneId | null;
  onSelectZone: (zone: ZoneId | null) => void;
  reducedMotion: boolean;
}

export default function SuitScene(props: SuitSceneProps) {
  const [visible, setVisible] = useState(true);
  const [webglAvailable, setWebglAvailable] = useState<boolean | null>(null);
  const controls = useRef<any>(null);

  useEffect(() => {
    const updateVisibility = () => setVisible(document.visibilityState === 'visible');
    document.addEventListener('visibilitychange', updateVisibility);
    return () => document.removeEventListener('visibilitychange', updateVisibility);
  }, []);

  useEffect(() => {
    try {
      const canvas = document.createElement('canvas');
      setWebglAvailable(Boolean(window.WebGLRenderingContext && (canvas.getContext('webgl2') || canvas.getContext('webgl'))));
    } catch {
      setWebglAvailable(false);
    }
  }, []);

  if (webglAvailable === false) return <SvgFallback scores={props.scores} selectedZone={props.selectedZone} onSelectZone={props.onSelectZone} />;
  if (webglAvailable === null) return <div className={styles.sceneLoading}><span className={styles.loaderMark} /><span>CHECKING WEBGL SUPPORT</span></div>;

  return (
    <SceneErrorBoundary fallback={<SvgFallback scores={props.scores} selectedZone={props.selectedZone} onSelectZone={props.onSelectZone} />}>
      <Canvas
        className={styles.canvas}
        dpr={[1, 1.5]}
        camera={{ position: homeCamera, fov: 34, near: 0.1, far: 40 }}
        gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
        aria-label="Interactive three-dimensional NASA EMU suit health map"
        onPointerMissed={() => props.onSelectZone(null)}
      >
        <color attach="background" args={['#07101b']} />
        <fog attach="fog" args={['#07101b', 8, 18]} />
        <ambientLight intensity={1.8} color="#dbeafe" />
        <directionalLight position={[4, 6, 5]} intensity={3.0} color="#ffffff" />
        <directionalLight position={[-4, 2, -3]} intensity={2.2} color="#1d4ed8" />
        <pointLight position={[0, 2.5, 3]} intensity={18} color="#60a5fa" />
        <gridHelper args={[8, 28, '#25456b', '#14273c']} position={[0, -suitHeight / 2 - 0.02, 0]} />
        <mesh position={[0, -suitHeight / 2 - 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.95, 1.02, 72]} />
          <meshBasicMaterial color="#4c8dff" transparent opacity={0.65} side={THREE.DoubleSide} />
        </mesh>
        <ScanRing reducedMotion={props.reducedMotion} />
        <LaserScanPlane reducedMotion={props.reducedMotion} />
        <Suspense fallback={<LoadingSuit />}>
          <SuitModel reducedMotion={props.reducedMotion} />
          <OrganVolumes {...props} />
          <ZoneHotspots {...props} />
        </Suspense>
        <SceneCamera selectedZone={props.selectedZone} controls={controls} />
        <OrbitControls
          ref={controls}
          makeDefault
          enableDamping
          dampingFactor={0.075}
          enablePan={false}
          minDistance={2.7}
          maxDistance={8}
          minPolarAngle={0.2}
          maxPolarAngle={Math.PI - 0.2}
          autoRotate={!props.selectedZone && !props.reducedMotion && visible}
          autoRotateSpeed={0.34}
        />
      </Canvas>
    </SceneErrorBoundary>
  );
}

class SceneErrorBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

function LaserScanPlane({ reducedMotion }: { reducedMotion: boolean }) {
  const ref = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (ref.current && !reducedMotion) {
      ref.current.position.y = Math.sin(clock.elapsedTime * 0.7) * 1.25;
    }
  });
  return (
    <mesh ref={ref} rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[0.01, 1.05, 48]} />
      <meshBasicMaterial color="#00f3ff" transparent opacity={0.22} side={THREE.DoubleSide} />
    </mesh>
  );
}

function SuitModel({ reducedMotion }: { reducedMotion: boolean }) {
  const gltf = useGLTF('/models/emu.glb', '/draco/');

  const model = useMemo(() => {
    const clone = gltf.scene.clone(true);
    const bounds = new THREE.Box3().setFromObject(clone);
    const size = bounds.getSize(new THREE.Vector3());
    const center = bounds.getCenter(new THREE.Vector3());
    const scale = suitHeight / Math.max(size.x, size.y, size.z);
    clone.scale.setScalar(scale);
    clone.position.set(-center.x * scale, -center.y * scale, -center.z * scale);

    clone.traverse(object => {
      if (!(object instanceof THREE.Mesh)) return;
      object.castShadow = true;
      object.receiveShadow = true;
      const addSuitFinish = (source: THREE.Material) => {
        const material = source.clone();
        if (material instanceof THREE.MeshStandardMaterial || material instanceof THREE.MeshPhysicalMaterial) {
          const name = (object.name + ' ' + (source.name || '')).toLowerCase();
          if (name.includes('visor')) {
            // Gold reflective Apollo / Artemis helmet visor
            material.color.set('#e5a93c');
            material.metalness = 0.95;
            material.roughness = 0.12;
            material.emissive.set('#452b05');
            material.emissiveIntensity = 0.5;
          } else {
            // High-contrast clean white spacesuit fabric with subtle cyan edge illumination
            material.color.set('#e2eaf5');
            material.metalness = 0.15;
            material.roughness = 0.42;
            material.emissive.set('#0d2238');
            material.emissiveIntensity = 0.28;
          }
          material.transparent = false;
          material.opacity = 1.0;
          material.depthWrite = true;
        }
        return material;
      };
      object.material = Array.isArray(object.material) ? object.material.map(addSuitFinish) : addSuitFinish(object.material);
    });
    return clone;
  }, [gltf.scene]);

  useEffect(() => () => {
    model.traverse(object => {
      if (object instanceof THREE.Mesh) {
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        materials.forEach(material => material.dispose());
      }
    });
  }, [model]);

  return <group position={suitOffset} rotation={[0, suitRotationY, 0]}><primitive object={model} /></group>;
}

function ScanRing({ reducedMotion }: { reducedMotion: boolean }) {
  const ring = useRef<THREE.Mesh>(null);

  useFrame((_, delta) => {
    if (ring.current && !reducedMotion) ring.current.rotation.z -= delta * 0.6;
  });

  return <mesh ref={ring} position={[0, -suitHeight / 2 - 0.005, 0]} rotation={[-Math.PI / 2, 0, 0]}>
    <ringGeometry args={[1.12, 1.16, 64, 1, 0, Math.PI * 0.55]} />
    <meshBasicMaterial color="#8fbcff" transparent opacity={0.75} side={THREE.DoubleSide} />
  </mesh>;
}

function OrganVolumes({ scores, heartRate, respiration, selectedZone, onSelectZone, reducedMotion }: SuitSceneProps) {
  return <group>
    {bodyZones.map(zone => <OrganVolume
      key={zone.id}
      zone={zone}
      score={scores[zone.id]}
      heartRate={heartRate}
      respiration={respiration}
      selected={selectedZone === zone.id}
      onSelect={() => onSelectZone(selectedZone === zone.id ? null : zone.id)}
      reducedMotion={reducedMotion}
    />)}
  </group>;
}

function OrganVolume({ zone, score, heartRate, respiration, selected, onSelect, reducedMotion }: {
  zone: typeof bodyZones[number]; score: number; heartRate: number; respiration: number; selected: boolean; onSelect: () => void; reducedMotion: boolean;
}) {
  const group = useRef<THREE.Group>(null);
  const color = scoreColor(score);

  useFrame(({ clock }) => {
    if (!group.current) return;
    const rate = zone.pulse === 'heart' ? heartRate / 60 : zone.pulse === 'lungs' ? respiration / 60 : 0;
    const pulse = reducedMotion || rate === 0 ? 1 : 1 + Math.sin(clock.elapsedTime * rate * Math.PI * 2) * (zone.pulse === 'heart' ? 0.08 : 0.05);
    const focus = selected ? 1.18 : 1;
    group.current.scale.setScalar(pulse * focus);
  });

  return <group ref={group} position={zone.position}>
    {zone.parts.map((offset, index) => <mesh key={index} position={offset} scale={zone.volumeScale} renderOrder={3} onClick={event => { event.stopPropagation(); onSelect(); }}>
      <sphereGeometry args={[1, 28, 24]} />
      <meshStandardMaterial color={color} emissive={color} emissiveIntensity={selected ? 2.5 : 1.8} transparent opacity={selected ? 0.9 : 0.75} depthWrite={false} roughness={0.15} metalness={0.1} />
    </mesh>)}
  </group>;
}

function ZoneHotspots({ scores, selectedZone, onSelectZone }: SuitSceneProps) {
  return <group>
    {bodyZones.map(zone => {
      const color = scoreColor(scores[zone.id]);
      return <group key={zone.id}>
        <Line points={[zone.position, zone.labelPosition]} color={color} lineWidth={0.8} transparent opacity={0.56} />
        <mesh position={zone.position}>
          <sphereGeometry args={[selectedZone === zone.id ? 0.055 : 0.035, 12, 12]} />
          <meshBasicMaterial color={color} />
        </mesh>
        <Html position={zone.labelPosition} center distanceFactor={7} zIndexRange={[3, 0]}>
          <button
            className={`${styles.hotspot} ${selectedZone === zone.id ? styles.hotspotSelected : ''}`}
            style={{ '--zone-color': color } as CSSProperties}
            type="button"
            aria-label={`Open ${zone.shortTitle}, index ${scores[zone.id]}`}
            aria-pressed={selectedZone === zone.id}
            onClick={() => onSelectZone(selectedZone === zone.id ? null : zone.id)}
          >
            <span>{zone.code}</span><strong>{zone.shortTitle}</strong><b>{scores[zone.id]}</b>
          </button>
        </Html>
      </group>;
    })}
  </group>;
}

function SceneCamera({ selectedZone, controls }: { selectedZone: ZoneId | null; controls: React.RefObject<any> }) {
  const { camera } = useThree();
  const flight = useRef({ until: 0, started: false, target: new THREE.Vector3(), destination: new THREE.Vector3() });

  useEffect(() => {
    const zone = bodyZones.find(item => item.id === selectedZone);
    if (!zone && !flight.current.started) return;
    flight.current.started = true;
    if (zone) {
      flight.current.target.set(...zone.position);
      flight.current.destination.set(zone.position[0] * 0.5 + 1.15, zone.position[1] + 0.22, zone.position[2] + 2.9);
    } else {
      flight.current.target.set(0, 0, 0);
      flight.current.destination.set(...homeCamera);
    }
    flight.current.until = performance.now() + 1700;
  }, [selectedZone]);

  useFrame(() => {
    if (!controls.current || performance.now() > flight.current.until) return;
    camera.position.lerp(flight.current.destination, 0.07);
    controls.current.target.lerp(flight.current.target, 0.08);
    controls.current.update();
  });

  return null;
}

function LoadingSuit() {
  return <group>
    <mesh position={[0, 0, 0]}>
      <capsuleGeometry args={[0.38, 1.25, 6, 12]} />
      <meshStandardMaterial color="#15355b" wireframe transparent opacity={0.28} />
    </mesh>
    <mesh position={[0, 0.95, 0]}>
      <sphereGeometry args={[0.29, 18, 18]} />
      <meshBasicMaterial color="#4c8dff" wireframe transparent opacity={0.32} />
    </mesh>
  </group>;
}

useGLTF.preload('/models/emu.glb', '/draco/');
