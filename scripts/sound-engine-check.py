import os
from pathlib import Path
import sys

from playwright.sync_api import expect, sync_playwright


BASE_URL = os.getenv("VISUAL_BASE_URL", "http://127.0.0.1:5173")
output_dir = Path(sys.argv[1] if len(sys.argv) > 1 else "artifacts/sound")
if len(sys.argv) > 2:
    BASE_URL = sys.argv[2]
output_dir.mkdir(parents=True, exist_ok=True)

console_errors: list[str] = []
page_errors: list[str] = []
media_requests: list[str] = []
chrome_candidates = [
    Path("C:/Program Files/Google/Chrome/Application/chrome.exe"),
    Path("C:/Program Files (x86)/Google/Chrome/Application/chrome.exe"),
    Path("C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"),
]
chrome_path = next((path for path in chrome_candidates if path.exists()), None)


def diagnostics(page):
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
          return soundEngine.getDiagnostics()
        }
        """
    )


with sync_playwright() as playwright:
    browser = playwright.chromium.launch(
        headless=True,
        executable_path=str(chrome_path) if chrome_path else None,
        args=["--autoplay-policy=user-gesture-required"],
    )
    context = browser.new_context(
        viewport={"width": 1600, "height": 1000},
        device_scale_factor=1,
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
    page.on(
        "request",
        lambda request: (
            media_requests.append(request.url)
            if any(
                request.url.lower().endswith(extension)
                for extension in (".mp3", ".wav", ".ogg", ".m4a", ".flac")
            )
            else None
        ),
    )

    page.goto(BASE_URL, wait_until="domcontentloaded")
    expect(page.locator("h1")).to_be_visible()

    sound_toggle = page.get_by_role(
        "button", name="Enable interface audio"
    )
    sound_toggle.click()
    expect(
        page.get_by_role("button", name="Mute interface audio")
    ).to_have_attribute("aria-pressed", "true")
    spectrum = page.locator("[data-audio-spectrum]")
    spectrum_bars = spectrum.locator("[data-spectrum-bar]")
    expect(spectrum).to_be_visible()
    expect(spectrum_bars).to_have_count(5)
    page.wait_for_timeout(120)

    engine_result = page.evaluate(
        """
        async () => {
          const engineUrl = performance
            .getEntriesByType("resource")
            .map((entry) => entry.name)
            .find((name) => name.includes("/src/utils/soundEngine.ts"))
          const { soundEngine } = await import(
            engineUrl || "/src/utils/soundEngine.ts"
          )
          const unlocked = await soundEngine.unlock()
          const hoverOne = soundEngine.playHoverTick()
          const hoverTwo = soundEngine.playHoverTick()
          await new Promise((resolve) => setTimeout(resolve, 55))
          const hoverThree = soundEngine.playHoverTick()
          const card = soundEngine.playCardActivate()
          const collision = soundEngine.playPhysicsCollision(720)
          const rope = soundEngine.playRopeSnap()
          const laser = soundEngine.playLaserPulse()
          await new Promise((resolve) => setTimeout(resolve, 80))
          const frequencyBands = new Float32Array(5)
          let spectrumPeak = 0
          let audioEnergyPeak = 0
          for (let sample = 0; sample < 8; sample += 1) {
            audioEnergyPeak = Math.max(
              audioEnergyPeak,
              soundEngine.readEnergyEnvelope(),
            )
            soundEngine.readFrequencyBands(frequencyBands)
            spectrumPeak = Math.max(
              spectrumPeak,
              frequencyBands.reduce(
                (total, value) => total + value,
                0,
              ),
            )
            await new Promise((resolve) => setTimeout(resolve, 24))
          }
          return {
            unlocked,
            hoverOne,
            hoverTwo,
            hoverThree,
            card,
            collision,
            rope,
            laser,
            spectrumPeak,
            audioEnergyPeak,
            diagnostics: soundEngine.getDiagnostics(),
          }
        }
        """
    )

    assert engine_result["unlocked"] is True, engine_result
    assert engine_result["hoverOne"] is True, engine_result
    assert engine_result["hoverTwo"] is False, engine_result
    assert engine_result["hoverThree"] is True, engine_result
    assert engine_result["card"] is True, engine_result
    assert engine_result["collision"] is True, engine_result
    assert engine_result["rope"] is True, engine_result
    assert engine_result["laser"] is True, engine_result

    initial_diagnostics = engine_result["diagnostics"]
    assert initial_diagnostics["initialized"] is True
    assert initial_diagnostics["state"] == "running"
    assert abs(initial_diagnostics["compressorRatio"] - 4.5) < 0.01
    assert initial_diagnostics["throttleWindowMs"] == 40
    assert initial_diagnostics["analyserReady"] is True
    assert 0 < engine_result["audioEnergyPeak"] <= 1, engine_result
    assert initial_diagnostics["triggerCounts"]["physicsCollision"] >= 1
    assert initial_diagnostics["triggerCounts"]["ropeSnap"] >= 1
    assert initial_diagnostics["triggerCounts"]["laserPulse"] >= 1
    assert engine_result["spectrumPeak"] > 0.01, engine_result["spectrumPeak"]

    page.evaluate(
        """
        async () => {
          const engineUrl = performance
            .getEntriesByType("resource")
            .map((entry) => entry.name)
            .find((name) => name.includes("/src/utils/soundEngine.ts"))
          const { soundEngine } = await import(
            engineUrl || "/src/utils/soundEngine.ts"
          )
          soundEngine.playLaserPulse()
          await new Promise((resolve) => setTimeout(resolve, 45))
        }
        """
    )
    page.wait_for_timeout(80)
    scene_audio_energy = float(
        page.locator("[data-scene-canvas]").get_attribute(
            "data-audio-energy"
        )
        or "0"
    )
    assert scene_audio_energy > 0.001, scene_audio_energy
    expect(page.locator("[data-scene-canvas]")).to_have_attribute(
        "data-audio-reactive",
        "stardust-aurora-volume",
    )
    spectrum_level = float(spectrum.get_attribute("data-audio-level") or "0")
    assert spectrum_level > 0.005, spectrum_level
    bar_transforms = spectrum_bars.evaluate_all(
        "(bars) => bars.map((bar) => bar.style.transform)"
    )
    assert all("scaleY" in transform for transform in bar_transforms)
    assert len(set(bar_transforms)) > 1, bar_transforms
    page.get_by_role("banner").screenshot(
        path=output_dir / "spectrum-active-header.png"
    )

    before_bento = diagnostics(page)
    page.evaluate(
        """
        () => {
          const works = document.getElementById("works")
          window.scrollTo(
            0,
            works.getBoundingClientRect().top + window.scrollY + 240
          )
        }
        """
    )
    page.wait_for_timeout(650)
    first_card = page.locator("[data-spotlight-card]").first
    first_box = first_card.bounding_box()
    assert first_box
    page.mouse.move(
        first_box["x"] + first_box["width"] * 0.55,
        first_box["y"] + first_box["height"] * 0.45,
        steps=8,
    )
    page.wait_for_timeout(160)
    first_card.click(
        position={
            "x": first_box["width"] * 0.55,
            "y": first_box["height"] * 0.45,
        }
    )
    page.wait_for_timeout(120)
    after_bento = diagnostics(page)
    assert (
        after_bento["triggerCounts"]["hoverTick"]
        > before_bento["triggerCounts"]["hoverTick"]
    )
    assert (
        after_bento["triggerCounts"]["cardActivate"]
        > before_bento["triggerCounts"]["cardActivate"]
    )

    before_architecture = diagnostics(page)
    page.evaluate(
        """
        () => {
          const section = document.querySelector(
            "[data-architecture-section]"
          )
          const bounds = section.getBoundingClientRect()
          const start = bounds.top + window.scrollY
          const distance = section.offsetHeight - window.innerHeight
          window.scrollTo(0, start + distance * 0.5)
        }
        """
    )
    page.wait_for_timeout(900)
    page.mouse.move(720, 500, steps=10)
    page.wait_for_timeout(220)
    page.mouse.click(720, 500)
    page.wait_for_timeout(150)
    architecture_audio_energy = float(
        page.locator("[data-architecture-section]").get_attribute(
            "data-audio-energy"
        )
        or "0"
    )
    assert architecture_audio_energy > 0.001, architecture_audio_energy
    expect(page.locator("[data-architecture-section]")).to_have_attribute(
        "data-audio-reactive",
        "architecture-model",
    )
    after_architecture = diagnostics(page)
    assert (
        after_architecture["triggerCounts"]["hoverTick"]
        > before_architecture["triggerCounts"]["hoverTick"]
    )
    assert (
        after_architecture["triggerCounts"]["cardActivate"]
        > before_architecture["triggerCounts"]["cardActivate"]
    )

    expect(
        page.locator("[data-architecture-hud]")
    ).to_be_visible()
    page.screenshot(path=output_dir / "sound-architecture-trigger.png")

    page.get_by_role("button", name="Mute interface audio").click()
    page.wait_for_timeout(220)
    muted_level = float(spectrum.get_attribute("data-audio-level") or "1")
    assert muted_level == 0, muted_level

    disposed_diagnostics = page.evaluate(
        """
        async () => {
          const engineUrl = performance
            .getEntriesByType("resource")
            .map((entry) => entry.name)
            .find((name) => name.includes("/src/utils/soundEngine.ts"))
          const { soundEngine } = await import(
            engineUrl || "/src/utils/soundEngine.ts"
          )
          soundEngine.dispose()
          await new Promise((resolve) => setTimeout(resolve, 80))
          return soundEngine.getDiagnostics()
        }
        """
    )
    assert disposed_diagnostics["initialized"] is False
    assert disposed_diagnostics["state"] == "uninitialized"
    assert disposed_diagnostics["analyserReady"] is False
    assert disposed_diagnostics["stageAnalyserReady"] is False
    assert disposed_diagnostics["arpeggiatorRunning"] is False

    context.close()
    browser.close()

if media_requests:
    print("Unexpected media requests:")
    print("\n".join(media_requests))
if console_errors:
    print("Console errors:")
    print("\n".join(console_errors))
if page_errors:
    print("Page errors:")
    print("\n".join(page_errors))

assert not media_requests, "External audio files were requested"
assert not console_errors, "Browser console reported errors"
assert not page_errors, "Browser page reported runtime errors"
print(f"Sound engine test passed. Screenshots: {output_dir.resolve()}")
