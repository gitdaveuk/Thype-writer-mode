// Thypewriter / org-mode autoscroll for Thymer
// Hooks into the virtualinput textarea (shadow DOM) for keystrokes,
// then finds the rendered cursor element in the main DOM and scrolls
// the .panel-scroller-y container to keep it centred.

class Plugin extends AppPlugin {
    onLoad() {
        const TARGET_FRACTION = 0.5;   // 0.5 = dead centre, 0.38 = golden ratio
        const DEBOUNCE_MS     = 50;    // ms to wait after last keystroke
        const SMOOTH_MS       = 100;   // scroll animation duration (0 = instant)

        let enabled      = true;
        let debounceTimer = null;
        let textarea      = null;       // the virtualinput <textarea>
        let boundHandler  = null;
        let animating     = new WeakSet();

        // ── Scroll helper ────────────────────────────────────────────────
        function scrollToTarget(scroller, targetEl) {
            if (!scroller || !targetEl) return;
            if (animating.has(scroller)) return;

            const scrollerRect = scroller.getBoundingClientRect();
            const targetRect   = targetEl.getBoundingClientRect();

            const targetMidRelative = targetRect.top + targetRect.height / 2 - scrollerRect.top;
            const desiredY          = scrollerRect.height * TARGET_FRACTION;
            const delta             = targetMidRelative - desiredY;

            if (Math.abs(delta) < 3) return;

            const startTop  = scroller.scrollTop;
            const endTop    = startTop + delta;

            if (SMOOTH_MS <= 0) { scroller.scrollTop = endTop; return; }

            animating.add(scroller);
            const t0 = performance.now();
            (function step(now) {
                const p = Math.min((now - t0) / SMOOTH_MS, 1);
                const e = 1 - Math.pow(1 - p, 3); // ease-out cubic
                scroller.scrollTop = startTop + delta * e;
                if (p < 1) requestAnimationFrame(step);
                else animating.delete(scroller);
            })(t0);
        }

        // ── Find the cursor element and its scroller ─────────────────────
        // Thymer renders a blinking cursor as a positioned element.
        // Common candidates: .cursor, .caret, [class*="cursor"], [class*="caret"]
        function findCursorAndScroller() {
            // Try known cursor selectors (broaden if needed)
            const CURSOR_SELECTORS = [
                '.cursor',
                '.caret',
                '.editor-cursor',
                '.text-cursor',
                '[class*="cursor"]:not(.mouse-cursor)',
                '[class*="caret"]',
            ];

            for (const sel of CURSOR_SELECTORS) {
                const el = document.querySelector(sel);
                if (el && el.getBoundingClientRect().height > 0) {
                    // Find its .panel-scroller-y ancestor
                    let p = el.parentElement;
                    while (p) {
                        if (p.classList.contains('panel-scroller-y')) {
                            return { cursor: el, scroller: p };
                        }
                        p = p.parentElement;
                    }
                    // Fallback: first scrollable ancestor
                    p = el.parentElement;
                    while (p) {
                        if (p.scrollHeight > p.clientHeight &&
                            getComputedStyle(p).overflowY !== 'visible') {
                            return { cursor: el, scroller: p };
                        }
                        p = p.parentElement;
                    }
                }
            }
            return null;
        }

        // ── Main handler ─────────────────────────────────────────────────
        function onInput() {
            if (!enabled) return;
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
                const found = findCursorAndScroller();
                if (found) scrollToTarget(found.scroller, found.cursor);
            }, DEBOUNCE_MS);
        }

        // ── Attach to virtualinput (may not exist until editor opens) ────
        function attachToTextarea() {
            const wrapper = document.getElementById('virtualinput-wrapper');
            const sr      = wrapper?.shadowRoot;
            if (!sr) return false;

            const ta = sr.getElementById('virtualinput');
            if (!ta || ta === textarea) return !!textarea;

            // Detach from old one if any
            if (textarea && boundHandler) {
                textarea.removeEventListener('keydown', boundHandler, true);
                textarea.removeEventListener('input',   boundHandler, true);
            }

            textarea     = ta;
            boundHandler = onInput;
            textarea.addEventListener('keydown', boundHandler, true);
            textarea.addEventListener('input',   boundHandler, true);
            return true;
        }

        // Try immediately, then poll until found
        if (!attachToTextarea()) {
            const poll = setInterval(() => {
                if (attachToTextarea()) clearInterval(poll);
            }, 500);
            this._pollInterval = poll;
        }

        // ── Status-bar toggle ────────────────────────────────────────────
        const statusItem = this.ui.addStatusBarItem({
            label:   '✦ Typewriter',
            icon:    'ti-align-center',
            tooltip: 'Typewriter autoscroll ON — click to toggle',
            onClick: () => {
                enabled = !enabled;
                statusItem.setLabel(enabled ? '✦ Typewriter' : '○ Typewriter');
                statusItem.setTooltip(
                    enabled
                        ? 'Typewriter autoscroll ON — click to toggle'
                        : 'Typewriter autoscroll OFF — click to toggle'
                );
            },
        });

        // ── Command palette ──────────────────────────────────────────────
        this.ui.addCommandPaletteCommand({
            label:      'Toggle typewriter autoscroll',
            icon:       'ti-align-center',
            onSelected: () => statusItem.onClick?.(),
        });
    }

    onUnload() {
        clearTimeout(this._debounceTimer);
        clearInterval(this._pollInterval);
    }
}
