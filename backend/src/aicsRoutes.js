import { randomUUID } from 'node:crypto';
import { getAdult, allowMutation } from './localAuth.js';
import { getSchoolCurriculum, putSchoolCurriculum } from '../../frontend/src/aics/schoolService.ts';
import { listOwnerPacks, listOwnerAudit, ownerAction, curriculumManifest } from '../../frontend/src/aics/ownerCurriculum.ts';

// Entire AICS operation, permission lookup, CAS writes and audit share one transaction.
// Serialization also prevents publication racing an emergency revocation.
export async function withAicsTransaction(pool, run) {
 const db=await pool.connect(); let committing=false;
 try {
  await db.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
  await db.query('SELECT pg_advisory_xact_lock(481006)');
  let queue=Promise.resolve();
  const session={query(...args){const next=queue.then(()=>db.query(...args));queue=next.catch(()=>{});return next;}};
  const result=await run(session); await queue; committing=true;
  await db.query('COMMIT'); return result;
 } catch(error) {
  await db.query('ROLLBACK').catch(()=>{});
  if(committing && !['40001','40P01','23505'].includes(error.code)) error.unknownOutcome=true;
  throw error;
 } finally { db.release(); }
}
export function ownerStore(db) {
 const docs=async(sql,args=[]) => (await db.query(sql,args)).rows.map(r=>r.document);
 return {
  getRelease:async id=>(await docs('SELECT document FROM local_curriculum_releases WHERE id=$1',[id]))[0]??null,
  listReleases:()=>docs('SELECT document FROM local_curriculum_releases ORDER BY id'),
  listCurrent:()=>docs('SELECT document FROM local_curriculum_current ORDER BY framework_id'),
  listRevocations:()=>docs('SELECT document FROM local_curriculum_revocations ORDER BY digest'),
  listAudit:async limit=>(await db.query('SELECT id,actor,at,action,subject,detail FROM local_aics_audit ORDER BY at DESC,id LIMIT $1',[limit])).rows.map(r=>({id:r.id,actor:r.actor,at:r.at.toISOString(),action:r.action,releaseId:r.subject,detail:r.detail})),
  newId:randomUUID, now:()=>new Date().toISOString(),
  commit:async ops=>{
   // Savepoint is essential: a failed compare must not leave earlier operations committed.
   await db.query('SAVEPOINT aics_ops');
   try {
    for(const op of ops) {
     let changed=1;
     if(op.kind==='release') {
      const v=op.value;
      changed=op.expectedRev===null
       ? (await db.query('INSERT INTO local_curriculum_releases(id,rev,document) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',[v.id,v.rev,v])).rowCount
       : (await db.query('UPDATE local_curriculum_releases SET rev=$2,document=$3 WHERE id=$1 AND rev=$4',[v.id,v.rev,v,op.expectedRev])).rowCount;
     } else if(op.kind==='current') {
      const row=(await db.query('SELECT release_id FROM local_curriculum_current WHERE framework_id=$1 FOR UPDATE',[op.frameworkId])).rows[0];
      if((row?.release_id??null)!==op.expectedReleaseId) changed=0;
      else if(op.value) await db.query('INSERT INTO local_curriculum_current(framework_id,release_id,document) VALUES($1,$2,$3) ON CONFLICT(framework_id) DO UPDATE SET release_id=EXCLUDED.release_id,document=EXCLUDED.document',[op.frameworkId,op.value.releaseId,op.value]);
      else await db.query('DELETE FROM local_curriculum_current WHERE framework_id=$1',[op.frameworkId]);
     } else if(op.kind==='revocation') await db.query('INSERT INTO local_curriculum_revocations(digest,document) VALUES($1,$2) ON CONFLICT DO NOTHING',[op.value.digest,op.value]);
     else if(op.kind==='audit') { const v=op.value; await db.query('INSERT INTO local_aics_audit(id,actor,at,action,subject,detail) VALUES($1,$2,$3,$4,$5,$6)',[v.id,v.actor,v.at,v.action,v.releaseId,v.detail]); }
     else throw new Error('Unknown operation');
     if(!changed) {await db.query('ROLLBACK TO SAVEPOINT aics_ops');await db.query('RELEASE SAVEPOINT aics_ops');return false;}
    }
    await db.query('RELEASE SAVEPOINT aics_ops');return true;
   } catch(error) {await db.query('ROLLBACK TO SAVEPOINT aics_ops');await db.query('RELEASE SAVEPOINT aics_ops');throw error;}
  }
 };
}
async function membership(db,id) {
 return (await db.query(`SELECT m.school_id,m.role,t.expires_at FROM local_school_memberships m
 JOIN local_school_tenants t ON t.school_id=m.school_id AND t.organization_id=m.organization_id
 JOIN local_organizations o ON o.id=t.organization_id JOIN schools s ON s.id=t.school_id
 WHERE m.adult_id=$1 AND m.active AND t.active AND o.active AND s.status='active' AND t.expires_at>NOW()
 FOR SHARE OF m,t,o,s`,[id])).rows[0]??null;
}
function schoolStore(db,adult,member) {
 return {
  getEntitlement:async id=>id===adult.id&&member?{licenceId:member.school_id}:null,
  getLicence:async id=>member&&id===member.school_id?{id,email:member.role==='school_admin'?adult.email:'',expiresAt:member.expires_at.toISOString(),revoked:false}:null,
  getConfig:async id=>(await db.query('SELECT document FROM local_school_configs WHERE school_id=$1',[id])).rows[0]?.document??null,
  putConfig:async(id,config,version)=>{
   const result=version===null
    ?await db.query('INSERT INTO local_school_configs(school_id,version,document) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',[id,config.version,config])
    :await db.query('UPDATE local_school_configs SET version=$2,document=$3 WHERE school_id=$1 AND version=$4',[id,config.version,config,version]);
   if(!result.rowCount)return false;
   await db.query('INSERT INTO local_aics_audit(id,actor,at,action,subject,detail) VALUES($1,$2,NOW(),$3,$4,$5)',[randomUUID(),adult.id,'school-config',id,'settings version '+config.version]);return true;
  },now:Date.now
 };
}
export function registerAicsRoutes(app,pool) {
 const route=(method,url,action)=>app.route({method,url,handler:async(request,reply)=>{
  if(method!=='GET'&&!allowMutation(request,reply))return;
  try {
   return await withAicsTransaction(pool,async db=>{
    const adult=await getAdult(request,db);
    if(!adult)return reply.code(401).send({error:'Sign in required.'});
    const available=(await db.query("SELECT to_regclass('public.local_account_roles') AS roles")).rows[0].roles;
    if(!available) {
     if(action==='capabilities')return {owner:false,school:false,canEdit:false,available:false};
     return reply.code(503).send({error:'AICS schema is not installed. Existing account/progress APIs remain available.'});
    }
    const role=(await db.query('SELECT role FROM local_account_roles WHERE adult_id=$1 FOR SHARE',[adult.id])).rows[0]?.role??'adult';
    const member=await membership(db,adult.id);
    if(action==='capabilities')return {owner:role==='owner',school:!!member,canEdit:member?.role==='school_admin',available:true};
    const caller={userId:adult.id,email:adult.email,role};const store=ownerStore(db);
    let result;
    if(action==='school-get'||action==='school-put') {
     if(action==='school-put'&&member?.role!=='school_admin')return reply.code(403).send({error:'School administrator required.'});
     result=action==='school-get'?await getSchoolCurriculum(caller,schoolStore(db,adult,member)):await putSchoolCurriculum(caller,request.body,schoolStore(db,adult,member));
     if(result.ok)return result.value;
    } else if(action==='manifest')return await curriculumManifest(store);
    else if(action==='packs')result=await listOwnerPacks(caller,store);
    else if(action==='audit')result=await listOwnerAudit(caller,store);
    else result=await ownerAction(caller,request.params.action,()=>request.body,store);
    if(!result.ok)return reply.code(result.status).send({error:result.error,...(result.blockers?{blockers:result.blockers}:{})});
    return result;
   });
  } catch(error) {
   if(error.code==='40001'||error.code==='40P01')return reply.code(409).send({error:'Settings changed concurrently. Reload and retry.'});
   return reply.code(503).send({error:error.unknownOutcome?'Save outcome unknown. Reload before retrying.':'AICS storage unavailable.'});
  }
 }});
 route('GET','/api/account/capabilities','capabilities');
 route('GET','/api/school/curriculum','school-get');route('PUT','/api/school/curriculum','school-put');
 route('GET','/api/curriculum/manifest','manifest');route('GET','/api/curriculum/owner/packs','packs');
 route('GET','/api/curriculum/owner/audit','audit');route('POST','/api/curriculum/owner/:action','owner-action');
}
