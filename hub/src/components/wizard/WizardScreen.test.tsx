import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PROV_STEPS, PROV_TICK_MS } from '../../lib/wizard-model';
import { WizardScreen } from './WizardScreen';

function setup() {
  const onCreated = vi.fn();
  const utils = render(<WizardScreen onCreated={onCreated} />);
  return { onCreated, ...utils };
}

function fillValidDraft() {
  fireEvent.change(screen.getByPlaceholderText('e.g. District Heating Optimizer'), {
    target: { value: 'District Heating Optimizer' },
  });
  fireEvent.click(screen.getByText('Energy'));
  fireEvent.click(screen.getByText('Backend API')); // type card → adds a service
}

describe('WizardScreen', () => {
  it('renders the header copy verbatim', () => {
    setup();
    expect(screen.getByText('GOLDEN PATH · NEW PROJECT')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Initialize a project' })).toBeInTheDocument();
    expect(
      screen.getByText(
        'Every project ships with best-in-class building blocks: standardized architecture, approved libraries, CI & validation pipelines via GitHub Actions.',
      ),
    ).toBeInTheDocument();
  });

  it('shows the slug hint fallback and updates it as the name is typed', () => {
    setup();
    expect(screen.getByText('unnamed-project')).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText('e.g. District Heating Optimizer'), {
      target: { value: 'Grid Twin 2.0' },
    });
    expect(screen.getByText('grid-twin-2-0')).toBeInTheDocument();
  });

  it('disables Initialize and lists every missing part until the draft is complete', () => {
    setup();
    const button = screen.getByRole('button', { name: 'Initialize project' });
    expect(button).toBeDisabled();
    expect(
      screen.getByText('Needs a name, a GBA, at least one service.'),
    ).toBeInTheDocument();

    fillValidDraft();
    expect(button).toBeEnabled();
    expect(screen.getByText('~40 seconds. Everything is reversible.')).toBeInTheDocument();
  });

  it('toggles a GBA chip on and off (single-select)', () => {
    setup();
    fireEvent.click(screen.getByText('Energy'));
    // Blueprint chip flips away from the empty-state copy…
    expect(screen.queryByText('No GBA yet')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('Water'));
    // …and single-select means Water replaced Energy, still no empty state.
    expect(screen.queryByText('No GBA yet')).not.toBeInTheDocument();
    // 'Water' now also shows in the blueprint chip; the form chip comes first.
    fireEvent.click(screen.getAllByText('Water')[0]!);
    expect(screen.getByText('No GBA yet')).toBeInTheDocument();
  });

  it('counts the owner plus toggled contributors in the blueprint team chip', () => {
    setup();
    expect(screen.getByText('1 people')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Daniel Bruun'));
    fireEvent.click(screen.getByText('Magdalena Keller'));
    expect(screen.getByText('3 people')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Daniel Bruun'));
    expect(screen.getByText('2 people')).toBeInTheDocument();
  });

  it('adds service rows with ordinal repo names when a type repeats', () => {
    setup();
    fireEvent.change(screen.getByPlaceholderText('e.g. District Heating Optimizer'), {
      target: { value: 'District Heating Optimizer' },
    });
    fireEvent.click(screen.getByText('Backend API'));
    // One api service: unsuffixed (form row + blueprint node render it).
    expect(screen.getAllByText('district-heating-optimizer-api')).toHaveLength(2);

    // 'Backend API' now also labels the row + blueprint node; the type card comes first.
    fireEvent.click(screen.getAllByText('Backend API')[0]!);
    expect(screen.getAllByText('district-heating-optimizer-api-1')).toHaveLength(2);
    expect(screen.getAllByText('district-heating-optimizer-api-2')).toHaveLength(2);
  });

  it('removes a service row via the ✕ control', () => {
    setup();
    fireEvent.click(screen.getByText('Frontend'));
    expect(screen.getAllByText('unnamed-project-fe')).toHaveLength(2);
    fireEvent.click(screen.getByText('✕'));
    expect(screen.queryByText('unnamed-project-fe')).not.toBeInTheDocument();
    expect(screen.getByText('Add service components to see them here')).toBeInTheDocument();
  });

  describe('provisioning sequence', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it('does not open the overlay when the draft is incomplete', () => {
      setup();
      fireEvent.click(screen.getByRole('button', { name: 'Initialize project' }));
      expect(screen.queryByText('PROVISIONING · RMB-NEW')).not.toBeInTheDocument();
    });

    it('walks the six steps every 750ms and reports the created project', () => {
      const { onCreated } = setup();
      fillValidDraft();
      fireEvent.click(screen.getByText('Python')); // switch the api service language
      fireEvent.click(screen.getByText('Joe Evans'));
      fireEvent.click(screen.getByRole('button', { name: 'Initialize project' }));

      expect(screen.getByText('PROVISIONING · RMB-NEW')).toBeInTheDocument();
      expect(screen.getByText('Standing up District Heating Optimizer')).toBeInTheDocument();
      for (const st of PROV_STEPS) {
        expect(screen.getByText(st.label)).toBeInTheDocument();
        expect(screen.getByText(st.meta)).toBeInTheDocument();
      }

      // Steps 1..6 turn done tick by tick; completion fires on tick 7.
      act(() => {
        vi.advanceTimersByTime(PROV_TICK_MS * PROV_STEPS.length);
      });
      expect(onCreated).not.toHaveBeenCalled();

      act(() => {
        vi.advanceTimersByTime(PROV_TICK_MS);
      });
      expect(onCreated).toHaveBeenCalledTimes(1);
      expect(onCreated).toHaveBeenCalledWith({
        name: 'District Heating Optimizer',
        gba: 'Energy',
        services: [{ type: 'api', lang: 'Python' }],
        contributors: ['Joe Evans'],
      });
      // Overlay closes with the hand-off (provStep back to -1).
      expect(screen.queryByText('PROVISIONING · RMB-NEW')).not.toBeInTheDocument();
    });

    it('cleans up the interval on unmount', () => {
      const { onCreated, unmount } = setup();
      fillValidDraft();
      fireEvent.click(screen.getByRole('button', { name: 'Initialize project' }));
      act(() => {
        vi.advanceTimersByTime(PROV_TICK_MS * 2);
      });
      unmount();
      act(() => {
        vi.advanceTimersByTime(PROV_TICK_MS * 20);
      });
      expect(onCreated).not.toHaveBeenCalled();
    });
  });
});
