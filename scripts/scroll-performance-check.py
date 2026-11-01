import sys
from pathlib import Path

from playwright.sync_api import expect, sync_playwright


BASE_URL = "http://127.0.0.1:5173"
output_dir = Path(
    sys.argv[1]
    if len(sys.argv) > 1
    else "artifacts/scroll-performance"
)
if len(sys.argv) > 2:
    BASE_URL = sys.argv[2]
output_dir.mkdir(parents=True, exist_ok=True)

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


with sync_playwright() as playwright:
    browser = playwright.chromium.launch(
        headless=True,
        executable_path=str(chrome_path) if chrome_path else None,
    )
    context = browser.new_context(
        viewport={"width": 1440, "height": 900},
        device_scale_factor=1,
        reduced_motion="no-preference",
    )
    page = context.new_page()
    collect_errors(page)
    page.add_init_script(
        "localStorage.setItem('showroom_locale_v1', 'en')"
    )
    response = page.goto(BASE_URL, wait_until="networkidle")
    assert response is not None and response.ok

    expect(page.locator("html")).to_have_attribute(
        "data-scroll-mode",
        "native-wheel",
    )
    expect(page.locator("[data-architecture-sticky]")).to_have_attribute(
        "data-scene-ready",
        "false",
    )
    expect(
        page.locator(
            "[data-architecture-sticky] "
            "[data-scene-canvas], "
            "[data-architecture-sticky] canvas"
        )
    ).to_have_count(0)

    page.evaluate(
        """
        () => {
          const gallery = document.getElementById('gallery')
          window.scrollTo(
            0,
            gallery.getBoundingClientRect().top +
              window.scrollY +
              300
          )
        }
        """
    )
    page.wait_for_function(
        """
        () => document.querySelectorAll(
          '[data-preview-running="true"]'
        ).length > 0
        """,
        timeout=8_000,
    )
    page.wait_for_function(
        """
        () => document.documentElement.dataset.scrolling === 'false'
        """,
        timeout=5_000,
    )

    active_previews = page.locator(
        '[data-preview-running="true"]'
    ).count()
    assert 1 <= active_previews <= 4, active_previews
    assert page.evaluate(
        """
        () => getComputedStyle(document.documentElement)
          .getPropertyValue('--scroll-progress')
        """
    ) == ""
    expect(page.locator("[data-bento-grid]")).to_have_attribute(
        "data-bento-in-view",
        "false",
    )

    progress_before = page.locator(
        "[data-scroll-progress-line]"
    ).get_attribute("style")
    for _ in range(8):
        page.mouse.wheel(0, 80)
        page.wait_for_timeout(25)
    page.evaluate(
        """
        () => {
          window.__scrollStyleTimer = window.setInterval(() => {
            window.dispatchEvent(
              new WheelEvent('wheel', {
                deltaY: 80,
                bubbles: true,
                cancelable: true,
              })
            )
          }, 40)
        }
        """
    )
    page.wait_for_function(
        """
        () => document.documentElement.dataset.scrolling === 'true'
        """,
        timeout=2_000,
    )
    page.wait_for_timeout(80)

    scrolling_styles = page.evaluate(
        """
        () => {
          const preview = document.querySelector(
            '[data-preview-running="true"] .exhibit-preview-scanline'
          )
          const grain = document.querySelector('.film-grain')
          const header = document.querySelector('header')
          const comet = document.querySelector('.bento-comet')
          return {
            grainOpacity: Number.parseFloat(
              getComputedStyle(grain).opacity
            ),
            grainBlend: getComputedStyle(grain).mixBlendMode,
            previewState: preview
              ? getComputedStyle(preview).animationPlayState
              : '',
            headerBlur: getComputedStyle(header).backdropFilter,
            bentoState: comet
              ? getComputedStyle(comet).animationPlayState
              : '',
          }
        }
        """
    )
    assert scrolling_styles["grainOpacity"] <= 0.01, scrolling_styles
    assert scrolling_styles["grainBlend"] == "normal", scrolling_styles
    assert scrolling_styles["previewState"] == "paused", scrolling_styles
    assert scrolling_styles["headerBlur"] == "none", scrolling_styles
    assert scrolling_styles["bentoState"] == "paused", scrolling_styles

    page.evaluate(
        "() => window.clearInterval(window.__scrollStyleTimer)"
    )
    page.wait_for_function(
        """
        () => document.documentElement.dataset.scrolling === 'false'
        """,
        timeout=3_000,
    )
    page.wait_for_function(
        """
        () => Number.parseFloat(
          getComputedStyle(
            document.querySelector('.film-grain')
          ).opacity
        ) > 0.01
        """,
        timeout=2_000,
    )
    progress_after = page.locator(
        "[data-scroll-progress-line]"
    ).get_attribute("style")
    assert progress_before != progress_after, (
        progress_before,
        progress_after,
    )
    expect(
        page.locator(
            '[data-preview-running="true"] '
            ".exhibit-preview-scanline"
        ).first
    ).to_have_css("animation-play-state", "running")

    page.locator("#architecture").scroll_into_view_if_needed()
    expect(page.locator("[data-architecture-sticky]")).to_have_attribute(
        "data-scene-ready",
        "true",
        timeout=8_000,
    )
    expect(
        page.locator("[data-architecture-sticky] canvas")
    ).to_have_count(1)
    page.wait_for_timeout(1_500)

    page.screenshot(
        path=output_dir / "scroll-optimized-gallery.png",
        full_page=False,
    )
    context.close()
    browser.close()

assert not console_errors, "\n".join(console_errors)
assert not page_errors, "\n".join(page_errors)
print(
    "Scroll performance check passed. "
    f"Artifacts: {output_dir.resolve()}"
)
