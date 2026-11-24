import { stopSpeech } from './speechHelp';
let active:HTMLDialogElement|null=null;
function dialog(title:string,description:string){
 if(active)active.close();
 const d=document.createElement('dialog');active=d;d.className='lga-dialog';d.setAttribute('aria-label',title);
 const heading=document.createElement('h2');heading.textContent=title;d.append(heading);
 const p=document.createElement('p');p.textContent=description;d.append(p);
 document.body.append(d);d.addEventListener('close',()=>{d.remove();if(active===d)active=null;});
 return d;
}
export function confirmInApp(message:string):Promise<boolean>{
 return new Promise(resolve=>{
 const d=dialog('Please confirm',message);
 const row=document.createElement('div');row.className='lga-dialog-actions';
 const no=document.createElement('button');no.textContent='Cancel';no.className='lga-secondary';no.onclick=()=>d.close('no');
 const yes=document.createElement('button');yes.textContent='Confirm';yes.className='lga-danger';yes.onclick=()=>d.close('yes');
 row.append(no,yes);d.append(row);d.addEventListener('close',()=>resolve(d.returnValue==='yes'),{once:true});d.showModal();no.focus();
 });
}
export function grownUpCheck():Promise<boolean>{
 stopSpeech();
 return new Promise(resolve=>{
 const d=dialog('Grown-ups only','Press and hold the button to open Parent Corner.');
 d.classList.add('lga-gate-screen');d.replaceChildren();
 d.setAttribute('aria-labelledby','lga-gate-title');d.removeAttribute('aria-label');
 d.innerHTML='<header class="lga-gate-header"><button type="button" class="lga-gate-back" aria-label="Back to games"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 12H5m7-7-7 7 7 7"/></svg></button></header><main class="lga-gate-main"><div class="lga-gate-lock"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2"></rect><path d="M8 11V8a4 4 0 018 0v3"></path></svg></div><h1 id="lga-gate-title">Grown-ups only</h1><p>Press and hold the button to open Parent Corner.</p><div class="lga-gate-progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" aria-label="Hold progress"><div></div></div><button class="lga-gate-hold" type="button">Press and hold</button><p class="lga-gate-tip">Hold for 3 seconds. A quick tap does nothing.</p><button type="button" class="lga-gate-alt">Can’t hold?</button></main>';
 const main=d.querySelector<HTMLElement>('.lga-gate-main')!;
 const progress=d.querySelector<HTMLElement>('.lga-gate-progress')!,bar=progress.firstElementChild as HTMLElement;
 const hold=d.querySelector<HTMLButtonElement>('.lga-gate-hold')!,alt=d.querySelector<HTMLButtonElement>('.lga-gate-alt')!,back=d.querySelector<HTMLButtonElement>('.lga-gate-back')!;
 let timer=0,start=0,holding=false,owner:string|null=null;
 const pct=(n:number)=>{bar.style.width=n+'%';progress.setAttribute('aria-valuenow',String(Math.round(n)));};
 const reset=()=>{holding=false;owner=null;if(timer)cancelAnimationFrame(timer);timer=0;pct(0);};
 const frame=(now:number)=>{if(!holding||!d.open)return;const value=Math.min(100,(now-start)/30);pct(value);if(value>=100){holding=false;owner=null;timer=0;d.close('yes');}else timer=requestAnimationFrame(frame);};
 const begin=(key:string)=>{if(holding)return;holding=true;owner=key;start=performance.now();timer=requestAnimationFrame(frame);};
 const pointerEnd=(e:PointerEvent)=>{if(owner==='p'+e.pointerId)reset();};
 hold.addEventListener('pointerdown',e=>{if(e.button===0&&e.isPrimary){e.preventDefault();hold.focus();begin('p'+e.pointerId);}});
 hold.addEventListener('pointerleave',pointerEnd);
 hold.addEventListener('pointercancel',pointerEnd);
 hold.addEventListener('pointerup',pointerEnd);
 hold.addEventListener('blur',reset);
 hold.addEventListener('keydown',e=>{if(e.key===' '||e.key==='Enter'){e.preventDefault();if(!e.repeat)begin('k'+e.key);}});
 hold.addEventListener('keyup',e=>{if(owner==='k'+e.key){e.preventDefault();reset();}});
 hold.addEventListener('click',e=>e.preventDefault());
 hold.addEventListener('contextmenu',e=>e.preventDefault());
 window.addEventListener('pointerup',pointerEnd);
 window.addEventListener('pointercancel',pointerEnd);
 window.addEventListener('blur',reset);
 const visibility=()=>{if(document.hidden)reset();};document.addEventListener('visibilitychange',visibility);
 back.onclick=()=>d.close('no');
 alt.onclick=()=>{reset();const a=20+Math.floor(Math.random()*40),b=20+Math.floor(Math.random()*40);
 const form=document.createElement('form');form.className='lga-gate-question';
 const label=document.createElement('label');label.textContent='What is '+a+' + '+b+'?';
 const input=document.createElement('input');input.type='number';input.required=true;input.inputMode='numeric';label.append(input);
 const go=document.createElement('button');go.type='submit';go.className='lga-gate-hold';go.textContent='Continue';
 const msg=document.createElement('p');msg.setAttribute('role','status');
 const again=document.createElement('button');again.type='button';again.className='lga-gate-alt';again.textContent='Use press and hold';again.onclick=()=>{form.replaceWith(alt);hold.hidden=false;progress.hidden=false;d.querySelector<HTMLElement>('.lga-gate-tip')!.hidden=false;hold.focus();};
 form.append(label,go,msg,again);form.onsubmit=e=>{e.preventDefault();if(Number(input.value)===a+b)d.close('yes');else msg.textContent='Please try again.';};
 hold.hidden=true;progress.hidden=true;d.querySelector<HTMLElement>('.lga-gate-tip')!.hidden=true;alt.replaceWith(form);input.focus();};
 d.addEventListener('cancel',reset);
 d.addEventListener('close',()=>{reset();window.removeEventListener('pointerup',pointerEnd);window.removeEventListener('pointercancel',pointerEnd);window.removeEventListener('blur',reset);document.removeEventListener('visibilitychange',visibility);resolve(d.returnValue==='yes');},{once:true});
 d.showModal();hold.focus();
 });
}
