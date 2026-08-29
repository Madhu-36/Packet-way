import React, { useRef, useState, useMemo } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Grid, Stars, Sparkles } from '@react-three/drei';
import * as THREE from 'three';
import { Bloom as BloomPP, ChromaticAberration as ChromaticAberrationPP, EffectComposer as EffectComposerPP } from '@react-three/postprocessing';
import { BlendFunction } from 'postprocessing';

const PROTO_COLOR = {
  TCP: new THREE.Color('#00f0ff'),
  UDP: new THREE.Color('#ffaa00'),
  ICMP: new THREE.Color('#a855f7'),
  OTHER: new THREE.Color('#6b7280'),
  SUSPICIOUS: new THREE.Color('#ff0000'), // For IDS
};

const SCALE = 0.1;
const LOGICAL_W = 2000;
const LOGICAL_H = 800;
const HALF_H = LOGICAL_H / 2;
const LANE_H = HALF_H / 4;
const SAFE_DIST = 45;

const MAX_INSTANCES = 5000;

function GlobeMap({ vehiclesRef }) {
  const meshRef = useRef();
  const dummy = useMemo(() => new THREE.Object3D(), []);
  
  useFrame(() => {
     if (!meshRef.current) return;
     let idx = 0;
     vehiclesRef.current.forEach(v => {
        if (v.geo && v.geo.ll && idx < MAX_INSTANCES) {
           const [lat, lon] = v.geo.ll;
           const R = 30;
           const phi = (90 - lat) * (Math.PI / 180);
           const theta = (lon + 180) * (Math.PI / 180);

           const x = -(R * Math.sin(phi) * Math.cos(theta));
           const z = (R * Math.sin(phi) * Math.sin(theta));
           const y = (R * Math.cos(phi));
           
           dummy.position.set(x, y, z);
           dummy.updateMatrix();
           meshRef.current.setMatrixAt(idx++, dummy.matrix);
        }
     });
     meshRef.current.count = idx;
     meshRef.current.instanceMatrix.needsUpdate = true;
  });

  return (
    <group position={[-150, 40, -50]}>
      <mesh>
        <sphereGeometry args={[30, 24, 24]} />
        <meshBasicMaterial color="#00f0ff" wireframe transparent opacity={0.15} />
      </mesh>
      <instancedMesh ref={meshRef} args={[null, null, MAX_INSTANCES]}>
        <sphereGeometry args={[0.8, 8, 8]} />
        <meshBasicMaterial color="#ff0000" />
      </instancedMesh>
    </group>
  );
}

function InstancedVehicles({ vehiclesRef, pausedRef, statsAccRef, selectedVehicle, setSelectedVehicle }) {
  const meshRefs = {
    CAR: useRef(),
    TRUCK: useRef(),
    BUS: useRef(),
    CYCLE: useRef(),
    CAB: useRef()
  };

  const instanceMap = useRef({ CAR: [], TRUCK: [], BUS: [], CYCLE: [], CAB: [] });

  const dummy = useMemo(() => new THREE.Object3D(), []);
  const color = useMemo(() => new THREE.Color(), []);


  useFrame((state, delta) => {
    const activeVehicles = vehiclesRef.current;
    
    if (!pausedRef.current) {
      const currentFps = delta > 0 ? 1 / delta : 60;
      statsAccRef.current.fps = statsAccRef.current.fps
        ? Math.round(statsAccRef.current.fps * 0.9 + currentFps * 0.1)
        : Math.round(currentFps);
      
      activeVehicles.forEach(v1 => {
        let frontVehicle = null;
        let minDistance = Infinity;

        activeVehicles.forEach(v2 => {
          if (v1 === v2 || v1.isInbound !== v2.isInbound || v1.laneIdx !== v2.laneIdx) return;
          const c1 = v1.x + v1.w / 2;
          const c2 = v2.x + v2.w / 2;
          let isAhead = false;
          let dist = 0;
          
          if (!v1.isInbound) {
            isAhead = c2 > c1 || (c2 === c1 && v2.uid > v1.uid);
            dist = c2 - c1 - (v1.w / 2 + v2.w / 2);
          } else {
            isAhead = c2 < c1 || (c2 === c1 && v2.uid > v1.uid);
            dist = c1 - c2 - (v1.w / 2 + v2.w / 2);
          }

          if (isAhead && dist < minDistance) {
            minDistance = dist;
            frontVehicle = v2;
          }
        });

        if (frontVehicle && minDistance < SAFE_DIST) {
          let overtook = false;
          const tryOvertake = (targetLane) => {
            if (targetLane < 0 || targetLane > 3) return false;
            const laneClear = !activeVehicles.some(v2 => {
              if (v1 === v2 || v1.isInbound !== v2.isInbound || v2.laneIdx !== targetLane) return false;
              return v1.x < v2.x + v2.w + SAFE_DIST && v1.x + v1.w + SAFE_DIST > v2.x;
            });

            if (laneClear) {
              v1.laneIdx = targetLane;
              const offset = v1.isInbound ? 0 : HALF_H;
              v1.targetY = offset + targetLane * LANE_H + (LANE_H / 2) - (v1.h / 2);
              return true;
            }
            return false;
          };

          if (Math.random() > 0.5) overtook = tryOvertake(v1.laneIdx - 1) || tryOvertake(v1.laneIdx + 1);
          else overtook = tryOvertake(v1.laneIdx + 1) || tryOvertake(v1.laneIdx - 1);

          if (!overtook) {
            v1.speed = frontVehicle.speed;
            if (minDistance < 0) v1.x -= (v1.isInbound ? -0.5 : 0.5);
          } else {
            v1.speed = v1.baseSpeed;
          }
        } else {
          if (Math.abs(v1.speed) < Math.abs(v1.baseSpeed)) {
             v1.speed += (v1.baseSpeed > 0 ? 0.08 : -0.08);
             if (Math.abs(v1.speed) > Math.abs(v1.baseSpeed)) v1.speed = v1.baseSpeed;
          }
        }

        if (Math.abs(v1.y - v1.targetY) > 0.5) {
          v1.y += (v1.targetY - v1.y) * 0.15;
        } else {
          v1.y = v1.targetY;
        }
        v1.x += v1.speed;
      });

      vehiclesRef.current = activeVehicles.filter(v => {
        if (v.isInbound) return v.x > -v.w - 400; 
        else return v.x < LOGICAL_W + 400;
      });
    }

    let counters = { CAR: 0, TRUCK: 0, BUS: 0, CYCLE: 0, CAB: 0 };

    Object.values(meshRefs).forEach(ref => {
      if (ref.current) ref.current.count = 0;
    });

    const time = Date.now() * 0.005;

    vehiclesRef.current.forEach(v => {
      const targetX = (v.x - LOGICAL_W / 2) * SCALE;
      const targetZ = (v.y - LOGICAL_H / 2) * SCALE;
      const w = v.w * SCALE;
      const h = v.h * SCALE;
      const h2 = h / 2;
      
      const type = v.type;
      const mesh = meshRefs[type]?.current;
      const idx = counters[type];
      
      if (mesh && idx < MAX_INSTANCES) {
        instanceMap.current[type][idx] = v;
        let blink = false;
        if (v.suspicious) {
          blink = (Math.sin(time * 5) > 0);
        }

        const baseC = blink ? PROTO_COLOR.SUSPICIOUS : (PROTO_COLOR[v.protocol] || PROTO_COLOR.OTHER);
        color.copy(baseC);
        
        dummy.position.set(targetX, h2 * 0.5, targetZ);
        dummy.rotation.set(0, v.isInbound ? Math.PI : 0, 0);
        
        if (type === 'CAR') {
          dummy.scale.set(w, h2, h);
          dummy.updateMatrix();
          mesh.setMatrixAt(idx, dummy.matrix);
          mesh.setColorAt(idx, color);
          
          const cabMesh = meshRefs.CAB.current;
          if (cabMesh && counters.CAB < MAX_INSTANCES) {
            instanceMap.current.CAB[counters.CAB] = v;
            dummy.position.set(targetX + w*0.1 * (v.isInbound ? -1 : 1), h2 * 1.5, targetZ);
            dummy.scale.set(w*0.5, h2, h*0.8);
            dummy.updateMatrix();
            cabMesh.setMatrixAt(counters.CAB, dummy.matrix);
            cabMesh.setColorAt(counters.CAB, new THREE.Color('#111827'));
            counters.CAB++;
          }
        } 
        else if (type === 'TRUCK') {
          dummy.scale.set(w*0.7, h, h);
          dummy.position.set(targetX - w*0.15 * (v.isInbound ? -1 : 1), h2, targetZ);
          dummy.updateMatrix();
          mesh.setMatrixAt(idx, dummy.matrix);
          mesh.setColorAt(idx, blink ? color : new THREE.Color('#d1d5db'));

          const cabMesh = meshRefs.CAB.current;
          if (cabMesh && counters.CAB < MAX_INSTANCES) {
            instanceMap.current.CAB[counters.CAB] = v;
            dummy.position.set(targetX + w*0.35 * (v.isInbound ? -1 : 1), h2*0.8, targetZ);
            dummy.scale.set(w*0.25, h*0.8, h);
            dummy.updateMatrix();
            cabMesh.setMatrixAt(counters.CAB, dummy.matrix);
            cabMesh.setColorAt(counters.CAB, color);
            counters.CAB++;
          }
        }
        else if (type === 'BUS') {
          dummy.scale.set(w, h, h);
          dummy.position.set(targetX, h2, targetZ);
          dummy.updateMatrix();
          mesh.setMatrixAt(idx, dummy.matrix);
          mesh.setColorAt(idx, color);
        }
        else if (type === 'CYCLE') {
          dummy.scale.set(w*0.6, h2, h*0.4);
          dummy.position.set(targetX, h2*0.5, targetZ);
          dummy.updateMatrix();
          mesh.setMatrixAt(idx, dummy.matrix);
          mesh.setColorAt(idx, color);
        }
        
        counters[type]++;
      }
    });

    Object.keys(meshRefs).forEach(k => {
      const ref = meshRefs[k].current;
      if (ref) {
        ref.count = counters[k];
        ref.instanceMatrix.needsUpdate = true;
        if (ref.instanceColor) ref.instanceColor.needsUpdate = true;
      }
    });
  });

  const handleClick = (type) => (e) => {
    e.stopPropagation();
    const v = e.instanceId !== undefined && instanceMap.current[type][e.instanceId];
    if (v) setSelectedVehicle(v);
  };

  return (
    <>
      <instancedMesh ref={meshRefs.CAR} args={[null, null, MAX_INSTANCES]} castShadow onClick={handleClick('CAR')}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial emissiveIntensity={0.8} />
      </instancedMesh>
      
      <instancedMesh ref={meshRefs.CAB} args={[null, null, MAX_INSTANCES]} castShadow onClick={handleClick('CAB')}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial emissiveIntensity={1.2} />
      </instancedMesh>

      <instancedMesh ref={meshRefs.TRUCK} args={[null, null, MAX_INSTANCES]} castShadow onClick={handleClick('TRUCK')}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial metalness={0.5} roughness={0.5} />
      </instancedMesh>

      <instancedMesh ref={meshRefs.BUS} args={[null, null, MAX_INSTANCES]} castShadow onClick={handleClick('BUS')}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial emissiveIntensity={0.6} />
      </instancedMesh>

      <instancedMesh ref={meshRefs.CYCLE} args={[null, null, MAX_INSTANCES]} castShadow onClick={handleClick('CYCLE')}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial emissiveIntensity={2.0} />
      </instancedMesh>
    </>
  );
}

function CameraController({ selectedVehicle }) {
  const { camera } = useThree();
  const desiredPos = useMemo(() => new THREE.Vector3(), []);
  const lookTarget = useMemo(() => new THREE.Vector3(), []);
  
  useFrame(() => {
    if (selectedVehicle) {
      const targetX = (selectedVehicle.x - LOGICAL_W / 2) * SCALE;
      const targetZ = (selectedVehicle.y - LOGICAL_H / 2) * SCALE;
      
      desiredPos.set(
        targetX + (selectedVehicle.isInbound ? 30 : -30),
        25,
        targetZ + 30
      );
      lookTarget.set(targetX, 0, targetZ);
      
      camera.position.lerp(desiredPos, 0.05);
      camera.lookAt(lookTarget);
    }
  });

  return (
    <OrbitControls 
      enabled={!selectedVehicle}
      autoRotate={!selectedVehicle}
      autoRotateSpeed={0.5} 
      makeDefault 
      minPolarAngle={Math.PI/6} 
      maxPolarAngle={Math.PI/2 - 0.1}
      minDistance={20}
      maxDistance={200}
    />
  );
}

// Static Vector2 objects to avoid per-render allocations
const CHROMA_OFFSET = new THREE.Vector2(0.002, 0.002);
function Scene({ vehiclesRef, pausedRef, statsAccRef, selectedVehicle, setSelectedVehicle }) {
  useFrame(() => {
    // We removed the glitch effect because it conflicts with Bloom (convolution vs UV transform)
    // Suspicious packets will still blink red in the InstancedVehicles component
  });

  return (
    <>
      <color attach="background" args={['#050510']} />
      <fog attach="fog" args={['#050510', 50, 300]} />
      <ambientLight intensity={0.2} />
      <directionalLight position={[100, 100, 50]} intensity={1.5} color="#00f0ff" />
      <directionalLight position={[-100, 100, -50]} intensity={1.5} color="#ff3355" />
      <CameraController selectedVehicle={selectedVehicle} />
      
      <InstancedVehicles 
        vehiclesRef={vehiclesRef} 
        pausedRef={pausedRef} 
        statsAccRef={statsAccRef} 
        selectedVehicle={selectedVehicle}
        setSelectedVehicle={setSelectedVehicle}
      />

      <GlobeMap vehiclesRef={vehiclesRef} />
      
      <group position={[0, 0, 0]}>
        <mesh position={[0, 5, 0]}>
          <cylinderGeometry args={[10, 15, 10, 32]} />
          <meshStandardMaterial color="#1a1a3a" emissive="#00f0ff" emissiveIntensity={0.2} />
        </mesh>
        <mesh position={[0, 15, 0]}>
          <sphereGeometry args={[6, 32, 32]} />
          <meshStandardMaterial color="#000000" wireframe />
        </mesh>
        <pointLight position={[0, 10, 0]} color="#ff0000" intensity={5} distance={200} />
      </group>

      <Stars radius={100} depth={100} count={3000} factor={6} saturation={0} fade speed={2} />
      <Sparkles count={300} scale={[150, 50, 150]} size={6} speed={0.4} opacity={0.4} color="#00f0ff" position={[0, 20, 0]} />
      
      <Grid 
        infiniteGrid 
        fadeDistance={300} 
        cellColor="#003040" 
        sectionColor="#00f0ff" 
        cellSize={20} 
        sectionSize={100} 
        position={[0, -0.1, 0]}
        cellThickness={0.5}
        sectionThickness={1}
      />
      
      <mesh rotation={[-Math.PI/2, 0, 0]} position={[0, -0.2, 0]} receiveShadow>
        <planeGeometry args={[1000, 100]} />
        <meshStandardMaterial color="#020205" roughness={0.9} />
      </mesh>

      <EffectComposerPP>
        <BloomPP luminanceThreshold={0.2} luminanceSmoothing={0.9} height={300} intensity={1.5} />
        <ChromaticAberrationPP blendFunction={BlendFunction.NORMAL} offset={CHROMA_OFFSET} />
      </EffectComposerPP>
    </>
  );
}

class Canvas3DErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, info) {
    console.error('[Canvas3D] Render error:', error, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          width: '100%', height: '100%', display: 'flex', alignItems: 'center',
          justifyContent: 'center', background: '#050510', color: '#ff3355',
          fontFamily: 'monospace', flexDirection: 'column', gap: '12px'
        }}>
          <div style={{ fontSize: '14px', fontWeight: 'bold' }}>⚠ 3D RENDERER ERROR</div>
          <div style={{ fontSize: '11px', color: '#5a6080', maxWidth: '400px', textAlign: 'center' }}>
            {this.state.error?.message || 'WebGL context lost or Three.js crash'}
          </div>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            style={{
              padding: '6px 16px', background: '#1a1a3a', border: '1px solid #00f5ff',
              color: '#00f5ff', cursor: 'pointer', borderRadius: '4px', fontSize: '11px'
            }}
          >
            RETRY
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function Canvas3D(props) {
  return (
    <Canvas3DErrorBoundary>
      <Canvas shadows camera={{ position: [0, 60, 120], fov: 45 }} gl={{ antialias: false }}>
        <Scene {...props} />
      </Canvas>
    </Canvas3DErrorBoundary>
  );
}
