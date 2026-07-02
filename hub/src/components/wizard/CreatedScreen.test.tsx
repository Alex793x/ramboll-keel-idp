import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { CreatedProject } from '../../lib/wizard-model';
import { CreatedScreen } from './CreatedScreen';

const created: CreatedProject = {
  name: 'District Heating Optimizer',
  gba: 'Energy',
  services: [
    { type: 'fe', lang: 'React' },
    { type: 'api', lang: '.NET' },
  ],
  contributors: ['Joe Evans', 'Mansi Gautam'],
};

function setup(overrides: Partial<CreatedProject> = {}) {
  const onGoHome = vi.fn();
  const onGoProjects = vi.fn();
  render(
    <CreatedScreen
      created={{ ...created, ...overrides }}
      onGoHome={onGoHome}
      onGoProjects={onGoProjects}
    />,
  );
  return { onGoHome, onGoProjects };
}

describe('CreatedScreen', () => {
  it('renders the provisioned id line derived from the GBA', () => {
    setup();
    expect(screen.getByText('RMB-EN-043 · PROVISIONED')).toBeInTheDocument();
  });

  it('renders the "{name} is live." headline', () => {
    setup();
    expect(
      screen.getByRole('heading', { name: 'District Heating Optimizer is live.' }),
    ).toBeInTheDocument();
  });

  it('renders the summary plus the standards sentence verbatim', () => {
    setup();
    expect(
      screen.getByText(
        '2 repositories scaffolded under Energy, 2 contributors granted access. ' +
          'Standards, branch protection and CI validation pipelines are already in place.',
      ),
    ).toBeInTheDocument();
  });

  it('pluralizes a single repository without contributors', () => {
    setup({ services: [{ type: 'api', lang: 'Python' }], contributors: [] });
    expect(
      screen.getByText(
        '1 repository scaffolded under Energy. ' +
          'Standards, branch protection and CI validation pipelines are already in place.',
      ),
    ).toBeInTheDocument();
  });

  it('renders one ramboll/{slug}-{type} chip per service', () => {
    setup();
    expect(screen.getByText('ramboll/district-heating-optimizer-fe')).toBeInTheDocument();
    expect(screen.getByText('ramboll/district-heating-optimizer-api')).toBeInTheDocument();
  });

  it('wires the two CTAs to their callbacks', () => {
    const { onGoHome, onGoProjects } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Back to control room' }));
    expect(onGoHome).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'View all projects' }));
    expect(onGoProjects).toHaveBeenCalledTimes(1);
  });
});
