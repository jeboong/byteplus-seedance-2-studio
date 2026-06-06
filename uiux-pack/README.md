# Seedance Studio UIUX Pack

This pack captures the UI language used in this web app so another AI or engineer can apply the same feel to a different product without copying business logic.

Use this pack when you want:

- a dark, work-focused glass interface
- compact icon-first controls
- bottom composer / command dock patterns
- hover/click quick menus anchored to their trigger
- task/result cards with smooth expanded detail layouts
- restrained motion and generated-status ambience

## Files

| File | Purpose |
|---|---|
| `SKILL.md` | AI-facing implementation skill. Give this to an agent before asking it to redesign another app. |
| `seedance-uiux.css` | Portable CSS tokens and reusable classes. Can be copied into another app. |
| `component-recipes.md` | Component structure, states, layout rules, and interaction notes. |
| `animation-recipes.md` | Motion principles, durations, easing, and generation/status effects. |
| `ai-brief-template.md` | Ready-to-paste prompt for asking an AI to apply the theme elsewhere. |

## Design Summary

The style is not a marketing landing page. It is a quiet creative operations tool:

- full-screen dark workspace with a faint grid
- translucent glass panels with real blur and subtle inner highlights
- mostly neutral black, white, and slate with blue/cyan as functional accents
- rounded panels, but compact controls and stable dimensions
- icons for commands, text only where it clarifies workflow
- details hidden until needed, then shown as compact badges
- smooth transitions that feel calm rather than flashy

## Quick Install

1. Copy `seedance-uiux.css` into the target app.
2. Add `sd-app-shell` to the main app wrapper.
3. Use `sd-glass`, `sd-chip`, `sd-icon-button`, `sd-primary-button`, `sd-composer`, `sd-task-card`, and `sd-detail-*` classes as component building blocks.
4. Follow `component-recipes.md` for layout and state behavior.
5. Use `SKILL.md` as the AI instruction source when asking another agent to rebuild the theme.

## Source Inspiration In This Repo

- Global theme and glass surfaces: `src/app/globals.css`
- Bottom composer and quick panels: `src/components/GenerateView.tsx`
- Prompt field behavior: `src/components/PromptEditor.tsx`
- Settings controls: `src/components/ModelParams.tsx`
- Result cards and expanded details: `src/components/VideoResult.tsx`
- Generation status animation: `src/components/GenerationFX.tsx`
