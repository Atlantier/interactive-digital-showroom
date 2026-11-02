import os
from pathlib import Path
import re
import sys

from playwright.sync_api import expect, sync_playwright


BASE_URL = os.getenv(
    "GALLERY_BASE_URL",
    "http://127.0.0.1:5173",
)
output_dir = Path(
    sys.argv[1] if len(sys.argv) > 1 else "artifacts/gallery"
)
if len(sys.argv) > 2:
    BASE_URL = sys.argv[2]
output_dir.mkdir(parents=True, exist_ok=True)

console_errors: list[str] = []
page_errors: list[str] = []
exhibit_chunk_requests: list[str] = []
chrome_candidates = [
    Path("C:/Program Files/Google/Chrome/Application/chrome.exe"),
    Path("C:/Program Files (x86)/Google/Chrome/Application/chrome.exe"),
    Path("C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"),
]
chrome_path = next(
    (candidate for candidate in chrome_candidates if candidate.exists()),
    None,
)


def collect_errors(page) -> None:
    page.on(
        "console",
        lambda message: (
            console_errors.append(message.text)
            if message.type == "error"
            else None
        ),
    )
    page.on("pageerror", lambda error: page_errors.append(str(error)))
    page.on(
        "request",
        lambda request: (
            exhibit_chunk_requests.append(request.url)
            if (
                "/exhibits/" in request.url
                or "Exhibit-" in request.url
            )
            and (
                request.url.endswith(".js")
                or request.url.endswith(".tsx")
            )
            else None
        ),
    )


def scroll_to_gallery(page) -> None:
    page.evaluate(
        """
        () => {
          const section = document.getElementById('gallery')
          window.scrollTo(
            0,
            section.getBoundingClientRect().top + window.scrollY - 76
          )
        }
        """
    )
    page.wait_for_timeout(900)


def set_range_value(locator, value: str) -> None:
    locator.evaluate(
        """
        (element, nextValue) => {
          const setter = Object.getOwnPropertyDescriptor(
            HTMLInputElement.prototype,
            'value'
          ).set
          setter.call(element, nextValue)
          element.dispatchEvent(new Event('input', { bubbles: true }))
          element.dispatchEvent(new Event('change', { bubbles: true }))
        }
        """,
        value,
    )


with sync_playwright() as playwright:
    browser = playwright.chromium.launch(
        headless=True,
        executable_path=str(chrome_path) if chrome_path else None,
    )
    desktop = browser.new_context(
        viewport={"width": 1440, "height": 1000},
        device_scale_factor=1,
        reduced_motion="no-preference",
    )
    page = desktop.new_page()
    collect_errors(page)
    response = page.goto(BASE_URL, wait_until="networkidle")
    assert response is not None and response.ok
    expect(page.locator('header nav a[href="#gallery"]')).to_be_visible()
    shared_canvas = page.locator("[data-gallery-shared-canvas]")
    expect(
        page.locator('[data-deferred-section="gallery"]')
    ).to_have_attribute("data-deferred-ready", "false")
    page.wait_for_timeout(300)
    expect(shared_canvas).to_have_count(0)

    scroll_to_gallery(page)
    gallery = page.locator("[data-gallery-section]")
    pedestals = page.locator("[data-exhibit-pedestal]")
    expect(gallery).to_be_visible()
    expect(pedestals).to_have_count(8)
    expect(shared_canvas.locator("canvas")).to_have_count(0)
    expect(shared_canvas).to_have_attribute(
        "data-gallery-stage-mounted",
        "false",
    )
    expect(shared_canvas).to_have_attribute(
        "data-gallery-view-count",
        "0",
    )
    expect(shared_canvas).to_have_attribute(
        "data-gallery-frameloop",
        "unmounted",
    )
    expect(page.locator("[data-exhibit-preview]")).to_have_count(8)
    assert not exhibit_chunk_requests, exhibit_chunk_requests

    first_stage = page.locator("[data-gallery-stage]").first
    first_stage.scroll_into_view_if_needed()
    page.wait_for_timeout(180)
    expect(
        page.locator('[data-preview-running="true"]')
    ).not_to_have_count(0)
    stage_box = first_stage.bounding_box()
    assert stage_box
    test_pointer = {
        "x": stage_box["x"] + stage_box["width"] * 0.72,
        "y": stage_box["y"] + stage_box["height"] * 0.34,
    }
    page.screenshot(path=output_dir / "gallery-prism-stage.png")
    pointer_target = page.evaluate(
        """
        ({ x, y }) => {
          const target = document.elementFromPoint(x, y)
          return {
            tag: target?.tagName,
            className:
              target instanceof HTMLElement
                ? target.className
                : null,
            insideStage: Boolean(
              target?.closest("[data-gallery-stage]")
            ),
          }
        }
        """,
        test_pointer,
    )
    assert pointer_target["insideStage"], pointer_target
    page.mouse.move(test_pointer["x"], test_pointer["y"])
    page.wait_for_timeout(180)
    pointer_u = float(
        first_stage.get_attribute("data-gallery-pointer-u") or "0"
    )
    pointer_v = float(
        first_stage.get_attribute("data-gallery-pointer-v") or "0"
    )
    assert abs(pointer_u) > 0.2, pointer_u
    assert abs(pointer_v) > 0.15, pointer_v
    page.screenshot(path=output_dir / "gallery-desktop.png")

    page.locator("[data-enter-darkroom]").first.click()
    modal = page.locator("[data-darkroom-inspector]")
    expect(modal).to_be_visible()
    page.wait_for_function(
        """
        () => document.querySelector(
          '[data-gallery-shared-canvas]'
        )?.dataset.galleryStageMounted === 'true'
        """,
        timeout=10_000,
    )
    expect(shared_canvas.locator("canvas")).to_have_count(1)
    expect(shared_canvas).to_have_attribute(
        "data-gallery-view-count",
        "1",
    )
    page.wait_for_timeout(1_000)
    assert any(
        "PrismCausticsExhibit" in request
        for request in exhibit_chunk_requests
    ), exhibit_chunk_requests
    unexpected_exhibit_chunks = [
        request
        for request in exhibit_chunk_requests
        if "PrismCausticsExhibit" not in request
    ]
    assert not unexpected_exhibit_chunks, unexpected_exhibit_chunks
    page.evaluate(
        """
        () => {
          window.__galleryContextLosses = 0
          const canvas = document.querySelector(
            '[data-gallery-shared-canvas] canvas'
          )
          canvas?.addEventListener('webglcontextlost', (event) => {
            event.preventDefault()
            window.__galleryContextLosses += 1
          })
        }
        """
    )
    expect(shared_canvas).to_have_attribute(
        "data-gallery-canvas-mode",
        "darkroom",
    )
    page.wait_for_function(
        """
        () => document.querySelector(
          '[data-gallery-shared-canvas]'
        )?.dataset.prismCaustics === 'voronoi-rgb'
        """,
        timeout=20_000,
    )
    expect(shared_canvas).to_have_attribute(
        "data-prism-caustics",
        "voronoi-rgb",
    )
    expect(shared_canvas).to_have_attribute(
        "data-prism-spectral-beams",
        "7",
    )
    expect(shared_canvas).to_have_attribute(
        "data-prism-spectral-dust",
        "112",
    )
    expect(shared_canvas).to_have_attribute(
        "data-prism-receiver-screen",
        "curved",
    )
    expect(shared_canvas).to_have_attribute(
        "data-prism-tir",
        "false",
    )
    expect(shared_canvas).to_have_attribute(
        "data-prism-critical-angle",
        "24.6",
    )
    expect(page.locator("[data-darkroom-control]")).to_have_count(4)
    expect(
        page.locator('[data-darkroom-control="dispersion"]')
    ).to_be_visible()
    expect(
        page.locator('[data-darkroom-control="incidence"]')
    ).to_be_visible()
    darkroom_shape_selector = page.locator(
        "[data-darkroom-prism-shape] [data-prism-shape-switcher]"
    )
    expect(darkroom_shape_selector).to_be_visible()
    expect(
        darkroom_shape_selector.locator("[data-prism-shape-option]")
    ).to_have_count(3)
    darkroom_shape_selector.locator(
        '[data-prism-shape-option="prism"]'
    ).click()
    expect(shared_canvas).to_have_attribute(
        "data-prism-shape",
        "prism",
    )
    emitter_drag = page.locator(
        "[data-darkroom-viewport] [data-prism-emitter-drag]"
    )
    emitter_box = emitter_drag.bounding_box()
    assert emitter_box
    emitter_center = {
        "x": emitter_box["x"] + emitter_box["width"] * 0.5,
        "y": emitter_box["y"] + emitter_box["height"] * 0.58,
    }
    page.mouse.move(emitter_center["x"], emitter_center["y"])
    page.mouse.down()
    page.mouse.move(
        emitter_center["x"],
        emitter_center["y"] - 110,
        steps=10,
    )
    page.mouse.up()
    page.wait_for_timeout(160)
    expect(shared_canvas).to_have_attribute(
        "data-prism-tir",
        "true",
    )
    expect(
        modal.locator("[data-prism-tir-indicator]")
    ).to_contain_text("TOTAL INTERNAL REFLECTION")
    page.screenshot(path=output_dir / "darkroom-tir.png")

    crystal_drag = page.locator(
        "[data-darkroom-viewport] [data-prism-crystal-drag]"
    )
    crystal_box = crystal_drag.bounding_box()
    assert crystal_box
    pose_before = (
        crystal_drag.get_attribute("data-prism-pose-x"),
        crystal_drag.get_attribute("data-prism-pose-y"),
    )
    page.mouse.move(
        crystal_box["x"] + crystal_box["width"] * 0.5,
        crystal_box["y"] + crystal_box["height"] * 0.5,
    )
    page.mouse.down()
    page.mouse.move(
        crystal_box["x"] + crystal_box["width"] * 0.68,
        crystal_box["y"] + crystal_box["height"] * 0.36,
        steps=8,
    )
    page.mouse.up()
    page.wait_for_timeout(120)
    pose_after = (
        crystal_drag.get_attribute("data-prism-pose-x"),
        crystal_drag.get_attribute("data-prism-pose-y"),
    )
    assert pose_before != pose_after, (pose_before, pose_after)

    incidence_control = page.locator(
        '[data-darkroom-param="incidence"]'
    )
    set_range_value(incidence_control, "18")
    expect(shared_canvas).to_have_attribute(
        "data-prism-tir",
        "false",
    )
    page.wait_for_timeout(900)
    assert int(page.locator("[data-darkroom-fps]").inner_text()) > 0
    assert re.search(
        r"\de[+-]\d+",
        page.locator("[data-darkroom-photon-flux]").inner_text(),
    )

    spectral_bar = page.locator("[data-spectral-wavelength-bar]")
    expect(spectral_bar).to_be_visible()
    expect(page.locator("[data-darkroom-preset]")).to_have_count(3)
    wavelength_picker = page.locator("[data-darkroom-wavelength]")
    expect(wavelength_picker).to_have_attribute("min", "380")
    expect(wavelength_picker).to_have_attribute("max", "750")

    mapped_colors = [
        {"wavelength": 380, "rgb": {"r": 90, "g": 0, "b": 90}},
        {"wavelength": 532, "rgb": {"r": 99, "g": 255, "b": 0}},
        {"wavelength": 750, "rgb": {"r": 90, "g": 0, "b": 0}},
    ]
    assert (
        mapped_colors[0]["rgb"]["b"]
        >= mapped_colors[0]["rgb"]["r"]
        > 0
    )
    assert mapped_colors[1]["rgb"]["g"] > mapped_colors[1]["rgb"]["r"]
    assert mapped_colors[2]["rgb"]["r"] > mapped_colors[2]["rgb"]["b"]

    set_range_value(wavelength_picker, "380")
    expect(spectral_bar).to_have_attribute(
        "data-laser-wavelength",
        "380",
    )
    expect(spectral_bar).to_have_attribute(
        "data-laser-color",
        "rgb({r}, {g}, {b})".format(**mapped_colors[0]["rgb"]),
    )
    set_range_value(wavelength_picker, "750")
    expect(spectral_bar).to_have_attribute(
        "data-laser-wavelength",
        "750",
    )
    expect(spectral_bar).to_have_attribute(
        "data-laser-color",
        "rgb({r}, {g}, {b})".format(**mapped_colors[2]["rgb"]),
    )
    page.screenshot(path=output_dir / "darkroom-spectrum-ir.png")

    set_range_value(wavelength_picker, "532")
    wavelength_picker.focus()
    active_before_slider_key = page.locator(
        "[data-darkroom-viewport]"
    ).get_attribute("data-darkroom-active-exhibit")
    page.keyboard.press("ArrowRight")
    expect(wavelength_picker).to_have_value("533")
    expect(page.locator("[data-darkroom-viewport]")).to_have_attribute(
        "data-darkroom-active-exhibit",
        active_before_slider_key,
    )
    page.evaluate("document.activeElement.blur()")

    active_before_key = page.locator(
        "[data-darkroom-viewport]"
    ).get_attribute("data-darkroom-active-exhibit")
    page.keyboard.press("ArrowRight")
    expect(modal.get_by_role("heading", level=2)).to_contain_text(
        "Laser Scan Hologram"
    )
    expect(shared_canvas).to_have_attribute(
        "data-laser-scan-hologram",
        "quad-state",
    )
    expect(shared_canvas).to_have_attribute(
        "data-hologram-scan-beams",
        "4",
    )
    expect(shared_canvas).to_have_attribute(
        "data-hologram-shader-states",
        "void,plasma,wireframe,formed",
    )
    expect(shared_canvas).to_have_attribute(
        "data-hologram-model",
        "gyro-core",
    )
    scan_y_before = shared_canvas.get_attribute(
        "data-hologram-scan-y"
    )
    page.wait_for_timeout(220)
    scan_y_after = shared_canvas.get_attribute(
        "data-hologram-scan-y"
    )
    assert scan_y_before != scan_y_after, (
        scan_y_before,
        scan_y_after,
    )
    hologram_viewport = page.locator("[data-darkroom-viewport]")
    hologram_box = hologram_viewport.bounding_box()
    assert hologram_box
    page.mouse.move(
        hologram_box["x"] + hologram_box["width"] * 0.48,
        hologram_box["y"] + hologram_box["height"] * 0.24,
    )
    page.wait_for_timeout(180)
    expect(shared_canvas).to_have_attribute(
        "data-hologram-scan-mode",
        "manual",
    )
    manual_scan_top = float(
        shared_canvas.get_attribute("data-hologram-scan-y") or "0"
    )
    page.mouse.move(
        hologram_box["x"] + hologram_box["width"] * 0.48,
        hologram_box["y"] + hologram_box["height"] * 0.76,
        steps=8,
    )
    page.wait_for_timeout(180)
    manual_scan_bottom = float(
        shared_canvas.get_attribute("data-hologram-scan-y") or "0"
    )
    assert manual_scan_top > manual_scan_bottom, (
        manual_scan_top,
        manual_scan_bottom,
    )
    page.screenshot(path=output_dir / "darkroom-hologram-slice.png")

    page.mouse.move(1280, 260)
    page.wait_for_timeout(520)
    expect(shared_canvas).to_have_attribute(
        "data-hologram-scan-mode",
        "auto",
    )

    glitch_pulse_before = shared_canvas.get_attribute(
        "data-hologram-glitch-pulse"
    )
    page.mouse.click(
        hologram_box["x"] + hologram_box["width"] * 0.45,
        hologram_box["y"] + hologram_box["height"] * 0.55,
    )
    expect(shared_canvas).not_to_have_attribute(
        "data-hologram-glitch-pulse",
        glitch_pulse_before or "",
    )
    page.wait_for_function(
        """
        () => document.querySelector(
          "[data-gallery-shared-canvas]"
        )?.dataset.hologramGlitch === "true"
        """,
        timeout=1_500,
    )
    page.screenshot(path=output_dir / "darkroom-hologram-glitch.png")

    hologram_selector = page.locator(
        "[data-darkroom-hologram-model] "
        "[data-hologram-model-switcher]"
    )
    expect(hologram_selector).to_be_visible()
    expect(
        hologram_selector.locator("[data-hologram-model-option]")
    ).to_have_count(3)
    hologram_selector.locator(
        '[data-hologram-model-option="cyber-skull"]'
    ).click()
    expect(shared_canvas).to_have_attribute(
        "data-hologram-model",
        "cyber-skull",
    )
    expect(hologram_selector).to_have_attribute(
        "data-hologram-model-active",
        "cyber-skull",
    )
    expect(
        hologram_selector.locator(
            '[data-hologram-model-option="cyber-skull"]'
        )
    ).to_have_attribute("aria-pressed", "true")
    page.wait_for_timeout(180)
    page.screenshot(path=output_dir / "darkroom-hologram.png")
    page.keyboard.press("ArrowLeft")
    expect(modal.get_by_role("heading", level=2)).to_contain_text(
        "Prism Caustics"
    )
    active_after_key = page.locator(
        "[data-darkroom-viewport]"
    ).get_attribute("data-darkroom-active-exhibit")
    assert active_before_key == active_after_key

    preset_group = page.locator("[data-darkroom-active-preset]").last
    page.locator('[data-darkroom-preset="overdrive"]').click()
    expect(preset_group).to_have_attribute(
        "data-darkroom-active-preset",
        "overdrive",
    )
    expect(page.locator("[data-darkroom-timescale]")).to_have_value(
        "1.65"
    )
    expect(spectral_bar).to_have_attribute(
        "data-laser-wavelength",
        "680",
    )
    expect(
        page.locator('[data-darkroom-control="dispersion"]')
    ).to_have_attribute("data-darkroom-value", "2.18")
    page.screenshot(path=output_dir / "darkroom-overdrive.png")

    page.locator('[data-darkroom-preset="analysis"]').click()
    expect(preset_group).to_have_attribute(
        "data-darkroom-active-preset",
        "analysis",
    )
    expect(page.locator("[data-darkroom-timescale]")).to_have_value(
        "0.16"
    )
    expect(spectral_bar).to_have_attribute(
        "data-laser-wavelength",
        "450",
    )

    page.locator('[data-darkroom-preset="standard"]').click()
    expect(preset_group).to_have_attribute(
        "data-darkroom-active-preset",
        "standard",
    )
    expect(page.locator("[data-darkroom-timescale]")).to_have_value(
        "1"
    )
    expect(spectral_bar).to_have_attribute(
        "data-laser-wavelength",
        "532",
    )

    darkroom_stage = page.locator("[data-darkroom-viewport]")
    darkroom_box = darkroom_stage.bounding_box()
    assert darkroom_box
    yaw_before = shared_canvas.get_attribute("data-gallery-camera-yaw")
    page.mouse.move(
        darkroom_box["x"] + darkroom_box["width"] * 0.82,
        darkroom_box["y"] + darkroom_box["height"] * 0.76,
    )
    page.mouse.down()
    page.mouse.move(
        darkroom_box["x"] + darkroom_box["width"] * 0.67,
        darkroom_box["y"] + darkroom_box["height"] * 0.58,
        steps=8,
    )
    page.mouse.up()
    page.wait_for_timeout(220)
    yaw_after = shared_canvas.get_attribute("data-gallery-camera-yaw")
    assert yaw_before != yaw_after, (yaw_before, yaw_after)

    pan_before = darkroom_stage.get_attribute("data-camera-pan-x")
    page.mouse.move(
        darkroom_box["x"] + darkroom_box["width"] * 0.8,
        darkroom_box["y"] + darkroom_box["height"] * 0.7,
    )
    page.mouse.down(button="right")
    page.mouse.move(
        darkroom_box["x"] + darkroom_box["width"] * 0.66,
        darkroom_box["y"] + darkroom_box["height"] * 0.63,
        steps=6,
    )
    page.mouse.up(button="right")
    page.wait_for_timeout(120)
    pan_after = darkroom_stage.get_attribute("data-camera-pan-x")
    assert pan_before != pan_after, (pan_before, pan_after)

    distance_before = shared_canvas.get_attribute(
        "data-gallery-camera-distance"
    )
    page.mouse.move(
        darkroom_box["x"] + darkroom_box["width"] * 0.5,
        darkroom_box["y"] + darkroom_box["height"] * 0.5,
    )
    page.mouse.wheel(0, 240)
    page.wait_for_timeout(180)
    distance_after = shared_canvas.get_attribute(
        "data-gallery-camera-distance"
    )
    assert distance_before != distance_after, (
        distance_before,
        distance_after,
    )

    dispersion = page.locator('[data-darkroom-param="dispersion"]')
    set_range_value(dispersion, "2.2")
    expect(dispersion).to_have_value("2.2")
    expect(
        page.locator('[data-darkroom-control="dispersion"]')
    ).to_have_attribute("data-darkroom-value", "2.20")
    expect(shared_canvas).to_have_attribute(
        "data-prism-dispersion",
        "2.20",
    )
    modal.get_by_role(
        "button", name="Reset current exhibit parameters"
    ).click()
    expect(
        page.locator('[data-darkroom-control="dispersion"]')
    ).to_have_attribute("data-darkroom-value", "1.60")

    modal.get_by_role("button", name="Next optical exhibit").click()
    expect(modal.get_by_role("heading", level=2)).to_contain_text(
        "Laser Scan Hologram"
    )
    expect(page.locator("[data-darkroom-control]")).to_have_count(4)
    visited_headings = {
        modal.get_by_role("heading", level=2).inner_text()
    }
    for _ in range(7):
        modal.get_by_role("button", name="Next optical exhibit").click()
        page.wait_for_timeout(80)
        visited_headings.add(
            modal.get_by_role("heading", level=2).inner_text()
        )
        expected_control_count = (
            3
            if "Ray Bounce Maze"
            in modal.get_by_role("heading", level=2).inner_text()
            else 4
        )
        expect(page.locator("[data-darkroom-control]")).to_have_count(
            expected_control_count
        )
    assert len(visited_headings) == 8, visited_headings
    page.screenshot(path=output_dir / "darkroom-desktop.png")

    page.keyboard.press("Escape")
    expect(modal).to_be_hidden()
    expect(shared_canvas).to_have_attribute(
        "data-gallery-canvas-mode",
        "gallery",
    )
    expect(shared_canvas).to_have_attribute(
        "data-gallery-stage-mounted",
        "false",
    )
    expect(shared_canvas.locator("canvas")).to_have_count(0)

    stage_shape_selector = page.locator(
        '[data-exhibit-pedestal][data-exhibit-index="0"] '
        "[data-prism-shape-switcher]"
    )
    expect(stage_shape_selector).to_be_visible()
    stage_shape_selector.locator(
        '[data-prism-shape-option="octahedron"]'
    ).click()
    expect(stage_shape_selector).to_have_attribute(
        "data-prism-shape-active",
        "octahedron",
    )
    expect(
        page.locator(
            '[data-exhibit-pedestal][data-exhibit-index="0"] '
            "[data-prism-emitter-drag]"
        )
    ).to_have_count(0)

    stage_particle_preview = page.locator(
        '[data-exhibit-pedestal][data-exhibit-index="2"] '
        "[data-exhibit-preview]"
    )
    expect(stage_particle_preview).to_have_count(1)
    particle_quick = page.locator(
        '[data-exhibit-pedestal][data-exhibit-index="2"] '
        "[data-particle-quick-controls]"
    )
    particle_quick.scroll_into_view_if_needed()
    expect(particle_quick).to_be_visible()
    particle_quick_selector = particle_quick.locator(
        "[data-particle-manifold-switcher]"
    )
    expect(
        particle_quick_selector.locator(
            "[data-particle-manifold-option]"
        )
    ).to_have_count(5)
    particle_quick_selector.locator(
        '[data-particle-manifold-option="wafer-city"]'
    ).click()
    expect(particle_quick_selector).to_have_attribute(
        "data-particle-manifold-active",
        "wafer-city",
    )

    particle_enter = page.locator(
        '[data-enter-darkroom="particle-morph"]'
    )
    particle_enter.scroll_into_view_if_needed()
    particle_enter.click()
    expect(modal).to_be_visible()
    expect(modal.get_by_role("heading", level=2)).to_contain_text(
        "Particle Morph"
    )
    expect(shared_canvas).to_have_attribute(
        "data-particle-morph",
        "gpu-curl-morph",
    )
    expect(shared_canvas).to_have_attribute(
        "data-particle-morph-shader",
        "aPositionA,aPositionB,curl-noise",
    )
    expect(shared_canvas).to_have_attribute(
        "data-particle-morph-count",
        "20000",
    )
    expect(shared_canvas).to_have_attribute(
        "data-particle-morph-targets",
        "5",
    )
    expect(shared_canvas).to_have_attribute(
        "data-particle-force",
        "gravity-supernova",
    )
    expect(
        page.locator("[data-darkroom-viewport]")
    ).to_have_attribute(
        "data-particle-force-control",
        "hold-left-alt-orbit",
    )
    particle_selector = page.locator(
        "[data-darkroom-particle-manifold] "
        "[data-particle-manifold-switcher]"
    )
    expect(particle_selector).to_be_visible()
    expect(
        particle_selector.locator(
            "[data-particle-manifold-option]"
        )
    ).to_have_count(5)
    particle_selector.locator(
        '[data-particle-manifold-option="double-helix"]'
    ).click()
    expect(shared_canvas).to_have_attribute(
        "data-particle-manifold",
        "double-helix",
    )
    expect(shared_canvas).to_have_attribute(
        "data-particle-morph-state",
        "morphing",
    )
    page.wait_for_timeout(560)
    morph_progress = float(
        shared_canvas.get_attribute(
            "data-particle-morph-progress"
        )
        or "0"
    )
    assert 0.2 <= morph_progress <= 0.85, morph_progress
    morph_uniform = float(
        shared_canvas.get_attribute(
            "data-particle-morph-uniform"
        )
        or "0"
    )
    assert abs(morph_uniform - morph_progress) <= 0.011, (
        morph_progress,
        morph_uniform,
    )
    expect(shared_canvas).to_have_attribute(
        "data-particle-morph-state",
        "morphing",
    )
    page.screenshot(
        path=output_dir / "darkroom-particle-morph-storm.png"
    )
    page.wait_for_timeout(890)
    expect(shared_canvas).to_have_attribute(
        "data-particle-morph-progress",
        "1.000",
    )
    expect(shared_canvas).to_have_attribute(
        "data-particle-morph-state",
        "formed",
    )
    page.screenshot(path=output_dir / "darkroom-particle-morph.png")

    particle_viewport = page.locator("[data-darkroom-viewport]")
    particle_viewport_box = particle_viewport.bounding_box()
    assert particle_viewport_box
    force_x = (
        particle_viewport_box["x"] +
        particle_viewport_box["width"] * 0.54
    )
    force_y = (
        particle_viewport_box["y"] +
        particle_viewport_box["height"] * 0.47
    )
    yaw_before_force = shared_canvas.get_attribute(
        "data-gallery-camera-yaw"
    )
    page.mouse.move(force_x, force_y)
    page.mouse.down()
    expect(shared_canvas).to_have_attribute(
        "data-particle-force-state",
        "accreting",
    )
    force_charge = float(
        shared_canvas.get_attribute(
            "data-particle-force-charge"
        )
        or "0"
    )
    force_uniform = float(
        shared_canvas.get_attribute(
            "data-particle-force-uniform"
        )
        or "0"
    )
    assert force_charge >= 0.9, force_charge
    assert abs(force_uniform - force_charge) <= 0.011, (
        force_charge,
        force_uniform,
    )
    assert float(
        shared_canvas.get_attribute("data-particle-force-x") or "0"
    ) != 0
    yaw_after_force = shared_canvas.get_attribute(
        "data-gallery-camera-yaw"
    )
    assert yaw_before_force == yaw_after_force, (
        yaw_before_force,
        yaw_after_force,
    )
    page.screenshot(
        path=output_dir / "darkroom-particle-accretion.png"
    )
    page.mouse.up()
    expect(shared_canvas).to_have_attribute(
        "data-particle-force-state",
        "supernova",
    )
    shock_progress = float(
        shared_canvas.get_attribute(
            "data-particle-shock-progress"
        )
        or "0"
    )
    assert 0 < shock_progress < 0.4, shock_progress
    page.screenshot(
        path=output_dir / "darkroom-particle-supernova.png"
    )
    page.wait_for_timeout(2_100)
    expect(shared_canvas).to_have_attribute(
        "data-particle-force-state",
        "idle",
    )
    expect(shared_canvas).to_have_attribute(
        "data-particle-force-charge",
        "0.000",
    )
    expect(shared_canvas).to_have_attribute(
        "data-particle-shock-progress",
        "1.000",
    )
    yaw_before_alt_orbit = shared_canvas.get_attribute(
        "data-gallery-camera-yaw"
    )
    page.keyboard.down("Alt")
    page.mouse.move(force_x, force_y)
    page.mouse.down()
    page.mouse.move(force_x + 36, force_y - 18, steps=6)
    page.mouse.up()
    page.keyboard.up("Alt")
    page.wait_for_timeout(180)
    yaw_after_alt_orbit = shared_canvas.get_attribute(
        "data-gallery-camera-yaw"
    )
    assert yaw_before_alt_orbit != yaw_after_alt_orbit, (
        yaw_before_alt_orbit,
        yaw_after_alt_orbit,
    )
    expect(shared_canvas).to_have_attribute(
        "data-particle-force-state",
        "idle",
    )

    modal.get_by_role(
        "button", name="Next optical exhibit"
    ).click()
    expect(modal.get_by_role("heading", level=2)).to_contain_text(
        "Plasma Reactor"
    )
    expect(shared_canvas).to_have_attribute(
        "data-plasma-reactor",
        "hybrid-core",
    )
    expect(shared_canvas).to_have_attribute(
        "data-plasma-core-shader",
        "turbulence-fbm-fusion-spectrum",
    )
    expect(shared_canvas).to_have_attribute(
        "data-plasma-core-layers",
        "3",
    )
    expect(shared_canvas).to_have_attribute(
        "data-plasma-gimbal-rings",
        "3",
    )
    expect(shared_canvas).to_have_attribute(
        "data-plasma-arc-mode",
        "fractal-midpoint-displacement",
    )
    expect(shared_canvas).to_have_attribute(
        "data-plasma-arc-count",
        "10",
    )
    expect(shared_canvas).to_have_attribute(
        "data-plasma-shield",
        "hex-fbm-scan",
    )
    expect(page.locator("[data-darkroom-control]")).to_have_count(4)
    arc_control = page.locator(
        '[data-darkroom-param="arcCount"]'
    )
    expect(arc_control).to_have_value("10")
    set_range_value(arc_control, "12")
    expect(shared_canvas).to_have_attribute(
        "data-plasma-arc-count",
        "12",
    )
    expect(
        page.locator('[data-darkroom-control="temperature"]')
    ).to_have_attribute("data-darkroom-value", "92")
    expect(
        page.locator('[data-reactor-overdrive-variant="panel"]')
    ).to_be_visible()
    expect(
        page.locator('[data-reactor-overdrive-variant="stage"]')
    ).to_have_count(1)
    modal.get_by_role(
        "button", name="Reset darkroom camera"
    ).click()
    expect(
        page.locator("[data-darkroom-viewport]")
    ).to_have_attribute("data-camera-pan-x", "0.0000")
    page.wait_for_timeout(520)
    assert int(
        shared_canvas.get_attribute("data-plasma-arc-updates") or "0"
    ) > 0
    page.screenshot(
        path=output_dir / "darkroom-plasma-reactor.png"
    )
    plasma_viewport = page.locator("[data-darkroom-viewport]")
    plasma_box = plasma_viewport.bounding_box()
    assert plasma_box
    shield_hit_x = (
        plasma_box["x"] + plasma_box["width"] * 0.38
    )
    shield_hit_y = (
        plasma_box["y"] + plasma_box["height"] * 0.45
    )
    shield_hits_before = int(
        shared_canvas.get_attribute("data-plasma-shield-hits")
        or "0"
    )
    page.mouse.move(shield_hit_x, shield_hit_y)
    page.wait_for_timeout(220)
    shield_hits_hover = int(
        shared_canvas.get_attribute("data-plasma-shield-hits")
        or "0"
    )
    assert shield_hits_hover > shield_hits_before
    page.mouse.click(
        shield_hit_x + 12,
        shield_hit_y + 8,
    )
    expect(shared_canvas).not_to_have_attribute(
        "data-plasma-shield-hits",
        str(shield_hits_hover),
    )
    assert float(
        shared_canvas.get_attribute(
            "data-plasma-ripple-strength"
        )
        or "0"
    ) >= 0.9
    assert (
        shared_canvas.get_attribute("data-plasma-ripple-origin")
        or ""
    ).count(",") == 2
    page.wait_for_timeout(180)
    page.screenshot(
        path=output_dir / "darkroom-plasma-shield-ripple.png"
    )

    overdrive_button = page.locator(
        '[data-darkroom-reactor-overdrive] '
        "[data-reactor-overdrive]"
    )
    overdrive_button.click()
    expect(shared_canvas).to_have_attribute(
        "data-plasma-overdrive-phase",
        "charging",
    )
    expect(shared_canvas).to_have_attribute(
        "data-plasma-arc-count",
        "24",
    )
    expect(
        page.locator(
            '[data-reactor-overdrive-variant="panel"]'
        )
    ).to_have_attribute("data-reactor-overdrive-phase", "charging")
    expect(
        page.locator(
            '[data-reactor-overdrive-variant="stage"]'
        )
    ).to_have_attribute("data-reactor-overdrive-phase", "charging")
    assert float(
        shared_canvas.get_attribute("data-plasma-ring-speed")
        or "1"
    ) > 1
    page.wait_for_timeout(520)
    page.screenshot(
        path=output_dir / "darkroom-plasma-overdrive-charge.png"
    )
    page.wait_for_function(
        """
        () => document.querySelector(
          "[data-gallery-shared-canvas]"
        )?.dataset.plasmaOverdrivePhase === "shockwave"
        """,
        timeout=3_000,
    )
    page.wait_for_function(
        """
        () => {
          const value = Number.parseFloat(
            document.querySelector(
              '[data-gallery-shared-canvas]'
            )?.dataset.plasmaShockProgress ?? '0'
          )
          return value > 0 && value < 0.65
        }
        """,
        timeout=2_000,
    )
    shock_progress = float(
        shared_canvas.get_attribute(
            "data-plasma-shock-progress"
        )
        or "0"
    )
    assert 0 < shock_progress < 0.65, shock_progress
    expect(shared_canvas).to_have_attribute(
        "data-plasma-ring-speed",
        "4.00",
    )
    expect(shared_canvas).to_have_attribute(
        "data-plasma-arc-count",
        "24",
    )
    expect(
        page.locator(
            '[data-reactor-overdrive-variant="panel"]'
        )
    ).to_have_attribute("data-reactor-overdrive-phase", "shockwave")
    expect(
        page.locator(
            '[data-reactor-overdrive-variant="stage"]'
        )
    ).to_have_attribute("data-reactor-overdrive-phase", "shockwave")
    page.screenshot(
        path=output_dir / "darkroom-plasma-overdrive-shockwave.png"
    )
    page.wait_for_function(
        """
        () => document.querySelector(
          '[data-reactor-overdrive-variant="panel"]'
        )?.dataset.reactorOverdrivePhase === "cooldown"
        """,
        timeout=3_000,
    )
    expect(
        page.locator(
            '[data-reactor-overdrive-variant="stage"]'
        )
    ).to_have_attribute("data-reactor-overdrive-phase", "cooldown")
    page.keyboard.press("Escape")
    expect(modal).to_be_hidden()

    particle_stage = page.locator(
        '[data-exhibit-pedestal][data-exhibit-index="2"] '
        "[data-gallery-stage]"
    )
    particle_stage.scroll_into_view_if_needed()
    particle_preview = particle_stage.locator(
        "[data-exhibit-preview]"
    )
    expect(particle_preview).to_have_attribute(
        "data-preview-running",
        "true",
    )
    expect(shared_canvas).to_have_attribute(
        "data-gallery-stage-mounted",
        "false",
    )
    expect(shared_canvas.locator("canvas")).to_have_count(0)

    time_scale = page.locator("[data-gallery-timescale]")
    set_range_value(time_scale, "0.35")
    expect(gallery).to_have_attribute(
        "data-gallery-timescale-value",
        "0.35",
    )

    tour_toggle = page.locator("[data-gallery-tour-toggle]")
    tour_toggle.click()
    expect(gallery).to_have_attribute(
        "data-gallery-tour-active",
        "true",
    )
    first_tour_index = gallery.get_attribute("data-gallery-tour-index")
    page.wait_for_function(
        """
        (initialIndex) => document.querySelector(
          '[data-gallery-section]'
        )?.dataset.galleryTourIndex !== initialIndex
        """,
        arg=first_tour_index,
        timeout=7_500,
    )
    second_tour_index = gallery.get_attribute("data-gallery-tour-index")
    assert first_tour_index != second_tour_index, (
        first_tour_index,
        second_tour_index,
    )
    tour_toggle.click()

    context_losses = page.evaluate("window.__galleryContextLosses")
    assert context_losses >= 1, context_losses
    desktop.close()

    mobile = browser.new_context(
        viewport={"width": 390, "height": 844},
        device_scale_factor=1,
        is_mobile=True,
        has_touch=True,
    )
    mobile_page = mobile.new_page()
    collect_errors(mobile_page)
    mobile_response = mobile_page.goto(
        BASE_URL,
        wait_until="networkidle",
    )
    assert mobile_response is not None and mobile_response.ok
    mobile_page.get_by_role(
        "button", name="Open navigation menu"
    ).click()
    mobile_gallery_link = mobile_page.locator(
        '#mobile-navigation a[href="#gallery"]'
    )
    expect(mobile_gallery_link).to_be_visible()
    mobile_gallery_link.click()
    mobile_page.wait_for_timeout(1_000)

    expect(mobile_page.locator("[data-exhibit-pedestal]")).to_have_count(8)
    expect(
        mobile_page.locator("[data-gallery-shared-canvas] canvas")
    ).to_have_count(0)
    expect(
        mobile_page.locator("[data-exhibit-preview]")
    ).to_have_count(8)
    overflow = mobile_page.evaluate(
        "document.documentElement.scrollWidth - window.innerWidth"
    )
    assert overflow <= 1, overflow
    mobile_page.screenshot(path=output_dir / "gallery-mobile.png")

    mobile_button = mobile_page.locator(
        "[data-enter-darkroom]"
    ).first
    mobile_button.scroll_into_view_if_needed()
    mobile_button.click()
    mobile_modal = mobile_page.locator("[data-darkroom-inspector]")
    expect(mobile_modal).to_be_visible()
    mobile_page.wait_for_function(
        """
        () => document.querySelector(
          '[data-gallery-shared-canvas]'
        )?.dataset.galleryStageMounted === 'true'
        """,
        timeout=10_000,
    )
    expect(
        mobile_page.locator("[data-gallery-shared-canvas] canvas")
    ).to_have_count(1)
    expect(
        mobile_page.locator("[data-spectral-wavelength-bar]")
    ).to_be_visible()
    expect(mobile_page.locator("[data-darkroom-preset]")).to_have_count(3)
    mobile_stage_box = mobile_page.locator(
        "[data-darkroom-viewport]"
    ).bounding_box()
    mobile_panel_box = mobile_modal.locator("aside").bounding_box()
    assert mobile_stage_box and mobile_panel_box
    assert mobile_stage_box["height"] >= 260
    assert mobile_panel_box["y"] >= (
        mobile_stage_box["y"] + mobile_stage_box["height"] - 2
    )
    assert (
        mobile_page.evaluate(
            "document.documentElement.scrollWidth - window.innerWidth"
        )
        <= 1
    )
    mobile_page.screenshot(path=output_dir / "darkroom-mobile.png")
    mobile_modal.get_by_role(
        "button", name="Next optical exhibit"
    ).click()
    expect(
        mobile_modal.get_by_role("heading", level=2)
    ).to_contain_text("Laser Scan Hologram")
    mobile_model_selector = mobile_page.locator(
        "[data-darkroom-hologram-model] "
        "[data-hologram-model-switcher]"
    )
    expect(mobile_model_selector).to_be_visible()
    mobile_model_selector.locator(
        '[data-hologram-model-option="turbine-rotor"]'
    ).click()
    expect(
        mobile_page.locator("[data-gallery-shared-canvas]")
    ).to_have_attribute("data-hologram-model", "turbine-rotor")
    expect(mobile_model_selector).to_have_attribute(
        "data-hologram-model-active",
        "turbine-rotor",
    )
    mobile_page.wait_for_timeout(180)
    assert (
        mobile_page.evaluate(
            "document.documentElement.scrollWidth - window.innerWidth"
        )
        <= 1
    )
    mobile_page.screenshot(
        path=output_dir / "darkroom-hologram-mobile.png"
    )
    mobile_modal.get_by_role(
        "button", name="Next optical exhibit"
    ).click()
    expect(
        mobile_modal.get_by_role("heading", level=2)
    ).to_contain_text("Particle Morph")
    expect(
        mobile_page.locator(
            "[data-darkroom-particle-manifold] "
            "[data-particle-manifold-switcher]"
        )
    ).to_be_visible()
    mobile_page.screenshot(
        path=output_dir / "darkroom-particle-morph-mobile.png"
    )
    mobile_modal.get_by_role(
        "button", name="Next optical exhibit"
    ).click()
    expect(
        mobile_modal.get_by_role("heading", level=2)
    ).to_contain_text("Plasma Reactor")
    expect(
        mobile_page.locator("[data-gallery-shared-canvas]")
    ).to_have_attribute("data-plasma-reactor", "hybrid-core")
    expect(
        mobile_page.locator("[data-darkroom-control]")
    ).to_have_count(4)
    expect(
        mobile_page.locator(
            '[data-darkroom-reactor-overdrive] '
            "[data-reactor-overdrive]"
        )
    ).to_be_visible()
    assert (
        mobile_page.evaluate(
            "document.documentElement.scrollWidth - window.innerWidth"
        )
        <= 1
    )
    mobile_page.wait_for_timeout(280)
    mobile_page.screenshot(
        path=output_dir / "darkroom-plasma-reactor-mobile.png"
    )
    mobile_page.get_by_role(
        "button", name="Close optical darkroom"
    ).click()
    expect(mobile_modal).to_be_hidden()
    mobile.close()
    browser.close()

assert not console_errors, "\n".join(console_errors)
assert not page_errors, "\n".join(page_errors)
print(f"Gallery check passed. Artifacts: {output_dir.resolve()}")
