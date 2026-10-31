import os
from pathlib import Path
import sys

from playwright.sync_api import expect, sync_playwright


BASE_URL = os.getenv("VISUAL_BASE_URL", "http://127.0.0.1:5173")
output_dir = Path(sys.argv[1] if len(sys.argv) > 1 else "artifacts/sandbox")
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


def scroll_to_sandbox(page) -> None:
    page.evaluate(
        """
        () => {
          const section = document.getElementById("sandbox")
          window.scrollTo(
            0,
            section.getBoundingClientRect().top + window.scrollY - 72
          )
        }
        """
    )
    page.wait_for_timeout(900)


def badge_center(box):
    return box["x"] + box["width"] * 0.5, box["y"] + box["height"] * 0.5


with sync_playwright() as playwright:
    browser = playwright.chromium.launch(
        headless=True,
        executable_path=str(chrome_path) if chrome_path else None,
    )

    desktop = browser.new_context(
        viewport={"width": 1440, "height": 1000},
        device_scale_factor=1,
    )
    page = desktop.new_page()
    collect_errors(page)
    page.goto(BASE_URL, wait_until="domcontentloaded")
    expect(page.locator("h1")).to_be_visible()
    page.get_by_role("button", name="开启界面音效").click()
    page.wait_for_timeout(150)
    scroll_to_sandbox(page)

    sandbox = page.locator("[data-verlet-sandbox]")
    stage = page.locator("[data-verlet-stage]")
    badges = page.locator("[data-verlet-badge]")
    expect(sandbox).to_be_visible()
    expect(stage).to_be_visible()
    expect(badges).to_have_count(4)
    expect(stage).to_have_attribute("data-solver-iterations", "12")

    rope_paths = page.locator("[data-lanyard-path]")
    rope_textures = page.locator("[data-lanyard-texture]")
    rope_highlights = page.locator("[data-lanyard-highlight]")
    lanyard_clips = page.locator("[data-lanyard-clip]")
    expect(rope_paths).to_have_count(4)
    expect(rope_textures).to_have_count(4)
    expect(rope_highlights).to_have_count(4)
    expect(lanyard_clips).to_have_count(4)
    initial_rope_texture_color = rope_textures.nth(0).get_attribute("stroke")
    for index in range(4):
        path_data = rope_paths.nth(index).get_attribute("d") or ""
        assert path_data
        assert " C" in path_data
        assert " Q" not in path_data

    initial_transform = badges.nth(0).get_attribute("style")
    page.wait_for_timeout(900)
    wind_transform = badges.nth(0).get_attribute("style")
    assert initial_transform != wind_transform, "Wind did not move the lanyard"
    page.screenshot(path=output_dir / "desktop-sandbox-idle.png")
    before_collision_sound = sound_counts(page)

    first_box = badges.nth(0).bounding_box()
    second_box = badges.nth(1).bounding_box()
    assert first_box and second_box
    first_x, first_y = badge_center(first_box)
    second_x, second_y = badge_center(second_box)

    page.mouse.move(first_x, first_y)
    page.mouse.down()
    page.mouse.move(
        second_x,
        second_y,
        steps=18,
    )
    page.wait_for_timeout(650)
    collision_count = int(stage.get_attribute("data-collision-count") or "0")
    assert collision_count > 0, collision_count
    after_collision_sound = sound_counts(page)
    assert (
        after_collision_sound["cardActivate"]
        > before_collision_sound["cardActivate"]
    )
    assert (
        after_collision_sound["physicsCollision"]
        > before_collision_sound["physicsCollision"]
    )
    expect(stage).to_have_attribute("data-ruptured", "false")
    page.screenshot(path=output_dir / "desktop-sandbox-obb-collision.png")
    page.mouse.up()
    page.wait_for_timeout(700)

    stage_box = stage.bounding_box()
    first_box = badges.nth(0).bounding_box()
    assert stage_box and first_box
    first_x, first_y = badge_center(first_box)
    target_x = stage_box["x"] + stage_box["width"] - 18
    target_y = stage_box["y"] + stage_box["height"] * 0.72

    page.mouse.move(first_x, first_y)
    page.mouse.down()
    reached_overload = False
    overload_step = 0
    for step in range(1, 49):
        progress = step / 48
        page.mouse.move(
            first_x + (target_x - first_x) * progress,
            first_y + (target_y - first_y) * progress,
        )
        page.wait_for_timeout(55)
        assert stage.get_attribute("data-ruptured") == "false"
        if stage.get_attribute("data-overloaded") == "true":
            reached_overload = True
            overload_step = step
            break

    assert reached_overload, "Rope never entered the overload state"
    page.wait_for_timeout(100)
    overload_tension = float(stage.get_attribute("data-tension") or "0")
    assert overload_tension > 0.62, overload_tension
    expect(stage).to_have_attribute("data-overloaded", "true")
    expect(stage).to_have_attribute("data-ruptured", "false")
    warning_path_one = rope_paths.nth(0).get_attribute("d")
    page.wait_for_timeout(160)
    warning_path_two = rope_paths.nth(0).get_attribute("d")
    assert warning_path_one != warning_path_two
    overload_rope_texture_color = rope_textures.nth(0).get_attribute("stroke")
    assert overload_rope_texture_color != initial_rope_texture_color
    page.screenshot(path=output_dir / "desktop-sandbox-overload.png")

    for step in range(overload_step + 1, 49):
        progress = step / 48
        page.mouse.move(
            first_x + (target_x - first_x) * progress,
            first_y + (target_y - first_y) * progress,
        )
        page.wait_for_timeout(55)
        if stage.get_attribute("data-ruptured") == "true":
            break

    page.wait_for_timeout(700)
    expect(stage).to_have_attribute("data-ruptured", "true")
    expect(badges.nth(0)).to_have_attribute("data-detached", "true")
    page.mouse.up()
    assert (rope_paths.nth(0).get_attribute("d") or "") == ""
    maximum_strain = float(stage.get_attribute("data-max-strain") or "0")
    assert maximum_strain > 2.5, maximum_strain
    after_snap_sound = sound_counts(page)
    assert (
        after_snap_sound["ropeSnap"]
        > after_collision_sound["ropeSnap"]
    )
    page.wait_for_timeout(800)
    page.screenshot(path=output_dir / "desktop-sandbox-ruptured.png")

    reforge = page.get_by_role(
        "button", name="一键重连恢复（Re-forge Lanyards）"
    )
    reforge.click()
    expect(stage).to_have_attribute("data-detached-count", "0")
    expect(stage).to_have_attribute("data-ruptured", "false")
    expect(badges.nth(0)).to_have_attribute("data-detached", "false")
    assert rope_paths.nth(0).get_attribute("d")
    page.wait_for_timeout(500)
    page.screenshot(path=output_dir / "desktop-sandbox-reforged.png")
    desktop.close()

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
    scroll_to_sandbox(mobile_page)

    mobile_badges = mobile_page.locator("[data-verlet-badge]")
    mobile_stage = mobile_page.locator("[data-verlet-stage]")
    expect(mobile_badges).to_have_count(4)
    assert mobile_page.evaluate(
        "document.documentElement.scrollWidth - window.innerWidth"
    ) <= 1

    mobile_first_box = mobile_badges.nth(0).bounding_box()
    mobile_second_box = mobile_badges.nth(1).bounding_box()
    assert mobile_first_box and mobile_second_box
    mobile_first_x, mobile_first_y = badge_center(mobile_first_box)
    mobile_second_x, mobile_second_y = badge_center(mobile_second_box)

    cdp = mobile.new_cdp_session(mobile_page)
    cdp.send(
        "Input.dispatchTouchEvent",
        {
            "type": "touchStart",
            "touchPoints": [
                {
                    "x": mobile_first_x,
                    "y": mobile_first_y,
                    "id": 1,
                    "radiusX": 4,
                    "radiusY": 4,
                    "force": 1,
                }
            ],
        },
    )
    for step in range(1, 13):
        progress = step / 12
        cdp.send(
            "Input.dispatchTouchEvent",
            {
                "type": "touchMove",
                "touchPoints": [
                    {
                        "x": mobile_first_x
                        + (mobile_second_x - mobile_first_x) * progress,
                        "y": mobile_first_y
                        + (mobile_second_y - mobile_first_y) * progress,
                        "id": 1,
                        "radiusX": 4,
                        "radiusY": 4,
                        "force": 1,
                    }
                ],
            },
        )
        mobile_page.wait_for_timeout(25)
    mobile_page.wait_for_timeout(450)
    mobile_collisions = int(
        mobile_stage.get_attribute("data-collision-count") or "0"
    )
    assert mobile_collisions > 0, mobile_collisions
    expect(mobile_stage).to_have_attribute("data-ruptured", "false")
    mobile_page.screenshot(path=output_dir / "mobile-sandbox-touch.png")
    cdp.send(
        "Input.dispatchTouchEvent",
        {"type": "touchEnd", "touchPoints": []},
    )
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
print(f"Verlet sandbox test passed. Screenshots: {output_dir.resolve()}")
