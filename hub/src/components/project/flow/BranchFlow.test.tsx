/**
 * Interaction tests for BranchFlow (SPEC §18.3): rails + tributaries render,
 * hover connect/dim, click focus mode, keyboard roving focus, empty state,
 * and the running-CI pulse — all against a typed fixture of the frozen
 * `OverviewBranch` wire shape.
 */
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { OverviewBranch } from '../../../lib/types';
import { BranchFlow } from './BranchFlow';

const NOW = Math.floor(Date.now() / 1000);

function branch(over: Partial<OverviewBranch> & Pick<OverviewBranch, 'name' | 'kind'>): OverviewBranch {
  return {
    ahead: 0,
    behind: 0,
    author: null,
    tip: { sha: 'aaaaaaaa', message: 'tip commit', at: NOW - 7200 },
    ci: 'none',
    pr: null,
    commits: [],
    ...over,
  };
}

const RAILS: OverviewBranch[] = [
  branch({ name: 'main', kind: 'main', ci: 'passed', tip: { sha: 'aaa1111f', message: 'release', at: NOW - 86400 } }),
  branch({ name: 'staging', kind: 'staging', ci: 'none' }),
  branch({ name: 'dev', kind: 'dev', ci: 'passed', tip: { sha: 'ddd4444f', message: 'merge', at: NOW - 3600 } }),
];

const FIXTURE: OverviewBranch[] = [
  ...RAILS,
  branch({
    name: 'feature/rmb-142-load-forecasting',
    kind: 'feature',
    ahead: 3,
    ci: 'running',
    author: { name: 'Magdalena Keller', github_login: 'mkeller' },
    tip: { sha: 'fff0001a', message: 'tune model', at: NOW - 3600 },
    commits: [
      { sha: 'fff0001a', message: 'tune model', author_login: 'mkeller', at: NOW - 3600 },
      { sha: 'fff0002b', message: 'add forecaster', author_login: 'mkeller', at: NOW - 7200 },
      { sha: 'fff0003c', message: 'scaffold', author_login: 'mkeller', at: NOW - 10800 },
    ],
  }),
  branch({
    name: 'bug/rmb-201-null-meter-reading',
    kind: 'bug',
    ahead: 1,
    behind: 2,
    ci: 'passed',
    author: { name: 'Joe Evans', github_login: 'jevans' },
    tip: { sha: 'bbb0001a', message: 'guard nulls', at: NOW - 1800 },
    pr: { number: 12, title: 'Guard null meter readings', target: 'dev', reviews_done: 1, reviews_required: 2 },
    commits: [
      { sha: 'bbb0001a', message: 'guard nulls', author_login: 'jevans', at: NOW - 1800 },
      { sha: 'bbb0002b', message: 'repro test', author_login: 'jevans', at: NOW - 5400 },
    ],
  }),
  branch({
    name: 'hotfix/rmb-300-rollback-cache',
    kind: 'hotfix',
    ahead: 1,
    ci: 'failed',
    author: { name: 'Mansi Gautam', github_login: 'mgautam' },
    tip: { sha: 'ccc0001a', message: 'rollback', at: NOW - 600 },
    commits: [{ sha: 'ccc0001a', message: 'rollback', author_login: 'mgautam', at: NOW - 600 }],
  }),
];

const FEATURE = 'feature/rmb-142-load-forecasting';

describe('BranchFlow', () => {
  it('renders the three rails and one lane per working branch', () => {
    render(<BranchFlow branches={FIXTURE} />);
    expect(screen.getByText('main')).toBeInTheDocument();
    expect(screen.getByText('staging')).toBeInTheDocument();
    expect(screen.getByText('dev')).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
    // Rail right edge: tip sha + relative age.
    expect(screen.getByText('aaa1111')).toBeInTheDocument();
    expect(screen.getByText('1d ago')).toBeInTheDocument();
  });

  it('sorts lanes running-first, then newest tip', () => {
    render(<BranchFlow branches={FIXTURE} />);
    const labels = screen.getAllByRole('listitem').map((el) => el.getAttribute('aria-label'));
    expect(labels[0]).toContain('feature/rmb-142-load-forecasting'); // running CI first
    expect(labels[1]).toContain('hotfix/rmb-300-rollback-cache'); // then at desc
    expect(labels[2]).toContain('bug/rmb-201-null-meter-reading');
    expect(labels[0]).toBe('feature/rmb-142-load-forecasting, 3 ahead, CI running, by Magdalena Keller');
  });

  it('hover lifts the lane and dims everything else (rails included)', async () => {
    const user = userEvent.setup();
    const { container } = render(<BranchFlow branches={FIXTURE} />);
    const lanes = screen.getAllByRole('listitem');
    const featureLane = lanes[0]!;
    const bugLane = lanes[2]!;

    await user.hover(featureLane);
    expect(featureLane.className).toContain('rdh-flow-lane--lift');
    expect(featureLane.className).not.toContain('rdh-flow-dim');
    expect(bugLane.className).toContain('rdh-flow-dim');
    for (const rail of container.querySelectorAll('.rdh-flow-rail')) {
      expect(rail.className).toContain('rdh-flow-dim');
    }

    await user.unhover(featureLane);
    expect(featureLane.className).not.toContain('rdh-flow-lane--lift');
    expect(bugLane.className).not.toContain('rdh-flow-dim');
  });

  it('click enters focus mode: expands, reveals the detail strip, fires onSelect(name)', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<BranchFlow branches={FIXTURE} onSelect={onSelect} />);
    const bugLane = screen.getAllByRole('listitem')[2]!;

    await user.click(screen.getByText('bug/rmb-201-null-meter-reading'));
    expect(bugLane).toHaveAttribute('aria-expanded', 'true');
    expect(onSelect).toHaveBeenLastCalledWith('bug/rmb-201-null-meter-reading');
    // Detail strip: PR line with review progress ("PR #12" also exists as the
    // SVG return-curve pill outside the lane, so scope the query to the lane).
    expect(within(bugLane).getByText('PR #12')).toBeInTheDocument();
    expect(within(bugLane).getByText('→ dev')).toBeInTheDocument();
    expect(within(bugLane).getByText('· 1/2 reviews')).toBeInTheDocument();
    // Others compress.
    const featureLane = screen.getAllByRole('listitem')[0]!;
    expect(featureLane.className).toContain('rdh-flow-dim');
  });

  it('clicking the focused lane again exits focus mode and fires onSelect(null)', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<BranchFlow branches={FIXTURE} onSelect={onSelect} />);
    const name = screen.getByText(FEATURE);
    const lane = screen.getAllByRole('listitem')[0]!;

    await user.click(name);
    expect(lane).toHaveAttribute('aria-expanded', 'true');
    await user.click(name);
    expect(lane).toHaveAttribute('aria-expanded', 'false');
    expect(onSelect).toHaveBeenLastCalledWith(null);
  });

  it('Escape exits focus mode and fires onSelect(null)', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<BranchFlow branches={FIXTURE} onSelect={onSelect} />);
    await user.click(screen.getByText(FEATURE));
    expect(screen.getAllByRole('listitem')[0]!).toHaveAttribute('aria-expanded', 'true');

    fireEvent.keyDown(screen.getByRole('list'), { key: 'Escape' });
    expect(screen.getAllByRole('listitem')[0]!).toHaveAttribute('aria-expanded', 'false');
    expect(onSelect).toHaveBeenLastCalledWith(null);
  });

  it('click-away (e.g. on a rail) exits focus mode', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<BranchFlow branches={FIXTURE} onSelect={onSelect} />);
    await user.click(screen.getByText(FEATURE));
    expect(onSelect).toHaveBeenLastCalledWith(FEATURE);

    await user.click(screen.getByText('staging'));
    expect(screen.getAllByRole('listitem')[0]!).toHaveAttribute('aria-expanded', 'false');
    expect(onSelect).toHaveBeenLastCalledWith(null);
  });

  it('ArrowDown/ArrowUp move a roving focus through the lanes', () => {
    render(<BranchFlow branches={FIXTURE} />);
    const list = screen.getByRole('list');
    const lanes = screen.getAllByRole('listitem');
    list.focus();

    fireEvent.keyDown(list, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(lanes[0]);
    fireEvent.keyDown(list, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(lanes[1]);
    fireEvent.keyDown(list, { key: 'ArrowUp' });
    expect(document.activeElement).toBe(lanes[0]);
    // Clamped at the top.
    fireEvent.keyDown(list, { key: 'ArrowUp' });
    expect(document.activeElement).toBe(lanes[0]);
  });

  it('Enter toggles focus mode on the keyboard-focused lane', () => {
    const onSelect = vi.fn();
    render(<BranchFlow branches={FIXTURE} onSelect={onSelect} />);
    const list = screen.getByRole('list');
    const lane = screen.getAllByRole('listitem')[0]!;
    list.focus();
    fireEvent.keyDown(list, { key: 'ArrowDown' });

    fireEvent.keyDown(lane, { key: 'Enter' }); // bubbles to the list handler
    expect(lane).toHaveAttribute('aria-expanded', 'true');
    expect(onSelect).toHaveBeenLastCalledWith(FEATURE);

    fireEvent.keyDown(lane, { key: 'Enter' });
    expect(lane).toHaveAttribute('aria-expanded', 'false');
    expect(onSelect).toHaveBeenLastCalledWith(null);
  });

  it('renders the dashed placeholder when only rails exist', () => {
    render(<BranchFlow branches={RAILS} />);
    expect(screen.getByText(/No working branches — start one:/)).toBeInTheDocument();
    expect(screen.getByText(/git switch -c feature\//)).toBeInTheDocument();
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });

  it('shows the pulsing CI tip only on the running branch', () => {
    const { container } = render(<BranchFlow branches={FIXTURE} />);
    const running = container.querySelectorAll('.rdh-flow-ci--running');
    expect(running).toHaveLength(1);
    const featureLane = screen.getAllByRole('listitem')[0]!;
    expect(featureLane.querySelector('.rdh-flow-ci--running')).not.toBeNull();
  });

  it('renders commit ticks with sha tooltips and +ahead −behind counters', () => {
    const { container } = render(<BranchFlow branches={FIXTURE} />);
    expect(screen.getByText('+3')).toBeInTheDocument();
    expect(screen.getByText('−2')).toBeInTheDocument();
    // Ticks: 3 for feature, 2 for bug, 1 for hotfix.
    expect(container.querySelectorAll('.rdh-flow-tick')).toHaveLength(6);
    // The short sha appears twice: in the tick tooltip and in the detail row.
    expect(screen.getAllByText('fff0002')).toHaveLength(2);
  });
});
