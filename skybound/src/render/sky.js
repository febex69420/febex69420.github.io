// sky.js — sky dome, sun & moon, stars, day-night cycle, dynamic fog.
import * as THREE from 'three';
import { clamp01, lerp, smoothstep, TAU } from '../core/util.js';

const SKY_VERT = `
  varying vec3 vDir;
  void main(){
    vDir = normalize(position);
    vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    gl_Position = p.xyww; // force to far plane
  }`;
const SKY_FRAG = `
  varying vec3 vDir;
  uniform vec3 uTop; uniform vec3 uHorizon; uniform vec3 uBottom;
  uniform vec3 uSunDir; uniform vec3 uSunCol; uniform float uSunInt;
  void main(){
    float h = vDir.y;
    vec3 col = mix(uHorizon, uTop, smoothstep(0.0, 0.55, h));
    col = mix(col, uBottom, smoothstep(0.0, -0.35, h));
    float sd = max(dot(normalize(vDir), normalize(uSunDir)), 0.0);
    // sun disc + glow
    col += uSunCol * pow(sd, 1200.0) * 8.0 * uSunInt;
    col += uSunCol * pow(sd, 8.0) * 0.35 * uSunInt;
    col += uSunCol * pow(sd, 2.0) * 0.06 * uSunInt;
    gl_FragColor = vec4(col, 1.0);
  }`;

const C = (hex) => new THREE.Color(hex);

// Day-night keyframes by time-of-day (0..1): top, horizon, bottom(ground haze), sun color, sun intensity, fog
const KEYS = [
  { t: 0.00, top: C(0x05070f), hor: C(0x0a0d18), bot: C(0x05070c), sun: C(0x223055), si: 0.05, amb: 0.10, fog: C(0x070a14) },
  { t: 0.22, top: C(0x223a63), hor: C(0xd98a55), bot: C(0x40331f), sun: C(0xffd9a0), si: 0.7, amb: 0.35, fog: C(0x9a8a78) },
  { t: 0.30, top: C(0x4a86c5), hor: C(0xbcd6e8), bot: C(0x9ab0bc), sun: C(0xfff3d6), si: 1.0, amb: 0.7, fog: C(0xbcd0db) },
  { t: 0.50, top: C(0x3f86d8), hor: C(0xa9cbe6), bot: C(0xb9cbd4), sun: C(0xffffff), si: 1.25, amb: 0.95, fog: C(0xc2d6df) },
  { t: 0.70, top: C(0x3f78c0), hor: C(0xb0cbe0), bot: C(0xa8bcc6), sun: C(0xfff0d0), si: 1.0, amb: 0.7, fog: C(0xbccdd6) },
  { t: 0.78, top: C(0x2a3f6a), hor: C(0xe07a45), bot: C(0x55381f), sun: C(0xff9a55), si: 0.6, amb: 0.32, fog: C(0x8a6a55) },
  { t: 0.86, top: C(0x101936), hor: C(0x4a2f3a), bot: C(0x161018), sun: C(0x55406a), si: 0.12, amb: 0.14, fog: C(0x18141f) },
  { t: 1.00, top: C(0x05070f), hor: C(0x0a0d18), bot: C(0x05070c), sun: C(0x223055), si: 0.05, amb: 0.10, fog: C(0x070a14) },
];

function sample(t) {
  t = ((t % 1) + 1) % 1;
  let a = KEYS[0], b = KEYS[KEYS.length - 1];
  for (let i = 0; i < KEYS.length - 1; i++) {
    if (t >= KEYS[i].t && t <= KEYS[i + 1].t) { a = KEYS[i]; b = KEYS[i + 1]; break; }
  }
  const f = (t - a.t) / ((b.t - a.t) || 1);
  const mix = (x, y) => x.clone().lerp(y, f);
  return {
    top: mix(a.top, b.top), hor: mix(a.hor, b.hor), bot: mix(a.bot, b.bot),
    sun: mix(a.sun, b.sun), si: lerp(a.si, b.si, f), amb: lerp(a.amb, b.amb, f), fog: mix(a.fog, b.fog),
  };
}

export class Sky {
  constructor(scene, renderer) {
    this.scene = scene;
    this.uniforms = {
      uTop: { value: C(0x3f86d8) }, uHorizon: { value: C(0xa9cbe6) }, uBottom: { value: C(0xb9cbd4) },
      uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uSunCol: { value: C(0xffffff) }, uSunInt: { value: 1 },
    };
    const geo = new THREE.SphereGeometry(6000, 32, 16);
    this.dome = new THREE.Mesh(geo, new THREE.ShaderMaterial({
      uniforms: this.uniforms, vertexShader: SKY_VERT, fragmentShader: SKY_FRAG,
      side: THREE.BackSide, depthWrite: false, fog: false,
    }));
    this.dome.frustumCulled = false;
    scene.add(this.dome);

    // Lights
    this.sun = new THREE.DirectionalLight(0xffffff, 1.2);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.near = 1; sc.far = 1200; sc.left = -400; sc.right = 400; sc.top = 400; sc.bottom = -400;
    this.sun.shadow.bias = -0.0004;
    scene.add(this.sun);
    scene.add(this.sun.target);
    this.hemi = new THREE.HemisphereLight(0xbcd6f0, 0x404036, 0.6);
    scene.add(this.hemi);
    this.ambient = new THREE.AmbientLight(0xffffff, 0.3);
    scene.add(this.ambient);

    // Sun & moon discs
    this.sunDisc = new THREE.Mesh(new THREE.SphereGeometry(60, 16, 12),
      new THREE.MeshBasicMaterial({ color: 0xfff4d0, fog: false }));
    this.moonDisc = new THREE.Mesh(new THREE.SphereGeometry(45, 16, 12),
      new THREE.MeshBasicMaterial({ color: 0xc8d0e0, fog: false }));
    scene.add(this.sunDisc); scene.add(this.moonDisc);

    // Stars
    const N = 1400;
    const sp = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      const v = new THREE.Vector3().randomDirection().multiplyScalar(5000);
      sp[i * 3] = v.x; sp[i * 3 + 1] = Math.abs(v.y) * 0.9 + 200; sp[i * 3 + 2] = v.z;
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
    this.starMat = new THREE.PointsMaterial({ color: 0xffffff, size: 7, sizeAttenuation: false, transparent: true, opacity: 0, depthWrite: false, fog: false });
    this.stars = new THREE.Points(sg, this.starMat);
    this.stars.frustumCulled = false;
    scene.add(this.stars);

    scene.fog = new THREE.FogExp2(0xc2d6df, 0.0009);
    this.shadowsEnabled = true;
    this._tmp = new THREE.Vector3();
  }

  setShadows(on) { this.shadowsEnabled = on; this.sun.castShadow = on; }

  // timeOfDay 0..1; weatherDarken 0..1 (storm dims & grays); camPos to keep sky centered.
  update(timeOfDay, camPos, weatherDarken = 0, fogDensity = 0.0009) {
    const s = sample(timeOfDay);
    // sun elevation: peaks at noon (0.5), below horizon at night
    const ang = (timeOfDay - 0.25) * TAU; // 0.25 -> sunrise at horizon east
    const sunDir = this._tmp.set(Math.cos(ang), Math.sin(ang), 0.25).normalize();

    const dk = clamp01(weatherDarken);
    const gray = (col) => col.clone().lerp(new THREE.Color(0x9aa3ad), dk * 0.6);

    this.uniforms.uTop.value.copy(gray(s.top));
    this.uniforms.uHorizon.value.copy(gray(s.hor));
    this.uniforms.uBottom.value.copy(gray(s.bot));
    this.uniforms.uSunCol.value.copy(s.sun);
    this.uniforms.uSunInt.value = s.si * (1 - dk * 0.7);
    this.uniforms.uSunDir.value.copy(sunDir);

    const sunUp = clamp01(sunDir.y);
    this.sun.color.copy(s.sun);
    this.sun.intensity = s.si * 1.5 * (1 - dk * 0.65) * smoothstep(-0.05, 0.2, sunDir.y);
    this.hemi.intensity = (0.25 + s.amb * 0.7) * (1 - dk * 0.4);
    this.hemi.color.copy(s.top).lerp(new THREE.Color(0xffffff), 0.3);
    this.ambient.intensity = (0.12 + s.amb * 0.35) * (1 - dk * 0.3);

    // position sun light relative to camera
    const dist = 600;
    this.sun.position.copy(camPos).addScaledVector(sunDir, dist);
    this.sun.target.position.copy(camPos);
    this.sun.target.updateMatrixWorld();

    // discs
    this.sunDisc.position.copy(camPos).addScaledVector(sunDir, 4000);
    this.sunDisc.visible = sunDir.y > -0.15;
    this.moonDisc.position.copy(camPos).addScaledVector(sunDir, -4000);
    this.moonDisc.visible = sunDir.y < 0.15;

    // stars fade in at night
    this.starMat.opacity = smoothstep(0.15, -0.1, sunDir.y) * (1 - dk);
    this.stars.position.copy(camPos);

    // dome & fog follow camera
    this.dome.position.copy(camPos);
    if (this.scene.fog) {
      this.scene.fog.color.copy(this.uniforms.uHorizon.value);
      this.scene.fog.density = fogDensity;
    }
    this.scene.background = this.uniforms.uHorizon.value;
    this.sunElevation = sunDir.y;
  }
}
