import sys
from pathlib import Path

from playwright.sync_api import expect, sync_playwright


BASE_URL = "https://atlantier.github.io/interactive-digital-showroom/"
output_path = Path(
    sys.argv[1]
    if len(sys.argv) > 1
    else "public/og-showroom.png"
)
if len(sys.argv) > 2:
    BASE_URL = sys.argv[2]
output_path.parent.mkdir(parents=True, exist_ok=True)

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

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(
        headless=True,
        executable_path=str(chrome_path) if chrome_path else None,
    )
    context = browser.new_context(
        viewport={"width": 1200, "height": 630},
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
    response = page.goto(BASE_URL, wait_until="networkidle")
    assert response is not None and response.ok
    expect(page.locator("h1")).to_be_visible()
    page.evaluate("window.scrollTo(0, 0)")
    page.wait_for_timeout(1_800)
    page.screenshot(
        path=output_path,
        full_page=False,
        animations="disabled",
    )
    context.close()
    browser.close()

assert not console_errors, "\n".join(console_errors)
print(f"Social card captured: {output_path.resolve()}")
