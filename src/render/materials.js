import * as THREE from 'three';

// Additive "light" materials (lamp pools, halos, lanterns, fireflies).
// Normal fog would tint these towards the fog colour, which makes distant glows
// look like grey squares. Instead we fade them to black with distance.
const FOG_FADE = /* glsl */ `
#ifdef USE_FOG
  float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
  gl_FragColor.rgb *= 1.0 - fogFactor;
#endif`;

export function fadeFog(mat) {
  mat.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace('#include <fog_fragment>', FOG_FADE);
  };
  mat.customProgramCacheKey = () => 'fadeFog';
  return mat;
}

export function additive({ map, color = 0xffffff, opacity = 1, size = 1, points = false, fog = true, vertexColors = false, sizeAttenuation = true }) {
  const common = {
    map,
    color,
    transparent: true,
    opacity,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    fog,
    vertexColors,
  };
  const mat = points ? new THREE.PointsMaterial({ ...common, size, sizeAttenuation }) : new THREE.MeshBasicMaterial(common);
  return fog ? fadeFog(mat) : mat;
}
