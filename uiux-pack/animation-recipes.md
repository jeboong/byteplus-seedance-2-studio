# Animation Recipes

The animation language is restrained, steady, and functional. Motion should clarify hierarchy and state, not decorate the screen.

## Timing

| Interaction | Duration | Easing |
|---|---:|---|
| Surface entry | 180-260ms | `cubic-bezier(0.2, 0.8, 0.2, 1)` |
| Hover lift | 120-180ms | `cubic-bezier(0.16, 1, 0.3, 1)` |
| Popover open | 180-240ms | `cubic-bezier(0.2, 0.8, 0.2, 1)` |
| Card expand | 220-280ms | `cubic-bezier(0.16, 1, 0.3, 1)` |
| Status ambience | 3-6s loop | ease-in-out |

## Entry Motion

Use opacity plus a small y movement.

```css
@keyframes sd-panel-in {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
```

Do not animate from huge width differences. For expanded cards, first render into the correct grid layout, then animate opacity/translate.

## Hover Motion

Use tiny vertical lift:

```css
.control:hover {
  transform: translateY(-1px);
}

.card:hover {
  transform: translateY(-2px);
}
```

Avoid large scaling. This UI should feel stable under repeated use.

## Popover Motion

Popover open:

- opacity 0 to 1
- translateY 6-10px to 0
- optional scale 0.985 to 1 for menus only

Popover close can be instant if state-driven, but avoid flicker by preserving placement until unmounted.

## Generation / Processing State

The current app uses a WebGL shader for the richest state, plus a CSS fallback. To port the feeling without WebGL:

- use a dark status panel
- add faint grid drift
- add a soft central rounded capsule that breathes
- keep labels minimal

CSS fallback exists in `seedance-uiux.css` as `sd-generation-status`.

Recommended markup:

```html
<div class="sd-generation-status">
  <span class="status-label">Generating</span>
</div>
```

If implementing WebGL/canvas:

- prefer low-power context
- cap DPR at 2
- stop animation for `prefers-reduced-motion`
- use ResizeObserver for canvas size
- keep colors within blue/cyan/neutral range

## Reduced Motion

Always include:

```css
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 1ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 1ms !important;
    scroll-behavior: auto !important;
  }
}
```

## Things To Avoid

- Large bouncing animations
- Decorative floating blobs
- Text moving while a user is reading
- Layout shifts on hover
- Progress animations that imply accuracy when there is no real progress
- Fast flashing during detail open/close
