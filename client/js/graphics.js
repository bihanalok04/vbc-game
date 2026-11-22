// Graphics upgrade: the "stylised game" look.
//
// - Painted gradient sky dome with a soft sun glow (follows the day/night colours)
// - Environment lighting (soft, even reflections on every material)
// - Laptops/desktops: post-processing
//     ambient occlusion  - soft contact shadows in corners, under people, along walls
//     bloom              - lamps, pandal lights and fairy lights glow
//     colour grade       - richer saturation, gentle contrast, warm tint, vignette
//     SMAA               - smooth edges
// - Phones: sky + environment lighting only, to keep the frame rate up.
//
// setupGraphics(renderer, scene, camera, { phone })
// returns { render(), setSize(w, h) }
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

// Saturation, contrast, warmth and a soft vignette (runs after tone mapping).
const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    saturation: { value: 1.28 },
    contrast: { value: 1.07 },
    warmth: { value: 0.035 },
    vignette: { value: 0.32 },
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    uniform float saturation, contrast, warmth, vignette;
    varying vec2 vUv;
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      float l = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
      c.rgb = mix(vec3(l), c.rgb, saturation);            // vivid colour
      c.rgb = (c.rgb - 0.5) * contrast + 0.5;             // punch
      c.rgb += vec3(warmth, warmth * 0.4, -warmth);       // warm golden tint
      float d = distance(vUv, vec2(0.5));
      c.rgb *= 1.0 - vignette * smoothstep(0.45, 0.85, d); // soft vignette
      gl_FragColor = vec4(clamp(c.rgb, 0.0, 1.0), c.a);
    }
  `,
};

// Big inverted sphere with a vertical gradient and a glow around the sun.
function makeSky(scene) {
  const uniforms = {
    topColor: { value: new THREE.Color(0x4f8fd6) },
    horizonColor: { value: new THREE.Color(0xf3d9b1) },
    sunDir: { value: new THREE.Vector3(-0.7, 0.5, 0.4).normalize() },
    sunColor: { value: new THREE.Color(0xfff0c8) },
    sunStrength: { value: 1.0 },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    vertexShader: /* glsl */`
      varying vec3 vDir;
      void main() { vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
    `,
    fragmentShader: /* glsl */`
      uniform vec3 topColor, horizonColor, sunDir, sunColor;
      uniform float sunStrength;
      varying vec3 vDir;
      void main() {
        float h = clamp(vDir.y, -0.1, 1.0);
        vec3 col = mix(horizonColor, topColor, pow(smoothstep(-0.02, 0.6, h), 0.7));
        float s = max(dot(normalize(vDir), sunDir), 0.0);
        col += sunColor * (pow(s, 600.0) * 2.5 + pow(s, 12.0) * 0.35) * sunStrength; // sun disc + glow
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(450, 32, 16), mat);
  sky.renderOrder = -1;
  sky.frustumCulled = false;
  scene.add(sky);
  return { sky, uniforms };
}

export function setupGraphics(renderer, scene, camera, { phone = false } = {}) {
  // Soft environment light so materials look lit and rounded, not flat.
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  if ('environmentIntensity' in scene) scene.environmentIntensity = 0.45;

  const { sky, uniforms } = makeSky(scene);
  const tmp = new THREE.Color();
  const hsl = {};

  // Keep the sky in step with world.setLight(), which sets the background and fog colours.
  function updateSky() {
    sky.position.copy(camera.position);
    if (scene.background?.isColor) {
      // a deeper, more saturated version of the sky colour at the top
      tmp.copy(scene.background).getHSL(hsl);
      uniforms.topColor.value.setHSL(hsl.h, Math.min(1, hsl.s * 1.25 + 0.1), hsl.l * 0.82);
    }
    if (scene.fog) uniforms.horizonColor.value.copy(scene.fog.color);
    const bright = scene.background?.isColor ? scene.background.getHSL(hsl).l : 0.6;
    uniforms.sunStrength.value = THREE.MathUtils.clamp((bright - 0.25) * 2.2, 0, 1);
  }

  if (phone) {
    return {
      render() { updateSky(); renderer.render(scene, camera); },
      setSize(w, h) { renderer.setSize(w, h); },
    };
  }

  const size = renderer.getSize(new THREE.Vector2());
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));

  const gtao = new GTAOPass(scene, camera, size.x, size.y);
  gtao.blendIntensity = 0.85;
  gtao.updateGtaoMaterial({ radius: 1.6, distanceExponent: 1.4, thickness: 2.0, scale: 1.0, samples: 12 });
  gtao.updatePdMaterial({ radius: 6, rings: 2, samples: 12 });
  composer.addPass(gtao);

  const bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.42, 0.55, 0.93);
  composer.addPass(bloom);

  composer.addPass(new OutputPass()); // tone mapping + colour space
  const grade = new ShaderPass(GradeShader);
  composer.addPass(grade);
  const smaa = new SMAAPass(size.x * renderer.getPixelRatio(), size.y * renderer.getPixelRatio());
  composer.addPass(smaa);

  return {
    render() {
      updateSky();
      // more bloom at night, when the lights matter
      const bright = scene.background?.isColor ? scene.background.getHSL(hsl).l : 0.6;
      const day = THREE.MathUtils.clamp((bright - 0.1) / 0.5, 0, 1);
      bloom.strength = THREE.MathUtils.lerp(0.95, 0.3, day);
      bloom.threshold = THREE.MathUtils.lerp(0.62, 0.93, day); // at night the lamps and pandals bloom
      composer.render();
    },
    setSize(w, h) {
      renderer.setSize(w, h);
      composer.setSize(w, h);
    },
  };
}
