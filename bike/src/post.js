// 화면 후처리: 밝은 곳 빛 번짐(Bloom) + 색보정·가장자리 어둡게 + 계단 현상 줄이기(MSAA)
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

const GradeShader = {
  uniforms: { tDiffuse: { value: null }, contrast: { value: 1.14 }, saturation: { value: 1.12 }, vignette: { value: 0.28 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform float contrast, saturation, vignette; varying vec2 vUv;
    void main(){
      vec4 c = texture2D(tDiffuse, vUv);
      float l = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
      c.rgb = mix(vec3(l), c.rgb, saturation);
      c.rgb = (c.rgb - 0.18) * contrast + 0.18;          // 장면 평균 밝기(0.18) 기준으로 대비
      float d = distance(vUv, vec2(0.5)); c.rgb *= 1.0 - vignette * smoothstep(0.45, 0.85, d);
      gl_FragColor = vec4(max(c.rgb, 0.0), c.a);
    }`,
};

export function makePost(renderer, scene, camera) {
  const size = renderer.getSize(new THREE.Vector2()), pr = renderer.getPixelRatio();
  const rt = new THREE.WebGLRenderTarget(size.x * pr, size.y * pr, { type: THREE.HalfFloatType, samples: 4 });
  const composer = new EffectComposer(renderer, rt);
  composer.addPass(new RenderPass(scene, camera));
  // GTAO(틈 그늘)는 뺌: 큰 산 지형에서 먼 산에 검은 얼룩이 생기고 태블릿에서 무거움 (2026-11-25 화면 점검)
  const bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.12, 0.5, 1.0);
  composer.addPass(bloom);
  composer.addPass(new ShaderPass(GradeShader));
  composer.addPass(new OutputPass());
  return {
    render: () => composer.render(),
    setSize(w, h) { composer.setPixelRatio(renderer.getPixelRatio()); composer.setSize(w, h); },
    dispose() { composer.dispose(); rt.dispose(); },
  };
}
