import json
import sys
from pathlib import Path

from playwright.sync_api import expect, sync_playwright


BASE_URL = "http://127.0.0.1:5173"
output_dir = Path(
    sys.argv[1] if len(sys.argv) > 1 else "artifacts/ray-bounce-maze"
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
chrome_path = next(
    (candidate for candidate in chrome_candidates if candidate.exists()),
    None,
)


def read_elements(shared_canvas) -> dict[str, dict[str, float]]:
    payload = shared_canvas.get_attribute("data-ray-bounce-elements")
    assert payload
    entries = json.loads(payload)
    return {entry["id"]: entry for entry in entries}


def drag(
    page,
    start_x: float,
    start_y: float,
    delta_x: float,
    delta_y: float,
) -> None:
    page.mouse.move(start_x, start_y)
    page.mouse.down()
    page.mouse.move(
        start_x + delta_x,
        start_y + delta_y,
        steps=12,
    )
    page.mouse.up()


with sync_playwright() as playwright:
    browser = playwright.chromium.launch(
        headless=True,
        executable_path=str(chrome_path) if chrome_path else None,
    )
    context = browser.new_context(
        viewport={"width": 1440, "height": 1000},
        device_scale_factor=1,
        reduced_motion="no-preference",
    )
    page = context.new_page()
    page.on(
        "console",
        lambda message: (
            console_errors.append(message.text)
            if message.type == "error"
            else None
        ),
    )
    page.on("pageerror", lambda error: page_errors.append(str(error)))

    response = page.goto(BASE_URL, wait_until="networkidle")
    assert response is not None and response.ok
    page.locator('header nav a[href="#gallery"]').click()
    page.wait_for_timeout(900)

    pedestal = page.locator('[data-exhibit-pedestal][data-exhibit-index="4"]')
    pedestal.scroll_into_view_if_needed()
    stage = pedestal.locator("[data-gallery-stage]")
    stage.scroll_into_view_if_needed()
    shared_canvas = page.locator("[data-gallery-shared-canvas]")

    expect(shared_canvas).to_have_attribute(
        "data-ray-bounce-maze",
        "recursive-cpu-max-depth-10",
    )
    expect(shared_canvas).to_have_attribute("data-ray-bounce-optics", "5")
    expect(shared_canvas).to_have_attribute("data-ray-bounce-targets", "3")
    page.wait_for_function(
        """
        () => Number(
          document.querySelector(
            '[data-gallery-shared-canvas]'
          )?.dataset.rayBounceSegments ?? 0
        ) >= 8
        """
    )
    target_hits = int(
        shared_canvas.get_attribute("data-ray-bounce-target-hits") or 0
    )
    active_targets = int(
        shared_canvas.get_attribute("data-ray-bounce-targets-active")
        or 0
    )
    assert active_targets == 3, (
        target_hits,
        active_targets,
        shared_canvas.get_attribute("data-ray-bounce-target-mask"),
    )
    page.screenshot(path=output_dir / "stage-ray-tree.png")

    layout_zero = read_elements(shared_canvas)
    shuffle_button = pedestal.locator("[data-ray-maze-shuffle]")
    expect(shuffle_button).to_be_visible()

    shuffle_button.click()
    expect(shared_canvas).to_have_attribute(
        "data-ray-bounce-layout",
        "1",
    )
    expect(shared_canvas).to_have_attribute(
        "data-ray-bounce-transition",
        "active",
    )
    page.wait_for_timeout(980)
    expect(shared_canvas).to_have_attribute(
        "data-ray-bounce-transition",
        "settled",
    )
    layout_one = read_elements(shared_canvas)
    assert (
        abs(layout_one["mirror-a"]["angle"] - layout_zero["mirror-a"]["angle"])
        > 0.4
    )
    page.screenshot(path=output_dir / "layout-star-cavity.png")

    shuffle_button.click()
    expect(shared_canvas).to_have_attribute(
        "data-ray-bounce-layout",
        "2",
    )
    page.wait_for_timeout(980)
    expect(shared_canvas).to_have_attribute(
        "data-ray-bounce-transition",
        "settled",
    )
    layout_two = read_elements(shared_canvas)
    assert (
        abs(layout_two["splitter"]["x"] - layout_zero["splitter"]["x"])
        > 0.45
    )
    page.screenshot(path=output_dir / "layout-mach-zehnder.png")

    shuffle_button.click()
    expect(shared_canvas).to_have_attribute(
        "data-ray-bounce-layout",
        "0",
    )
    page.wait_for_timeout(980)
    expect(shared_canvas).to_have_attribute(
        "data-ray-bounce-transition",
        "settled",
    )
    initial = read_elements(shared_canvas)
    assert abs(initial["mirror-a"]["angle"] - layout_zero["mirror-a"]["angle"]) < 0.01

    mirror = initial["mirror-a"]
    drag(
        page,
        mirror["bodyX"],
        mirror["bodyY"],
        34,
        -18,
    )
    page.wait_for_timeout(180)
    moved = read_elements(shared_canvas)["mirror-a"]
    assert abs(moved["x"] - mirror["x"]) > 0.015
    assert abs(moved["y"] - mirror["y"]) > 0.01

    drag(
        page,
        moved["ringX"],
        moved["ringY"],
        -12,
        34,
    )
    page.wait_for_timeout(180)
    rotated = read_elements(shared_canvas)["mirror-a"]
    assert abs(rotated["angle"] - moved["angle"]) > 0.04
    page.screenshot(path=output_dir / "stage-ray-tree-manipulated.png")

    page.locator('[data-enter-darkroom="photonic-mesh"]').click()
    modal = page.locator("[data-darkroom-inspector]")
    expect(modal).to_be_visible()
    expect(modal.get_by_role("heading", level=2)).to_contain_text(
        "Ray Bounce Maze"
    )
    expect(
        page.locator("[data-darkroom-viewport]")
    ).to_have_attribute(
        "data-darkroom-active-exhibit",
        "photonic-mesh",
    )
    page.wait_for_function(
        """
        () => {
          const canvas = document.querySelector(
            '[data-gallery-shared-canvas]'
          )
          return canvas?.dataset.rayBounceMode === 'darkroom' &&
            canvas.dataset.rayBounceElements?.includes('splitter')
        }
        """
    )
    page.wait_for_timeout(700)

    darkroom_elements = read_elements(shared_canvas)
    splitter = darkroom_elements["splitter"]
    page.mouse.move(splitter["bodyX"], splitter["bodyY"])
    page.wait_for_timeout(160)
    page.mouse.down()
    expect(page.locator("[data-darkroom-viewport]")).to_have_attribute(
        "data-gallery-drag-mode",
        "optical",
    )
    page.mouse.move(
        splitter["bodyX"] - 28,
        splitter["bodyY"] + 22,
        steps=12,
    )
    page.mouse.up()
    page.wait_for_timeout(220)
    splitter_moved = read_elements(shared_canvas)["splitter"]
    assert abs(splitter_moved["x"] - splitter["x"]) > 0.012
    assert abs(splitter_moved["y"] - splitter["y"]) > 0.008
    expect(shared_canvas).to_have_attribute(
        "data-ray-bounce-interaction",
        "direct-body-drag-and-dial-rotation",
    )
    assert int(
        shared_canvas.get_attribute("data-ray-bounce-flares") or 0
    ) >= 3
    expect(shared_canvas).to_have_attribute(
        "data-ray-bounce-celebration-particles",
        "60",
    )
    assert (
        len(
            (
                shared_canvas.get_attribute(
                    "data-ray-bounce-locked-power"
                )
                or ""
            ).split(",")
        )
        == 3
    )
    page.screenshot(path=output_dir / "darkroom-ray-tree.png")

    mobile = browser.new_context(
        viewport={"width": 390, "height": 844},
        device_scale_factor=1,
        is_mobile=True,
        has_touch=True,
        reduced_motion="no-preference",
    )
    mobile_page = mobile.new_page()
    mobile_page.goto(BASE_URL, wait_until="networkidle")
    mobile_page.locator(
        'button[aria-label="Open navigation menu"]'
    ).click()
    mobile_page.locator(
        '#mobile-navigation a[href="#gallery"]'
    ).click()
    mobile_page.wait_for_timeout(900)
    mobile_page.locator(
        '[data-enter-darkroom="photonic-mesh"]'
    ).scroll_into_view_if_needed()
    mobile_page.locator(
        '[data-enter-darkroom="photonic-mesh"]'
    ).click()
    mobile_modal = mobile_page.locator("[data-darkroom-inspector]")
    expect(mobile_modal).to_be_visible()
    expect(mobile_modal.get_by_role("heading", level=2)).to_contain_text(
        "Ray Bounce Maze"
    )
    overflow = mobile_page.evaluate(
        "document.documentElement.scrollWidth - window.innerWidth"
    )
    assert overflow <= 1, overflow
    mobile_page.wait_for_timeout(320)
    mobile_page.screenshot(
        path=output_dir / "darkroom-ray-tree-mobile.png"
    )
    mobile.close()
    context.close()
    browser.close()

assert not console_errors, "\n".join(console_errors)
assert not page_errors, "\n".join(page_errors)
print(f"Ray bounce maze check passed. Artifacts: {output_dir.resolve()}")
