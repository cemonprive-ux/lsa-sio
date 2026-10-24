(function(){
"use strict";
const app=document.getElementById("app");
const esc=s=>String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const pad=n=>String(n).padStart(2,"0");
const mmss=sec=>pad(Math.floor(sec/60))+":"+pad(sec%60);
const dec=n=>n.toFixed(1).replace(".",",");
const f20=v=>Number.isInteger(v)?String(v):String(v).replace(".",",");
const TZ="Europe/Paris";
const hms=ms=>new Date(ms).toLocaleTimeString("fr-FR",{hour:"2-digit",minute:"2-digit",second:"2-digit",timeZone:TZ});
const gname=g=>"Groupe "+(g+1);
const FILE="resultats_connecteurs-logiques_bts-sio.xlsx";

let S={pw:"",data:null,exp:null,err:"",busy:false};
try{S.pw=sessionStorage.getItem("sio_pw")||"";}catch(e){}

async function call(path,body){
  const r=await fetch(path,{method:body?"POST":"GET",headers:Object.assign({authorization:"Bearer "+S.pw},body?{"content-type":"application/json"}:{}),body:body?JSON.stringify(body):undefined,cache:"no-store"});
  let j={};try{j=await r.json();}catch(e){}
  if(!r.ok){const e=new Error(j.error||"Erreur réseau");e.status=r.status;throw e;}
  return j;
}
const snap=()=>JSON.stringify([S.data&&Object.assign({},S.data,{serverNow:0}),S.err,S.exp]);
async function load(force){
  const before=snap();
  try{S.data=await call("/api/prof/results");S.err="";}
  catch(e){
    if(e.status===401||e.status===429||e.status===503){S.data=null;S.err=e.message;try{sessionStorage.removeItem("sio_pw");}catch(_){}}
    else S.err="Connexion au serveur impossible. Nouvel essai automatique.";
  }
  /* actualisation silencieuse : on ne reconstruit la page que si quelque chose a changé */
  if(force===true||snap()!==before) render();
}

/* ---------- export Excel (.xlsx écrit à la main, sans bibliothèque) ---------- */
const XL=(function(){
  const enc=s=>new TextEncoder().encode(s);
  const T=(()=>{const t=new Uint32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xEDB88320^(c>>>1):c>>>1;t[n]=c>>>0;}return t;})();
  const crc32=b=>{let c=0xFFFFFFFF;for(let i=0;i<b.length;i++)c=T[(c^b[i])&255]^(c>>>8);return(c^0xFFFFFFFF)>>>0;};
  function zip(files){
    const parts=[],cen=[];let off=0;
    files.forEach(f=>{
      const name=enc(f.name),data=f.data,crc=crc32(data);
      const lh=new DataView(new ArrayBuffer(30));
      lh.setUint32(0,0x04034b50,true);lh.setUint16(4,20,true);lh.setUint16(6,0x0800,true);lh.setUint16(8,0,true);
      lh.setUint16(10,0,true);lh.setUint16(12,(46<<9)|(11<<5)|2,true);lh.setUint32(14,crc,true);
      lh.setUint32(18,data.length,true);lh.setUint32(22,data.length,true);lh.setUint16(26,name.length,true);lh.setUint16(28,0,true);
      parts.push(new Uint8Array(lh.buffer),name,data);
      const ch=new DataView(new ArrayBuffer(46));
      ch.setUint32(0,0x02014b50,true);ch.setUint16(4,20,true);ch.setUint16(6,20,true);ch.setUint16(8,0x0800,true);ch.setUint16(10,0,true);
      ch.setUint16(12,0,true);ch.setUint16(14,(46<<9)|(11<<5)|2,true);ch.setUint32(16,crc,true);
      ch.setUint32(20,data.length,true);ch.setUint32(24,data.length,true);ch.setUint16(28,name.length,true);
      ch.setUint32(42,off,true);
      cen.push(new Uint8Array(ch.buffer),name);
      off+=30+name.length+data.length;
    });
    const cl=cen.reduce((a,x)=>a+x.length,0);
    const e=new DataView(new ArrayBuffer(22));
    e.setUint32(0,0x06054b50,true);e.setUint16(8,files.length,true);e.setUint16(10,files.length,true);e.setUint32(12,cl,true);e.setUint32(16,off,true);
    const all=parts.concat(cen,[new Uint8Array(e.buffer)]);
    const out=new Uint8Array(all.reduce((a,x)=>a+x.length,0));let p=0;all.forEach(x=>{out.set(x,p);p+=x.length;});
    return out;
  }
  const colName=c=>{let s="";c++;while(c>0){const m=(c-1)%26;s=String.fromCharCode(65+m)+s;c=Math.floor((c-1)/26);}return s;};
  const x=s=>String(s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c])).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g,"");
  function sheetXml(sh){
    const rows=sh.rows.map((row,r)=>"<row r=\""+(r+1)+"\">"+row.map((cell,c)=>{
      const o=(cell!==null&&typeof cell==="object")?cell:{v:cell,s:0};
      const ref=colName(c)+(r+1),st=o.s?" s=\""+o.s+"\"":"";
      if(o.v===""||o.v===null||o.v===undefined) return o.s?"<c r=\""+ref+"\""+st+"/>":"";
      if(typeof o.v==="number") return "<c r=\""+ref+"\""+st+"><v>"+o.v+"</v></c>";
      return "<c r=\""+ref+"\""+st+" t=\"inlineStr\"><is><t xml:space=\"preserve\">"+x(o.v)+"</t></is></c>";
    }).join("")+"</row>").join("");
    const cols=sh.widths?"<cols>"+sh.widths.map((w,i)=>"<col min=\""+(i+1)+"\" max=\""+(i+1)+"\" width=\""+w+"\" customWidth=\"1\"/>").join("")+"</cols>":"";
    return "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?><worksheet xmlns=\"http://schemas.openxmlformats.org/spreadsheetml/2006/main\"><sheetViews><sheetView workbookViewId=\"0\"><pane ySplit=\"1\" topLeftCell=\"A2\" activePane=\"bottomLeft\" state=\"frozen\"/></sheetView></sheetViews>"+cols+"<sheetData>"+rows+"</sheetData></worksheet>";
  }
  const STYLES="<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?><styleSheet xmlns=\"http://schemas.openxmlformats.org/spreadsheetml/2006/main\"><fonts count=\"3\"><font><sz val=\"11\"/><name val=\"Calibri\"/></font><font><b/><sz val=\"11\"/><name val=\"Calibri\"/></font><font><b/><sz val=\"11\"/><color rgb=\"FFB42318\"/><name val=\"Calibri\"/></font></fonts><fills count=\"4\"><fill><patternFill patternType=\"none\"/></fill><fill><patternFill patternType=\"gray125\"/></fill><fill><patternFill patternType=\"solid\"><fgColor rgb=\"FFE2EFE8\"/><bgColor indexed=\"64\"/></patternFill></fill><fill><patternFill patternType=\"solid\"><fgColor rgb=\"FFFBE4E1\"/><bgColor indexed=\"64\"/></patternFill></fill></fills><borders count=\"1\"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count=\"1\"><xf numFmtId=\"0\" fontId=\"0\" fillId=\"0\" borderId=\"0\"/></cellStyleXfs><cellXfs count=\"5\"><xf numFmtId=\"0\" fontId=\"0\" fillId=\"0\" borderId=\"0\" xfId=\"0\"/><xf numFmtId=\"0\" fontId=\"1\" fillId=\"2\" borderId=\"0\" xfId=\"0\" applyFont=\"1\" applyFill=\"1\"/><xf numFmtId=\"0\" fontId=\"0\" fillId=\"3\" borderId=\"0\" xfId=\"0\" applyFill=\"1\"/><xf numFmtId=\"0\" fontId=\"1\" fillId=\"0\" borderId=\"0\" xfId=\"0\" applyFont=\"1\"/><xf numFmtId=\"0\" fontId=\"2\" fillId=\"3\" borderId=\"0\" xfId=\"0\" applyFont=\"1\" applyFill=\"1\"/></cellXfs><cellStyles count=\"1\"><cellStyle name=\"Normal\" xfId=\"0\" builtinId=\"0\"/></cellStyles></styleSheet>";
  function build(sheets){
    const hdr="<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>";
    const files=[
      {name:"[Content_Types].xml",data:enc(hdr+"<Types xmlns=\"http://schemas.openxmlformats.org/package/2006/content-types\"><Default Extension=\"rels\" ContentType=\"application/vnd.openxmlformats-package.relationships+xml\"/><Default Extension=\"xml\" ContentType=\"application/xml\"/><Override PartName=\"/xl/workbook.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml\"/>"+sheets.map((s,i)=>"<Override PartName=\"/xl/worksheets/sheet"+(i+1)+".xml\" ContentType=\"application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml\"/>").join("")+"<Override PartName=\"/xl/styles.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml\"/></Types>")},
      {name:"_rels/.rels",data:enc(hdr+"<Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\"><Relationship Id=\"rId1\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument\" Target=\"xl/workbook.xml\"/></Relationships>")},
      {name:"xl/workbook.xml",data:enc(hdr+"<workbook xmlns=\"http://schemas.openxmlformats.org/spreadsheetml/2006/main\" xmlns:r=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships\"><sheets>"+sheets.map((s,i)=>"<sheet name=\""+x(s.name)+"\" sheetId=\""+(i+1)+"\" r:id=\"rId"+(i+1)+"\"/>").join("")+"</sheets></workbook>")},
      {name:"xl/_rels/workbook.xml.rels",data:enc(hdr+"<Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\">"+sheets.map((s,i)=>"<Relationship Id=\"rId"+(i+1)+"\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet\" Target=\"worksheets/sheet"+(i+1)+".xml\"/>").join("")+"<Relationship Id=\"rId"+(sheets.length+1)+"\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles\" Target=\"styles.xml\"/></Relationships>")},
      {name:"xl/styles.xml",data:enc(STYLES)}
    ].concat(sheets.map((s,i)=>({name:"xl/worksheets/sheet"+(i+1)+".xml",data:enc(sheetXml(s))})));
    return zip(files);
  }
  return {build};
})();
window.SIO_XL=XL;

function sheetsFor(d){
  const H=t=>({v:t,s:1});
  const heads=["Élève","Groupe","Statut","Durée","Total /"+d.nq,"Sur 20 (demi-point)","Sorties de page","Temps hors page","Alerte (plus de "+d.leaveAlert+" sorties)","Détail des sorties"].concat(d.questions.map(q=>"Q"+q.n+" · "+q.q)).map(H);
  const rows=[heads];
  d.students.forEach(s=>{
    const base=[s.name,"G"+(s.group+1)];
    if(s.status==="none"){rows.push(base.concat(["Non rendu"]));return;}
    const al=s.alert;
    const detail=s.leaves.map(l=>hms(l.t)+" ("+l.d+" s)").join(" ; ");
    const row=base.concat([s.status==="done"?"Rendu":"En cours",mmss(s.dur),s.total,s.s20,
      al?{v:s.leaveCount,s:4}:s.leaveCount,mmss(s.away),al?{v:"OUI",s:4}:"",detail]);
    d.questions.forEach((q,i)=>{const a=(s.answers[i]||"").trim();row.push(s.ok[i]?a:{v:a,s:2});});
    rows.push(row);
  });
  const w=[34,8,10,9,10,14,14,14,18,46].concat(d.questions.map(()=>18));
  const acc=[["N°","À traduire","Réponses acceptées"].map(H)].concat(d.questions.map(q=>[q.n,q.q,q.acc.join(" / ")]));
  return [{name:"Résultats",rows,widths:w},{name:"Réponses acceptées",rows:acc,widths:[6,28,40]}];
}
XL.sheetsFor=sheetsFor;
function download(){
  const bytes=XL.build(sheetsFor(S.data));
  const blob=new Blob([bytes],{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"});
  const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=FILE;document.body.appendChild(a);a.click();
  setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove();},1500);
}

/* ---------- vues ---------- */
function loginView(){
  return `<main class="wrap"><section class="sheet"><div class="ticks"></div><div class="sheet-body">
    <p class="eyebrow">Espace enseignant</p><h1>Résultats</h1>
    <div class="field"><label for="pw">Mot de passe</label><input class="ctl" id="pw" type="password" autocomplete="current-password" value=""></div>
    ${S.err?`<p class="err" role="alert">${esc(S.err)}</p>`:""}
    <button class="btn full" data-act="login">Ouvrir</button>
  </div></section></main>`;
}
function dashView(){
  const d=S.data,NQ=d.nq,st=d.students;
  const done=st.filter(s=>s.status==="done"),prog=st.filter(s=>s.status==="progress");
  const gdone=[0,1].map(g=>done.filter(s=>s.group===g).length),gtot=[0,1].map(g=>st.filter(s=>s.group===g).length);
  const avg=done.length?done.reduce((a,s)=>a+s.s20,0)/done.length:null;
  const rate=d.questions.map((_,i)=>done.length?done.filter(s=>s.ok[i]).length/done.length:0);
  let w=0;rate.forEach((v,i)=>{if(v<rate[w])w=i;});
  const bars=rate.map((v,i)=>`<div class="bar a" aria-hidden="true" style="height:${Math.round(v*100)}%" title="Q${i+1} : ${Math.round(v*100)} % de réussite"></div>`).join("");
  const xax=d.questions.map((_,i)=>`<span>${i+1}</span>`).join("");
  const alerts=st.filter(s=>s.alert);
  const rows=st.map(s=>{
    if(s.status==="none") return `<tr class="absent"><td>${esc(s.name)}</td><td>G${s.group+1}</td><td>Non rendu</td><td class="num">—</td><td class="num">—</td><td class="num">—</td><td class="num">—</td></tr>`;
    const open=S.exp===s.name,cls=s.s20>=14?"hi":s.s20>=10?"mid":"lo";
    let out=`<tr><td><button class="rowbtn" data-act="tog" data-k="${esc(s.name)}" aria-expanded="${open}"><span class="car" aria-hidden="true">${open?"▾":"▸"}</span>${esc(s.name)}${s.alert?`<span class="chip badc u-ml8" title="Plus de ${d.leaveAlert} sorties de la page"><span aria-hidden="true">⚠ </span>${s.leaveCount}<span class="sr"> sorties de la page, au-dessus du seuil d’alerte</span></span>`:""}</button></td><td>G${s.group+1}</td><td>${s.status==="done"?"Rendu · "+mmss(s.dur):"En cours · "+s.answered+"/"+NQ}</td><td class="num">${s.total}</td><td class="num"><span class="score ${cls}">${f20(s.s20)}</span></td><td class="num">${s.alert?`<span class="chip badc">${s.leaveCount}</span>`:s.leaveCount}</td><td class="num">${mmss(s.away)}</td></tr>`;
    if(open){
      const items=d.questions.map((q,i)=>{
        const ok=s.ok[i],given=(s.answers[i]||"").trim(),ovr=s.ov[i]!==undefined;
        return `<li class="di${ok?"":" bad"}"><span class="qn">Q${q.n}</span>
          <div><div class="pr">${esc(q.q)}</div><div class="vals"><span>Réponse<code>${given?esc(given):"(vide)"}</code></span><span>Attendu<code>${esc(q.acc.join(" / "))}</code></span></div></div>
          <div class="act"><span class="chip ${ok?"good":"badc"}">${ok?"Juste":"Faux"}${ovr?" · corrigé":""}</span><button class="btn ghost sm" data-act="ov" data-k="${esc(s.name)}" data-q="${i}" data-v="${ok?"0":"1"}">${ok?"Marquer faux":"Marquer juste"}</button>${ovr?`<button class="btn ghost sm" data-act="ov" data-k="${esc(s.name)}" data-q="${i}" data-v="null">Rétablir</button>`:""}</div></li>`;
      }).join("");
      const lv=s.leaves.length?`<p class="note u-m10"><b>Sorties de la page :</b> ${s.leaves.map(l=>hms(l.t)+" ("+l.d+" s)").join(" · ")}</p>`:`<p class="note u-m10">Aucune sortie de la page.</p>`;
      out+=`<tr class="detail"><td colspan="7">${lv}<ul class="dl">${items}</ul></td></tr>`;
    }
    return out;
  }).join("");
  return `<main class="wrap wide">
    <div class="thead2">
      <div><p class="eyebrow">Espace enseignant</p><h1>Résultats · ${esc(d.title)} · BTS SIO</h1></div>
      <div class="u-grid"><span class="lock"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>Accès réservé, protégé par mot de passe</span>
      <div class="u-flex"><button class="btn ghost" data-act="refresh">Actualiser</button><button class="btn" data-act="xl">Télécharger l’export Excel</button></div></div>
    </div>
    ${S.err?`<div class="status closed" role="alert"><span class="dot"></span>${esc(S.err)}</div>`:""}
    <div class="stats">
      <div class="stat"><div class="v">${done.length}<small> / ${st.length}</small></div><div class="l">Copies rendues</div></div>
      ${[0,1].map(g=>`<div class="stat"><div class="v">${gdone[g]}<small> / ${gtot[g]}</small></div><div class="l">${gname(g)}</div></div>`).join("")}
      <div class="stat"><div class="v">${prog.length}</div><div class="l">En cours</div></div>
      <div class="stat"><div class="v">${avg===null?"—":dec(avg)}<small> / 20</small></div><div class="l">Moyenne de la classe</div></div>
      <div class="stat"><div class="v">${alerts.length}</div><div class="l">Alertes sorties de page</div></div>
    </div>
    ${alerts.length?`<div class="status closed u-mt0"><span class="dot"></span>Plus de ${d.leaveAlert} sorties de la page : ${alerts.map(s=>esc(s.name)+" ("+s.leaveCount+")").join(" · ")}</div>`:""}
    ${done.length?`<div class="sec"><h2>Réussite par question</h2></div>
    <div class="chart"><div class="yax"><span>100 %</span><span>50 %</span><span>0</span></div><div><div class="bars" role="img" aria-label="${esc("Réussite par question : "+rate.map((v,i)=>"Q"+(i+1)+" "+Math.round(v*100)+" %").join(", "))}">${bars}</div><div class="xax">${xax}</div></div></div>
    <p class="worst">Question la moins réussie : <b>Q${w+1}</b>, ${esc(d.questions[w].q)} (${Math.round(rate[w]*100)} %).</p>`
    :`<p class="note u-m26">Aucune copie rendue pour l’instant. La page s’actualise toutes les 20 secondes.</p>`}
    <div class="sec"><h2>Copies</h2><span class="muted u-fs14">Cliquez sur un nom pour voir les réponses, les sorties de page et corriger à la main</span></div>
    <div class="tablewrap"><table class="res"><thead><tr><th scope="col">Élève</th><th scope="col">Groupe</th><th scope="col">Statut</th><th scope="col" class="num">Total /${NQ}</th><th scope="col" class="num">Sur 20 (demi-point)</th><th scope="col" class="num">Sorties</th><th scope="col" class="num">Hors page</th></tr></thead><tbody>${rows}</tbody></table></div>
    <p class="note">Chaque élève reçoit les questions dans un ordre différent (tirage aléatoire). La numérotation Q1 à Q${NQ} est celle du fichier de questions.</p>
    <p class="note">Une pastille ⚠ signale plus de ${d.leaveAlert} sorties de la page pendant le test. Les sorties comptent aussi les appels entrants, les notifications ouvertes et la mise en veille de l’écran : un chiffre isolé ne prouve pas une tentative de triche.</p>
    <p class="note">Le « Sur 20 » est ramené à 20 et arrondi au demi-point le plus proche. Les copies non envoyées à l’échéance sont corrigées à partir des dernières réponses enregistrées.</p>
    <p class="note">L’export Excel contient deux feuilles : « Résultats » (fautes surlignées en rouge, alerte sorties de page) et « Réponses acceptées ».</p>
  </main>`;
}
const sig=a=>a&&a.dataset?[a.id,a.dataset.act,a.dataset.k,a.dataset.q,a.dataset.v].join("|"):"";
function render(){
  /* le focus clavier est restitué sur le même contrôle après reconstruction */
  const a=document.activeElement,prev=a&&app.contains(a)?sig(a):null;
  app.innerHTML=(S.data?dashView():loginView())+`<footer class="wrap wide foot">Powered by Maxens Blanchet</footer>`;
  if(prev){
    const el=[...app.querySelectorAll("button,input,select")].find(x=>sig(x)===prev);
    if(el) el.focus({preventScroll:true});
  }
}
app.addEventListener("click",async e=>{
  const b=e.target.closest("[data-act]");if(!b||b.disabled)return;
  const a=b.dataset.act;
  if(a==="login"){const pw=document.getElementById("pw").value;S.pw=pw;try{sessionStorage.setItem("sio_pw",pw);}catch(_){}await load(true);}
  else if(a==="refresh")load(true);
  else if(a==="tog"){S.exp=S.exp===b.dataset.k?null:b.dataset.k;render();}
  else if(a==="xl")download();
  else if(a==="ov"){
    const v=b.dataset.v==="null"?null:b.dataset.v==="1";
    try{await call("/api/prof/override",{name:b.dataset.k,q:+b.dataset.q,value:v});await load(true);}catch(err){S.err="Correction non enregistrée : "+err.message;render();}
  }
});
app.addEventListener("keydown",e=>{if(e.key==="Enter"&&e.target.id==="pw"){e.preventDefault();app.querySelector("[data-act=login]").click();}});
setInterval(()=>{if(S.data)load();},20000);
if(S.pw)load(true);else render();
})();
