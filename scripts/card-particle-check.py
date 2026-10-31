import os
from pathlib import Path
import re
import sys

from playwright.sync_api import expect, sync_playwright


BASE_URL = os.getenv(
    "CARD_PARTICLE_BASE_URL",
    "http://127.0.0.1:5173",
)
artifacts = Path(
    sys.argv[1] if len(sys.argv) > 1 else "artifacts/card-particles"
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
    page = browser.new_page(
        viewport={"width": 1440, "height": 1000},
        device_scale_factor=1,
    )
    attach_errors(page)
    response = page.goto(BASE_URL, wait_until="networkidle")
    assert response is not None and response.ok

    page.locator(
        'header nav[aria-label="展厅主导航"] a[href="#works"]'
    ).click()
    page.wait_for_timeout(1_300)
    page.mouse.wheel(0, 320)
    page.wait_for_timeout(900)

    cards = page.locator("[data-spotlight-card]")
    topology_card = cards.nth(1)
    topology_card.hover(position={"x": 160, "y": 90})
    page.wait_for_timeout(2_000)

    hover_state = topology_card.evaluate(
        """
        (element) => {
          const comet = element.querySelector(
            '[data-comet-beam="emerald"]'
          )
          return {
            hovered: element.matches(":hover"),
            mode: element.getAttribute("data-card-particle-mode"),
            opacity: comet
              ? getComputedStyle(comet).opacity
              : null,
            animation: comet
              ? getComputedStyle(comet).animationName
              : null,
          }
        }
        """
    )
    print(f"Card hover state: {hover_state}")
    assert hover_state["hovered"] is True
    assert hover_state["mode"] in ("rise", "attract")
    assert float(hover_state["opacity"]) > 0.8
    assert hover_state["animation"] == "bento-comet-orbit"

    canvas_info = topology_card.locator(
        "[data-card-particle-canvas]"
    ).evaluate(
        """
        (canvas) => ({
          width: canvas.width,
          height: canvas.height,
          clientWidth: canvas.clientWidth,
          clientHeight: canvas.clientHeight,
        })
        """
    )
    assert canvas_info["width"] >= canvas_info["clientWidth"]
    assert canvas_info["height"] >= canvas_info["clientHeight"]
    page.screenshot(path=artifacts / "card-hover-embers.png")

    vector_button = topology_card.get_by_role(
        "button",
        name="向量",
        exact=True,
    )
    pulse_overlay = page.locator("[data-bento-data-pulse]")
    pulse_id_before = int(
        pulse_overlay.get_attribute("data-pulse-id") or "0"
    )
    vector_button.hover()
    page.wait_for_timeout(90)
    expect(topology_card).to_have_attribute(
        "data-card-particle-mode",
        "attract",
    )
    vector_button.click()
    expect(topology_card).to_have_attribute(
        "data-card-particle-mode",
        "burst",
    )
    expect(pulse_overlay).not_to_have_attribute(
        "data-pulse-id",
        str(pulse_id_before),
    )
    expect(
        pulse_overlay.locator(".bento-data-pulse-beam")
    ).to_have_attribute("d", re.compile(r"^M "))
    page.wait_for_timeout(90)
    page.screenshot(path=artifacts / "card-button-burst.png")

    browser.close()

assert not console_errors, "\n".join(console_errors)
assert not page_errors, "\n".join(page_errors)
print(f"Card particle check passed. Artifacts: {artifacts.resolve()}")
