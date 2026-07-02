import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LiveBlueprint, PERKS } from './LiveBlueprint';

describe('LiveBlueprint', () => {
  it('renders the empty draft with fallbacks', () => {
    render(<LiveBlueprint name="" gba={null} contributors={[]} services={[]} />);
    expect(screen.getByText('LIVE BLUEPRINT')).toBeInTheDocument();
    expect(screen.getByText('PROJECT')).toBeInTheDocument();
    expect(screen.getByText('Untitled project')).toBeInTheDocument();
    expect(screen.getByText('No GBA yet')).toBeInTheDocument();
    expect(screen.getByText('1 people')).toBeInTheDocument();
    expect(screen.getByText('Add service components to see them here')).toBeInTheDocument();
  });

  it('renders the CI/CD node copy verbatim', () => {
    render(<LiveBlueprint name="" gba={null} contributors={[]} services={[]} />);
    expect(screen.getByText('CI / CD · GITHUB ACTIONS')).toBeInTheDocument();
    expect(
      screen.getByText('Build · test · validate pipelines, wired per repo'),
    ).toBeInTheDocument();
  });

  it('renders all five WHAT YOU GET perks verbatim', () => {
    render(<LiveBlueprint name="" gba={null} contributors={[]} services={[]} />);
    expect(screen.getByText('WHAT YOU GET')).toBeInTheDocument();
    expect(PERKS).toEqual([
      'One repo per service, from approved Ramboll templates',
      'GitHub Actions: build, test & validation pipelines',
      'Branch protection, CODEOWNERS, security scanning',
      'Registered in the software catalog with ownership',
      'Linked docs: golden path, standards, runbook template',
    ]);
    for (const pk of PERKS) {
      expect(screen.getByText(pk)).toBeInTheDocument();
    }
  });

  it('renders service nodes with tag, label, repo and language chip', () => {
    render(
      <LiveBlueprint
        name="Grid Twin"
        gba="Energy"
        contributors={['Joe Evans', 'Mansi Gautam']}
        services={[
          { type: 'fe', lang: 'React' },
          { type: 'api', lang: '.NET' },
          { type: 'api', lang: 'Python' },
        ]}
      />,
    );
    expect(screen.getByText('Grid Twin')).toBeInTheDocument();
    expect(screen.getByText('Energy')).toBeInTheDocument();
    expect(screen.getByText('3 people')).toBeInTheDocument();
    expect(screen.getByText('FE')).toBeInTheDocument();
    expect(screen.getByText('Frontend')).toBeInTheDocument();
    expect(screen.getByText('grid-twin-fe')).toBeInTheDocument();
    expect(screen.getByText('grid-twin-api-1')).toBeInTheDocument();
    expect(screen.getByText('grid-twin-api-2')).toBeInTheDocument();
    expect(screen.getByText('React')).toBeInTheDocument();
    expect(screen.getByText('.NET')).toBeInTheDocument();
    expect(screen.getByText('Python')).toBeInTheDocument();
    expect(
      screen.queryByText('Add service components to see them here'),
    ).not.toBeInTheDocument();
  });
});
