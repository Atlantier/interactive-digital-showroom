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
    }
    raf_cleanup = {
        "BentoGrid.tsx": "cancelAnimationFrame",
        "CardParticleCanvas.tsx": "cancelAnimationFrame",
        "FabrikCreature.tsx": "cancelAnimationFrame",
        "VerletLanyard.tsx": "cancelAnimationFrame",
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

    return {
        "disposeAuditedFiles": len(required_dispose),
        "rafAuditedFiles": len(raf_cleanup),
        "timerAuditedFiles": len(timer_cleanup),
        "eventAuditedFiles": len(event_cleanup),
        "canvasContextAuditedFiles": len(canvas_cleanup),
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

    for section_id in ("works", "architecture", "sandbox", "kinetics"):
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

    page.get_by_role("button", name="打开性能遥测面板").click()
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
