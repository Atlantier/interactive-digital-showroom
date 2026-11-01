import sys
from pathlib import Path

from playwright.sync_api import expect, sync_playwright


BASE_URL = "http://127.0.0.1:5173"
output_dir = Path(
    sys.argv[1]
    if len(sys.argv) > 1
    else "artifacts/audio-spectrum-stage"
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


with sync_playwright() as playwright:
    browser = playwright.chromium.launch(
        headless=True,
        executable_path=str(chrome_path) if chrome_path else None,
        args=["--autoplay-policy=no-user-gesture-required"],
    )
    context = browser.new_context(
        viewport={"width": 1440, "height": 1000},
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
    page.on("pageerror", lambda error: page_errors.append(str(error)))

    response = page.goto(BASE_URL, wait_until="networkidle")
    assert response is not None and response.ok
    page.locator('header nav a[href="#gallery"]').click()
    page.wait_for_timeout(900)

    pedestal = page.locator('[data-exhibit-pedestal][data-exhibit-index="5"]')
    pedestal.scroll_into_view_if_needed()
    stage = pedestal.locator("[data-gallery-stage]")
    stage.scroll_into_view_if_needed()
    shared_canvas = page.locator("[data-gallery-shared-canvas]")

    expect(shared_canvas).to_have_attribute(
        "data-audio-spectrum-stage",
        "instanced-256",
    )
    expect(shared_canvas).to_have_attribute(
        "data-audio-spectrum-fft",
        "512",
    )
    expect(shared_canvas).to_have_attribute(
        "data-audio-spectrum-pillars",
        "256",
    )
    expect(shared_canvas).to_have_attribute(
        "data-audio-spectrum-orbs",
        "256",
    )
    expect(shared_canvas).to_have_attribute(
        "data-audio-spectrum-grid",
        "16x16",
    )
    expect(shared_canvas).to_have_attribute(
        "data-audio-spectrum-pillar-geometry",
        "hex-prism",
    )
    expect(shared_canvas).to_have_attribute(
        "data-audio-spectrum-modes",
        "matrix,sunburst,waterfall",
    )
    expect(shared_canvas).to_have_attribute(
        "data-audio-spectrum-mode",
        "matrix",
    )
    expect(shared_canvas).to_have_attribute(
        "data-audio-spectrum-sunburst-bars",
        "192",
    )
    expect(shared_canvas).to_have_attribute(
        "data-audio-spectrum-terrain-grid",
        "64x24",
    )
    expect(shared_canvas).to_have_attribute(
        "data-audio-spectrum-light-pads",
        "8",
    )
    expect(shared_canvas).to_have_attribute(
        "data-audio-spectrum-spotlights",
        "4",
    )

    play_button = pedestal.locator("[data-audio-stage-play]")
    expect(play_button).to_be_visible()
    play_button.click()
    expect(play_button).to_have_attribute("aria-pressed", "true")
    expect(shared_canvas).to_have_attribute(
        "data-audio-spectrum-playing",
        "true",
    )
    page.wait_for_function(
        """
        () => {
          const canvas = document.querySelector(
            '[data-gallery-shared-canvas]'
          )
          return Number(canvas?.dataset.audioSpectrumMaxHeight ?? 0) > 0.12 &&
            Number(canvas?.dataset.audioSpectrumBass ?? 0) > 0.01
        }
        """,
        timeout=5_000,
    )
    source = shared_canvas.get_attribute("data-audio-spectrum-source")
    assert source in {"analyser", "simulation"}, source
    page.wait_for_timeout(650)
    page.screenshot(path=output_dir / "stage-audio-spectrum.png")

    stage_modes = pedestal.locator(
        "[data-audio-stage-mode-selector] [data-audio-stage-mode]"
    )
    expect(stage_modes).to_have_count(3)
    pedestal.locator('[data-audio-stage-mode="sunburst"]').click()
    expect(shared_canvas).to_have_attribute(
        "data-audio-spectrum-mode",
        "sunburst",
    )
    page.wait_for_timeout(620)
    page.screenshot(path=output_dir / "stage-audio-sunburst.png")
    terrain_slice_before = int(
        shared_canvas.get_attribute(
            "data-audio-spectrum-terrain-slice"
        )
        or "0"
    )
    pedestal.locator('[data-audio-stage-mode="waterfall"]').click()
    expect(shared_canvas).to_have_attribute(
        "data-audio-spectrum-mode",
        "waterfall",
    )
    page.wait_for_function(
        f"""
        () => Number(
          document.querySelector(
            '[data-gallery-shared-canvas]'
          )?.dataset.audioSpectrumTerrainSlice ?? 0
        ) > {terrain_slice_before}
        """,
        timeout=2_000,
    )
    page.wait_for_timeout(760)
    page.screenshot(path=output_dir / "stage-audio-waterfall.png")
    pedestal.locator('[data-audio-stage-mode="matrix"]').click()
    expect(shared_canvas).to_have_attribute(
        "data-audio-spectrum-mode",
        "matrix",
    )

    page.locator('[data-enter-darkroom="orbital-lens"]').click()
    modal = page.locator("[data-darkroom-inspector]")
    expect(modal).to_be_visible()
    expect(modal.get_by_role("heading", level=2)).to_contain_text(
        "Audio Spectrum Stage"
    )
    expect(
        page.locator("[data-darkroom-audio-stage-controls]")
    ).to_be_visible()
    expect(shared_canvas).to_have_attribute(
        "data-audio-spectrum-playing",
        "true",
    )
    expect(
        page.locator(
            "[data-darkroom-audio-stage-controls] "
            "[data-audio-stage-mode]"
        )
    ).to_have_count(3)
    modal.locator('[data-audio-stage-mode="waterfall"]').click()
    expect(shared_canvas).to_have_attribute(
        "data-audio-spectrum-mode",
        "waterfall",
    )
    page.wait_for_timeout(680)
    page.screenshot(
        path=output_dir / "darkroom-audio-waterfall.png"
    )
    modal.locator('[data-audio-stage-mode="matrix"]').click()
    expect(shared_canvas).to_have_attribute(
        "data-audio-spectrum-mode",
        "matrix",
    )
    light_pads = page.locator(
        "[data-audio-stage-pads] [data-audio-stage-pad]"
    )
    expect(light_pads).to_have_count(8)
    page.wait_for_timeout(850)
    assert float(
        shared_canvas.get_attribute("data-audio-spectrum-peak-rise")
        or "0"
    ) >= 0
    page.screenshot(path=output_dir / "darkroom-audio-spectrum.png")

    pulse_pad = page.locator(
        '[data-audio-stage-pad][data-audio-stage-pad-index="3"]'
    )
    pulse_pad.scroll_into_view_if_needed()
    pad_hits_before = int(
        shared_canvas.get_attribute("data-audio-spectrum-pad-hits")
        or "0"
    )
    pulse_pad.click()
    page.wait_for_function(
        f"""
        () => {{
          const canvas = document.querySelector(
            '[data-gallery-shared-canvas]'
          )
          return Number(
            canvas?.dataset.audioSpectrumPadHits ?? 0
          ) > {pad_hits_before} &&
            Number(
              canvas?.dataset.audioSpectrumActivePulses ?? 0
            ) > 0 &&
            canvas?.dataset.audioSpectrumLastPad === "3"
        }}
        """,
        timeout=2_000,
    )
    page.wait_for_timeout(180)
    page.screenshot(
        path=output_dir / "darkroom-audio-light-pad-wave.png"
    )

    panel_play = page.locator(
        "[data-darkroom-audio-stage-controls] [data-audio-stage-play]"
    )
    panel_play.click()
    expect(shared_canvas).to_have_attribute(
        "data-audio-spectrum-playing",
        "false",
    )

    mobile = browser.new_context(
        viewport={"width": 390, "height": 844},
        device_scale_factor=1,
        is_mobile=True,
        has_touch=True,
        reduced_motion="no-preference",
    )
    mobile_page = mobile.new_page()
    mobile_page.on(
        "console",
        lambda message: (
            console_errors.append(message.text)
            if message.type == "error"
            else None
        ),
    )
    mobile_page.on(
        "pageerror",
        lambda error: page_errors.append(str(error)),
    )
    mobile_page.goto(BASE_URL, wait_until="networkidle")
    mobile_page.locator(
        'button[aria-label="Open navigation menu"]'
    ).click()
    mobile_page.locator(
        '#mobile-navigation a[href="#gallery"]'
    ).click()
    mobile_page.wait_for_timeout(900)
    mobile_entry = mobile_page.locator(
        '[data-enter-darkroom="orbital-lens"]'
    )
    mobile_entry.scroll_into_view_if_needed()
    mobile_entry.click()
    expect(
        mobile_page.locator("[data-darkroom-inspector]")
    ).to_be_visible()
    mobile_panel_play = mobile_page.locator(
        "[data-darkroom-audio-stage-controls] [data-audio-stage-play]"
    )
    mobile_panel_play.click()
    mobile_mode_selector = mobile_page.locator(
        "[data-darkroom-audio-stage-controls] "
        "[data-audio-stage-mode-selector]"
    )
    expect(mobile_mode_selector).to_be_visible()
    expect(
        mobile_mode_selector.locator("[data-audio-stage-mode]")
    ).to_have_count(3)
    mobile_pads = mobile_page.locator(
        "[data-audio-stage-pads] [data-audio-stage-pad]"
    )
    expect(mobile_pads).to_have_count(8)
    mobile_pad = mobile_page.locator(
        '[data-audio-stage-pad][data-audio-stage-pad-index="7"]'
    )
    mobile_pad.scroll_into_view_if_needed()
    mobile_pad.click()
    mobile_page.wait_for_timeout(700)
    overflow = mobile_page.evaluate(
        "document.documentElement.scrollWidth - window.innerWidth"
    )
    assert overflow <= 1, overflow
    mobile_page.screenshot(
        path=output_dir / "darkroom-audio-spectrum-mobile.png"
    )
    mobile.close()
    context.close()
    browser.close()

assert not console_errors, "\n".join(console_errors)
assert not page_errors, "\n".join(page_errors)
print(
    "Audio spectrum stage check passed. "
    f"Artifacts: {output_dir.resolve()}"
)
