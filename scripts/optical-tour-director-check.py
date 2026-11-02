import sys
from pathlib import Path

from playwright.sync_api import expect, sync_playwright


BASE_URL = "http://127.0.0.1:5173"
output_dir = Path(
    sys.argv[1]
    if len(sys.argv) > 1
    else "artifacts/optical-tour-director"
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

CLIMAX_ORDER = [
    "prism-caustics",
    "laser-scan-hologram",
    "particle-morph",
    "plasma-reactor",
    "photonic-mesh",
    "orbital-lens",
    "quantum-lattice",
    "phase-torus",
]


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


def open_gallery(page) -> None:
    page.locator('header nav a[href="#gallery"]').click()
    page.wait_for_timeout(1_100)


def wait_for_climax(page, exhibit_id: str) -> None:
    page.wait_for_function(
        """
        (expectedId) => {
          const hud = document.querySelector(
            '[data-optical-tour-hud]'
          )
          return hud?.dataset.opticalTourClimaxExhibit ===
            expectedId &&
            hud?.dataset.opticalTourClimaxFired === 'true'
        }
        """,
        arg=exhibit_id,
        timeout=6_500,
    )


def viewport_runtime_state(page) -> list[dict[str, object]]:
    return page.evaluate(
        """
        () => Array.from(
          document.querySelectorAll('[data-exhibit-pedestal]')
        ).map((pedestal) => {
          const rect = pedestal.getBoundingClientRect()
          return {
            index: Number(pedestal.dataset.exhibitIndex ?? -1),
            active:
              pedestal.dataset.galleryPreviewActive === 'true',
            inView:
              pedestal.dataset.galleryInView === 'true',
            intersects:
              rect.bottom > 0 &&
              rect.top < window.innerHeight &&
              rect.right > 0 &&
              rect.left < window.innerWidth,
            top: rect.top,
            bottom: rect.bottom
          }
        })
        """
    )


def assert_viewport_sleep(page) -> None:
    state = viewport_runtime_state(page)
    active = [item for item in state if item["active"]]
    assert active, state
    assert len(active) < 8, state
    assert all(item["intersects"] for item in active), state
    offscreen = [item for item in state if not item["intersects"]]
    assert all(not item["active"] for item in offscreen), state


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

    shared_canvas = page.locator("[data-gallery-shared-canvas]")
    quick_dock = page.locator("[data-gallery-quick-dock]")
    expect(quick_dock).to_be_visible()
    expect(
        quick_dock.locator("[data-gallery-quick-item]")
    ).to_have_count(8)
    quick_formula = quick_dock.locator("code").inner_text()
    assert "=" in quick_formula

    page.locator(
        '[data-exhibit-pedestal][data-exhibit-index="0"]'
    ).scroll_into_view_if_needed()
    page.wait_for_timeout(500)
    assert_viewport_sleep(page)

    gpu_pedestal = page.locator(
        '[data-exhibit-pedestal][data-exhibit-index="7"]'
    )
    gpu_pedestal.scroll_into_view_if_needed()
    page.wait_for_timeout(650)
    assert_viewport_sleep(page)
    page.screenshot(
        path=output_dir / "quick-dock-gallery-viewport.png"
    )

    tour_toggle = page.locator("[data-gallery-tour-toggle]")
    tour_toggle.scroll_into_view_if_needed()
    tour_toggle.click()
    hud = page.locator("[data-optical-tour-hud]")
    expect(hud).to_be_visible()
    expect(hud).to_have_attribute(
        "data-optical-tour-step-ms",
        "6000",
    )
    expect(hud).to_have_attribute(
        "data-optical-tour-climax-ms",
        "2000",
    )
    expect(hud).to_have_attribute(
        "data-optical-tour-mode",
        "gallery",
    )

    wait_for_climax(page, CLIMAX_ORDER[0])
    expect(
        page.locator(
            '[data-exhibit-pedestal][data-exhibit-index="0"]'
        )
    ).to_have_attribute(
        "data-tour-current",
        "true",
    )
    page.screenshot(
        path=output_dir / "tour-prism-auto-climax.png"
    )

    pause_button = hud.locator("[data-optical-tour-pause]")
    pause_button.click()
    expect(hud).to_have_attribute(
        "data-optical-tour-paused",
        "true",
    )
    paused_elapsed = float(
        hud.get_attribute("data-optical-tour-elapsed") or "0"
    )
    page.wait_for_timeout(520)
    assert (
        abs(
            float(
                hud.get_attribute("data-optical-tour-elapsed")
                or "0"
            )
            - paused_elapsed
        )
        < 0.04
    )
    pause_button.click()
    expect(hud).to_have_attribute(
        "data-optical-tour-paused",
        "false",
    )

    for step, exhibit_id in enumerate(CLIMAX_ORDER[1:], start=1):
        hud.locator("[data-optical-tour-skip]").click()
        expect(hud).to_have_attribute(
            "data-optical-tour-index",
            str(step),
        )
        wait_for_climax(page, exhibit_id)
        if exhibit_id == "particle-morph":
            expect(
                page.locator(
                    '[data-exhibit-pedestal]'
                    '[data-exhibit-index="2"] '
                    "[data-particle-manifold-switcher]"
                )
            ).to_have_attribute(
                "data-particle-manifold-active",
                "double-helix",
            )
        elif exhibit_id == "plasma-reactor":
            expect(
                page.locator(
                    '[data-exhibit-pedestal]'
                    '[data-exhibit-index="3"] '
                    "[data-reactor-overdrive]"
                )
            ).to_have_attribute(
                "data-reactor-overdrive-phase",
                "charging",
            )
        elif exhibit_id == "photonic-mesh":
            expect(
                page.locator(
                    '[data-exhibit-pedestal]'
                    '[data-exhibit-index="4"] '
                    "[data-ray-maze-controls]"
                )
            ).to_have_attribute(
                "data-ray-maze-layout",
                "0",
            )
        elif exhibit_id == "orbital-lens":
            expect(
                page.locator(
                    '[data-exhibit-pedestal]'
                    '[data-exhibit-index="5"] '
                    "[data-audio-stage-controls]"
                )
            ).to_have_attribute(
                "data-audio-stage-playing",
                "true",
            )
        elif exhibit_id == "quantum-lattice":
            expect(
                page.locator(
                    '[data-exhibit-pedestal]'
                    '[data-exhibit-index="6"] '
                    "[data-neural-inference-controls]"
                )
            ).to_have_attribute(
                "data-neural-training-mode",
                "backprop",
            )
        elif exhibit_id == "phase-torus":
            expect(
                page.locator(
                    '[data-exhibit-pedestal]'
                    '[data-exhibit-index="7"] '
                    "[data-gpu-compute-controls]"
                )
            ).to_have_attribute(
                "data-gpu-workload-active",
                "100",
            )
            page.screenshot(
                path=output_dir / "tour-gpu-auto-climax.png"
            )

    hud.locator("[data-optical-tour-exit]").click()
    expect(hud).to_be_hidden()

    page.keyboard.press("Control+K")
    palette = page.locator("[data-command-palette]")
    expect(palette).to_be_visible()
    search = palette.get_by_role("combobox")
    search.fill("Light Show Tour")
    tour_command = palette.locator(
        '[data-command-id="tour-light-show"]'
    )
    expect(tour_command).to_be_visible()
    tour_command.click()
    expect(hud).to_be_visible()
    expect(hud).to_have_attribute(
        "data-optical-tour-mode",
        "gallery",
    )
    hud.locator("[data-optical-tour-exit]").click()

    first_darkroom = page.locator(
        '[data-enter-darkroom="prism-caustics"]'
    )
    first_darkroom.scroll_into_view_if_needed()
    first_darkroom.click()
    modal = page.locator("[data-darkroom-inspector]")
    expect(modal).to_be_visible()
    expect(quick_dock).to_be_visible()
    quick_dock.locator('[data-gallery-quick-item="6"]').click()
    expect(
        page.locator("[data-darkroom-viewport]")
    ).to_have_attribute(
        "data-darkroom-active-exhibit",
        "quantum-lattice",
    )
    assert "Attention" in quick_dock.locator("code").inner_text()

    page.keyboard.press("Control+K")
    expect(palette).to_be_visible()
    palette.get_by_role("combobox").fill("Light Show Tour")
    palette.locator('[data-command-id="tour-light-show"]').click()
    expect(hud).to_be_visible()
    expect(hud).to_have_attribute(
        "data-optical-tour-mode",
        "darkroom",
    )
    expect(
        page.locator("[data-darkroom-viewport]")
    ).to_have_attribute(
        "data-darkroom-active-exhibit",
        "prism-caustics",
    )
    wait_for_climax(page, "prism-caustics")
    page.screenshot(
        path=output_dir / "darkroom-tour-prism-climax.png"
    )
    hud.locator("[data-optical-tour-pause]").click()
    expect(hud).to_have_attribute(
        "data-optical-tour-paused",
        "true",
    )
    hud.locator("[data-optical-tour-exit]").click()
    modal.get_by_role("button", name="Close optical darkroom").click()
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
    mobile_page.wait_for_timeout(1_100)
    mobile_dock = mobile_page.locator("[data-gallery-quick-dock]")
    expect(mobile_dock).to_be_visible()
    expect(
        mobile_dock.locator("[data-gallery-quick-item]")
    ).to_have_count(8)
    mobile_toggle = mobile_page.locator(
        "[data-gallery-tour-toggle]"
    )
    mobile_toggle.scroll_into_view_if_needed()
    mobile_toggle.click()
    mobile_hud = mobile_page.locator("[data-optical-tour-hud]")
    expect(mobile_hud).to_be_visible()
    assert (
        mobile_page.evaluate(
            "document.documentElement.scrollWidth - window.innerWidth"
        )
        <= 1
    )
    mobile_hud.locator("[data-optical-tour-pause]").click()
    expect(mobile_hud).to_have_attribute(
        "data-optical-tour-paused",
        "true",
    )
    mobile_page.screenshot(
        path=output_dir / "optical-tour-director-mobile.png"
    )
    mobile.close()
    browser.close()

assert not console_errors, "\n".join(console_errors)
assert not page_errors, "\n".join(page_errors)
print(
    "Optical tour director check passed. "
    f"Artifacts: {output_dir.resolve()}"
)
