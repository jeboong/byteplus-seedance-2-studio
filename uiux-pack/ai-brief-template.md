# AI Brief Template

Paste this into another coding agent when you want to apply the Seedance Studio UIUX pack.

```text
Apply the Seedance Studio UIUX language to this app.

Use the local `uiux-pack` as the source of truth:
- read `uiux-pack/SKILL.md`
- use `uiux-pack/seedance-uiux.css` as reusable primitives
- follow `uiux-pack/component-recipes.md`
- follow `uiux-pack/animation-recipes.md`

Goal:
Turn the existing app into a quiet, premium, work-focused creative tool interface:
- dark full-screen workspace with a faint grid
- low-contrast glass panels and compact controls
- icon-first buttons with tooltips
- bottom composer / command dock if the app has a primary creation action
- quick menus anchored to the trigger button
- cards that expand in place with details on the right on desktop
- details summarized as chips and expanded as badges
- restrained motion, no decorative blobs or marketing hero

Implementation requirements:
- preserve existing business logic and data flow
- reuse existing component boundaries where possible
- do not add a landing page
- do not put cards inside cards
- keep all text readable and non-overlapping on mobile and desktop
- verify with browser screenshots after changes
- respect `prefers-reduced-motion`

Deliverables:
- integrate/copy the CSS primitives or translate them into the app's design system
- update the main shell, composer/forms, controls, popovers, cards, and detail views
- explain which files changed and how the theme maps to the original app
```
