import { randomUUID } from 'node:crypto';
export const PASSWORD='FictionalOnlyTestPassword_2026';
export const headers={origin:'http://127.0.0.1:5173','x-lga-local-client':'1'};
export async function seedFixture(app,pool) {
 const suffix=randomUUID();const accounts={};
 for(const role of ['owner','adminA','teacherA','adminB','adult']) {
  const email=role.toLowerCase()+'.'+suffix+'@example.invalid';
  const response=await app.inject({method:'POST',url:'/api/auth/register',headers,payload:{email,password:PASSWORD}});
  if(response.statusCode!==200)throw Error('Fixture registration failed: '+response.statusCode);
  accounts[role]={...response.json().adult,cookie:response.headers['set-cookie'].split(';')[0]};
 }
 const schoolA=randomUUID(),schoolB=randomUUID(),orgA=randomUUID(),orgB=randomUUID();
 await pool.query("INSERT INTO local_account_roles(adult_id,role) VALUES($1,'owner')",[accounts.owner.id]);
 for(const [school,org] of [[schoolA,orgA],[schoolB,orgB]]) {
  await pool.query("INSERT INTO local_organizations(id,display_name) VALUES($1,'Fictional test organization')",[org]);
  await pool.query("INSERT INTO schools(id,display_name,status) VALUES($1,'Fictional test school','active')",[school]);
  await pool.query("INSERT INTO local_school_tenants(school_id,organization_id,expires_at) VALUES($1,$2,NOW()+INTERVAL '1 day')",[school,org]);
 }
 for(const [role,school,org,permission] of [['adminA',schoolA,orgA,'school_admin'],['teacherA',schoolA,orgA,'teacher'],['adminB',schoolB,orgB,'school_admin']])await pool.query('INSERT INTO local_school_memberships(adult_id,school_id,organization_id,role) VALUES($1,$2,$3,$4)',[accounts[role].id,school,org,permission]);
 return {accounts,schoolA,schoolB,orgA,orgB};
}
export const schoolConfig={schema:1,countryCode:'INTL',frameworkId:'intl-core',stages:['A3','A4','A5'],defaultStage:'A4',languages:['en'],classes:[],version:0};
