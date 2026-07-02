# Ramboll Marketing Website — UI Kit

High-fidelity recreation of the public **ramboll.com** marketing surface, built as small React components with inline JSX.

## What's here

| File | What it is |
|---|---|
| `index.html` | Entry point — wires up React + Babel and the components below. Open this to see the click-through. |
| `styles.css` | All component CSS, layered on top of the design-system `colors_and_type.css`. |
| `Icons.jsx` | Inline SVG icon set (Lucide-equivalent). |
| `Header.jsx` | Sticky nav with logo, links, search and CTA. |
| `Hero.jsx` | Full-bleed hero with kicker, headline, deck, two CTAs. |
| `Section.jsx` | Section shell — kicker, H2, lead — with light / pebble / ocean variants. |
| `Cards.jsx` | `ServiceCard` (icon tile) and `ProjectCard` (photo + body). |
| `ContactModal.jsx` | Multi-field enquiry form with a success state. |
| `Footer.jsx` | Ocean footer with four link columns and social row. |
| `app.jsx` | The screens (`HomeScreen`, `ServicesScreen`, `ProjectsScreen`) and routing. |

## What works

Click around the nav — Services, Projects, About, Careers all switch screens. The "Get in touch" buttons (header, hero, Services screen) open the contact modal. Submitting the form shows a success state. The logo returns home.

## What's intentionally fake

- **Photography** — all hero/project imagery is a styled gradient placeholder labelled "Photo placeholder". Real Ramboll project photography should replace these in production. The `.placeholder-photo` class accepts `--cool / --green / --earth` variants for visual variety.
- **Routing** — there is no real router; navigation is a single `useState`. Replace with React Router / Next.js in production.
- **Form submission** — the contact form's submit handler just toggles a success view. Wire it to a backend in production.
- **About / Careers / Insights** — these screens share a generic placeholder layout. Each would be filled out with editorial content patterns (long-form article, jobs list, etc).

## Components you can lift directly

`Header`, `Hero`, `Section`, `ServiceCard`, `ProjectCard`, `ContactModal`, `Footer` are independent — drop them into any page that imports the same JSX file order and includes `colors_and_type.css` and `styles.css`.
