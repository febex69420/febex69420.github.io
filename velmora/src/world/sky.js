// Day/night cycle, sun & moon, stars, drifting cloud layer, weather state
// machine (clear / overcast / rain + lightning), fog and PBR environment map.
import * as THREE from 'three';
import { clamp, lerp, smoothstep, damp, makeCanvasTex } from '../core/utils.js';

const DAY = { top: new THREE.Color(0x3a6ea8), horizon: new THREE.Color(0xbfd3e0), fog: new THREE.Color(0xb8c8d4) };
const DUSK = { top: new THREE.Color(0x2a3560), horizon: new THREE.Color(0xd88a4a), fog: new THREE.Color(0xb08a72) };
const NIGHT = { top: new THREE.Color(0x060a18), horizon: new THREE.Color(0x101a2c), fog: new THREE.Color(0x0c1220) };
const RAIN_MUL = 0.45;

export class Sky {
  constructor(ctx) {
    this.ctx = ctx;
    this.tod = ctx.config.time.startHour;         // hours 0..24
    this.daySpeed = 24 / (ctx.config.time.dayLengthMinutes * 60); // hours per second
    this.day = 1;
    this.nightFactor = 0;
    this.weather = 'clear';
    this.cloudCover = 0.25;   // current
    this.cloudTarget = 0.25;
    this.rain = 0;
    this.rainTarget = 0;
    this.weatherTimer = 120 + Math.random() * 120;
    this.lightningTimer = 0;
    this.flash = 0;
    this._envHour = -99;

    const scene = ctx.scene;

    // sky dome
    this.uniforms = {
      topColor: { value: DAY.top.clone() },
      horizonColor: { value: DAY.horizon.clone() },
      offset: { value: 60 },
      exponent: { value: 0.9 },
    };
    // Radius must stay well inside the smallest camera far plane (3600 on the
    // low preset) or the far clip cuts a black hole in the sky straight ahead.
    const domeGeo = new THREE.SphereGeometry(2950, 32, 15);
    const domeMat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: false,
      fog: false,
      vertexShader: `
        varying vec3 vWorld;
        void main() {
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vWorld = wp.xyz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: `
        uniform vec3 topColor; uniform vec3 horizonColor; uniform float offset; uniform float exponent;
        varying vec3 vWorld;
        void main() {
          float h = normalize(vWorld + vec3(0.0, offset, 0.0)).y;
          gl_FragColor = vec4(mix(horizonColor, topColor, pow(max(h, 0.0), exponent)), 1.0);
        }`,
    });
    this.dome = new THREE.Mesh(domeGeo, domeMat);
    this.dome.renderOrder = -10;
    this.dome.frustumCulled = false;
    scene.add(this.dome);

    // lights
    this.sun = new THREE.DirectionalLight(0xfff2dd, 2.6);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.6;
    scene.add(this.sun);
    scene.add(this.sun.target);
    this.setShadowDistance(110, 2048);

    this.hemi = new THREE.HemisphereLight(0xbcd3e8, 0x6a705e, 0.9);
    scene.add(this.hemi);
    this.moonLight = new THREE.DirectionalLight(0x8fa8d0, 0);
    scene.add(this.moonLight);
    scene.add(this.moonLight.target);

    // sun & moon sprites
    const glowTex = makeCanvasTex(128, 128, (c, w, h) => {
      const g = c.createRadialGradient(w / 2, h / 2, 4, w / 2, h / 2, w / 2);
      g.addColorStop(0, 'rgba(255,255,255,1)');
      g.addColorStop(0.25, 'rgba(255,240,210,0.85)');
      g.addColorStop(1, 'rgba(255,240,210,0)');
      c.fillStyle = g; c.fillRect(0, 0, w, h);
    });
    this.sunSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xfff0c8, transparent: true, depthWrite: false, fog: false }));
    this.sunSprite.scale.setScalar(560);
    scene.add(this.sunSprite);
    this.moonSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xcfdcf2, transparent: true, depthWrite: false, fog: false, opacity: 0.9 }));
    this.moonSprite.scale.setScalar(240);
    scene.add(this.moonSprite);

    // stars
    const starGeo = new THREE.BufferGeometry();
    const N = 900;
    const sp = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      const t = Math.random() * Math.PI * 2, p = Math.acos(Math.random() * 0.95);
      const r = 2850;
      sp[i * 3] = r * Math.sin(p) * Math.cos(t);
      sp[i * 3 + 1] = r * Math.cos(p) + 100;
      sp[i * 3 + 2] = r * Math.sin(p) * Math.sin(t);
    }
    starGeo.setAttribute('position', new THREE.BufferAttribute(sp, 3));
    this.starMat = new THREE.PointsMaterial({ color: 0xdfe8ff, size: 3.6, sizeAttenuation: true, transparent: true, opacity: 0, fog: false, depthWrite: false });
    this.stars = new THREE.Points(starGeo, this.starMat);
    scene.add(this.stars);

    // clouds (billboard sprites drifting with the wind)
    const cloudTex = makeCanvasTex(256, 128, (c, w, h) => {
      c.clearRect(0, 0, w, h);
      for (let i = 0; i < 22; i++) {
        const x = 30 + Math.random() * (w - 60), y = 40 + Math.random() * (h - 70);
        const r = 18 + Math.random() * 30;
        const g = c.createRadialGradient(x, y, 2, x, y, r);
        g.addColorStop(0, 'rgba(255,255,255,0.55)');
        g.addColorStop(1, 'rgba(255,255,255,0)');
        c.fillStyle = g;
        c.beginPath(); c.arc(x, y, r, 0, 7); c.fill();
      }
    });
    this.cloudMat = new THREE.SpriteMaterial({ map: cloudTex, transparent: true, opacity: 0.55, depthWrite: false, fog: false });
    this.clouds = [];
    const cloudGroup = new THREE.Group();
    for (let i = 0; i < 46; i++) {
      const s = new THREE.Sprite(this.cloudMat);
      const scale = 320 + Math.random() * 480;
      s.scale.set(scale, scale * 0.42, 1);
      s.position.set((Math.random() - 0.5) * 5200, 380 + Math.random() * 320, (Math.random() - 0.5) * 5200);
      s.userData.speed = 3 + Math.random() * 5;
      cloudGroup.add(s);
      this.clouds.push(s);
    }
    scene.add(cloudGroup);

    // rain particles around the camera
    const rainGeo = new THREE.BufferGeometry();
    const RN = 1500;
    this.rainCount = RN;
    const rp = new Float32Array(RN * 3);
    for (let i = 0; i < RN; i++) {
      rp[i * 3] = (Math.random() - 0.5) * 44;
      rp[i * 3 + 1] = Math.random() * 30;
      rp[i * 3 + 2] = (Math.random() - 0.5) * 44;
    }
    rainGeo.setAttribute('position', new THREE.BufferAttribute(rp, 3));
    this.rainMat = new THREE.PointsMaterial({ color: 0x9fb4c8, size: 0.07, transparent: true, opacity: 0, depthWrite: false });
    this.rainPts = new THREE.Points(rainGeo, this.rainMat);
    this.rainPts.frustumCulled = false;
    scene.add(this.rainPts);

    // fog
    scene.fog = new THREE.Fog(DAY.fog.clone(), 200, 2600);

    this.pmrem = new THREE.PMREMGenerator(ctx.renderer);
    this._envScene = new THREE.Scene();
    this._envScene.add(this.dome.clone());
  }

  setShadowDistance(dist, mapSize) {
    const c = this.sun.shadow.camera;
    c.left = -dist; c.right = dist; c.top = dist; c.bottom = -dist;
    c.near = 10; c.far = 900;
    c.updateProjectionMatrix();
    if (mapSize && this.sun.shadow.mapSize.x !== mapSize) {
      this.sun.shadow.mapSize.set(mapSize, mapSize);
      if (this.sun.shadow.map) { this.sun.shadow.map.dispose(); this.sun.shadow.map = null; }
    }
  }
  setViewDistance(d) {
    this.ctx.scene.fog.far = d;
    this.ctx.scene.fog.near = d * 0.08;
  }

  timeString() {
    const h = Math.floor(this.tod), m = Math.floor((this.tod - h) * 60);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  setWeather(w) {
    this.weather = w;
    this.cloudTarget = w === 'clear' ? 0.2 + Math.random() * 0.15 : w === 'cloudy' ? 0.75 : 1;
    this.rainTarget = w === 'rain' ? 0.5 + Math.random() * 0.5 : 0;
  }

  update(dt, playerPos) {
    const ctx = this.ctx;
    this.tod += this.daySpeed * dt * (ctx.timeScale || 1);
    if (this.tod >= 24) { this.tod -= 24; this.day++; }

    // weather machine
    this.weatherTimer -= dt;
    if (this.weatherTimer <= 0) {
      this.weatherTimer = 150 + Math.random() * 200;
      const r = Math.random();
      this.setWeather(r < 0.5 ? 'clear' : r < 0.8 ? 'cloudy' : 'rain');
      if (this.weather === 'rain') ctx.events.emit('notify', { title: 'STATE METEOROLOGY', text: 'Rainfall moving across the capital region.', kind: '' });
    }
    this.cloudCover = damp(this.cloudCover, this.cloudTarget, 0.3, dt);
    this.rain = damp(this.rain, this.rainTarget, 0.4, dt);

    // sun path
    const ang = ((this.tod - 6) / 24) * Math.PI * 2;   // sunrise ~06:00
    const sunDir = new THREE.Vector3(Math.cos(ang) * 0.72, Math.sin(ang), 0.35).normalize();
    const elev = sunDir.y;
    const dayF = smoothstep(-0.06, 0.14, elev);
    this.nightFactor = 1 - dayF;

    this.sun.position.copy(playerPos).addScaledVector(sunDir, 420);
    this.sun.target.position.copy(playerPos);
    const duskF = 1 - Math.abs(clamp(elev * 3, -1, 1));
    const sunCol = new THREE.Color(0xfff2dd).lerp(new THREE.Color(0xff7b3a), clamp(duskF, 0, 1) * 0.8);
    this.sun.color.copy(sunCol);
    const cloudDim = 1 - this.cloudCover * RAIN_MUL - this.rain * 0.3;
    this.sun.intensity = 2.7 * dayF * Math.max(0.25, cloudDim);
    this.sun.castShadow = dayF > 0.05;

    // moon roughly opposite
    const moonDir = sunDir.clone().negate();
    moonDir.x += 0.2; moonDir.normalize();
    this.moonLight.position.copy(playerPos).addScaledVector(moonDir, 400);
    this.moonLight.target.position.copy(playerPos);
    this.moonLight.intensity = 0.35 * this.nightFactor * (1 - this.rain * 0.5);
    this.hemi.intensity = lerp(0.18, 1.05, dayF) * (1 - this.cloudCover * 0.2);

    this.sunSprite.position.copy(playerPos).addScaledVector(sunDir, 3100);
    this.sunSprite.material.opacity = clamp(dayF * (1 - this.cloudCover * 0.75), 0, 1);
    this.moonSprite.position.copy(playerPos).addScaledVector(moonDir, 3100);
    this.moonSprite.material.opacity = this.nightFactor * (1 - this.cloudCover * 0.7);

    // sky colors
    const mix = (a, b, t, out) => out.copy(a).lerp(b, t);
    const tmpT = new THREE.Color(), tmpH = new THREE.Color(), tmpF = new THREE.Color();
    if (elev > 0.12) { tmpT.copy(DAY.top); tmpH.copy(DAY.horizon); tmpF.copy(DAY.fog); }
    else if (elev > -0.08) {
      const t = smoothstep(-0.08, 0.12, elev);
      mix(DUSK.top, DAY.top, t, tmpT); mix(DUSK.horizon, DAY.horizon, t, tmpH); mix(DUSK.fog, DAY.fog, t, tmpF);
    } else {
      const t = smoothstep(-0.25, -0.08, elev);
      mix(NIGHT.top, DUSK.top, t, tmpT); mix(NIGHT.horizon, DUSK.horizon, t, tmpH); mix(NIGHT.fog, DUSK.fog, t, tmpF);
    }
    // overcast desaturation
    const gray = new THREE.Color(0x39424c);
    const grayN = new THREE.Color(0x0a0e14);
    const overcast = this.cloudCover * 0.6 + this.rain * 0.4;
    tmpT.lerp(this.nightFactor > 0.5 ? grayN : gray, overcast * 0.7);
    tmpH.lerp(this.nightFactor > 0.5 ? grayN : gray, overcast * 0.55);
    tmpF.lerp(this.nightFactor > 0.5 ? grayN : gray, overcast * 0.6);
    if (this.flash > 0) {
      const f = this.flash;
      tmpT.lerp(new THREE.Color(0xdfe8ff), f); tmpH.lerp(new THREE.Color(0xdfe8ff), f);
      this.hemi.intensity += f * 2;
      this.flash = Math.max(0, this.flash - dt * 6);
    }
    this.uniforms.topColor.value.copy(tmpT);
    this.uniforms.horizonColor.value.copy(tmpH);
    ctx.scene.fog.color.copy(tmpF);
    this.dome.position.copy(playerPos);

    // stars
    this.starMat.opacity = this.nightFactor * (1 - this.cloudCover * 0.85);
    this.stars.position.set(playerPos.x, 0, playerPos.z);

    // clouds
    this.cloudMat.opacity = 0.2 + this.cloudCover * 0.55;
    this.cloudMat.color.setScalar(lerp(0.25, 1, dayF * (1 - this.rain * 0.4)));
    for (const cl of this.clouds) {
      cl.position.x += cl.userData.speed * dt;
      if (cl.position.x - playerPos.x > 2600) cl.position.x -= 5200;
      if (playerPos.x - cl.position.x > 2600) cl.position.x += 5200;
      if (cl.position.z - playerPos.z > 2600) cl.position.z -= 5200;
      if (playerPos.z - cl.position.z > 2600) cl.position.z += 5200;
    }

    // rain
    this.rainMat.opacity = this.rain * 0.65;
    if (this.rain > 0.02) {
      const arr = this.rainPts.geometry.attributes.position.array;
      for (let i = 0; i < this.rainCount; i++) {
        arr[i * 3 + 1] -= (26 + (i % 7)) * dt;
        arr[i * 3] += 6 * dt;
        if (arr[i * 3 + 1] < 0) {
          arr[i * 3 + 1] = 28 + Math.random() * 4;
          arr[i * 3] = (Math.random() - 0.5) * 44;
          arr[i * 3 + 2] = (Math.random() - 0.5) * 44;
        }
      }
      this.rainPts.geometry.attributes.position.needsUpdate = true;
      this.rainPts.position.set(playerPos.x, playerPos.y - 6, playerPos.z);
      // lightning
      this.lightningTimer -= dt;
      if (this.lightningTimer <= 0 && this.rain > 0.5) {
        this.lightningTimer = 6 + Math.random() * 18;
        this.flash = 1;
        ctx.audio.thunder();
      }
    }

    // night-driven emissives (street lamps, windows, vehicle lights)
    const glow = smoothstep(0.25, 0.75, this.nightFactor);
    for (const m of ctx.mats.nightEmissives) m.emissiveIntensity = glow * (m === ctx.mats.lampGlow ? 1.6 : 0.9);

    // environment map refresh once per game hour
    if (Math.abs(this.tod - this._envHour) > 1) {
      this._envHour = this.tod;
      const domeClone = this._envScene.children[0];
      domeClone.material = this.dome.material;
      const rt = this.pmrem.fromScene(this._envScene, 0.04);
      if (this._envRT) this._envRT.dispose();
      this._envRT = rt;
      ctx.scene.environment = rt.texture;
    }
  }
}
