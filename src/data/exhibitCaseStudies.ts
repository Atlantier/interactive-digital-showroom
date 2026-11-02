import type { GalleryExhibitId } from '../store/gallery/catalog'

export interface CaseStudyMetric {
  value: string
  label: string
}

export interface CaseStudyLink {
  label: string
  url: string
}

export interface CaseStudyCopy {
  objective: string
  system: string
  challenge: string
  outcome: string
  stack: readonly string[]
  metrics: readonly CaseStudyMetric[]
  role?: string
  links?: readonly CaseStudyLink[]
}

export interface LocalizedCaseStudy {
  en: CaseStudyCopy
  zh: CaseStudyCopy
}

export const EXHIBIT_CASE_STUDIES = {
  'prism-caustics': {
    en: {
      objective:
        'Make wavelength-dependent refraction, total internal reflection, and receiver caustics legible in one manipulable optical stage.',
      system:
        'A draggable emitter feeds a shader-driven seven-band spectral model. Crystal geometry, incident angle, dispersion, and beam power update volumetric beams and a Voronoi caustic screen in real time.',
      challenge:
        'Keep seven independently attenuated beams, critical-angle transitions, and caustic projection coherent while the source and crystal are manipulated continuously.',
      outcome:
        'The exhibit exposes three crystal cuts, seven calibrated wavelengths, live RGB caustics, and a direct transition from refraction into total internal reflection.',
      stack: [
        'React + Three.js',
        'Custom GLSL',
        'Voronoi caustics',
        'Pointer ray interaction',
      ],
      metrics: [
        { value: '7', label: 'spectral bands' },
        { value: '3', label: 'crystal cuts' },
        { value: '4', label: 'live parameters' },
      ],
    },
    zh: {
      objective:
        '在同一座可操作光学舞台中，让波长相关折射、全内反射与接收屏焦散同时变得可见、可调、可解释。',
      system:
        '可拖拽发射器驱动七波段光谱模型，晶体几何、入射角、色散系数与光束功率实时更新体积光束、接收屏和 Voronoi 焦散图层。',
      challenge:
        '在用户持续拖动光源与切换晶体形态时，保持七条独立衰减光束、临界角切换和焦散投影之间的空间与能量一致性。',
      outcome:
        '展台提供三种晶体切面、七条标定波长、实时 RGB 焦散，并可在折射与全内反射路径之间连续切换。',
      stack: [
        'React + Three.js',
        '自定义 GLSL',
        'Voronoi 焦散',
        '指针射线交互',
      ],
      metrics: [
        { value: '7', label: '光谱波段' },
        { value: '3', label: '晶体切面' },
        { value: '4', label: '实时参数' },
      ],
    },
  },
  'laser-scan-hologram': {
    en: {
      objective:
        'Turn the construction and failure of a holographic scan into a readable four-stage visual sequence instead of a single looping effect.',
      system:
        'A quad-axis gantry coordinates scan height, beam width, coherence, and reveal shader state across gyro, skull, and turbine meshes. Clicking introduces a controlled glitch burst.',
      challenge:
        'Synchronize the moving laser plane, mesh reveal threshold, Fresnel edge treatment, and spark field without letting the hologram appear fully formed ahead of the scan.',
      outcome:
        'Three targets share a four-state material pipeline, live scan telemetry, and click-triggered fault reconstruction while retaining one continuous holographic volume.',
      stack: [
        'React Three Fiber',
        'Reveal shader',
        'Point-cloud transitions',
        'Glitch post-effect',
      ],
      metrics: [
        { value: '4', label: 'scan states' },
        { value: '3', label: 'hologram meshes' },
        { value: '4', label: 'gantry axes' },
      ],
    },
    zh: {
      objective:
        '把全息扫描的成型过程与故障过程拆成可读的四阶段视觉序列，而不是单一循环特效。',
      system:
        '四轴龙门架统一驱动扫描高度、光束宽度、相干度和揭幕着色器状态，覆盖陀螺核心、机械头骨与涡轮转子三套网格；点击时注入可控故障脉冲。',
      challenge:
        '同步移动激光平面、网格显现阈值、菲涅尔边缘与火花层，避免全息实体在扫描面抵达前提前完整出现。',
      outcome:
        '三套目标共享四态材质管线、实时扫描遥测与点击故障重构，并始终维持一个连续的全息体积。',
      stack: [
        'React Three Fiber',
        '揭幕着色器',
        '点云过渡',
        '故障后期效果',
      ],
      metrics: [
        { value: '4', label: '扫描状态' },
        { value: '3', label: '全息网格' },
        { value: '4', label: '龙门轴数' },
      ],
    },
  },
  'particle-morph': {
    en: {
      objective:
        'Use particle continuity to compare five mathematical manifolds as one evolving material rather than five disconnected scenes.',
      system:
        'Twenty thousand GPU particles interpolate between precomputed manifolds with curl-noise displacement, gravity charge, and a supernova wave controlled from the live parameter panel.',
      challenge:
        'Maintain stable density and motion continuity across radically different topologies while keeping the particle field responsive on constrained devices.',
      outcome:
        'The sandbox carries 20,000 particles through five targets, continuous morph timing, pointer gravity, and a supernova shock interaction without rebuilding geometry between states.',
      stack: [
        'GPU particle shader',
        'Curl noise',
        'Attribute morphing',
        'Pointer force field',
      ],
      metrics: [
        { value: '20K', label: 'particles' },
        { value: '5', label: 'manifolds' },
        { value: '1', label: 'continuous field' },
      ],
    },
    zh: {
      objective:
        '通过粒子连续性把五组数学流形呈现为同一种可演化材质，而不是五个互不相干的场景。',
      system:
        '两万颗 GPU 粒子在预计算流形之间插值，并叠加旋度噪声位移、引力电荷与超新星冲击波，全部由实时参数面板驱动。',
      challenge:
        '在拓扑结构剧烈变化时维持粒子密度和运动连续性，同时确保粒子场在性能受限设备上仍能快速响应。',
      outcome:
        '沙盒可让两万颗粒子连续穿越五套目标流形，并提供指针引力与超新星冲击反馈，无需在状态之间重建几何体。',
      stack: [
        'GPU 粒子着色器',
        '旋度噪声',
        '属性插值形变',
        '指针力场',
      ],
      metrics: [
        { value: '20K', label: '粒子数量' },
        { value: '5', label: '数学流形' },
        { value: '1', label: '连续粒子场' },
      ],
    },
  },
  'plasma-reactor': {
    en: {
      objective:
        'Build a dramatic fusion-confinement instrument that connects plasma temperature, magnetic gimbals, shield response, and a controlled overload sequence.',
      system:
        'Layered core and corona shaders sit inside three orthogonal rings. A hexagonal shield receives raycast ripple origins, while a GPU arc buffer and overdrive state machine drive charge, flash, shockwave, and cooldown phases.',
      challenge:
        'Coordinate multiple independent shader layers, procedural lightning updates, pointer-hit feedback, and the 1.5-second overdrive timing without breaking the physical cause-and-effect narrative.',
      outcome:
        'The reactor supports shield ripples, up to 12 live arcs, three rotating gimbals, a blue-white temperature metamorphosis, and a 1.45-second spherical plasma shockwave.',
      stack: [
        'Custom plasma GLSL',
        'Instanced lightning',
        'Shader shield',
        'Overdrive sequencer',
      ],
      metrics: [
        { value: '3', label: 'gimbal rings' },
        { value: '12', label: 'live arcs' },
        { value: '1.5s', label: 'charge window' },
      ],
    },
    zh: {
      objective:
        '构建一台具有戏剧张力的聚变约束仪器，把等离子温度、磁约束万向环、护盾反馈和可控过载演出连接为一个完整系统。',
      system:
        '分层核心与日冕着色器位于三轴正交磁环内部；六边形护盾接收射线命中点产生的涟漪，GPU 电弧缓冲与过载状态机依次驱动蓄力、闪爆、冲击波和冷却阶段。',
      challenge:
        '协调多个独立着色器层、程序化电弧刷新、指针命中反馈与 1.5 秒过载时序，同时保持清晰的物理因果叙事。',
      outcome:
        '反应堆支持护盾受击涟漪、最多 12 道实时电弧、三轴旋转磁环、蓝白超新星色温蜕变，以及持续 1.45 秒的球面等离子冲击波。',
      stack: [
        '自定义等离子 GLSL',
        '实例化电弧',
        '着色器护盾',
        '过载时序状态机',
      ],
      metrics: [
        { value: '3', label: '磁约束环' },
        { value: '12', label: '实时电弧' },
        { value: '1.5s', label: '蓄力窗口' },
      ],
    },
  },
  'photonic-mesh': {
    en: {
      objective:
        'Create a hands-on optical bench where moving and rotating real components immediately rebuilds the complete recursive beam tree.',
      system:
        'A CPU ray solver intersects mirrors, a 50/50 splitter, a dispersive prism, and three receptors to ten recursion levels. Every segment receives its own energy, color, volumetric mesh, photon flow, and hit flare.',
      challenge:
        'Contain recursive branch growth while preserving exact hit points, split ratios, dispersion, drag-to-rotate behavior, and target energy feedback at interactive rates.',
      outcome:
        'The exhibit combines five active optical elements, three receptor locks, three curated layouts, volumetric beam tubes, and live target-power telemetry in one draggable scene.',
      stack: [
        'Recursive CPU solver',
        'Instanced volumetric beams',
        'Ray intersection',
        'Drag and rotation controls',
      ],
      metrics: [
        { value: '10', label: 'recursion levels' },
        { value: '3', label: 'optical layouts' },
        { value: '3', label: 'photon targets' },
      ],
    },
    zh: {
      objective:
        '搭建一座可亲手摆弄的光学实验台，让移动和旋转真实元件时，完整递归光路树立即重建。',
      system:
        'CPU 光线求解器对平面镜、50/50 分束立方、色散棱镜与三座接收靶执行十层递归求交。每一段子光束都拥有独立能量、颜色、体积网格、光子流与命中星芒。',
      challenge:
        '控制递归分支增长，同时在交互帧率内保留精确交点、分束比例、色散、拖拽旋转以及接收靶能量反馈。',
      outcome:
        '展台集成五个可交互光学元件、三座接收靶锁定、三套精算布局、体积光束和实时光功率遥测。',
      stack: [
        'CPU 递归求解器',
        '实例化体积光束',
        '射线求交',
        '拖拽与旋转控制',
      ],
      metrics: [
        { value: '10', label: '递归层数' },
        { value: '3', label: '光学布局' },
        { value: '3', label: '光电接收靶' },
      ],
    },
  },
  'orbital-lens': {
    en: {
      objective:
        'Convert live audio analysis into three distinct spatial instruments that can be played directly rather than only observed.',
      system:
        'A procedural pentatonic arpeggiator and pad chord engine feed an AnalyserNode with a 512-sample FFT. The same frequency and waveform buffers drive a 256-pillar matrix, circular sunburst, waterfall terrain, and eight radial pad pulses.',
      challenge:
        'Keep synthesis, analyser data, instanced geometry, peak-hold motion, camera-safe silhouettes, and three topology transitions coherent while remaining usable when audio is muted.',
      outcome:
        'The stage delivers 256 photonic pillars, a 192-band circular sunburst, a 64 × 24 waterfall terrain, four rhythmic spotlights, and eight playable light pads with a deterministic simulation fallback.',
      stack: [
        'Web Audio API',
        'InstancedMesh',
        'FFT analysis',
        'Procedural sequencer',
      ],
      metrics: [
        { value: '256', label: 'light pillars' },
        { value: '3', label: 'stage topologies' },
        { value: '8', label: 'light pads' },
      ],
    },
    zh: {
      objective:
        '把实时音频分析转换成三套真正可演奏、可切换的空间乐器，而不只是被动观看的频谱动画。',
      system:
        '程序化五声音阶琶音器与光琴键和弦引擎驱动 512 点 FFT 的 AnalyserNode。同一组频域和时域数据同时控制 256 柱矩阵、环形日冕、瀑布地形与八组径向冲击波。',
      challenge:
        '统一合成器、分析数据、实例化几何、峰值保持运动、镜头安全轮廓和三种拓扑过渡，并在静音或音频不可用时仍保持完整可玩性。',
      outcome:
        '舞台提供 256 根光子柱、192 段环形频谱、64 × 24 瀑布地形、四束节拍追光和八枚可演奏光琴键，并以确定性模拟频谱作为降级路径。',
      stack: [
        'Web Audio API',
        'InstancedMesh',
        'FFT 频谱分析',
        '程序化音序器',
      ],
      metrics: [
        { value: '256', label: '频谱光柱' },
        { value: '3', label: '舞台拓扑' },
        { value: '8', label: '交互光琴键' },
      ],
    },
  },
  'quantum-lattice': {
    en: {
      objective:
        'Make Transformer inference, attention routing, backpropagation, and neuron-level behavior inspectable inside one spatial network.',
      system:
        'Five layers total 52 nodes linked by 224 cubic Bezier synapses. Six hundred instanced photons route across stage-aware paths, activating downstream nodes as they arrive; optional gradient fibers reverse the flow with weight-like thickness and color.',
      challenge:
        'Route hundreds of asynchronous packets through a shared graph, keep every arrival visually attributable, and preserve node isolation and token selection without duplicating network geometry.',
      outcome:
        'The sandbox provides forward and backward modes, 32 attention beams, 600 traveling photons, output probability towers, and GeLU/Swish isolation inspection with unrelated synapses dimmed to ten percent.',
      stack: [
        'Graph routing',
        'Cubic Bezier geometry',
        'Instanced photons',
        'Attention visualization',
      ],
      metrics: [
        { value: '52', label: 'network nodes' },
        { value: '224', label: 'synapses' },
        { value: '600', label: 'photon packets' },
      ],
    },
    zh: {
      objective:
        '在同一座立体网络中，让 Transformer 正向推理、注意力路由、反向传播与单神经元行为都能被观察和操作。',
      system:
        '五层网络共 52 个节点，由 224 条三次贝塞尔突触连接。600 颗实例化光子沿带阶段语义的路径换乘，抵达节点时触发下游传播；反向模式用赤金与紫色渐变光纤逆流模拟权重更新。',
      challenge:
        '让数百个异步光子包在共享图中正确换乘，每次抵达都能视觉归因，并在不复制网络几何的情况下保留节点隔离与 Token 选择。',
      outcome:
        '沙盘提供双向演示、32 条注意力光束、600 颗运动光子、输出概率能量塔，以及把无关连接压暗至 10% 的 GeLU/Swish 神经元检视。',
      stack: [
        '图结构路由',
        '三次贝塞尔几何',
        '实例化光子',
        '注意力可视化',
      ],
      metrics: [
        { value: '52', label: '网络节点' },
        { value: '224', label: '突触连接' },
        { value: '600', label: '光子数据包' },
      ],
    },
  },
  'phase-torus': {
    en: {
      objective:
        'Visualize both sides of a GPU pipeline: dense tensor computation and the spatial hierarchy used by real-time ray traversal.',
      system:
        'An 8 × 8 × 8 tensor cube performs a scan-plane GEMM metaphor with 512 voxels and 128 accumulator photons. RT mode instead sweeps a probe ray through a 15-node BVH, while HBM buses, workload heat, and CUDA warp expansion share the same silicon stage.',
      challenge:
        'Map live workload to scan speed, thermal color, memory telemetry, and per-voxel activation while keeping two compute modes and click-driven warp inspection legible.',
      outcome:
        'The matrix exposes 512 tensor voxels, 360 HBM/NVLink particles, 128 accumulator photons, 15 BVH nodes, and a synchronized 32-thread warp visualization across a 10–100 percent workload range.',
      stack: [
        'Tensor shader',
        'BVH traversal',
        'Instanced compute grid',
        'Thermal telemetry',
      ],
      metrics: [
        { value: '512', label: 'tensor voxels' },
        { value: '15', label: 'BVH nodes' },
        { value: '32', label: 'CUDA threads' },
      ],
    },
    zh: {
      objective:
        '同时呈现 GPU 管线的两种核心能力：高密度张量计算，以及实时光线遍历所依赖的空间层次结构。',
      system:
        '8 × 8 × 8 张量魔方以 512 个体素和 128 颗累加光子演绎扫描平面 GEMM；RT 模式则让探测激光遍历 15 节点 BVH。HBM 总线、算力热场与 CUDA Warp 共享同一块硅片舞台。',
      challenge:
        '把实时算力负载映射到扫描速度、热力颜色、显存遥测和逐体素激活，同时保持两种计算模式与点击式 Warp 检视清晰可读。',
      outcome:
        '矩阵提供 512 个张量体素、360 颗 HBM/NVLink 粒子、128 颗累加光子、15 个 BVH 节点，以及覆盖 10%–100% 负载的同步 32 线程 Warp 演示。',
      stack: [
        '张量着色器',
        'BVH 遍历',
        '实例化计算网格',
        '热力遥测',
      ],
      metrics: [
        { value: '512', label: '张量体素' },
        { value: '15', label: 'BVH 节点' },
        { value: '32', label: 'CUDA 线程' },
      ],
    },
  },
} as const satisfies Record<GalleryExhibitId, LocalizedCaseStudy>
