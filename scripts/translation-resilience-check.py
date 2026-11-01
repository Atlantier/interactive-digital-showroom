import sys
from pathlib import Path

from playwright.sync_api import expect, sync_playwright


BASE_URL = "http://127.0.0.1:5173"
output_dir = Path(
    sys.argv[1]
    if len(sys.argv) > 1
    else "artifacts/translation-resilience"
)
if len(sys.argv) > 2:
    BASE_URL = sys.argv[2]
output_dir.mkdir(parents=True, exist_ok=True)

chrome_candidates = [
    Path("C:/Program Files/Google/Chrome/Application/chrome.exe"),
    Path("C:/Program Files (x86)/Google/Chrome/Application/chrome.exe"),
    Path("C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"),
]
chrome_path = next(
    (candidate for candidate in chrome_candidates if candidate.exists()),
    None,
)

console_errors: list[str] = []
page_errors: list[str] = []


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
    )
    page = context.new_page()
    collect_errors(page)
    page.add_init_script(
        "localStorage.setItem('showroom_locale_v1', 'en')"
    )
    response = page.goto(BASE_URL, wait_until="networkidle")
    assert response is not None and response.ok
    page.wait_for_timeout(900)

    translated_text_nodes = page.evaluate(
        """
        async () => {
          document.documentElement.classList.add('translated-ltr')
          await new Promise((resolve) => setTimeout(resolve, 250))

          const walker = document.createTreeWalker(
            document.body,
            NodeFilter.SHOW_TEXT,
            {
              acceptNode(node) {
                if (!node.textContent?.trim()) {
                  return NodeFilter.FILTER_REJECT
                }
                const parent = node.parentElement
                if (
                  !parent ||
                  parent.closest(
                    'script, style, canvas, svg, textarea, input'
                  )
                ) {
                  return NodeFilter.FILTER_REJECT
                }
                return NodeFilter.FILTER_ACCEPT
              },
            },
          )
          const nodes = []
          while (walker.nextNode()) nodes.push(walker.currentNode)

          let translated = 0
          for (const node of nodes) {
            const parent = node.parentNode
            if (!parent) continue
            const wrapper = document.createElement('font')
            wrapper.setAttribute('data-simulated-translation', 'true')
            wrapper.textContent = `译 ${node.textContent}`
            parent.insertBefore(wrapper, node)
            parent.removeChild(node)
            translated += 1
          }
          return translated
        }
        """
    )
    assert translated_text_nodes > 0, translated_text_nodes
    page.wait_for_timeout(300)

    page.keyboard.press("Control+K")
    expect(page.locator("[data-command-palette]")).to_be_visible()
    page.keyboard.press("Escape")
    expect(page.locator("[data-command-palette]")).to_be_hidden()

    page.locator('[data-language-option="zh"]').evaluate(
        "(element) => element.click()"
    )
    page.wait_for_timeout(700)

    expect(page.locator("#root")).to_have_count(1)
    expect(page.locator("[data-app-error-fallback]")).to_have_count(0)
    expect(page.locator("[data-exhibit-pedestal]")).to_have_count(8)
    expect(page.locator("main h1")).to_be_visible()
    assert (
        page.evaluate("document.documentElement.dataset.locale")
        == "zh"
    )
    page.screenshot(
        path=output_dir / "translated-page-recovered.png",
        full_page=False,
    )

    context.close()
    browser.close()

assert not console_errors, "\n".join(console_errors)
assert not page_errors, "\n".join(page_errors)
print(
    "Translation resilience check passed. "
    f"Artifacts: {output_dir.resolve()}"
)
