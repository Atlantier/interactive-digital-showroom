// Shared GLSL programs for the Plasma Reactor exhibit.
export const PLASMA_NOISE_GLSL = /* glsl */ `
  float hash31(vec3 point) {
    point = fract(point * 0.1031);
    point += dot(point, point.yzx + 33.33);
    return fract((point.x + point.y) * point.z);
  }

  float noise3(vec3 point) {
    vec3 cell = floor(point);
    vec3 local = fract(point);
    local = local * local * (3.0 - 2.0 * local);
    float n000 = hash31(cell + vec3(0.0, 0.0, 0.0));
    float n100 = hash31(cell + vec3(1.0, 0.0, 0.0));
    float n010 = hash31(cell + vec3(0.0, 1.0, 0.0));
    float n110 = hash31(cell + vec3(1.0, 1.0, 0.0));
    float n001 = hash31(cell + vec3(0.0, 0.0, 1.0));
    float n101 = hash31(cell + vec3(1.0, 0.0, 1.0));
    float n011 = hash31(cell + vec3(0.0, 1.0, 1.0));
    float n111 = hash31(cell + vec3(1.0, 1.0, 1.0));
    return mix(
      mix(
        mix(n000, n100, local.x),
        mix(n010, n110, local.x),
        local.y
      ),
      mix(
        mix(n001, n101, local.x),
        mix(n011, n111, local.x),
        local.y
      ),
      local.z
    );
  }

  float fbm3(vec3 point) {
    float value = 0.0;
    float amplitude = 0.54;
    for (int octave = 0; octave < 4; octave++) {
      value += noise3(point) * amplitude;
      point = point * 2.03 + vec3(7.1, 3.7, 5.9);
      amplitude *= 0.48;
    }
    return value;
  }
`

export const plasmaCoreVertexShader = /* glsl */ `
  uniform float uTime;
  uniform float uTurbulence;
  uniform float uAudioEnergy;
  uniform float uOverdrive;
  uniform float uCharge;

  varying vec3 vLocalPosition;
  varying vec3 vNormalDirection;
  varying vec3 vViewDirection;
  varying float vCoarse;
  varying float vFine;
  varying float vBoil;

  ${PLASMA_NOISE_GLSL}

  void main() {
    vec3 direction = normalize(position);
    float coarse = fbm3(
      direction * 2.35 +
      vec3(0.0, uTime * 0.32, 0.0)
    );
    float fine = fbm3(
      direction * 6.6 -
      vec3(uTime * 0.18, 0.0, uTime * 0.11)
    );
    float boil =
      0.5 +
      0.5 *
      sin(
        (coarse + fine) * 14.0 +
        uTime * (2.8 + uOverdrive * 2.2) +
        uAudioEnergy * 4.0 +
        uCharge * 3.0
      );
    float displacement =
      (coarse - 0.5) * 0.105 * (0.55 + uTurbulence) +
      (fine - 0.5) * 0.032 +
      uOverdrive * 0.032;
    vec3 transformed = position + normal * displacement;
    vec4 worldPosition =
      modelMatrix * vec4(transformed, 1.0);

    vLocalPosition = transformed;
    vNormalDirection = normalize(mat3(modelMatrix) * normal);
    vViewDirection = normalize(cameraPosition - worldPosition.xyz);
    vCoarse = coarse;
    vFine = fine;
    vBoil = boil;

    gl_Position = projectionMatrix * viewMatrix * worldPosition;
  }
`

export const plasmaCoreFragmentShader = /* glsl */ `
  uniform float uTime;
  uniform float uTemperature;
  uniform float uTurbulence;
  uniform float uAudioEnergy;
  uniform float uOverdrive;
  uniform float uCharge;

  varying vec3 vLocalPosition;
  varying vec3 vNormalDirection;
  varying vec3 vViewDirection;
  varying float vCoarse;
  varying float vFine;
  varying float vBoil;

  ${PLASMA_NOISE_GLSL}

  vec3 fusionSpectrum(float temperature, float overdrive) {
    float t = clamp(temperature, 0.0, 1.0);
    vec3 coldFusion = mix(
      vec3(0.008, 0.055, 0.075),
      vec3(0.018, 0.42, 0.31),
      smoothstep(0.0, 0.42, t)
    );
    coldFusion = mix(
      coldFusion,
      vec3(0.12, 0.88, 0.67),
      smoothstep(0.34, 0.78, t)
    );
    coldFusion = mix(
      coldFusion,
      vec3(0.72, 1.0, 0.91),
      smoothstep(0.78, 1.0, t)
    );
    vec3 overdrivePlasma = mix(
      vec3(0.008, 0.055, 0.42),
      vec3(0.08, 0.42, 1.0),
      smoothstep(0.02, 0.72, t)
    );
    overdrivePlasma = mix(
      overdrivePlasma,
      vec3(0.3, 0.7, 1.0),
      smoothstep(0.68, 1.0, t)
    );
    return mix(
      coldFusion,
      overdrivePlasma,
      overdrive * 0.92
    );
  }

  void main() {
    float furnace = fbm3(
      vLocalPosition * 4.8 +
      vec3(uTime * 0.26, uTime * 0.39, -uTime * 0.18)
    );
    float veins = pow(
      abs(
        sin(
          (vCoarse - vFine) * 31.0 +
          furnace * 12.0 +
          uTime * 2.4
        )
      ),
      3.0
    );
    float heat = clamp(
      uTemperature +
      uOverdrive * (0.98 - uTemperature) +
      uCharge * uOverdrive * 0.06 +
      (vCoarse - 0.5) * 0.42 +
      (furnace - 0.5) * 0.3 +
      vBoil * 0.12 +
      uAudioEnergy * 0.18,
      0.0,
      1.0
    );
    float facing = abs(
      dot(
        normalize(vNormalDirection),
        normalize(vViewDirection)
      )
    );
    float rim = pow(1.0 - facing, 2.2);
    vec3 spectrum = fusionSpectrum(heat, uOverdrive);
    vec3 veinColor = mix(
      vec3(0.12, 0.98, 0.72),
      vec3(0.24, 0.68, 1.0),
      uOverdrive
    );
    spectrum +=
      veinColor *
      veins *
      (0.26 + uTurbulence * 0.3);
    spectrum +=
      mix(
        vec3(0.28, 0.06, 0.82),
        vec3(0.16, 0.54, 1.0),
        uOverdrive
      ) *
      rim *
      (0.12 + uAudioEnergy * 0.1);
    spectrum +=
      vec3(0.3, 0.72, 1.0) *
      uOverdrive *
      (0.16 + vBoil * 0.16);
    spectrum = mix(
      spectrum,
      vec3(0.56, 0.86, 1.0),
      uOverdrive *
        smoothstep(0.86, 1.0, heat + veins * 0.08) *
        0.22
    );
    spectrum = 1.0 - exp(-max(spectrum, vec3(0.0)) * 1.22);
    float alpha =
      clamp(
        0.54 +
        vBoil * 0.16 +
        rim * 0.1 +
        uAudioEnergy * 0.06,
        0.0,
        0.78
      );
    gl_FragColor = vec4(
      spectrum *
        (0.7 + uTurbulence * 0.16 + heat * 0.26) *
        mix(1.0, 0.82, uOverdrive),
      alpha
    );
  }
`

export const coronaVertexShader = /* glsl */ `
  uniform float uTime;
  uniform float uTurbulence;
  uniform float uAudioEnergy;
  uniform float uOverdrive;
  uniform float uCharge;

  varying vec3 vLocalPosition;
  varying vec3 vNormalDirection;
  varying vec3 vViewDirection;
  varying float vNoise;
  varying float vProminence;

  ${PLASMA_NOISE_GLSL}

  void main() {
    vec3 direction = normalize(position);
    float large = fbm3(
      direction * 2.0 +
      vec3(uTime * 0.18, -uTime * 0.25, uTime * 0.12)
    );
    float detail = fbm3(
      direction * 7.2 +
      vec3(-uTime * 0.16, uTime * 0.28, uTime * 0.2)
    );
    float prominence = smoothstep(0.56, 0.9, detail);
    float displacement =
      (large - 0.48) * 0.16 * (0.6 + uTurbulence) +
      prominence * 0.09 +
      uAudioEnergy * 0.035 +
      uOverdrive * (0.045 + uCharge * 0.035);
    vec3 transformed = position + normal * displacement;
    vec4 worldPosition =
      modelMatrix * vec4(transformed, 1.0);

    vLocalPosition = transformed;
    vNormalDirection = normalize(mat3(modelMatrix) * normal);
    vViewDirection = normalize(cameraPosition - worldPosition.xyz);
    vNoise = large;
    vProminence = prominence;

    gl_Position = projectionMatrix * viewMatrix * worldPosition;
  }
`

export const coronaFragmentShader = /* glsl */ `
  uniform vec3 uPrimary;
  uniform vec3 uSecondary;
  uniform float uTime;
  uniform float uAudioEnergy;
  uniform float uOverdrive;
  uniform float uCharge;

  varying vec3 vLocalPosition;
  varying vec3 vNormalDirection;
  varying vec3 vViewDirection;
  varying float vNoise;
  varying float vProminence;

  void main() {
    float facing = abs(
      dot(
        normalize(vNormalDirection),
        normalize(vViewDirection)
      )
    );
    float fresnel = pow(1.0 - facing, 2.65);
    float flame =
      0.5 +
      0.5 *
      sin(
        vLocalPosition.y * 21.0 +
        vNoise * 17.0 -
        uTime * 3.2
      );
    vec3 heat = mix(
      vec3(0.015, 0.18, 0.22),
      vec3(0.2, 0.92, 0.72),
      flame * 0.62 + fresnel * 0.22
    );
    heat = mix(heat, uSecondary, fresnel * 0.3);
    heat +=
      uPrimary *
      vProminence *
      (0.12 + uAudioEnergy * 0.18);
    vec3 overdriveHeat = mix(
      vec3(0.015, 0.32, 0.92),
      vec3(0.58, 0.94, 1.0),
      smoothstep(0.12, 0.9, flame)
    );
    heat = mix(
      heat,
      overdriveHeat,
      uOverdrive * (0.68 + uCharge * 0.2)
    );
    heat = 1.0 - exp(-max(heat, vec3(0.0)) * 1.18);
    float alpha =
      fresnel * (0.42 + vProminence * 0.2) +
      vProminence * 0.04 +
      uAudioEnergy * fresnel * 0.1;
    if (alpha < 0.004) discard;
    gl_FragColor = vec4(
      heat * (0.82 + fresnel * 1.18 + uAudioEnergy * 0.42),
      alpha
    );
  }
`

export const shieldVertexShader = /* glsl */ `
  uniform float uTime;
  uniform float uAudioEnergy;
  uniform float uRippleAge;
  uniform float uRippleStrength;
  uniform vec3 uRippleOrigin;
  uniform float uOverdrive;

  varying vec3 vLocalPosition;
  varying vec3 vNormalDirection;
  varying vec3 vViewDirection;

  void main() {
    vec3 direction = normalize(position);
    float rippleDistance = acos(
      clamp(
        dot(direction, normalize(uRippleOrigin + vec3(0.0001))),
        -1.0,
        1.0
      )
    );
    float rippleRadius = uRippleAge * 2.35;
    float rippleRing = exp(
      -pow((rippleDistance - rippleRadius) * 13.0, 2.0)
    ) * uRippleStrength;
    float breathe =
      sin(
        direction.y * 19.0 +
        direction.x * 13.0 +
        uTime * 1.4
      ) *
      0.0035 *
      (1.0 + uAudioEnergy);
    vec3 transformed =
      position +
      normal *
      (
        breathe +
        rippleRing * 0.038 +
        uOverdrive * 0.008
      );
    vec4 worldPosition =
      modelMatrix * vec4(transformed, 1.0);

    vLocalPosition = direction;
    vNormalDirection = normalize(mat3(modelMatrix) * normal);
    vViewDirection = normalize(cameraPosition - worldPosition.xyz);
    gl_Position = projectionMatrix * viewMatrix * worldPosition;
  }
`

export const shieldFragmentShader = /* glsl */ `
  uniform vec3 uPrimary;
  uniform vec3 uSecondary;
  uniform vec3 uTertiary;
  uniform float uTime;
  uniform float uAudioEnergy;
  uniform float uRippleAge;
  uniform float uRippleStrength;
  uniform vec3 uRippleOrigin;
  uniform float uOverdrive;
  uniform float uCharge;
  uniform float uShockProgress;

  varying vec3 vLocalPosition;
  varying vec3 vNormalDirection;
  varying vec3 vViewDirection;

  float hexDistance(vec2 point) {
    point = abs(point);
    return max(
      dot(point, normalize(vec2(1.0, 1.7320508))),
      point.x
    );
  }

  float hexEdge(vec2 point) {
    vec2 lattice = vec2(1.0, 1.7320508);
    vec2 halfCell = lattice * 0.5;
    vec2 a = mod(point, lattice) - halfCell;
    vec2 b = mod(point - halfCell, lattice) - halfCell;
    vec2 local = dot(a, a) < dot(b, b) ? a : b;
    float edge = hexDistance(local);
    float width = max(fwidth(edge) * 1.45, 0.018);
    return 1.0 - smoothstep(0.46 - width, 0.5, edge);
  }

  float triplanarHex(vec3 point, vec3 normal) {
    vec3 weights = pow(abs(normal), vec3(4.0));
    weights /= max(0.0001, weights.x + weights.y + weights.z);
    float x = hexEdge(point.yz * 8.4);
    float y = hexEdge(point.xz * 8.4);
    float z = hexEdge(point.xy * 8.4);
    return x * weights.x + y * weights.y + z * weights.z;
  }

  void main() {
    float facing = abs(
      dot(
        normalize(vNormalDirection),
        normalize(vViewDirection)
      )
    );
    float fresnel = pow(1.0 - facing, 3.1);
    float honeycomb = triplanarHex(
      vLocalPosition,
      normalize(vNormalDirection)
    );
    float scanPosition =
      mix(1.08, -1.08, fract(uTime * 0.115));
    float scanBand =
      exp(
        -pow(
          (vLocalPosition.y - scanPosition) * 18.0,
          2.0
        )
      );
    float rippleDistance = acos(
      clamp(
        dot(
          normalize(vLocalPosition),
          normalize(uRippleOrigin + vec3(0.0001))
        ),
        -1.0,
        1.0
      )
    );
    float rippleRadius = uRippleAge * 2.35;
    float rippleWave = exp(
      -pow((rippleDistance - rippleRadius) * 11.0, 2.0)
    ) * uRippleStrength;
    float rippleCore = exp(
      -pow((rippleDistance - rippleRadius) * 26.0, 2.0)
    ) * uRippleStrength;
    float shockBand =
      uShockProgress > 0.0 && uShockProgress < 1.0
        ? exp(
            -pow(
              (rippleDistance - uShockProgress * 3.0) * 8.0,
              2.0
            )
          ) *
          (1.0 - uShockProgress)
        : 0.0;
    float flicker =
      0.92 +
      0.08 *
      sin(
        vLocalPosition.x * 71.0 +
        vLocalPosition.z * 59.0 +
        uTime * 5.2
      );
    vec3 color = mix(
      uPrimary,
      uSecondary,
      honeycomb * 0.62 + fresnel * 0.38
    );
    color = mix(color, uTertiary, scanBand * 0.5);
    color +=
      vec3(0.72, 0.96, 1.0) *
      scanBand *
      (0.5 + uAudioEnergy * 0.65);
    color +=
      mix(
        uSecondary,
        vec3(0.52, 1.0, 0.82),
        honeycomb * 0.72
      ) *
      (rippleWave * (0.42 + honeycomb * 1.22) +
        rippleCore * (0.28 + honeycomb * 0.8));
    color +=
      mix(
        mix(uSecondary, uTertiary, uCharge * 0.4),
        vec3(0.58, 0.9, 1.0),
        honeycomb
      ) *
      shockBand *
      1.9;
    float alpha =
      (
        honeycomb * (0.0045 + scanBand * 0.46) +
        fresnel * 0.115 +
        scanBand * 0.024 +
        rippleWave * (0.07 + honeycomb * 0.3) +
        rippleCore * (0.1 + honeycomb * 0.18) +
        shockBand * (0.12 + honeycomb * 0.38) +
        uOverdrive * honeycomb * 0.07
      ) *
      flicker *
      (1.0 + uAudioEnergy * 0.24);
    if (alpha < 0.0025) discard;
    gl_FragColor = vec4(
      color * (0.75 + honeycomb * 1.4 + scanBand * 1.8),
      clamp(alpha, 0.0, 0.72)
    );
  }
`

export const shockwaveVertexShader = /* glsl */ `
  uniform float uTime;
  uniform float uProgress;

  varying vec3 vLocalPosition;
  varying vec3 vNormalDirection;
  varying vec3 vViewDirection;

  void main() {
    vec3 direction = normalize(position);
    float refraction =
      sin(
        direction.y * 28.0 +
        direction.x * 19.0 -
        uTime * 7.0
      ) *
      0.035 *
      (1.0 - uProgress);
    vec3 transformed = position + normal * refraction;
    vec4 worldPosition =
      modelMatrix * vec4(transformed, 1.0);

    vLocalPosition = direction;
    vNormalDirection = normalize(mat3(modelMatrix) * normal);
    vViewDirection = normalize(cameraPosition - worldPosition.xyz);
    gl_Position = projectionMatrix * viewMatrix * worldPosition;
  }
`

export const shockwaveFragmentShader = /* glsl */ `
  uniform vec3 uPrimary;
  uniform vec3 uSecondary;
  uniform vec3 uTertiary;
  uniform float uTime;
  uniform float uProgress;

  varying vec3 vLocalPosition;
  varying vec3 vNormalDirection;
  varying vec3 vViewDirection;

  void main() {
    float facing = abs(
      dot(
        normalize(vNormalDirection),
        normalize(vViewDirection)
      )
    );
    float rim = pow(1.0 - facing, 2.35);
    float bands =
      0.5 +
      0.5 *
      sin(
        vLocalPosition.y * 34.0 +
        vLocalPosition.x * 23.0 +
        uTime * 9.0
      );
    float prism = pow(
      abs(
        sin(
          vLocalPosition.z * 41.0 -
          vLocalPosition.y * 17.0 -
          uTime * 6.0
        )
      ),
      2.0
    );
    vec3 electricBlue = mix(
      vec3(0.015, 0.24, 0.9),
      vec3(0.46, 0.92, 1.0),
      bands
    );
    vec3 color =
      mix(uTertiary, electricBlue, 0.72 + rim * 0.2) *
      (0.72 + rim * 2.05) +
      mix(uPrimary, vec3(0.66, 0.96, 1.0), prism) *
      prism *
      0.28;
    float alpha =
      (
        rim * (0.42 + bands * 0.16) +
        prism * 0.026
      ) *
      (1.0 - uProgress * 0.52);
    if (alpha < 0.004) discard;
    gl_FragColor = vec4(
      color * (0.7 + (1.0 - uProgress) * 0.42),
      alpha
    );
  }
`
