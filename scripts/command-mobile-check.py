import json
import os
from pathlib import Path
import sys

from playwright.sync_api import expect, sync_playwright


BASE_URL = os.getenv("VISUAL_BASE_URL", "http://127.0.0.1:5174")
output_dir = Path(
    sys.argv[1] if len(sys.argv) > 1 else "artifacts/command-mobile"
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
        viewport={"width": 1440, "height": 1000},
        device_scale_factor=1,
    )
    desktop.grant_permissions(
        ["clipboard-read", "clipboard-write"],
        origin=BASE_URL,
    )
    page = desktop.new_page()
    collect_errors(page)
    response = page.goto(BASE_URL, wait_until="networkidle")
    assert response is not None and response.ok
    page.wait_for_timeout(600)

    page.keyboard.press("Control+K")
    palette = page.locator("[data-command-palette]")
    expect(palette).to_be_visible()
    command_search = page.get_by_role("combobox", name="Search commands")
    expect(command_search).to_be_focused()
    page.screenshot(path=output_dir / "command-palette-desktop.png")
    page.keyboard.press("ArrowDown")
    expect(
        page.get_by_role("option", name="Go to: Works")
    ).to_have_attribute("aria-selected", "true")
    page.keyboard.press("ArrowUp")
    expect(
        page.get_by_role("option", name="Go to: Origin")
    ).to_have_attribute("aria-selected", "true")

    command_search.fill("cyber violet")
    violet_command = page.get_by_role(
        "option", name="Switch accent color: Cyber Violet"
    )
    expect(violet_command).to_be_visible()
    violet_command.press("Enter")
    expect(palette).to_be_hidden()
    expect(page.locator("html")).to_have_attribute(
        "data-accent-theme", "violet"
    )
    signal_color = page.evaluate(
        "getComputedStyle(document.documentElement)"
        ".getPropertyValue('--color-signal').trim()"
    )
    assert signal_color == "#8b5cf6", signal_color
    expect(page.locator("[data-command-feedback]")).to_contain_text(
        "Accent spectrum changed"
    )

    page.keyboard.press("Control+K")
    command_search = page.get_by_role("combobox", name="Search commands")
    command_search.fill("zero gravity")
    page.get_by_role(
        "option", name="Physics environment: Zero Gravity"
    ).press("Enter")
    expect(palette).to_be_hidden()
    expect(page.locator("[data-verlet-stage]")).to_have_attribute(
        "data-gravity-mode", "zero"
    )

    page.keyboard.press("Control+K")
    command_search = page.get_by_role("combobox", name="Search commands")
    command_search.fill("email")
    page.get_by_role("option", name="Copy contact email").press("Enter")
    expect(page.locator("[data-command-feedback]")).to_contain_text(
        "Email copied to clipboard"
    )
    assert page.evaluate("navigator.clipboard.readText()") == (
        "hello@node01.design"
    )

    page.keyboard.press("Control+K")
    command_search = page.get_by_role("combobox", name="Search commands")
    command_search.fill("resume json")
    with page.expect_download() as download_info:
        page.get_by_role(
            "option", name="Download resume JSON"
        ).press("Enter")
    download = download_info.value
    assert download.suggested_filename == "node01-resume.json"
    download_path = download.path()
    assert download_path is not None
    resume_payload = json.loads(download_path.read_text(encoding="utf-8"))
    assert resume_payload["schema"] == "node01.resume.v1"
    assert resume_payload["profile"]["email"] == "hello@node01.design"
    assert resume_payload["preferences"]["accentTheme"] == "violet"

    page.keyboard.press("Control+K")
    command_search = page.get_by_role("combobox", name="Search commands")
    command_search.fill("architecture")
    page.get_by_role("option", name="Go to: Architecture").press("Enter")
    page.wait_for_timeout(1_350)
    assert page.evaluate("window.scrollY") > 500
    expect(
        page.locator(
            'header nav[aria-label="Showroom primary navigation"] a[href="#architecture"]'
        )
    ).to_have_attribute("aria-current", "location")

    page.keyboard.press("Control+K")
    expect(palette).to_be_visible()
    page.keyboard.press("Escape")
    expect(palette).to_be_hidden()
    desktop.close()

    mobile = browser.new_context(
        viewport={"width": 390, "height": 844},
        device_scale_factor=1,
        is_mobile=True,
        has_touch=True,
    )
    mobile_page = mobile.new_page()
    collect_errors(mobile_page)
    response_mobile = mobile_page.goto(BASE_URL, wait_until="networkidle")
    assert response_mobile is not None and response_mobile.ok
    mobile_page.wait_for_timeout(500)

    horizon_overflow = mobile_page.evaluate(
        "document.documentElement.scrollWidth - window.innerWidth"
    )
    assert horizon_overflow <= 1, horizon_overflow
    mobile_page.get_by_role("button", name="Open command palette").click()
    mobile_palette = mobile_page.locator("[data-command-palette]")
    expect(mobile_palette).to_be_visible()
    panel_box = mobile_palette.locator('[role="dialog"]').bounding_box()
    assert panel_box
    assert panel_box["x"] >= 0
    assert panel_box["x"] + panel_box["width"] <= 391
    mobile_page.screenshot(
        path=output_dir / "command-palette-mobile.png"
    )
    mobile_palette.get_by_role(
        "button", name="Close command palette"
    ).click()

    scroll_to(mobile_page, "#works", 0.4)
    mobile_page.wait_for_timeout(500)
    mobile_grid = mobile_page.locator("[data-bento-grid]")
    expect(mobile_grid).to_be_visible()
    grid_columns = mobile_grid.evaluate(
        "(element) => getComputedStyle(element).gridTemplateColumns"
    )
    assert len(grid_columns.split()) == 1, grid_columns
    mobile_glow = mobile_grid.locator("[data-spotlight-card]").first
    glow_primary = mobile_glow.locator(".bento-card-border-glow")
    breathe_animation = glow_primary.evaluate(
        "(element) => getComputedStyle(element).animationName"
    )
    assert "bento-border-breathe" in breathe_animation, breathe_animation
    mobile_page.screenshot(path=output_dir / "bento-mobile-flow.png")

    scroll_to(mobile_page, "#sandbox")
    mobile_page.wait_for_timeout(1_200)
    sandbox_stage = mobile_page.locator("[data-verlet-stage]")
    badge = mobile_page.locator("[data-verlet-badge]").first
    badge_box = badge.bounding_box()
    assert badge_box
    start_x = badge_box["x"] + badge_box["width"] * 0.5
    start_y = badge_box["y"] + badge_box["height"] * 0.5
    scroll_before = mobile_page.evaluate("window.scrollY")
    mobile_page.wait_for_timeout(250)
    settled_scroll = mobile_page.evaluate("window.scrollY")
    assert abs(settled_scroll - scroll_before) <= 2, (
        scroll_before,
        settled_scroll,
    )
    scroll_before = settled_scroll
    cdp = mobile.new_cdp_session(mobile_page)
    cdp.send(
        "Input.dispatchTouchEvent",
        {
            "type": "touchStart",
            "touchPoints": [
                {
                    "x": start_x,
                    "y": start_y,
                    "id": 1,
                    "radiusX": 5,
                    "radiusY": 5,
                    "force": 1,
                }
            ],
        },
    )
    expect(sandbox_stage).to_have_attribute("data-dragging", "true")
    touch_action = sandbox_stage.evaluate(
        "(element) => getComputedStyle(element).touchAction"
    )
    assert touch_action == "none", touch_action
    assert (
        mobile_page.locator("html").get_attribute(
            "data-sandbox-dragging"
        )
        == "true"
    )
    mobile_page.wait_for_timeout(80)
    scroll_before = mobile_page.evaluate("window.scrollY")
    cdp.send(
        "Input.dispatchTouchEvent",
        {
            "type": "touchMove",
            "touchPoints": [
                {
                    "x": start_x + 18,
                    "y": start_y + 86,
                    "id": 1,
                    "radiusX": 5,
                    "radiusY": 5,
                    "force": 1,
                }
            ],
        },
    )
    mobile_page.wait_for_timeout(180)
    scroll_during = mobile_page.evaluate("window.scrollY")
    assert abs(scroll_during - scroll_before) <= 24, (
        scroll_before,
        scroll_during,
    )
    cdp.send(
        "Input.dispatchTouchEvent",
        {"type": "touchEnd", "touchPoints": []},
    )
    expect(sandbox_stage).to_have_attribute("data-dragging", "false")
    assert (
        mobile_page.locator("html").get_attribute(
            "data-sandbox-dragging"
        )
        is None
    )
    mobile_page.screenshot(path=output_dir / "sandbox-touch-drag.png")
    mobile.close()

    compact = browser.new_context(
        viewport={"width": 320, "height": 720},
        device_scale_factor=1,
        is_mobile=True,
        has_touch=True,
    )
    compact_page = compact.new_page()
    collect_errors(compact_page)
    compact_page.goto(BASE_URL, wait_until="networkidle")
    compact_page.wait_for_timeout(400)
    compact_overflow = compact_page.evaluate(
        "document.documentElement.scrollWidth - window.innerWidth"
    )
    assert compact_overflow <= 1, compact_overflow
    compact_page.get_by_role("button", name="Open command palette").click()
    compact_dialog = compact_page.get_by_role(
        "dialog", name="Global Command Palette"
    )
    expect(compact_dialog).to_be_visible()
    compact_box = compact_dialog.bounding_box()
    assert compact_box
    assert compact_box["x"] >= 0
    assert compact_box["x"] + compact_box["width"] <= 321
    compact_page.screenshot(path=output_dir / "command-palette-320.png")
    compact.close()
    browser.close()

assert not console_errors, "\n".join(console_errors)
assert not page_errors, "\n".join(page_errors)
print(f"Command palette and mobile checks passed: {output_dir.resolve()}")
