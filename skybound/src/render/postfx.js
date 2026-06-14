// postfx.js — self-contained bloom/glow + vignette/grade. No Three.js addon dependency.
// Pipeline: scene -> sceneRT ; bright-pass -> blur(H,V) ping-pong (downsampled) ;
//           composite(sceneRT + bloom) -> screen.
import * as THREE from 'three';

const QUAD_VERT = `
  varying vec2 vUv;
  void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

const THRESH_FRAG = `
  varying vec2 vUv; uniform sampler2D tDiffuse; uniform float uThreshold; uniform float uSoft;
  void main(){
    vec3 c = texture2D(tDiffuse, vUv).rgb;
    float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
    float k = smoothstep(uThreshold, uThreshold + uSoft, l);
    gl_FragColor = vec4(c * k, 1.0);
  }`;

const BLUR_FRAG = `
  varying vec2 vUv; uniform sampler2D tDiffuse; uniform vec2 uDir; uniform vec2 uTexel;
  void main(){
    vec3 sum = vec3(0.0);
    float w[5]; w[0]=0.227; w[1]=0.194; w[2]=0.121; w[3]=0.054; w[4]=0.016;
    sum += texture2D(tDiffuse, vUv).rgb * w[0];
    for (int i=1;i<5;i++){
      vec2 off = uDir * uTexel * float(i) * 1.4;
      sum += texture2D(tDiffuse, vUv + off).rgb * w[i];
      sum += texture2D(tDiffuse, vUv - off).rgb * w[i];
    }
    gl_FragColor = vec4(sum, 1.0);
  }`;

const COMPOSITE_FRAG = `
  varying vec2 vUv;
  uniform sampler2D tBase; uniform sampler2D tBloom;
  uniform float uStrength; uniform float uVignette; uniform float uExposure;
  void main(){
    vec3 base = texture2D(tBase, vUv).rgb;
    vec3 bloom = texture2D(tBloom, vUv).rgb;
    vec3 col = base + bloom * uStrength;
    col *= uExposure;
    // gentle filmic-ish tone
    col = col / (col + vec3(0.85)) * 1.85;
    // vignette
    vec2 d = vUv - 0.5;
    float v = smoothstep(0.85, 0.35, length(d));
    col *= mix(1.0, v, uVignette);
    gl_FragColor = vec4(col, 1.0);
  }`;

function makeRT(w, h, type) {
  return new THREE.WebGLRenderTarget(Math.max(1, w), Math.max(1, h), {
    minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
    type, depthBuffer: false,
  });
}

export class PostFX {
  constructor(renderer, w, h) {
    this.renderer = renderer;
    this.enabled = true;
    this.strength = 0.85;
    this.threshold = 0.78;

    const type = renderer.capabilities.isWebGL2 ? THREE.HalfFloatType : THREE.UnsignedByteType;
    this.type = type;
    this.scene = new THREE.WebGLRenderTarget(w, h, { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, type, depthBuffer: true, stencilBuffer: false });
    this.bright = makeRT(w >> 1, h >> 1, type);
    this.blurA = makeRT(w >> 1, h >> 1, type);
    this.blurB = makeRT(w >> 1, h >> 1, type);

    this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
    this.fsScene = new THREE.Scene(); this.fsScene.add(this.quad);

    this.mThresh = new THREE.ShaderMaterial({ uniforms: { tDiffuse: { value: null }, uThreshold: { value: this.threshold }, uSoft: { value: 0.25 } }, vertexShader: QUAD_VERT, fragmentShader: THRESH_FRAG, depthTest: false, depthWrite: false });
    this.mBlur = new THREE.ShaderMaterial({ uniforms: { tDiffuse: { value: null }, uDir: { value: new THREE.Vector2(1, 0) }, uTexel: { value: new THREE.Vector2(1 / (w >> 1), 1 / (h >> 1)) } }, vertexShader: QUAD_VERT, fragmentShader: BLUR_FRAG, depthTest: false, depthWrite: false });
    this.mComposite = new THREE.ShaderMaterial({ uniforms: { tBase: { value: null }, tBloom: { value: null }, uStrength: { value: this.strength }, uVignette: { value: 0.6 }, uExposure: { value: 1.0 } }, vertexShader: QUAD_VERT, fragmentShader: COMPOSITE_FRAG, depthTest: false, depthWrite: false });

    this.size = new THREE.Vector2(w, h);
  }

  setEnabled(v) { this.enabled = v; }
  setStrength(v) { this.strength = v; this.mComposite.uniforms.uStrength.value = v; }
  setExposure(v) { this.mComposite.uniforms.uExposure.value = v; }

  resize(w, h) {
    this.size.set(w, h);
    this.scene.setSize(w, h);
    this.bright.setSize(w >> 1, h >> 1);
    this.blurA.setSize(w >> 1, h >> 1);
    this.blurB.setSize(w >> 1, h >> 1);
    this.mBlur.uniforms.uTexel.value.set(1 / (w >> 1), 1 / (h >> 1));
  }

  _pass(material, target) {
    this.quad.material = material;
    this.renderer.setRenderTarget(target);
    this.renderer.clear();
    this.renderer.render(this.fsScene, this.cam);
  }

  // Render `scene3d` through the camera, applying post. Final output goes to screen.
  render(scene3d, camera) {
    const r = this.renderer;
    if (!this.enabled) {
      r.setRenderTarget(null); r.render(scene3d, camera); return;
    }
    // 1. scene -> sceneRT
    r.setRenderTarget(this.scene); r.clear(); r.render(scene3d, camera);
    // 2. bright pass
    this.mThresh.uniforms.tDiffuse.value = this.scene.texture;
    this.mThresh.uniforms.uThreshold.value = this.threshold;
    this._pass(this.mThresh, this.bright);
    // 3. blur ping-pong (2 iterations)
    let src = this.bright;
    for (let i = 0; i < 2; i++) {
      this.mBlur.uniforms.tDiffuse.value = src.texture;
      this.mBlur.uniforms.uDir.value.set(1, 0);
      this._pass(this.mBlur, this.blurA);
      this.mBlur.uniforms.tDiffuse.value = this.blurA.texture;
      this.mBlur.uniforms.uDir.value.set(0, 1);
      this._pass(this.mBlur, this.blurB);
      src = this.blurB;
    }
    // 4. composite to screen
    this.mComposite.uniforms.tBase.value = this.scene.texture;
    this.mComposite.uniforms.tBloom.value = this.blurB.texture;
    this.mComposite.uniforms.uStrength.value = this.strength;
    this.quad.material = this.mComposite;
    r.setRenderTarget(null);
    r.clear();
    r.render(this.fsScene, this.cam);
  }
}
