import json
import os
from pathlib import Path
import sys

from playwright.sync_api import expect, sync_playwright


BASE_URL = os.getenv("VRAM_BASE_URL", "http://127.0.0.1:5173")
output_dir = Path(
    sys.argv[1] if len(sys.argv) > 1 else "artifacts/vram-leak-audit"
)
if len(sys.argv) > 2:
    BASE_URL = sys.argv[2]
output_dir.mkdir(parents=True, exist_ok=True)

chrome_candidates = [
    Path("C:/Program Files/Google/Chrome/Application/chrome.exe"),
    Path("C:/Program Files (x86)/Google/Chrome/Application/chrome.exe"),
    Path("C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"),
]
chrome_path = next((path for path in chrome_candidates if path.exists()), None)

console_errors: list[str] = []
page_errors: list[str] = []


def static_resource_audit() -> dict[str, object]:
    required_dispose = {
        "AuroraCurtain.tsx": [
            "geometry.dispose()",
            "material.dispose()",
        ],
        "FlowFieldParticles.tsx": [
            "geometry.dispose()",
            "material.dispose()",
            "torusSource.dispose()",
        ],
        "CursorStardustTrail.tsx": [
            "geometry.dispose()",
            "material.dispose()",
            "ribbonGeometry.dispose()",
            "ribbonMaterial.dispose()",
            "shockwaveGeometry.dispose()",
            "shockwaveMaterial.dispose()",
        ],
        "VolumetricStageLights.tsx": [
            "beamGeometries[index].dispose()",
            "beamMaterials[index].dispose()",
            "dustGeometry.dispose()",
            "dustMaterial.dispose()",
        ],
        "ArchitecturalOptics.tsx": [
            "geometry.dispose()",
            "material.dispose()",
        ],
        "ScrollArchitecture3D.tsx": [
            "matrixData.geometry.dispose()",
            "matrixData.material.dispose()",
            "tubeGeometry.dispose()",
            "material.dispose()",
            "geometry.dispose()",
        ],
        "OpticalExhibitScene.tsx": [
            "geometry.dispose()",
        ],
        "PrismCausticsExhibit.tsx": [
            "crystalGeometry.dispose()",
            "causticsMaterialRef.current?.dispose()",
            "geometry.dispose()",
            "materialRef.current?.dispose()",
        ],
        "LaserScanHologramExhibit.tsx": [
            "geometry.dispose()",
            "material.dispose()",
            "sparkGeometry.dispose()",
        ],
        "ParticleMorphExhibit.tsx": [
            "geometry.dispose()",
            "materialRef.current?.dispose()",
            "positionA.array.set(from.positions)",
            "positionB.array.set(target.positions)",
        ],
        "PlasmaReactorExhibit.tsx": [
            "coreMaterial.dispose()",
            "coronaMaterial.dispose()",
            "shieldMaterial.dispose()",
            "shockwaveMaterial.dispose()",
            "lightning.lineGeometry.dispose()",
            "lightning.contactGeometry.dispose()",
        ],
        "AudioSpectrumStageExhibit.tsx": [
            "waveform.ribbonGeometry.dispose()",
            "waveform.lineGeometry.dispose()",
            "stageGridGeometry.dispose()",
            "terrain.geometry.dispose()",
            "terrain.lineGeometry.dispose()",
            "pillarRefs.current.forEach((mesh) => mesh?.dispose())",
            "orbRefs.current.forEach((mesh) => mesh?.dispose())",
            "sunburstRefs.current.forEach((mesh) => mesh?.dispose())",
            "soundEngine.stopArpeggiator()",
        ],
        "RayBounceMazeExhibit.tsx": [
            "gridGeometry.dispose()",
            "beamLineGeometry.dispose()",
            "flareGeometry.dispose()",
            "sparkGeometry.dispose()",
            "targetParticleGeometry.dispose()",
            "targetPowerLabels.forEach((label) => label?.texture.dispose())",
            "outerBeamMaterial.dispose()",
            "mediumBeamMaterial.dispose()",
            "coreBeamMaterial.dispose()",
            "outerBeamRef.current?.dispose()",
            "mediumBeamRef.current?.dispose()",
            "coreBeamRef.current?.dispose()",
        ],
        "NeuralPulseSandboxExhibit.tsx": [
            "layout.layerRailGeometry.dispose()",
            "network.fiberGeometry.dispose()",
            "isolationGeometry.geometry.dispose()",
            "inspectorPanel?.texture.dispose()",
            "network.attentionBeams.forEach((beam) =>",
            "attentionClusterRefs.current.forEach((mesh) =>",
            "hiddenAMeshRef.current?.dispose()",
            "hiddenBMeshRef.current?.dispose()",
            "photonMeshRef.current?.dispose()",
            "photonGlowMeshRef.current?.dispose()",
            "gradientFiberMeshRef.current?.dispose()",
        ],
        "GpuComputeMatrixExhibit.tsx": [
            "circuitGeometry.dispose()",
            "scanGridGeometry.dispose()",
            "tensorPointGeometry.dispose()",
            "bvhRayGeometry.dispose()",
            "node.edgesGeometry.dispose()",
            "tensorMeshRef.current?.dispose()",
            "warpBeamRef.current?.dispose()",
            "accumulatorParticlesRef.current?.dispose()",
            "busMeshRefs.current.forEach((mesh) => mesh?.dispose())",
        ],
    }
    raf_cleanup = {
        "BentoGrid.tsx": "cancelAnimationFrame",
        "CardParticleCanvas.tsx": "cancelAnimationFrame",
        "FabrikCreature.tsx": "cancelAnimationFrame",
        "VerletLanyard.tsx": "cancelAnimationFrame",
        "DarkroomInspectorModal.tsx": "cancelAnimationFrame",
    }
    timer_cleanup = {
        "BentoGrid.tsx": "clearInterval",
        "VfxPresetSweep.tsx": "clearTimeout",
    }
    event_cleanup = {
        "CardParticleCanvas.tsx": "removeEventListener",
        "CursorStardustTrail.tsx": "removeEventListener",
        "FlowFieldParticles.tsx": "removeEventListener",
        "FabrikCreature.tsx": "removeEventListener",
        "VerletLanyard.tsx": "removeEventListener",
        "DarkroomInspectorModal.tsx": "removeEventListener",
    }
    canvas_cleanup = {
        "CardParticleCanvas.tsx": [
            "canvas.width = 0",
            "canvas.height = 0",
        ],
        "FabrikCreature.tsx": [
            "canvas.width = 0",
            "canvas.height = 0",
        ],
        "VerletLanyard.tsx": [
            "particleCanvas.width = 0",
            "particleCanvas.height = 0",
            "particleContext = null",
        ],
    }
    root = Path("src/components")
    sound_engine_path = Path("src/utils/soundEngine.ts")

    for filename, snippets in required_dispose.items():
        matches = list(root.rglob(filename))
        assert matches, f"Missing audited file: {filename}"
        source = matches[0].read_text(encoding="utf-8")
        for snippet in snippets:
            assert snippet in source, f"{filename} missing cleanup: {snippet}"

    for filename, cleanup in raf_cleanup.items():
        matches = list(root.rglob(filename))
        assert matches, f"Missing RAF file: {filename}"
        source = matches[0].read_text(encoding="utf-8")
        assert "requestAnimationFrame" in source
        assert cleanup in source, f"{filename} missing {cleanup}"

    for filename, cleanup in event_cleanup.items():
        matches = list(root.rglob(filename))
        assert matches, f"Missing listener file: {filename}"
        source = matches[0].read_text(encoding="utf-8")
        assert "addEventListener" in source
        assert cleanup in source, f"{filename} missing {cleanup}"

    for filename, cleanup in timer_cleanup.items():
        matches = list(root.rglob(filename))
        assert matches, f"Missing timer file: {filename}"
        source = matches[0].read_text(encoding="utf-8")
        assert cleanup in source, f"{filename} missing {cleanup}"

    for filename, snippets in canvas_cleanup.items():
        matches = list(root.rglob(filename))
        assert matches, f"Missing canvas file: {filename}"
        source = matches[0].read_text(encoding="utf-8")
        assert "getContext(" in source
        for snippet in snippets:
            assert snippet in source, f"{filename} missing {snippet}"

    assert sound_engine_path.exists(), "Missing SoundEngine"
    sound_engine_source = sound_engine_path.read_text(encoding="utf-8")
    for snippet in (
        "private transientTimers = new Set<number>()",
        "dispose()",
        "disconnectWhenEnded(",
        "node.disconnect()",
        "context.close()",
    ):
        assert snippet in sound_engine_source, (
            f"SoundEngine missing lifecycle cleanup: {snippet}"
        )

    return {
        "disposeAuditedFiles": len(required_dispose),
        "rafAuditedFiles": len(raf_cleanup),
        "timerAuditedFiles": len(timer_cleanup),
        "eventAuditedFiles": len(event_cleanup),
        "canvasContextAuditedFiles": len(canvas_cleanup),
        "audioNodeAuditedFiles": 1,
        "explicitTextureAllocations": 0,
    }


def attach_errors(page) -> None:
    page.on(
        "console",
        lambda message: (
            console_errors.append(message.text)
            if message.type == "error"
            else None
        ),
    )
    page.on("pageerror", lambda error: page_errors.append(str(error)))


def renderer_snapshot(page) -> dict[str, int]:
    return page.evaluate(
        """
        async () => {
          const modules = performance
            .getEntriesByType("resource")
            .map((entry) => entry.name)
          const fiberUrl = modules.find((name) =>
            name.includes("@react-three_fiber")
          )
          const fiber = await import(
            fiberUrl ||
            "/node_modules/.vite/deps/@react-three_fiber.js"
          )
          const entries = Array.from(fiber._roots.entries())
          const heroEntry = entries.find(([canvas]) =>
            canvas.closest("[data-scene-canvas]")
          )
          if (!heroEntry) {
            return {
              roots: entries.length,
              geometries: -1,
              textures: -1,
              programs: -1,
            }
          }
          const state = heroEntry[1].store.getState()
          return {
            roots: entries.length,
            geometries: state.gl.info.memory.geometries,
            textures: state.gl.info.memory.textures,
            programs: state.gl.info.programs?.length ?? 0,
          }
        }
        """
    )


def gallery_renderer_snapshot(page) -> dict[str, int]:
    return page.evaluate(
        """
        async () => {
          const modules = performance
            .getEntriesByType("resource")
            .map((entry) => entry.name)
          const fiberUrl = modules.find((name) =>
            name.includes("@react-three_fiber")
          )
          const fiber = await import(
            fiberUrl ||
            "/node_modules/.vite/deps/@react-three_fiber.js"
          )
          const entries = Array.from(fiber._roots.entries())
          const galleryEntry = entries.find(([canvas]) =>
            canvas.closest("[data-gallery-shared-canvas]")
          )
          if (!galleryEntry) {
            return {
              roots: entries.length,
              geometries: -1,
              textures: -1,
              programs: -1,
            }
          }
          const state = galleryEntry[1].store.getState()
          return {
            roots: entries.length,
            geometries: state.gl.info.memory.geometries,
            textures: state.gl.info.memory.textures,
            programs: state.gl.info.programs?.length ?? 0,
          }
        }
        """
    )


GALLERY_READY_MARKERS = {
    "prism-caustics": ("prismCaustics", "voronoi-rgb"),
    "laser-scan-hologram": ("laserScanHologram", "quad-state"),
    "particle-morph": ("particleMorph", "gpu-curl-morph"),
    "plasma-reactor": ("plasmaReactor", "hybrid-core"),
    "photonic-mesh": (
        "rayBounceMaze",
        "recursive-cpu-max-depth-10",
    ),
    "orbital-lens": ("audioSpectrumStage", "instanced-256"),
    "quantum-lattice": (
        "neuralPulseSandbox",
        "five-layer-transformer",
    ),
    "phase-torus": ("gpuComputeMatrix", "tensor-core-bvh"),
}


def set_gallery_exhibit(page, exhibit_id: str | None) -> None:
    page.evaluate(
        """
        async (exhibitId) => {
          const storeUrl = performance
            .getEntriesByType("resource")
            .map((entry) => entry.name)
            .find((name) =>
              name.includes("/src/store/useGalleryStore.ts")
            )
          if (!storeUrl) throw new Error("Gallery store URL unavailable")
          const { useGalleryStore } = await import(storeUrl)
          useGalleryStore.getState().setActiveExhibitId(exhibitId)
        }
        """,
        exhibit_id,
    )
    if exhibit_id is None:
        page.wait_for_function(
            """
            () => {
              const canvas = document.querySelector(
                '[data-gallery-shared-canvas]'
              )
              return canvas?.dataset.galleryStageMounted === 'false' &&
                document.querySelector(
                  '[data-telemetry-active-exhibit="none"]'
                )
            }
            """,
            timeout=10_000,
        )
        return

    marker, expected = GALLERY_READY_MARKERS[exhibit_id]
    page.wait_for_function(
        """
        ([markerName, expectedValue]) => {
          const canvas = document.querySelector(
            '[data-gallery-shared-canvas]'
          )
          return canvas?.dataset.galleryStageMounted === 'true' &&
            canvas.dataset[markerName] === expectedValue
        }
        """,
        arg=[marker, expected],
        timeout=15_000,
    )
    page.wait_for_timeout(120)


def set_performance_tier(page, tier: str) -> None:
    page.evaluate(
        """
        async (tier) => {
          const storeUrl = performance
            .getEntriesByType("resource")
            .map((entry) => entry.name)
            .find((name) => name.includes("/src/store/useAppStore.ts"))
          if (!storeUrl) throw new Error("Store module URL unavailable")
          const { useAppStore } = await import(storeUrl)
          useAppStore.getState().setPerformanceTier(tier)
        }
        """,
        tier,
    )


static_report = static_resource_audit()

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(
        headless=True,
        executable_path=str(chrome_path) if chrome_path else None,
        args=[
            "--enable-webgl",
            "--ignore-gpu-blocklist",
            "--use-angle=swiftshader",
            "--js-flags=--expose-gc",
        ],
    )
    context = browser.new_context(
        viewport={"width": 1440, "height": 1000},
        device_scale_factor=1,
        reduced_motion="no-preference",
    )
    page = context.new_page()
    attach_errors(page)
    page.goto(BASE_URL, wait_until="networkidle")
    expect(page.locator("h1")).to_be_visible()

    set_performance_tier(page, "high")
    page.wait_for_timeout(900)
    scene = page.locator("[data-scene-canvas]")
    expect(scene).to_have_attribute("data-postprocessing", "bloom-chromatic-vignette-noise")
    expect(scene).to_have_attribute("data-cursor-stardust-count", "4000")
    expect(scene).to_have_attribute("data-volumetric-dust-count", "1500")
    expect(scene).to_have_attribute("data-shader-pass-count", "4")

    for section_id in (
        "works",
        "gallery",
        "architecture",
        "sandbox",
        "kinetics",
    ):
        page.evaluate(
            """
            (id) => {
              const section = document.getElementById(id)
              window.scrollTo(
                0,
                section.getBoundingClientRect().top + window.scrollY - 76
              )
            }
            """,
            section_id,
        )
        page.wait_for_timeout(180)
        if section_id == "architecture":
            expect(
                page.locator("[data-architecture-sticky]")
            ).to_have_attribute(
                "data-scene-ready",
                "true",
                timeout=8_000,
            )
            page.wait_for_timeout(500)
    page.evaluate("window.scrollTo(0, 0)")
    page.wait_for_timeout(700)
    page.evaluate("window.gc?.()")
    baseline = renderer_snapshot(page)
    assert baseline["roots"] >= 2, baseline
    assert baseline["geometries"] > 0, baseline

    preset_ids = (
        "supernova-gold",
        "quantum-violet",
        "emerald-cyber",
    )
    for cycle in range(8):
        preset_id = preset_ids[cycle % len(preset_ids)]
        page.locator(
            '[data-vfx-preset-switcher] '
            f'[data-vfx-preset-option="{preset_id}"]'
        ).evaluate("(element) => element.click()")
        page.wait_for_timeout(90)

    page.locator(
        '[data-vfx-preset-switcher] '
        '[data-vfx-preset-option="emerald-cyber"]'
    ).evaluate("(element) => element.click()")
    page.wait_for_timeout(600)
    page.evaluate("window.gc?.()")
    after_preset_cycles = renderer_snapshot(page)
    assert (
        after_preset_cycles["geometries"]
        <= baseline["geometries"] + 2
    ), (baseline, after_preset_cycles)
    assert (
        after_preset_cycles["textures"]
        <= baseline["textures"] + 2
    ), (baseline, after_preset_cycles)
    assert (
        after_preset_cycles["programs"]
        <= baseline["programs"] + 8
    ), (baseline, after_preset_cycles)

    set_performance_tier(page, "medium")
    page.wait_for_timeout(500)
    expect(scene).to_have_attribute("data-particle-count", "4000")
    expect(scene).to_have_attribute("data-cursor-stardust-count", "2000")
    expect(scene).to_have_attribute("data-volumetric-dust-count", "750")
    expect(scene).to_have_attribute("data-postprocessing", "bloom-vignette")
    expect(scene).to_have_attribute("data-shader-pass-count", "2")

    page.get_by_role(
        "button", name="Open performance telemetry panel"
    ).click()
    hud = page.locator("[data-telemetry-hud]")
    expect(hud).to_be_visible()
    page.wait_for_timeout(550)
    telemetry_particles = int(
        page.locator("[data-telemetry-particles]")
        .inner_text()
        .replace(",", "")
    )
    assert telemetry_particles > 0
    assert int(
        page.locator("[data-telemetry-shader-passes]").inner_text()
    ) > 0
    expect(page.locator("[data-telemetry-vfx-preset]")).to_have_attribute(
        "data-telemetry-vfx-preset",
        "emerald-cyber",
    )
    page.screenshot(path=output_dir / "desktop-medium-telemetry.png")
    medium_snapshot = renderer_snapshot(page)
    assert (
        medium_snapshot["geometries"] <= baseline["geometries"] + 2
    ), (baseline, medium_snapshot)
    assert (
        medium_snapshot["textures"] <= baseline["textures"] + 2
    ), (baseline, medium_snapshot)

    set_performance_tier(page, "high")
    page.wait_for_timeout(450)
    restored_high_snapshot = renderer_snapshot(page)
    assert (
        restored_high_snapshot["geometries"]
        <= baseline["geometries"] + 2
    ), (baseline, restored_high_snapshot)

    for _ in range(4):
        set_performance_tier(page, "medium")
        page.wait_for_timeout(160)
        set_performance_tier(page, "high")
        page.wait_for_timeout(160)
    after_tier_cycles = renderer_snapshot(page)
    assert (
        after_tier_cycles["geometries"]
        <= baseline["geometries"] + 2
    ), (baseline, after_tier_cycles)
    assert (
        after_tier_cycles["textures"]
        <= baseline["textures"] + 2
    ), (baseline, after_tier_cycles)

    page.evaluate(
        """
        () => {
          const section = document.getElementById("gallery")
          window.scrollTo(
            0,
            section.getBoundingClientRect().top + window.scrollY - 76
          )
        }
        """
    )
    page.wait_for_timeout(700)
    page.locator("[data-exhibit-pedestal]").first.evaluate(
        "(element) => element.scrollIntoView({ block: 'center' })"
    )
    page.wait_for_timeout(500)
    expect(
        page.locator("[data-gallery-shared-canvas] canvas")
    ).to_have_count(0)
    expect(
        page.locator("[data-gallery-shared-canvas]")
    ).to_have_attribute("data-gallery-stage-mounted", "false")
    expect(page.locator("[data-exhibit-preview]")).to_have_count(8)
    gallery_views = int(
        page.locator(
            '[data-telemetry-active-views-value]'
        ).inner_text()
    )
    assert gallery_views == 0, gallery_views

    set_gallery_exhibit(page, "photonic-mesh")
    page.wait_for_function(
        """
        () => Number(
          document.querySelector(
            '[data-telemetry-active-views-value]'
          )?.textContent ?? 0
        ) === 1
        """,
        timeout=10_000,
    )
    expect(
        page.locator('[data-telemetry-active-exhibit="photonic-mesh"]')
    ).to_be_visible()
    darkroom_views = int(
        page.locator(
            '[data-telemetry-active-views-value]'
        ).inner_text()
    )
    assert darkroom_views == 1, darkroom_views
    expect(
        page.locator("[data-gallery-shared-canvas] canvas")
    ).to_have_count(1)
    set_gallery_exhibit(page, None)
    page.wait_for_timeout(500)
    expect(
        page.locator("[data-gallery-shared-canvas] canvas")
    ).to_have_count(0)
    expect(
        page.locator("[data-gallery-shared-canvas]")
    ).to_have_attribute("data-gallery-stage-mounted", "false")
    expect(
        page.locator('[data-telemetry-active-exhibit="none"]')
    ).to_be_visible()

    gallery_exhibit_ids = (
        "prism-caustics",
        "laser-scan-hologram",
        "particle-morph",
        "plasma-reactor",
        "photonic-mesh",
        "orbital-lens",
        "quantum-lattice",
        "phase-torus",
    )
    set_gallery_exhibit(page, gallery_exhibit_ids[0])
    page.wait_for_function(
        """
        () => document.querySelector(
          '[data-gallery-shared-canvas]'
        )?.dataset.galleryStageMounted === 'true'
        """,
        timeout=10_000,
    )
    for exhibit_id in gallery_exhibit_ids:
        set_gallery_exhibit(page, exhibit_id)
        page.wait_for_timeout(180)
    set_gallery_exhibit(page, gallery_exhibit_ids[0])
    page.wait_for_timeout(500)
    page.evaluate("window.gc?.()")
    gallery_baseline = gallery_renderer_snapshot(page)
    assert gallery_baseline["geometries"] > 0, gallery_baseline

    for _ in range(2):
        for exhibit_id in gallery_exhibit_ids:
            set_gallery_exhibit(page, exhibit_id)
            page.wait_for_timeout(140)
    set_gallery_exhibit(page, gallery_exhibit_ids[0])
    page.wait_for_timeout(500)
    page.evaluate("window.gc?.()")
    after_gallery_cycles = gallery_renderer_snapshot(page)
    assert (
        after_gallery_cycles["geometries"]
        <= gallery_baseline["geometries"] + 4
    ), (gallery_baseline, after_gallery_cycles)
    assert (
        after_gallery_cycles["textures"]
        <= gallery_baseline["textures"] + 6
    ), (gallery_baseline, after_gallery_cycles)
    assert (
        after_gallery_cycles["programs"]
        <= gallery_baseline["programs"] + 20
    ), (gallery_baseline, after_gallery_cycles)
    set_gallery_exhibit(page, None)
    page.wait_for_timeout(500)
    expect(
        page.locator("[data-gallery-shared-canvas] canvas")
    ).to_have_count(0)
    expect(
        page.locator("[data-gallery-shared-canvas]")
    ).to_have_attribute("data-gallery-stage-mounted", "false")

    context.close()

    mobile = browser.new_context(
        viewport={"width": 390, "height": 844},
        device_scale_factor=1,
        is_mobile=True,
        has_touch=True,
    )
    mobile_page = mobile.new_page()
    attach_errors(mobile_page)
    mobile_page.goto(BASE_URL, wait_until="networkidle")
    expect(mobile_page.locator("h1")).to_be_visible()
    mobile_page.wait_for_timeout(700)
    mobile_scene = mobile_page.locator("[data-scene-canvas]")
    expect(mobile_scene).to_have_attribute(
        "data-postprocessing",
        "bloom-vignette",
    )
    expect(mobile_scene).to_have_attribute(
        "data-cursor-stardust-count",
        "2000",
    )
    expect(mobile_scene).to_have_attribute(
        "data-volumetric-dust-count",
        "750",
    )
    overflow = mobile_page.evaluate(
        "document.documentElement.scrollWidth - window.innerWidth"
    )
    assert overflow <= 1, overflow
    mobile_page.screenshot(
        path=output_dir / "mobile-reduced-postprocessing.png"
    )
    mobile.close()
    browser.close()

report = {
    "static": static_report,
    "desktopHighBaseline": baseline,
    "afterPresetCycles": after_preset_cycles,
    "afterMediumTierSwitch": medium_snapshot,
    "restoredHighTier": restored_high_snapshot,
    "afterTierCycles": after_tier_cycles,
    "darkroomAfterWarmup": gallery_baseline,
    "darkroomAfterExhibitCycles": after_gallery_cycles,
    "galleryActiveViews": {
        "gallery": gallery_views,
        "darkroom": darkroom_views,
    },
    "mediumBindings": {
        "flowParticles": 4000,
        "cursorParticles": 2000,
        "volumetricParticles": 750,
        "shaderPasses": 2,
        "chromaticAberration": False,
        "noise": False,
    },
}
(output_dir / "vram-report.json").write_text(
    json.dumps(report, indent=2),
    encoding="utf-8",
)

assert not console_errors, "\n".join(console_errors)
assert not page_errors, "\n".join(page_errors)
print(json.dumps(report, indent=2))
print(f"VRAM leak audit passed. Artifacts: {output_dir.resolve()}")
