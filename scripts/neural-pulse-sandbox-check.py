import sys
from pathlib import Path

from playwright.sync_api import expect, sync_playwright


BASE_URL = "http://127.0.0.1:5173"
output_dir = Path(
    sys.argv[1]
    if len(sys.argv) > 1
    else "artifacts/neural-pulse-sandbox"
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
    page.locator('header nav a[href="#gallery"]').click()
    page.wait_for_timeout(900)

    pedestal = page.locator(
        '[data-exhibit-pedestal][data-exhibit-index="6"]'
    )
    pedestal.scroll_into_view_if_needed()
    pedestal.locator(
        '[data-enter-darkroom="quantum-lattice"]'
    ).click()
    modal = page.locator("[data-darkroom-inspector]")
    expect(modal).to_be_visible()
    expect(modal.get_by_role("heading", level=2)).to_contain_text(
        "Neural Pulse Sandbox"
    )
    shared_canvas = page.locator("[data-gallery-shared-canvas]")
    page.wait_for_function(
        """
        () => document.querySelector(
          '[data-gallery-shared-canvas]'
        )?.dataset.neuralPulseSandbox === 'five-layer-transformer'
        """,
        timeout=15_000,
    )

    expect(shared_canvas).to_have_attribute(
        "data-neural-pulse-sandbox",
        "five-layer-transformer",
    )
    expect(shared_canvas).to_have_attribute(
        "data-neural-layers",
        "5",
    )
    expect(shared_canvas).to_have_attribute(
        "data-neural-input-nodes",
        "8",
    )
    expect(shared_canvas).to_have_attribute(
        "data-neural-attention-heads",
        "4",
    )
    expect(shared_canvas).to_have_attribute(
        "data-neural-hidden-nodes",
        "32",
    )
    expect(shared_canvas).to_have_attribute(
        "data-neural-output-nodes",
        "8",
    )
    expect(shared_canvas).to_have_attribute(
        "data-neural-photons",
        "600",
    )
    expect(shared_canvas).to_have_attribute(
        "data-neural-synapses",
        "224",
    )
    expect(shared_canvas).to_have_attribute(
        "data-neural-attention-beams",
        "32",
    )

    panel_controls = page.locator(
        "[data-darkroom-neural-pulse-controls]"
    )
    expect(panel_controls).to_be_visible()
    stage_trigger = panel_controls.locator(
        "[data-neural-trigger-inference]"
    )
    expect(stage_trigger).to_be_visible()
    expect(
        panel_controls.locator(
            "[data-neural-training-mode-option]"
        )
    ).to_have_count(2)
    stage_trigger.click()
    expect(shared_canvas).to_have_attribute(
        "data-neural-selected-token",
        "0",
    )
    expect(shared_canvas).to_have_attribute(
        "data-neural-winner",
        "5",
    )
    page.wait_for_function(
        """
        () => Number(
          document.querySelector(
            '[data-gallery-shared-canvas]'
          )?.dataset.neuralPhotonTransitions ?? 0
        ) > 0
        """,
        timeout=5_000,
    )
    page.wait_for_timeout(1_350)
    page.screenshot(
        path=output_dir / "darkroom-neural-pulse-inference.png"
    )

    mode_options = panel_controls.locator(
        "[data-neural-training-mode-option]"
    )
    expect(mode_options).to_have_count(2)
    mode_options.nth(1).click()
    expect(shared_canvas).to_have_attribute(
        "data-neural-training-mode",
        "backprop",
    )
    expect(shared_canvas).to_have_attribute(
        "data-neural-photon-direction",
        "forward",
    )
    page.wait_for_function(
        """
        () => document.querySelector(
          '[data-gallery-shared-canvas]'
        )?.dataset.neuralGradientActive === "true"
        """,
        timeout=5_000,
    )
    assert float(
        shared_canvas.get_attribute(
            "data-neural-gradient-progress"
        )
        or "0"
    ) > 0
    expect(shared_canvas).to_have_attribute(
        "data-neural-photon-direction",
        "reverse",
    )
    page.wait_for_timeout(420)
    page.screenshot(
        path=output_dir / "darkroom-neural-backprop-gradient.png"
    )
    mode_options.nth(0).click()
    expect(shared_canvas).to_have_attribute(
        "data-neural-training-mode",
        "inference",
    )

    token_options = panel_controls.locator(
        "[data-neural-token-option]"
    )
    expect(token_options).to_have_count(8)

    token_options.nth(5).click()
    expect(shared_canvas).to_have_attribute(
        "data-neural-selected-token",
        "5",
    )
    expect(shared_canvas).to_have_attribute(
        "data-neural-winner",
        "6",
    )
    page.wait_for_function(
        """
        () => Number(
          document.querySelector(
            '[data-gallery-shared-canvas]'
          )?.dataset.neuralActiveFlashes ?? 0
        ) > 0
        """,
        timeout=4_000,
    )
    page.wait_for_timeout(1_650)
    inference_phase = shared_canvas.get_attribute(
        "data-neural-inference-phase"
    )
    assert inference_phase in {
        "attention",
        "hidden",
        "logits",
        "settled",
    }, inference_phase
    page.screenshot(
        path=output_dir / "darkroom-neural-pulse-sandbox.png"
    )

    darkroom_viewport = page.locator("[data-darkroom-viewport]")
    viewport_box = darkroom_viewport.bounding_box()
    assert viewport_box
    hidden_ndc_pairs = (
        shared_canvas.get_attribute("data-neural-hidden-ndc") or ""
    ).split(";")
    assert len(hidden_ndc_pairs) == 32, hidden_ndc_pairs
    hidden_u, hidden_v = [
        float(value) for value in hidden_ndc_pairs[5].split(",")
    ]
    hidden_hover = {
        "x": viewport_box["x"]
        + (hidden_u + 1) * 0.5 * viewport_box["width"],
        "y": viewport_box["y"]
        + (1 - hidden_v) * 0.5 * viewport_box["height"],
    }
    page.mouse.move(hidden_hover["x"], hidden_hover["y"])
    page.wait_for_function(
        """
        () => document.querySelector(
          '[data-gallery-shared-canvas]'
        )?.dataset.neuralIsolatedNode?.startsWith("hidden-")
        """,
        timeout=2_000,
    )
    expect(shared_canvas).to_have_attribute(
        "data-neural-isolated-node",
        "hidden-a-5",
    )
    expect(shared_canvas).to_have_attribute(
        "data-neural-isolation-function",
        "gelu",
    )
    page.wait_for_timeout(180)
    page.screenshot(
        path=output_dir / "darkroom-neural-node-isolation.png"
    )

    page.mouse.click(hidden_hover["x"], hidden_hover["y"])
    page.wait_for_timeout(180)
    page.mouse.move(
        viewport_box["x"] + viewport_box["width"] * 0.92,
        viewport_box["y"] + viewport_box["height"] * 0.18,
    )
    expect(shared_canvas).to_have_attribute(
        "data-neural-isolated-node",
        "hidden-a-5",
    )

    ndc_pairs = (
        shared_canvas.get_attribute("data-neural-input-ndc") or ""
    ).split(";")
    assert len(ndc_pairs) == 8, ndc_pairs
    target_u, target_v = [
        float(value) for value in ndc_pairs[3].split(",")
    ]
    direct_click = {
        "x": viewport_box["x"]
        + (target_u + 1) * 0.5 * viewport_box["width"],
        "y": viewport_box["y"]
        + (1 - target_v) * 0.5 * viewport_box["height"],
    }
    selected_before = shared_canvas.get_attribute(
        "data-neural-selected-token"
    )
    page.mouse.click(direct_click["x"], direct_click["y"])
    page.wait_for_function(
        f"""
        () => document.querySelector(
          '[data-gallery-shared-canvas]'
        )?.dataset.neuralSelectedToken !== "{selected_before}"
        """,
        timeout=3_000,
    )
    expect(shared_canvas).to_have_attribute(
        "data-neural-selected-token",
        "3",
    )
    page.wait_for_timeout(240)
    page.screenshot(
        path=output_dir / "darkroom-neural-direct-token.png"
    )

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
    mobile_page.goto(BASE_URL, wait_until="networkidle")
    mobile_page.get_by_role(
        "button", name="Open navigation menu"
    ).click()
    mobile_page.locator(
        '#mobile-navigation a[href="#gallery"]'
    ).click()
    mobile_page.wait_for_timeout(900)
    mobile_entry = mobile_page.locator(
        '[data-enter-darkroom="quantum-lattice"]'
    )
    mobile_entry.scroll_into_view_if_needed()
    mobile_entry.click()
    expect(
        mobile_page.locator("[data-darkroom-inspector]")
    ).to_be_visible()
    mobile_controls = mobile_page.locator(
        "[data-darkroom-neural-pulse-controls]"
    )
    expect(mobile_controls).to_be_visible()
    expect(
        mobile_controls.locator("[data-neural-token-option]")
    ).to_have_count(8)
    expect(
        mobile_controls.locator(
            "[data-neural-training-mode-option]"
        )
    ).to_have_count(2)
    mobile_controls.locator(
        "[data-neural-token-option]"
    ).nth(7).click()
    mobile_page.wait_for_timeout(750)
    overflow = mobile_page.evaluate(
        "document.documentElement.scrollWidth - window.innerWidth"
    )
    assert overflow <= 1, overflow
    mobile_page.screenshot(
        path=output_dir / "darkroom-neural-pulse-mobile.png"
    )
    mobile.close()
    browser.close()

assert not console_errors, "\n".join(console_errors)
assert not page_errors, "\n".join(page_errors)
print(
    "Neural pulse sandbox check passed. "
    f"Artifacts: {output_dir.resolve()}"
)
