# Miya Agent — Skill Packs

**Version**: 2.6.0
**Last Updated**: 2026-07-19
**Total Skill Packs**: 21 (5 existing + 16 new)

## Overview

Miya is the **Creative Systems Designer** — responsible for UI/UX direction, brand identity, video production, and creative system structure. She is "born with" 21 specialized skill packs that cover the full creative lifecycle: strategy, design, production, and systematization.

## Skill Pack Inventory

### Existing Packs (5)

| Pack ID | Name | Purpose |
|---------|------|---------|
| `pack.miya-runway-video-generation` | Runway Video Generation | AI video generation via Runway API |
| `pack.miya-creative-image` | Creative Image | Image composition and previews |
| `pack.miya-ui-ux-design` | UI/UX Design | Information architecture, component maps, flow notes |
| `pack.miya-brand-identity` | Brand Identity | Brand direction and style guide notes |
| `pack.miya-motion-graphics` | Motion Graphics | Animation and motion treatment for media |

### Design System Packs (4)

| Pack ID | Name | Permissions | Example Tasks |
|---------|------|-------------|---------------|
| `pack.miya-typography-system` | Typography System | `creative.typography`, `creative.style_guide`, `creative.design_system` | Define a typography hierarchy for the application UI |
| `pack.miya-color-palette` | Color Palette | `creative.color`, `creative.style_guide`, `creative.brand_direction` | Design a color palette for a new product feature |
| `pack.miya-icon-system` | Icon System | `image.icon`, `creative.style_guide`, `creative.design_system` | Design a consistent icon system with grid and sizing rules |
| `pack.miya-design-system` | Design System | `creative.design_system`, `creative.component_library`, `creative.style_guide` | Define a component library structure for design system |

### Content & Strategy Packs (2)

| Pack ID | Name | Permissions | Example Tasks |
|---------|------|-------------|---------------|
| `pack.miya-content-strategy` | Content Strategy | `creative.content_strategy`, `creative.copywriting`, `creative.messaging` | Develop a content strategy for a product launch campaign |
| `pack.miya-brand-guidelines` | Brand Guidelines | `creative.brand_guidelines`, `creative.style_guide`, `creative.brand_direction` | Compile brand guidelines document with logo usage rules |

### Video & Motion Packs (4)

| Pack ID | Name | Permissions | Example Tasks |
|---------|------|-------------|---------------|
| `pack.miya-video-storyboarding` | Video Storyboarding | `video.storyboard`, `creative.direction`, `video.shot_list` | Create a storyboard for a product demo video |
| `pack.miya-video-editing` | Video Editing | `video.editing`, `video.transitions`, `creative.post_production` | Plan video editing workflow for a tutorial series |
| `pack.miya-animation-design` | Animation Design | `creative.animation`, `video.motion`, `creative.interaction` | Design micro-interaction animations for button states |
| `pack.miya-motion-system` | Motion System | `creative.motion_system`, `creative.animation`, `creative.interaction` | Define a motion design system with timing and easing tokens |

### Layout & Page Packs (3)

| Pack ID | Name | Permissions | Example Tasks |
|---------|------|-------------|---------------|
| `pack.miya-landing-page` | Landing Page | `creative.landing_page`, `creative.ui_direction`, `creative.campaign` | Design landing page wireframe with conversion-focused layout |
| `pack.miya-dashboard-design` | Dashboard Design | `creative.dashboard`, `creative.ui_direction`, `creative.data_visualization` | Design a dashboard layout with data visualization hierarchy |
| `pack.miya-editorial-design` | Editorial Design | `creative.editorial`, `creative.layout`, `creative.typography` | Design a blog post layout with consistent visual hierarchy |

### Visual & Research Packs (3)

| Pack ID | Name | Permissions | Example Tasks |
|---------|------|-------------|---------------|
| `pack.miya-social-media-design` | Social Media Design | `creative.social`, `image.compose`, `creative.campaign` | Design social media post templates for a product launch |
| `pack.miya-illustration-style` | Illustration Style | `image.illustration`, `creative.style_guide`, `creative.direction` | Define an illustration style guide for the product |
| `pack.miya-user-research` | User Research | `creative.user_research`, `creative.usability`, `creative.persona` | Plan user research sessions for design validation |

## Permission Model

All Miya skill pack permissions use the agent's allowed prefixes:

- `creative.*` — Creative direction, strategy, and design systems
- `media.*` — Media generation and composition
- `video.*` — Video production, editing, and motion
- `image.*` — Image composition, illustration, and icons
- `runway.*` — Runway API integration

### Per-Pack Scope Overrides

Each of the 16 new packs has a scope override in `agentContractService.ts` that restricts its permissions to the exact set defined in its manifest.

## Workflow Guidance

Each pack includes structured guidance with:
- `guidance` — 1-2 sentence description of the workflow
- `steps` — 4 actionable steps
- `exampleTasks` — 2-3 concrete examples

## Integration Points

### Agent Contract System

All packs are validated against Miya's execution contract:
```typescript
[AGENTS.MIYA]: {
  role: 'creator',
  allowedActionPrefixes: ['media.', 'video.', 'image.', 'creative.', 'runway.'],
  blockedActionPrefixes: ['execute_command', 'filesystem_write', 'external_publish', 'upload', 'post', 'purchase']
}
```

## Testing

- **Unit tests**: `src/test/miyaSkillPacks.test.js`
- **Integration tests**: `src/test/miyaSkillIntegration.test.js`

## Related Files

| File | Purpose |
|------|---------|
| `src/services/skillPackService.js` | Pack definitions and workflow guidance |
| `src/services/agentContractService.ts` | Scope overrides and contract validation |
| `src/agents/miya/miyaProfile.js` | Agent profile with skillPackIds |
| `src/agents/miya/miyaPermissions.js` | Agent permissions |
| `src/test/miyaSkillPacks.test.js` | Unit tests |
| `src/test/miyaSkillIntegration.test.js` | Integration tests |
