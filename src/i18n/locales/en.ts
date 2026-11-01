export const en = {
  meta: {
    title: 'NODE/01 | Personal Digital Showroom',
    description:
      'NODE/01 is a personal digital showroom for realtime graphics, interaction design, and emerging media experiments.',
  },
  language: {
    switcherLabel: 'Interface language',
    english: 'EN',
    chinese: '中文',
    switchToEnglish: 'Switch interface to English',
    switchToChinese: 'Switch interface to Chinese',
  },
  common: {
    brand: 'NODE/01',
    keyboard: {
      command: 'K',
      escape: 'ESC',
    },
    units: {
      fps: 'FPS',
      nanometers: 'nm',
    },
    symbols: {
      deltaTime: 'Δt',
      multiplier: 'x',
    },
  },
  nav: {
    brandSubtitle: 'Personal Digital Showroom',
    brandHome: 'NODE/01, back to home',
    primaryNavigation: 'Showroom primary navigation',
    mobileNavigation: 'Mobile showroom navigation',
    openMenu: 'Open navigation menu',
    closeMenu: 'Close navigation menu',
    sections: {
      home: 'Origin',
      works: 'Works',
      gallery: 'Optics',
      architecture: 'Architecture',
      sandbox: 'Sandbox',
      kinetics: 'Kinetics',
      archive: 'Archive',
      contact: 'Contact',
    },
    sound: {
      enable: 'Enable interface audio',
      disable: 'Mute interface audio',
    },
    fps: {
      show: 'Show live frame rate',
      hide: 'Hide live frame rate',
      enable: 'Enable live FPS monitor',
      disable: 'Disable live FPS monitor',
      liveTelemetry: 'Live frame rate telemetry',
      unit: 'fps',
    },
    command: {
      open: 'Open command palette',
      openWithShortcut: 'Open command palette (Ctrl/Cmd + K)',
      close: 'Close command palette',
    },
    telemetry: {
      open: 'Open performance telemetry panel',
      close: 'Close performance telemetry panel',
    },
    overdrive: {
      label: 'VISUAL OVERDRIVE',
      title: 'Visual Overdrive',
      switchPreset: 'Switch visual overdrive preset: {preset}',
      presetTitle: 'Visual overdrive: {preset}',
    },
  },
  hero: {
    systemOnline: 'System online',
    showroom: 'Personal digital showroom',
    observing: 'Live observation',
    titleLineOne: 'Make the work',
    titleLineTwo: 'emerge from deep space.',
    description:
      'A living personal showroom for interaction experiments, visual systems, and realtime graphics.',
    primaryCta: 'Enter the work orbit',
    secondaryCta: 'Inspect capability archive',
    objectLabel: 'Observed object',
    objectValue: 'Memory Core / 01',
    pipelineLabel: 'Render pipeline',
    pipelineValue: 'WebGL / R3F',
    scrollCue: 'Explore below',
  },
  works: {
    eyebrow: 'Project preview',
    titleLineOne: 'The work is',
    titleLineTwo: 'a kind of interface.',
    description:
      'A record of research and experiments in motion. Each project probes the edge of its medium and opens the next layer of the showroom.',
  },
  capabilities: {
    eyebrow: 'Capability archive',
    titleLineOne: 'From interface to space,',
    titleLineTwo: 'keep the signal clear.',
    description:
      'Engineering carries imagination into production. Design gives every movement a reason. Both operate inside one system.',
    expanding: 'Continuously expanding',
    items: [
      {
        index: '01',
        title: 'Visual Engineering',
        description:
          'WebGL, shaders, realtime compositing, and disciplined performance budgets.',
      },
      {
        index: '02',
        title: 'Interaction Design',
        description:
          'Spatial feedback, motion systems, and legible paths through complex tools.',
      },
      {
        index: '03',
        title: 'Frontend Architecture',
        description:
          'React, TypeScript, and durable component boundaries built to evolve.',
      },
    ],
  },
  contact: {
    eyebrow: 'Connection channel',
    titleLineOne: 'The next possibility',
    titleLineTwo: 'starts here.',
    description:
      'If you are building a new digital experience, spatial narrative, or realtime visual system, send a signal.',
  },
  footer: {
    showroomName: 'NODE/01 Personal Digital Showroom',
    framework: 'Vite + React 19',
    renderer: 'WebGL / R3F',
    year: '2026',
  },
  accentThemes: {
    emerald: {
      label: 'Emerald Signal',
      subtitle: 'EMERALD SIGNAL',
      description:
        'Calm, exact, and tuned for long observation and sustained interaction.',
    },
    violet: {
      label: 'Cyber Violet',
      subtitle: 'CYBER VIOLET',
      description:
        'Higher-energy optics for nocturnal interfaces and spatial computing.',
    },
    titanium: {
      label: 'Titanium Amber',
      subtitle: 'TITANIUM AMBER',
      description:
        'A warm industrial finish with the precision of laboratory hardware.',
    },
  },
  gravityModes: {
    zero: {
      label: 'Zero Gravity',
      subtitle: 'ZERO G',
      description:
        'Disable vertical gravity and let the badges drift freely through the wind field.',
    },
    moon: {
      label: 'Lunar Gravity',
      subtitle: 'LUNAR G',
      description:
        'One-sixth Earth gravity, tuned for slow pendulum motion and close observation.',
    },
    hyper: {
      label: 'Hypergravity',
      subtitle: 'HYPER G',
      description:
        'Roughly 2.2 times default gravity for sharper tension and collision response.',
    },
  },
  vfxPresets: {
    'emerald-cyber': {
      label: 'Emerald Cyber',
      subtitle: 'EMERALD CYBER',
      description: 'Emerald, ion cyan, and cold white highlights',
    },
    'supernova-gold': {
      label: 'Supernova Gold',
      subtitle: 'SUPERNOVA GOLD',
      description: 'Molten gold, amber, and supernova warm white',
    },
    'quantum-violet': {
      label: 'Quantum Violet',
      subtitle: 'QUANTUM VIOLET',
      description: 'Quantum violet, electric cyan, and phantom pink',
    },
  },
  bento: {
    tokenThroughput: {
      title: 'Realtime Inference Pipeline',
      detail: 'Model Infrastructure / 2026',
      tokensPerSecond: 'tokens / second',
      chartAria: 'Live token throughput chart',
      timelinePast: '−28s',
      timelineMid: '−14s',
      timelineNow: 'now',
      metrics: [
        { label: 'Context', value: '68%' },
        { label: 'Decode', value: '21ms' },
        { label: 'Queue', value: '04' },
      ],
    },
    topology: {
      title: 'Context Topology',
      detail: 'Composable Architecture',
      chartAria: '{mode} topology diagram, {detail}',
      modes: {
        edge: {
          label: 'Edge',
          detail: '6 edge nodes',
        },
        vector: {
          label: 'Vector',
          detail: '16 indexed channels',
        },
        agent: {
          label: 'Agent',
          detail: '4 autonomous loops',
        },
      },
    },
    terminal: {
      title: 'Local Agent',
      detail: 'Live Terminal / zsh',
      fileName: 'agent.ts',
      commandPlaceholder: 'help / skills / matrix / clear',
      replay: 'Replay terminal simulation',
      pause: 'Pause terminal simulation',
      resume: 'Resume terminal simulation',
      outputAria: 'Terminal command output',
      inputAria: 'Enter a terminal command',
      unknownCommand:
        'command not found. Type help to list available commands.',
      bootLines: [
        '$ node agent.runtime',
        '> mounting context mesh...',
        '> linked 128 tools / 4 regions',
        '> inference ready in 84ms',
        '✓ listening on :5174',
      ],
      responses: {
        help: {
          description: 'Available command index',
          notes: ['help', 'skills', 'matrix', 'clear'],
        },
        skills: {
          description: 'Core capability probe',
          notes: [
            'WebGL',
            'React / TS',
            'Interaction systems',
            'Generative visuals',
          ],
        },
        matrix: {
          description: 'Reality protocol temporarily offline',
          notes: ['reality.exe is optional', 'follow the white rabbit'],
        },
        clear: {
          description: 'Terminal buffer reset',
          notes: ['session clear', 'ready for new input'],
        },
      },
    },
    telemetry: {
      title: 'Signal Matrix',
      detail: 'Live Telemetry',
      metrics: [
        { label: 'Latency', value: '18 ms' },
        { label: 'Requests', value: '2.4k' },
        { label: 'Availability', value: '99.99%' },
      ],
    },
    archive: {
      title: 'Spatial Archive',
      detail: 'Continuous Archive',
      tags: ['WebGL', 'Agents', 'Audio', 'Systems'],
    },
  },
  architecture: {
    srTitle: 'Three-layer AI and distributed computing infrastructure',
    headerTitle: 'Three-layer core architecture',
    headerDescription:
      'Infrastructure, intelligent orchestration, and spatial interfaces operate as one runtime.',
    expanding: 'Architecture expanding',
    phaseOne: {
      titleLineOne: 'Three layers lock together',
      titleLineTwo: 'into one core.',
      description:
        'Infrastructure carries compute. Orchestration organizes agents. The spatial layer gives both a shared perception.',
    },
    phaseTwo: {
      titleLineOne: 'Tension moves outward',
      titleLineTwo: 'intelligence converges inward.',
      description:
        'The layers separate along the vertical axis, revealing the live links between CUDA fabric, agent routing, and spatial UI.',
    },
    phaseThree: {
      titleLineOne: 'Converge again',
      titleLineTwo: 'and the system begins to think.',
      description:
        'Compute, orchestration, and experience resolve into one perceptive, extensible architecture designed to evolve.',
    },
    legend: {
      spatial: 'Spatial Interface',
      orchestration: 'Agent Orchestration',
      infrastructure: 'Infrastructure & Kernels',
    },
    coreLabel: 'Distributed Core / 01',
    layerLabel: 'Layer {index}',
    closeDetails: 'Close technology stack details',
    fallback: 'This browser cannot initialize the architecture scene.',
    metrics: {
      latency: {
        label: 'Layer Latency',
        value: '8.4 ms',
        note: 'p99 fabric latency',
      },
      agents: {
        label: 'Concurrent Agents',
        value: '128',
        note: 'active orchestration',
      },
      throughput: {
        label: 'Cross-layer Throughput',
        value: '2.7 TB/s',
        note: 'shared memory fabric',
      },
    },
    layers: {
      infrastructure: {
        eyebrow: 'Foundation Layer',
        title: 'CUDA Kernel Layer',
        subtitle: 'Infrastructure & CUDA Kernel',
        description:
          'Parallel compute, memory topology, and high-speed interconnect form a predictable foundation for every intelligent workload above it.',
        stack: ['CUDA', 'Triton', 'NCCL', 'RDMA', 'Distributed Storage'],
        metrics: [
          { label: 'GPU Utilization', value: '92.4%' },
          { label: 'Memory Bandwidth', value: '3.2 TB/s' },
        ],
      },
      orchestration: {
        eyebrow: 'Orchestration Layer',
        title: 'Multi-Agent Orchestration',
        subtitle: 'Multi-Agent Orchestration',
        description:
          'Context routing, tool invocation, and state synchronization stay in low-latency lockstep while every agent shares one observable runtime.',
        stack: ['LangGraph', 'MCP', 'Ray', 'Vector DB', 'Event Streams'],
        metrics: [
          { label: 'Active Agents', value: '128' },
          { label: 'Orchestration Latency', value: '8.4 ms' },
        ],
      },
      spatial: {
        eyebrow: 'Experience Layer',
        title: 'Spatial Web & Interface',
        subtitle: 'Spatial Web & UI',
        description:
          'Realtime compute and machine decisions become a perceptible spatial interface, sustaining visual fidelity and low-latency interaction in the browser.',
        stack: ['WebGPU', 'R3F', 'Shader Graph', 'WebXR', 'Edge Render'],
        metrics: [
          { label: 'Interaction Frame Rate', value: '120 fps' },
          { label: 'First-frame Response', value: '16 ms' },
        ],
      },
    },
  },
  sandbox: {
    verlet: {
      eyebrow: 'Interactive Physics Sandbox / 04',
      titleLineOne: 'Give identity',
      titleLineTwo: 'to the constraint solver.',
      description:
        'Four badges share one Verlet rope network, angular momentum model, and OBB collision field. Every pull accumulates real tension until the structure fails.',
      techTags: [
        '12 SOLVER PASSES',
        'FRAME-LOCKED PHYSICS',
        'OBB CONTACT',
      ],
      status: {
        nominal: 'SYSTEM NOMINAL',
        tensionApplied: 'TENSION APPLIED',
        tensionOverload: 'TENSION OVERLOAD',
        ruptureDetected: 'RUPTURE DETECTED',
      },
      reforge: {
        aria: 'Re-forge lanyards and restore the system',
        title: 'Re-forge Lanyards',
        long: 'Re-forge Lanyards',
        short: 'Re-forge',
      },
      badges: {
        'ai-architecture': {
          eyebrow: 'SYSTEMS / 01',
          title: 'AI Architecture',
          subtitle: 'Inference topology',
        },
        'rust-systems': {
          eyebrow: 'SYSTEMS / 02',
          title: 'Rust & Systems',
          subtitle: 'Zero-cost runtime',
        },
        'webgl-shaders': {
          eyebrow: 'SYSTEMS / 03',
          title: 'WebGL Shaders',
          subtitle: 'Realtime graphics',
        },
        'distributed-cloud': {
          eyebrow: 'SYSTEMS / 04',
          title: 'Distributed Cloud',
          subtitle: 'Elastic fabric',
        },
      },
      dragBadge: 'Drag the {badge} badge',
      telemetry: {
        strain: 'STRAIN',
        contacts: 'CONTACTS',
        solver: 'VERLET / 12×',
      },
    },
    fabrik: {
      eyebrow: 'Procedural Motion Laboratory / 05',
      titleLineOne: 'A skeleton is not a shape.',
      titleLineTwo: 'It is a set of solved constraints.',
      description:
        'FABRIK works backward from the target into a stable bone pose while angle cones prevent unnatural folding. The quadruped layer adds steering, foot-lock thresholds, and alternating gait.',
      techTags: ['FABRIK / 12 ITERATIONS', 'ANGLE CONES', '2-BONE GAIT'],
      modeGroupAria: 'Switch IK morphology',
      modes: {
        arm: '6-AXIS',
        quadruped: '4-LEG',
      },
      state: {
        arm: 'SIX-AXIS KINEMATICS',
        quadruped: 'QUADRUPED GAIT',
      },
      debug: {
        aria: 'Show IK vectors',
        long: 'Show IK Vectors',
        short: 'Vectors',
      },
      reset: {
        aria: 'Reset IK scene',
        title: 'Reset IK scene',
      },
      canvasAria: {
        arm: 'Interactive six-axis FABRIK arm canvas. Click to fire the laser.',
        quadruped:
          'Interactive procedural quadruped FABRIK gait canvas.',
      },
      action: {
        arm: 'CLICK TO PULSE',
        quadruped: 'STEERING ACTIVE',
        core: 'KINETIC CORE / 05',
      },
      draw: {
        joint: 'J{index}',
        error: 'FABRIK ERROR {error} PX',
        iterations: '{current} / {max} ITERATIONS',
        armState: 'ARM-06  {state}',
        tracking: 'TRACKING',
        locked: 'LOCKED',
        legError: '2-BONE IK ERROR {error} PX',
        legIterations: '{current} / {max} ITERATIONS',
        gait:
          'SPINE {spine}  TROT {group}  {phase}',
        gaitStates: {
          idle: 'IDLE',
          stepping: 'STEPPING',
          locked: 'LOCKED',
        },
      },
      telemetry: {
        solver: 'FABRIK',
        solverPasses: '12×',
      },
    },
  },
  gallery: {
    eyebrow: 'OPTICAL & ARCHITECTURE SANDBOX GALLERY',
    liveExhibits: '8 LIVE EXHIBITS',
    titleLineOne: 'Refract reality.',
    titleLineTwo: 'Make computation visible.',
    description:
      'Eight directly perturbable optics benches. Move or drag a field to shift phase, then enter the darkroom and inspect how the algorithm shapes light from any angle.',
    demonstration: 'GLOBAL DEMONSTRATION',
    touring: 'Touring: {exhibit}',
    tourStandby: 'Tour demonstration on standby',
    pauseTour: 'Pause gallery tour',
    startTour: 'Start gallery tour',
    tourDirector: {
      launch: 'Launch Light Show Tour',
      launchShort: 'LIGHT SHOW TOUR',
      pause: 'Pause light show',
      resume: 'Resume light show',
      skip: 'Skip to next exhibit',
      exit: 'Exit light show',
      live: 'CINEMA SHOWCASE TOUR',
      autoClimax: 'AUTO CLIMAX / 2.0 S',
      quickDock: 'Optical exhibition quick dock',
      coreFormula: 'Core equation',
      chapter: 'CHAPTER {current} / {total}',
      commandSubtitle: '8 exhibits × 6 seconds / automatic climax',
    },
    timeScale: 'GLOBAL TIME SCALE',
    timeScaleAria: 'Global gallery time scale',
    sharedViews: '8 SHARED VIEWS / 1 WEBGL CONTEXT',
    footerPipeline:
      'VIEWPORT-CLIPPED WEBGL / DARKROOM INSPECTOR / DIRECT FIELD',
    opticalBusOnline: 'OPTICAL BUS ONLINE',
    pedestal: {
      directField: 'DIRECT FIELD',
      dragToDeflect: 'DRAG TO DEFLECT',
      wavelengthLive: 'λ LIVE',
      enter: 'Enter Optical Darkroom',
      enterAria: 'Enter the optical darkroom for {exhibit}',
      enterCompact: 'ENTER DARKROOM LAB',
    },
    presets: {
      standard: {
        label: 'Standard',
        subtitle: 'STANDARD',
      },
      overdrive: {
        label: 'High-energy Overdrive',
        subtitle: 'OVERDRIVE',
      },
      analysis: {
        label: 'Slow-motion Analysis',
        subtitle: 'SLOW ANALYSIS',
      },
    },
    controls: {
      wavelength: 'Wavelength',
      slitGap: 'Slit Spacing',
      coherence: 'Coherence',
      exposure: 'Exposure',
      ior: 'Base Refractive Index',
      dispersion: 'Dispersion',
      incidence: 'Angle of Incidence',
      beamPower: 'Laser Power',
      curvature: 'Surface Curvature',
      focus: 'Focal Plane',
      gain: 'Photon Gain',
      aberration: 'Spherical Aberration',
      angle: 'Analyzer Angle',
      magneticField: 'Magnetic Field Strength',
      temperature: 'Core Temperature',
      turbulence: 'Plasma Turbulence',
      arcCount: 'Containment Arc Count',
      verdet: 'Verdet Constant',
      contrast: 'Extinction Contrast',
      phase: 'Phase / Dispersion',
      coupling: 'Node Coupling',
      tempo: 'Sequencer Tempo',
      drive: 'Spectral Drive',
      spectrumBias: 'Band Bias',
      waveDensity: 'Waveform Density',
      focal: 'Focal Length',
      aperture: 'Clear Aperture',
      mass: 'Optical Mass',
      excitation: 'Excitation Intensity',
      lifetime: 'Lifetime',
      yield: 'Quantum Yield',
      lattice: 'Lattice Constant',
      winding: 'Winding Number',
      twist: 'Phase Twist',
      flow: 'Circulation Speed',
      pressure: 'Radiation Pressure',
      scanRate: 'Scan Rate',
      scanWidth: 'Scan Front Width',
      attention: 'Attention Sharpness',
      pulseRate: 'Pulse Propagation Speed',
      depth: 'Network Depth',
      tensorLoad: 'Tensor Load',
      clock: 'SM Clock',
      rayBias: 'Ray Bias',
      bvhDepth: 'BVH Depth',
    },
    prismShapes: {
      label: 'Crystal Cut',
      octahedron: 'Octahedron',
      prism: 'Triangular Prism',
      icosahedron: 'Brilliant Diamond',
      short: {
        octahedron: 'OCTA',
        prism: 'PRISM',
        icosahedron: 'BRILLIANT',
      },
    },
    prismInteraction: {
      emitterAria: 'Drag the laser emitter vertically to set the angle of incidence',
      crystalAria: 'Drag the crystal to change its optical orientation',
      emitterHint: 'Drag emitter / θi',
      crystalHint: 'Drag crystal / rotate',
      incidenceReadout: 'INCIDENCE θi {value}°',
      criticalAngle: 'CRITICAL θc {value}°',
      totalInternalReflection: 'TOTAL INTERNAL REFLECTION',
    },
    hologramModels: {
      label: 'Scan Target',
      'gyro-core': 'Nested Gyro Core',
      'cyber-skull': 'Cyber Bionic Skull',
      'turbine-rotor': 'Turbine Rotor',
      short: {
        'gyro-core': 'GYRO',
        'cyber-skull': 'SKULL',
        'turbine-rotor': 'ROTOR',
      },
    },
    hologramInteraction: {
      hint: 'MOVE Y TO SLICE / CLICK TO DESYNC',
      manualScan: 'MANUAL X-RAY SLICE',
      autoScan: 'AUTO SCAN CYCLE',
      scanHeight: 'SLICE Y {value}',
      glitch: 'HOLOGRAM SIGNAL DESYNC',
    },
    particleManifolds: {
      label: 'Target Manifold',
      'mobius-ring': 'Möbius Star Ring',
      'double-helix': 'Double-Helix DNA',
      'trefoil-knot': 'Trefoil Singularity',
      'fibonacci-sphere': 'Fibonacci Lattice',
      'wafer-city': 'Silicon Wafer City',
      short: {
        'mobius-ring': 'MÖBIUS',
        'double-helix': 'DNA',
        'trefoil-knot': 'TREFOIL',
        'fibonacci-sphere': 'FIBONACCI',
        'wafer-city': 'WAFER',
      },
    },
    particleInteraction: {
      stageHint: 'HOLD: GRAVITY / RELEASE: SUPERNOVA',
      darkroomHint:
        'HOLD LMB: GRAVITY WELL / ALT+DRAG: ORBIT / RMB: PAN',
      quickLabel: 'Particle morphology shortcuts',
      accretion: 'ACCRETION SINGULARITY',
      supernova: 'SUPERNOVA RECOIL',
    },
    reactorInteraction: {
      stageHint: 'CLICK SHIELD / TRACE RIPPLE',
      overclock: 'Overclock Core',
      charging: 'Charging 1.5s',
      injectFuel: 'Inject fuel and overclock the reactor core',
      shockwave: 'PLASMA SHOCKWAVE',
      chargeTimeShort: '1.5s',
      speedShort: '4x',
      recovering: 'Core Recovering',
      surgeShort: 'SURGE',
      recoverShort: 'COOL',
    },
    rayMazeInteraction: {
      stageHint:
        'DRAG OPTIC: MOVE / DRAG DIAL: ROTATE',
      darkroomHint:
        'DRAG BODY: MOVE / DRAG DIAL: ROTATE / ALT+DRAG: ORBIT',
      shuffleLayout: 'Shuffle Optical Layout',
      activeTopology: 'Active topology',
      layouts: [
        'Trident Lock',
        'Five-Point Star Cavity',
        'Mach-Zehnder Interferometer',
      ],
      powerLocked: '{power} mW LOCKED',
      powerStandby: 'STANDBY',
    },
    audioStageInteraction: {
      play: 'Play Synth Stage',
      pause: 'Pause Synth Stage',
      idle: 'READY',
      live: 'LIVE',
      muted: 'MUTED',
      sequenceHint:
        'CMAJ7 / PENTATONIC ARPEGGIO / 104 BPM',
      mutedVisualHint:
        'Silent harmonic simulation keeps the analyser visuals alive.',
      modeLabel: 'Visual topology',
      modeHint:
        'Switching changes spatial mapping while harmony and rhythm continue.',
      modes: {
        matrix: {
          label: 'Matrix Pillars',
          short: '16 × 16',
        },
        sunburst: {
          label: 'Circular Sunburst',
          short: 'Polar',
        },
        waterfall: {
          label: 'Spectral Waterfall',
          short: 'Scrolling terrain',
        },
      },
      lightPadsLabel: 'Octave light pads',
      lightPadsHint:
        'Play a chord and launch its color wave through the stage.',
      padAria: 'Play light pad {index}, note {note}',
    },
    neuralPulseInteraction: {
      trigger: 'Trigger Inference',
      retrigger: 'Replay Inference',
      selectedToken: 'Active token',
      tokenSelect: 'Select input token',
      stageHint: 'CLICK INPUT TOKEN / TRACE ATTENTION BEAMS',
      darkroomHint: 'CLICK INPUT TOKEN / ALT+DRAG: ORBIT',
      inferenceHint:
        '600 PHOTON INSTANCES / EXPONENTIAL ACTIVATION / WINNER LOGIT',
      tokenAria: 'Select input token {token}',
      forwardMode: 'Forward Inference',
      backpropMode: 'Backpropagation',
      forwardShort: 'FORWARD',
      backpropShort: 'BACKPROP',
      forwardHint:
        'Emerald photons cascade from input tokens toward logits.',
      backpropHint:
        'Run a forward pass, then release the error gradient from the output layer.',
      runBackprop: 'Run Backprop',
      gradientEquation: 'Δw = -η∇L',
      nodeIsolation: 'Node isolation spotlight',
      activationFunction: 'Activation function',
      activationValue: 'Current activation',
    },
    gpuComputeInteraction: {
      modeLabel: 'GPU ray pipeline',
      tensor: 'Tensor Core GEMM',
      bvh: 'RT Core BVH',
      tensorShort: 'GEMM',
      bvhShort: 'BVH',
      workload: 'Compute workload',
      workloadShort: 'LOAD',
      tflops: 'TFLOPS',
      memoryBandwidth: 'HBM BW',
      thermalNominal: 'NOMINAL',
      thermalSaturated: 'FP8 SATURATED',
      stageHint:
        '8 × 8 × 8 VOXELS / CLICK A VOXEL: 32-THREAD WARP',
      tensorHint:
        'Matrices A and B intersect to detonate 512 voxels into the accumulator.',
      bvhHint:
        'A probe ray traverses bounding boxes, upgrading hits from cold blue to bright green.',
      workloadHint:
        'Raise FP8 / FP16 occupancy to drive the thermal field and memory fabric toward saturation.',
      warpHint:
        'Click any tensor voxel to unfold one synchronized 32-thread CUDA warp.',
    },
    exhibits: {
      'prism-caustics': {
        name: 'Prism Caustics',
        designation: 'FIELD STUDY 01',
        opticalTag: 'Chromatic Optics',
        algorithmTag: 'Voronoi RGB Caustics',
        summary:
          'A high-dispersion crystal splits a collimated white beam into seven volumetric spectra while its rotating facets paint live RGB caustics across the stage.',
      },
      'laser-scan-hologram': {
        name: 'Laser Scan Hologram',
        designation: 'FIELD STUDY 02',
        opticalTag: 'Scanning Holography',
        algorithmTag: 'Quad-State Reveal Shader',
        summary:
          'A quad-axis laser gantry sweeps a precision target from void point cloud to plasma frontier, luminous triangle mesh, and a finished Fresnel hologram.',
      },
      'particle-morph': {
        name: 'Particle Morph',
        designation: 'FIELD STUDY 03',
        opticalTag: 'Particle Sculpture',
        algorithmTag: 'Curl-Noise Morphing',
        summary:
          'Twenty thousand luminous particles collapse through a curl-noise galaxy storm into five precision mathematical manifolds, shifting from cold emerald matter to violet-gold kinetic energy.',
      },
      'plasma-reactor': {
        name: 'Plasma Reactor',
        designation: 'FIELD STUDY 04',
        opticalTag: 'Magnetic Confinement Fusion',
        algorithmTag: 'Turbulence fBm / Fractal Arcs',
        summary:
          'A blackbody plasma core boils inside three orthogonal magnetic gimbals, testing a hexagonal containment field with live fractal lightning arcs.',
      },
      'photonic-mesh': {
        name: 'Ray Bounce Maze',
        designation: 'FIELD STUDY 05',
        opticalTag: 'Recursive Optics',
        algorithmTag: 'CPU Ray Tree',
        summary:
          'Drag mirrors, a 50/50 beam splitter, and a dispersive prism to rebuild a live ten-level recursive light tree across three photon receptors.',
      },
      'orbital-lens': {
        name: 'Audio Spectrum Stage',
        designation: 'FIELD STUDY 06',
        opticalTag: 'Sonic Light Field',
        algorithmTag: 'FFT 512 / 3D TOPOLOGY',
        summary:
          'A procedural synth drives matrix pillars, a circular sunburst, and a scrolling spectrogram terrain; eight light pads trigger chords and radial shockwaves.',
      },
      'quantum-lattice': {
        name: 'Neural Pulse Sandbox',
        designation: 'FIELD STUDY 07',
        opticalTag: 'Transformer Field',
        algorithmTag: '5-LAYER / BIDIRECTIONAL',
        summary:
          'Eight tokens cross chromatic attention and twin 4 × 4 lattices; forward inference can reverse into an ember-violet gradient wave, while hidden neurons isolate to reveal GeLU/Swish activation curves.',
      },
      'phase-torus': {
        name: 'GPU Compute Matrix',
        designation: 'FIELD STUDY 08',
        opticalTag: 'Tensor Silicon',
        algorithmTag: '512 VOXEL / BVH',
        summary:
          'HBM and NVLink particles race across a black silicon die while an 8 × 8 × 8 tensor cube performs a GEMM storm; switch to RT Core mode to watch a sweeping ray illuminate a nested BVH hierarchy.',
      },
    },
    darkroom: {
      eyebrow: 'OPTICAL DARKROOM',
      previous: 'Previous optical exhibit',
      next: 'Next optical exhibit',
      pauseTour: 'Pause global tour',
      startTour: 'Start global tour',
      close: 'Close optical darkroom',
      cinemaClean: 'Cinema clean view (H)',
      cinemaCleanExit: 'Exit cinema clean view (H)',
      cinemaCleanHint:
        'Interface hidden. Press H to return to the darkroom controls.',
      navigationHint: 'LEFT ORBIT / RIGHT PAN / WHEEL ZOOM',
      liveField: 'LIVE OPTICAL FIELD',
      resetCamera: 'Reset darkroom camera',
      parametersTitle: 'Live Experiment Parameters',
      parameterMatrix: 'OPTICAL PARAMETER MATRIX',
      resetParameters: 'Reset current exhibit parameters',
      reset: 'RESET',
      render: 'RENDER',
      photonFlux: 'PHOTON FLUX',
      photonsPerSecond: 'photons / s',
      presets: 'OPTICAL PRESETS',
      custom: 'CUSTOM',
      exhibitParameters: 'EXHIBIT PARAMETERS',
      channels: '{count} CHANNELS',
      globalTimeScale: 'GLOBAL TIME SCALE',
      globalTimeScaleAria: 'Global slow-motion time scale',
      governingEquation: 'GOVERNING EQUATION',
      sharedWebgl: 'SHARED WEBGL / VIEW',
      visibleSpectrum: 'VISIBLE SPECTRUM',
      wavelengthAria: 'Visible spectrum laser wavelength',
      nanometerValue: '{value} nanometers',
      spectrumUltraviolet: 'UV 380 nm',
      spectrumInfrared: 'IR 750 nm',
      parameterAria: '{exhibit}: {parameter}',
    },
  },
  command: {
    dialogTitle: 'Global Command Palette',
    searchAria: 'Search commands',
    searchPlaceholder: 'Search sections, visual effects, physics, or tools',
    close: 'Close command palette',
    resultsAria: 'Command search results',
    actionCount: '{count} ACTIONS / FUZZY INDEX',
    current: 'CURRENT',
    noResults: 'No matching command',
    noResultsHint: 'Try “gravity”, “violet”, or “email”',
    choose: 'Choose',
    execute: 'Execute',
    dismiss: 'Close',
    groups: {
      showcase: 'Cinema Showcase',
      sections: 'Section Navigation',
      gravity: 'Physics Environment',
      vfx: 'Visual Overdrive',
      accent: 'Accent Spectrum',
      tools: 'Tools',
    },
    titles: {
      lightShow: 'Launch Light Show Tour',
      section: 'Go to: {label}',
      gravity: 'Physics environment: {label}',
      accent: 'Switch accent color: {label}',
      vfx: 'Visual overdrive: {label}',
      copyEmail: 'Copy contact email',
      downloadResume: 'Download resume JSON',
    },
    toasts: {
      tourStarted: 'Cinema showcase tour launched',
      copied: 'Email copied to clipboard',
      resumeReady: 'Resume JSON generated',
      gravityChanged: 'Physics gravity environment changed',
      vfxChanged: 'Global visual overdrive preset changed',
      accentChanged: 'Accent spectrum changed',
      failed: 'Action could not be completed. Try again.',
    },
    resume: {
      role: 'Creative Engineer / Interactive Systems',
      location: 'Shanghai, China',
      capabilities: [
        'Realtime WebGL / R3F',
        'React architecture',
        'Creative interaction design',
        'Physics and procedural systems',
        'AI-native product engineering',
      ],
    },
  },
  telemetry: {
    panelAria: 'Developer performance telemetry panel',
    eyebrow: 'RUNTIME TELEMETRY',
    cadence: 'SHIFT + D / LIVE 500 MS SAMPLE',
    close: 'Close performance telemetry panel',
    fps: 'CURRENT FPS',
    frameTime: 'FRAME TIME',
    activeParticles: 'ACTIVE PARTICLES',
    physicsSolve: 'PHYSICS SOLVE',
    shaderPasses: 'SHADER PASSES',
    vfxSpectrum: 'VFX SPECTRUM',
    activeExhibit: 'ACTIVE OPTICAL EXHIBIT',
    activeViewports: 'ACTIVE VIEWPORTS',
    noActiveExhibit: 'NO ACTIVE EXHIBIT',
    memory: 'JS HEAP / 64 SAMPLES',
    renderGovernor: 'RENDER GOVERNOR ACTIVE',
    tier: '{tier} TIER',
    units: {
      fps: 'FPS',
      ms: 'MS',
      unavailable: 'N/A',
    },
  },
  qualityNotice: {
    eyebrow: 'ADAPTIVE QUALITY',
    message:
      'Sustained render load fell below 45 FPS. Balanced image quality is now active.',
    details: 'DPR 1.0 / 4,000 PARTICLES / POST FX REDUCED',
    close: 'Dismiss image quality notice',
  },
  soundSpectrum: {
    aria: 'Live audio spectrum',
  },
  scrollProgress: {
    aria: 'Page scroll progress',
    valueText: 'Page scrolled {value}%',
  },
  fallback: {
    webgl: 'This browser cannot initialize the WebGL showroom.',
  },
}

export type TranslationDictionary = typeof en

export function formatTranslation(
  template: string,
  values: Record<string, string | number>,
) {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in values ? String(values[key]) : match,
  )
}
