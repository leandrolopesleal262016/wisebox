(function () {
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

      this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
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
        const child = this.group.children.pop();
        if (child.geometry) child.geometry.dispose();
        if (child.material) child.material.dispose();
      }
    }

    setData(preview) {
      this.clear();

      const scale = 0.02;
      const width = preview.width * scale;
      const height = preview.height * scale;
      const depth = preview.depth * scale;
      const thickness = Math.max(preview.thickness * scale, 0.05);

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

      this.group.add(this.makePanel(width, thickness, depth, 0, -height / 2, 0, bodyMaterial));
      this.group.add(this.makePanel(width, height, thickness, 0, 0, -depth / 2, bodyMaterial));
      this.group.add(this.makePanel(width, height, thickness, 0, 0, depth / 2, bodyMaterial));
      this.group.add(this.makePanel(thickness, height, depth, -width / 2, 0, 0, bodyMaterial));
      this.group.add(this.makePanel(thickness, height, depth, width / 2, 0, 0, bodyMaterial));

      if (!preview.openTop) {
        this.group.add(this.makePanel(width, thickness, depth, 0, height / 2, 0, lidMaterial));
      }

      if (preview.boxType === "lidded_box") {
        const liftedLid = this.makePanel(width, thickness, depth, 0, height / 2 + thickness * 2.8, 0, lidMaterial);
        this.group.add(liftedLid);
      }

      if (preview.boxType === "drawer") {
        const shellThickness = thickness * 0.9;
        const shellWidth = width + shellThickness * 2.4;
        const shellHeight = height + shellThickness * 1.4;
        const shellDepth = depth + shellThickness * 1.4;
        const offset = width * 0.22;
        this.group.add(this.makePanel(shellWidth, shellThickness, shellDepth, offset, -shellHeight / 2, 0, shellMaterial));
        this.group.add(this.makePanel(shellWidth, shellHeight, shellThickness, offset, 0, -shellDepth / 2, shellMaterial));
        this.group.add(this.makePanel(shellWidth, shellHeight, shellThickness, offset, 0, shellDepth / 2, shellMaterial));
        this.group.add(this.makePanel(shellThickness, shellHeight, shellDepth, offset - shellWidth / 2, 0, 0, shellMaterial));
        this.group.add(this.makePanel(shellThickness, shellHeight, shellDepth, offset + shellWidth / 2, 0, 0, shellMaterial));
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
          this.group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), lineMaterial));
        }
      }

      const maxDim = Math.max(width, height, depth);
      this.camera.position.set(maxDim * 1.45, maxDim * 1.1, maxDim * 1.55);
      this.controls.target.set(0, 0, 0);
      this.controls.update();
    }

    makePanel(width, height, depth, x, y, z, material) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material.clone());
      mesh.position.set(x, y, z);
      return mesh;
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
})();
