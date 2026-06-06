# Component Recipes

These recipes describe the reusable UI patterns behind the current app. They are intentionally framework-light; use them with React, Vue, Svelte, plain HTML, or a design system.

## App Shell

Use one full-screen work surface.

```html
<main class="sd-app-shell">
  <header class="sd-chip">floating controls</header>
  <section>workspace content</section>
  <form class="sd-composer">composer</form>
</main>
```

Rules:

- The shell owns the background and grid.
- Do not place a marketing hero before the app.
- Keep navigation and global controls small and floating.

## Glass Surface

Use `sd-panel` for large tool panels and `sd-glass`/`sd-control`/`sd-chip` for smaller UI.

```html
<section class="sd-panel">
  <h2>Settings</h2>
  <div class="sd-segmented">...</div>
</section>
```

Rules:

- Surface backgrounds should be translucent, never opaque black cards.
- Inner grid texture belongs only on large panels/cards, not every control.
- Use blur and inner highlights sparingly.

## Bottom Composer

The composer is the primary workflow area. It should be first-screen usable.

Recommended structure:

```html
<form class="sd-composer">
  <textarea class="sd-prompt-field" placeholder="Describe the scene"></textarea>
  <div class="composer-row">
    <button class="sd-chip">Mode</button>
    <button class="sd-chip">16:9</button>
    <button class="sd-chip">1080p</button>
    <button class="sd-chip">15s</button>
    <button class="sd-primary-button" aria-label="Generate">▶</button>
  </div>
</form>
```

Behavior:

- It may expand/collapse, but the generate button must stay predictable.
- Quick settings should open above the chip that triggered them.
- Textarea resizing should not push controls off screen.
- Attachment thumbnails should have fixed dimensions.

## Quick Menus

Quick menus are anchored popovers.

Implementation notes:

- On open, read `button.getBoundingClientRect()`.
- Convert to container-relative x using parent rect.
- Clamp left/right to an 8-16px gutter.
- Width should be derived from content and trigger context, not full viewport.
- Keep the panel open while the pointer is over either trigger or panel.
- Close on outside pointer, Escape, blur, or selection.

Visual pattern:

```html
<div class="sd-popover" style="left: var(--trigger-left); bottom: 3.55rem">
  <section class="sd-panel">quick controls</section>
</div>
```

## Segmented Controls

Use segmented controls for mutually exclusive options.

```html
<div class="sd-segmented" style="grid-template-columns: repeat(3, 1fr)">
  <button class="sd-segment">480p</button>
  <button class="sd-segment sd-segment-active">720p</button>
  <button class="sd-segment">1080p</button>
</div>
```

Rules:

- Stable equal tracks.
- Selected state uses brighter text, soft white fill, and small shadow.
- Disabled options keep their footprint and reduce opacity.

## Icon Buttons

Use icon buttons for familiar commands:

- search/detail
- refresh/reuse
- download
- settings
- close
- play/generate
- trash/delete

Every icon button needs a `title` and `aria-label`.

```html
<button class="sd-icon-button" title="Download" aria-label="Download">
  <!-- icon -->
</button>
```

## Result Card

Collapsed structure:

```html
<article class="sd-task-card">
  <div class="sd-media-panel">media or status</div>
  <div class="task-body">
    <p>one-line prompt</p>
    <div>reference thumbs</div>
    <div>metadata + actions</div>
  </div>
</article>
```

Expanded desktop structure:

```html
<article class="sd-task-card">
  <div class="sd-task-expanded">
    <div class="sd-media-panel">video, image, failed, or generating state</div>
    <aside class="sd-detail-panel">
      <section class="sd-detail-prompt">prompt</section>
      <section>
        <button class="sd-detail-toggle">
          <span>Details</span>
          <span class="sd-detail-summary">
            <span>1080p</span><span>16:9</span><span>15s</span>
          </span>
        </button>
      </section>
    </aside>
  </div>
</article>
```

Rules:

- Desktop expanded details go right of the media/status panel.
- Mobile stacks media above details.
- Pending, running, failed, cancelled, expired, and succeeded states all use the same expanded layout.
- Failed state can show the error in the media panel, but structured metadata remains in the detail panel.

## Detail Badges

Use summary chips when closed and badge boxes when expanded.

```html
<dl class="sd-badge-grid">
  <div class="sd-badge-box">
    <dt>Model</dt>
    <dd>Seedance 2.0</dd>
  </div>
  <div class="sd-badge-box">
    <dt>Duration</dt>
    <dd>15s</dd>
  </div>
</dl>
```

Rules:

- Most badges are two columns.
- Long values truncate with title tooltip.
- Use uppercase labels, heavier values.
- Keep model or prompt-related long fields wide if needed.

## Reference Thumbnails

Use fixed square thumbnails with central numeric overlays.

```html
<button class="sd-reference-thumb" title="img1">
  <img src="..." alt="" />
  <span class="sd-reference-index">1</span>
</button>
```

Rules:

- 32px is ideal inside cards.
- Use 64-96px for composer slots.
- Keep start/end frame roles visibly distinct with small corner labels.
