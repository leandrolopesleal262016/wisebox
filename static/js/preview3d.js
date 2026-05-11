import * as THREE from "../vendor/three/three.module.min.js";
import { OrbitControls } from "../vendor/three/controls/OrbitControls.js";

const SURFACE_EPSILON = 0.005;

class WiseBoxPreview {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(0x10212b, 18, 55);

    this.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 1000);
    this.camera.position.set(12, 10, 13);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setClearColor(0x000000, 0);
    this.container.appendChild(this.renderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.target.set(0, 1, 0);

    this.group = new THREE.Group();
    this.scene.add(this.group);

    const ambient = new THREE.AmbientLight(0xffffff, 1.3);
    const keyLight = new THREE.DirectionalLight(0xffd7a1, 1.1);
    keyLight.position.set(12, 14, 8);
    const rimLight = new THREE.DirectionalLight(0x9cd6ff, 0.7);
    rimLight.position.set(-8, 9, -10);
    this.scene.add(ambient, keyLight, rimLight);

    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(12, 48),
      new THREE.MeshStandardMaterial({
        color: 0x1d3a46,
        metalness: 0.1,
        roughness: 0.95,
        transparent: true,
        opacity: 0.55,
      })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -2.2;
    this.scene.add(floor);

    this.resize();
    window.addEventListener("resize", () => this.resize());
    this.animate();
  }

  clear() {
    while (this.group.children.length) {
      const child = this.group.children[0];
      this.group.remove(child);
      this.disposeObject(child);
    }
  }

  disposeObject(object) {
    if (object.children?.length) {
      [...object.children].forEach((child) => this.disposeObject(child));
    }
    if (object.geometry) {
      object.geometry.dispose();
    }
    if (object.material) {
      if (Array.isArray(object.material)) {
        object.material.forEach((material) => material.dispose());
      } else {
        object.material.dispose();
      }
    }
  }

  setData(preview) {
    this.clear();

    const scale = 0.02;
    const width = preview.width * scale;
    const height = preview.height * scale;
    const depth = preview.depth * scale;
    const thickness = Math.max(preview.thickness * scale, 0.05);
    const joinery = this.buildJoinerySpec(preview, thickness);

    const bodyMaterial = new THREE.MeshPhysicalMaterial({
      color: 0xefc17a,
      transparent: true,
      opacity: 0.68,
      roughness: 0.62,
      metalness: 0.02,
      clearcoat: 0.12,
    });

    const lidMaterial = new THREE.MeshPhysicalMaterial({
      color: 0x7ed3a8,
      transparent: true,
      opacity: 0.5,
      roughness: 0.55,
      metalness: 0.05,
    });

    const shellMaterial = new THREE.MeshPhysicalMaterial({
      color: 0x82b6ff,
      transparent: true,
      opacity: 0.42,
      roughness: 0.5,
    });

    this.group.add(this.makePanel(width, thickness, depth, 0, -height / 2, 0, bodyMaterial, joinery));
    this.group.add(this.makePanel(width, height, thickness, 0, 0, -depth / 2, bodyMaterial, joinery));
    this.group.add(this.makePanel(width, height, thickness, 0, 0, depth / 2, bodyMaterial, joinery));
    this.group.add(this.makePanel(thickness, height, depth, -width / 2, 0, 0, bodyMaterial, joinery));
    this.group.add(this.makePanel(thickness, height, depth, width / 2, 0, 0, bodyMaterial, joinery));

    if (!preview.openTop) {
      this.group.add(this.makePanel(width, thickness, depth, 0, height / 2, 0, lidMaterial, joinery));
    }

    if (preview.boxType === "lidded_box") {
      const liftedLid = this.makePanel(width, thickness, depth, 0, height / 2 + thickness * 2.8, 0, lidMaterial, joinery);
      this.group.add(liftedLid);
    }

    if (preview.boxType === "drawer") {
      const shellThickness = thickness * 0.9;
      const shellWidth = width + shellThickness * 2.4;
      const shellHeight = height + shellThickness * 1.4;
      const shellDepth = depth + shellThickness * 1.4;
      const offset = width * 0.22;
      const drawerJoinery = this.buildJoinerySpec(preview, shellThickness);
      this.group.add(this.makePanel(shellWidth, shellThickness, shellDepth, offset, -shellHeight / 2, 0, shellMaterial, drawerJoinery));
      this.group.add(this.makePanel(shellWidth, shellHeight, shellThickness, offset, 0, -shellDepth / 2, shellMaterial, drawerJoinery));
      this.group.add(this.makePanel(shellWidth, shellHeight, shellThickness, offset, 0, shellDepth / 2, shellMaterial, drawerJoinery));
      this.group.add(this.makePanel(shellThickness, shellHeight, shellDepth, offset - shellWidth / 2, 0, 0, shellMaterial, drawerJoinery));
      this.group.add(this.makePanel(shellThickness, shellHeight, shellDepth, offset + shellWidth / 2, 0, 0, shellMaterial, drawerJoinery));
      this.group.position.x = -offset * 0.55;
    } else {
      this.group.position.x = 0;
    }

    if (preview.isFlex) {
      const lineMaterial = new THREE.LineBasicMaterial({ color: 0x13232e, transparent: true, opacity: 0.5 });
      for (let i = -3; i <= 3; i += 1) {
        const points = [
          new THREE.Vector3(-width / 2 + width * 0.1 + i * width * 0.1, -height / 2 + thickness, depth / 2 + 0.01),
          new THREE.Vector3(-width / 2 + width * 0.1 + i * width * 0.1, height / 2 - thickness, depth / 2 + 0.01),
        ];
        this.group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), lineMaterial.clone()));
      }
    }

    const maxDim = Math.max(width, height, depth);
    this.camera.position.set(maxDim * 1.45, maxDim * 1.1, maxDim * 1.55);
    this.controls.target.set(0, 0, 0);
    this.controls.update();
  }

  buildJoinerySpec(preview, thickness) {
    const joineryDepth = Math.min(Math.max(thickness * 0.95, 0.05), 0.24);
    const edgeInset = Math.max(joineryDepth * 0.4, 0.015);
    const joineryPitch = Math.max(thickness * 3.2 + preview.kerf * 0.04, 0.24);
    return {
      type: preview.jointType,
      depth: joineryDepth,
      edgeInset,
      pitch: joineryPitch,
    };
  }

  makePanel(width, height, depth, x, y, z, material, joinery) {
    const panelGroup = new THREE.Group();
    panelGroup.position.set(x, y, z);

    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material.clone());
    panelGroup.add(mesh);

    const overlays = this.createJoineryOverlay(width, height, depth, joinery);
    overlays.forEach((overlay) => panelGroup.add(overlay));

    return panelGroup;
  }

  createJoineryOverlay(width, height, depth, joinery) {
    if (joinery.type === "plain") {
      return [];
    }

    const axes = [
      { key: "x", size: width },
      { key: "y", size: height },
      { key: "z", size: depth },
    ].sort((left, right) => left.size - right.size);

    const thinAxis = axes[0].key;
    const material = new THREE.LineBasicMaterial({
      color: joinery.type === "dovetail" ? 0x1f3442 : 0x13232e,
      transparent: true,
      opacity: 0.92,
    });

    if (thinAxis === "z") {
      return this.createPlaneJoinery({
        plane: "xy",
        width,
        height,
        offset: depth / 2 + SURFACE_EPSILON,
        mirrorOffset: -(depth / 2 + SURFACE_EPSILON),
        material,
        joinery,
      });
    }

    if (thinAxis === "y") {
      return this.createPlaneJoinery({
        plane: "xz",
        width,
        height: depth,
        offset: height / 2 + SURFACE_EPSILON,
        mirrorOffset: -(height / 2 + SURFACE_EPSILON),
        material,
        joinery,
      });
    }

    return this.createPlaneJoinery({
      plane: "yz",
      width: depth,
      height,
      offset: width / 2 + SURFACE_EPSILON,
      mirrorOffset: -(width / 2 + SURFACE_EPSILON),
      material,
      joinery,
    });
  }

  createPlaneJoinery({ plane, width, height, offset, mirrorOffset, material, joinery }) {
    const overlays = [];
    const edgePaths = this.buildEdgeProfiles(width, height, joinery);

    for (const faceOffset of [offset, mirrorOffset]) {
      for (const path of edgePaths) {
        const points = path.map((point) => this.mapPointToPlane(plane, point.x, point.y, faceOffset));
        const geometry = new THREE.BufferGeometry().setFromPoints(points);
        overlays.push(new THREE.Line(geometry, material.clone()));
      }
    }

    return overlays;
  }

  buildEdgeProfiles(width, height, joinery) {
    const inset = Math.min(joinery.edgeInset, width * 0.12, height * 0.12);
    return [
      this.buildHorizontalEdge(width, height / 2 - inset, -1, joinery),
      this.buildHorizontalEdge(width, -height / 2 + inset, 1, joinery),
      this.buildVerticalEdge(-width / 2 + inset, height, 1, joinery),
      this.buildVerticalEdge(width / 2 - inset, height, -1, joinery),
    ];
  }

  buildHorizontalEdge(width, y, inwardSign, joinery) {
    const startX = -width / 2 + joinery.edgeInset;
    const endX = width / 2 - joinery.edgeInset;
    const length = Math.max(endX - startX, 0.1);
    const segments = [];
    const teeth = this.countJoinerySegments(length, joinery.pitch);
    const span = length / teeth;

    let currentX = startX;
    segments.push(new THREE.Vector2(currentX, y));

    for (let index = 0; index < teeth; index += 1) {
      const nextX = startX + (index + 1) * span;
      if (index % 2 === 0) {
        if (joinery.type === "dovetail") {
          segments.push(new THREE.Vector2(currentX + span * 0.22, y + inwardSign * joinery.depth));
          segments.push(new THREE.Vector2(currentX + span * 0.78, y + inwardSign * joinery.depth));
          segments.push(new THREE.Vector2(nextX, y));
        } else {
          segments.push(new THREE.Vector2(currentX, y + inwardSign * joinery.depth));
          segments.push(new THREE.Vector2(nextX, y + inwardSign * joinery.depth));
          segments.push(new THREE.Vector2(nextX, y));
        }
      } else {
        segments.push(new THREE.Vector2(nextX, y));
      }
      currentX = nextX;
    }

    return this.dedupePath(segments);
  }

  buildVerticalEdge(x, height, inwardSign, joinery) {
    const startY = -height / 2 + joinery.edgeInset;
    const endY = height / 2 - joinery.edgeInset;
    const length = Math.max(endY - startY, 0.1);
    const segments = [];
    const teeth = this.countJoinerySegments(length, joinery.pitch);
    const span = length / teeth;

    let currentY = startY;
    segments.push(new THREE.Vector2(x, currentY));

    for (let index = 0; index < teeth; index += 1) {
      const nextY = startY + (index + 1) * span;
      if (index % 2 === 0) {
        if (joinery.type === "dovetail") {
          segments.push(new THREE.Vector2(x + inwardSign * joinery.depth, currentY + span * 0.22));
          segments.push(new THREE.Vector2(x + inwardSign * joinery.depth, currentY + span * 0.78));
          segments.push(new THREE.Vector2(x, nextY));
        } else {
          segments.push(new THREE.Vector2(x + inwardSign * joinery.depth, currentY));
          segments.push(new THREE.Vector2(x + inwardSign * joinery.depth, nextY));
          segments.push(new THREE.Vector2(x, nextY));
        }
      } else {
        segments.push(new THREE.Vector2(x, nextY));
      }
      currentY = nextY;
    }

    return this.dedupePath(segments);
  }

  countJoinerySegments(length, pitch) {
    const count = Math.max(3, Math.round(length / pitch));
    return count % 2 === 0 ? count + 1 : count;
  }

  dedupePath(path) {
    return path.filter((point, index) => {
      if (index === 0) {
        return true;
      }
      const previous = path[index - 1];
      return previous.x !== point.x || previous.y !== point.y;
    });
  }

  mapPointToPlane(plane, a, b, offset) {
    if (plane === "xy") {
      return new THREE.Vector3(a, b, offset);
    }
    if (plane === "xz") {
      return new THREE.Vector3(a, offset, b);
    }
    return new THREE.Vector3(offset, b, a);
  }

  resize() {
    const width = this.container.clientWidth || 640;
    const height = this.container.clientHeight || 420;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  animate() {
    requestAnimationFrame(() => this.animate());
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }
}

window.WiseBoxPreview = WiseBoxPreview;
