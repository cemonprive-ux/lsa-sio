(function(){
"use strict";
const app=document.getElementById("app");
const esc=s=>String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const pad=n=>String(n).padStart(2,"0");
const mmss=sec=>pad(Math.floor(sec/60))+":"+pad(sec%60);
const f20=v=>Number.isInteger(v)?String(v):String(v).replace(".",",");
const $=s=>document.querySelector(s);
const TZ="Europe/Paris";
const fmtDate=ms=>new Date(ms).toLocaleDateString("fr-FR",{weekday:"long",day:"numeric",month:"long",year:"numeric",timeZone:TZ});
const fmtTime=ms=>new Date(ms).toLocaleTimeString("fr-FR",{hour:"2-digit",minute:"2-digit",timeZone:TZ}).replace(":"," h ");
const gname=g=>"Groupe "+(g+1);

let S={step:"loading",cfg:null,skew:0,name:"",code:"",err:"",cur:0,ans:[],order:[],qs:{},leaves:[],hiddenAt:null,
  deadline:0,token:"",result:null,onlyWrong:false,busy:false,auto:false,gm:""};
const nowS=()=>Date.now()+S.skew;

async function api(path,body){
  const r=await fetch(path,{method:body?"POST":"GET",headers:body?{"content-type":"application/json"}:{},body:body?JSON.stringify(body):undefined,cache:"no-store"});
  let j={};try{j=await r.json();}catch(e){}
  if(!r.ok){const e=new Error(j.error||"Erreur réseau");e.status=r.status;throw e;}
  return j;
}
const wstate=g=>{const t=nowS(),w=S.cfg.windows[g];return t<w.open?"before":t<w.close?"open":"closed";};
const isAns=id=>((S.ans[id]||"")+"").trim()!=="";
const NQ=()=>S.cfg.nq;
const groupOf=n=>{const r=S.cfg.roster.find(x=>x.name===n);return r?r.group:null;};

/* ---------- vues ---------- */
function ruler(){
  return `<div class="ruler" aria-hidden="true">${S.order.map((id,k)=>`<i data-r="${k}" class="${isAns(id)?"done":""}${S.step==="test"&&k===S.cur?" cur":""}"></i>`).join("")}</div>`;
}
const nbLabel=k=>"Question "+(k+1)+(isAns(S.order[k])?", répondue":", sans réponse");
function slotText(){
  const w=S.cfg.windows;
  if(S.cfg.same) return {d:fmtDate(w[0].open),h:fmtTime(w[0].open)+" (jusqu’à "+fmtTime(w[0].close)+")"};
  return {d:[0,1].map(g=>gname(g)+" : "+fmtDate(w[g].open)).join(" · "),h:[0,1].map(g=>gname(g)+" : "+fmtTime(w[g].open)).join(" · ")};
}
function entryView(){
  const g=S.name?groupOf(S.name):null,w=g===null?null:wstate(g),pre=g===null?"":gname(g)+" · ";
  const wd=g===null?null:S.cfg.windows[g];
  const status=g===null?`<div class="status before"><span class="dot"></span>Choisissez votre nom : l’état du test dépend de votre groupe.</div>`
    :w==="open"?`<div class="status open"><span class="dot"></span>${pre}Test ouvert · ${S.cfg.duration/60} minutes à partir du démarrage, au plus tard jusqu’à ${fmtTime(wd.close)}</div>`
    :w==="before"?`<div class="status before"><span class="dot"></span>${pre}Le test n’est pas encore ouvert · ouverture le ${fmtDate(wd.open)} à ${fmtTime(wd.open)}</div>`
    :`<div class="status closed"><span class="dot"></span>${pre}Test fermé · les envois ne sont plus acceptés</div>`;
  const off=(w!==null&&w!=="open")?" disabled":"";
  const opts=S.cfg.roster.map(r=>`<option value="${esc(r.name)}"${r.done?" disabled":""}${S.name===r.name?" selected":""}>${esc(r.name)}${r.done?" — a déjà rendu":""}</option>`).join("");
  const sl=slotText();
  return `<main class="wrap"><section class="sheet"><div class="ticks"></div><div class="sheet-body">
    <p class="eyebrow">Évaluation en classe · BTS SIO · Anglais</p>
    <h1>${esc(S.cfg.title)}</h1>
    <dl class="facts">
      <div><dt>Date</dt><dd>${esc(sl.d)}</dd></div>
      <div><dt>Horaire</dt><dd>${esc(sl.h)}</dd></div>
      <div><dt>Durée</dt><dd class="mono">${S.cfg.duration/60} minutes</dd></div>
      <div><dt>Contenu</dt><dd>${NQ()} traductions (réponses courtes)</dd></div>
      <div><dt>Barème</dt><dd>${NQ()} points, 1 par question</dd></div>
      <div><dt>Corrigé</dt><dd>${S.cfg.same?"Affiché dès l’envoi":"Affiché après le test du dernier groupe"}</dd></div>
    </dl>
    ${status}
    <div class="field"><label for="nm">Votre nom</label>
      <select class="ctl" id="nm"><option value="">Choisir dans la liste…</option>${opts}</select></div>
    <div class="field"><label for="code">Code d’accès</label>
      <input class="ctl mono" id="code" type="text" maxlength="12" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="Affiché au tableau" value="${esc(S.code)}"${off}></div>
    ${S.err?`<p class="err" role="alert">${esc(S.err)}</p>`:""}
    <button class="btn full" data-act="start"${off}${S.busy?" disabled":""}>Commencer le test</button>
  </div></section></main>`;
}
function testView(){
  const i=S.cur,id=S.order[i],q=S.qs[id],left=Math.max(0,Math.round((S.deadline-nowS())/1000));
  const n=S.order.filter(isAns).length,NQn=NQ();
  const leavesN=S.leaves.length;
  return `<main class="wrap"><section class="sheet noselect notranslate" translate="no"><div class="ticks"></div>
    <h1 class="sr">${esc(S.cfg.title)}</h1><p class="sr" id="tl" role="status" aria-live="polite"></p>
    <div class="thead">
      <div><div class="eyebrow">Candidat</div><div class="who">${esc(S.name)}</div></div>
      <div class="tright"><div class="eyebrow">Temps restant</div><div class="timer mono${left<300?" low":""}" id="timer" role="timer">${mmss(left)}</div></div>
    </div>
    ${leavesN?`<div class="status closed u-mpad"><span class="dot"></span>Sortie de la page détectée (${leavesN}). L’enseignant en est informé.</div>`:""}
    ${ruler()}
    <div class="qcard">
      <div class="qmeta"><span>Question ${i+1} / ${NQn}</span><span class="chip"><span aria-hidden="true">Traduction FR → EN</span><span class="sr">Traduction du français vers l’anglais</span></span></div>
      <h2 class="qtext">${esc(q.q)}</h2>
      <label class="sr" for="ans">Votre réponse</label><input class="answer" id="ans" name="reponse" type="text" lang="en" autocomplete="off" autocapitalize="none" autocorrect="off" spellcheck="false" writingsuggestions="false" aria-autocomplete="none" enterkeyhint="next" translate="no" data-gramm="false" data-gramm_editor="false" data-enable-grammarly="false" data-lpignore="true" data-1p-ignore="true" data-form-type="other" placeholder="Type your answer" value="${esc(S.ans[id]||"")}"><p class="hint">${esc(q.h)}</p><p class="guardmsg" id="gm" role="status">${esc(S.gm)}</p>
    </div>
    <div class="qnav">
      <button class="btn ghost" data-act="prev"${i===0?" disabled":""}><span aria-hidden="true">←</span> Précédente</button>
      <button class="btn" data-act="next">${i===NQn-1?"Vérifier et envoyer":`Suivante <span aria-hidden="true">→</span>`}</button>
    </div>
    <div class="navwrap">
      <div class="navgrid">${S.order.map((oid,k)=>`<button class="nb${isAns(oid)?" done":""}${k===i?" cur":""}" data-act="goto" data-i="${k}" data-nb="${k}" aria-label="${nbLabel(k)}"${k===i?` aria-current="step"`:""}>${k+1}</button>`).join("")}</div>
      <p class="legend"><span id="count">${n} / ${NQn} répondues</span> · les questions répondues sont cochées</p>
    </div>
  </section></main>`;
}
function reviewView(){
  const miss=S.order.map((id,k)=>k).filter(k=>!isAns(S.order[k]));
  const NQn=NQ(),n=NQn-miss.length,left=Math.max(0,Math.round((S.deadline-nowS())/1000));
  return `<main class="wrap"><section class="sheet noselect notranslate" translate="no"><div class="ticks"></div><h1 class="sr">${esc(S.cfg.title)}</h1>${ruler().replace('class="ruler"','class="ruler u-mt18"')}<div class="sheet-body">
    <p class="eyebrow">Avant l’envoi · temps restant <span class="mono" id="timer">${mmss(left)}</span></p>
    <h2 class="big u-mt8">${n} réponses sur ${NQn}</h2>
    ${miss.length?`<p>Questions sans réponse :</p><div class="miss">${miss.map(k=>`<button class="btn ghost sm mono" data-act="goto" data-i="${k}">${k+1}</button>`).join("")}</div>`:`<p class="muted u-mb8">Toutes les questions ont une réponse.</p>`}
    <p class="muted">L’envoi est définitif. Il est aussi déclenché automatiquement à la fin du temps imparti ou à la fermeture du créneau.</p>
    ${S.err?`<p class="err u-mt12" role="alert">${esc(S.err)}</p>`:""}
    <div class="actions"><button class="btn ghost" data-act="back"><span aria-hidden="true">←</span> Revenir au test</button><button class="btn" data-act="send"${S.locked?" disabled":""}>Envoyer définitivement</button></div>
  </div></section></main>`;
}
function doneView(){
  const r=S.result,NQn=NQ();
  const wrong=r.corrige?r.corrige.filter(x=>!x.ok).length:0;
  const items=r.corrige?r.corrige.filter(x=>!S.onlyWrong||!x.ok).map(x=>
    `<li class="di${x.ok?"":" bad"}"><span class="qn">Q${x.n}</span>
      <div><div class="pr">${esc(x.q)}</div><div class="vals"><span>Votre réponse<code>${x.given?esc(x.given):"(sans réponse)"}</code></span>${x.ok?"":`<span>Bonne réponse<code>${esc(x.expected)}</code></span>`}</div></div>
      <div class="act"><span class="chip ${x.ok?"good":"badc"}">${x.ok?"Juste":"Faux"}</span></div></li>`).join(""):"";
  const auto=S.auto==="time"?"Le temps est écoulé : vos réponses ont été envoyées automatiquement."
    :S.auto==="window"?"Le créneau s’est terminé : vos réponses ont été envoyées automatiquement.":"";
  return `<main class="wrap"><section class="sheet"><div class="ticks"></div><h1 class="sr">${esc(S.cfg.title)}</h1><div class="sheet-body">
    <p class="eyebrow">Test terminé</p>
    <h2 class="big u-mt8">Réponses enregistrées</h2>
    <p>${esc(S.name)}, vos réponses ont été envoyées (durée <span class="mono">${mmss(r.dur)}</span>).</p>
    ${auto?`<div class="status closed u-m16"><span class="dot"></span>${auto}</div>`:""}
    <div class="stats u-mt22">
      <div class="stat"><div class="v">${r.total}<small> / ${NQn}</small></div><div class="l">Bonnes réponses</div></div>
      <div class="stat"><div class="v">${f20(r.s20)}<small> / 20</small></div><div class="l">Équivalent sur 20 (demi-point le plus proche)</div></div>
    </div>
    ${r.corrige?`<div class="sec"><h2>Corrigé</h2>
      <button class="btn ghost sm" data-act="wrong" aria-pressed="${S.onlyWrong}">${S.onlyWrong?"Afficher toutes les questions":"Afficher seulement mes erreurs"}</button></div>
    ${items?`<ul class="dl">${items}</ul>`:`<p class="muted">Aucune erreur : toutes vos réponses sont justes.</p>`}
    <p class="note">${wrong?wrong+" erreur"+(wrong>1?"s":"")+". ":""}La note pourra être ajustée par votre professeur après relecture.</p>`
    :`<div class="status before"><span class="dot"></span>Le corrigé sera disponible après le test du dernier groupe.</div>
    <p class="note">La note pourra être ajustée par votre professeur après relecture. Gardez cette page ouverte : le bouton ci-dessous affiche le corrigé dès qu’il est disponible.</p>
    <div class="actions"><button class="btn ghost" data-act="refresh">Vérifier si le corrigé est disponible</button></div>
    ${S.err?`<p class="err u-mt12" role="alert">${esc(S.err)}</p>`:""}`}
  </div></section></main>`;
}
function view(){
  if(S.step==="loading") return `<main class="wrap"><section class="sheet"><div class="ticks"></div><div class="sheet-body"><p class="muted" role="${S.err?"alert":"status"}">${S.err?esc(S.err):"Chargement…"}</p>${S.err?`<div class="actions"><button class="btn" data-act="reload">Réessayer</button></div>`:""}</div></section></main>`;
  if(S.step==="test") return testView();
  if(S.step==="review") return reviewView();
  if(S.step==="done") return doneView();
  return entryView();
}
let lastStep=null;
function render(){
  /* le focus ne doit jamais retomber sur <body> : on le restitue, ou on le place sur le titre du nouvel écran */
  const a=document.activeElement,prevId=a&&app.contains(a)?a.id:"";
  app.innerHTML=view()+`<footer class="wrap wide foot">Powered by Maxens Blanchet</footer>`;
  const changed=lastStep!==null&&lastStep!==S.step;lastStep=S.step;
  if(changed&&S.step!=="test"){
    const h=app.querySelector("h2.big")||app.querySelector("h1");
    if(h){h.setAttribute("tabindex","-1");h.focus({preventScroll:true});}
  }else if(prevId){
    const el=document.getElementById(prevId);
    if(el&&el!==document.activeElement) el.focus({preventScroll:true});
  }
}
function focusAns(){const a=$("#ans");if(a)a.focus();}
function refresh(){
  document.querySelectorAll("[data-r]").forEach(el=>el.classList.toggle("done",isAns(S.order[+el.dataset.r])));
  document.querySelectorAll("[data-nb]").forEach(el=>{el.classList.toggle("done",isAns(S.order[+el.dataset.nb]));el.setAttribute("aria-label",nbLabel(+el.dataset.nb));});
  const c=$("#count"); if(c) c.textContent=S.order.filter(isAns).length+" / "+NQ()+" répondues";
}

/* ---------- sauvegarde et envoi ---------- */
let saveTimer=null;
const payload=()=>({name:S.name,token:S.token,answers:S.ans,leaves:S.leaves});
function queueSave(){
  clearTimeout(saveTimer);
  saveTimer=setTimeout(()=>{ if(S.step==="test"||S.step==="review") api("/api/save",payload()).catch(()=>{}); },1200);
}
function beacon(){
  try{ navigator.sendBeacon("/api/save",new Blob([JSON.stringify(payload())],{type:"application/json"})); }catch(e){}
}
async function send(reason){
  if(S.locked) return;
  S.locked=true;S.sendReason=reason||false;
  attempt();
}
async function attempt(){
  try{
    const r=await api("/api/submit",{...payload(),reason:S.sendReason});
    S.locked=false;S.result=r;S.auto=S.sendReason||false;S.step="done";S.err="";render();
  }catch(e){
    if(e.status===403){
      S.err="Session expirée : vos réponses déjà enregistrées seront corrigées automatiquement.";
    }else{
      S.err="Envoi impossible pour l’instant (connexion). Nouvel essai en cours…";
      setTimeout(attempt,4000);
    }
    if(S.step==="review"||S.step==="test") render();
  }
}
async function start(){
  const nm=$("#nm"),cd=$("#code");
  S.name=nm?nm.value:S.name; S.code=cd?cd.value:S.code;
  if(!S.name){S.err="Choisissez votre nom dans la liste.";render();return;}
  const g=groupOf(S.name);
  if(wstate(g)!=="open"){S.err="Le test n’est pas ouvert pour votre groupe.";render();return;}
  S.busy=true;S.err="";render();
  try{
    const r=await api("/api/start",{name:S.name,code:S.code});
    S.skew=r.serverNow-Date.now();S.token=r.token;S.deadline=r.deadline;S.order=r.order;
    S.qs={};r.qs.forEach(q=>{S.qs[q.id]=q;});
    S.ans=r.answers.map(a=>a==null?null:a);S.leaves=r.leaves||[];S.cur=0;S.busy=false;S.step="test";S.auto=false;S.gm="";S.w5=false;S.w1=false;
    render();focusAns();
  }catch(e){S.busy=false;S.err=e.message||"Erreur réseau.";render();}
}
async function load(){
  try{
    const c=await api("/api/config");
    S.cfg=c;S.skew=c.serverNow-Date.now();S.step="entry";S.err="";render();
  }catch(e){S.step="loading";S.err="Impossible de joindre le serveur.";render();}
}
function act(a,el){
  switch(a){
    case "reload": load(); break;
    case "start": start(); break;
    case "goto": S.cur=+el.dataset.i; S.step="test"; S.gm=""; render(); focusAns(); break;
    case "prev": if(S.cur>0){S.cur--;S.gm="";render();focusAns();queueSave();} break;
    case "next": if(S.cur<NQ()-1){S.cur++;S.gm="";render();focusAns();queueSave();} else {S.step="review";S.err="";render();queueSave();} break;
    case "back": S.step="test"; render(); focusAns(); break;
    case "send": send(false); break;
    case "wrong": S.onlyWrong=!S.onlyWrong; render(); break;
    case "refresh": api("/api/corrige?name="+encodeURIComponent(S.name)+"&token="+encodeURIComponent(S.token)).then(r=>{S.result=r;S.err=r.corrige?"":"Le corrigé n’est pas encore disponible.";render();}).catch(()=>{S.err="Le corrigé n’est pas encore disponible.";render();}); break;
  }
}
app.addEventListener("click",e=>{
  const b=e.target.closest("[data-act]");
  if(!b||b.disabled) return;
  act(b.dataset.act,b);
});
app.addEventListener("input",e=>{
  const t=e.target;
  if(t.id==="ans"){
    const id=S.order[S.cur],prev=S.ans[id]||"";
    if(/^insertFrom|insertReplacementText/.test(e.inputType||"")){t.value=prev;note();return;}
    S.ans[id]=t.value;S.gm="";refresh();queueSave();
  }
  else if(t.id==="code"){S.code=t.value;}
});
app.addEventListener("change",e=>{
  const t=e.target;
  if(t.id==="nm"){S.name=t.value;S.err="";render();}
});
const guard=()=>S.step==="test"||S.step==="review";
app.addEventListener("keydown",e=>{
  if(guard()&&(e.ctrlKey||e.metaKey)&&"cxvaspu".indexOf((e.key||"").toLowerCase())>-1&&(e.key||"").length===1){e.preventDefault();return;}
  if(e.key!=="Enter") return;
  const id=e.target.id;
  if(id==="ans"){e.preventDefault();act("next");}
  else if(id==="code"||id==="nm"){e.preventDefault();act("start");}
});
function note(msg){S.gm=msg||"Saisie assistée refusée : tapez les lettres une à une.";const g=$("#gm");if(g)g.textContent=S.gm;}
["copy","cut","paste","contextmenu","dragstart","dragover","drop"].forEach(ev=>app.addEventListener(ev,e=>{
  if(!guard()) return;
  e.preventDefault();
  if(ev==="paste"||ev==="drop") note("Le collage est désactivé : tapez votre réponse.");
}));
app.addEventListener("beforeinput",e=>{
  if(!e.target||e.target.id!=="ans") return;
  const t=e.inputType||"";
  if(/^insertFrom|insertReplacementText|insertTranspose|insertLink/.test(t)||(t==="insertText"&&e.data&&e.data.length>2)){
    e.preventDefault();note();
  }
});
window.addEventListener("beforeprint",()=>{});
document.addEventListener("visibilitychange",()=>{
  if(!guard()) return;
  if(document.hidden){
    S.hiddenAt=Date.now();S.leaves.push({t:nowS(),d:null});beacon();
  }else if(S.hiddenAt){
    const l=S.leaves[S.leaves.length-1];
    if(l&&l.d===null) l.d=Math.max(0,Math.round((Date.now()-S.hiddenAt)/1000));
    S.hiddenAt=null;queueSave();render();if(S.step==="test")focusAns();
  }
});
setInterval(()=>{
  if(!S.cfg) return;
  if(S.step==="test"||S.step==="review"){
    const left=Math.round((S.deadline-nowS())/1000);
    if(left<=0){
      const w=S.cfg.windows[groupOf(S.name)];
      send(S.deadline>=w.close?"window":"time");return;
    }
    const t=$("#timer");
    if(t){t.textContent=mmss(left);t.classList.toggle("low",left<300);}
    /* annonces vocales (pas seulement la couleur) à 5 minutes puis à 1 minute */
    const tl=$("#tl");
    if(left<=60&&!S.w1){S.w1=true;S.w5=true;if(tl)tl.textContent="Il reste moins d’une minute.";}
    else if(left<=300&&!S.w5){S.w5=true;if(tl)tl.textContent="Il reste moins de cinq minutes.";}
  } else if(S.step==="entry"&&!S.busy){
    /* met à jour le statut du créneau sans perdre la saisie */
    const g=S.name?groupOf(S.name):null,w=g===null?null:wstate(g),key=w+"|"+S.name;
    if(S._k===undefined) S._k=key;
    else if(S._k!==key){S._k=key;const nm=$("#nm"),cd=$("#code");if(nm)S.name=nm.value;if(cd)S.code=cd.value;render();}
  }
},1000);
load();
})();
