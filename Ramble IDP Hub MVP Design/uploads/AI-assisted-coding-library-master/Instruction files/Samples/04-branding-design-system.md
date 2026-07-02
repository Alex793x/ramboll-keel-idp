# Branding and Design System

## Ramboll Brand Colors

- **NEVER hardcode color values** - always use design system tokens/constants.
- Reference: [Ramboll Brand Central](https://brandcentral.ramboll.com/document/19#/visual-identity-toolbox/logo)

### Primary Colors
- **Cyan**: `#0098eb` - Use sparingly with white
- **White**: `#ffffff`
- **Core Principle**: Always have sufficient cyan + white for brand recognition

### Secondary Colors (use with primary colors)
- Ocean: `#05326e`, Forest: `#125a40`, Heath: `#62294b`, Mountain: `#273943`, Grass: `#add095`, Pebble: `#e3e1d8`

### Spot Colors (CTAs only, sparingly)
- Field: `#ff8855`, Sand: `#ffe682`

### Color Shading
All colors have scales (100%, 80%, 60%, 40%, 20%, 10%). Use appropriate shades.

**Cyan**: `#0098eb` → `#33adef` → `#66c1f3` → `#99d6f7` → `#cceafb` → `#e5f4fd`

### Usage
❌ `background-color: #0098eb;`  
✅ `background-color: var(--ramboll-cyan);` or `RAMBOLL_COLORS.cyan;`

## Typography

- **Primary Font: Nunito** - never hardcode, use tokens.
- Use typography scale, not arbitrary sizes.
- Define font families, sizes, weights as constants.

## Visual Elements

### Icons
- **Feather icons** (monoline, rounded ends)
- Use for websites, apps, CTAs
- Source: [Icons Library](https://brandcentral.ramboll.com)

### Pictograms
- Monoline style (rounded ends)
- Geometric shapes for constructions/objects
- Organic shapes for people/nature
- Source: [Pictogram Library](https://brandcentral.ramboll.com)

### Illustrations
- Collage layers (scenography style)
- **Cyan outlines** (`#0098eb`)
- Corporate colors for depth
- Geometric for constructions/vehicles, organic for people/nature
- Source: [Illustration Library](https://brandcentral.ramboll.com)

### Infographics
- Uses Ramboll illustration style
- For complex concepts/data visualization
- Source: [Infographic Library](https://brandcentral.ramboll.com)

**Note**: Contact Ramboll designers for custom visual elements.

## Other Standards

- **Spacing**: Consistent scale (4px, 8px, 16px, etc.) or tokens
- **Components**: Follow design system patterns, use existing components
- **Responsive**: Use breakpoint constants, mobile-first
- **Accessibility**: WCAG AA minimum, semantic HTML, ARIA attributes

## Checklist

- [ ] Colors use Ramboll constants (no hardcoded hex)
- [ ] Primary colors (Cyan + White) present in sufficient amounts
- [ ] Secondary colors used with primary colors
- [ ] Spot colors only for CTAs, sparingly
- [ ] Font is Nunito (via tokens)
- [ ] Icons use Feather library
- [ ] Visual elements from official Ramboll libraries
- [ ] Accessibility standards met
