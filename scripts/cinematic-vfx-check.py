import os
from pathlib import Path
import re
import sys

from playwright.sync_api import expect, sync_playwright


BASE_URL = os.getenv(
    "CINEMATIC_BASE_URL",
    "http://127.0.0.1:5173",
)
output_dir = Path(
    sys.argv[1] if len(sys.argv) > 1 else "artifacts/cinematic-vfx"
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


def chromatic_offset(page) -> float:
    return float(
        page.locator("[data-scene-canvas]").get_attribute(
            "data-chromatic-offset"
        )
        or "0"
    )

def force_high_tier(page) -> None:
    page.evaluate(
        """
        async () => {
          const storeUrl = performance
            .getEntriesByType("resource")
            .map((entry) => entry.name)
            .find((name) => name.includes("/src/store/useAppStore.ts"))
          if (!storeUrl) throw new Error("Store module URL unavailable")
          const { useAppStore } = await import(storeUrl)
          useAppStore.setState({
            performanceTier: "high",
            applyPerformanceDowngrade: () => {},
          })
        }
        """
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
    context = browser.new_context(
        viewport={"width": 1440, "height": 1000},
        device_scale_factor=1,
        reduced_motion="no-preference",
    )
    page = context.new_page()
    collect_errors(page)
    page.goto(BASE_URL, wait_until="networkidle")
    expect(page.locator("h1")).to_be_visible()
    page.wait_for_timeout(1_200)
    force_high_tier(page)
    page.wait_for_timeout(80)

    scene = page.locator("[data-scene-canvas]")
    expect(scene).to_have_attribute("data-bloom-threshold", "0.15")
    expect(scene).to_have_attribute(
        "data-postprocessing",
        "bloom-chromatic-vignette-noise",
    )
    expect(scene).to_have_attribute("data-vfx-preset", "emerald-cyber")
    assert int(scene.get_attribute("data-aurora-vertex-count") or "0") > 0
    assert chromatic_offset(page) < 0.00001
    page.screenshot(path=output_dir / "hero-aurora-emerald.png")

    page.mouse.move(720, 520)
    for _ in range(5):
        page.mouse.wheel(0, 320)
        page.wait_for_timeout(35)

    peak_offset = 0.0
    for _ in range(48):
        peak_offset = max(peak_offset, chromatic_offset(page))
        page.wait_for_timeout(20)
    assert peak_offset > 0.00005, peak_offset
    assert peak_offset <= 0.006, peak_offset
    page.evaluate("window.scrollTo(0, 0)")
    settle_offset = peak_offset
    for _ in range(120):
        page.wait_for_timeout(25)
        settle_offset = chromatic_offset(page)
        if settle_offset == 0:
            break
    assert settle_offset < 0.00001, settle_offset

    force_high_tier(page)
    page.wait_for_timeout(80)
    page.mouse.move(170, 220)
    pointer_peak = 0.0
    for x, y in (
        (1260, 760),
        (220, 820),
        (1240, 180),
        (260, 180),
        (1180, 720),
    ):
        page.mouse.move(x, y, steps=2)
        for _ in range(5):
            pointer_peak = max(pointer_peak, chromatic_offset(page))
            page.wait_for_timeout(12)
    assert pointer_peak > 0.00005, pointer_peak
    assert pointer_peak <= 0.006, pointer_peak
    page.mouse.move(720, 500)
    for _ in range(120):
        page.wait_for_timeout(25)
        if chromatic_offset(page) == 0:
            break
    assert chromatic_offset(page) < 0.00001

    expect(
        page.locator(
            '[data-vfx-preset-switcher] [data-vfx-preset-option="supernova-gold"]'
        )
    ).to_be_visible()
    page.locator(
        '[data-vfx-preset-switcher] [data-vfx-preset-option="supernova-gold"]'
    ).click()
    expect(page.locator("html")).to_have_attribute(
        "data-vfx-preset",
        "supernova-gold",
    )
    expect(
        page.locator('[data-vfx-preset-sweep="supernova-gold"]')
    ).to_be_visible()
    expect(scene).to_have_attribute(
        "data-vfx-preset",
        "supernova-gold",
    )
    palette = page.evaluate(
        """
        () => {
          const style = getComputedStyle(document.documentElement)
          return {
            primary: style.getPropertyValue('--vfx-primary').trim(),
            secondary: style.getPropertyValue('--vfx-secondary').trim(),
          }
        }
        """
    )
    assert palette["primary"] == "#f2b35e", palette
    assert palette["secondary"] == "#ff7a1a", palette
    page.wait_for_timeout(240)
    page.screenshot(path=output_dir / "hero-aurora-supernova.png")

    page.keyboard.press("Control+K")
    expect(page.locator("[data-command-palette]")).to_be_visible()
    search = page.get_by_role("combobox", name="Search commands")
    search.fill("quantum violet")
    command = page.locator(
        '[data-command-id="vfx-quantum-violet"]'
    )
    expect(command).to_be_visible()
    command.evaluate("(element) => element.click()")
    expect(page.locator("html")).to_have_attribute(
        "data-vfx-preset",
        "quantum-violet",
    )
    expect(
        page.locator('[data-vfx-preset-sweep="quantum-violet"]')
    ).to_be_visible()
    page.wait_for_timeout(360)
    page.screenshot(path=output_dir / "hero-aurora-quantum.png")

    page.evaluate(
        """
        () => {
          const works = document.getElementById('works')
          window.scrollTo(
            0,
            works.getBoundingClientRect().top + window.scrollY - 72
          )
        }
        """
    )
    page.wait_for_timeout(700)
    first_card = page.locator("[data-spotlight-card]").first
    card_canvas = first_card.locator("[data-card-particle-canvas]")
    expect(card_canvas).to_have_attribute(
        "data-vfx-preset",
        "quantum-violet",
    )
    first_card_box = first_card.bounding_box()
    assert first_card_box
    page.mouse.move(
        first_card_box["x"] + first_card_box["width"] * 0.55,
        first_card_box["y"] + first_card_box["height"] * 0.4,
        steps=8,
    )
    page.wait_for_timeout(180)
    first_card.click(
        position={
            "x": first_card_box["width"] * 0.55,
            "y": first_card_box["height"] * 0.4,
        }
    )
    expect(page.locator("[data-bento-data-pulse]")).to_have_attribute(
        "data-pulse-id",
        re.compile(r"^[1-9]\d*$"),
    )
    card_palette = first_card.evaluate(
        """
        (element) => ({
          primary: getComputedStyle(element)
            .getPropertyValue('--vfx-primary').trim(),
          secondary: getComputedStyle(element)
            .getPropertyValue('--vfx-secondary').trim(),
          cometOpacity: getComputedStyle(
            element.querySelector('[data-comet-beam="emerald"]')
          ).opacity,
        })
        """
    )
    assert card_palette["primary"] == "#a78bfa", card_palette
    assert card_palette["secondary"] == "#67e8f9", card_palette
    assert float(card_palette["cometOpacity"]) > 0.8, card_palette
    page.wait_for_timeout(180)
    page.screenshot(path=output_dir / "bento-quantum-violet.png")

    page.set_viewport_size({"width": 390, "height": 844})
    page.evaluate("window.scrollTo(0, 0)")
    page.wait_for_timeout(350)
    page.get_by_role("button", name="Open navigation menu").click()
    mobile_preset = page.locator(
        '#mobile-navigation [data-vfx-preset-option="emerald-cyber"]'
    )
    expect(mobile_preset).to_be_visible()
    mobile_preset.click()
    expect(page.locator("html")).to_have_attribute(
        "data-vfx-preset",
        "emerald-cyber",
    )
    overflow = page.evaluate(
        "document.documentElement.scrollWidth - window.innerWidth"
    )
    assert overflow <= 1, overflow
    page.screenshot(path=output_dir / "mobile-vfx-menu.png")
    context.close()
    browser.close()

if console_errors:
    print("Console errors:")
    print("\n".join(console_errors))
if page_errors:
    print("Page errors:")
    print("\n".join(page_errors))

assert not console_errors, "Browser console reported errors"
assert not page_errors, "Browser page reported runtime errors"
print(f"Cinematic VFX test passed. Screenshots: {output_dir.resolve()}")
