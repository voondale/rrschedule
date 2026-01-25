// League Schedule Viewer – Firestore-backed
// Loads schedule from Firestore `matches` collection.
// Stores/reads league start date from Firestore `settings/league` document.

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js';
import { getFirestore, doc, getDoc, setDoc, collection, getDocs, query, orderBy } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { getAuth, signInAnonymously } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';

// --- Firebase Config (provided) ---
const firebaseConfig = {
  apiKey: "AIzaSyBbWxryZcM5L8CDCARMXPWKWFwnt2FoAxc",
  authDomain: "voontennis.firebaseapp.com",
  projectId: "voontennis",
  storageBucket: "voontennis.firebasestorage.app",
  messagingSenderId: "656217805388",
  appId: "1:656217805388:web:f49b2279ac8916cb5fdae9",
  measurementId: "G-4WWFWESVYJ"
};

// Init
const app = initializeApp(firebaseConfig);

// Initialize Auth and sign in anonymously so Firestore rules that require
// request.auth != null will pass for writes like settings/league.
const auth = getAuth(app);

signInAnonymously(auth)
  .then(() => {
    // console.info('Signed in anonymously');
  })
  .catch((err) => {
    // Non-fatal for reads; writes needing auth will fail until this succeeds
    console.error('Anonymous sign-in failed:', err);
  });

const db = getFirestore(app);

// DOM helpers
const $ = (sel, ctx=document) => ctx.querySelector(sel);
const $$ = (sel, ctx=document) => Array.from(ctx.querySelectorAll(sel));
const byId = id => document.getElementById(id);

const startDateInput = byId('startDate');
const saveStartDateBtn = byId('saveStartDateBtn');
const loadBtn = byId('loadBtn');
const expandAllBtn = byId('expandAllBtn');
const collapseAllBtn = byId('collapseAllBtn');
const errorBox = byId('error');
const scheduleEl = byId('schedule');
const roundNav = byId('roundNav');
const searchInput = byId('search');

// --- Utilities ---
function showError(msg) { errorBox.textContent = msg || ''; errorBox.hidden = !msg; }
function parseDateInput(value) { const parts = value?.split('-'); if (!parts || parts.length!==3) return null; const [y,m,d]=parts.map(Number); const dt=new Date(y,m-1,d); return isNaN(dt)?null:dt; }
function addDays(date, days) { const dt=new Date(date); dt.setDate(dt.getDate()+days); return dt; }
function fmtDate(date) {
  try { return date.toLocaleDateString(undefined,{weekday:'short',year:'numeric',month:'short',day:'numeric'});} catch { return date.toDateString(); }
}
function escapeHtml(str){ return String(str).replace(/[&<>"']/g, s=>({'&':'&','<':'<','>':'>','"':'"','\'':'&#39;'}[s])); }
function groupByRound(items){ const map=new Map(); for(const it of items){ const r=Number(it.round); if(!Number.isFinite(r)) continue; if(!map.has(r)) map.set(r,[]); map.get(r).push(it);} return new Map([...map.entries()].sort((a,b)=>a[0]-b[0])); }
function splitPlayers(label){ return String(label||'').split('&').map(s=>s.trim()).filter(Boolean); }
function groupByPlayerSet(matches){
  const map = new Map();
  for (const m of matches){
    const p = [...splitPlayers(m.team1), ...splitPlayers(m.team2)];
    const keyParts = [...new Set(p.map(x=>x.trim()))].sort((a,b)=>a.localeCompare(b));
    const key = keyParts.join('\n');
    if (!map.has(key)) map.set(key, { players: keyParts, matches: [] });
    map.get(key).matches.push(m);
  }
  return map;
}

// Render schedule
function render(items, startDate){
  const groupedRounds = groupByRound(items);
  if (groupedRounds.size===0){ scheduleEl.innerHTML='<p>No matches found.</p>'; roundNav.hidden=true; return; }

  // Round nav chips
  roundNav.innerHTML='';
  for (const r of groupedRounds.keys()){
    const a=document.createElement('a');
    a.href=`#round-${r}`; a.className='round-chip'; a.textContent=`Round ${r}`; roundNav.appendChild(a);
  }
  roundNav.hidden=false;

  const frag=document.createDocumentFragment();
  for (const [r, matches] of groupedRounds){
    const date=addDays(startDate,(r-1)*7);
    const section=document.createElement('section'); section.className='round collapsed'; section.id=`round-${r}`;
    const header=document.createElement('div'); header.className='round-header';
    header.innerHTML=`<div class="round-title">Round ${r}</div><div class="round-date">${fmtDate(date)}</div><div class="chev">▾</div>`;
    header.addEventListener('click', ()=>{ section.classList.toggle('collapsed'); });

    const groupMap = groupByPlayerSet(matches);
    for (const {players, matches: gm} of groupMap.values()){
      const groupWrap=document.createElement('div'); groupWrap.className='group-wrap';
      const gHeader=document.createElement('div'); gHeader.className='group-header';
      gHeader.innerHTML = `<h4 class="group-title">${escapeHtml(players.join(' • '))}</h4>`;
      const list=document.createElement('div'); list.className='matches';
      gm.forEach((m)=>{
        const row=document.createElement('div'); row.className='match';
        const t1=(m.team1??'').toString(); const t2=(m.team2??'').toString();
        row.dataset.teams=(t1+' '+t2).toLowerCase();
        const left=escapeHtml(t1); const right=escapeHtml(t2); const label=escapeHtml(m.matchId ?? `#${m._seq}`);
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

// Filter (hide group headers when none of their matches are visible)
function applyFilter(){
  const q=searchInput.value.trim().toLowerCase();
  const rounds=$$('.round', scheduleEl);
  rounds.forEach(r=>{
    const rows=$$('.match', r); let anyRound=false;
    rows.forEach(row=>{ const has=!q || row.dataset.teams.includes(q); row.style.display=has?'':'none'; anyRound = anyRound || has; });
    // Hide group if all its rows are hidden
    const groups=$$('.group-wrap', r);
    groups.forEach(g=>{ const vis = $$('.match', g).some(row=> row.style.display!== 'none'); g.style.display = vis ? '' : 'none'; });
    r.style.display = anyRound ? '' : 'none';
  });
}

searchInput.addEventListener('input', applyFilter);
expandAllBtn.addEventListener('click', ()=>{ $$('.round', scheduleEl).forEach(r=> r.classList.remove('collapsed')); });
collapseAllBtn.addEventListener('click', ()=>{ $$('.round', scheduleEl).forEach(r=> r.classList.add('collapsed')); });

// --- Firestore helpers ---
const START_DOC = doc(db, 'settings', 'league'); // stores { startDate: 'YYYY-MM-DD' }

async function loadStartDateFromFirestore(){
  const snap = await getDoc(START_DOC);
  if (snap.exists()){
    const val = snap.data().startDate;
    if (typeof val === 'string' && val.match(/^\d{4}-\d{2}-\d{2}$/)){
      startDateInput.value = val;
      return val;
    }
  }
  return null;
}

async function saveStartDateToFirestore(){
  const val = startDateInput.value;
  if (!val) { showError('Please pick a valid league start date.'); return; }
  await setDoc(START_DOC, { startDate: val }, { merge: true });
  showError('');
}

async function loadMatchesFromFirestore(){
  const qSnap = await getDocs(query(collection(db, 'matches'), orderBy('round')));
  const perRound = Object.create(null);
  const items = [];
  for (const d of qSnap.docs){
    const data = d.data() || {};
    const round = Number(data.round);
    const team1 = (data.team1 ?? '').toString();
    const team2 = (data.team2 ?? '').toString();
    if (!Number.isFinite(round) || !team1 || !team2) continue;
    perRound[round] = (perRound[round]||0) + 1; const seq = perRound[round];
    const matchId = (typeof data.matchId === 'string' && data.matchId.trim()) ? data.matchId.trim() : `R${round}M${seq}`;
    items.push({ round, team1, team2, matchId, _seq: seq });
  }
  return items;
}

// --- Wire up buttons ---
saveStartDateBtn.addEventListener('click', async ()=>{
  try { await saveStartDateToFirestore(); } catch (e) { showError('Failed to save start date: '+ (e?.message||e)); }
});

loadBtn.addEventListener('click', async ()=>{
  try {
    showError('');
    // Prefer the input value, otherwise fall back to value stored in Firestore
    let startStr = startDateInput.value;
    if (!startStr) startStr = await loadStartDateFromFirestore();
    const start = parseDateInput(startStr);
    if (!start) throw new Error('Please pick a valid league start date.');

    const items = await loadMatchesFromFirestore();
    render(items, start);
    applyFilter();
    const firstRound=$('.round', scheduleEl); if(firstRound) firstRound.classList.remove('collapsed');
  } catch (e){ showError(e?.message || String(e)); }
});

// Auto-load start date on first visit
(async ()=>{
  try { await loadStartDateFromFirestore(); } catch {} // ignore if missing
})();
