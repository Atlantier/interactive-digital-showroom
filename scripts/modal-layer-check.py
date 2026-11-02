import os
import sys
from pathlib import Path

from playwright.sync_api import expect, sync_playwright


BASE_URL = os.getenv(
    "VISUAL_BASE_URL",
    "http://127.0.0.1:5173",
)
output_dir = Path(
    sys.argv[1] if len(sys.argv) > 1 else "artifacts/modal-layer"
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


def runtime_state(page) -> dict[str, object]:
    return page.evaluate(
        """
        () => {
          const root = document.getElementById('root')
          const darkroom = document.querySelector(
            '[data-darkroom-inspector]'
          )
          const active = document.activeElement
          return {
            activeLabel: active?.getAttribute('aria-label') ?? '',
            bodyOverflow: document.body.style.overflow,
            darkroomClean:
              darkroom?.getAttribute('data-darkroom-clean-view') ?? null,
            darkroomHidden:
              darkroom?.getAttribute('aria-hidden') ?? null,
            darkroomInert:
              darkroom instanceof HTMLElement ? darkroom.inert : null,
            paletteOpen: Boolean(
              document.querySelector('[data-command-palette]')
            ),
            rootHidden: root?.getAttribute('aria-hidden') ?? null,
            rootInert: root?.inert ?? false
          }
        }
        """
    )


with sync_playwright() as playwright:
    browser = playwright.chromium.launch(
        headless=True,
        executable_path=str(chrome_path) if chrome_path else None,
    )

    desktop = browser.new_context(
        viewport={"width": 1440, "height": 1000},
        device_scale_factor=1,
        reduced_motion="no-preference",
    )
    page = desktop.new_page()
    collect_errors(page)
    page.add_init_script(
        "localStorage.setItem('showroom_locale_v1', 'en')"
    )
    response = page.goto(BASE_URL, wait_until="networkidle")
    assert response is not None and response.ok

    page.locator('header nav a[href="#gallery"]').click()
    page.wait_for_timeout(900)
    trigger = page.locator(
        '[data-enter-darkroom="prism-caustics"]'
    )
    trigger.scroll_into_view_if_needed()
    page.wait_for_timeout(250)
    trigger.click()

    dialog = page.locator("[data-darkroom-inspector]")
    expect(dialog).to_be_visible()
    page.wait_for_timeout(450)

    state = runtime_state(page)
    assert state["activeLabel"] == "Close optical darkroom", state
    assert state["bodyOverflow"] == "hidden", state
    assert state["rootHidden"] == "true", state
    assert state["rootInert"] is True, state
    assert state["darkroomInert"] is False, state

    last_focus = dialog.evaluate(
        """
        (element) => {
          const selector = [
            'a[href]',
            'button:not([disabled])',
            'input:not([disabled]):not([type="hidden"])',
            'select:not([disabled])',
            'textarea:not([disabled])',
            '[contenteditable="true"]',
            '[tabindex]:not([tabindex="-1"])',
          ].join(',')
          const focusable = Array.from(
            element.querySelectorAll(selector)
          ).filter((candidate) => {
            const style = getComputedStyle(candidate)
            return (
              style.display !== 'none' &&
              style.visibility !== 'hidden' &&
              candidate.getClientRects().length > 0
            )
          })
          focusable.at(-1)?.focus()
          return focusable.at(-1)?.getAttribute('aria-label') ?? ''
        }
        """
    )
    page.keyboard.press("Tab")
    page.wait_for_timeout(40)
    assert dialog.evaluate(
        "(element) => element.contains(document.activeElement)"
    )
    assert runtime_state(page)["activeLabel"] != last_focus

    dialog.evaluate(
        """
        (element) => {
          const selector = [
            'a[href]',
            'button:not([disabled])',
            'input:not([disabled]):not([type="hidden"])',
            'select:not([disabled])',
            'textarea:not([disabled])',
            '[contenteditable="true"]',
            '[tabindex]:not([tabindex="-1"])',
          ].join(',')
          const focusable = Array.from(
            element.querySelectorAll(selector)
          ).filter((candidate) => {
            const style = getComputedStyle(candidate)
            return (
              style.display !== 'none' &&
              style.visibility !== 'hidden' &&
              candidate.getClientRects().length > 0
            )
          })
          focusable[0]?.focus()
        }
        """
    )
    page.keyboard.press("Shift+Tab")
    page.wait_for_timeout(40)
    assert dialog.evaluate(
        "(element) => element.contains(document.activeElement)"
    )

    page.get_by_role(
        "button",
        name="Close optical darkroom",
    ).focus()
    page.keyboard.press("h")
    page.wait_for_timeout(300)
    state = runtime_state(page)
    assert state["darkroomClean"] == "true", state
    assert str(state["activeLabel"]).startswith(
        "Exit cinema clean view"
    ), state

    page.keyboard.press("Tab")
    page.wait_for_timeout(40)
    assert dialog.evaluate(
        "(element) => element.contains(document.activeElement)"
    )

    page.keyboard.press("Escape")
    page.wait_for_timeout(300)
    state = runtime_state(page)
    assert state["darkroomClean"] == "false", state
    assert state["activeLabel"] == "Close optical darkroom", state

    page.keyboard.press("Control+k")
    page.wait_for_timeout(350)
    state = runtime_state(page)
    assert state["paletteOpen"] is True, state
    assert state["activeLabel"] == "Search commands", state
    assert state["darkroomHidden"] == "true", state
    assert state["darkroomInert"] is True, state
    assert state["bodyOverflow"] == "hidden", state

    page.keyboard.press("Escape")
    page.wait_for_timeout(400)
    state = runtime_state(page)
    assert state["paletteOpen"] is False, state
    assert state["darkroomHidden"] is None, state
    assert state["darkroomInert"] is False, state
    assert state["bodyOverflow"] == "hidden", state
    assert state["rootInert"] is True, state
    assert state["activeLabel"] == "Close optical darkroom", state

    page.screenshot(path=output_dir / "darkroom-layer-restored.png")

    page.keyboard.press("Escape")
    page.wait_for_timeout(450)
    state = runtime_state(page)
    assert state["bodyOverflow"] == "", state
    assert state["rootInert"] is False, state
    assert state["rootHidden"] is None, state
    assert page.evaluate(
        """
        () => document.activeElement?.getAttribute(
          'data-enter-darkroom'
        )
        """
    ) == "prism-caustics"

    page.keyboard.press("Control+k")
    page.wait_for_timeout(350)
    state = runtime_state(page)
    assert state["paletteOpen"] is True, state
    assert state["rootInert"] is True, state
    assert state["bodyOverflow"] == "hidden", state
    page.keyboard.press("Tab")
    page.wait_for_timeout(40)
    assert page.locator("[data-command-palette]").evaluate(
        "(element) => element.contains(document.activeElement)"
    )
    page.keyboard.press("Escape")
    page.wait_for_timeout(350)
    state = runtime_state(page)
    assert state["paletteOpen"] is False, state
    assert state["rootInert"] is False, state
    assert state["bodyOverflow"] == "", state
    desktop.close()

    mobile = browser.new_context(
        viewport={"width": 390, "height": 844},
        device_scale_factor=1,
        reduced_motion="no-preference",
    )
    mobile_page = mobile.new_page()
    collect_errors(mobile_page)
    mobile_page.add_init_script(
        "localStorage.setItem('showroom_locale_v1', 'en')"
    )
    mobile_response = mobile_page.goto(
        BASE_URL,
        wait_until="networkidle",
    )
    assert mobile_response is not None and mobile_response.ok

    menu_toggle = mobile_page.locator(
        '[aria-controls="mobile-navigation"]'
    )
    menu_toggle.click()
    menu = mobile_page.locator("#mobile-navigation")
    expect(menu).to_be_visible()

    mobile_page.keyboard.press("Control+k")
    mobile_page.wait_for_timeout(350)
    expect(
        mobile_page.locator("[data-command-palette]")
    ).to_be_visible()
    mobile_page.keyboard.press("Escape")
    mobile_page.wait_for_timeout(300)
    expect(
        mobile_page.locator("[data-command-palette]")
    ).to_have_count(0)
    expect(menu).to_be_visible()

    mobile_page.keyboard.press("Escape")
    mobile_page.wait_for_timeout(250)
    expect(menu).to_have_count(0)
    mobile_page.screenshot(path=output_dir / "mobile-layer-closed.png")
    mobile.close()
    browser.close()

assert not console_errors, "\n".join(console_errors)
assert not page_errors, "\n".join(page_errors)
print(
    "Modal layer check passed. "
    f"Artifacts: {output_dir.resolve()}"
)
