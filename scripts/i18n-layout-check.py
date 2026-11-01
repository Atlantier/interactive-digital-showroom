import os
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright


BASE_URL = os.getenv("I18N_BASE_URL", "http://127.0.0.1:5173")
output_dir = Path(
    sys.argv[1] if len(sys.argv) > 1 else "artifacts/i18n-layout"
)
if len(sys.argv) > 2:
    BASE_URL = sys.argv[2]
output_dir.mkdir(parents=True, exist_ok=True)

VIEWPORTS = (
    ("desktop", 1440, 1000),
    ("compact-desktop", 1024, 820),
    ("tablet", 768, 900),
    ("mobile", 390, 844),
    ("narrow-mobile", 320, 720),
)
viewport_filter = os.getenv("I18N_VIEWPORT")
if viewport_filter:
    VIEWPORTS = tuple(
        viewport
        for viewport in VIEWPORTS
        if viewport[0] == viewport_filter
    )
    assert VIEWPORTS, f"Unknown I18N_VIEWPORT: {viewport_filter}"

STABLE_TARGETS = (
    "header",
    "[data-hero-content]",
    "[data-hero-meta]",
    "main h1",
    "[data-hero-description]",
    "[data-hero-actions]",
    "[data-bento-grid]",
    "[data-spotlight-card]",
    "[data-gallery-section]",
    "[data-exhibit-pedestal]",
    "[data-gallery-stage]",
    "[data-verlet-sandbox]",
    "[data-verlet-stage]",
    "[data-fabrik-creature]",
    "[data-fabrik-stage]",
    "[data-architecture-section]",
)

console_errors: list[str] = []
page_errors: list[str] = []
chrome_candidates = (
    Path("C:/Program Files/Google/Chrome/Application/chrome.exe"),
    Path("C:/Program Files (x86)/Google/Chrome/Application/chrome.exe"),
    Path(
        "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"
    ),
)
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


def read_boxes(page) -> dict[str, list[dict[str, float]]]:
    return page.evaluate(
        """
        (selectors) => Object.fromEntries(
          selectors.map((selector) => [
            selector,
            Array.from(document.querySelectorAll(selector)).map((element) => {
              const box = element.getBoundingClientRect()
              return {
                x: Number(box.x.toFixed(3)),
                y: Number(box.y.toFixed(3)),
                width: Number(box.width.toFixed(3)),
                height: Number(box.height.toFixed(3)),
              }
            }),
          ]),
        )
        """,
        list(STABLE_TARGETS),
    )


def assert_boxes_stable(
    before: dict[str, list[dict[str, float]]],
    after: dict[str, list[dict[str, float]]],
    viewport_name: str,
) -> None:
    differences: list[str] = []
    for selector in STABLE_TARGETS:
        previous = before[selector]
        current = after[selector]
        if len(previous) != len(current):
            differences.append(
                f"{selector}: count {len(previous)} -> {len(current)}"
            )
            continue
        for index, (left, right) in enumerate(zip(previous, current)):
            for key in ("x", "y", "width", "height"):
                if abs(left[key] - right[key]) > 0.5:
                    differences.append(
                        f"{selector}[{index}].{key} "
                    f"{left[key]} -> {right[key]}"
                )
    assert not differences, (
        f"{viewport_name}: locale-sensitive geometry detected:\n"
        + "\n".join(differences)
    )


def assert_typography(page, locale: str) -> None:
    values = page.evaluate(
        """
        () => {
          const heading = document.querySelector("main h1")
          const bodyCopy = document.querySelector("main p")
          const mono = document.querySelector("[data-token-throughput]")
          const headingStyle = getComputedStyle(heading)
          const bodyStyle = getComputedStyle(bodyCopy)
          const monoStyle = getComputedStyle(mono)
          return {
            headingSpacing: headingStyle.letterSpacing,
            bodySpacing: bodyStyle.letterSpacing,
            bodyLineHeight: parseFloat(bodyStyle.lineHeight),
            bodyFontSize: parseFloat(bodyStyle.fontSize),
            monoNumeric: monoStyle.fontVariantNumeric,
            wordBreak: headingStyle.wordBreak,
            overflowWrap: headingStyle.overflowWrap,
            hyphens: headingStyle.hyphens,
          }
        }
        """
    )
    if locale == "en":
        assert float(values["headingSpacing"].replace("px", "")) < 0
        assert "tabular-nums" in values["monoNumeric"]
        assert values["wordBreak"] == "normal"
        assert values["overflowWrap"] == "break-word"
        assert values["hyphens"] == "auto"
    else:
        assert float(values["headingSpacing"].replace("px", "")) > 0
        assert values["bodyLineHeight"] / values["bodyFontSize"] >= 1.7
        assert values["wordBreak"] == "normal"
        assert values["overflowWrap"] == "break-word"


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

    for viewport_name, width, height in VIEWPORTS:
        context = browser.new_context(
            viewport={"width": width, "height": height},
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
        page.wait_for_timeout(500)
        assert_typography(page, "en")
        english_boxes = read_boxes(page)
        page.screenshot(
            path=output_dir
            / f"{viewport_name}-{width}x{height}-en.png",
            full_page=False,
        )

        page.locator('[data-language-option="zh"]').click()
        page.wait_for_timeout(80)
        page.screenshot(
            path=output_dir
            / f"{viewport_name}-{width}x{height}-switching.png",
            full_page=False,
        )
        page.wait_for_timeout(200)
        assert_typography(page, "zh")
        chinese_boxes = read_boxes(page)
        assert_boxes_stable(
            english_boxes,
            chinese_boxes,
            viewport_name,
        )

        for _ in range(3):
            page.locator('[data-language-option="en"]').click()
            page.wait_for_timeout(34)
            page.locator('[data-language-option="zh"]').click()
            page.wait_for_timeout(34)
        page.wait_for_timeout(280)
        rapid_switch_boxes = read_boxes(page)
        assert_boxes_stable(
            english_boxes,
            rapid_switch_boxes,
            f"{viewport_name}-rapid-switch",
        )

        overflow = page.evaluate(
            "document.documentElement.scrollWidth - window.innerWidth"
        )
        overflow_sources = page.evaluate(
            """
            () => Array.from(document.querySelectorAll("body *"))
              .map((element) => {
                const box = element.getBoundingClientRect()
                return {
                  tag: element.tagName.toLowerCase(),
                  className:
                    typeof element.className === "string"
                      ? element.className
                      : "",
                  text: (element.textContent || "")
                    .replace(/\\s+/g, " ")
                    .trim()
                    .slice(0, 80),
                  left: Number(box.left.toFixed(2)),
                  right: Number(box.right.toFixed(2)),
                  width: Number(box.width.toFixed(2)),
                }
              })
              .filter(
                (item) =>
                  item.right > window.innerWidth + 1 || item.left < -1
              )
              .sort(
                (left, right) =>
                  Math.max(right.right - window.innerWidth, 0) -
                    Math.max(left.right - window.innerWidth, 0) ||
                  left.left - right.left
              )
              .slice(0, 20)
            """
        )
        layout_widths = page.evaluate(
            """
            () => ["html", "body", "main", "#home", "#works",
              "#gallery", "#architecture", "#sandbox", "#kinetics",
              "#archive", "#contact"]
              .map((selector) => {
                const element =
                  selector === "html"
                    ? document.documentElement
                    : selector === "body"
                      ? document.body
                      : document.querySelector(selector)
                if (!element) return null
                const box = element.getBoundingClientRect()
                return {
                  selector,
                  left: Number(box.left.toFixed(2)),
                  right: Number(box.right.toFixed(2)),
                  width: Number(box.width.toFixed(2)),
                  clientWidth: element.clientWidth,
                  scrollWidth: element.scrollWidth,
                }
              })
              .filter(Boolean)
            """
        )
        assert overflow <= 1, (
            f"{viewport_name}: horizontal overflow is {overflow}px\n"
            f"{layout_widths}\n"
            f"{overflow_sources}"
        )
        page.screenshot(
            path=output_dir
            / f"{viewport_name}-{width}x{height}-zh.png",
            full_page=False,
        )
        context.close()

    browser.close()

assert not console_errors, "\n".join(console_errors)
assert not page_errors, "\n".join(page_errors)
print(
    "i18n layout check passed. Artifacts: "
    f"{output_dir.resolve()}"
)
