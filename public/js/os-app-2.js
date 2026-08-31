$('#proposal-lead').addEventListener('change',fillProposalLead);let currentProposal='';$('#proposal-form').addEventListener('submit',e=>{e.preventDefault();const d=Object.fromEntries(new FormData(e.target).entries()),l=leadById(d.leadId);if(!l)return toast('Select a lead');currentProposal=`PATTERNWRIGHT
WORKFLOW SPRINT PROPOSAL

CLIENT
${l.business}

PROBLEM
${d.problem}

PROPOSED OUTCOME
Implement one bounded workflow improvement using the client's existing tools where practical.

SCOPE
${d.scope}

HUMAN CONTROL
${buildDiscovery(l).control}

SUCCESS METRIC
${d.metric}

TIMELINE
${d.timeline}

INVESTMENT
${money(d.price)}

CLIENT RESPONSIBILITIES
Provide timely access to required client-owned systems, validate business rules, and approve consequential customer-facing actions.

ASSUMPTIONS
This proposal is based on currently available discovery evidence. Final implementation details may change if validated workflow facts differ.`;$('#proposal-preview').textContent=currentProposal;l.stage='Proposed';state.proposals.push({id:'P-'+Date.now().toString(36).toUpperCase(),leadId:l.id,business:l.business,text:currentProposal,price:+d.price,createdAt:new Date().toISOString()});save();renderDashboard();toast('Proposal generated')});$('#copy-proposal').addEventListener('click',()=>{if(!currentProposal)return toast('Generate a proposal first');copyText(currentProposal).then(()=>toast('Proposal copied'))});$('#download-proposal').addEventListener('click',()=>{if(!currentProposal)return toast('Generate a proposal first');const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([currentProposal],{type:'text/plain'}));a.download='patternwright-proposal.txt';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)});$('#create-project').addEventListener('click',()=>{const l=leadById($('#proposal-lead').value);if(!l)return toast('Select a lead');if(state.projects.some(p=>p.leadId===l.id))return toast('Project already exists');const tasks=['Discover','Baseline','Access','Design','Build','Test','SOP','Train','Verify','Closeout'];state.projects.push({id:'PR-'+Date.now().toString(36).toUpperCase(),leadId:l.id,business:l.business,tasks:tasks.map(t=>({name:t,done:false})),progress:0});l.stage='Won';save();renderProjects();renderDashboard();toast('Project created')});
