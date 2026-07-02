/**
 * `/new` — the "Initialize a project" golden path. Thin route: wraps the
 * wizard in the AppShell and holds the wizard|created view state (design
 * `state.view`, lines 600/698). Provisioning itself lives in `WizardScreen`;
 * once it completes, the created snapshot swaps this route to `CreatedScreen`.
 */
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { AppShell } from '../components/shell/AppShell';
import { CreatedScreen } from '../components/wizard/CreatedScreen';
import { WizardScreen } from '../components/wizard/WizardScreen';
import type { CreatedProject } from '../lib/wizard-model';

export const Route = createFileRoute('/new')({
  component: NewProjectPage,
});

function NewProjectPage() {
  const [created, setCreated] = useState<CreatedProject | null>(null);
  const navigate = useNavigate();

  return (
    <AppShell>
      {created ? (
        <CreatedScreen
          created={created}
          onGoHome={() => void navigate({ to: '/' })}
          onGoProjects={() => void navigate({ to: '/projects' })}
        />
      ) : (
        <WizardScreen onCreated={setCreated} />
      )}
    </AppShell>
  );
}
