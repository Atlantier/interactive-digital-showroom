import os
import re
import sys
from pathlib import Path

from playwright.sync_api import expect, sync_playwright


BASE_URL = os.getenv("I18N_BASE_URL", "http://127.0.0.1:5173")
output_dir = Path(
    sys.argv[1] if len(sys.argv) > 1 else "artifacts/i18n"
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
source_root = Path(__file__).resolve().parents[1] / "src"
hard_coded_attribute = re.compile(
    r"\b(?:aria-label|title|placeholder|alt)\s*=\s*"
    r"""["'][^"']*[A-Za-z\u3400-\u9fff][^"']*["']"""
)


def assert_static_copy_is_localized() -> None:
    violations: list[str] = []
    for path in source_root.rglob("*"):
        if (
            not path.is_file()
            or path.suffix not in {".ts", ".tsx"}
            or "i18n" in path.parts
        ):
            continue
        source = path.read_text(encoding="utf-8")
        if re.search(r"[\u3400-\u9fff]", source):
            violations.append(
                f"{path.relative_to(source_root)}: CJK copy outside locale files"
            )
        for match in hard_coded_attribute.finditer(source):
            line = source.count("\n", 0, match.start()) + 1
            violations.append(
                f"{path.relative_to(source_root)}:{line}: "
                f"hard-coded accessible copy: {match.group(0)}"
            )
    assert not violations, "\n".join(violations)


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


def assert_english_only(page) -> None:
    text = page.locator("body").inner_text().replace("中文", "")
    assert re.search(r"[\u3400-\u9fff]", text) is None, text


with sync_playwright() as playwright:
    assert_static_copy_is_localized()

    browser = playwright.chromium.launch(
        headless=True,
        executable_path=str(chrome_path) if chrome_path else None,
    )
    context = browser.new_context(
        viewport={"width": 1440, "height": 1000},
        reduced_motion="no-preference",
    )
    page = context.new_page()
    collect_errors(page)
    response = page.goto(BASE_URL, wait_until="networkidle")
    assert response is not None and response.ok
    page.wait_for_timeout(500)

    expect(page.locator("html")).to_have_attribute("lang", "en")
    assert page.title() == "NODE/01 | Personal Digital Showroom"
    switcher = page.locator("[data-language-switcher]")
    expect(switcher).to_be_visible()
    expect(switcher).to_have_attribute("data-locale-active", "en")
    expect(page.locator("[data-language-highlight]")).to_have_count(1)
    expect(
        page.get_by_role("heading", level=1)
    ).to_contain_text("Make the work")
    expect(page.get_by_role("navigation", name="Showroom primary navigation")).to_be_visible()
    assert_english_only(page)
    page.screenshot(path=output_dir / "showroom-en.png")

    page.get_by_role("button", name="Enable interface audio").click()
    page.get_by_role("button", name="Switch interface to Chinese").click()
    page.wait_for_timeout(20)
    locale_motion = page.locator("main h1").evaluate(
        """
        (element) => ({
          animations: element.getAnimations().map((animation) => ({
            currentTime: animation.currentTime,
            duration: animation.effect?.getTiming().duration,
            playState: animation.playState,
          })),
          filter: getComputedStyle(element).filter,
          opacity: getComputedStyle(element).opacity,
          rootState:
            document.querySelector("[data-localized-text-root]")
              ?.getAttribute("data-locale-motion"),
        })
        """
    )
    assert locale_motion["animations"], locale_motion
    assert any(
        animation["duration"] == 220
        for animation in locale_motion["animations"]
    ), f"Locale calibration duration is not 220ms: {locale_motion}"
    running_animation = next(
        (
            animation
            for animation in locale_motion["animations"]
            if animation["playState"] == "running"
        ),
        None,
    )
    if running_animation:
        assert locale_motion["filter"] != "none", locale_motion
        assert float(locale_motion["opacity"]) < 1, locale_motion
    else:
        assert all(
            animation["playState"] == "finished"
            and float(animation["currentTime"] or 0) >= 220
            for animation in locale_motion["animations"]
        ), locale_motion
    expect(page.locator("html")).to_have_attribute("lang", "zh-CN")
    expect(switcher).to_have_attribute("data-locale-active", "zh")
    expect(
        page.get_by_role("heading", level=1)
    ).to_contain_text("让作品")
    assert page.title() == "NODE/01 | 个人数字展厅"
    assert (
        page.evaluate(
            "localStorage.getItem('showroom_locale_v1')"
        )
        == "zh"
    )
    page.wait_for_timeout(160)

    diagnostics = page.evaluate(
        """
        async () => {
          const moduleUrl = performance
            .getEntriesByType('resource')
            .map((entry) => entry.name)
            .find((name) => name.includes('/src/utils/soundEngine.ts'))
          const module = await import(
            moduleUrl || '/src/utils/soundEngine.ts'
          )
          return module.soundEngine.getDiagnostics()
        }
        """
    )
    assert diagnostics["triggerCounts"]["localeConfirm"] >= 1
    page.screenshot(path=output_dir / "showroom-zh.png")

    page.reload(wait_until="networkidle")
    page.wait_for_timeout(350)
    expect(page.locator("html")).to_have_attribute("lang", "zh-CN")
    expect(page.locator("[data-language-switcher]")).to_have_attribute(
        "data-locale-active",
        "zh",
    )
    expect(
        page.locator('#mobile-navigation a[href="#gallery"]')
    ).to_have_count(0)
    page.get_by_role("button", name="将界面切换为英文").click()
    expect(page.locator("html")).to_have_attribute("lang", "en")
    expect(page.locator("[data-language-switcher]")).to_have_attribute(
        "data-locale-active",
        "en",
    )
    assert page.title() == "NODE/01 | Personal Digital Showroom"
    assert (
        page.evaluate(
            "localStorage.getItem('showroom_locale_v1')"
        )
        == "en"
    )
    assert_english_only(page)

    browser.close()

assert not console_errors, "\n".join(console_errors)
assert not page_errors, "\n".join(page_errors)
print(f"i18n check passed. Artifacts: {output_dir.resolve()}")
