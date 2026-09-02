import http from 'node:http';
import {readFileSync, existsSync, mkdirSync} from 'node:fs';
import {join, extname, normalize, resolve, basename} from 'node:path';
import {fileURLToPath} from 'node:url';
import {DatabaseSync} from 'node:sqlite';
import {randomBytes, scryptSync, timingSafeEqual, createHash} from 'node:crypto';

const ROOT=fileURLToPath(new URL('.', import.meta.url));
const PUBLIC=join(ROOT,'public');
const DATA=join(ROOT,'data');
mkdirSync(DATA,{recursive:true});
const DB_PATH=process.env.PATTERNWRIGHT_DB || join(DATA,'patternwright.db');
const PORT=Number(process.env.PORT||8787);
const HOST=process.env.HOST||'127.0.0.1';
const ADMIN_KEY=process.env.PATTERNWRIGHT_ADMIN_KEY||'';
const ADMIN_USER=(process.env.PATTERNWRIGHT_ADMIN_USER||'admin').trim()||'admin';
const ADMIN_PASSWORD=process.env.PATTERNWRIGHT_ADMIN_PASSWORD||'';
const ADMIN_PASSWORD_HASH=process.env.PATTERNWRIGHT_ADMIN_PASSWORD_HASH||'';
const SESSION_SECRET=process.env.PATTERNWRIGHT_SESSION_SECRET||'';
const TRUST_PROXY=String(process.env.PATTERNWRIGHT_TRUST_PROXY||'').toLowerCase()==='true'||process.env.PATTERNWRIGHT_TRUST_PROXY==='1';
const FORCE_SECURE_COOKIES=String(process.env.PATTERNWRIGHT_SECURE_COOKIES||'').toLowerCase()==='true'||process.env.PATTERNWRIGHT_SECURE_COOKIES==='1';
const SESSION_TTL_MS=Number(process.env.PATTERNWRIGHT_SESSION_TTL_MS||12*60*60*1000);
const SCHEMA_VERSION=2;
const IS_PROD=String(process.env.NODE_ENV||'').toLowerCase()==='production';

const SCRYPT_N=16384, SCRYPT_R=8, SCRYPT_P=1, SCRYPT_KEYLEN=64;

function hashPassword(password,salt=randomBytes(16)){
  const hash=scryptSync(password,salt,SCRYPT_KEYLEN,{N:SCRYPT_N,r:SCRYPT_R,p:SCRYPT_P,maxmem:64*1024*1024});
  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt.toString('base64')}$${hash.toString('base64')}`;
}
function verifyPassword(password,encoded){
  if(!password||!encoded)return false;
  const parts=String(encoded).split('$');
  if(parts.length!==6||parts[0]!=='scrypt')return false;
  const N=Number(parts[1]), r=Number(parts[2]), p=Number(parts[3]);
  const salt=Buffer.from(parts[4],'base64');
  const expected=Buffer.from(parts[5],'base64');
  try{
    const actual=scryptSync(password,salt,expected.length,{N,r,p,maxmem:64*1024*1024});
    return actual.length===expected.length&&timingSafeEqual(actual,expected);
  }catch{return false}
}

let passwordVerifier=null;
if(ADMIN_PASSWORD_HASH){
  passwordVerifier=(pw)=>verifyPassword(pw,ADMIN_PASSWORD_HASH);
}else if(ADMIN_PASSWORD){
  const encoded=hashPassword(ADMIN_PASSWORD);
  passwordVerifier=(pw)=>verifyPassword(pw,encoded);
}
const AUTH_ENABLED=!!passwordVerifier;
const SESSION_ENABLED=AUTH_ENABLED||!!ADMIN_KEY;
if(AUTH_ENABLED&&!SESSION_SECRET){
  if(IS_PROD){
    console.error('FATAL: PATTERNWRIGHT_SESSION_SECRET is required when admin password auth is enabled in production.');
    process.exit(1);
  }
  console.warn('WARN: PATTERNWRIGHT_SESSION_SECRET not set; generating ephemeral secret (sessions reset on restart).');
}
const effectiveSessionSecret=SESSION_SECRET||randomBytes(32).toString('hex');

const db=new DatabaseSync(DB_PATH);
db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY,value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS companies(id TEXT PRIMARY KEY, display_name TEXT NOT NULL, category TEXT, location TEXT, website TEXT, atlas_id TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, metadata_json TEXT NOT NULL DEFAULT '{}');
CREATE UNIQUE INDEX IF NOT EXISTS idx_companies_name ON companies(lower(display_name));
CREATE TABLE IF NOT EXISTS leads(id TEXT PRIMARY KEY, company_id TEXT, contact_name TEXT, email TEXT, phone TEXT, business_type TEXT, pain TEXT, frequency TEXT, software TEXT, stage TEXT NOT NULL, score INTEGER, estimated_value REAL NOT NULL DEFAULT 950, source TEXT, atlas_id TEXT, discovery_status TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, payload_json TEXT NOT NULL DEFAULT '{}', FOREIGN KEY(company_id) REFERENCES companies(id));
CREATE TABLE IF NOT EXISTS discovery(lead_id TEXT PRIMARY KEY, notes TEXT, saved_at TEXT, validated_at TEXT, brief_json TEXT NOT NULL DEFAULT '{}', FOREIGN KEY(lead_id) REFERENCES leads(id) ON DELETE CASCADE);
CREATE TABLE IF NOT EXISTS proposals(id TEXT PRIMARY KEY, lead_id TEXT, business TEXT, text TEXT, price REAL, created_at TEXT NOT NULL, payload_json TEXT NOT NULL DEFAULT '{}');
CREATE TABLE IF NOT EXISTS projects(id TEXT PRIMARY KEY, lead_id TEXT, business TEXT, progress INTEGER NOT NULL DEFAULT 0, tasks_json TEXT NOT NULL DEFAULT '[]', created_at TEXT NOT NULL, updated_at TEXT NOT NULL, payload_json TEXT NOT NULL DEFAULT '{}');
CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY,value_json TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS atlas_profiles(id TEXT PRIMARY KEY,name TEXT NOT NULL,category TEXT,location TEXT,score INTEGER,primary_opportunity TEXT,profile_json TEXT NOT NULL,updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS enrichment_jobs(id TEXT PRIMARY KEY,company_id TEXT,status TEXT NOT NULL,request_json TEXT NOT NULL,result_json TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS audit_events(id INTEGER PRIMARY KEY AUTOINCREMENT,entity_type TEXT,entity_id TEXT,event TEXT NOT NULL,detail_json TEXT NOT NULL DEFAULT '{}',created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS sessions(id TEXT PRIMARY KEY, username TEXT NOT NULL, csrf_token TEXT NOT NULL, created_at TEXT NOT NULL, expires_at TEXT NOT NULL, last_seen_at TEXT NOT NULL);
`);
db.prepare('INSERT OR REPLACE INTO meta(key,value) VALUES(?,?)').run('schema_version',String(SCHEMA_VERSION));

function parseAtlasPart(file,marker){
  const source=readFileSync(join(PUBLIC,'js',file),'utf8');
  const start=source.indexOf(marker); if(start<0) throw new Error(`Atlas seed marker missing in ${file}`);
  const a=source.indexOf('[',start), b=source.lastIndexOf(']');
  if(a<0||b<a) throw new Error(`Atlas seed malformed in ${file}`);
  return JSON.parse(source.slice(a,b+1));
}
function loadAtlasSeed(){ return [
  ...parseAtlasPart('atlas-data-1.js','const ATLAS_PART_1='),
  ...parseAtlasPart('atlas-data-2.js','const ATLAS_PART_2='),
  ...parseAtlasPart('atlas-data-3.js','const ATLAS_PART_3=')
];}
const atlasSeed=loadAtlasSeed();
const atlasCount=db.prepare('SELECT count(*) n FROM atlas_profiles').get().n;
if(!atlasCount){const ins=db.prepare('INSERT INTO atlas_profiles(id,name,category,location,score,primary_opportunity,profile_json,updated_at) VALUES(?,?,?,?,?,?,?,?)');const nowIso=new Date().toISOString();db.exec('BEGIN');try{for(const p of atlasSeed)ins.run(p.id,p.name,p.category||'',p.location||'',p.score||null,p.primaryOpportunity||'',JSON.stringify(p),nowIso);db.exec('COMMIT')}catch(e){db.exec('ROLLBACK');throw e}}

function now(){return new Date().toISOString()}
function id(prefix){return `${prefix}-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2,7).toUpperCase()}`}
function json(v){try{return JSON.parse(v||'{}')}catch{return {}}}
function clientIp(req){
  if(TRUST_PROXY){
    const xff=String(req.headers['x-forwarded-for']||'').split(',')[0].trim();
    if(xff)return xff;
  }
  return req.socket?.remoteAddress||'unknown';
}
function isSecureRequest(req){
  if(FORCE_SECURE_COOKIES)return true;
  if(TRUST_PROXY&&String(req.headers['x-forwarded-proto']||'').split(',')[0].trim()==='https')return true;
  return false;
}
function securityHeaders(req,{html=false}={}){
  const headers={
    'x-content-type-options':'nosniff',
    'referrer-policy':'strict-origin-when-cross-origin',
    'x-frame-options':'DENY',
    'permissions-policy':'camera=(), microphone=(), geolocation=()',
    'cross-origin-opener-policy':'same-origin',
    'cross-origin-resource-policy':'same-origin',
  };
  if(isSecureRequest(req))headers['strict-transport-security']='max-age=31536000; includeSubDomains';
  if(html){
    headers['content-security-policy']="default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'";
  }
  return headers;
}
function reply(res,status,payload,headers={},req=null){
  const body=typeof payload==='string'?payload:JSON.stringify(payload);
  const base=req?securityHeaders(req):{'x-content-type-options':'nosniff','cache-control':'no-store'};
  res.writeHead(status,{
    ...base,
    'content-type':typeof payload==='string'?'text/plain; charset=utf-8':'application/json; charset=utf-8',
    'cache-control':'no-store',
    ...headers
  });
  res.end(body);
}
async function body(req){
  const chunks=[];let n=0;
  for await(const c of req){n+=c.length;if(n>1_000_000)throw Object.assign(new Error('Body too large'),{status:413});chunks.push(c)}
  if(!chunks.length)return {};
  try{return JSON.parse(Buffer.concat(chunks).toString('utf8'))}
  catch{throw Object.assign(new Error('Invalid JSON'),{status:400})}
}
function parseCookies(req){
  const out={};
  const raw=req.headers.cookie||'';
  for(const part of String(raw).split(';')){
    const i=part.indexOf('=');
    if(i<0)continue;
    const k=part.slice(0,i).trim();
    const v=part.slice(i+1).trim();
    if(k)out[k]=decodeURIComponent(v);
  }
  return out;
}
function cookieHeader(name,value,{maxAge,secure,httpOnly=true,sameSite='Lax',path='/'}={}){
  let s=`${name}=${encodeURIComponent(value)}; Path=${path}; SameSite=${sameSite}`;
  if(httpOnly)s+='; HttpOnly';
  if(secure)s+='; Secure';
  if(maxAge!=null)s+=`; Max-Age=${Math.max(0,Math.floor(maxAge))}`;
  return s;
}
function clearCookieHeader(name,{secure,path='/'}={}){
  return cookieHeader(name,'',{maxAge:0,secure,httpOnly:true,sameSite:'Lax',path});
}

const rateBuckets=new Map();
function rateLimit(key,limit,windowMs){
  const nowMs=Date.now();
  let b=rateBuckets.get(key);
  if(!b||nowMs>=b.resetAt){b={count:0,resetAt:nowMs+windowMs};rateBuckets.set(key,b)}
  b.count+=1;
  if(b.count>limit){
    const retry=Math.max(1,Math.ceil((b.resetAt-nowMs)/1000));
    return {ok:false,retryAfter:retry};
  }
  return {ok:true,remaining:Math.max(0,limit-b.count)};
}
setInterval(()=>{
  const t=Date.now();
  for(const [k,v] of rateBuckets){if(t>=v.resetAt)rateBuckets.delete(k)}
  db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(now());
},60_000).unref?.();

function createSession(username){
  const sid=randomBytes(32).toString('hex');
  const csrf=randomBytes(24).toString('hex');
  const created=now();
  const expires=new Date(Date.now()+SESSION_TTL_MS).toISOString();
  db.prepare('INSERT INTO sessions(id,username,csrf_token,created_at,expires_at,last_seen_at) VALUES(?,?,?,?,?,?)')
    .run(sid,username,csrf,created,expires,created);
  return {id:sid,username,csrf,expiresAt:expires};
}
function getSession(sid){
  if(!sid)return null;
  const row=db.prepare('SELECT * FROM sessions WHERE id=?').get(sid);
  if(!row)return null;
  if(Date.parse(row.expires_at)<=Date.now()){
    db.prepare('DELETE FROM sessions WHERE id=?').run(sid);
    return null;
  }
  db.prepare('UPDATE sessions SET last_seen_at=? WHERE id=?').run(now(),sid);
  return row;
}
function destroySession(sid){if(sid)db.prepare('DELETE FROM sessions WHERE id=?').run(sid)}
function hashSecretFingerprint(){
  return createHash('sha256').update(effectiveSessionSecret).digest('hex').slice(0,12);
}

function audit(type,eid,event,detail={}){
  const safe={...detail};
  for(const k of Object.keys(safe)){
    if(/password|secret|token|adminkey|session/i.test(k))safe[k]='[redacted]';
  }
  db.prepare('INSERT INTO audit_events(entity_type,entity_id,event,detail_json,created_at) VALUES(?,?,?,?,?)')
    .run(type,eid,event,JSON.stringify(safe),now());
}

function companyFor(name,category='',location='',atlasId=null){
  const existing=db.prepare('SELECT * FROM companies WHERE lower(display_name)=lower(?)').get(name);
  const ts=now();
  if(existing){
    db.prepare(`UPDATE companies SET category=coalesce(nullif(?, ''),category), location=coalesce(nullif(?, ''),location), atlas_id=coalesce(?,atlas_id), updated_at=? WHERE id=?`)
      .run(category,location,atlasId,ts,existing.id);
    return existing.id;
  }
  const cid=id('C');
  db.prepare('INSERT INTO companies(id,display_name,category,location,atlas_id,created_at,updated_at,metadata_json) VALUES(?,?,?,?,?,?,?,?)')
    .run(cid,name,category,location,atlasId,ts,ts,'{}');
  return cid;
}
function atlasById(aid){const row=db.prepare('SELECT profile_json FROM atlas_profiles WHERE id=?').get(aid);return row?json(row.profile_json):null}
function atlasByName(name){const row=db.prepare('SELECT profile_json FROM atlas_profiles WHERE lower(name)=lower(?)').get(name);return row?json(row.profile_json):null}
function inferPattern(t){
  t=(t||'').toLowerCase();
  if(/lead|estimate|quote|roof|hvac|plumb|electric/.test(t))return 'Lead / estimate response loop';
  if(/maintenance|request|property|repair/.test(t))return 'Request intake router';
  if(/cater|event|booking|mobile/.test(t))return 'Structured event intake + coordination';
  if(/email|inbox/.test(t))return 'Inbox triage';
  if(/meeting|notes/.test(t))return 'Meeting-to-action';
  return 'Structured intake + follow-up';
}
function reasoning(input){
  const lead=input.lead||input;
  const atlas=input.atlasId?atlasById(input.atlasId):lead.atlasId?atlasById(lead.atlasId):atlasByName(lead.business||'');
  if(atlas){
    return {
      provider:'rules-v1',
      evidence:(atlas.facts||[]).map(x=>({type:'public_fact',title:x.title,detail:x.detail,source:x.source||''})),
      issues:atlas.issues||[],
      pattern:atlas.primaryOpportunity||inferPattern(`${lead.business_type||''} ${lead.pain||''}`),
      metric:atlas.metric||'Handling time + completion rate',
      control:atlas.control||'Human approval for pricing, commitments, and exceptions',
      questions:atlas.discovery||[],
      hypotheses:atlas.hypotheses||[]
    };
  }
  const pattern=inferPattern(`${lead.business_type||''} ${lead.pain||''}`);
  return {
    provider:'rules-v1',
    evidence:[],
    issues:[{title:lead.pain||'Workflow friction needs validation',detail:'Submitted by the prospect; validate the current-state process before proposing automation.',confidence:'medium'}],
    pattern,
    metric:'Handling time + completion rate',
    control:'Human approval for pricing, commitments, exceptions, and consequential customer-facing actions',
    questions:['Walk me through the process from trigger to completion.','Where is information copied or re-entered?','What gets delayed, forgotten, or escalated to the owner?','Which decisions must remain human?','What metric would prove the workflow improved?'],
    hypotheses:[]
  };
}
function serializeState(){
  const leads=db.prepare('SELECT * FROM leads ORDER BY created_at DESC').all().map(r=>({
    ...json(r.payload_json),
    id:r.id,createdAt:r.created_at,stage:r.stage,score:r.score,estimatedValue:r.estimated_value,
    name:r.contact_name||'',email:r.email||'',phone:r.phone||'',business_type:r.business_type||'',
    pain:r.pain||'',frequency:r.frequency||'',software:r.software||'',source:r.source||'',
    atlasId:r.atlas_id||undefined,discoveryStatus:r.discovery_status||undefined,
    business:json(r.payload_json).business||db.prepare('SELECT display_name FROM companies WHERE id=?').get(r.company_id)?.display_name||''
  }));
  const discovery={};
  for(const r of db.prepare('SELECT * FROM discovery').all())
    discovery[r.lead_id]={...json(r.brief_json),notes:r.notes||'',savedAt:r.saved_at||undefined,validatedAt:r.validated_at||undefined};
  const proposals=db.prepare('SELECT * FROM proposals ORDER BY created_at').all().map(r=>({
    ...json(r.payload_json),id:r.id,leadId:r.lead_id,business:r.business,text:r.text,price:r.price,createdAt:r.created_at
  }));
  const projects=db.prepare('SELECT * FROM projects ORDER BY created_at').all().map(r=>({
    ...json(r.payload_json),id:r.id,leadId:r.lead_id,business:r.business,progress:r.progress,tasks:json(r.tasks_json),createdAt:r.created_at
  }));
  const settings={};
  for(const r of db.prepare('SELECT * FROM settings').all())settings[r.key]=json(r.value_json).value;
  delete settings.adminKey;
  delete settings.adminPassword;
  delete settings.sessionSecret;
  return {version:2.1,leads,projects,proposals,discovery,settings};
}
function replaceState(s){
  const ts=now();
  db.exec('BEGIN');
  try{
    db.exec('DELETE FROM discovery; DELETE FROM proposals; DELETE FROM projects; DELETE FROM leads; DELETE FROM settings;');
    for(const l of s.leads||[]){
      const atlas=l.atlasId?atlasById(l.atlasId):null;
      const cid=companyFor(l.business||'Unnamed business',l.business_type||atlas?.category||'',atlas?.location||'',l.atlasId||null);
      db.prepare('INSERT INTO leads(id,company_id,contact_name,email,phone,business_type,pain,frequency,software,stage,score,estimated_value,source,atlas_id,discovery_status,created_at,updated_at,payload_json) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
        .run(l.id||id('L'),cid,l.name||'',l.email||'',l.phone||'',l.business_type||'',l.pain||'',l.frequency||'',l.software||'',l.stage||'New',l.score??null,Number(l.estimatedValue||950),l.source||'',l.atlasId||null,l.discoveryStatus||null,l.createdAt||ts,ts,JSON.stringify(l));
    }
    for(const [leadId,d] of Object.entries(s.discovery||{}))
      db.prepare('INSERT INTO discovery(lead_id,notes,saved_at,validated_at,brief_json) VALUES(?,?,?,?,?)')
        .run(leadId,d.notes||'',d.savedAt||null,d.validatedAt||null,JSON.stringify(d));
    for(const p of s.proposals||[])
      db.prepare('INSERT INTO proposals(id,lead_id,business,text,price,created_at,payload_json) VALUES(?,?,?,?,?,?,?)')
        .run(p.id||id('P'),p.leadId||null,p.business||'',p.text||'',Number(p.price||0),p.createdAt||ts,JSON.stringify(p));
    for(const p of s.projects||[])
      db.prepare('INSERT INTO projects(id,lead_id,business,progress,tasks_json,created_at,updated_at,payload_json) VALUES(?,?,?,?,?,?,?,?)')
        .run(p.id||id('PR'),p.leadId||null,p.business||'',Number(p.progress||0),JSON.stringify(p.tasks||[]),p.createdAt||ts,ts,JSON.stringify(p));
    for(const [k,v] of Object.entries(s.settings||{})){
      if(/adminKey|adminPassword|sessionSecret|password/i.test(k))continue;
      db.prepare('INSERT INTO settings(key,value_json) VALUES(?,?)').run(k,JSON.stringify({value:v}));
    }
    db.exec('COMMIT');
    audit('workspace','global','state_sync',{leads:(s.leads||[]).length});
  }catch(e){db.exec('ROLLBACK');throw e}
}

function originAllowed(req){
  const origin=req.headers.origin;
  if(!origin)return true;
  try{
    const o=new URL(origin);
    const host=req.headers.host||`${HOST}:${PORT}`;
    return o.host===host;
  }catch{return false}
}
function requireCsrf(req,session){
  if(!session)return true;
  const token=req.headers['x-csrf-token'];
  if(!token||typeof token!=='string')return false;
  try{
    const a=Buffer.from(token);
    const b=Buffer.from(session.csrf_token);
    return a.length===b.length&&timingSafeEqual(a,b);
  }catch{return false}
}

function authContext(req){
  const key=req.headers['x-patternwright-key'];
  if(ADMIN_KEY&&key&&timingSafeEqualKey(key,ADMIN_KEY)){
    return {ok:true,via:'admin-key',user:'api-key'};
  }
  const cookies=parseCookies(req);
  const session=getSession(cookies.pw_session);
  if(session)return {ok:true,via:'session',user:session.username,session};
  return {ok:false};
}
function timingSafeEqualKey(a,b){
  const ba=Buffer.from(String(a));
  const bb=Buffer.from(String(b));
  if(ba.length!==bb.length){
    const dummy=Buffer.alloc(bb.length);
    timingSafeEqual(dummy,bb);
    return false;
  }
  return timingSafeEqual(ba,bb);
}
function requireAuth(req,res,{mutating=false}={}){
  if(!SESSION_ENABLED)return {ok:true,via:'open',user:'local'};
  const ctx=authContext(req);
  if(!ctx.ok){
    reply(res,401,{error:'Authentication required'},{},req);
    return null;
  }
  if(mutating&&ctx.via==='session'){
    if(!originAllowed(req)){
      reply(res,403,{error:'Invalid origin'},{},req);
      return null;
    }
    if(!requireCsrf(req,ctx.session)){
      reply(res,403,{error:'CSRF token required'},{},req);
      return null;
    }
  }
  return ctx;
}

function staticFile(req,res,pathname){
  if(pathname==='/os'){
    const html=readFileSync(join(PUBLIC,'os.html'),'utf8');
    res.writeHead(200,{
      'content-type':'text/html; charset=utf-8',
      'cache-control':'no-store',
      ...securityHeaders(req,{html:true})
    });
    res.end(html);return true;
  }
  let target=pathname==='/'?join(PUBLIC,'index.html'):join(PUBLIC,normalize(pathname).replace(/^([/\\])+/,''));
  target=resolve(target);
  if(!target.startsWith(resolve(PUBLIC))||!existsSync(target))return false;
  const types={'.html':'text/html; charset=utf-8','.png':'image/png','.svg':'image/svg+xml','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8'};
  const isHtml=extname(target)==='.html';
  res.writeHead(200,{
    'content-type':types[extname(target)]||'application/octet-stream',
    'cache-control':isHtml?'no-store':'public, max-age=3600',
    ...securityHeaders(req,{html:isHtml})
  });
  res.end(readFileSync(target));return true;
}

const PUBLIC_API=new Set(['/api/health','/api/fit-checks','/api/auth/login','/api/auth/logout','/api/auth/me','/api/auth/csrf']);

const server=http.createServer(async(req,res)=>{
  try{
    const u=new URL(req.url,`http://${req.headers.host||'localhost'}`);
    const p=u.pathname;
    const method=req.method||'GET';
    const ip=clientIp(req);

    if(p.startsWith('/api/')){
      const rl=rateLimit(`api:${ip}`,240,60_000);
      if(!rl.ok)return reply(res,429,{error:'Too many requests'},{'retry-after':String(rl.retryAfter)},req);
    }

    if(method==='GET'&&p==='/api/health'){
      return reply(res,200,{
        ok:true,
        product:'Patternwright Production Core',
        schemaVersion:SCHEMA_VERSION,
        db:IS_PROD?basename(DB_PATH):DB_PATH,
        atlasProfiles:db.prepare('SELECT count(*) n FROM atlas_profiles').get().n,
        auth:{enabled:SESSION_ENABLED,sessionLogin:AUTH_ENABLED,adminKey:!!ADMIN_KEY},
        time:now()
      },{},req);
    }

    if(method==='POST'&&p==='/api/auth/login'){
      if(!AUTH_ENABLED)return reply(res,503,{error:'Session login is not configured. Set PATTERNWRIGHT_ADMIN_PASSWORD (or HASH).'},{},req);
      const rl=rateLimit(`login:${ip}`,10,15*60_000);
      if(!rl.ok)return reply(res,429,{error:'Too many login attempts'},{'retry-after':String(rl.retryAfter)},req);
      const d=await body(req);
      const username=String(d.username||'').trim();
      const password=String(d.password||'');
      const userOk=username===ADMIN_USER;
      const passOk=passwordVerifier(password);
      if(!userOk||!passOk){
        audit('auth',username||'unknown','login_failed',{ip});
        return reply(res,401,{error:'Invalid username or password'},{},req);
      }
      const session=createSession(username);
      audit('auth',username,'login_ok',{ip});
      const secure=isSecureRequest(req);
      return reply(res,200,{
        ok:true,
        user:username,
        csrfToken:session.csrf,
        expiresAt:session.expiresAt
      },{
        'set-cookie':cookieHeader('pw_session',session.id,{
          maxAge:Math.floor(SESSION_TTL_MS/1000),
          secure,
          httpOnly:true,
          sameSite:'Lax'
        })
      },req);
    }

    if(method==='POST'&&p==='/api/auth/logout'){
      const cookies=parseCookies(req);
      destroySession(cookies.pw_session);
      const secure=isSecureRequest(req);
      return reply(res,200,{ok:true},{
        'set-cookie':clearCookieHeader('pw_session',{secure})
      },req);
    }

    if(method==='GET'&&p==='/api/auth/me'){
      if(!SESSION_ENABLED)return reply(res,200,{authenticated:true,via:'open',user:'local',authEnabled:false},{},req);
      const ctx=authContext(req);
      if(!ctx.ok)return reply(res,200,{authenticated:false,authEnabled:true,sessionLogin:AUTH_ENABLED},{},req);
      return reply(res,200,{
        authenticated:true,
        via:ctx.via,
        user:ctx.user,
        authEnabled:true,
        sessionLogin:AUTH_ENABLED,
        csrfToken:ctx.session?.csrf_token||null
      },{},req);
    }

    if(method==='GET'&&p==='/api/auth/csrf'){
      const ctx=authContext(req);
      if(!ctx.ok||!ctx.session)return reply(res,401,{error:'Authentication required'},{},req);
      return reply(res,200,{csrfToken:ctx.session.csrf_token},{},req);
    }

    if(method==='POST'&&p==='/api/fit-checks'){
      const rl=rateLimit(`fit:${ip}`,10,60*60_000);
      if(!rl.ok)return reply(res,429,{error:'Fit Check rate limit exceeded. Try again later.'},{'retry-after':String(rl.retryAfter)},req);
      const d=await body(req);
      if(!String(d.business||'').trim()||!String(d.email||'').trim()||!String(d.pain||'').trim())
        return reply(res,400,{error:'business, email, and pain are required'},{},req);
      const email=String(d.email).trim();
      if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return reply(res,400,{error:'Valid email is required'},{},req);
      const atlas=atlasByName(String(d.business).trim());
      const cid=companyFor(String(d.business).trim(),d.business_type||atlas?.category||'',atlas?.location||'',atlas?.id||null);
      const lid=id('L'),ts=now();
      const payload={...d,business:String(d.business).trim(),email};
      db.prepare('INSERT INTO leads(id,company_id,contact_name,email,phone,business_type,pain,frequency,software,stage,score,estimated_value,source,atlas_id,discovery_status,created_at,updated_at,payload_json) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
        .run(lid,cid,d.name||'',email,d.phone||'',d.business_type||'',d.pain||'',d.frequency||'',d.software||'','New',null,950,d.source||'Website Fit Check',atlas?.id||null,'Not validated',d.submittedAt||ts,ts,JSON.stringify(payload));
      const r=reasoning({lead:{...payload,business_type:d.business_type||'',pain:d.pain||'',atlasId:atlas?.id},atlasId:atlas?.id});
      db.prepare('INSERT OR REPLACE INTO discovery(lead_id,notes,saved_at,validated_at,brief_json) VALUES(?,?,?,?,?)')
        .run(lid,'',ts,null,JSON.stringify({preDiscovery:r,source:'Fit Check'}));
      audit('lead',lid,'fit_check_received',{business:d.business});
      return reply(res,201,{ok:true,leadId:lid,companyId:cid,atlasId:atlas?.id||null,preDiscovery:r},{},req);
    }

    if(p.startsWith('/api/')&&!PUBLIC_API.has(p)){
      const mutating=!['GET','HEAD','OPTIONS'].includes(method);
      const auth=requireAuth(req,res,{mutating});
      if(!auth)return;
    }

    if(method==='GET'&&p==='/api/state')return reply(res,200,serializeState(),{},req);
    if(method==='PUT'&&p==='/api/state'){
      const d=await body(req);
      replaceState(d);
      return reply(res,200,{ok:true,syncedAt:now()},{},req);
    }
    if(method==='GET'&&p==='/api/atlas'){
      const q=(u.searchParams.get('search')||'').toLowerCase();
      const rows=db.prepare('SELECT profile_json FROM atlas_profiles ORDER BY score DESC,name').all()
        .map(r=>json(r.profile_json))
        .filter(x=>!q||`${x.name} ${x.category} ${x.location} ${(x.issues||[]).map(i=>i.title).join(' ')}`.toLowerCase().includes(q));
      return reply(res,200,{count:rows.length,profiles:rows},{},req);
    }
    const am=p.match(/^\/api\/atlas\/([^/]+)$/);
    if(method==='GET'&&am){
      const a=atlasById(decodeURIComponent(am[1]));
      return a?reply(res,200,a,{},req):reply(res,404,{error:'Atlas profile not found'},{},req);
    }
    if(method==='POST'&&p==='/api/atlas'){
      const a=await body(req);
      if(!a.id||!a.name)return reply(res,400,{error:'id and name required'},{},req);
      db.prepare('INSERT OR REPLACE INTO atlas_profiles(id,name,category,location,score,primary_opportunity,profile_json,updated_at) VALUES(?,?,?,?,?,?,?,?)')
        .run(a.id,a.name,a.category||'',a.location||'',a.score||null,a.primaryOpportunity||'',JSON.stringify(a),now());
      audit('atlas',a.id,'profile_upserted',{name:a.name});
      return reply(res,200,{ok:true,id:a.id},{},req);
    }
    if(method==='POST'&&p==='/api/reason'){
      const d=await body(req);
      return reply(res,200,reasoning(d),{},req);
    }
    if(method==='POST'&&p==='/api/enrichment/queue'){
      const d=await body(req),jid=id('E'),ts=now();
      db.prepare('INSERT INTO enrichment_jobs(id,company_id,status,request_json,result_json,created_at,updated_at) VALUES(?,?,?,?,?,?,?)')
        .run(jid,d.companyId||null,'queued',JSON.stringify(d),null,ts,ts);
      audit('enrichment',jid,'queued',{companyId:d.companyId||null});
      return reply(res,201,{ok:true,jobId:jid,status:'queued'},{},req);
    }
    if(method==='GET'&&p==='/api/enrichment/jobs'){
      const rows=db.prepare('SELECT * FROM enrichment_jobs ORDER BY created_at DESC').all()
        .map(r=>({id:r.id,company_id:r.company_id,status:r.status,created_at:r.created_at,updated_at:r.updated_at,request:json(r.request_json),result:r.result_json?json(r.result_json):null}));
      return reply(res,200,{jobs:rows},{},req);
    }
    if(method==='GET'&&p==='/api/audit'){
      const rows=db.prepare('SELECT * FROM audit_events ORDER BY id DESC LIMIT 200').all()
        .map(r=>({id:r.id,entity_type:r.entity_type,entity_id:r.entity_id,event:r.event,created_at:r.created_at,detail:json(r.detail_json)}));
      return reply(res,200,{events:rows},{},req);
    }

    if(staticFile(req,res,p))return;
    reply(res,404,{error:'Not found'},{},req);
  }catch(e){
    const status=e.status||500;
    if(status>=500)console.error('[patternwright]',e?.message||e);
    const msg=status>=500?'Server error':(e.message||'Request failed');
    reply(res,status,{error:msg},{},req);
  }
});

server.listen(PORT,HOST,()=>{
  console.log(`Patternwright Production Core running at http://${HOST}:${PORT}`);
  console.log(`Website: http://${HOST}:${PORT}/`);
  console.log(`OS: http://${HOST}:${PORT}/os`);
  console.log(`Database: ${DB_PATH}`);
  console.log(`Auth: ${AUTH_ENABLED?'session-login enabled':(ADMIN_KEY?'admin-key only':'open (local)')} · secret-fp=${hashSecretFingerprint()}`);
});
