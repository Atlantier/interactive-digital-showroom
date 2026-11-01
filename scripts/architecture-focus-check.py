import os
from pathlib import Path
import sys

from playwright.sync_api import expect, sync_playwright


BASE_URL = os.getenv("VISUAL_BASE_URL", "http://127.0.0.1:5173")
output_dir = Path(
    sys.argv[1] if len(sys.argv) > 1 else "artifacts/architecture-focus"
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


def scroll_architecture(page, progress: float) -> None:
    page.evaluate(
        """
        (value) => {
          const section = document.querySelector(
            "[data-architecture-section]"
          )
          const bounds = section.getBoundingClientRect()
          const start = bounds.top + window.scrollY
          const distance = section.offsetHeight - window.innerHeight
          window.scrollTo(0, start + distance * value)
        }
        """,
        progress,
    )
    page.wait_for_timeout(1100)


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
        viewport={"width": 1440, "height": 1000},
        device_scale_factor=1,
    )
    page = desktop.new_page()
    collect_errors(page)
    page.goto(BASE_URL, wait_until="networkidle")
    scroll_architecture(page, 0.5)

    expect(page.locator("[data-architecture-sticky] canvas")).to_be_visible()
    page.screenshot(path=output_dir / "desktop-overview.png")

    layer_clicks = [
        ("spatial", 720, 285),
        ("orchestration", 720, 500),
        ("infrastructure", 720, 770),
    ]
    for layer, x, y in layer_clicks:
        page.mouse.click(x, y)
        hud = page.locator(
            f'[data-architecture-hud][data-layer="{layer}"]'
        )
        expect(hud).to_be_visible(timeout=5000)
        page.wait_for_timeout(1300)
        page.screenshot(path=output_dir / f"desktop-focus-{layer}.png")
        hud.get_by_role(
            "button", name="Close technology stack details"
        ).click()
        expect(hud).to_be_hidden()
        page.wait_for_timeout(700)

    mobile = browser.new_context(
        viewport={"width": 390, "height": 844},
        device_scale_factor=1,
        is_mobile=True,
        has_touch=True,
    )
    mobile_page = mobile.new_page()
    collect_errors(mobile_page)
    mobile_page.goto(BASE_URL, wait_until="networkidle")
    scroll_architecture(mobile_page, 0.82)

    mobile_page.touchscreen.tap(194, 408)
    mobile_hud = mobile_page.locator(
        '[data-architecture-hud][data-layer="orchestration"]'
    )
    expect(mobile_hud).to_be_visible(timeout=5000)
    expect(
        mobile_hud.get_by_text(
            "Multi-Agent Orchestration", exact=True
        )
    ).to_be_visible()
    mobile_page.wait_for_timeout(900)
    mobile_overflow = mobile_page.evaluate(
        "document.documentElement.scrollWidth - window.innerWidth"
    )
    assert mobile_overflow <= 1, mobile_overflow
    mobile_page.screenshot(path=output_dir / "mobile-focus-orchestration.png")
    mobile_hud.get_by_role(
        "button", name="Close technology stack details"
    ).click()
    expect(mobile_hud).to_be_hidden()

    mobile.close()
    desktop.close()
    browser.close()

if console_errors:
    print("Console errors:")
    print("\n".join(console_errors))
if page_errors:
    print("Page errors:")
    print("\n".join(page_errors))

assert not console_errors, "Browser console reported errors"
assert not page_errors, "Browser page reported runtime errors"
print(f"Architecture focus test passed. Screenshots: {output_dir.resolve()}")
