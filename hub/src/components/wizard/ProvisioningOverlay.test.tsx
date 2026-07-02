import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ProgressEvent } from '../../lib/types';
import { provRowsFromEvents } from '../../lib/wizard-model';
import { ProvisioningOverlay } from './ProvisioningOverlay';

/** The real 8 workflow events as the engine returns them (SPEC §16). */
const EVENTS: ProgressEvent[] = [
  { step: 1, key: 'signin', title: 'Sign in', status: 'done', detail: '' },
  { step: 2, key: 'form', title: 'Validate form', status: 'done', detail: '' },
  { step: 3, key: 'render', title: 'Render blueprint', status: 'done', detail: '' },
  { step: 4, key: 'create_repo', title: 'Create repository', status: 'done', detail: '' },
  { step: 5, key: 'commit', title: 'Commit initial tree', status: 'done', detail: '' },
  { step: 6, key: 'branches', title: 'Create branches', status: 'done', detail: '' },
  { step: 7, key: 'seed_ci', title: 'Seed CI', status: 'done', detail: '' },
  { step: 8, key: 'register', title: 'Register project', status: 'done', detail: '' },
];

const ROWS = provRowsFromEvents(EVENTS);

describe('ProvisioningOverlay', () => {
  it('renders the header with the RMB-NEW id and the project name', () => {
    render(<ProvisioningOverlay name="District Heating Optimizer" rows={ROWS} provStep={0} />);
    expect(screen.getByText('PROVISIONING · RMB-NEW')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Standing up District Heating Optimizer' }),
    ).toBeInTheDocument();
  });

  it('falls back to Untitled project in the heading', () => {
    render(<ProvisioningOverlay name="   " rows={ROWS} provStep={0} />);
    expect(
      screen.getByRole('heading', { name: 'Standing up Untitled project' }),
    ).toBeInTheDocument();
  });

  it('renders all 8 real event rows with their SPEC §16 meta tags', () => {
    render(<ProvisioningOverlay name="X" rows={ROWS} provStep={0} />);
    expect(ROWS).toHaveLength(8);
    expect(screen.getByText('Sign in')).toBeInTheDocument();
    expect(screen.getByText('ENTRA ID')).toBeInTheDocument();
    expect(screen.getByText('Validate form')).toBeInTheDocument();
    expect(screen.getByText('Render blueprint')).toBeInTheDocument();
    expect(screen.getByText('GOLDEN PATH')).toBeInTheDocument();
    expect(screen.getByText('Create repository')).toBeInTheDocument();
    expect(screen.getByText('Commit initial tree')).toBeInTheDocument();
    expect(screen.getAllByText('GITHUB')).toHaveLength(2); // create_repo + commit
    expect(screen.getByText('Create branches')).toBeInTheDocument();
    expect(screen.getByText('GOVERNANCE')).toBeInTheDocument();
    expect(screen.getByText('Seed CI')).toBeInTheDocument();
    expect(screen.getByText('ACTIONS')).toBeInTheDocument();
    expect(screen.getByText('Register project')).toBeInTheDocument();
    expect(screen.getAllByText('CATALOG')).toHaveLength(2); // form + register
  });

  it('marks rows before the step done (check icon), the current one active (spinner)', () => {
    const { container } = render(<ProvisioningOverlay name="X" rows={ROWS} provStep={2} />);
    // Two done rows → two dark check icons.
    expect(container.querySelectorAll('svg')).toHaveLength(2);

    const done = screen.getByText(ROWS[0]!.label);
    const active = screen.getByText(ROWS[2]!.label);
    const pending = screen.getByText(ROWS[3]!.label);
    expect(done).toHaveStyle({ color: 'rgb(230, 234, 240)' }); // #E6EAF0
    expect(active).toHaveStyle({ color: 'rgb(204, 234, 251)' }); // #CCEAFB
    expect(pending).toHaveStyle({ color: 'rgb(105, 132, 168)' }); // #6984A8

    const activeIcon = active.parentElement?.querySelector('span');
    expect(activeIcon).toHaveStyle({ animation: 'spin 0.8s linear infinite' });
  });

  it('shows every row done at the final step', () => {
    const { container } = render(
      <ProvisioningOverlay name="X" rows={ROWS} provStep={ROWS.length} />,
    );
    expect(container.querySelectorAll('svg')).toHaveLength(ROWS.length);
  });

  it('renders the error tone row and dismisses back to the form', () => {
    const onDismiss = vi.fn();
    render(
      <ProvisioningOverlay
        name="X"
        rows={ROWS}
        provStep={-1}
        error="github rate limit exceeded"
        onDismiss={onDismiss}
      />,
    );
    const message = screen.getByText('github rate limit exceeded');
    expect(message).toHaveStyle({ color: 'rgb(255, 136, 85)' }); // clay #FF8855
    expect(screen.getByText('ERROR')).toHaveStyle({ color: 'rgb(255, 136, 85)' });

    fireEvent.click(screen.getByRole('button', { name: 'Back to form' }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('shows no error row or dismiss button while healthy', () => {
    render(<ProvisioningOverlay name="X" rows={ROWS} provStep={0} />);
    expect(screen.queryByText('ERROR')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Back to form' })).not.toBeInTheDocument();
  });
});
