/* LogoIQ - guess the logo. Vanilla JS, no dependencies. */
(function(){
'use strict';

const LEVELS = [
  {id:0, name:'Amateur',      desc:'Full colour logos. A gentle warm-up.'},
  {id:1, name:'Intermediate', desc:'Logos appear in black & white.'},
  {id:2, name:'Expert',       desc:'Pieces of the logo are missing.'},
  {id:3, name:'Champion',     desc:'Only a tight crop of the logo.'},
];
const CLIMB = {id:4, name:'Climb the Ranks', desc:'Starts easy - gets harder every 3 questions.'};
const QUESTIONS = 12;
const TIME_PER_Q = 15;
const MULT = [1, 1.25, 1.5, 2];
const ALL_LOGOS = CATEGORIES.flatMap(c => c.logos.map(l => ({...l, cat:c.id})));
const TOTAL_LOGOS = ALL_LOGOS.length;

const app = document.getElementById('app');
const qp = new URLSearchParams(location.search);
const DEMO = qp.get('demo');

const state = {
  screen:'home', catId: qp.get('cat') || 'mix', level: qp.has('level') ? +qp.get('level') : 4,
  qi:0, score:0, streak:0, bestStreak:0, correct:0, order:[], answered:false, timer:null, tEnd:0,
};

/* ---------- seeded rng (reproducible rounds + screenshots) ---------- */
function hash(s){let h=1779033703^s.length;for(let i=0;i<s.length;i++){h=Math.imul(h^s.charCodeAt(i),3432918353);h=h<<13|h>>>19;}return h>>>0;}
function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
let rng = Math.random;

function poolFor(catId){
  if (catId==='mix') return ALL_LOGOS;
  const c = CATEGORIES.find(c=>c.id===catId);
  return c ? c.logos.map(l=>({...l, cat:c.id})) : ALL_LOGOS;
}
function shuffle(arr, rnd){const a=arr.slice();for(let i=a.length-1;i>0;i--){const j=Math.floor(rnd()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}

function levelFor(qIndex){
  if (state.level !== 4) return state.level;           // fixed level
  return Math.min(3, Math.floor(qIndex / 3));           // climb: +1 every 3 questions
}

function catLabel(catId){
  if (catId==='mix') return 'Random Mix';
  const c = CATEGORIES.find(c=>c.id===catId); return c ? c.label : '';
}
function bestKey(){ return 'logoiq_best_' + state.catId + '_' + state.level; }

/* ---------- screens ---------- */
function renderHome(){
  const TILE = {mix:'#F5B93D', auto:'#FF6B6B', tech:'#5B8DEF', food:'#FF9F43', sports:'#2ED573', air:'#37D0B0', hotel:'#C084FC', fashion:'#F472B6'};
  const catChips = [{id:'mix', label:'Random Mix', n:TOTAL_LOGOS}]
    .concat(CATEGORIES.map(c=>({id:c.id, label:c.label, n:c.logos.length})))
    .map(c=>{const col=TILE[c.id]||'#5B8DEF'; const letter=c.id==='mix'?'?':c.label[0];
      return `<button class="chip ${state.catId===c.id?'sel':''}" data-cat="${c.id}">
      <span class="ic" style="background:${col}">${letter}</span>${c.label}<span class="n">${c.n}</span></button>`;}).join('');
  const lvlCards = LEVELS.map(l=>`
    <div class="level-card ${state.level===l.id?'sel':''}" data-level="${l.id}">
      <div class="lv">${l.name}<span class="dots">${[0,1,2,3].map(i=>`<i class="${i<=l.id?'on':''}"></i>`).join('')}</span></div>
      <div class="ds">${l.desc}</div>
    </div>`).join('') + `
    <div class="level-card wide ${state.level===4?'sel':''}" data-level="4">
      <div><div class="lv">&#9650; ${CLIMB.name}</div><div class="ds">${CLIMB.desc}</div></div>
      <span class="dots">${[0,1,2,3].map(()=>'<i class="on"></i>').join('')}</span>
    </div>`;
  app.innerHTML = `<div class="screen">
    <div class="brand"><div class="mark">?</div><h1>Logo<span>IQ</span></h1></div>
    <div class="tagline">How many brands can you spot? Pick a lane - or let fate decide.</div>
    <div class="section-label">Category</div>
    <div class="cat-grid">${catChips}</div>
    <div class="section-label">Difficulty</div>
    <div class="level-grid">${lvlCards}</div>
    <button class="cta" id="start">Play &#9654;</button>
    <div class="foot">${TOTAL_LOGOS} logos &middot; ${CATEGORIES.length} categories &middot; ${QUESTIONS} questions per run</div>
  </div>`;
  app.querySelectorAll('[data-cat]').forEach(b=>b.onclick=()=>{state.catId=b.dataset.cat;renderHome();});
  app.querySelectorAll('[data-level]').forEach(b=>b.onclick=()=>{state.level=+b.dataset.level;renderHome();});
  document.getElementById('start').onclick=startGame;
}

function startGame(){
  rng = DEMO ? mulberry32(hash(state.catId+':'+state.level)) : Math.random;
  const pool = poolFor(state.catId);
  const picked = shuffle(pool, rng).slice(0, QUESTIONS);
  state.order = picked;
  state.qi=0; state.score=0; state.streak=0; state.bestStreak=0; state.correct=0;
  state.screen='quiz';
  renderQuestion();
}

function makeOptions(answer){
  const pool = poolFor(state.catId).filter(l=>l.slug!==answer.slug);
  const distract = shuffle(pool, rng).slice(0,3);
  return shuffle([answer, ...distract], rng);
}

function stageHTML(logo, level){
  const r = mulberry32(hash(logo.slug + ':' + state.qi));
  const src = LOGOS[logo.slug];
  if (level===1) return `<div class="logo-stage gray"><img src="${src}" alt="logo"></div>`;
  if (level===2){
    const p = Math.floor(r()*4);
    let patches='';
    if (p===0){ // centre vertical band - always crosses the glyph
      patches=`<div class="patch" style="top:0;bottom:0;width:11%;left:44.5%;"></div>`;
    } else if (p===1){ // off-centre horizontal band: cuts an edge of the glyph, never the whole middle
      const top = r()<0.5 ? '33%' : '58%';
      patches=`<div class="patch" style="left:0;right:0;height:9%;top:${top};"></div>`;
    } else if (p===2){ // circle just off-centre
      const dx=Math.floor(r()*48)-24, dy=Math.floor(r()*48)-24;
      patches=`<div class="patch" style="width:62px;height:62px;border-radius:50%;left:calc(50% - 31px + ${dx}px);top:calc(50% - 31px + ${dy}px);"></div>`;
    } else { // two small circles on the horizontal midline
      patches=`<div class="patch" style="width:48px;height:48px;border-radius:50%;left:30%;top:calc(50% - 24px);"></div>
               <div class="patch" style="width:48px;height:48px;border-radius:50%;right:30%;top:calc(50% - 24px);"></div>`;
    }
    return `<div class="logo-stage"><img src="${src}" alt="logo">${patches}</div>`;
  }
  if (level===3){
    const pick=[-50,-75,-100];                       // centre-weighted: window always overlaps the core mark
    const col=pick[Math.floor(r()*3)], row=pick[Math.floor(r()*3)];
    return `<div class="logo-stage crop"><img src="${src}" alt="logo" style="left:${col}%;top:${row}%;"></div>`;
  }
  return `<div class="logo-stage"><img src="${src}" alt="logo"></div>`;
}

function renderQuestion(){
  clearInterval(state.timer);
  state.answered=false;
  const logo = state.order[state.qi];
  const lvl = levelFor(state.qi);
  const opts = makeOptions(logo);
  const lvlName = LEVELS[lvl].name;
  app.innerHTML = `<div class="screen">
    <div class="qtop">
      <button class="back" id="quit">&#8592;</button>
      <div class="qmeta"><div class="cat">${catLabel(state.catId)}</div>
        <div class="qnum">Question ${state.qi+1} of ${state.order.length}</div></div>
      <div class="score-pill">${state.score}<span class="streak ${state.streak>=3?'hot':''}">Streak ${state.streak}</span></div>
    </div>
    <div class="timerbar"><i id="tbar"></i></div>
    <div class="lvl-badge">Difficulty &middot; <b>${lvlName}</b></div>
    <div class="stage-wrap" id="stagewrap">${stageHTML(logo, lvl)}</div>
    <div class="options">${opts.map((o,i)=>`
      <button class="opt" data-slug="${o.slug}"><span class="key">${'ABCD'[i]}</span>${o.name}</button>`).join('')}
    </div>
  </div>`;
  document.getElementById('quit').onclick=()=>{clearInterval(state.timer);state.screen='home';renderHome();};
  app.querySelectorAll('.opt').forEach(b=>b.onclick=()=>answer(b, logo, lvl));
  startTimer(logo, lvl);
  if (qp.get('reveal')==='1'){ const b=[...app.querySelectorAll('.opt')].find(x=>x.dataset.slug===logo.slug); if(b) answer(b, logo, lvl); }
}

function startTimer(logo, lvl){
  const bar = document.getElementById('tbar');
  const t0 = Date.now(); state.tEnd = t0 + TIME_PER_Q*1000;
  state.timeLeft = TIME_PER_Q;
  state.timer = setInterval(()=>{
    const left = Math.max(0, state.tEnd - Date.now());
    state.timeLeft = left/1000;
    bar.style.width = (left/(TIME_PER_Q*10)) + '%';
    bar.classList.toggle('low', left < 5000);
    if (left<=0){ clearInterval(state.timer); answer(null, logo, lvl); }
  }, 50);
}

function answer(btn, logo, lvl){
  if (state.answered) return;
  state.answered=true;
  clearInterval(state.timer);
  const right = btn && btn.dataset.slug===logo.slug;
  const buttons = app.querySelectorAll('.opt');
  buttons.forEach(b=>{
    b.disabled=true;
    if (b.dataset.slug===logo.slug) b.classList.add('correct');
    else if (b===btn) b.classList.add('wrong');
    else b.classList.add('dim');
  });
  if (right){
    state.correct++; state.streak++;
    state.bestStreak=Math.max(state.bestStreak,state.streak);
    const pts = Math.round((100 + state.timeLeft*6) * MULT[lvl]) + (state.streak>1 ? state.streak*10 : 0);
    state.score += pts;
    toast(`Correct! +${pts}`, false);
  } else {
    state.streak=0;
    toast(btn ? `It's ${logo.name}` : `Time up - ${logo.name}`, true);
  }
  const wrap = document.getElementById('stagewrap');   // reveal the full logo after each answer
  if (wrap){ wrap.innerHTML = stageHTML(logo, 0); const st=wrap.firstElementChild; if(st) st.classList.add('reveal'); }
  const pill = app.querySelector('.score-pill');
  if (pill) pill.firstChild.textContent = state.score;
  setTimeout(()=>{
    if (DEMO) return;
    state.qi++;
    if (state.qi >= state.order.length) renderResults();
    else renderQuestion();
  }, 1150);
}

function toast(msg, bad){
  const t=document.createElement('div');
  t.className='toast'+(bad?' bad':''); t.textContent=msg;
  document.body.appendChild(t);
  setTimeout(()=>t.remove(), 950);
}

function renderResults(){
  state.screen='results';
  const total = state.order.length;
  const acc = Math.round(state.correct/total*100);
  const rank = acc>=90?'Champion':acc>=70?'Expert':acc>=50?'Intermediate':acc>=30?'Amateur':'Rookie';
  const key = bestKey();
  const prev = +(localStorage.getItem(key)||0);
  const isBest = state.score>prev;
  if (isBest) localStorage.setItem(key, state.score);
  app.innerHTML = `<div class="screen">
    <div class="brand"><div class="mark">?</div><h1>Logo<span>IQ</span></h1></div>
    <div class="res-card">
      <div class="res-rank">${catLabel(state.catId)} &middot; ${state.level===4?'Climb the Ranks':LEVELS[state.level].name}<b>${rank}</b></div>
      <div class="res-score">${state.score}</div>
      <div class="res-sub">points${isBest?' &middot; new personal best!':''}</div>
      ${isBest?'<div class="best-tag">&#11088; NEW BEST</div>':''}
      <div class="res-stats">
        <div class="res-stat"><div class="v">${state.correct}/${total}</div><div class="k">CORRECT</div></div>
        <div class="res-stat"><div class="v">${acc}%</div><div class="k">ACCURACY</div></div>
        <div class="res-stat"><div class="v">${state.bestStreak}</div><div class="k">BEST STREAK</div></div>
      </div>
      <div class="res-actions">
        <button class="cta" id="again">Play again &#9654;</button>
        <button class="btn2" id="change">Change category / level</button>
      </div>
    </div>
  </div>`;
  document.getElementById('again').onclick=startGame;
  document.getElementById('change').onclick=()=>{state.screen='home';renderHome();};
  if (acc>=70) confetti();
}

function confetti(){
  const colors=['#F5B93D','#37D0B0','#FF5D6C','#7AA2FF','#C084FC'];
  for(let i=0;i<60;i++){
    const c=document.createElement('div');
    c.className='confetti';
    c.style.left=Math.random()*100+'vw';
    c.style.background=colors[i%colors.length];
    c.style.animationDuration=(2.2+Math.random()*1.8)+'s';
    c.style.animationDelay=(Math.random()*0.6)+'s';
    c.style.transform='rotate('+Math.random()*360+'deg)';
    document.body.appendChild(c);
    setTimeout(()=>c.remove(), 5000);
  }
}

/* ---------- demo routes for preview screenshots ---------- */
if (DEMO==='grid'){
  // test harness: render every bundled logo through the real stageHTML at a given level
  const lvl = qp.has('level') ? +qp.get('level') : 3;
  const qs = (qp.get('q')||'0').split(',').map(Number);
  let html='';
  for (const q of qs){
    state.qi=q;
    for (const c of CATEGORIES) for (const l of c.logos) html += stageHTML(l, lvl);
  }
  app.style.maxWidth='none';
  app.style.padding='0';
  app.innerHTML = `<div style="display:grid;grid-template-columns:repeat(10,228px);gap:0;background:#0D1120;">${html}</div>`;
  state.qi=0;
} else if (DEMO==='quiz'){
  startGame();
  const want = qp.has('q') ? +qp.get('q') : 0;
  while (state.qi < want && state.qi < state.order.length-1){ state.qi++; }
  renderQuestion();
  clearInterval(state.timer);           // freeze timer for the screenshot
  const bar=document.getElementById('tbar'); if(bar) bar.style.width='62%';
} else if (DEMO==='results'){
  state.catId = qp.get('cat')||'mix'; state.level = qp.has('level')?+qp.get('level'):4;
  state.order = poolFor(state.catId).slice(0,QUESTIONS);
  state.score=2140; state.correct=10; state.bestStreak=6;
  renderResults();
} else {
  renderHome();
}
})();
