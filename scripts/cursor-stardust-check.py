import os
from pathlib import Path
import sys

from playwright.sync_api import expect, sync_playwright


BASE_URL = os.getenv("STARDUST_BASE_URL", "http://127.0.0.1:5173")
artifacts = Path(
    sys.argv[1] if len(sys.argv) > 1 else "artifacts/cursor-stardust"
)
artifacts.mkdir(parents=True, exist_ok=True)

chrome_candidates = [
    Path("C:/Program Files/Google/Chrome/Application/chrome.exe"),
    Path("C:/Program Files (x86)/Google/Chrome/Application/chrome.exe"),
    Path("C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"),
]
chrome_path = next(
    (candidate for candidate in chrome_candidates if candidate.exists()),
    None,
)

console_errors: list[str] = []
page_errors: list[str] = []


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
    attach_errors(page)
    response = page.goto(BASE_URL, wait_until="networkidle")
    assert response is not None and response.ok

    scene_canvas = page.locator("[data-scene-canvas]")
    expect(scene_canvas.locator("canvas")).to_be_visible()
    assert (
        scene_canvas.get_attribute("data-cursor-stardust-count") == "4000"
    )
    assert (
        scene_canvas.get_attribute("data-shockwave-particle-count")
        == "150"
    )
    assert (
        scene_canvas.get_attribute("data-light-ribbon-history") == "24"
    )

    page.mouse.move(360, 260)
    page.wait_for_timeout(32)
    for step in range(1, 31):
        x = 360 + step * 28
        y = 260 + step * 11 + (step % 4) * 9
        page.mouse.move(x, y)
        page.wait_for_timeout(16)
    page.wait_for_timeout(260)
    page.screenshot(path=artifacts / "desktop-cursor-stardust.png")

    page.mouse.click(920, 430)
    page.wait_for_timeout(110)
    page.screenshot(path=artifacts / "desktop-supernova-impact.png")
    page.wait_for_timeout(130)
    page.screenshot(path=artifacts / "desktop-shockwave-ring.png")

    page.set_viewport_size({"width": 1100, "height": 760})
    page.wait_for_timeout(160)
    page.mouse.move(180, 610)
    page.wait_for_timeout(16)
    page.mouse.move(880, 170)
    page.wait_for_timeout(180)
    page.screenshot(path=artifacts / "desktop-stardust-resized.png")
    desktop.close()

    mobile = browser.new_context(
        viewport={"width": 390, "height": 844},
        device_scale_factor=1,
        is_mobile=True,
        has_touch=True,
    )
    mobile_page = mobile.new_page()
    attach_errors(mobile_page)
    mobile_response = mobile_page.goto(
        BASE_URL,
        wait_until="networkidle",
    )
    assert mobile_response is not None and mobile_response.ok
    expect(mobile_page.locator("h1")).to_be_visible()

    mobile_cdp = mobile.new_cdp_session(mobile_page)
    mobile_cdp.send(
        "Input.dispatchTouchEvent",
        {
            "type": "touchStart",
            "touchPoints": [
                {
                    "x": 74,
                    "y": 620,
                    "id": 1,
                    "radiusX": 4,
                    "radiusY": 4,
                    "force": 1,
                }
            ],
        },
    )
    for step in range(1, 22):
        mobile_cdp.send(
            "Input.dispatchTouchEvent",
            {
                "type": "touchMove",
                "touchPoints": [
                    {
                        "x": 74 + step * 11,
                        "y": 620 - step * 13,
                        "id": 1,
                        "radiusX": 4,
                        "radiusY": 4,
                        "force": 1,
                    }
                ],
            },
        )
        mobile_page.wait_for_timeout(16)
    mobile_page.wait_for_timeout(180)
    mobile_page.screenshot(path=artifacts / "mobile-stardust.png")
    mobile_cdp.send(
        "Input.dispatchTouchEvent",
        {"type": "touchEnd", "touchPoints": []},
    )
    mobile.close()

    browser.close()

assert not console_errors, "\n".join(console_errors)
assert not page_errors, "\n".join(page_errors)
print(f"Cursor stardust check passed. Artifacts: {artifacts.resolve()}")
