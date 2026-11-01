import sys
from pathlib import Path

from playwright.sync_api import expect, sync_playwright


BASE_URL = "http://127.0.0.1:5173"
output_dir = Path(
    sys.argv[1]
    if len(sys.argv) > 1
    else "artifacts/optical-theme-clean-view"
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


def hex_rgb(value: str) -> tuple[int, int, int]:
    normalized = value.removeprefix("#")
    assert len(normalized) == 6, value
    return tuple(
        int(normalized[index : index + 2], 16)
        for index in (0, 2, 4)
    )


def color_distance(left: str, right: str) -> float:
    left_rgb = hex_rgb(left)
    right_rgb = hex_rgb(right)
    return sum(
        (left_channel - right_channel) ** 2
        for left_channel, right_channel in zip(left_rgb, right_rgb)
    ) ** 0.5


def open_gallery(page) -> None:
    page.locator('header nav a[href="#gallery"]').click()
    page.wait_for_timeout(1_000)


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
    collect_errors(page)
    response = page.goto(BASE_URL, wait_until="networkidle")
    assert response is not None and response.ok
    open_gallery(page)

    first_pedestal = page.locator(
        '[data-exhibit-pedestal][data-exhibit-index="0"]'
    )
    first_pedestal.scroll_into_view_if_needed()
    shared_canvas = page.locator("[data-gallery-shared-canvas]")
    expect(page.locator("[data-exhibit-preview]")).to_have_count(8)
    expect(shared_canvas.locator("canvas")).to_have_count(0)
    page.wait_for_function(
        """
        () => Number(
          document.querySelectorAll(
            '[data-preview-running="true"]'
          ).length
        ) > 0
        """,
        timeout=5_000,
    )

    supernova_option = page.locator(
        '[data-vfx-preset-option="supernova-gold"]'
    ).first
    supernova_option.evaluate("(element) => element.click()")
    page.wait_for_function(
        """
        () => getComputedStyle(document.documentElement)
          .getPropertyValue('--vfx-primary')
          .trim()
          .toLowerCase() === '#f2b35e'
        """,
        timeout=5_000,
    )
    gold_target = page.evaluate(
        """
        () => getComputedStyle(document.documentElement)
          .getPropertyValue('--vfx-primary')
          .trim()
        """
    )
    assert gold_target.lower() == "#f2b35e"
    assert page.evaluate(
        """
        () => getComputedStyle(
          document.querySelector('[data-exhibit-preview]')
        ).getPropertyValue('--vfx-primary').trim()
        """
    ).lower() == "#f2b35e"
    page.screenshot(
        path=output_dir / "gallery-supernova-preview.png"
    )

    violet_option = page.locator(
        '[data-vfx-preset-option="quantum-violet"]'
    ).first
    violet_option.click()
    page.wait_for_function(
        """
        () => getComputedStyle(document.documentElement)
          .getPropertyValue('--vfx-primary')
          .trim()
          .toLowerCase() === '#a78bfa'
        """,
        timeout=5_000,
    )
    violet_target = page.evaluate(
        """
        () => getComputedStyle(document.documentElement)
          .getPropertyValue('--vfx-primary')
          .trim()
        """
    )
    assert violet_target.lower() == "#a78bfa"
    page.screenshot(
        path=output_dir / "gallery-quantum-violet-preview.png"
    )

    darkroom_entry = page.locator(
        '[data-enter-darkroom="photonic-mesh"]'
    )
    darkroom_entry.scroll_into_view_if_needed()
    darkroom_entry.click()
    modal = page.locator("[data-darkroom-inspector]")
    expect(modal).to_be_visible()
    page.wait_for_function(
        """
        () => Boolean(
          document.querySelector(
            '[data-gallery-shared-canvas]'
          )?.dataset.galleryThemeSync
        )
        """,
        timeout=10_000,
    )
    expect(shared_canvas).to_have_attribute(
        "data-gallery-theme-sync",
        "smooth-hologram-spotlight-laser",
    )
    supernova_option.evaluate("(element) => element.click()")
    page.wait_for_function(
        """
        () => document.querySelector(
          '[data-gallery-shared-canvas]'
        )?.dataset.galleryThemePreset === 'supernova-gold'
        """,
        timeout=3_000,
    )
    darkroom_gold_target = (
        shared_canvas.get_attribute(
            "data-gallery-theme-target-primary"
        )
        or ""
    )
    assert darkroom_gold_target.lower() == "#f2b35e"
    page.wait_for_timeout(180)
    darkroom_gold_mid = (
        shared_canvas.get_attribute(
            "data-gallery-theme-current-primary"
        )
        or ""
    )
    assert color_distance(
        darkroom_gold_mid,
        darkroom_gold_target,
    ) > 12
    page.wait_for_timeout(1_350)
    darkroom_gold_settled = (
        shared_canvas.get_attribute(
            "data-gallery-theme-current-primary"
        )
        or ""
    )
    assert color_distance(
        darkroom_gold_settled,
        darkroom_gold_target,
    ) < 4
    assert color_distance(
        shared_canvas.get_attribute(
            "data-gallery-theme-current-secondary"
        )
        or "",
        "#ff7a1a",
    ) < 4
    assert color_distance(
        shared_canvas.get_attribute(
            "data-gallery-theme-current-tertiary"
        )
        or "",
        "#fff1c2",
    ) < 4
    expect(modal).to_have_attribute(
        "data-darkroom-clean-view",
        "false",
    )
    clean_toggle = modal.locator("[data-darkroom-clean-toggle]")
    expect(clean_toggle).to_be_visible()
    clean_toggle.click()
    expect(modal).to_have_attribute(
        "data-darkroom-clean-view",
        "true",
    )
    expect(
        page.locator("[data-darkroom-viewport]")
    ).to_have_attribute(
        "data-darkroom-clean-render",
        "true",
    )
    expect(modal.locator("header")).to_have_count(0)
    expect(modal.locator("aside")).to_have_count(0)
    expect(page.locator("[data-gallery-quick-dock]")).to_be_hidden()
    viewport_box = page.locator(
        "[data-darkroom-viewport]"
    ).bounding_box()
    assert viewport_box
    assert abs(viewport_box["x"]) <= 1
    assert abs(viewport_box["y"]) <= 1
    assert abs(viewport_box["width"] - 1440) <= 1
    assert abs(viewport_box["height"] - 1000) <= 1
    page.wait_for_timeout(260)
    page.screenshot(
        path=output_dir / "cinema-clean-view-desktop.png"
    )

    page.keyboard.press("h")
    expect(modal).to_have_attribute(
        "data-darkroom-clean-view",
        "false",
    )
    expect(modal.locator("header")).to_be_visible()
    expect(modal.locator("aside")).to_be_visible()
    expect(page.locator("[data-gallery-quick-dock]")).to_be_visible()

    modal.locator("[data-darkroom-clean-toggle]").click()
    expect(modal).to_have_attribute(
        "data-darkroom-clean-view",
        "true",
    )
    page.keyboard.press("Escape")
    expect(modal).to_have_attribute(
        "data-darkroom-clean-view",
        "false",
    )
    expect(modal).to_be_visible()
    modal.get_by_role(
        "button", name="Close optical darkroom"
    ).click()
    expect(modal).to_be_hidden()
    context.close()

    mobile = browser.new_context(
        viewport={"width": 390, "height": 844},
        device_scale_factor=1,
        is_mobile=True,
        has_touch=True,
        reduced_motion="no-preference",
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
    mobile_page.locator(
        '#mobile-navigation a[href="#gallery"]'
    ).click()
    mobile_page.wait_for_timeout(1_000)
    mobile_entry = mobile_page.locator(
        '[data-enter-darkroom="prism-caustics"]'
    )
    mobile_entry.scroll_into_view_if_needed()
    mobile_entry.click()
    mobile_modal = mobile_page.locator("[data-darkroom-inspector]")
    expect(mobile_modal).to_be_visible()
    expect(
        mobile_modal.locator("[data-darkroom-clean-toggle]")
    ).to_be_visible()
    assert (
        mobile_page.evaluate(
            "document.documentElement.scrollWidth - window.innerWidth"
        )
        <= 1
    )
    mobile_modal.locator("[data-darkroom-clean-toggle]").click()
    expect(mobile_modal).to_have_attribute(
        "data-darkroom-clean-view",
        "true",
    )
    mobile_box = mobile_page.locator(
        "[data-darkroom-viewport]"
    ).bounding_box()
    assert mobile_box
    assert abs(mobile_box["x"]) <= 1
    assert abs(mobile_box["y"]) <= 1
    assert abs(mobile_box["width"] - 390) <= 1
    assert abs(mobile_box["height"] - 844) <= 1
    assert (
        mobile_page.evaluate(
            "document.documentElement.scrollWidth - window.innerWidth"
        )
        <= 1
    )
    mobile_page.wait_for_timeout(240)
    mobile_page.screenshot(
        path=output_dir / "cinema-clean-view-mobile.png"
    )
    mobile_modal.locator("[data-darkroom-clean-exit]").click()
    expect(mobile_modal).to_have_attribute(
        "data-darkroom-clean-view",
        "false",
    )
    mobile.close()
    browser.close()

assert not console_errors, "\n".join(console_errors)
assert not page_errors, "\n".join(page_errors)
print(
    "Optical theme and clean view check passed. "
    f"Artifacts: {output_dir.resolve()}"
)
