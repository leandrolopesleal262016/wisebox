import * as THREE from "../vendor/three/three.module.min.js";
import { OrbitControls } from "../vendor/three/controls/OrbitControls.js";

const FLOOR_Y = -2.2;

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

    const ambient = new THREE.AmbientLight(0xffffff, 1.28);
    const keyLight = new THREE.DirectionalLight(0xffe1b8, 1.3);
    keyLight.position.set(12, 14, 8);
    const fillLight = new THREE.DirectionalLight(0x9bcfff, 0.68);
    fillLight.position.set(-8, 9, -10);
    const bounceLight = new THREE.DirectionalLight(0xffffff, 0.28);
    bounceLight.position.set(0, -6, 0);
    this.scene.add(ambient, keyLight, fillLight, bounceLight);

    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(12, 48),
      new THREE.MeshStandardMaterial({
        color: 0x1d3a46,
        metalness: 0.08,
        roughness: 0.96,
        transparent: true,
        opacity: 0.55,
      })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = FLOOR_Y;
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
    this.group.position.set(0, 0, 0);

    const mode = preview.previewMode || "assembled";
    const scale = 0.02;
    const width = preview.width * scale;
    const height = preview.height * scale;
    const depth = preview.depth * scale;
    const thickness = Math.max(preview.thickness * scale, 0.05);
    const joinery = this.buildJoinerySpec(preview, thickness);
    const materials = this.buildMaterialPack(preview.materialType || "mdf");
    const descriptors = this.buildPanelDescriptors({
      preview,
      mode,
      width,
      height,
      depth,
      thickness,
      joinery,
      materials,
    });

    descriptors.forEach((descriptor) => {
      this.group.add(
        this.makePanel(
          descriptor.plane,
          descriptor.width,
          descriptor.height,
          descriptor.thickness,
          descriptor.x,
          descriptor.y,
          descriptor.z,
          descriptor.material,
          descriptor.joinery,
          descriptor.edges
        )
      );
    });

    this.fitCamera(mode);
  }

  buildJoinerySpec(preview, thickness) {
    const joineryDepth = Math.min(Math.max(thickness * 0.96, 0.05), 0.26);
    const edgeInset = Math.max(joineryDepth * 0.26, 0.01);
    const pitch = Math.max(thickness * 3.4 + preview.kerf * 0.04, 0.24);
    return {
      type: preview.jointType,
      depth: joineryDepth,
      edgeInset,
      pitch,
    };
  }

  buildPanelDescriptors({ preview, mode, width, height, depth, thickness, joinery, materials }) {
    const actualEdges = this.buildActualEdgeSets(preview);
    const mountedEdges = this.buildMountedEdgeSets(preview);
    const edgeSet = mode === "assembled" ? mountedEdges : actualEdges;

    const panels = [];

    const mounted = {
      front: { plane: "xy", width, height, thickness, x: 0, y: 0, z: -(depth / 2 - thickness / 2), material: materials.body, joinery, edges: edgeSet.front },
      back: { plane: "xy", width, height, thickness, x: 0, y: 0, z: depth / 2 - thickness / 2, material: materials.body, joinery, edges: edgeSet.front },
      left: { plane: "yz", width: depth, height, thickness, x: -(width / 2 - thickness / 2), y: 0, z: 0, material: materials.body, joinery, edges: edgeSet.side },
      right: { plane: "yz", width: depth, height, thickness, x: width / 2 - thickness / 2, y: 0, z: 0, material: materials.body, joinery, edges: edgeSet.side },
      bottom: { plane: "xz", width, height: depth, thickness, x: 0, y: -(height / 2 - thickness / 2), z: 0, material: materials.body, joinery, edges: edgeSet.bottom },
      top: { plane: "xz", width, height: depth, thickness, x: 0, y: height / 2 - thickness / 2, z: 0, material: materials.lid, joinery, edges: edgeSet.top },
    };

    if (mode === "assembled") {
      panels.push(mounted.front, mounted.back, mounted.left, mounted.right, mounted.bottom);
      if (!preview.openTop) {
        panels.push(mounted.top);
      }
      if (preview.boxType === "drawer") {
        panels.push(...this.buildDrawerMountedPanels(preview, width, height, depth, thickness, materials));
      }
      return panels;
    }

    if (mode === "exploded") {
      const explode = Math.max(thickness * 3.8, Math.min(Math.max(width, height, depth) * 0.22, 1.45));
      panels.push(
        { ...mounted.front, z: mounted.front.z - explode },
        { ...mounted.back, z: mounted.back.z + explode },
        { ...mounted.left, x: mounted.left.x - explode },
        { ...mounted.right, x: mounted.right.x + explode },
        { ...mounted.bottom, y: mounted.bottom.y - explode * 0.78 },
      );
      if (!preview.openTop && preview.boxType !== "lidded_box") {
        panels.push({ ...mounted.top, y: mounted.top.y + explode * 0.88 });
      }
      if (preview.boxType === "lidded_box") {
        panels.push({ ...mounted.top, y: height / 2 + explode * 1.7, material: materials.lid });
      }
      if (preview.boxType === "drawer") {
        panels.push(...this.buildDrawerExplodedPanels(preview, width, height, depth, thickness, materials, explode));
      }
      return panels;
    }

    return this.buildFlatPanels(preview, width, height, depth, thickness, materials, actualEdges);
  }

  buildActualEdgeSets(preview) {
    return {
      front: {
        top: preview.openTop ? "plain" : "female",
        right: "female",
        bottom: "female",
        left: "female",
      },
      side: {
        top: preview.openTop ? "plain" : "female",
        right: "male",
        bottom: "female",
        left: "male",
      },
      bottom: { top: "male", right: "male", bottom: "male", left: "male" },
      top: { top: "male", right: "male", bottom: "male", left: "male" },
    };
  }

  buildMountedEdgeSets(preview) {
    return {
      front: {
        top: "plain",
        right: "female",
        bottom: "plain",
        left: "female",
      },
      side: {
        top: "plain",
        right: "male",
        bottom: "plain",
        left: "male",
      },
      bottom: { top: "plain", right: "plain", bottom: "plain", left: "plain" },
      top: { top: "plain", right: "plain", bottom: "plain", left: "plain" },
    };
  }

  buildDrawerMountedPanels(preview, width, height, depth, thickness, materials) {
    const shellThickness = thickness * 0.92;
    const shellWidth = width + shellThickness * 2.3;
    const shellHeight = height + shellThickness * 1.4;
    const shellDepth = depth + shellThickness * 1.4;
    const offset = width * 0.22;
    const shellJoinery = this.buildJoinerySpec(preview, shellThickness);
    const shellEdges = {
      top: "plain",
      right: "female",
      bottom: "plain",
      left: "female",
    };
    const shellSideEdges = {
      top: "plain",
      right: "male",
      bottom: "plain",
      left: "male",
    };
    const shellBottomEdges = { top: "plain", right: "plain", bottom: "plain", left: "plain" };
    this.group.position.x = -offset * 0.5;
    return [
      { plane: "xy", width: shellWidth, height: shellHeight, thickness: shellThickness, x: offset, y: 0, z: -(shellDepth / 2 - shellThickness / 2), material: materials.shell, joinery: shellJoinery, edges: shellEdges },
      { plane: "yz", width: shellDepth, height: shellHeight, thickness: shellThickness, x: offset - (shellWidth / 2 - shellThickness / 2), y: 0, z: 0, material: materials.shell, joinery: shellJoinery, edges: shellSideEdges },
      { plane: "yz", width: shellDepth, height: shellHeight, thickness: shellThickness, x: offset + (shellWidth / 2 - shellThickness / 2), y: 0, z: 0, material: materials.shell, joinery: shellJoinery, edges: shellSideEdges },
      { plane: "xz", width: shellWidth, height: shellDepth, thickness: shellThickness, x: offset, y: -(shellHeight / 2 - shellThickness / 2), z: 0, material: materials.shell, joinery: shellJoinery, edges: shellBottomEdges },
    ];
  }

  buildDrawerExplodedPanels(preview, width, height, depth, thickness, materials, explode) {
    const shellThickness = thickness * 0.92;
    const shellWidth = width + shellThickness * 2.3;
    const shellHeight = height + shellThickness * 1.4;
    const shellDepth = depth + shellThickness * 1.4;
    const offset = width * 0.3;
    const shellJoinery = this.buildJoinerySpec(preview, shellThickness);
    const shellEdges = {
      top: "plain",
      right: "female",
      bottom: "female",
      left: "female",
    };
    const shellSideEdges = {
      top: "plain",
      right: "male",
      bottom: "female",
      left: "male",
    };
    const shellBottomEdges = { top: "male", right: "male", bottom: "male", left: "male" };
    this.group.position.x = -offset * 0.45;
    return [
      { plane: "xy", width: shellWidth, height: shellHeight, thickness: shellThickness, x: offset, y: 0, z: -(shellDepth / 2 - shellThickness / 2) - explode * 0.55, material: materials.shell, joinery: shellJoinery, edges: shellEdges },
      { plane: "yz", width: shellDepth, height: shellHeight, thickness: shellThickness, x: offset - (shellWidth / 2 - shellThickness / 2) - explode * 0.5, y: 0, z: 0, material: materials.shell, joinery: shellJoinery, edges: shellSideEdges },
      { plane: "yz", width: shellDepth, height: shellHeight, thickness: shellThickness, x: offset + (shellWidth / 2 - shellThickness / 2) + explode * 0.5, y: 0, z: 0, material: materials.shell, joinery: shellJoinery, edges: shellSideEdges },
      { plane: "xz", width: shellWidth, height: shellDepth, thickness: shellThickness, x: offset, y: -(shellHeight / 2 - shellThickness / 2) - explode * 0.6, z: 0, material: materials.shell, joinery: shellJoinery, edges: shellBottomEdges },
    ];
  }

  buildFlatPanels(preview, width, height, depth, thickness, materials, edges) {
    const flatY = FLOOR_Y + thickness / 2 + 0.03;
    const gap = Math.max(thickness * 2.2, 0.28);
    const panels = [
      { plane: "xz", width, height, thickness, material: materials.body, joinery: this.buildJoinerySpec(preview, thickness), edges: edges.front },
      { plane: "xz", width, height, thickness, material: materials.body, joinery: this.buildJoinerySpec(preview, thickness), edges: edges.front },
      { plane: "xz", width: depth, height, thickness, material: materials.body, joinery: this.buildJoinerySpec(preview, thickness), edges: edges.side },
      { plane: "xz", width: depth, height, thickness, material: materials.body, joinery: this.buildJoinerySpec(preview, thickness), edges: edges.side },
      { plane: "xz", width, height: depth, thickness, material: materials.body, joinery: this.buildJoinerySpec(preview, thickness), edges: edges.bottom },
    ];

    if (!preview.openTop) {
      panels.push({ plane: "xz", width, height: depth, thickness, material: materials.lid, joinery: this.buildJoinerySpec(preview, thickness), edges: edges.top });
    }
    if (preview.boxType === "drawer") {
      const shellThickness = thickness * 0.92;
      const shellWidth = width + shellThickness * 2.3;
      const shellHeight = height + shellThickness * 1.4;
      const shellDepth = depth + shellThickness * 1.4;
      const shellJoinery = this.buildJoinerySpec(preview, shellThickness);
      panels.push(
        { plane: "xz", width: shellWidth, height: shellHeight, thickness: shellThickness, material: materials.shell, joinery: shellJoinery, edges: { top: "plain", right: "female", bottom: "female", left: "female" } },
        { plane: "xz", width: shellDepth, height: shellHeight, thickness: shellThickness, material: materials.shell, joinery: shellJoinery, edges: { top: "plain", right: "male", bottom: "female", left: "male" } },
        { plane: "xz", width: shellDepth, height: shellHeight, thickness: shellThickness, material: materials.shell, joinery: shellJoinery, edges: { top: "plain", right: "male", bottom: "female", left: "male" } },
        { plane: "xz", width: shellWidth, height: shellDepth, thickness: shellThickness, material: materials.shell, joinery: shellJoinery, edges: { top: "male", right: "male", bottom: "male", left: "male" } }
      );
    }

    const layout = [];
    const rowTarget = Math.max(3.8, Math.sqrt(panels.reduce((sum, panel) => sum + panel.width * panel.height, 0)) * 1.3);
    let cursorX = 0;
    let cursorZ = 0;
    let rowDepth = 0;

    panels.forEach((panel) => {
      if (cursorX > 0 && cursorX + panel.width > rowTarget) {
        cursorX = 0;
        cursorZ += rowDepth + gap;
        rowDepth = 0;
      }
      layout.push({ ...panel, x: cursorX + panel.width / 2, y: flatY, z: cursorZ + panel.height / 2 });
      cursorX += panel.width + gap;
      rowDepth = Math.max(rowDepth, panel.height);
    });

    const minX = Math.min(...layout.map((panel) => panel.x - panel.width / 2), 0);
    const maxX = Math.max(...layout.map((panel) => panel.x + panel.width / 2), 0);
    const minZ = Math.min(...layout.map((panel) => panel.z - panel.height / 2), 0);
    const maxZ = Math.max(...layout.map((panel) => panel.z + panel.height / 2), 0);
    const shiftX = (minX + maxX) / 2;
    const shiftZ = (minZ + maxZ) / 2;
    this.group.position.set(-shiftX, 0, -shiftZ);

    return layout;
  }

  buildMaterialPack(materialType) {
    const materials = {
      mdf: {
        body: new THREE.MeshPhysicalMaterial({
          color: 0xb8945d,
          roughness: 0.9,
          metalness: 0.02,
          clearcoat: 0.04,
          side: THREE.DoubleSide,
        }),
        lid: new THREE.MeshPhysicalMaterial({
          color: 0xc8a26c,
          roughness: 0.86,
          metalness: 0.02,
          clearcoat: 0.04,
          side: THREE.DoubleSide,
        }),
        shell: new THREE.MeshPhysicalMaterial({
          color: 0xa98454,
          roughness: 0.92,
          metalness: 0.02,
          side: THREE.DoubleSide,
        }),
      },
      plywood: {
        body: new THREE.MeshPhysicalMaterial({
          color: 0xc89b63,
          roughness: 0.8,
          metalness: 0.02,
          clearcoat: 0.08,
          side: THREE.DoubleSide,
        }),
        lid: new THREE.MeshPhysicalMaterial({
          color: 0xd8ac74,
          roughness: 0.78,
          metalness: 0.02,
          clearcoat: 0.08,
          side: THREE.DoubleSide,
        }),
        shell: new THREE.MeshPhysicalMaterial({
          color: 0xb98d57,
          roughness: 0.82,
          metalness: 0.02,
          side: THREE.DoubleSide,
        }),
      },
      acrylic: {
        body: new THREE.MeshPhysicalMaterial({
          color: 0x9ad9ff,
          roughness: 0.08,
          metalness: 0.0,
          transmission: 0.72,
          thickness: 0.45,
          transparent: true,
          opacity: 0.9,
          clearcoat: 0.9,
          ior: 1.46,
          side: THREE.DoubleSide,
        }),
        lid: new THREE.MeshPhysicalMaterial({
          color: 0xb3e5ff,
          roughness: 0.06,
          metalness: 0.0,
          transmission: 0.78,
          thickness: 0.45,
          transparent: true,
          opacity: 0.92,
          clearcoat: 1.0,
          ior: 1.46,
          side: THREE.DoubleSide,
        }),
        shell: new THREE.MeshPhysicalMaterial({
          color: 0x7dcaf8,
          roughness: 0.08,
          metalness: 0.0,
          transmission: 0.62,
          thickness: 0.4,
          transparent: true,
          opacity: 0.86,
          clearcoat: 0.9,
          ior: 1.46,
          side: THREE.DoubleSide,
        }),
      },
      cardboard: {
        body: new THREE.MeshPhysicalMaterial({
          color: 0x8e6c45,
          roughness: 0.97,
          metalness: 0.01,
          side: THREE.DoubleSide,
        }),
        lid: new THREE.MeshPhysicalMaterial({
          color: 0xa37a4f,
          roughness: 0.97,
          metalness: 0.01,
          side: THREE.DoubleSide,
        }),
        shell: new THREE.MeshPhysicalMaterial({
          color: 0x7d5d39,
          roughness: 0.98,
          metalness: 0.01,
          side: THREE.DoubleSide,
        }),
      },
    };

    return materials[materialType] || materials.mdf;
  }

  makePanel(plane, width, height, thickness, x, y, z, material, joinery, edges) {
    const group = new THREE.Group();
    group.position.set(x, y, z);

    const shape = this.buildPanelShape(width, height, joinery, edges);
    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth: thickness,
      bevelEnabled: false,
      curveSegments: 1,
      steps: 1,
    });
    geometry.translate(0, 0, -thickness / 2);

    if (plane === "xz") {
      geometry.rotateX(-Math.PI / 2);
    } else if (plane === "yz") {
      geometry.rotateY(Math.PI / 2);
    }

    geometry.computeVertexNormals();

    const mesh = new THREE.Mesh(geometry, material.clone());
    group.add(mesh);

    const edgesGeometry = new THREE.EdgesGeometry(geometry, 20);
    const edgeLines = new THREE.LineSegments(
      edgesGeometry,
      new THREE.LineBasicMaterial({
        color: material.color.clone().offsetHSL(0, 0, -0.28),
        transparent: material.transparent || false,
        opacity: material.transparent ? 0.9 : 1,
      })
    );
    group.add(edgeLines);

    return group;
  }

  buildPanelShape(width, height, joinery, edges) {
    const points = this.buildPanelOutline(width, height, joinery, edges);
    const shape = new THREE.Shape();
    shape.moveTo(points[0].x, points[0].y);
    for (let index = 1; index < points.length; index += 1) {
      shape.lineTo(points[index].x, points[index].y);
    }
    shape.closePath();
    return shape;
  }

  buildPanelOutline(width, height, joinery, edges) {
    const outline = [new THREE.Vector2(-width / 2, height / 2)];
    let current = outline[0];

    const segments = [
      { side: "top", length: width, role: edges.top || "plain" },
      { side: "right", length: height, role: edges.right || "plain" },
      { side: "bottom", length: width, role: edges.bottom || "plain" },
      { side: "left", length: height, role: edges.left || "plain" },
    ];

    for (const segment of segments) {
      const edgePoints = this.buildEdgePoints(current, segment.side, segment.length, segment.role, joinery);
      edgePoints.forEach((point) => outline.push(point));
      current = outline[outline.length - 1];
    }

    return this.dedupePath(outline);
  }

  buildEdgePoints(start, side, length, role, joinery) {
    const axis = this.axisVector(side);
    const normal = this.normalVector(side);
    const segments = [];

    if (joinery.type === "plain" || role === "plain") {
      return [new THREE.Vector2(start.x + axis.x * length, start.y + axis.y * length)];
    }

    const teeth = this.countJoinerySegments(length, joinery.pitch);
    const span = length / teeth;

    let cursor = new THREE.Vector2(start.x, start.y);

    for (let index = 0; index < teeth; index += 1) {
      const next = new THREE.Vector2(start.x + axis.x * span * (index + 1), start.y + axis.y * span * (index + 1));
      const cutIn =
        role === "female"
          ? index % 2 === 0
          : index % 2 === 1;

      if (cutIn) {
        if (joinery.type === "dovetail") {
          const p1 = new THREE.Vector2(
            cursor.x + axis.x * span * 0.18 - normal.x * joinery.depth,
            cursor.y + axis.y * span * 0.18 - normal.y * joinery.depth
          );
          const p2 = new THREE.Vector2(
            cursor.x + axis.x * span * 0.82 - normal.x * joinery.depth,
            cursor.y + axis.y * span * 0.82 - normal.y * joinery.depth
          );
          segments.push(p1, p2, next);
        } else {
          const p1 = new THREE.Vector2(cursor.x - normal.x * joinery.depth, cursor.y - normal.y * joinery.depth);
          const p2 = new THREE.Vector2(next.x - normal.x * joinery.depth, next.y - normal.y * joinery.depth);
          segments.push(p1, p2, next);
        }
      } else {
        segments.push(next);
      }
      cursor = next;
    }

    return this.dedupePath(segments);
  }

  axisVector(side) {
    const vectors = {
      top: new THREE.Vector2(1, 0),
      right: new THREE.Vector2(0, -1),
      bottom: new THREE.Vector2(-1, 0),
      left: new THREE.Vector2(0, 1),
    };
    return vectors[side];
  }

  normalVector(side) {
    const normals = {
      top: new THREE.Vector2(0, 1),
      right: new THREE.Vector2(1, 0),
      bottom: new THREE.Vector2(0, -1),
      left: new THREE.Vector2(-1, 0),
    };
    return normals[side];
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

  fitCamera(mode) {
    const bounds = new THREE.Box3().setFromObject(this.group);
    const center = bounds.getCenter(new THREE.Vector3());
    const size = bounds.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z, 1);

    if (mode === "flat") {
      this.camera.position.set(center.x, center.y + maxDim * 1.7, center.z + maxDim * 0.95);
    } else if (mode === "exploded") {
      this.camera.position.set(center.x + maxDim * 1.35, center.y + maxDim * 1.02, center.z + maxDim * 1.4);
    } else {
      this.camera.position.set(center.x + maxDim * 1.28, center.y + maxDim * 0.92, center.z + maxDim * 1.3);
    }

    this.controls.target.copy(center);
    this.controls.update();
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
