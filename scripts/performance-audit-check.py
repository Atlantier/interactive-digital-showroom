import os
from pathlib import Path
import sys

from playwright.sync_api import expect, sync_playwright


BASE_URL = os.getenv("PERFORMANCE_BASE_URL", "http://127.0.0.1:5173")
artifact_dir = Path(
    sys.argv[1] if len(sys.argv) > 1 else "artifacts/performance-audit"
)
artifact_dir.mkdir(parents=True, exist_ok=True)

chrome_candidates = [
    Path("C:/Program Files/Google/Chrome/Application/chrome.exe"),
    Path("C:/Program Files (x86)/Google/Chrome/Application/chrome.exe"),
    Path("C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"),
]
chrome_path = next((path for path in chrome_candidates if path.exists()), None)

console_errors: list[str] = []
page_errors: list[str] = []


def attach_error_collection(page) -> None:
    page.on(
        "console",
        lambda message: (
            console_errors.append(message.text)
            if message.type == "error"
            else None
        ),
    )
    page.on("pageerror", lambda error: page_errors.append(str(error)))


def scroll_to(page, selector: str, progress: float = 0) -> None:
    page.evaluate(
        """
        ({ selector, progress }) => {
          const element = document.querySelector(selector)
          const bounds = element.getBoundingClientRect()
          const top = bounds.top + window.scrollY
          const distance = Math.max(0, element.offsetHeight - window.innerHeight)
          window.scrollTo(0, top + distance * progress)
        }
        """,
        {"selector": selector, "progress": progress},
    )


with sync_playwright() as playwright:
    browser = playwright.chromium.launch(
        headless=True,
        executable_path=str(chrome_path) if chrome_path else None,
        args=[
            "--enable-webgl",
            "--ignore-gpu-blocklist",
            "--use-angle=swiftshader",
        ],
    )

    desktop = browser.new_context(
        viewport={"width": 1440, "height": 900},
        device_scale_factor=1,
    )
    page = desktop.new_page()
    attach_error_collection(page)
    response = page.goto(BASE_URL, wait_until="networkidle")
    assert response is not None and response.ok
    page.wait_for_timeout(900)

    hero = page.locator("#home")
    scene_canvas = page.locator("[data-scene-canvas]")
    expect(hero).to_have_attribute("data-in-view-animation", "true")
    expect(scene_canvas).to_have_attribute("data-frameloop", "always")

    initial_tier = scene_canvas.get_attribute("data-performance-tier")
    initial_particles = int(
        scene_canvas.get_attribute("data-particle-count") or "0"
    )
    assert initial_particles in (4000, 8000), initial_particles
    bento_grid = page.locator("[data-bento-grid]")
    expect(bento_grid.get_by_text("99.99%", exact=True)).to_have_count(1)
    assert bento_grid.locator("svg.lucide-arrow-up-right").count() == 0

    if initial_tier == "high":
        expect(
            page.locator("[data-performance-quality-notice]")
        ).to_be_visible(timeout=8_000)
        expect(scene_canvas).to_have_attribute(
            "data-performance-tier", "medium"
        )
        expect(scene_canvas).to_have_attribute(
            "data-particle-count", "4000"
        )
        expect(scene_canvas).to_have_attribute(
            "data-cursor-stardust-count", "2000"
        )
        expect(scene_canvas).to_have_attribute(
            "data-volumetric-dust-count", "750"
        )
        expect(scene_canvas).to_have_attribute(
            "data-postprocessing", "bloom-vignette"
        )
        expect(scene_canvas).to_have_attribute(
            "data-shader-pass-count", "2"
        )
        print("Adaptive downgrade verified after sustained sub-45 FPS load.")

    page.keyboard.press("Shift+D")
    telemetry = page.locator("[data-telemetry-hud]")
    expect(telemetry).to_be_visible()
    page.wait_for_timeout(1_200)
    fps_text = page.locator("[data-telemetry-fps]").inner_text()
    frame_time_text = page.locator(
        "[data-telemetry-frame-time]"
    ).inner_text()
    active_particles = int(
        page.locator("[data-telemetry-particles]").inner_text().replace(
            ",", ""
        )
    )
    assert int(fps_text) > 0, fps_text
    assert float(frame_time_text) > 0, frame_time_text
    assert active_particles >= int(
        scene_canvas.get_attribute("data-particle-count") or "0"
    )
    assert int(
        page.locator("[data-telemetry-shader-passes]").inner_text()
    ) >= 2
    expect(page.locator("[data-telemetry-vfx-preset]")).to_have_attribute(
        "data-telemetry-vfx-preset",
        "emerald-cyber",
    )
    assert page.locator(
        "[data-telemetry-memory-path]"
    ).get_attribute("d")
    page.screenshot(path=artifact_dir / "telemetry-hud.png")

    telemetry.get_by_role(
        "button", name="Close performance telemetry panel"
    ).click()
    expect(telemetry).to_be_hidden()
    page.get_by_role(
        "button", name="Open performance telemetry panel"
    ).click()
    expect(telemetry).to_be_visible()
    telemetry.get_by_role(
        "button", name="Close performance telemetry panel"
    ).click()
    expect(telemetry).to_be_hidden()

    scroll_to(page, "[data-architecture-section]", 0.5)
    page.wait_for_timeout(700)
    expect(hero).to_have_attribute("data-in-view-animation", "false")
    expect(scene_canvas).to_have_attribute("data-frameloop", "demand")
    expect(page.locator("[data-architecture-sticky]")).to_have_attribute(
        "data-frameloop", "always"
    )
    page.keyboard.press("Shift+D")
    expect(telemetry).to_be_visible()
    page.wait_for_timeout(700)
    assert int(
        page.locator("[data-telemetry-shader-passes]").inner_text()
    ) >= 1
    telemetry.get_by_role(
        "button", name="Close performance telemetry panel"
    ).click()

    scroll_to(page, "#sandbox")
    page.wait_for_timeout(700)
    sandbox_stage = page.locator("[data-verlet-stage]")
    expect(sandbox_stage).to_have_attribute(
        "data-in-view-animation", "true"
    )
    page.keyboard.press("Shift+D")
    expect(telemetry).to_be_visible()
    page.wait_for_timeout(1_000)
    physics_time = float(
        page.locator("[data-telemetry-physics]").inner_text()
    )
    assert physics_time >= 0, physics_time
    telemetry.get_by_role(
        "button", name="Close performance telemetry panel"
    ).click()

    scroll_to(page, "#archive")
    page.wait_for_timeout(700)
    expect(sandbox_stage).to_have_attribute(
        "data-in-view-animation", "false"
    )

    scroll_to(page, "#kinetics")
    page.wait_for_timeout(700)
    fabrik_stage = page.locator("[data-fabrik-stage]")
    expect(fabrik_stage).to_have_attribute(
        "data-in-view-animation", "true"
    )
    page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
    page.wait_for_timeout(700)
    expect(fabrik_stage).to_have_attribute(
        "data-in-view-animation", "false"
    )
    expect(page.locator("[data-architecture-sticky]")).to_have_attribute(
        "data-frameloop", "demand"
    )
    desktop.close()

    four_k = browser.new_context(
        viewport={"width": 3840, "height": 2160},
        device_scale_factor=1,
    )
    page_4k = four_k.new_page()
    attach_error_collection(page_4k)
    response_4k = page_4k.goto(BASE_URL, wait_until="networkidle")
    assert response_4k is not None and response_4k.ok
    page_4k.wait_for_timeout(1_000)
    scene_4k = page_4k.locator("[data-scene-canvas]")
    expect(scene_4k).to_have_attribute(
        "data-performance-tier", "medium"
    )
    expect(scene_4k).to_have_attribute("data-particle-count", "4000")
    expect(scene_4k).to_have_attribute(
        "data-postprocessing", "bloom-vignette"
    )
    page_4k.screenshot(path=artifact_dir / "4k-medium-tier.png")
    four_k.close()

    for width, height, label in (
        (390, 844, "mobile-390"),
        (320, 720, "mobile-320"),
    ):
        mobile = browser.new_context(
            viewport={"width": width, "height": height},
            device_scale_factor=1,
            is_mobile=True,
            has_touch=True,
        )
        mobile_page = mobile.new_page()
        attach_error_collection(mobile_page)
        response_mobile = mobile_page.goto(
            BASE_URL, wait_until="networkidle"
        )
        assert response_mobile is not None and response_mobile.ok
        mobile_page.wait_for_timeout(700)
        overflow = mobile_page.evaluate(
            "document.documentElement.scrollWidth - window.innerWidth"
        )
        assert overflow <= 1, f"{label} horizontal overflow: {overflow}"
        mobile_scene = mobile_page.locator("[data-scene-canvas]")
        expect(mobile_scene).to_have_attribute(
            "data-cursor-stardust-count", "2000"
        )
        expect(mobile_scene).to_have_attribute(
            "data-volumetric-dust-count", "750"
        )
        expect(mobile_scene).to_have_attribute(
            "data-postprocessing", "bloom-vignette"
        )
        if width <= 359:
            mobile_page.get_by_role(
                "button", name="Open navigation menu"
            ).click()
        mobile_page.get_by_role(
            "button", name="Open performance telemetry panel"
        ).click()
        mobile_hud = mobile_page.locator("[data-telemetry-hud]")
        expect(mobile_hud).to_be_visible()
        hud_box = mobile_hud.bounding_box()
        assert hud_box
        assert hud_box["x"] >= 0
        assert hud_box["x"] + hud_box["width"] <= width + 1
        mobile_page.screenshot(
            path=artifact_dir / f"{label}-telemetry.png"
        )
        mobile.close()

    browser.close()

assert not console_errors, "\n".join(console_errors)
assert not page_errors, "\n".join(page_errors)
print(f"Performance audit passed. Artifacts: {artifact_dir.resolve()}")
