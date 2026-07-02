/* global React, ReactDOM */
const {
  Header, Hero, Section, Footer, ServiceCard, ProjectCard, ContactModal,
  IconBuilding, IconBridge, IconZap, IconDroplet, IconLeaf, IconBriefcase, IconGlobe, IconWind,
} = window;

const SERVICES = [
  { key: 'Buildings',             icon: <IconBuilding />,   desc: 'Sustainable, high-performance buildings — from concept to handover.' },
  { key: 'Transport',             icon: <IconBridge />,     desc: 'Bridges, rail and mobility systems that move people and economies.' },
  { key: 'Energy',                icon: <IconZap />,        desc: 'Green energy transition — from offshore wind to grid build-out.' },
  { key: 'Water',                 icon: <IconDroplet />,    desc: 'Climate-resilient water, wastewater and flood-risk solutions.' },
  { key: 'Environment & Health',  icon: <IconLeaf />,       desc: 'Air, soil and ecological consultancy across the value chain.' },
  { key: 'Management Consulting', icon: <IconBriefcase />,  desc: 'Strategy, ESG and economic advisory for the decade of action.' },
  { key: 'Architecture & Landscape', icon: <IconGlobe />,   desc: 'Liveable places where people and nature flourish together.' },
  { key: 'Industry',              icon: <IconWind />,       desc: 'Decarbonising heavy industry with applied technical expertise.' },
];

const PROJECTS = [
  {
    kicker: 'Energy',
    title: 'Hornsea — the world\'s largest offshore wind farm',
    desc: 'Lead engineering and design for a 3.6 GW UK array supplying clean power to over four million homes.',
    location: 'North Sea, UK',
    year: '2024',
    variant: 'cool',
  },
  {
    kicker: 'Transport',
    title: 'Fehmarnbelt Link — the world\'s longest immersed tunnel',
    desc: 'Detailed design of the 18 km road and rail crossing connecting Denmark and Germany.',
    location: 'Denmark · Germany',
    year: '2029',
    variant: '',
  },
  {
    kicker: 'Buildings',
    title: 'CO₂mpare — an open carbon benchmark for buildings',
    desc: 'First international open-access dataset of embodied carbon, covering 130+ building projects across six countries.',
    location: 'Global',
    year: '2024',
    variant: 'green',
  },
];

function HomeScreen({ openContact, navigateTo }) {
  return (
    <>
      <Hero
        kicker="The Partner for Sustainable Change"
        title="Bright ideas. Sustainable change."
        deck="Ramboll is a global architecture, engineering and consultancy company. Our 18,000 experts create sustainable solutions for governments and companies all over the world."
        primaryLabel="Explore our work"
        onPrimary={() => navigateTo('Projects')}
        secondaryLabel="What we do"
        onSecondary={() => navigateTo('Services')}
        variant="cool"
      />

      <Section kicker="What we do" title="Eight markets. One mission." lead="Multidisciplinary expertise that helps clients realise their ambitions for a more sustainable future — across the full value chain.">
        <div className="svc-grid">
          {SERVICES.map((s) => (
            <ServiceCard key={s.key} icon={s.icon} title={s.key} desc={s.desc} onClick={() => navigateTo('Services')} />
          ))}
        </div>
      </Section>

      <Section variant="ocean" kicker="Our impact" title="Sustainable change, measured.">
        <div className="stats">
          <div><div className="stat__num">18,000+</div><div className="stat__lbl">Experts across 35 countries</div></div>
          <div><div className="stat__num">300</div><div className="stat__lbl">Offices serving local clients globally</div></div>
          <div><div className="stat__num">1.5°C</div><div className="stat__lbl">Climate targets aligned with the Paris Agreement</div></div>
          <div><div className="stat__num">2040</div><div className="stat__lbl">Net-zero across our full value chain</div></div>
        </div>
      </Section>

      <Section variant="pebble" kicker="Featured projects" title="Engineering for a brighter, more resilient world." lead="From offshore wind farms to immersed tunnels, our projects connect communities and accelerate the green transition.">
        <div className="pj-grid">
          {PROJECTS.map((p) => (
            <ProjectCard key={p.title} {...p} photoVariant={p.variant} onClick={() => navigateTo('Projects')} />
          ))}
        </div>
      </Section>

      <Section narrow>
        <div className="sec__kicker">From our experts</div>
        <blockquote className="quote">"The only way we can move forward is by sharing knowledge about what works and what does not work."</blockquote>
        <div className="quote__attr">Lars Ostenfeld Riemann</div>
        <div className="quote__role">Executive Director, Buildings</div>
      </Section>
    </>
  );
}

function ServicesScreen({ navigateTo }) {
  return (
    <>
      <Hero
        kicker="Services"
        title="Multidisciplinary expertise. Sustainable outcomes."
        deck="From feasibility through to operation, we combine deep technical knowledge with sustainability and digital capabilities."
        variant="green"
        primaryLabel="Talk to a specialist"
        onPrimary={() => navigateTo('contact')}
      />
      <Section kicker="All services" title="Eight markets we serve.">
        <div className="svc-grid">
          {SERVICES.map((s) => (
            <ServiceCard key={s.key} icon={s.icon} title={s.key} desc={s.desc} />
          ))}
        </div>
      </Section>
    </>
  );
}

function ProjectsScreen() {
  return (
    <>
      <Hero
        kicker="Selected projects"
        title="Work that moves the world forward."
        deck="A few of the projects our 18,000 experts have delivered with clients across 35 countries."
        variant="earth"
      />
      <Section variant="pebble">
        <div className="pj-grid">
          {[...PROJECTS, ...PROJECTS].map((p, i) => (
            <ProjectCard key={i} {...p} photoVariant={p.variant} />
          ))}
        </div>
      </Section>
    </>
  );
}

function GenericScreen({ title }) {
  return (
    <>
      <Hero
        kicker={title}
        title={title}
        deck="This screen is intentionally left as a placeholder in the UI kit — the click-through pattern is the same as the other screens."
        variant="cool"
      />
      <Section narrow>
        <p className="lead">In a real implementation this surface follows the same composition: kicker, H2, lead paragraph, content blocks, and a single primary CTA.</p>
      </Section>
    </>
  );
}

function App() {
  const [screen, setScreen] = React.useState('Services'); // active nav item
  const [view, setView] = React.useState('home');         // home / contact-screen / etc.
  const [modal, setModal] = React.useState(false);

  function navigate(target) {
    if (target === 'contact') { setModal(true); return; }
    if (target === 'home') { setView('home'); setScreen('Services'); return; }
    setView(target);
    setScreen(target);
    window.scrollTo({ top: 0, behavior: 'instant' });
  }

  let body;
  if (view === 'home')          body = <HomeScreen openContact={() => setModal(true)} navigateTo={navigate} />;
  else if (view === 'Services') body = <ServicesScreen navigateTo={navigate} />;
  else if (view === 'Projects') body = <ProjectsScreen />;
  else                          body = <GenericScreen title={view} />;

  return (
    <>
      <Header activeNav={screen} onNavigate={navigate} onContact={() => setModal(true)} />
      {body}
      <Footer />
      <ContactModal open={modal} onClose={() => setModal(false)} />
    </>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
