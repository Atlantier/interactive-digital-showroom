import os
from pathlib import Path
import re
import sys

from playwright.sync_api import expect, sync_playwright


BASE_URL = os.getenv("VISUAL_BASE_URL", "http://127.0.0.1:5173")
output_dir = Path(sys.argv[1] if len(sys.argv) > 1 else "artifacts")
test_mode = sys.argv[2] if len(sys.argv) > 2 else "all"
if len(sys.argv) > 3:
    BASE_URL = sys.argv[3]
output_dir.mkdir(parents=True, exist_ok=True)

console_errors: list[str] = []
page_errors: list[str] = []
network_errors: list[str] = []
chrome_candidates = [
    Path("C:/Program Files/Google/Chrome/Application/chrome.exe"),
    Path("C:/Program Files (x86)/Google/Chrome/Application/chrome.exe"),
    Path("C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"),
]
chrome_path = next((path for path in chrome_candidates if path.exists()), None)


def collect_page_errors(page) -> None:
    page.on(
        "console",
        lambda message: (
            console_errors.append(message.text)
            if message.type == "error"
            else None
        ),
    )
    page.on("pageerror", lambda error: page_errors.append(str(error)))
    page.on(
        "response",
        lambda response: (
            network_errors.append(
                f"{response.status} {response.url}"
            )
            if response.status >= 400
            else None
        ),
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

    if test_mode in ("all", "desktop"):
        desktop = browser.new_context(
            viewport={"width": 1440, "height": 1000},
            device_scale_factor=1,
        )
        page = desktop.new_page()
        collect_page_errors(page)

        response = page.goto(BASE_URL, wait_until="networkidle")
        assert response is not None and response.ok
        expect(page).to_have_title(re.compile("NODE/01"))
        expect(page.locator("h1")).to_be_visible()

        scene_canvas = page.locator("[data-scene-canvas]")
        canvas = scene_canvas.locator("canvas")
        expect(canvas).to_be_visible()
        particle_count = int(
            scene_canvas.get_attribute("data-particle-count")
        )
        assert particle_count in (4000, 8000), particle_count
        canvas_box = canvas.bounding_box()
        assert canvas_box and canvas_box["width"] > 1000
        assert canvas_box["height"] > 700

        page.wait_for_timeout(900)
        page.screenshot(path=output_dir / "desktop-hero.png")

        page.set_viewport_size({"width": 1100, "height": 760})
        page.wait_for_timeout(350)
        resized_canvas_box = canvas.bounding_box()
        assert resized_canvas_box
        assert 1098 <= resized_canvas_box["width"] <= 1100
        assert 758 <= resized_canvas_box["height"] <= 760
        page.screenshot(path=output_dir / "desktop-resized.png")
        page.set_viewport_size({"width": 1440, "height": 1000})
        page.wait_for_timeout(350)

        page.set_viewport_size({"width": 1600, "height": 1000})
        page.wait_for_timeout(300)
        fps_toggle = page.get_by_role(
            "button", name="Enable live FPS monitor"
        )
        fps_toggle.click()
        expect(
            page.get_by_role("button", name="Disable live FPS monitor")
        ).to_have_attribute("aria-pressed", "true")
        page.wait_for_timeout(900)
        fps_text = page.locator(
            '[aria-label="Live frame rate telemetry"]'
        ).inner_text()
        assert re.search(r"\d+\s*fps", fps_text), fps_text
        print(f"Desktop FPS sample: {fps_text}")
        page.set_viewport_size({"width": 1440, "height": 1000})
        page.wait_for_timeout(250)

        page.mouse.move(770, 330)
        page.wait_for_timeout(500)
        page.screenshot(path=output_dir / "desktop-particle-interaction.png")

        sound_toggle = page.get_by_role(
            "button", name="Enable interface audio"
        )
        sound_toggle.click()
        expect(
            page.get_by_role("button", name="Mute interface audio")
        ).to_have_attribute("aria-pressed", "true")

        page.set_viewport_size({"width": 1600, "height": 1000})
        page.wait_for_timeout(300)
        page.locator(
            'header nav[aria-label="Showroom primary navigation"] a[href="#works"]'
        ).click()
        page.wait_for_function(
            """
            () => {
              const progress = document.querySelector(
                '[role="progressbar"][aria-label="Page scroll progress"]'
              )
              return (
                window.scrollY > 300 &&
                Number(progress?.getAttribute('aria-valuenow') ?? 0) > 0
              )
            }
            """,
            timeout=3_000,
        )
        scroll_snapshot = page.evaluate(
            """
            () => {
              const progress = document.querySelector(
                '[role="progressbar"][aria-label="Page scroll progress"]'
              )
              return {
                y: window.scrollY,
                value: Number(
                  progress?.getAttribute('aria-valuenow') ?? 0
                )
              }
            }
            """
        )
        print(f"Scroll sample: {scroll_snapshot}")
        page.screenshot(path=output_dir / "desktop-warp.png")
        page.wait_for_timeout(1260)
        scroll_y = page.evaluate("window.scrollY")
        assert scroll_y > 300, scroll_y
        progress_ring = page.get_by_role(
            "progressbar", name="Page scroll progress"
        )
        expect(progress_ring).to_be_visible()
        scroll_progress = (
            int(progress_ring.get_attribute("aria-valuenow") or "0") / 100
        )
        assert 0 < scroll_progress <= 1, scroll_progress
        ring_offset = progress_ring.locator(
            "[data-scroll-progress-arc]"
        ).evaluate("(element) => parseFloat(element.style.strokeDashoffset)")
        assert 0 <= ring_offset < 100, ring_offset
        assert int(progress_ring.get_attribute("aria-valuenow")) > 0
        expect(
            page.locator(
                'header nav[aria-label="Showroom primary navigation"] a[href="#works"]'
            )
        ).to_have_attribute("aria-current", "location")
        page.set_viewport_size({"width": 1440, "height": 1000})
        page.wait_for_timeout(250)

        page.evaluate(
            """
            () => {
              const works = document.getElementById("works")
              window.scrollTo(0, works.getBoundingClientRect().top + window.scrollY + 230)
            }
            """
        )
        page.wait_for_timeout(500)

        bento_grid = page.locator("[data-bento-grid]")
        expect(bento_grid).to_be_visible()
        bento_cards = bento_grid.locator("[data-spotlight-card]")
        assert bento_cards.count() == 5
        assert bento_cards.nth(0).get_attribute("data-perimeter-comets") == "2"
        assert bento_cards.nth(0).locator("[data-comet-beam]").count() == 2
        card_particle_canvas = bento_cards.nth(0).locator(
            "[data-card-particle-canvas]"
        )
        assert (
            card_particle_canvas.get_attribute("data-card-ember-pool")
            == "96"
        )
        assert (
            card_particle_canvas.get_attribute("data-card-burst-pool")
            == "64"
        )

        main_card_box = bento_cards.nth(0).bounding_box()
        side_card_box = bento_cards.nth(1).bounding_box()
        assert main_card_box and side_card_box
        assert main_card_box["width"] > side_card_box["width"] * 1.5
        assert main_card_box["height"] > side_card_box["height"] * 1.7

        gap_x = main_card_box["x"] + main_card_box["width"] + 6
        gap_y = side_card_box["y"] + side_card_box["height"] * 0.5
        page.mouse.move(gap_x, gap_y)
        page.wait_for_timeout(120)
        border_glow = float(
            bento_cards.nth(1).evaluate(
                "(element) => getComputedStyle(element)"
                ".getPropertyValue('--border-glow-opacity')"
            )
        )
        assert border_glow > 0.2, border_glow

        page.mouse.move(
            side_card_box["x"] + side_card_box["width"] * 0.72,
            side_card_box["y"] + side_card_box["height"] * 0.3,
        )
        page.wait_for_timeout(350)
        tilt_transform = bento_cards.nth(1).evaluate(
            "(element) => getComputedStyle(element).transform"
        )
        assert tilt_transform != "none", tilt_transform
        card_motion_style = bento_cards.nth(1).evaluate(
            """
            (element) => {
              const style = getComputedStyle(element)
              return {
                transformStyle: style.transformStyle,
                willChange: style.willChange,
                backfaceVisibility: style.backfaceVisibility,
              }
            }
            """
        )
        assert card_motion_style["transformStyle"] == "preserve-3d"
        assert "transform" in card_motion_style["willChange"]
        assert card_motion_style["backfaceVisibility"] == "hidden"
        assert bento_cards.nth(1).get_attribute(
            "data-card-particle-mode"
        ) in ("rise", "attract")
        hovered_comet = bento_cards.nth(1).locator(
            '[data-comet-beam="emerald"]'
        )
        page.wait_for_function(
            """
            (element) =>
              parseFloat(getComputedStyle(element).opacity) > 0.8
            """,
            arg=hovered_comet.element_handle(),
        )
        hovered_comet_opacity = float(
            hovered_comet.evaluate(
                "(element) => getComputedStyle(element).opacity"
            )
        )
        assert hovered_comet_opacity > 0.8, hovered_comet_opacity
        page.screenshot(path=output_dir / "desktop-bento-hover.png")

        vector_button = page.get_by_role(
            "button",
            name="Vector",
            exact=True,
        )
        pulse_overlay = page.locator("[data-bento-data-pulse]")
        pulse_id_before = int(
            pulse_overlay.get_attribute("data-pulse-id") or "0"
        )
        vector_button.hover()
        page.wait_for_timeout(80)
        expect(bento_cards.nth(1)).to_have_attribute(
            "data-card-particle-mode",
            "attract",
        )
        vector_button.click()
        expect(bento_cards.nth(1)).to_have_attribute(
            "data-card-particle-mode",
            "burst",
        )
        expect(
            page.get_by_role("button", name="Vector", exact=True)
        ).to_have_attribute("aria-pressed", "true")
        expect(pulse_overlay).not_to_have_attribute(
            "data-pulse-id",
            str(pulse_id_before),
        )
        expect(
            pulse_overlay.locator(".bento-data-pulse-beam")
        ).to_have_attribute("d", re.compile(r"^M "))

        terminal_pause = page.locator(
            'button[aria-label="Pause terminal simulation"]'
        )
        if terminal_pause.count():
            terminal_pause.click()
            expect(
                page.get_by_role(
                    "button", name="Resume terminal simulation"
                )
            ).to_have_attribute("aria-pressed", "true")

        terminal_input = page.get_by_role(
            "textbox", name="Enter a terminal command"
        )
        expect(terminal_input).to_be_visible()
        terminal_output = page.locator(
            '[aria-label="Terminal command output"]'
        )

        for command in ("help", "skills", "matrix"):
            terminal_input.fill(command)
            terminal_input.press("Enter")
            expect(terminal_output).to_contain_text(f"$ {command}")
            expect(terminal_output.locator("pre").last).to_be_visible()

        terminal_input.fill("clear")
        terminal_input.press("Enter")
        expect(terminal_output).to_contain_text("Terminal buffer reset")
        assert terminal_output.locator("pre").count() == 1

        initial_tokens = page.locator("[data-token-throughput]").inner_text()
        page.wait_for_timeout(1250)
        updated_tokens = page.locator("[data-token-throughput]").inner_text()
        assert updated_tokens != initial_tokens

        page.mouse.move(1280, 260)
        page.wait_for_timeout(250)
        page.screenshot(path=output_dir / "desktop-works.png")

        architecture_section = page.locator("[data-architecture-section]")
        expect(architecture_section).to_be_attached()
        architecture_height = architecture_section.evaluate(
            "(element) => element.offsetHeight"
        )
        viewport_height = page.evaluate("window.innerHeight")
        assert abs(architecture_height - viewport_height * 3) <= 4
        sticky_position = page.locator(
            "[data-architecture-sticky]"
        ).evaluate("(element) => getComputedStyle(element).position")
        assert sticky_position == "sticky"

        def scroll_architecture(progress):
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
            page.wait_for_timeout(700)

        scroll_architecture(0.12)
        assembled_opacity = float(
            page.locator(
                '[data-architecture-phase="assembled"]'
            ).evaluate("(element) => getComputedStyle(element).opacity")
        )
        assert assembled_opacity > 0.6, assembled_opacity
        page.screenshot(path=output_dir / "architecture-assembled.png")

        scroll_architecture(0.5)
        exploded_opacity = float(
            page.locator(
                '[data-architecture-phase="exploded"]'
            ).evaluate("(element) => getComputedStyle(element).opacity")
        )
        assert exploded_opacity > 0.6, exploded_opacity
        page.screenshot(path=output_dir / "architecture-exploded.png")

        scroll_architecture(0.82)
        metrics_opacity = float(
            page.locator("[data-architecture-metrics]").evaluate(
                "(element) => getComputedStyle(element).opacity"
            )
        )
        assert metrics_opacity > 0.5, metrics_opacity
        assert page.locator(
            "[data-architecture-section] canvas"
        ).count() == 1
        page.screenshot(path=output_dir / "architecture-metrics.png")
        desktop.close()

    if test_mode in ("all", "mobile"):
        mobile = browser.new_context(
            viewport={"width": 390, "height": 844},
            device_scale_factor=1,
            is_mobile=True,
            has_touch=True,
        )
        mobile_page = mobile.new_page()
        collect_page_errors(mobile_page)
        mobile_page.goto(BASE_URL, wait_until="networkidle")
        expect(mobile_page.locator("h1")).to_be_visible()
        mobile_page.wait_for_timeout(1800)

        mobile_cdp = mobile.new_cdp_session(mobile_page)
        mobile_cdp.send(
            "Input.dispatchTouchEvent",
            {
                "type": "touchStart",
                "touchPoints": [
                    {
                        "x": 292.5,
                        "y": 211,
                        "id": 1,
                        "radiusX": 4,
                        "radiusY": 4,
                        "force": 1,
                    }
                ],
            },
        )
        mobile_cdp.send(
            "Input.dispatchTouchEvent",
            {
                "type": "touchMove",
                "touchPoints": [
                    {
                        "x": 292.5,
                        "y": 211,
                        "id": 1,
                        "radiusX": 4,
                        "radiusY": 4,
                        "force": 1,
                    }
                ],
            },
        )
        mobile_page.wait_for_timeout(80)
        pointer = mobile_page.evaluate(
            """
            async () => {
              const storeUrl = performance
                .getEntriesByType("resource")
                .map((entry) => entry.name)
                .find((name) => name.includes("/src/store/useAppStore.ts"))
              if (!storeUrl) return null
              const { readTransientState } = await import(
                storeUrl
              )
              const transient = readTransientState()
              return {
                x: transient.pointer.x,
                y: transient.pointer.y,
                pixelX: transient.pointerPixels.x,
                pixelY: transient.pointerPixels.y,
                active: transient.pointerActive,
              }
            }
            """
        )
        mobile_cdp.send(
            "Input.dispatchTouchEvent",
            {"type": "touchEnd", "touchPoints": []},
        )
        if pointer is None:
            print(
                "Production bundle detected: skipped source-store touch probe."
            )
        else:
            assert 0.45 < pointer["x"] < 0.65, pointer
            assert 0.45 < pointer["y"] < 0.65, pointer
            assert pointer["pixelX"] == 292.5
            assert pointer["pixelY"] == 211
            assert pointer["active"] is True

        overflow = mobile_page.evaluate(
            "document.documentElement.scrollWidth - window.innerWidth"
        )
        assert overflow <= 1, overflow
        mobile_page.screenshot(path=output_dir / "mobile-hero.png")

        mobile_page.get_by_role(
            "button", name="Open navigation menu"
        ).click()
        menu = mobile_page.locator("#mobile-navigation")
        expect(menu).to_be_visible()
        menu.locator('a[href="#works"]').click()
        mobile_page.wait_for_timeout(1200)
        assert mobile_page.evaluate("window.scrollY") > 500

        mobile_page.evaluate(
            """
            () => {
              const works = document.getElementById("works")
              window.scrollTo(
                0,
                works.getBoundingClientRect().top + window.scrollY + 220
              )
            }
            """
        )
        mobile_page.wait_for_timeout(400)
        mobile_grid = mobile_page.locator("[data-bento-grid]")
        expect(mobile_grid).to_be_visible()
        mobile_cards = mobile_grid.locator("[data-spotlight-card]")
        assert mobile_cards.count() == 5
        first_mobile_card = mobile_cards.nth(0).bounding_box()
        assert first_mobile_card
        assert first_mobile_card["width"] <= 390
        assert first_mobile_card["height"] >= 400
        mobile_overflow = mobile_page.evaluate(
            "document.documentElement.scrollWidth - window.innerWidth"
        )
        assert mobile_overflow <= 1, mobile_overflow
        mobile_page.screenshot(path=output_dir / "mobile-works.png")

        mobile_page.evaluate(
            """
            () => {
              const section = document.querySelector(
                "[data-architecture-section]"
              )
              const bounds = section.getBoundingClientRect()
              const start = bounds.top + window.scrollY
              const distance = section.offsetHeight - window.innerHeight
              window.scrollTo(0, start + distance * 0.82)
            }
            """
        )
        mobile_page.wait_for_timeout(800)
        mobile_metrics = mobile_page.locator("[data-architecture-metrics]")
        mobile_metrics_opacity = float(
            mobile_metrics.evaluate(
                "(element) => getComputedStyle(element).opacity"
            )
        )
        assert mobile_metrics_opacity > 0.5, mobile_metrics_opacity
        mobile_architecture_overflow = mobile_page.evaluate(
            "document.documentElement.scrollWidth - window.innerWidth"
        )
        assert mobile_architecture_overflow <= 1, mobile_architecture_overflow
        mobile_page.screenshot(path=output_dir / "mobile-architecture.png")
        mobile.close()

    browser.close()

if console_errors:
    print("Console errors:")
    print("\n".join(console_errors))
if page_errors:
    print("Page errors:")
    print("\n".join(page_errors))
if network_errors:
    print("Network errors:")
    print("\n".join(network_errors))

assert not console_errors, "Browser console reported errors"
assert not page_errors, "Browser page reported runtime errors"
assert not network_errors, "Browser network reported errors"
print(f"Visual smoke test passed. Screenshots: {output_dir.resolve()}")
