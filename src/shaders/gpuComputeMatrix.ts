// Shared GLSL programs for the GPU Compute Matrix exhibit.
export const TENSOR_POINT_VERTEX_SHADER = `
  uniform float uDpr;
  uniform float uTime;
  uniform float uWorkload;
  attribute float aActivation;
  attribute float aSeed;
  varying vec3 vColor;

  void main() {
    vec3 matrixBlue = vec3(0.08, 0.48, 1.0);
    vec3 matrixEmerald = vec3(0.08, 1.0, 0.46);
    vec3 supernovaWhite = vec3(1.0);
    vec3 accumulatorGold = vec3(1.0, 0.72, 0.2);
    vec3 thermalAmber = vec3(1.0, 0.34, 0.045);
    float xMix = clamp(position.x / 1.36 + 0.5, 0.0, 1.0);
    vec3 baseColor = mix(matrixBlue, matrixEmerald, xMix);
    vec3 flashColor = mix(
      accumulatorGold,
      supernovaWhite,
      aActivation * 0.62
    );
    vColor = mix(baseColor, flashColor, aActivation * 0.92);

    vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
    float shimmer = 0.5 + 0.5 * sin(
      uTime * 3.4 + aSeed * 31.4159
    );
    float thermalMix = smoothstep(0.36, 1.0, uWorkload) *
      (0.1 + shimmer * 0.1 + aActivation * 0.22);
    vColor = mix(vColor, thermalAmber, thermalMix);
    float pointSize =
      0.072 +
      aActivation * 0.145 +
      shimmer * 0.012;
    gl_PointSize =
      pointSize *
      (0.82 + uWorkload * 0.24) *
      (340.0 / max(0.1, -viewPosition.z)) *
      uDpr;
    gl_Position = projectionMatrix * viewPosition;
  }
`
export const TENSOR_POINT_FRAGMENT_SHADER = `
  uniform float uOpacity;
  varying vec3 vColor;

  void main() {
    vec2 centered = gl_PointCoord - vec2(0.5);
    float radius = length(centered) * 2.0;
    if (radius > 1.0) discard;
    float halo = 1.0 - smoothstep(0.08, 1.0, radius);
    float core = 1.0 - smoothstep(0.0, 0.34, radius);
    vec3 color = vColor * (0.72 + halo * 0.8) + core * 0.72;
    gl_FragColor = vec4(
      color,
      (halo * 0.82 + core * 0.18) * uOpacity
    );
  }
`
export const GPU_HEAT_VERTEX_SHADER = `
  varying vec2 vHeatUv;
  varying vec3 vHeatPosition;

  void main() {
    vHeatUv = uv;
    vHeatPosition = position;
    gl_Position =
      projectionMatrix *
      modelViewMatrix *
      vec4(position, 1.0);
  }
`
export const GPU_HEAT_FRAGMENT_SHADER = `
  uniform float uTime;
  uniform float uWorkload;
  uniform float uSurface;
  varying vec2 vHeatUv;
  varying vec3 vHeatPosition;

  float hash(vec2 point) {
    return fract(
      sin(dot(point, vec2(127.1, 311.7))) *
      43758.5453123
    );
  }

  float valueNoise(vec2 point) {
    vec2 cell = floor(point);
    vec2 local = fract(point);
    vec2 curve = local * local * (3.0 - 2.0 * local);
    return mix(
      mix(
        hash(cell),
        hash(cell + vec2(1.0, 0.0)),
        curve.x
      ),
      mix(
        hash(cell + vec2(0.0, 1.0)),
        hash(cell + vec2(1.0, 1.0)),
        curve.x
      ),
      curve.y
    );
  }

  void main() {
    float flow = valueNoise(
      vHeatUv * vec2(18.0, 13.0) +
      vec2(uTime * 0.17, -uTime * 0.11)
    );
    float detail = valueNoise(
      vHeatUv * vec2(48.0, 34.0) -
      vec2(uTime * 0.28, uTime * 0.19)
    );
    float gridX = pow(
      0.5 + 0.5 * sin(
        (vHeatUv.x * 34.0 + vHeatUv.y * 5.0 - uTime * 1.6) *
        6.28318
      ),
      18.0
    );
    float gridY = pow(
      0.5 + 0.5 * sin(
        (vHeatUv.y * 28.0 - vHeatUv.x * 3.0 + uTime * 1.2) *
        6.28318
      ),
      20.0
    );
    float scan = pow(
      0.5 +
      0.5 *
        sin(
          (vHeatUv.x - uTime * 0.42) * 18.0 *
          6.28318
        ),
      24.0
    );
    vec2 center = vHeatUv - vec2(0.5);
    float radial = 1.0 - smoothstep(0.08, 0.62, length(center));
    float verticalHeat = uSurface > 0.5
      ? smoothstep(-0.72, 0.72, vHeatPosition.y) * 0.22
      : 0.0;
    float density = clamp(
      radial * (0.32 + flow * 0.72) +
      detail * 0.28 +
      (gridX + gridY) * 0.17 +
      scan * 0.22 +
      verticalHeat,
      0.0,
      1.0
    );
    float loadMask = smoothstep(0.08, 1.0, uWorkload);
    float hotMix = smoothstep(
      0.16,
      0.96,
      density * (0.34 + loadMask * 0.92)
    );
    vec3 cold = vec3(0.025, 0.64, 1.0);
    vec3 ember = vec3(1.0, 0.22, 0.035);
    vec3 amber = vec3(1.0, 0.74, 0.18);
    vec3 color = mix(cold, ember, hotMix);
    color = mix(color, amber, smoothstep(0.72, 1.0, hotMix));
    float surfaceScale = uSurface > 0.5 ? 0.66 : 1.0;
    float alpha =
      (0.008 + density * 0.115 + scan * 0.035) *
      (0.2 + loadMask * 0.68) *
      surfaceScale;
    gl_FragColor = vec4(color, alpha);
  }
`
