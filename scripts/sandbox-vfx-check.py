import base64
import math
import os
from pathlib import Path
import sys

from playwright.sync_api import expect, sync_playwright


BASE_URL = os.getenv("VFX_BASE_URL", "http://127.0.0.1:5173")
output_dir = Path(
    sys.argv[1] if len(sys.argv) > 1 else "artifacts/sandbox-vfx"
)
if len(sys.argv) > 2:
    BASE_URL = sys.argv[2]
output_dir.mkdir(parents=True, exist_ok=True)

console_errors: list[str] = []
page_errors: list[str] = []
chrome_candidates = [
    Path("C:/Program Files/Google/Chrome/Application/chrome.exe"),
    Path("C:/Program Files (x86)/Google/Chrome/Application/chrome.exe"),
    Path("C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"),
]
chrome_path = next((path for path in chrome_candidates if path.exists()), None)


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


def scroll_to_section(page, section_id: str) -> None:
    page.evaluate(
        """
        (id) => {
          const section = document.getElementById(id)
          window.scrollTo(
            0,
            section.getBoundingClientRect().top + window.scrollY - 72
          )
        }
        """,
        section_id,
    )
    page.wait_for_timeout(850)


def center(box):
    return box["x"] + box["width"] * 0.5, box["y"] + box["height"] * 0.5


def canvas_alpha_pixels(page, selector: str) -> int:
    return page.evaluate(
        """
        (selector) => {
          const canvas = document.querySelector(selector)
          if (!(canvas instanceof HTMLCanvasElement)) return 0
          const context = canvas.getContext("2d")
          if (!context) return 0
          const data = context.getImageData(
            0,
            0,
            canvas.width,
            canvas.height
          ).data
          let visible = 0
          for (let index = 3; index < data.length; index += 64) {
            if (data[index] > 8) visible += 1
          }
          return visible
        }
        """,
        selector,
    )


def save_canvas_png(page, selector: str, path: Path) -> None:
    data_url = page.evaluate(
        """
        (selector) => {
          const canvas = document.querySelector(selector)
          return canvas instanceof HTMLCanvasElement
            ? canvas.toDataURL("image/png")
            : ""
        }
        """,
        selector,
    )
    assert data_url.startswith("data:image/png;base64,")
    path.write_bytes(
        base64.b64decode(data_url.split(",", 1)[1])
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
    context = browser.new_context(
        viewport={"width": 1440, "height": 1000},
        device_scale_factor=1,
    )
    page = context.new_page()
    collect_errors(page)
    page.goto(BASE_URL, wait_until="networkidle")
    expect(page.locator("h1")).to_be_visible()

    scroll_to_section(page, "sandbox")
    verlet_stage = page.locator("[data-verlet-stage]")
    verlet_canvas = page.locator("[data-verlet-vfx-canvas]")
    badges = page.locator("[data-verlet-badge]")
    expect(verlet_stage).to_be_visible()
    expect(verlet_canvas).to_be_visible()
    expect(page.locator("[data-lanyard-glow]")).to_have_count(4)
    expect(page.locator("[data-lanyard-pulse]")).to_have_count(4)
    expect(page.locator("[data-lanyard-pulse-glow]")).to_have_count(4)
    expect(verlet_stage).to_have_attribute(
        "data-vfx-preset",
        "emerald-cyber",
    )

    verlet_stage.screenshot(path=output_dir / "verlet-idle.png")

    first_box = badges.nth(0).bounding_box()
    second_box = badges.nth(1).bounding_box()
    assert first_box and second_box
    first_x, first_y = center(first_box)
    second_x, second_y = center(second_box)
    page.mouse.move(first_x, first_y)
    page.mouse.down()
    page.mouse.move(second_x, second_y, steps=20)
    for step in range(48):
        page.mouse.move(
            second_x + 18 * math.sin(step * 0.8),
            second_y + 12 * math.cos(step * 0.63),
        )
        page.wait_for_timeout(28)
        if int(
            verlet_stage.get_attribute("data-vfx-impact-bursts") or "0"
        ) > 0:
            break

    impact_bursts = int(
        verlet_stage.get_attribute("data-vfx-impact-bursts") or "0"
    )
    active_particles = int(
        verlet_stage.get_attribute("data-vfx-active-particles") or "0"
    )
    assert impact_bursts > 0, impact_bursts
    assert active_particles > 0, active_particles
    assert canvas_alpha_pixels(page, "[data-verlet-vfx-canvas]") > 0
    collision_light = float(
        verlet_stage.get_attribute("data-vfx-light-intensity") or "0"
    )
    assert collision_light > 0, collision_light
    page.wait_for_timeout(80)
    light_opacity = float(
        page.locator("[data-verlet-lightfield]").evaluate(
            "(element) => getComputedStyle(element).opacity"
        )
    )
    assert light_opacity > 0, light_opacity
    grid_light_opacity = float(
        page.locator("[data-verlet-grid-light]").evaluate(
            "(element) => getComputedStyle(element).opacity"
        )
    )
    assert grid_light_opacity > 0, grid_light_opacity
    save_canvas_png(
        page,
        "[data-verlet-vfx-canvas]",
        output_dir / "verlet-collision-canvas.png",
    )
    verlet_stage.screenshot(path=output_dir / "verlet-collision-sparks.png")
    page.mouse.up()
    page.wait_for_timeout(300)

    stage_box = verlet_stage.bounding_box()
    badge_box = badges.nth(0).bounding_box()
    assert stage_box and badge_box
    drag_x, drag_y = center(badge_box)
    target_x = stage_box["x"] + stage_box["width"] - 18
    target_y = stage_box["y"] + stage_box["height"] * 0.7
    page.mouse.move(drag_x, drag_y)
    page.mouse.down()
    ruptured = False
    for step in range(1, 49):
        progress = step / 48
        page.mouse.move(
            drag_x + (target_x - drag_x) * progress,
            drag_y + (target_y - drag_y) * progress,
        )
        page.wait_for_timeout(55)
        if verlet_stage.get_attribute("data-ruptured") == "true":
            ruptured = True
            break

    assert ruptured, "Lanyard did not rupture during the stress drag"
    page.wait_for_timeout(35)
    arc_bursts = int(
        verlet_stage.get_attribute("data-vfx-arc-bursts") or "0"
    )
    assert arc_bursts > 0, arc_bursts
    assert float(
        verlet_stage.get_attribute("data-vfx-light-intensity") or "0"
    ) > 0
    save_canvas_png(
        page,
        "[data-verlet-vfx-canvas]",
        output_dir / "verlet-fractal-arc-canvas.png",
    )
    verlet_stage.screenshot(path=output_dir / "verlet-fractal-arc.png")
    page.mouse.up()
    page.wait_for_timeout(300)
    assert int(
        verlet_stage.get_attribute("data-vfx-active-particles") or "0"
    ) > 0

    scroll_to_section(page, "kinetics")
    fabrik_stage = page.locator("[data-fabrik-stage]")
    fabrik_canvas = page.locator("[data-fabrik-canvas]")
    expect(fabrik_stage).to_be_visible()
    expect(fabrik_canvas).to_be_visible()

    canvas_box = fabrik_canvas.bounding_box()
    assert canvas_box
    target_x = canvas_box["x"] + canvas_box["width"] * 0.18
    target_y = canvas_box["y"] + canvas_box["height"] * 0.3
    page.mouse.move(target_x, target_y, steps=14)
    page.wait_for_timeout(180)
    page.mouse.click(target_x, target_y)
    page.wait_for_function(
        """
        () => {
          const stage = document.querySelector('[data-fabrik-stage]')
          return Number(
            stage?.getAttribute('data-vfx-active-particles') || 0
          ) > 0
        }
        """,
        timeout=3_000,
    )

    laser_particles = int(
        fabrik_stage.get_attribute("data-vfx-active-particles") or "0"
    )
    laser_vfx = int(
        fabrik_stage.get_attribute("data-laser-vfx") or "0"
    )
    active_scorches = int(
        fabrik_stage.get_attribute("data-scorch-active") or "0"
    )
    assert laser_particles > 0, laser_particles
    assert laser_vfx > 0, laser_vfx
    assert active_scorches > 0, active_scorches
    laser_light = float(
        fabrik_stage.get_attribute("data-vfx-light-intensity") or "0"
    )
    assert laser_light > 0, laser_light
    fabrik_light_opacity = float(
        page.locator("[data-fabrik-lightfield]").evaluate(
            "(element) => getComputedStyle(element).opacity"
        )
    )
    assert fabrik_light_opacity > 0, fabrik_light_opacity
    fabrik_grid_opacity = float(
        page.locator("[data-fabrik-grid-light]").evaluate(
            "(element) => getComputedStyle(element).opacity"
        )
    )
    assert fabrik_grid_opacity > 0, fabrik_grid_opacity
    save_canvas_png(
        page,
        "[data-fabrik-canvas]",
        output_dir / "fabrik-ionized-laser-canvas.png",
    )
    fabrik_stage.screenshot(path=output_dir / "fabrik-ionized-laser.png")

    page.wait_for_timeout(3_250)
    expect(fabrik_stage).to_have_attribute("data-scorch-active", "0")
    fabrik_stage.screenshot(path=output_dir / "fabrik-scorch-cooled.png")

    page.locator('[data-ik-mode-option="quadruped"]').click()
    page.wait_for_timeout(450)
    for step in range(120):
        x_fraction = 0.24 if step % 12 < 6 else 0.76
        y_fraction = 0.34 if step % 18 < 9 else 0.68
        page.mouse.move(
            canvas_box["x"] + canvas_box["width"] * x_fraction,
            canvas_box["y"] + canvas_box["height"] * y_fraction,
            steps=3,
        )
        page.wait_for_timeout(40)
        if int(
            fabrik_stage.get_attribute("data-hex-ripple-count") or "0"
        ) > 0:
            break

    hex_ripples = int(
        fabrik_stage.get_attribute("data-hex-ripple-count") or "0"
    )
    active_ripples = int(
        fabrik_stage.get_attribute("data-active-ripples") or "0"
    )
    assert hex_ripples > 0, hex_ripples
    assert active_ripples > 0, active_ripples
    assert float(
        fabrik_stage.get_attribute("data-vfx-light-intensity") or "0"
    ) > 0
    save_canvas_png(
        page,
        "[data-fabrik-canvas]",
        output_dir / "fabrik-hex-ripple-canvas.png",
    )
    fabrik_stage.screenshot(path=output_dir / "fabrik-hex-ripple.png")

    page.locator(
        '[data-vfx-preset-switcher] '
        '[data-vfx-preset-option="supernova-gold"]'
    ).click()
    expect(verlet_stage).to_have_attribute(
        "data-vfx-preset",
        "supernova-gold",
    )
    expect(fabrik_stage).to_have_attribute(
        "data-vfx-preset",
        "supernova-gold",
    )
    pulse_stroke = page.locator("[data-lanyard-pulse]").first.evaluate(
        "(element) => getComputedStyle(element).stroke"
    )
    pulse_glow_stroke = page.locator(
        "[data-lanyard-pulse-glow]"
    ).first.evaluate("(element) => getComputedStyle(element).stroke")
    assert pulse_stroke == "rgb(255, 241, 194)", pulse_stroke
    assert pulse_glow_stroke == "rgb(255, 122, 26)", pulse_glow_stroke
    fabrik_stage.screenshot(path=output_dir / "fabrik-supernova-gold.png")

    page.set_viewport_size({"width": 390, "height": 844})
    page.wait_for_timeout(400)
    overflow = page.evaluate(
        "document.documentElement.scrollWidth - window.innerWidth"
    )
    assert overflow <= 1, overflow
    page.screenshot(path=output_dir / "mobile-vfx-layout.png")
    context.close()
    browser.close()

if console_errors:
    print("Console errors:")
    print("\n".join(console_errors))
if page_errors:
    print("Page errors:")
    print("\n".join(page_errors))

assert not console_errors, "Browser console reported errors"
assert not page_errors, "Browser page reported runtime errors"
print(f"Sandbox VFX test passed. Screenshots: {output_dir.resolve()}")
