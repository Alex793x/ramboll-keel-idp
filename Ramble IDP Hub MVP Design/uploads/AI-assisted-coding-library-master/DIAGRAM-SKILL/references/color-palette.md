# Color Palette & Brand Style — Ramboll

**This is the single source of truth for all colors and brand-specific styles.** To customize diagrams for your own brand, edit this file — everything else in the skill is universal.

---

## Shape Colors (Semantic)

Colors encode meaning, not decoration. Each semantic purpose has a fill/stroke pair.

| Semantic Purpose | Fill | Stroke |
|------------------|------|--------|
| Primary/Neutral | `#0098eb` | `#05326e` |
| Secondary | `#33adef` | `#05326e` |
| Tertiary | `#99d6f7` | `#05326e` |
| Start/Trigger | `#ffe682` | `#c27a00` |
| End/Success | `#add095` | `#125a40` |
| Warning/Reset | `#ff8855` | `#b34400` |
| Decision | `#cceafb` | `#0098eb` |
| AI/LLM | `#e0d4db` | `#62294b` |
| Inactive/Disabled | `#e3e1d8` | `#273943` (use dashed stroke) |
| Error | `#ff8855` | `#b34400` |

**Rule**: Always pair a darker stroke with a lighter fill for contrast.

---

## Text Colors (Hierarchy)

Use color on free-floating text to create visual hierarchy without containers.

| Level | Color | Use For |
|-------|-------|---------|
| Title | `#05326e` | Section headings, major labels |
| Subtitle | `#0098eb` | Subheadings, secondary labels |
| Body/Detail | `#273943` | Descriptions, annotations, metadata |
| On light fills | `#273943` | Text inside light-colored shapes |
| On dark fills | `#ffffff` | Text inside dark-colored shapes |

---

## Evidence Artifact Colors

Used for code snippets, data examples, and other concrete evidence inside technical diagrams.

| Artifact | Background | Text Color |
|----------|-----------|------------|
| Code snippet | `#05326e` | `#cceafb` (Cyan 20%) |
| JSON/data example | `#05326e` | `#add095` (Grass) |

---

## Default Stroke & Line Colors

| Element | Color |
|---------|-------|
| Arrows | Use the stroke color of the source element's semantic purpose |
| Structural lines (dividers, trees, timelines) | Ocean (`#05326e`) or Mountain (`#273943`) |
| Marker dots (fill + stroke) | Primary fill (`#0098eb`) |

---

## Background

| Property | Value |
|----------|-------|
| Canvas background | `#ffffff` |

---

## Full Ramboll Palette Reference

### Primary
| Name | HEX | RGB |
|------|-----|-----|
| Cyan | `#0098eb` | 0, 152, 235 |
| White | `#ffffff` | 255, 255, 255 |

### Secondary
| Name | HEX | RGB |
|------|-----|-----|
| Ocean | `#05326e` | 5, 50, 110 |
| Forest | `#125a40` | 18, 90, 64 |
| Heath | `#62294b` | 98, 41, 75 |
| Mountain | `#273943` | 39, 57, 67 |
| Grass | `#add095` | 173, 208, 149 |
| Pebble | `#e3e1d8` | 227, 225, 216 |

### Spot (use sparingly — CTAs only)
| Name | HEX | RGB |
|------|-----|-----|
| Field | `#ff8855` | 255, 136, 85 |
| Sand | `#ffe682` | 255, 230, 130 |

### Cyan Shades
| Shade | HEX |
|-------|-----|
| 100% | `#0098eb` |
| 80% | `#33adef` |
| 60% | `#66c1f3` |
| 40% | `#99d6f7` |
| 20% | `#cceafb` |
| 10% | `#e5f4fd` |

### Ocean Shades
| Shade | HEX |
|-------|-----|
| 100% | `#05326e` |
| 80% | `#375b8b` |
| 60% | `#6984a8` |
| 40% | `#9badc5` |
| 20% | `#cdd6e2` |
| 10% | `#e6eaf0` |

### Forest Shades
| Shade | HEX |
|-------|-----|
| 100% | `#125a40` |
| 80% | `#417b66` |
| 60% | `#719c8c` |
| 40% | `#a0bdb3` |
| 20% | `#d0ded9` |
| 10% | `#e7eeec` |

### Heath Shades
| Shade | HEX |
|-------|-----|
| 100% | `#62294b` |
| 80% | `#81546f` |
| 60% | `#a17f93` |
| 40% | `#c0a9b7` |
| 20% | `#e0d4db` |
| 10% | `#efe9ed` |

### Mountain Shades
| Shade | HEX |
|-------|-----|
| 100% | `#273943` |
| 80% | `#526169` |
| 60% | `#7d888e` |
| 40% | `#a9b0b4` |
| 20% | `#d4d7d9` |
| 10% | `#e9ebec` |

### Grass Shades
| Shade | HEX |
|-------|-----|
| 100% | `#add095` |
| 80% | `#bdd9aa` |
| 60% | `#cee3bf` |
| 40% | `#deecd5` |
| 20% | `#eff6ea` |
| 10% | `#f6faf4` |

### Pebble Shades
| Shade | HEX |
|-------|-----|
| 100% | `#e3e1d8` |
| 80% | `#e9e7e0` |
| 60% | `#eeede8` |
| 40% | `#f4f3ef` |
| 20% | `#f9f9f7` |
| 10% | `#fcfcfb` |
