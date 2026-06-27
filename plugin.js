// Typewriter / org-mode autoscroll for Thymer
// Hooks into the virtualinput textarea (shadow DOM) for keystrokes,
// then finds the rendered cursor element inside the FOCUSED panel
// and scrolls its .panel-scroller-y to keep it centred.

class Plugin extends AppPlugin {
    onLoad() {
        const TARGET_FRACTION = 0.5;   // 0.5 = dead centre, 0.38 = golden ratio
        const DEBOUNCE_MS     = 50;    // ms to wait after last keystroke
        const SMOOTH_MS       = 100;   // scroll animation duration (0 = instant)

        let enabled       = true;
        let debounceTimer = null;
        let textarea      = null;
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

            const startTop = scroller.scrollTop;
            const endTop   = startTop + delta;

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

        // ── Find cursor + scroller, scoped to the focused panel ──────────
        const CURSOR_SELECTORS = [
            '.cursor',
            '.caret',
            '.editor-cursor',
            '.text-cursor',
            '[class*="cursor"]:not(.mouse-cursor)',
            '[class*="caret"]',
        ];

        function findCursorAndScroller() {
            // The focused panel always has .has-focus; prefer that scope.
            // Fall back to searching the whole document if nothing found there.
            const roots = [
                document.querySelector('.panel.has-focus'),
                document,
            ];

            for (const root of roots) {
                if (!root) continue;
                for (const sel of CURSOR_SELECTORS) {
                    // querySelectorAll so we can check each for visibility
                    const candidates = root.querySelectorAll(sel);
                    for (const el of candidates) {
                        const r = el.getBoundingClientRect();
                        if (r.height === 0) continue; // not visible

                        // Walk up to find .panel-scroller-y
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

        this.ui.addCommandPaletteCommand({
            label:      'Toggle typewriter autoscroll',
            icon:       'ti-align-center',
            onSelected: () => statusItem.onClick?.(),
        });
    }

    onUnload() {
        clearInterval(this._pollInterval);
    }
}
