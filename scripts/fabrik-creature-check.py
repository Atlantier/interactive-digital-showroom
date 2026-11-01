import math
import os
from pathlib import Path
import sys

from playwright.sync_api import expect, sync_playwright


BASE_URL = os.getenv("VISUAL_BASE_URL", "http://127.0.0.1:5173")
output_dir = Path(sys.argv[1] if len(sys.argv) > 1 else "artifacts/fabrik")
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


def sound_counts(page):
    return page.evaluate(
        """
        async () => {
          const engineUrl = performance
            .getEntriesByType("resource")
            .map((entry) => entry.name)
            .find((name) => name.includes("/src/utils/soundEngine.ts"))
          const { soundEngine } = await import(
            engineUrl || "/src/utils/soundEngine.ts"
          )
          return soundEngine.getDiagnostics().triggerCounts
        }
        """
    )


def scroll_to_kinetics(page) -> None:
    page.evaluate(
        """
        () => {
          const section = document.getElementById("kinetics")
          window.scrollTo(
            0,
            section.getBoundingClientRect().top + window.scrollY - 72
          )
        }
        """
    )
    page.wait_for_timeout(1000)


with sync_playwright() as playwright:
    browser = playwright.chromium.launch(
        headless=True,
        executable_path=str(chrome_path) if chrome_path else None,
    )
    context = browser.new_context(
        viewport={"width": 1440, "height": 1000},
        device_scale_factor=1,
    )
    page = context.new_page()
    collect_errors(page)
    page.goto(BASE_URL, wait_until="domcontentloaded")
    expect(page.locator("h1")).to_be_visible()
    page.get_by_role("button", name="Enable interface audio").click()
    page.wait_for_timeout(120)
    scroll_to_kinetics(page)

    section = page.locator("[data-fabrik-creature]")
    stage = page.locator("[data-fabrik-stage]")
    canvas = page.locator("[data-fabrik-canvas]")
    expect(section).to_be_visible()
    expect(stage).to_be_visible()
    expect(canvas).to_be_visible()
    expect(stage).to_have_attribute("data-ik-mode", "arm")

    solver_result = page.evaluate(
        """
        async () => {
          const { solveFABRIK } = await import(
            "/src/utils/mathPhysics.ts"
          )
          const joints = [
            { x: 0, y: 0 },
            { x: 50, y: 0 },
            { x: 100, y: 0 },
          ]
          const result = solveFABRIK(
            joints,
            { x: 70, y: 30 },
            [50, 50],
            0.01,
            { maxIterations: 18, maxBendAngle: 1.5 },
          )
          const incoming = Math.atan2(
            joints[1].y - joints[0].y,
            joints[1].x - joints[0].x,
          )
          const outgoing = Math.atan2(
            joints[2].y - joints[1].y,
            joints[2].x - joints[1].x,
          )
          const bend = Math.atan2(
            Math.sin(outgoing - incoming),
            Math.cos(outgoing - incoming),
          )
          return {
            error: result.error,
            reachable: result.reachable,
            bend: Math.abs(bend),
          }
        }
        """
    )
    assert solver_result["reachable"] is True
    assert solver_result["error"] < 0.02, solver_result
    assert solver_result["bend"] <= 1.505, solver_result

    canvas_box = canvas.bounding_box()
    assert canvas_box
    site_x = canvas_box["x"] + canvas_box["width"] * 0.72
    site_y = canvas_box["y"] + canvas_box["height"] * 0.34
    page.mouse.move(site_x, site_y, steps=18)
    page.wait_for_timeout(550)

    arm_error = float(stage.get_attribute("data-fabrik-error") or "999")
    assert math.isfinite(arm_error)
    assert arm_error <= 1, arm_error
    page.screenshot(path=output_dir / "desktop-arm.png")

    before_laser_sound = sound_counts(page)
    page.mouse.click(site_x, site_y)
    page.wait_for_timeout(70)
    expect(stage).to_have_attribute("data-laser-state", "active")
    after_laser_sound = sound_counts(page)
    assert (
        after_laser_sound["laserPulse"]
        > before_laser_sound["laserPulse"]
    )
    page.screenshot(path=output_dir / "desktop-arm-laser.png")

    debug_toggle = page.get_by_role(
        "checkbox", name="Show IK Vectors"
    )
    debug_toggle.check()
    expect(debug_toggle).to_be_checked()
    expect(stage).to_have_attribute("data-debug-active", "true")
    page.wait_for_timeout(180)
    page.screenshot(path=output_dir / "desktop-arm-debug.png")

    quadruped_toggle = page.locator(
        '[data-ik-mode-option="quadruped"]'
    )
    quadruped_toggle.click()
    expect(quadruped_toggle).to_have_attribute("aria-pressed", "true")
    expect(stage).to_have_attribute("data-ik-mode", "quadruped")
    expect(stage).to_have_attribute("data-spine-nodes", "12")
    expect(stage).to_have_attribute("data-legs", "4")
    page.wait_for_timeout(450)

    stage.evaluate(
        """
        (element) => {
          const lockedGroups = new Set()
          const transitions = []
          let currentGroup = Number(element.dataset.gaitGroup || "0")
          let currentPhase = element.dataset.gaitPhase || "idle"
          if (currentPhase === "locked") lockedGroups.add(currentGroup)

          const observer = new MutationObserver((records) => {
            for (const record of records) {
              if (record.attributeName === "data-gait-group") {
                const nextGroup = Number(
                  element.dataset.gaitGroup || "0"
                )
                if (nextGroup !== currentGroup) {
                  transitions.push({
                    from: currentGroup,
                    to: nextGroup,
                    fromLocked:
                      currentPhase === "locked" ||
                      lockedGroups.has(currentGroup),
                  })
                  currentGroup = nextGroup
                }
              } else if (record.attributeName === "data-gait-phase") {
                currentPhase = element.dataset.gaitPhase || "idle"
                if (currentPhase === "locked") {
                  lockedGroups.add(currentGroup)
                }
              }
            }
          })

          observer.observe(element, {
            attributes: true,
            attributeFilter: [
              "data-gait-group",
              "data-gait-phase",
            ],
          })
          window.__fabrikGaitAudit = {
            observer,
            lockedGroups,
            transitions,
          }
        }
        """
    )

    observed_groups: set[int] = set()
    locked_groups: set[int] = set()
    lift_patterns: set[tuple[str, ...]] = set()
    group_transitions: list[tuple[int, int]] = []
    previous_group = int(stage.get_attribute("data-gait-group") or "0")
    max_creature_speed = 0.0
    ripple_screenshot_taken = False
    active_ripple_seen = False

    for step_index in range(90):
        x_fraction = 0.24 if step_index % 12 < 6 else 0.76
        y_fraction = 0.34 if step_index % 18 < 9 else 0.68
        page.mouse.move(
            canvas_box["x"] + canvas_box["width"] * x_fraction,
            canvas_box["y"] + canvas_box["height"] * y_fraction,
            steps=3,
        )
        page.wait_for_timeout(45)

        snapshot = stage.evaluate(
            """
            (element) => ({
              group: element.dataset.gaitGroup,
              phase: element.dataset.gaitPhase,
              lifting: element.dataset.liftingLegs,
              activeRipples: element.dataset.activeRipples,
              rippleCount: element.dataset.rippleCount,
              speed: element.dataset.fabrikSpeed,
            })
            """
        )
        group = int(snapshot["group"] or "0")
        phase = snapshot["phase"] or "idle"
        lifting_text = snapshot["lifting"] or ""
        lifting = tuple(
            sorted(part for part in lifting_text.split("|") if part)
        )
        active_ripples = int(
            snapshot["activeRipples"] or "0"
        )
        ripple_count = int(
            snapshot["rippleCount"] or "0"
        )
        speed = float(snapshot["speed"] or "0")

        observed_groups.add(group)
        max_creature_speed = max(max_creature_speed, speed)

        if lifting:
            expected_group = (
                ("front-left", "rear-right")
                if group == 0
                else ("front-right", "rear-left")
            )
            assert lifting == expected_group, {
                "group": group,
                "lifting": lifting,
                "phase": phase,
            }
            lift_patterns.add(lifting)

        if phase == "locked":
            assert not lifting, lifting
            locked_groups.add(group)

        if group != previous_group:
            group_transitions.append((previous_group, group))
            previous_group = group

        if active_ripples > 0:
            active_ripple_seen = True
            if not ripple_screenshot_taken:
                stage.screenshot(
                    path=output_dir / "desktop-quadruped-ripple.png"
                )
                ripple_screenshot_taken = True

        if ripple_count > 0 and len(observed_groups) == 2:
            if len(group_transitions) >= 2:
                break

    ripple_count = int(stage.get_attribute("data-ripple-count") or "0")
    gait_audit = page.evaluate(
        """
        () => {
          const audit = window.__fabrikGaitAudit
          audit.observer.disconnect()
          return {
            lockedGroups: Array.from(audit.lockedGroups),
            transitions: audit.transitions,
          }
        }
        """
    )
    locked_groups.update(gait_audit["lockedGroups"])
    assert max_creature_speed > 1, max_creature_speed
    assert observed_groups == {0, 1}, observed_groups
    assert locked_groups == {0, 1}, locked_groups
    assert gait_audit["transitions"], gait_audit
    assert all(
        transition["fromLocked"]
        for transition in gait_audit["transitions"]
    ), gait_audit
    assert len(lift_patterns) >= 1, lift_patterns
    assert len(group_transitions) >= 1, group_transitions
    assert ripple_count > 0, ripple_count
    assert active_ripple_seen
    expect(stage).to_have_attribute("data-gait-stepped", "true")
    expect(stage).to_have_attribute("data-debug-active", "true")
    page.screenshot(path=output_dir / "desktop-quadruped-debug.png")
    stage.screenshot(path=output_dir / "desktop-quadruped-debug-stage.png")

    debug_toggle.uncheck()
    expect(stage).to_have_attribute("data-debug-active", "false")
    page.wait_for_timeout(220)
    stage.screenshot(path=output_dir / "desktop-quadruped-clean-stage.png")

    page.set_viewport_size({"width": 1100, "height": 760})
    page.wait_for_timeout(450)
    resized_canvas_box = canvas.bounding_box()
    resized_stage_box = stage.bounding_box()
    assert resized_canvas_box and resized_stage_box
    assert abs(
        resized_canvas_box["width"] - resized_stage_box["width"]
    ) <= 3
    page.screenshot(path=output_dir / "desktop-quadruped-resized.png")
    context.close()

    mobile = browser.new_context(
        viewport={"width": 390, "height": 844},
        device_scale_factor=1,
        is_mobile=True,
        has_touch=True,
    )
    mobile_page = mobile.new_page()
    collect_errors(mobile_page)
    mobile_page.goto(BASE_URL, wait_until="domcontentloaded")
    expect(mobile_page.locator("h1")).to_be_visible()
    scroll_to_kinetics(mobile_page)
    mobile_stage = mobile_page.locator("[data-fabrik-stage]")
    mobile_canvas = mobile_page.locator("[data-fabrik-canvas]")
    expect(mobile_stage).to_be_visible()
    expect(mobile_canvas).to_be_visible()

    mobile_page.locator('[data-ik-mode-option="quadruped"]').click()
    expect(mobile_stage).to_have_attribute("data-ik-mode", "quadruped")
    mobile_page.get_by_role(
        "checkbox", name="Show IK Vectors"
    ).check()
    mobile_page.wait_for_timeout(500)
    overflow = mobile_page.evaluate(
        "document.documentElement.scrollWidth - window.innerWidth"
    )
    assert overflow <= 1, overflow
    mobile_page.screenshot(path=output_dir / "mobile-quadruped-debug.png")
    mobile.close()
    browser.close()

if console_errors:
    print("Console errors:")
    print("\n".join(console_errors))
if page_errors:
    print("Page errors:")
    print("\n".join(page_errors))

assert not console_errors, "Browser console reported errors"
assert not page_errors, "Browser page reported runtime errors"
print(f"FABRIK creature test passed. Screenshots: {output_dir.resolve()}")
