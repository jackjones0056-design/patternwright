(function(){
  const host=document.querySelector('#atlas-index');
  if(!host||!Array.isArray(window.ATLAS||ATLAS)) return;
  const DATA=window.ATLAS||ATLAS;
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));

  if(!document.querySelector('#pw-atlas-polish')){
    const style=document.createElement('style');
    style.id='pw-atlas-polish';
    style.textContent=`
      .atlas-index{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin:0 0 26px}
      .atlas-card{display:block;position:relative;padding:16px;text-decoration:none;transition:border-color .16s ease,transform .16s ease,box-shadow .16s ease;overflow:hidden}
      .atlas-card:hover{border-color:#9ec8e2;box-shadow:0 8px 24px rgba(16,24,40,.06);transform:translateY(-1px)}
      .atlas-card:active{transform:scale(.995)}
      .atlas-card-top{display:flex;align-items:center;justify-content:space-between;gap:12px}
      .atlas-card-top .atlas-id{font-size:10px;letter-spacing:.08em;font-weight:850;color:#7c8a9c}
      .atlas-card-top strong{font-size:15px;color:#0b79bd;white-space:nowrap}
      .atlas-card h3{font-size:15px;line-height:1.25;margin:10px 0 5px;letter-spacing:-.02em}
      .atlas-card>p{font-size:11px;line-height:1.5;color:#667085;margin:0}
      .atlas-card-issue{margin-top:13px;padding:11px 12px;background:#fffaf0;border:1px solid #eee1c8;border-radius:8px}
      .atlas-card-issue span{display:block;font-size:9px;letter-spacing:.08em;text-transform:uppercase;color:#936713;font-weight:850;margin-bottom:4px}
      .atlas-card-issue b{display:block;font-size:12px;line-height:1.4;color:#4c4232}
      .atlas-open{display:inline-flex;align-items:center;gap:6px;margin-top:13px;color:#0b73b6;font-size:11px;font-weight:800}
      .atlas-profiles .atlas-profile{display:none}
      .atlas-profiles .atlas-profile:target{display:block}
      .atlas-profile-actions{display:flex;gap:8px;flex-wrap:wrap;padding:18px 22px 22px;background:#fbfcfe}
      .atlas-profile-head .atlas-id{display:inline-block;font-size:10px;letter-spacing:.08em;font-weight:850;color:#7c8a9c}
      .profile-summary strong{word-break:break-word}
      .profile-section .section-heading p{max-width:540px}
      .source-list li{overflow:hidden}
      .source-list a{overflow-wrap:anywhere}
      @media(max-width:860px){.atlas-index{grid-template-columns:1fr}}
      @media(max-width:520px){
        #section-atlas .section-head{margin-bottom:18px}
        #section-atlas .section-head h2{font-size:25px;line-height:1.05}
        #section-atlas .section-head p{font-size:13px;line-height:1.45;margin-top:8px}
        .atlas-toolbar{padding:12px;display:grid;grid-template-columns:1fr auto;gap:8px;align-items:center;border-radius:13px}
        .atlas-toolbar input{max-width:none;min-width:0;font-size:14px;padding:12px}
        .atlas-count{margin:0;font-size:10px;line-height:1.25;text-align:right;max-width:72px}
        .atlas-index{gap:10px;margin-bottom:20px}
        .atlas-card{padding:15px;border-radius:13px}
        .atlas-card h3{font-size:17px;margin-top:9px}
        .atlas-card>p{font-size:12px;line-height:1.45}
        .atlas-card-issue{padding:10px 11px;margin-top:12px}
        .atlas-card-issue b{font-size:12px}
        .atlas-open{width:100%;justify-content:space-between;padding-top:11px;border-top:1px solid #edf1f5;font-size:12px}
        .atlas-profile{border-radius:13px;margin-bottom:18px}
        .atlas-profile-head{padding:18px 16px;gap:14px}
        .atlas-profile-head h2{font-size:24px;line-height:1.08;margin:7px 0}
        .atlas-profile-head p{font-size:12px;line-height:1.5}
        .fit-score{padding:12px}
        .fit-score strong{font-size:26px}
        .profile-summary{grid-template-columns:1fr 1fr}
        .profile-summary div{padding:12px;border-right:0;border-bottom:1px solid #e5ebf2}
        .profile-summary div:nth-child(odd){border-right:1px solid #e5ebf2}
        .profile-summary strong{font-size:11px}
        .profile-section{padding:16px}
        .issue-grid,.op-grid{gap:9px}
        .issue-card,.op-card{padding:12px;border-radius:9px}
        .profile-columns{display:block}
        .profile-columns .profile-section{border-right:0}
        .atlas-profile-actions{padding:14px 16px 18px;display:grid;grid-template-columns:1fr}
        .atlas-profile-actions .btn{width:100%;text-align:center;padding:11px 12px}
        .topbar .actions{gap:6px;padding-bottom:2px}
        .topbar .actions .btn{padding:8px 10px;font-size:11px}
      }
    `;
    document.head.appendChild(style);
  }

  const cards=document.createElement('div');
  cards.className='atlas-index';
  cards.id='atlas-cards';
  cards.innerHTML=DATA.map(r=>`
    <a class="atlas-card card" data-atlas-card="${esc(r.id)}" href="#atlas-profile-${esc(r.id)}" aria-label="Open ${esc(r.name)} Atlas profile">
      <div class="atlas-card-top"><span class="atlas-id">${esc(r.id)}</span><strong>${esc(r.score)}/100</strong></div>
      <h3>${esc(r.name)}</h3>
      <p>${esc(r.category)} · ${esc(r.location)}</p>
      <div class="atlas-card-issue"><span>Likely issue to validate</span><b>${esc(r.issues?.[0]?.title||'Validate operational friction')}</b></div>
      <span class="atlas-open">Open profile <span aria-hidden="true">→</span></span>
    </a>`).join('');
  host.insertAdjacentElement('afterend',cards);

  const profiles=document.createElement('div');
  profiles.className='atlas-profiles';
  profiles.id='atlas-profiles';
  profiles.innerHTML=DATA.map(r=>{
    const sources=(r.sources||[]).map(s=>{
      const [name,detail,quality,url]=s;
      return `<li><strong>${esc(name)}</strong><span>${esc(quality||'')}</span><small>${esc(detail||'')}</small>${url?`<a href="${esc(url)}" target="_blank" rel="noopener">Open source ↗</a>`:''}</li>`;
    }).join('');
    return `<article class="atlas-profile card" id="atlas-profile-${esc(r.id)}">
      <div class="atlas-profile-head">
        <div>
          <a class="back-link" href="#section-atlas" data-atlas-back>← Back to companies</a>
          <span class="atlas-id">${esc(r.id)}</span>
          <h2>${esc(r.name)}</h2>
          <p>${esc(r.descriptor||'')}</p>
          <div class="tags">${(r.tags||[]).map(t=>`<span>${esc(t)}</span>`).join('')}</div>
        </div>
        <aside class="fit-score"><span>Automation fit</span><strong>${esc(r.score)}/100</strong><small>${esc(r.primaryOpportunity||'Opportunity requires discovery validation.')}</small></aside>
      </div>
      <div class="profile-summary">
        <div><span>Business type</span><strong>${esc(r.category||'—')}</strong></div>
        <div><span>Location</span><strong>${esc(r.location||'—')}</strong></div>
        <div><span>Primary opportunity</span><strong>${esc(r.primaryOpportunity||'—')}</strong></div>
        <div><span>Success metric</span><strong>${esc(r.metric||'—')}</strong></div>
      </div>
      <section class="profile-section issues">
        <div class="section-heading"><div><span>01</span><h3>Likely operational issues</h3></div><p>Hypotheses to validate with the owner — not confirmed deficiencies.</p></div>
        <div class="issue-grid">${(r.issues||[]).map(x=>`<article class="issue-card"><div><strong>${esc(x.title)}</strong><span>${esc(x.confidence||'')}</span></div><p>${esc(x.detail)}</p></article>`).join('')}</div>
      </section>
      <section class="profile-section">
        <div class="section-heading"><div><span>02</span><h3>AI / automation opportunities</h3></div><p>Potential responses if discovery confirms the issue.</p></div>
        <div class="op-grid">${(r.hypotheses||[]).map(x=>`<article class="op-card"><div><strong>${esc(x.title)}</strong><span>${esc(x.confidence)}%</span></div><p>${esc(x.detail)}</p><small>${esc(x.why||'')}</small></article>`).join('')}</div>
      </section>
      <div class="profile-columns">
        <section class="profile-section">
          <div class="section-heading"><div><span>03</span><h3>Public evidence</h3></div></div>
          <ul class="evidence-list">${(r.facts||[]).map(x=>`<li><span class="fact-label ${x.confidence==='conflict'?'conflict':''}">${esc(x.label||'PUBLIC')}</span><strong>${esc(x.title)}</strong><p>${esc(x.detail)}</p><small>${esc(x.source||'')}</small></li>`).join('')}</ul>
        </section>
        <section class="profile-section">
          <div class="section-heading"><div><span>04</span><h3>Discovery questions</h3></div></div>
          <ol class="question-list">${(r.discovery||[]).map(q=>`<li>${esc(q)}</li>`).join('')}</ol>
          <div class="control"><strong>Human-control boundary</strong><p>${esc(r.control||'Human approval for consequential decisions.')}</p></div>
          ${sources?`<div class="section-heading" style="margin-top:18px"><div><span>05</span><h3>Sources</h3></div></div><ul class="source-list">${sources}</ul>`:''}
        </section>
      </div>
      <div class="atlas-profile-actions"><button type="button" class="btn primary atlas-to-discovery" data-atlas-id="${esc(r.id)}">Create discovery lead</button><a class="btn" href="#section-atlas" data-atlas-back>Back to company list</a></div>
    </article>`;
  }).join('');
  cards.insertAdjacentElement('afterend',profiles);

  function showAtlasProfile(id,{replace=false}={}){
    const target=document.getElementById(`atlas-profile-${id}`);
    if(!target) return;
    if(typeof window.showSection==='function') window.showSection('atlas');
    cards.hidden=true;
    const hash=`#atlas-profile-${id}`;
    if(location.hash!==hash){
      (replace?history.replaceState:history.pushState).call(history,null,'',hash);
    }
    requestAnimationFrame(()=>target.scrollIntoView({block:'start',behavior:'smooth'}));
  }
  function showAtlasIndex({replace=false}={}){
    if(typeof window.showSection==='function') window.showSection('atlas');
    cards.hidden=false;
    const hash='#section-atlas';
    if(location.hash!==hash){
      (replace?history.replaceState:history.pushState).call(history,null,'',hash);
    }
    requestAnimationFrame(()=>host.scrollIntoView({block:'start',behavior:'smooth'}));
  }
  function syncAtlasRoute(){
    const match=location.hash.match(/^#atlas-profile-(ATLAS-\d+)$/);
    if(match){setTimeout(()=>showAtlasProfile(match[1],{replace:true}),0);return;}
    if(location.hash==='#section-atlas'||location.hash==='#atlas-index'){
      setTimeout(()=>{if(typeof window.showSection==='function')window.showSection('atlas');cards.hidden=false;},0);
    }
  }

  cards.addEventListener('click',e=>{
    const card=e.target.closest('[data-atlas-card]');
    if(!card) return;
    e.preventDefault();
    showAtlasProfile(card.dataset.atlasCard);
  });
  profiles.addEventListener('click',e=>{
    const back=e.target.closest('[data-atlas-back]');
    if(!back) return;
    e.preventDefault();
    showAtlasIndex();
  });
  window.addEventListener('hashchange',syncAtlasRoute);
  window.addEventListener('popstate',syncAtlasRoute);
  syncAtlasRoute();
})();