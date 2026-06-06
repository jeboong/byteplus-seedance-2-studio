# Seedance Studio UIUX Skill

Use this skill when applying the Seedance Studio UI/UX language to another app, especially creative tools, AI generation tools, dashboards, media review tools, or compact operational interfaces.

## Aesthetic Target

Build a quiet, dense, premium work surface. The app should feel like a creative control room, not a landing page.

Core qualities:

- dark neutral workspace with a faint technical grid
- low-contrast glass surfaces with blur, inner highlight, and deep shadow
- compact icon-first controls with tooltips
- primary action as a strong circular or compact button
- settings as segmented controls, chips, sliders, and popovers
- result/detail views that expand in place
- details shown as compact badges rather than long key/value tables
- motion that is slow enough to feel stable and fast enough to feel alive

## Non-Negotiables

- The first screen must be the usable app, not a marketing hero.
- Do not add decorative blobs, large gradient orbs, or bokeh backgrounds.
- Do not make the whole app a single hue theme. Keep neutral surfaces dominant and use accents only for function.
- Do not put cards inside cards. Use panels for tools, repeated cards for repeated items, and popovers for transient controls.
- Keep text compact. Use icons for save/download/search/settings/play/close where familiar.
- All fixed-format UI elements need stable dimensions so hover states, loading text, icons, and badges do not resize the layout.
- All popovers and quick menus must be anchored to the button that opened them, not centered globally.

## Theme Tokens

Prefer these values unless the host app already has a design system:

- background: `#08090b`
- faint grid line: `rgb(255 255 255 / 0.026)`
- dark glass: `rgb(255 255 255 / 0.055)`
- dark glass strong: `rgb(24 24 25 / 0.76)`
- light glass: `rgb(255 255 255 / 0.72)`
- border dark: `rgb(255 255 255 / 0.10)`
- border active: `rgb(255 255 255 / 0.20)`
- text dark mode: `rgb(255 255 255 / 0.88)`
- muted dark mode: `rgb(255 255 255 / 0.48)`
- primary blue: `#2563eb`
- success: `#22c55e`
- warning: `#f59e0b`
- danger: `#ef4444`
- surface blur: `blur(24px) saturate(118%)`
- popover blur: `blur(34px) saturate(118%)`
- large radius: `1.35rem` to `1.75rem`
- compact radius: `0.65rem` to `0.9rem`
- standard ease: `cubic-bezier(0.2, 0.8, 0.2, 1)`
- spring-ish ease: `cubic-bezier(0.16, 1, 0.3, 1)`

## Layout Patterns

Use a full-screen shell:

- fixed or full-height dark background
- faint grid overlay using `::before`
- main content constrained only where scanning benefits from it
- bottom composer dock for primary creation flow
- floating top-right app controls
- result list/grid above the composer

Composer pattern:

- large rounded glass shell
- prompt textarea inside a softer inset glass field
- attachment thumbnails above or below the prompt
- compact action chips for mode, sound, ratio, resolution, duration
- model/settings button near the generate button
- generate button as an icon-first circle
- quick menus positioned from the triggering chip's bounding rect

Result card pattern:

- collapsed card shows media/status first, one-line prompt, reference thumbnails, and compact metadata
- expanded card uses a two-column layout: media/status on the left, prompt/details on the right
- details default collapsed; summary shows key facts such as `1080p`, `16:9`, `15s`
- expanded details use badges, not long tables

## Motion Rules

- Entry: fade + translateY 8-12px, 180-260ms.
- Hover: translateY -1px or -2px, 120-180ms.
- Panel open: opacity + slight translate/scale, 180-240ms.
- Avoid width interpolation from compact to huge layouts. Swap into stable grid containers before animating opacity/translate.
- Respect `prefers-reduced-motion`; disable continuous decorative animation.

## Implementation Steps

1. Add the reusable CSS from `seedance-uiux.css`.
2. Wrap the app with `sd-app-shell`.
3. Convert main surfaces to `sd-glass` or `sd-panel`.
4. Replace text-heavy controls with icon buttons and chips.
5. Build quick menus as `position: absolute` or portal popovers anchored to trigger rects.
6. Convert details into summary + collapsible badges.
7. Verify desktop and mobile screenshots for overlap, clipped text, and blank media/status panels.

## Final QA Checklist

- Prompt/composer remains usable on first screen.
- Popovers appear near their trigger.
- Text does not overlap in buttons, cards, or badges.
- Expanded details do not jump below the media on desktop.
- Cards keep stable size during loading and status changes.
- Dark and light modes both preserve contrast.
- Reduced motion users do not get continuous canvas or shimmer animation.
