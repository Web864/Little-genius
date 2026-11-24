import './styles.css';
import './redesign.css';
import './previewBanner.css';
import './localAccount.css';
import { activateAccount, parkAccount, watchAccountConflict, ACTIVE_OWNER_KEY } from './aics/accountScope';
import { mountLocalAccount } from './localAccount';
import { grownUpCheck, confirmInApp } from './grownUp';
import { installSchoolSettings } from './aics/schoolSettings';
import { installOwnerManager } from './aics/curriculumManager';
import { syncSchoolDefaults } from './aics/schoolConfig';
import { installOwnership } from './aics/ownership';
import { syncPublished } from './aics/publishedGate';
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
async function request(url:string, method='GET', body?:unknown):Promise<unknown> {
  const response=await fetch(url,{method,credentials:'same-origin',headers:{'X-LGA-Local-Client':'1',...(body===undefined?{}:{'Content-Type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)})});
  const data=await response.json();
  if(!response.ok)throw Object.assign(new Error(data.error ?? 'Local request failed'),{response:{status:response.status,data}});
  return data;
}
async function start(): Promise<void> {
  const response = await fetch('/api/auth/me', { credentials: 'same-origin' });
  if (!response.ok) throw new Error('Local account verification unavailable.');
  const { adult } = await response.json();
  const storage = safeLocalStorage();
  if (adult) {
    const scope = await activateAccount(storage, adult.id);
    if (!scope.ok) throw new Error('Account storage could not be isolated.');
    watchAccountConflict(window, scope.owner, () => location.reload());
    installOwnership({userId:()=>adult.id,confirm:confirmInApp});
  } else if (storage?.getItem(ACTIVE_OWNER_KEY)) {
    if (!(await parkAccount(storage)).ok) throw new Error('Account progress could not be parked.');
  }
  if(!adult)window.addEventListener('storage',event=>{if(event.key===ACTIVE_OWNER_KEY)location.reload();});
  const api = {
    async get(url: string) { return { data: await request(url) }; },
    async put(url: string, body: unknown) { return { data: await request(url, 'PUT', body) }; },
    async post(url: string, body: unknown) { return { data: await request(url, 'POST', body) }; }
  };
  if (adult) {
    const capabilities = await request('/api/account/capabilities') as { owner?:boolean;school?:boolean };
    installSchoolSettings({api,isLicensed:()=>capabilities.school===true,confirm:confirmInApp,storage});
    installOwnerManager({api,isOwner:()=>capabilities.owner===true,confirm:confirmInApp});
    await syncSchoolDefaults(api,storage,capabilities.school?'licensed':undefined);
    await syncPublished(api,storage);
  }
  mountLocalAccount();
  await maybeRunOnboarding(app, { gate: grownUpCheck, storage: safeLocalStorage() });
  const { mountLearningApp } = await import('./learningApp');
  mountLearningApp();
}
void start().catch(() => { app.textContent = 'Unable to verify local account storage. Start the local backend and reload. Saved progress has not been assigned to another account.'; });
