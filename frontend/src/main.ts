import './styles.css';
import './redesign.css';
import './previewBanner.css';
import './localAccount.css';
import { mountLocalAccount } from './localAccount';
import { mountLearningApp } from './learningApp';
import { grownUpCheck } from './grownUp';
import { maybeRunOnboarding, openWizard } from './aics/onboarding';
import { safeLocalStorage } from './aics/bootstrap';

const app = document.querySelector<HTMLDivElement>('#app')!;
const notice = document.createElement('aside');
notice.className = 'preview-notice';
notice.textContent = 'AICS PREVIEW · Original learning games + real AICS Draft onboarding · Local TEST accounts + profile sync · No licences, school admin or production backend';
// In narrow layouts the notice participates in document flow, before game controls.
document.body.insertBefore(notice, app);
const edit = document.createElement('button');
edit.className = 'preview-edit';
edit.type = 'button';
edit.textContent = 'Curriculum & Language';
document.body.insertBefore(edit, app);
let editing = false;
edit.addEventListener('click', async () => {
  if (editing) return;
  editing = true;
  try {
    const allowed = await grownUpCheck();
    if (!allowed) return;
    const layer = document.createElement('div');
    layer.className = 'preview-overlay';
    layer.setAttribute('role', 'dialog');
    layer.setAttribute('aria-modal', 'true');
    document.body.append(layer);
    try {
      const result = await openWizard({ mode: 'edit', host: layer, storage: safeLocalStorage() });
      if (result === 'saved' || result === 'skipped') location.reload();
    } finally { layer.remove(); }
  } finally { editing = false; }
});
async function start(): Promise<void> {
  await maybeRunOnboarding(app, { gate: grownUpCheck, storage: safeLocalStorage() });
  mountLearningApp();
}
void start().catch(() => { mountLearningApp(); });
mountLocalAccount();
