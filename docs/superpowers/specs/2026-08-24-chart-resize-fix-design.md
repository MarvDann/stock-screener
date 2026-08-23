# Design: Fix chart overflow on card resize

## Problem

`PriceChart.vue` renders a `lightweight-charts` instance inside each `CandidateCard`. The candidate cards live in a responsive CSS grid (`BreakoutView.vue`: `grid-template-columns: repeat(auto-fill, minmax(280px, 1fr))`), so card width changes whenever the viewport is resized. The chart, however, is only sized once, at mount time, to `container.value.clientWidth` (`PriceChart.vue`'s `render()`, called from `onMounted`). There is no resize handling — `lightweight-charts` does not auto-resize its canvas. On any resize that narrows a card's grid track, the chart's canvas keeps its original pixel width and overflows the card boundary.

## Fix

Add a `ResizeObserver` on the chart's container `div` in `PriceChart.vue`:

- Observe `container.value` after the chart is created in `render()`.
- On each resize callback, call `chart.applyOptions({ width: entry.contentRect.width })` (height stays fixed at 200px — only width needs to track the container).
- Disconnect the observer in `onBeforeUnmount`, alongside the existing `chart?.remove()` cleanup.
- Guard against firing before `chart` exists (the observer could theoretically fire during the brief window between container mount and `render()` completing, though in practice `render()` runs synchronously in `onMounted` before the browser paints — still worth a null check for safety).

No other files change. This is the standard, minimal fix for `lightweight-charts` responsiveness — no dependency changes needed (`ResizeObserver` is a native browser API).

## Testing

No automated test framework in this project (existing, deliberate choice). Verification is manual: run the app, open the Breakout view, resize the browser window (and/or resize the OS window to trigger the grid to reflow to a different column count), and confirm the chart canvas always fills its card exactly with no overflow, both while growing and shrinking. Also verify the chart still renders correctly on initial mount (regression check — no change expected there, but confirm the `ResizeObserver` addition didn't disturb initial sizing).

## Out of scope

- No change to chart height (fixed 200px, not part of the reported bug).
- No change to the grid's breakpoint/column logic in `BreakoutView.vue` — the grid itself already reflows correctly; only the chart's own size is stale.
- No debouncing of the resize handler — `chart.applyOptions({ width })` is cheap and `lightweight-charts` is designed to be called on every resize frame; add debouncing only if it's shown to cause jank in practice.
