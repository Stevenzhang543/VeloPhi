# Nova_A UI Specification

Status: Active. The26.37 Comfortable requirements supersede earlier compact defaults. Preserve capability and the established persistent editor shell; improve the presentation without changing game/runtime semantics.

## Visual priorities

1. Comfortable reading and clear actions.
2. Larger type, four-sided breathing room, soft geometry and space.
3. Immediate, fluid and interruptible interaction feedback.
4. Useful information density.
5. Number of visible fields.

A44px control and16px value are the normal desktop editor baseline, not an oversized exception. Scrolling, grouping, folding and explicit overflow navigation take priority over shrinking text or clearing padding. Compact remains an opt-in user preference. New sessions and reset preferences use Comfortable at100% UI scale, with normal motion enabled.

Keep a professional tool, with panels, sections, tabs, trees, lists and purposeful dialogs. Avoid turning properties into individual cards, excessive gradients, permanent blur, heavy shadows or continuously moving decoration. Preserve the supplied26.36 light/dark Nova branding and existing semantic palettes.

## Framework, scale and ownership

The actual interface is Vue3 in a Vite Web bundle and Tauri desktop WebView. src/ui/editor.css imports tokens.css, forms.css and motion.css. Shared controls live in src/ui/components; native controls remain shared primitives where wrappers would alter refs, validation, model modifiers or bubbling events.

Dimensions below are logical CSS pixels. CSS handles device pixel ratio; the saved UI scale multiplies geometry and type exactly once. Do not use whole-page zoom, root transforms, font point confusion or per-screen emergency scaling. Default readability must hold at UI scale1.

One token system owns colors, spacing, type, radii, control sizes and motion. Screens may compose these tokens; they must not redefine competing default systems. Preserve light/dark palettes, high contrast, EN/DE/ZH,100–200% user scaling and existing saved arrangements.

## Comfortable typography

| Use | Default logical px | Line height |
|---|---:|---:|
| Main UI, input/property values, labels |16|1.5|
| Secondary/help text |14|1.5|
| Panel titles |18|1.5|
| Major section/page titles |22|1.4|
| Launcher main heading |34|1.2|
| Console/code monospace |15|1.5|

Important property names and values are primary information. Do not classify them as captions to preserve density. Long translated labels may wrap; full native selected values retain their detail tooltip. Canvas rulers, virtualized table/timeline coordinates and source-code gutters may have explicit domain-specific exceptions; ordinary editing controls do not.

## Geometry

| Element | Default logical px |
|---|---:|
| Standard single-line input, text button, icon-button hit area |44|
| Normal icon |22|
| Tab |44|
| Tree/list row |40|
| Menu item |44|
| Panel header |56|
| Numeric field |112 wide|
| Scalar slider track |128 wide,6 high,22 thumb|

Input math:24px text line +9px top/bottom padding +1px top/bottom border =44px. Keep type, line height, padding and bounding box mutually compatible. Numeric stepper halves are a documented22px subdivision of the44px numeric control, not a separate general button size. Tree-inline actions may fit the40px row; full toolbar actions use44px.

Use compact SVG actions with meaningful accessible names/tooltips; keep the established icon family and prohibit emoji/Unicode production icons. Text remains appropriate where words clarify the action. Never remove a core command to fit a toolbar: provide a reachable labeled overflow surface.

## Four-sided spacing

| Relationship | Default logical px |
|---|---:|
| Stacked label to input |12|
| Between fields |20|
| Between property sections |28|
| Section title to first content |16|
| Inline label to control |16|
| Parallel controls |12|
| Layout columns |16|
| Panel content inset |20|
| Dialog content inset |24|
| Input inline/block padding |16 /9|

Spacing is semantic rather than a margin on every nested element. A panel and its property section must have one clear content-inset owner. Related X/Y and width/height controls may share a group, with visible12px separation and wrapping when necessary. Properties switch to stacked labels at a font-relative container breakpoint rather than compressing values.

## Soft geometry and material

| Use | Default radius |
|---|---:|
| List hover/selection |8|
| Inputs/buttons/selected tabs |12|
| Main panel outer contour |16|
| Floating menu/popover |20|
| Dialog/launcher accent |24|

Expose dock contours with a shared8px gutter; retain a coherent workspace rather than heavy floating cards. Let surfaces and whitespace express grouping, with low-contrast separators. Clip backgrounds/content intentionally, while preserving focus outlines, scrollbars, shadows, menus and drag previews. Do not make every property a pill.

Transient menus, palette and modal layers may use selective blur with an opaque fallback. Persistent editing surfaces and viewport remain crisp. Existing palette semantics remain authoritative.

## Layout and narrow windows

Starting defaults: hierarchy280px, Inspector380px, bottom dock280px; defaults and limits are logical units, with explicit smaller-window constraints. Inspector and hierarchy may resize, scroll, fold or switch through existing recoverable commands. Keep a usable central workspace. Preserve saved widths and layout scopes; clamp effective visible geometry without destroying stored user intent.

Narrow windows must not silently reduce the Comfortable type/control baseline. Low-frequency actions may move into shared, reachable overflow menus; panel folding/maximize/focus commands remain available. No content may escape its panel or require accidental horizontal scrolling to operate a property field.

Ordinary tool changes must not resize unrelated docks. Keep the persistent shell, preserve outgoing usable content while lazy loading, and dispose visibility-only work on deactivation. Do not use animation to hide a blank frame, full-shell remount or slow load.

## Motion

Use the existing shared motion system, with Snappy, Smooth and Elastic presets. Normal motion is enabled by default; Reduced Motion is saved independently and respects the live system preference. Visual jobs must be finite, retargetable, cancellable and disposed. Do not use transition:all or component-specific arbitrary easing/durations.

Cover real buttons, inputs, checks/toggles/radios, sliders, tabs, tree/list selection/disclosure, Inspector groups, dock visibility, menus/popovers, dialogs, tooltip/toast feedback, project list and specialized editor controls. Static text need not move. See MOTION_SYSTEM_SPEC.md and the implementation tracker for actual integration and measured coverage.

State, focus, editing, slider values, viewport/keyframe/object coordinates and drag hit testing commit immediately. Elastic feedback belongs to decoration, neighbors and release settling. It must never lag the pointer or overshoot logical data. Rapid reversal/latest targets replace obsolete animations; hidden closing surfaces become inert and cannot intercept input.

## Preservation and verification

Preserve core features, save/load, undo/redo, shortcuts, project/entity/resource/component semantics, state ownership and game runtime behavior. Do not rewrite unrelated physics/render/script/assets to achieve comfort.

Before completion:
- inspect representative populated Inspector, settings/dialog, editor shell and launcher;
- migrate all major real surfaces and remove conflicting legacy sizes;
- build and run meaningful linked geometry/animation/interaction tests;
- inspect actual screenshots at equal project/object/window/scale/DPR conditions;
- exercise motion mid-flight, rapid reversal, cancellation, disposal, Reduced Motion and precise drag;
- retain honest frame/input/idle diagnostics with their host limits;
- test normal/minimum windows, translations and enlarged user scale;
- review shared/nearby controls for clipping, overlaps and focus-ring loss;
- update DECISIONS.md with actual results.

Compilation does not establish visual completion. Distinguish implemented, observed, automatically tested and unverified scope. Headless software-browser timing is not a physical GPU, display-latency or all-device claim. Existing releases remain immutable;26.37 publishes only after frozen-source qualification and exact archive/checksum verification.

### v26.37 diagram coordinate exception

The Visual Graph diagram uses its independent zoom (0.1–4); saved UI scale applies to external toolbars, palette and property panels. Diagram titles and editable values use fixed logical 16px text; pin/code help uses 14px. Existing node, header, port, routing and hit-test coordinates stay unchanged. A diagram value editor remains 28px high: 16px/24px text, 1px vertical padding and 1px borders. The graph help displays its zoom. This exception applies only to the diagram, not its normal property editor.

Hierarchy rename editors match the exact 40px Comfortable / 28px Compact virtual stride, with once-scaled text and padding. Virtual insets and index calculations use the same panel inset. Disclosure commits immediately; retained mounted neighbors use shared FLIP motion, while removed virtual children unmount immediately. Escape cancels rename UI state and leaves history untouched.
