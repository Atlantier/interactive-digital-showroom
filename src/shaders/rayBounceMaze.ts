export const PHOTON_BEAM_VERTEX_COMMON = `#include <common>
varying vec2 vRayUv;`

export const PHOTON_BEAM_BEGIN_VERTEX = `#include <begin_vertex>
vRayUv = uv;`

export const PHOTON_BEAM_FRAGMENT_COMMON = `#include <common>
uniform float uRayTime;
varying vec2 vRayUv;`

export const PHOTON_BEAM_COLOR_FRAGMENT = `#include <color_fragment>
float photonPulse = pow(
  0.5 + 0.5 * sin(vRayUv.y * 46.0 - uRayTime * 18.0),
  10.0
);
float photonFilament = pow(
  0.5 + 0.5 * sin(vRayUv.x * 6.2831),
  5.0
);
diffuseColor.rgb *= 0.72 + photonPulse * 1.55;
diffuseColor.a *= 0.78 + photonPulse * 0.22;
diffuseColor.rgb *= 0.62 + photonFilament * 0.38;`
