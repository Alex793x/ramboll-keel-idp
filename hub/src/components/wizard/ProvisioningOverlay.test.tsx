import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PROV_STEPS } from '../../lib/wizard-model';
import { ProvisioningOverlay } from './ProvisioningOverlay';

describe('ProvisioningOverlay', () => {
  it('renders the header with the RMB-NEW id and the project name', () => {
    render(<ProvisioningOverlay name="District Heating Optimizer" provStep={0} />);
    expect(screen.getByText('PROVISIONING · RMB-NEW')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Standing up District Heating Optimizer' }),
    ).toBeInTheDocument();
  });

  it('falls back to Untitled project in the heading', () => {
    render(<ProvisioningOverlay name="   " provStep={0} />);
    expect(
      screen.getByRole('heading', { name: 'Standing up Untitled project' }),
    ).toBeInTheDocument();
  });

  it('renders all six steps with their meta tags verbatim', () => {
    render(<ProvisioningOverlay name="X" provStep={0} />);
    expect(PROV_STEPS).toHaveLength(6);
    expect(screen.getByText('Reserving project ID')).toBeInTheDocument();
    expect(screen.getByText('CATALOG')).toBeInTheDocument();
    expect(screen.getByText('Creating GitHub repositories')).toBeInTheDocument();
    expect(screen.getByText('GITHUB')).toBeInTheDocument();
    expect(screen.getByText('Applying Ramboll standards & templates')).toBeInTheDocument();
    expect(screen.getByText('GOLDEN PATH')).toBeInTheDocument();
    expect(screen.getByText('Wiring CI & validation pipelines')).toBeInTheDocument();
    expect(screen.getByText('ACTIONS')).toBeInTheDocument();
    expect(screen.getByText('Setting branch protection & CODEOWNERS')).toBeInTheDocument();
    expect(screen.getByText('GOVERNANCE')).toBeInTheDocument();
    expect(screen.getByText('Granting contributor access')).toBeInTheDocument();
    expect(screen.getByText('ENTRA ID')).toBeInTheDocument();
  });

  it('marks rows before the step done (check icon), the current one active (spinner)', () => {
    const { container } = render(<ProvisioningOverlay name="X" provStep={2} />);
    // Two done rows → two dark check icons.
    expect(container.querySelectorAll('svg')).toHaveLength(2);

    const done = screen.getByText(PROV_STEPS[0]!.label);
    const active = screen.getByText(PROV_STEPS[2]!.label);
    const pending = screen.getByText(PROV_STEPS[3]!.label);
    expect(done).toHaveStyle({ color: 'rgb(230, 234, 240)' }); // #E6EAF0
    expect(active).toHaveStyle({ color: 'rgb(204, 234, 251)' }); // #CCEAFB
    expect(pending).toHaveStyle({ color: 'rgb(105, 132, 168)' }); // #6984A8

    const activeIcon = active.parentElement?.querySelector('span');
    expect(activeIcon).toHaveStyle({ animation: 'spin 0.8s linear infinite' });
  });

  it('shows every row done at the final step', () => {
    const { container } = render(<ProvisioningOverlay name="X" provStep={6} />);
    expect(container.querySelectorAll('svg')).toHaveLength(PROV_STEPS.length);
  });
});
