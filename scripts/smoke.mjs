#!/usr/bin/env node
/**
 * Local deploy-readiness harness.
 * Expects PATTERNWRIGHT_ADMIN_PASSWORD and PATTERNWRIGHT_SESSION_SECRET in env
 * (and optionally PATTERNWRIGHT_ADMIN_USER). Spawns server.mjs on an ephemeral port.
 */
import {spawn} from 'node:child_process';
import {setTimeout as sleep} from 'node:timers/promises';
import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT=fileURLToPath(new URL('..', import.meta.url));
const PASS=process.env.PATTERNWRIGHT_ADMIN_PASSWORD||'smoke-test-password';
const SECRET=process.env.PATTERNWRIGHT_SESSION_SECRET||'smoke-test-session-secret';
const USER=process.env.PATTERNWRIGHT_ADMIN_USER||'admin';
const PORT=String(18000+Math.floor(Math.random()*1000));
const tmp=mkdtempSync(join(tmpdir(),'pw-smoke-'));
const db=join(tmp,'smoke.db');
const base=`http://127.0.0.1:${PORT}`;

const child=spawn(process.execPath,[join(ROOT,'server.mjs')],{
  cwd:ROOT,
  env:{
    ...process.env,
    PORT,
    HOST:'127.0.0.1',
    PATTERNWRIGHT_DB:db,
    PATTERNWRIGHT_ADMIN_USER:USER,
    PATTERNWRIGHT_ADMIN_PASSWORD:PASS,
    PATTERNWRIGHT_SESSION_SECRET:SECRET,
    NODE_ENV:'test'
  },
  stdio:['ignore','pipe','pipe']
});

let out='';
child.stdout.on('data',d=>out+=d);
child.stderr.on('data',d=>out+=d);

function fail(msg){
  console.error('SMOKE FAIL:',msg);
  console.error(out.slice(-2000));
  cleanup(1);
}
function cleanup(code){
  try{child.kill('SIGTERM')}catch{}
  try{rmSync(tmp,{recursive:true,force:true})}catch{}
  process.exit(code);
}
process.on('exit',()=>{try{child.kill('SIGTERM')}catch{}});

async function waitHealth(){
  for(let i=0;i<40;i++){
    try{
      const r=await fetch(`${base}/api/health`);
      if(r.ok)return r.json();
    }catch{}
    await sleep(100);
  }
  fail('server did not become healthy');
}

function parseSetCookie(res){
  const raw=typeof res.headers.getSetCookie==='function'?res.headers.getSetCookie():[];
  if(raw?.length)return raw.map(v=>v.split(';')[0]).join('; ');
  const one=res.headers.get('set-cookie');
  return one?one.split(';')[0]:'';
}

async function main(){
  const health=await waitHealth();
  if(!health.ok)fail('health not ok');
  if(!health.auth?.sessionLogin)fail('sessionLogin should be enabled');

  let r=await fetch(`${base}/api/state`);
  if(r.status!==401)fail(`expected 401 for /api/state, got ${r.status}`);

  r=await fetch(`${base}/api/auth/login`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({username:USER,password:'wrong'})});
  if(r.status!==401)fail(`expected 401 bad login, got ${r.status}`);

  r=await fetch(`${base}/api/auth/login`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({username:USER,password:PASS})});
  if(!r.ok)fail(`login failed ${r.status}`);
  const login=await r.json();
  if(!login.csrfToken)fail('missing csrfToken');
  const cookie=parseSetCookie(r);
  if(!cookie.includes('pw_session='))fail('missing pw_session cookie');

  r=await fetch(`${base}/api/state`,{headers:{cookie}});
  if(!r.ok)fail(`authed state ${r.status}`);

  r=await fetch(`${base}/api/state`,{method:'PUT',headers:{cookie,'content-type':'application/json'},body:JSON.stringify({leads:[],projects:[],proposals:[],discovery:{},settings:{}})});
  if(r.status!==403)fail(`expected CSRF 403, got ${r.status}`);

  r=await fetch(`${base}/api/state`,{method:'PUT',headers:{cookie,'content-type':'application/json','x-csrf-token':login.csrfToken},body:JSON.stringify({leads:[],projects:[],proposals:[],discovery:{},settings:{}})});
  if(!r.ok)fail(`CSRF put failed ${r.status}`);

  r=await fetch(`${base}/api/fit-checks`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({business:'Smoke Test Co',email:'smoke@example.com',pain:'Manual intake takes too long',name:'Smoke'})});
  if(r.status!==201)fail(`fit-check ${r.status}`);
  const fit=await r.json();
  if(!fit.leadId)fail('fit-check missing leadId');
  if(fit.preDiscovery||fit.atlasId||fit.companyId)fail('fit-check leaked non-ack fields');

  r=await fetch(`${base}/api/state`,{headers:{cookie}});
  const state=await r.json();
  if(!state.leads?.some(l=>l.id===fit.leadId))fail('fit-check lead not in state');

  // logout without CSRF should fail while session cookie is present
  r=await fetch(`${base}/api/auth/logout`,{method:'POST',headers:{cookie,'content-type':'application/json'},body:'{}'});
  if(r.status!==403)fail(`expected logout CSRF 403, got ${r.status}`);

  r=await fetch(`${base}/api/auth/logout`,{method:'POST',headers:{cookie,'content-type':'application/json','x-csrf-token':login.csrfToken},body:'{}'});
  if(!r.ok)fail(`logout failed ${r.status}`);

  r=await fetch(`${base}/api/state`,{headers:{cookie}});
  if(r.status!==401)fail(`expected 401 after logout, got ${r.status}`);

  // headers present
  r=await fetch(`${base}/api/health`);
  if(r.headers.get('x-content-type-options')!=='nosniff')fail('missing nosniff header');

  console.log('SMOKE PASS');
  cleanup(0);
}

main().catch(e=>fail(e.message||String(e)));
