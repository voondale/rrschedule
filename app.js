
// League Schedule Viewer — Firestore persistence (front-end only)
// NOTE: This uses a simple client-side password for admin UI (demo only).

import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.0.0/firebase-app.js';
import { getFirestore, doc, getDoc, setDoc, onSnapshot, serverTimestamp } from 'https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js';

// ====== 0) Configure Firebase ======
// Replace these placeholders with your project's credentials (Firebase console -> Project settings):
const firebaseConfig = {
    apiKey: "AIzaSyA_PzKtYWZqRkOdJBakWsa6I5KPx0idm6E",
    authDomain: "kcschedule.firebaseapp.com",
    projectId: "kcschedule",
    storageBucket: "kcschedule.firebasestorage.app",
    messagingSenderId: "653230672134",
    appId: "1:653230672134:web:a4c24b71a13062cde63687",
    measurementId: "G-SHV9VBV5LE"
  };

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const SCHEDULE_DOC = doc(db, 'league', 'current'); // single shared document

// ====== 1) Admin gate (client-side, simple) ======
const ADMIN_PASSWORD = 'doubletrouble';
const ADMIN_FLAG_KEY = 'leagueViewer:isAdmin';
const $$ = (sel, ctx=document) => Array.from(ctx.querySelectorAll(sel));
const byId = (id) => document.getElementById(id);

function setAdminMode(isAdmin){
  try { sessionStorage.setItem(ADMIN_FLAG_KEY, isAdmin ? '1' : '0'); } catch {}
  $$('[data-admin-only]').forEach(el => { el.hidden = !isAdmin; el.querySelectorAll('input,button,select,textarea').forEach(c=> c.disabled = !isAdmin); });
  const loginBtn = byId('adminLoginBtn'); const logoutBtn = byId('adminLogoutBtn');
  if (loginBtn) loginBtn.hidden = !!isAdmin; if (logoutBtn) logoutBtn.hidden = !isAdmin;
  const badge = byId('adminBadge'); if (badge){ badge.textContent = isAdmin ? 'Admin mode' : 'Viewer mode'; badge.classList.toggle('badge-admin', !!isAdmin); badge.classList.toggle('badge-viewer', !isAdmin); }
}
function isAdmin(){ try { return sessionStorage.getItem(ADMIN_FLAG_KEY) === '1'; } catch { return false; } }

byId('adminLoginBtn')?.addEventListener('click', ()=>{
  const pwd = (prompt('Enter admin password:') || '').trim();
  if (pwd === ADMIN_PASSWORD) setAdminMode(true); else if (pwd) alert('Incorrect password.');
});
byId('adminLogoutBtn')?.addEventListener('click', ()=> setAdminMode(false));

document.addEventListener('DOMContentLoaded', ()=> setAdminMode(isAdmin()));

// ====== 2) DOM elements ======
const fileInput = byId('jsonFile');
const dropZone = byId('dropZone');
const startDateInput = byId('startDate');
const publishBtn = byId('publishBtn');
const expandAllBtn = byId('expandAllBtn');
const collapseAllBtn = byId('collapseAllBtn');
const errorBox = byId('error');
const scheduleEl = byId('schedule');
const roundNav = byId('roundNav');
const searchInput = byId('search');

// ====== 3) Utilities ======
function showError(msg){ errorBox.textContent = msg; errorBox.hidden = !msg; }
function parseDateInput(value){ const parts=value?.split('-'); if(!parts||parts.length!==3) return null; const [y,m,d]=parts.map(Number); const dt=new Date(y,m-1,d); return isNaN(dt)?null:dt; }
function addDays(date, days){ const dt=new Date(date); dt.setDate(dt.getDate()+days); return dt; }
function fmtDate(date){ try{ return date.toLocaleDateString(undefined,{weekday:'short',year:'numeric',month:'short',day:'numeric'});}catch{ return date.toDateString(); } }
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
function normalizeItems(items){ const out=[]; const perRound=Object.create(null); for(const m of items){ const round=Number(m?.round); const team1=toTeamLabel(m?.team1); const team2=toTeamLabel(m?.team2); if(!Number.isFinite(round)) continue; perRound[round]=(perRound[round]||0)+1; const seq=perRound[round]; const matchId=typeof m?.matchId==='string' && m.matchId.trim()? m.matchId.trim(): `R${round}M${seq}`; out.push({ round, team1, team2, matchId, _seq: seq }); } return out; }
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

// ====== 4) Live read from Firestore (visible to everyone) ======
async function loadFromFirestoreOnce(){
  try {
    const snap = await getDoc(SCHEDULE_DOC);
    const data = snap.exists() ? snap.data() : null;
    if (data && Array.isArray(data.schedule) && typeof data.startDate === 'string'){
      const start = parseDateInput(data.startDate);
      if (start){
        const normalized = normalizeItems(data.schedule);
        validateNormalized(normalized);
        render(normalized, start);
        applyFilter();
        const first = document.querySelector('.round'); if (first) first.classList.remove('collapsed');
      }
      if (startDateInput) startDateInput.value = data.startDate;
    }
  } catch (e) { console.warn('Failed to load schedule:', e.message); }
}

// Real-time updates (optional; uncomment to enable)
onSnapshot(SCHEDULE_DOC, (snap)=>{
  const data = snap.exists() ? snap.data() : null;
  if (!data) return;
  const start = parseDateInput(data.startDate);
  if (!start) return;
  const normalized = normalizeItems(Array.isArray(data.schedule)?data.schedule:[]);
  try { validateNormalized(normalized); } catch { /* ignore render if invalid */ return; }
  render(normalized, start); applyFilter();
  const first = document.querySelector('.round'); if (first) first.classList.remove('collapsed');
  if (startDateInput) startDateInput.value = data.startDate;
});

// Initial load
document.addEventListener('DOMContentLoaded', loadFromFirestoreOnce);

// ====== 5) Admin: Publish to Firestore ======
publishBtn.addEventListener('click', async ()=>{
  try{
    showError('');
    const file=fileInput.files?.[0]; if(!file) throw new Error('Please choose or drop a schedule JSON file.');
    const startISO=startDateInput.value; const start=parseDateInput(startISO); if(!start) throw new Error('Please pick a valid league start date.');
    const fileData=await readJsonFile(file);
    const normalized=normalizeItems(Array.isArray(fileData)?fileData:[]);
    validateNormalized(normalized);

    await setDoc(SCHEDULE_DOC, {
      startDate: startISO,
      schedule: fileData,
      updatedAt: serverTimestamp()
    });

    alert('Schedule published to Firestore. Everyone will see it on refresh (or instantly via realtime).');
  }catch(e){ showError(e.message || String(e)); }
});
