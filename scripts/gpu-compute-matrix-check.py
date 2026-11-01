import sys
from pathlib import Path

from playwright.sync_api import expect, sync_playwright


BASE_URL = "http://127.0.0.1:5173"
output_dir = Path(
    sys.argv[1]
    if len(sys.argv) > 1
    else "artifacts/gpu-compute-matrix"
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


def open_gallery(page) -> None:
    page.locator('header nav a[href="#gallery"]').click()
    page.wait_for_timeout(900)


def set_range_value(locator, value: str) -> None:
    locator.evaluate(
        """
        (element, nextValue) => {
          const setter = Object.getOwnPropertyDescriptor(
            HTMLInputElement.prototype,
            'value'
          ).set
          setter.call(element, nextValue)
          element.dispatchEvent(new Event('input', { bubbles: true }))
          element.dispatchEvent(new Event('change', { bubbles: true }))
        }
        """,
        value,
    )


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

    pedestal = page.locator(
        '[data-exhibit-pedestal][data-exhibit-index="7"]'
    )
    pedestal.scroll_into_view_if_needed()
    shared_canvas = page.locator("[data-gallery-shared-canvas]")

    expect(shared_canvas).to_have_attribute(
        "data-gpu-compute-matrix",
        "tensor-core-bvh",
    )
    expect(shared_canvas).to_have_attribute(
        "data-gpu-tensor-dimensions",
        "8x8x8",
    )
    expect(shared_canvas).to_have_attribute(
        "data-gpu-tensor-voxels",
        "512",
    )
    expect(shared_canvas).to_have_attribute(
        "data-gpu-nvlink-particles",
        "360",
    )
    expect(shared_canvas).to_have_attribute(
        "data-gpu-bvh-nodes",
        "15",
    )
    expect(shared_canvas).to_have_attribute(
        "data-gpu-compute-mode",
        "tensor",
    )

    stage_controls = pedestal.locator("[data-gpu-compute-controls]")
    expect(stage_controls).to_be_visible()
    expect(
        stage_controls.locator("[data-gpu-compute-mode]")
    ).to_have_count(2)
    expect(
        stage_controls.locator('[data-gpu-compute-mode="tensor"]')
    ).to_have_attribute("aria-pressed", "true")
    stage_workload = stage_controls.locator(
        "[data-gpu-workload-slider]"
    )
    expect(stage_workload).to_be_visible()
    expect(stage_workload).to_have_value("68")
    expect(stage_workload).to_have_attribute("min", "10")
    expect(stage_workload).to_have_attribute("max", "100")
    expect(
        stage_controls.locator("[data-gpu-live-tflops]")
    ).to_be_visible()

    page.wait_for_function(
        """
        () => {
          const canvas = document.querySelector(
            '[data-gallery-shared-canvas]'
          )
          return Number(
            canvas?.dataset.gpuTensorActivation ?? 0
          ) > 0 && Number(canvas?.dataset.gpuBusEnergy ?? 0) > 0
        }
        """,
        timeout=6_000,
    )
    initial_tflops_text = stage_controls.locator(
        "[data-gpu-live-tflops]"
    ).inner_text()
    page.wait_for_timeout(240)
    updated_tflops_text = stage_controls.locator(
        "[data-gpu-live-tflops]"
    ).inner_text()
    assert initial_tflops_text != updated_tflops_text

    set_range_value(stage_workload, "100")
    expect(stage_workload).to_have_value("100")
    expect(
        stage_controls.locator("[data-gpu-workload-readout]")
    ).to_have_text("100%")
    expect(shared_canvas).to_have_attribute(
        "data-gpu-workload",
        "1.000",
    )
    page.wait_for_function(
        """
        () => {
          const canvas = document.querySelector(
            '[data-gallery-shared-canvas]'
          )
          return Number(
            canvas?.dataset.gpuHeatmapIntensity ?? 0
          ) > 0.95 &&
            Number(canvas?.dataset.gpuTflops ?? 0) > 850 &&
            Number(
              canvas?.dataset.gpuMemoryBandwidth ?? 0
            ) > 7.5 &&
            Number(
              canvas?.dataset.gpuScanMultiplier ?? 0
            ) > 5
        }
        """,
        timeout=5_000,
    )
    page.wait_for_timeout(420)
    page.screenshot(
        path=output_dir / "stage-gpu-overload-heatmap.png"
    )

    stage_controls.locator(
        '[data-gpu-compute-mode="bvh"]'
    ).click()
    expect(shared_canvas).to_have_attribute(
        "data-gpu-compute-mode",
        "bvh",
    )
    expect(
        stage_controls.locator('[data-gpu-compute-mode="bvh"]')
    ).to_have_attribute("aria-pressed", "true")
    page.wait_for_function(
        """
        () => Number(
          document.querySelector(
            '[data-gallery-shared-canvas]'
          )?.dataset.gpuBvhHits ?? 0
        ) > 0
        """,
        timeout=6_000,
    )
    first_ray_progress = float(
        shared_canvas.get_attribute("data-gpu-ray-progress") or "0"
    )
    page.wait_for_function(
        """
        (initialProgress) => {
          const value = Number(
            document.querySelector(
              '[data-gallery-shared-canvas]'
            )?.dataset.gpuRayProgress ?? 0
          )
          return Math.abs(value - initialProgress) > 0.025
        }
        """,
        arg=first_ray_progress,
        timeout=4_000,
    )
    page.wait_for_timeout(360)
    page.screenshot(
        path=output_dir / "stage-gpu-bvh-traversal.png"
    )

    pedestal.locator('[data-enter-darkroom="phase-torus"]').click()
    modal = page.locator("[data-darkroom-inspector]")
    expect(modal).to_be_visible()
    expect(modal.get_by_role("heading", level=2)).to_contain_text(
        "GPU Compute Matrix"
    )
    expect(
        page.locator("[data-darkroom-viewport]")
    ).to_have_attribute(
        "data-darkroom-active-exhibit",
        "phase-torus",
    )
    panel_controls = page.locator(
        "[data-darkroom-gpu-compute-controls]"
    )
    expect(panel_controls).to_be_visible()
    expect(
        panel_controls.locator("[data-gpu-compute-mode]")
    ).to_have_count(2)
    panel_workload = panel_controls.locator(
        "[data-gpu-workload-slider]"
    )
    expect(panel_workload).to_be_visible()
    expect(panel_workload).to_have_value("100")
    set_range_value(panel_workload, "86")
    expect(shared_canvas).to_have_attribute(
        "data-gpu-workload",
        "0.860",
    )
    set_range_value(panel_workload, "100")
    expect(shared_canvas).to_have_attribute(
        "data-gpu-workload",
        "1.000",
    )
    expect(
        panel_controls.locator(
            "[data-gpu-compute-mode-active]"
        )
    ).to_have_attribute("data-gpu-compute-mode-active", "bvh")

    panel_controls.locator(
        '[data-gpu-compute-mode="tensor"]'
    ).click()
    expect(shared_canvas).to_have_attribute(
        "data-gpu-compute-mode",
        "tensor",
    )
    page.wait_for_function(
        """
        () => Number(
          document.querySelector(
            '[data-gallery-shared-canvas]'
          )?.dataset.gpuTensorActivation ?? 0
        ) > 0
        """,
        timeout=5_000,
    )
    page.wait_for_function(
        """
        () => {
          const anchor = document.querySelector(
            '[data-gallery-shared-canvas]'
          )?.dataset.gpuVoxelAnchorNdc
          return Boolean(anchor?.includes(','))
        }
        """,
        timeout=5_000,
    )
    page.wait_for_timeout(540)
    page.screenshot(
        path=output_dir / "darkroom-gpu-overload-heatmap.png"
    )

    darkroom_viewport = page.locator("[data-darkroom-viewport]")
    darkroom_box = darkroom_viewport.bounding_box()
    assert darkroom_box
    anchor_u, anchor_v = [
        float(value)
        for value in (
            shared_canvas.get_attribute(
                "data-gpu-voxel-anchor-ndc"
            )
            or "0,0"
        ).split(",")
    ]
    voxel_click = {
        "x": darkroom_box["x"]
        + (anchor_u + 1) * 0.5 * darkroom_box["width"],
        "y": darkroom_box["y"]
        + (1 - anchor_v) * 0.5 * darkroom_box["height"],
    }
    page.mouse.click(voxel_click["x"], voxel_click["y"])
    page.wait_for_function(
        """
        () => document.querySelector(
          '[data-gallery-shared-canvas]'
        )?.dataset.gpuWarpActive === 'true'
        """,
        timeout=3_000,
    )
    expect(shared_canvas).to_have_attribute(
        "data-gpu-warp-size",
        "32",
    )
    expect(shared_canvas).to_have_attribute(
        "data-gpu-warp-count",
        "32",
    )
    expect(shared_canvas).to_have_attribute(
        "data-gpu-warp-voxel",
        "292",
    )
    page.wait_for_timeout(280)
    page.screenshot(
        path=output_dir / "darkroom-gpu-cuda-warp.png"
    )
    panel_controls.locator(
        '[data-gpu-compute-mode="bvh"]'
    ).click()
    expect(shared_canvas).to_have_attribute(
        "data-gpu-compute-mode",
        "bvh",
    )
    page.wait_for_function(
        """
        () => Number(
          document.querySelector(
            '[data-gallery-shared-canvas]'
          )?.dataset.gpuBvhHits ?? 0
        ) > 0
        """,
        timeout=6_000,
    )
    page.wait_for_timeout(360)
    page.screenshot(
        path=output_dir / "darkroom-gpu-bvh-traversal.png"
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
    mobile_page.wait_for_timeout(900)

    mobile_pedestal = mobile_page.locator(
        '[data-exhibit-pedestal][data-exhibit-index="7"]'
    )
    mobile_pedestal_box = None
    for _ in range(4):
        mobile_pedestal.evaluate(
            """
            (element) => element.scrollIntoView({
              block: 'center',
              inline: 'nearest',
              behavior: 'instant'
            })
            """
        )
        mobile_page.wait_for_timeout(520)
        candidate_box = mobile_pedestal.bounding_box()
        if (
            candidate_box
            and candidate_box["y"] < 844 * 0.72
            and candidate_box["y"] + candidate_box["height"] > 0
        ):
            mobile_pedestal_box = candidate_box
            break
    assert mobile_pedestal_box, "GPU pedestal did not enter the mobile viewport"
    mobile_page.wait_for_timeout(240)
    mobile_stage_controls = mobile_pedestal.locator(
        "[data-gpu-compute-controls]"
    )
    expect(mobile_stage_controls).to_be_visible()
    expect(
        mobile_stage_controls.locator("[data-gpu-compute-mode]")
    ).to_have_count(2)
    mobile_slider = mobile_stage_controls.locator(
        "[data-gpu-workload-slider]"
    )
    expect(mobile_slider).to_be_visible()
    set_range_value(mobile_slider, "100")
    expect(mobile_slider).to_have_value("100")
    assert (
        mobile_page.evaluate(
            "document.documentElement.scrollWidth - window.innerWidth"
        )
        <= 1
    )
    mobile_page.wait_for_timeout(360)
    mobile_page.screenshot(
        path=output_dir / "stage-gpu-compute-mobile.png"
    )

    mobile_pedestal.locator(
        '[data-enter-darkroom="phase-torus"]'
    ).click()
    mobile_modal = mobile_page.locator(
        "[data-darkroom-inspector]"
    )
    expect(mobile_modal).to_be_visible()
    expect(
        mobile_modal.get_by_role("heading", level=2)
    ).to_contain_text("GPU Compute Matrix")
    mobile_panel_controls = mobile_page.locator(
        "[data-darkroom-gpu-compute-controls]"
    )
    expect(mobile_panel_controls).to_be_visible()
    expect(
        mobile_panel_controls.locator(
            "[data-gpu-workload-slider]"
        )
    ).to_be_visible()
    mobile_panel_controls.locator(
        '[data-gpu-compute-mode="tensor"]'
    ).click()
    expect(
        mobile_page.locator("[data-gallery-shared-canvas]")
    ).to_have_attribute(
        "data-gpu-compute-mode",
        "tensor",
    )
    assert (
        mobile_page.evaluate(
            "document.documentElement.scrollWidth - window.innerWidth"
        )
        <= 1
    )
    mobile_page.wait_for_timeout(480)
    mobile_page.screenshot(
        path=output_dir / "darkroom-gpu-compute-mobile.png"
    )
    mobile.close()
    browser.close()

assert not console_errors, "\n".join(console_errors)
assert not page_errors, "\n".join(page_errors)
print(
    "GPU compute matrix check passed. "
    f"Artifacts: {output_dir.resolve()}"
)
