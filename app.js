
/* League Schedule Viewer — Firestore persistence
   - Admin uploads JSON + start date and clicks Save & Publish -> writes to Firestore
   - Everyone loads the latest schedule from Firestore on page load (plus realtime)
*/
(function(){
  const $ = (sel, ctx=document) => ctx.querySelector(sel);
  const $$ = (sel, ctx=document) => Array.from(ctx.querySelectorAll(sel));
  const byId = id => document.getElementById(id);
  const fileInput = byId('jsonFile');
  const dropZone = byId('dropZone');
  const startDateInput = byId('startDate');
  const loadBtn = byId('loadBtn');
  const expandAllBtn = byId('expandAllBtn');
  const collapseAllBtn = byId('collapseAllBtn');
  const errorBox = byId('error');
  const scheduleEl = byId('schedule');
  const roundNav = byId('roundNav');
  const searchInput = byId('search');

  // ===== Firebase (CDN) dynamic import =====
  async function loadFirebase(){
    const v = '11.0.0';
    const app = await import(`https://www.gstatic.com/firebasejs/${v}/firebase-app.js`);
    const fs  = await import(`https://www.gstatic.com/firebasejs/${v}/firebase-firestore.js`);
    return { app, fs };
  }

  // ===== Replace with your Firebase web config =====
  const firebaseConfig = {
    apiKey: "AIzaSyA_PzKtYWZqRkOdJBakWsa6I5KPx0idm6E",
    authDomain: "kcschedule.firebaseapp.com",
    projectId: "kcschedule",
    storageBucket: "kcschedule.firebasestorage.app",
    messagingSenderId: "653230672134",
    appId: "1:653230672134:web:a4c24b71a13062cde63687",
    measurementId: "G-SHV9VBV5LE"
  };

  let docRef, getDoc, setDoc, onSnapshot, serverTimestamp;

  async function initFirestore(){
    try{
      const { app:{ initializeApp }, fs } = await loadFirebase();
      const app = initializeApp(firebaseConfig);
      const db = fs.getFirestore(app);
      getDoc = fs.getDoc; setDoc = fs.setDoc; onSnapshot = fs.onSnapshot; serverTimestamp = fs.serverTimestamp;
      const { doc } = fs; docRef = (path) => doc(db, ...path.split('/'));
    }catch(e){
      showError('Failed to load Firebase SDK. If your network blocks gstatic, use a bundled build.');
      throw e;
    }
  }

  // ===== Utilities =====
  function showError(msg){ errorBox.textContent = msg; errorBox.hidden = !msg; }
  function parseDateInput(value){ const parts=value?.split('-'); if(!parts||parts.length!==3) return null; const [y,m,d]=parts.map(Number); const dt=new Date(y,m-1,d); return isNaN(dt)?null:dt; }
  function addDays(date, days){ const dt=new Date(date); dt.setDate(dt.getDate()+days); return dt; }
  function fmtDate(date){ try{ return date.toLocaleDateString(undefined,{weekday:'short',year:'numeric',month:'short',day:'numeric'});}catch(e){return date.toDateString();} }
  function escapeHtml(str){ return String(str).replace(/[&<>"']/g, s=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s])); }
  function groupByRound(items){ const map=new Map(); for(const it of items){ const r=Number(it.round); if(!Number.isFinite(r)) continue; if(!map.has(r)) map.set(r,[]); map.get(r).push(it);} return new Map([...map.entries()].sort((a,b)=>a[0]-b[0])); }
  function splitPlayers(label){ return String(label).split('&').map(s=>s.trim()).filter(Boolean); }
  function groupByPlayerSet(matches){ const map=new Map(); for(const m of matches){ const p=[...splitPlayers(m.team1), ...splitPlayers(m.team2)]; const keyParts=[...new Set(p.map(x=>x.trim()))].sort((a,b)=>a.localeCompare(b)); const key=keyParts.join('
'); if(!map.has(key)) map.set(key,{players:keyParts,matches:[]}); map.get(key).matches.push(m);} return map; }

  ['dragenter','dragover'].forEach(ev=>{ dropZone?.addEventListener(ev, e=>{ e.preventDefault(); dropZone.classList.add('drag'); }); });
  ['dragleave','drop'].forEach(ev=>{ dropZone?.addEventListener(ev, e=>{ e.preventDefault(); dropZone.classList.remove('drag'); }); });
  dropZone?.addEventListener('drop', e=>{ const f=e.dataTransfer?.files?.[0]; if(f){ fileInput.files=e.dataTransfer.files; dropZone.innerHTML = `<strong>Loaded:</strong> ${escapeHtml(f.name)}`; } });

  async function readJsonFile(file){ const text=await file.text(); try{ return JSON.parse(text);}catch(e){ throw new Error('Invalid JSON: '+e.message);} }
  function toTeamLabel(v){ if(typeof v==='string') return v.trim(); if(Array.isArray(v)) return v.join(' & '); if(Array.isArray(v?.players)) return v.players.join(' & '); return ''; }
  function normalizeItems(items){ const out=[]; const perRound=Object.create(null); for(const m of items){ const round=Number(m?.round); const team1=toTeamLabel(m?.team1); const team2=toTeamLabel(m?.team2); if(!Number.isFinite(round)) continue; perRound[round]=(perRound[round]||0)+1; const seq=perRound[round]; const matchId=typeof m?.matchId==='string'&&m.matchId.trim()?m.matchId.trim():`R${round}M${seq}`; out.push({ round, team1, team2, matchId, _seq: seq }); } return out; }
  function validateNormalized(items){ if(!Array.isArray(items)) throw new Error('JSON must be an array of matches.'); const problems=[]; items.forEach((m,i)=>{ if(!Number.isInteger(m.round)) problems.push(`Item ${i+1}: "round" must be an integer`); if(!m.team1) problems.push(`Item ${i+1}: missing/empty team1`); if(!m.team2) problems.push(`Item ${i+1}: missing/empty team2`); }); if(problems.length) throw new Error(problems.join('
')); }

  function render(items, startDate){
    const groupedRounds = groupByRound(items);
    if(groupedRounds.size===0){ scheduleEl.innerHTML='<p>No matches found.</p>'; roundNav.hidden=true; return; }
    roundNav.innerHTML=''; for(const r of groupedRounds.keys()){ const a=document.createElement('a'); a.href=`#round-${r}`; a.className='round-chip'; a.textContent=`Round ${r}`; roundNav.appendChild(a);} roundNav.hidden=false;
    const frag=document.createDocumentFragment();
    for(const [r, matches] of groupedRounds){
      const date=addDays(startDate,(r-1)*7);
      const section=document.createElement('section'); section.className='round collapsed'; section.id=`round-${r}`;
      const header=document.createElement('div'); header.className='round-header'; header.innerHTML=`<div class="round-title">Round ${r}</div><div class="round-date">${fmtDate(date)}</div><div class="chev">▾</div>`; header.addEventListener('click', ()=>{ section.classList.toggle('collapsed'); });
      const groupMap = groupByPlayerSet(matches);
      for(const {players, matches: gm} of groupMap.values()){
        const groupWrap=document.createElement('div'); groupWrap.className='group-wrap';
        const gHeader=document.createElement('div'); gHeader.className='group-header'; gHeader.innerHTML = `<h4 class="group-title">${escapeHtml(players.join(' • '))}</h4>`;
        const list=document.createElement('div'); list.className='matches';
        gm.forEach((m)=>{
          const row=document.createElement('div'); row.className='match';
          const t1=(m.team1??'').toString(); const t2=(m.team2??'').toString();
          row.dataset.teams=(t1+' '+t2).toLowerCase();
          const left=escapeHtml(t1); const right=escapeHtml(t2); const label=escapeHtml(m.matchId || `#${m._seq}`);
          row.innerHTML=`<div><span class="num">${label}</span> ${left}</div><div class="vs">vs</div><div>${right}</div>`;
          list.appendChild(row);
        });
        groupWrap.appendChild(gHeader); groupWrap.appendChild(list); section.appendChild(groupWrap);
      }
      section.prepend(header);
      frag.appendChild(section);
    }
    scheduleEl.innerHTML=''; scheduleEl.appendChild(frag);
  }

  function applyFilter(){
    const q=searchInput.value.trim().toLowerCase();
    const rounds=$$('.round', scheduleEl);
    rounds.forEach(r=>{
      const rows=$$('.match', r); let anyRound=false;
      rows.forEach(row=>{ const has=!q || row.dataset.teams.includes(q); row.style.display=has?'':'none'; anyRound = anyRound || has; });
      const groups=$$('.group-wrap', r); groups.forEach(g=>{ const vis=$$('.match', g).some(row=> row.style.display!=='none'); g.style.display = vis ? '' : 'none'; });
      r.style.display = anyRound ? '' : 'none';
    });
  }
  searchInput.addEventListener('input', applyFilter);
  expandAllBtn.addEventListener('click', ()=>{ $$('.round', scheduleEl).forEach(r=> r.classList.remove('collapsed')); });
  collapseAllBtn.addEventListener('click', ()=>{ $$('.round', scheduleEl).forEach(r=> r.classList.add('collapsed')); });

  // ===== Firestore: Load for everyone =====
  async function fetchPublished(){
    try{
      const ref = docRef('league/current');
      const snap = await getDoc(ref);
      if (!snap || !snap.exists()) return;
      const data = snap.data();
      if (Array.isArray(data.schedule) && typeof data.startDate === 'string'){
        const start = parseDateInput(data.startDate);
        if (start){
          const normalized = normalizeItems(data.schedule);
          validateNormalized(normalized);
          render(normalized, start);
          applyFilter();
          const first = document.querySelector('.round'); if (first) first.classList.remove('collapsed');
          if (startDateInput) startDateInput.value = data.startDate;
        }
      }
    }catch(e){ console.warn('Failed to load published schedule:', e.message); }
  }

  // ===== Firestore: realtime updates =====
  function listenRealtime(){
    try{
      const ref = docRef('league/current');
      onSnapshot(ref, (snap)=>{
        if (!snap || !snap.exists()) return;
        const data = snap.data();
        const start = parseDateInput(data.startDate);
        if (!start) return;
        const normalized = normalizeItems(Array.isArray(data.schedule)?data.schedule:[]);
        try { validateNormalized(normalized); } catch { return; }
        render(normalized, start); applyFilter();
        const first = document.querySelector('.round'); if (first) first.classList.remove('collapsed');
        if (startDateInput) startDateInput.value = data.startDate;
      });
    }catch(e){ console.warn('Realtime disabled:', e.message); }
  }

  // ===== Admin: Save & Publish to Firestore =====
  loadBtn.addEventListener('click', async ()=>{
    try{
      showError('');
      const file=fileInput.files?.[0]; if(!file) throw new Error('Please choose or drop a schedule JSON file.');
      const startISO = startDateInput.value; const start=parseDateInput(startISO); if(!start) throw new Error('Please pick a valid league start date.');
      const data = await readJsonFile(file);
      const normalized = normalizeItems(Array.isArray(data)?data:[]);
      validateNormalized(normalized);
      const ref = docRef('league/current');
      await setDoc(ref, { startDate: startISO, schedule: data, updatedAt: serverTimestamp() });
      await fetchPublished();
      alert('Schedule published to Firestore.');
    }catch(e){ showError(e.message || String(e)); }
  });

  // ===== Init =====
  document.addEventListener('DOMContentLoaded', async ()=>{
    await initFirestore();
    await fetchPublished();
    listenRealtime();
  });
})();
