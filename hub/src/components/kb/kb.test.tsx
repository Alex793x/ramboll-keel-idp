/**
 * Knowledge Base component tests — RichText grammar, home screen
 * filtering/empty state, doc reader blocks + TOC + copy feedback, and
 * diagram rendering (legend, nodes, hover dimming).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { RichText } from './RichText';
import { KbHomeScreen } from './KbHomeScreen';
import { DocReader } from './DocReader';
import { DocDiagram } from './DocDiagram';
import { DOCS } from '../../lib/docs-data';

function docById(id: string) {
  const doc = DOCS.find((d) => d.id === id);
  if (!doc) throw new Error(`fixture doc ${id} missing`);
  return doc;
}

beforeEach(() => {
  // jsdom implements neither; the reader falls back to window scrolling.
  window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;
});

describe('RichText', () => {
  it('parses the whole inline grammar into styled spans', () => {
    const { container } = render(
      <RichText md="plain **bold** and `code` and [link](https://x) and *em* tail" />,
    );
    const strong = container.querySelector('strong');
    expect(strong).toHaveTextContent('bold');
    expect(strong).toHaveStyle({ fontWeight: '800', color: '#FFFFFF' });
    const code = container.querySelector('code');
    expect(code).toHaveTextContent('code');
    expect(code).toHaveStyle({ color: '#99D6F7' });
    const em = container.querySelector('em');
    expect(em).toHaveTextContent('em');
    expect(screen.getByText('link')).toHaveStyle({ fontWeight: '700', color: '#66C1F3' });
    expect(container).toHaveTextContent('plain bold and code and link and em tail');
  });

  it('passes plain text through untouched', () => {
    const { container } = render(<RichText md="nothing fancy here" />);
    expect(container.textContent).toBe('nothing fancy here');
    expect(container.querySelector('strong')).toBeNull();
  });
});

describe('KbHomeScreen', () => {
  it('renders header copy, all three guide cards and the six stubs', () => {
    render(<KbHomeScreen onOpenDoc={() => {}} />);
    expect(screen.getByText('KNOWLEDGE BASE')).toBeInTheDocument();
    expect(screen.getByText('Understand everything.')).toBeInTheDocument();
    expect(screen.getByText('Create a new API service')).toBeInTheDocument();
    expect(screen.getByText('Event-driven service architecture')).toBeInTheDocument();
    expect(screen.getByText('Authoring docs & diagrams')).toBeInTheDocument();
    expect(screen.getByText('IN PROGRESS — LANDING SOON')).toBeInTheDocument();
    expect(screen.getByText('Deploy to Azure')).toBeInTheDocument();
    expect(screen.getAllByText('SOON')).toHaveLength(6);
    // meta line: read time · diagram count · updated, uppercased
    expect(screen.getByText('6 MIN · 1 DIAGRAMS · UPD 28 JUN 2026')).toBeInTheDocument();
  });

  it('filters cards and stubs by query (title + desc + category)', () => {
    render(<KbHomeScreen onOpenDoc={() => {}} />);
    const input = screen.getByPlaceholderText('Filter guides… try “diagram”');
    fireEvent.change(input, { target: { value: 'diagram' } });
    expect(screen.getByText('Authoring docs & diagrams')).toBeInTheDocument();
    expect(screen.queryByText('Create a new API service')).toBeNull();
    expect(screen.queryByText('Event-driven service architecture')).toBeNull();
    // stubs filter on title only → none contain "diagram"
    expect(screen.queryByText('Deploy to Azure')).toBeNull();
  });

  it('filters by category chip AND query', () => {
    render(<KbHomeScreen onOpenDoc={() => {}} />);
    fireEvent.click(screen.getByText('Architecture'));
    expect(screen.getByText('Event-driven service architecture')).toBeInTheDocument();
    expect(screen.queryByText('Create a new API service')).toBeNull();
    // query that matches a doc outside the selected category → no results
    const input = screen.getByPlaceholderText('Filter guides… try “diagram”');
    fireEvent.change(input, { target: { value: 'API service' } });
    expect(screen.queryByText('Event-driven service architecture')).toBeNull();
  });

  it('shows the exact empty state only when a query matches nothing', () => {
    render(<KbHomeScreen onOpenDoc={() => {}} />);
    const empty = 'No guides match — try “API”, “event” or “diagram”.';
    expect(screen.queryByText(empty)).toBeNull();
    const input = screen.getByPlaceholderText('Filter guides… try “diagram”');
    fireEvent.change(input, { target: { value: 'zzz-no-such-guide' } });
    expect(screen.getByText(empty)).toBeInTheDocument();
  });

  it('opens a doc on card click', () => {
    const onOpenDoc = vi.fn();
    render(<KbHomeScreen onOpenDoc={onOpenDoc} />);
    fireEvent.click(screen.getByText('Create a new API service'));
    expect(onOpenDoc).toHaveBeenCalledWith('create-api');
  });
});

describe('DocReader', () => {
  it('renders the article header, meta card and agent button', () => {
    render(<DocReader doc={docById('create-api')} onBack={() => {}} />);
    expect(screen.getByRole('heading', { level: 1, name: 'Create a new API service' })).toBeInTheDocument();
    expect(screen.getByText('GOLDEN PATH')).toBeInTheDocument();
    expect(screen.getByText('OWNER')).toBeInTheDocument();
    expect(screen.getByText('Developer Platform Engineering')).toBeInTheDocument();
    expect(screen.getByText('VERSION')).toBeInTheDocument();
    // 'v2.3' appears in the standards table too — the meta card adds a second
    expect(screen.getAllByText('v2.3')).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Ask the agent about this page' })).toBeInTheDocument();
  });

  it('builds the TOC from h2/h3 blocks and renders the headings', () => {
    render(<DocReader doc={docById('create-api')} onBack={() => {}} />);
    expect(screen.getByText('ON THIS PAGE')).toBeInTheDocument();
    for (const label of ['What gets provisioned', 'The path, step by step', 'Standards applied']) {
      // once in the TOC, once as the article heading
      expect(screen.getAllByText(label)).toHaveLength(2);
      expect(screen.getByRole('heading', { level: 2, name: label })).toBeInTheDocument();
    }
  });

  it('renders steps with zero-padded numbers and tables with head cells', () => {
    render(<DocReader doc={docById('create-api')} onBack={() => {}} />);
    expect(screen.getByText('01')).toBeInTheDocument();
    expect(screen.getByText('04')).toBeInTheDocument();
    expect(screen.getByText('Clone & run locally')).toBeInTheDocument();
    expect(screen.getByText('What it enforces')).toBeInTheDocument();
    expect(screen.getByText('API Golden Path')).toBeInTheDocument();
  });

  it('flips COPY to COPIED ✓ for 1400ms on click', () => {
    vi.useFakeTimers();
    try {
      render(<DocReader doc={docById('create-api')} onBack={() => {}} />);
      const btn = screen.getByText('COPY');
      fireEvent.click(btn);
      expect(screen.getByText('COPIED ✓')).toBeInTheDocument();
      act(() => {
        vi.advanceTimersByTime(1399);
      });
      expect(screen.getByText('COPIED ✓')).toBeInTheDocument();
      act(() => {
        vi.advanceTimersByTime(1);
      });
      expect(screen.getByText('COPY')).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('calls onBack from the back link', () => {
    const onBack = vi.fn();
    render(<DocReader doc={docById('create-api')} onBack={onBack} />);
    fireEvent.click(screen.getByText('← Knowledge Base'));
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});

describe('DocDiagram', () => {
  const flowSpec = (() => {
    const doc = docById('create-api');
    for (const b of doc.blocks) {
      if (b.t === 'diagram' && b.spec.kind === 'flow') return { title: b.title, spec: b.spec };
    }
    throw new Error('flow fixture missing');
  })();

  const seqSpec = (() => {
    const doc = docById('event-driven');
    for (const b of doc.blocks) {
      if (b.t === 'diagram' && b.spec.kind === 'sequence') return { title: b.title, spec: b.spec };
    }
    throw new Error('sequence fixture missing');
  })();

  it('renders a flow card with tag, nodes and a legend of used kinds', () => {
    render(<DocDiagram title={flowSpec.title} spec={flowSpec.spec} />);
    expect(screen.getByText('Scaffold pipeline')).toBeInTheDocument();
    expect(screen.getByText('FLOW')).toBeInTheDocument();
    expect(screen.getByText('Initialize project')).toBeInTheDocument();
    expect(screen.getByText('Validation gate')).toBeInTheDocument();
    // legend: start, primary, secondary, decision, end, warning
    for (const name of ['TRIGGER', 'SERVICE', 'SUPPORTING', 'DECISION', 'SUCCESS', 'REMEDIATION']) {
      expect(screen.getByText(name)).toBeInTheDocument();
    }
    // edge labels render in white pills
    expect(screen.getByText('pass')).toBeInTheDocument();
    expect(screen.getByText('fail')).toBeInTheDocument();
    expect(screen.getByText('retry')).toBeInTheDocument();
  });

  it('dims unconnected nodes on hover and restores them on leave', () => {
    render(<DocDiagram title={flowSpec.title} spec={flowSpec.spec} />);
    const init = screen.getByText('Initialize project').parentElement;
    const catalog = screen.getByText('Catalog entry').parentElement;
    const repo = screen.getByText('Service repository').parentElement;
    if (!init || !catalog || !repo) throw new Error('node elements missing');
    fireEvent.mouseEnter(init);
    // 'catalog' is not connected to 'init' → dimmed; 'repo' is → not dimmed
    expect(catalog.style.filter).toContain('grayscale');
    expect(repo.style.filter).not.toContain('grayscale');
    expect(init.style.filter).not.toContain('grayscale');
    fireEvent.mouseLeave(init);
    expect(catalog.style.filter).not.toContain('grayscale');
  });

  it('renders a sequence card with lifelines, actors and messages', () => {
    const { container } = render(<DocDiagram title={seqSpec.title} spec={seqSpec.spec} />);
    expect(screen.getByText('One order, end to end')).toBeInTheDocument();
    expect(screen.getByText('SEQUENCE')).toBeInTheDocument();
    for (const actor of ['Client', 'Gateway', 'Orders API', 'Event bus', 'Billing']) {
      expect(screen.getByText(actor)).toBeInTheDocument();
    }
    expect(screen.getByText('POST /orders')).toBeInTheDocument();
    expect(screen.getByText('validate + persist')).toBeInTheDocument();
    const svg = container.querySelector('svg');
    if (!svg) throw new Error('svg missing');
    // 5 dashed lifelines + 5 directed message lines (one message is a self-loop path)
    expect(within(svg as unknown as HTMLElement).queryAllByText(/.*/)).toBeDefined();
    expect(svg.querySelectorAll('line')).toHaveLength(5 + 5);
  });

  it('falls back to the "Diagram" title', () => {
    render(<DocDiagram spec={flowSpec.spec} />);
    expect(screen.getByText('Diagram')).toBeInTheDocument();
  });
});
