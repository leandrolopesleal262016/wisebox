import * as THREE from "../vendor/three/three.module.min.js";
import { OrbitControls } from "../vendor/three/controls/OrbitControls.js";

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
    const materials = this.buildMaterialPack(preview.materialType || "mdf");

    const frontEdges = {
      top: "plain",
      right: "female",
      bottom: "plain",
      left: "female",
    };
    const sideEdges = {
      top: "plain",
      right: "male",
      bottom: "plain",
      left: "male",
    };
    const horizontalEdges = { top: "plain", right: "plain", bottom: "plain", left: "plain" };

    this.group.add(this.makePanel("xy", width, height, thickness, 0, 0, -(depth / 2 - thickness / 2), materials.body, joinery, frontEdges));
    this.group.add(this.makePanel("xy", width, height, thickness, 0, 0, depth / 2 - thickness / 2, materials.body, joinery, frontEdges));
    this.group.add(this.makePanel("yz", depth, height, thickness, -(width / 2 - thickness / 2), 0, 0, materials.body, joinery, sideEdges));
    this.group.add(this.makePanel("yz", depth, height, thickness, width / 2 - thickness / 2, 0, 0, materials.body, joinery, sideEdges));
    this.group.add(this.makePanel("xz", width, depth, thickness, 0, -(height / 2 - thickness / 2), 0, materials.body, joinery, horizontalEdges));

    if (!preview.openTop) {
      this.group.add(this.makePanel("xz", width, depth, thickness, 0, height / 2 - thickness / 2, 0, materials.lid, joinery, horizontalEdges));
    }

    if (preview.boxType === "lidded_box") {
      this.group.add(this.makePanel("xz", width, depth, thickness, 0, height / 2 + thickness * 2.6, 0, materials.lid, joinery, horizontalEdges));
    }

    if (preview.boxType === "drawer") {
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
      this.group.add(this.makePanel("xy", shellWidth, shellHeight, shellThickness, offset, 0, -(shellDepth / 2 - shellThickness / 2), materials.shell, shellJoinery, shellEdges));
      this.group.add(this.makePanel("yz", shellDepth, shellHeight, shellThickness, offset - (shellWidth / 2 - shellThickness / 2), 0, 0, materials.shell, shellJoinery, shellSideEdges));
      this.group.add(this.makePanel("yz", shellDepth, shellHeight, shellThickness, offset + (shellWidth / 2 - shellThickness / 2), 0, 0, materials.shell, shellJoinery, shellSideEdges));
      this.group.add(this.makePanel("xz", shellWidth, shellDepth, shellThickness, offset, -(shellHeight / 2 - shellThickness / 2), 0, materials.shell, shellJoinery, shellBottomEdges));
      this.group.position.x = -offset * 0.5;
    } else {
      this.group.position.x = 0;
    }

    if (preview.isFlex) {
      const slotMaterial = new THREE.LineBasicMaterial({ color: 0x21313c, transparent: true, opacity: 0.75 });
      for (let i = -3; i <= 3; i += 1) {
        const points = [
          new THREE.Vector3(-width / 2 + width * 0.1 + i * width * 0.1, -height / 2 + thickness, depth / 2 + 0.001),
          new THREE.Vector3(-width / 2 + width * 0.1 + i * width * 0.1, height / 2 - thickness, depth / 2 + 0.001),
        ];
        this.group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), slotMaterial.clone()));
      }
    }

    const maxDim = Math.max(width, height, depth);
    this.camera.position.set(maxDim * 1.48, maxDim * 1.14, maxDim * 1.58);
    this.controls.target.set(0, 0, 0);
    this.controls.update();
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
