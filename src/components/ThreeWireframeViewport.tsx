import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useVideoStore } from '../store/videoStore';

interface ThreeWireframeViewportProps {
  depthMapUrl?: string;
}

export const ThreeWireframeViewport: React.FC<ThreeWireframeViewportProps> = ({ depthMapUrl }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const cameraGeometry = useVideoStore((state) => state.cameraGeometry);
  const updateCameraGeometry = useVideoStore((state) => state.updateCameraGeometry);

  const isDraggingRef = useRef<boolean>(false);
  const previousMousePositionRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const width = container.clientWidth || 320;
    const height = container.clientHeight || 240;

    // 1. Scene, Camera, WebGLRenderer
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x05070a);

    const camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 1000);
    camera.position.set(2.4, 2.2, 3.2);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    // 2. Isometric Bounding Wireframe Box
    const boxGeometry = new THREE.BoxGeometry(2.4, 1.8, 2.4);
    const boxWireframe = new THREE.WireframeGeometry(boxGeometry);
    const boxMat = new THREE.LineBasicMaterial({
      color: 0x30363d,
      linewidth: 1,
      transparent: true,
      opacity: 0.5,
    });
    const boxLine = new THREE.LineSegments(boxWireframe, boxMat);
    scene.add(boxLine);

    // 3. Dynamic Terrain Wireframe Mesh based on Float32Array Position Buffer
    const gridSegments = 24;
    const planeGeo = new THREE.PlaneGeometry(2.2, 2.2, gridSegments, gridSegments);
    planeGeo.rotateX(-Math.PI / 2);
    planeGeo.translate(0, -0.6, 0);

    const posAttr = planeGeo.attributes.position;
    for (let i = 0; i < posAttr.count; i++) {
      const x = posAttr.getX(i);
      const z = posAttr.getZ(i);
      const dist = Math.sqrt(x * x + z * z);
      const h = Math.sin(x * 3.5) * 0.2 + Math.cos(z * 3.0) * 0.18 + (dist > 0.7 ? 0.35 : -0.05);
      posAttr.setY(i, -0.6 + h);
    }
    planeGeo.computeVertexNormals();

    const terrainMat = new THREE.MeshBasicMaterial({
      color: 0x8b949e,
      wireframe: true,
      transparent: true,
      opacity: 0.65,
    });
    const terrainMesh = new THREE.Mesh(planeGeo, terrainMat);
    scene.add(terrainMesh);

    // 4. Central Silhouette Figure (Standing Person Wireframe)
    const figureGroup = new THREE.Group();
    const headGeo = new THREE.SphereGeometry(0.08, 8, 8);
    const headMat = new THREE.MeshBasicMaterial({ color: 0xffffff, wireframe: true });
    const head = new THREE.Mesh(headGeo, headMat);
    head.position.y = 0.45;
    figureGroup.add(head);

    const bodyPoints = [
      new THREE.Vector3(0, 0.38, 0),
      new THREE.Vector3(0, 0.05, 0),
      new THREE.Vector3(-0.12, -0.4, 0),
      new THREE.Vector3(0, 0.05, 0),
      new THREE.Vector3(0.12, -0.4, 0),
    ];
    const armPoints = [
      new THREE.Vector3(-0.2, 0.15, 0),
      new THREE.Vector3(0, 0.3, 0),
      new THREE.Vector3(0.2, 0.15, 0),
    ];
    const bodyGeo = new THREE.BufferGeometry().setFromPoints(bodyPoints);
    const armGeo = new THREE.BufferGeometry().setFromPoints(armPoints);
    const figureMat = new THREE.LineBasicMaterial({ color: 0xffffff, linewidth: 2 });
    figureGroup.add(new THREE.Line(bodyGeo, figureMat));
    figureGroup.add(new THREE.Line(armGeo, figureMat));
    scene.add(figureGroup);

    // 5. Orbital Camera Gizmo / Frustum Pyramidal Wireframe
    const gizmoGroup = new THREE.Group();
    const fovAngle = 0.35;
    const frustumDist = 0.9;
    const frustumPoints = [
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(-Math.tan(fovAngle) * frustumDist, Math.tan(fovAngle) * 0.7 * frustumDist, -frustumDist),
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(Math.tan(fovAngle) * frustumDist, Math.tan(fovAngle) * 0.7 * frustumDist, -frustumDist),
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(Math.tan(fovAngle) * frustumDist, -Math.tan(fovAngle) * 0.7 * frustumDist, -frustumDist),
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(-Math.tan(fovAngle) * frustumDist, -Math.tan(fovAngle) * 0.7 * frustumDist, -frustumDist),
    ];
    const gizmoGeo = new THREE.BufferGeometry().setFromPoints(frustumPoints);
    const gizmoMat = new THREE.LineBasicMaterial({ color: 0x00f0ff, linewidth: 1 });
    gizmoGroup.add(new THREE.LineSegments(gizmoGeo, gizmoMat));
    gizmoGroup.position.set(0.9, 0.8, 1.4);
    gizmoGroup.lookAt(0, 0, 0);
    scene.add(gizmoGroup);

    // 6. Interactive Orbit & Animation Loop
    let animId = 0;
    let rotationAngle = (cameraGeometry.yaw * Math.PI) / 180;

    const renderLoop = () => {
      animId = requestAnimationFrame(renderLoop);

      if (!isDraggingRef.current) {
        rotationAngle += 0.0018;
      }

      const radius = 4.2;
      camera.position.x = radius * Math.sin(rotationAngle);
      camera.position.z = radius * Math.cos(rotationAngle);
      camera.position.y = 2.1;
      camera.lookAt(0, 0, 0);

      renderer.render(scene, camera);
    };
    renderLoop();

    // Mouse Interaction
    const onMouseDown = (e: MouseEvent) => {
      isDraggingRef.current = true;
      previousMousePositionRef.current = { x: e.clientX, y: e.clientY };
    };

    const onMouseMove = (e: MouseEvent) => {
      if (!isDraggingRef.current) return;
      const deltaX = e.clientX - previousMousePositionRef.current.x;
      const deltaY = e.clientY - previousMousePositionRef.current.y;
      previousMousePositionRef.current = { x: e.clientX, y: e.clientY };

      rotationAngle += deltaX * 0.008;
      const currentDeg = Number((((rotationAngle * 180) / Math.PI) % 360).toFixed(2));
      updateCameraGeometry({
        yaw: currentDeg >= 0 ? currentDeg : currentDeg + 360,
        pitch: deltaY * 0.1,
      });
    };

    const onMouseUp = () => {
      isDraggingRef.current = false;
    };

    const domEl = renderer.domElement;
    domEl.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);

    const onResize = () => {
      if (!container) return;
      const newW = container.clientWidth;
      const newH = container.clientHeight;
      camera.aspect = newW / newH;
      camera.updateProjectionMatrix();
      renderer.setSize(newW, newH);
    };
    window.addEventListener('resize', onResize);

    // 7. Exhaustive Memory Disposal
    return () => {
      cancelAnimationFrame(animId);
      domEl.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('resize', onResize);

      boxGeometry.dispose();
      boxWireframe.dispose();
      boxMat.dispose();

      planeGeo.dispose();
      terrainMat.dispose();

      headGeo.dispose();
      headMat.dispose();
      bodyGeo.dispose();
      armGeo.dispose();
      figureMat.dispose();

      gizmoGeo.dispose();
      gizmoMat.dispose();

      renderer.dispose();
      if (domEl.parentNode) {
        domEl.parentNode.removeChild(domEl);
      }
    };
  }, [depthMapUrl, updateCameraGeometry]);

  return (
    <div 
      ref={containerRef} 
      className="w-full h-full relative cursor-grab active:cursor-grabbing overflow-hidden" 
    />
  );
};
