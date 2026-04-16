/* =========================================================
   N-Queens Visualizer — Backtracking Engine
   ========================================================= */

'use strict';

// ── State ─────────────────────────────────────────────────────
let N = 6;
let allSolutions = [], allSteps = [], currentSolIdx = 0;
let isRunning = false, stopRequested = false;
let stepIdx = 0;
let queens = []; // queens[row] = col, -1 if none
let board = [];  // 2D DOM cells

// ── DOM ───────────────────────────────────────────────────────
const boardEl      = document.getElementById('board');
const nSel         = document.getElementById('nSelect');
const startBtn     = document.getElementById('startBtn');
const stopBtn      = document.getElementById('stopBtn');
const stepBtn      = document.getElementById('stepBtn');
const prevSolBtn   = document.getElementById('prevSolBtn');
const nextSolBtn   = document.getElementById('nextSolBtn');
const resetBtn     = document.getElementById('resetBtn');
const speedSl      = document.getElementById('speedSlider');
const stepsEl      = document.getElementById('stepsCount');
const backtrEl     = document.getElementById('backtrackCount');
const solIdxEl     = document.getElementById('solIdx');
const solTotEl     = document.getElementById('solTotal');
const totalSolsEl  = document.getElementById('totalSols');
const galleryEl    = document.getElementById('solutionGallery');
const callStackEl  = document.getElementById('callStack');
const toastEl      = document.getElementById('toast');
const showConflCb  = document.getElementById('showConflicts');
const showAtkCb    = document.getElementById('showAttacks');

// ── Toast ─────────────────────────────────────────────────────
function showToast(msg, type='info', dur=2500) {
  toastEl.textContent = msg;
  toastEl.className = `toast ${type} show`;
  clearTimeout(toastEl._t);
  toastEl._t = setTimeout(() => toastEl.classList.remove('show'), dur);
}

// ── Speed ─────────────────────────────────────────────────────
function getDelay() { return Math.max(30, 700 - speedSl.value * 65); }

// ── Init Board ────────────────────────────────────────────────
function initBoard() {
  N = parseInt(nSel.value);
  queens = new Array(N).fill(-1);
  const cellSize = Math.min(62, Math.floor((window.innerHeight - 260) / N));
  board = [];
  boardEl.innerHTML = '';
  boardEl.style.gridTemplateColumns = `repeat(${N}, ${cellSize}px)`;

  for (let r = 0; r < N; r++) {
    board[r] = [];
    for (let c = 0; c < N; c++) {
      const sq = document.createElement('div');
      sq.className = `sq ${(r+c)%2===0?'light':'dark'}`;
      sq.style.width = sq.style.height = cellSize+'px';
      sq.style.fontSize = Math.min(cellSize*0.65, 38)+'px';
      boardEl.appendChild(sq);
      board[r][c] = sq;
    }
  }
  allSolutions=[]; allSteps=[]; currentSolIdx=0; stepIdx=0;
  galleryEl.innerHTML = '<div class="empty-gallery">Run the solver to<br/>see all solutions here</div>';
  callStackEl.innerHTML = '<div class="cs-empty">Stack will show during solving</div>';
  totalSolsEl.textContent = '—';
  stepsEl.textContent = backtrEl.textContent = '0';
  solIdxEl.textContent = solTotEl.textContent = '—';
  prevSolBtn.disabled = nextSolBtn.disabled = true;
}

nSel.addEventListener('change', () => { if(!isRunning) initBoard(); });
resetBtn.addEventListener('click', () => { if(!isRunning) initBoard(); });

// ── Place / Remove Queen ──────────────────────────────────────
function placeQueen(r, c) {
  queens[r] = c;
  const sq = board[r][c];
  const piece = document.createElement('div');
  piece.className = 'queen-piece';
  piece.textContent = '♛';
  piece.dataset.row = r;
  sq.appendChild(piece);
  if (showAtkCb.checked) markAttacks(r, c, true);
  if (showConflCb.checked) checkAllConflicts();
}

function removeQueen(r) {
  const c = queens[r];
  if (c < 0) return;
  const sq = board[r][c];
  const piece = sq.querySelector('.queen-piece');
  if (piece) piece.remove();
  queens[r] = -1;
  if (showAtkCb.checked) clearAllHighlights();
  if (showConflCb.checked) checkAllConflicts();
  if (showAtkCb.checked) {
    for (let row = 0; row < N; row++) {
      if (queens[row] >= 0) markAttacks(row, queens[row], true);
    }
  }
}

function markAttacks(qr, qc, mark) {
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      if (r===qr||c===qc||Math.abs(r-qr)===Math.abs(c-qc)) {
        if(mark) board[r][c].classList.add('attack-line');
        else board[r][c].classList.remove('attack-line');
      }
    }
  }
}

function clearAllHighlights() {
  for (let r=0;r<N;r++) for(let c=0;c<N;c++) {
    board[r][c].classList.remove('attack','attack-line','safe-target');
  }
}

function checkAllConflicts() {
  // Reset conflict state
  for(let r=0;r<N;r++) if(queens[r]>=0) {
    const p=board[r][queens[r]].querySelector('.queen-piece');
    if(p) p.classList.remove('conflict','solved');
  }
  // Mark conflicts
  for(let i=0;i<N;i++) {
    if(queens[i]<0) continue;
    for(let j=i+1;j<N;j++) {
      if(queens[j]<0) continue;
      if(queens[i]===queens[j]||Math.abs(queens[i]-queens[j])===Math.abs(i-j)) {
        const pi=board[i][queens[i]].querySelector('.queen-piece');
        const pj=board[j][queens[j]].querySelector('.queen-piece');
        if(pi) pi.classList.add('conflict');
        if(pj) pj.classList.add('conflict');
      }
    }
  }
}

// ── Validity Check ────────────────────────────────────────────
function isSafe(row, col, placement) {
  for (let r = 0; r < row; r++) {
    if (placement[r]===col) return false;
    if (Math.abs(placement[r]-col)===Math.abs(r-row)) return false;
  }
  return true;
}

// ── Pre-compute All Solutions + Steps ─────────────────────────
function preCompute() {
  const solutions = [], steps = [];
  const placement = new Array(N).fill(-1);
  let stepCount = 0, backCount = 0;

  function backtrack(row) {
    if (row === N) {
      solutions.push([...placement]);
      steps.push({ type:'solution', placement:[...placement] });
      return;
    }
    for (let col = 0; col < N; col++) {
      if (isSafe(row, col, placement)) {
        placement[row] = col;
        steps.push({ type:'place', row, col, step: ++stepCount });
        backtrack(row+1);
        steps.push({ type:'remove', row, col, backtrack: ++backCount });
        placement[row] = -1;
      } else {
        steps.push({ type:'conflict', row, col });
      }
    }
  }
  backtrack(0);
  return { solutions, steps };
}

// ── Animate Steps ─────────────────────────────────────────────
function updateCallStack(row, col, type) {
  const frames = callStackEl.querySelectorAll('.cs-frame');
  if (type==='place') {
    const f = document.createElement('div');
    f.className = 'cs-frame active';
    f.textContent = `solve(row=${row}) → col=${col}`;
    f.dataset.row = row;
    callStackEl.appendChild(f);
    callStackEl.scrollTop = callStackEl.scrollHeight;
    if (callStackEl.children.length > 12) callStackEl.removeChild(callStackEl.firstChild);
  } else if (type==='remove') {
    // find last frame for this row and mark fail
    const all = [...callStackEl.querySelectorAll(`.cs-frame[data-row="${row}"]`)];
    const last = all[all.length-1];
    if (last) { last.className='cs-frame fail'; last.textContent=`backtrack(row=${row}) ✗`; }
  } else if (type==='solution') {
    const f = document.createElement('div');
    f.className='cs-frame ok';
    f.textContent = `✓ SOLUTION FOUND!`;
    callStackEl.appendChild(f);
    callStackEl.scrollTop = callStackEl.scrollHeight;
  }
}

async function animateSteps() {
  const { solutions, steps } = preCompute();
  allSolutions = solutions;
  allSteps = steps;
  totalSolsEl.textContent = solutions.length;

  let sc=0, bc=0;
  clearAllHighlights();
  queens = new Array(N).fill(-1);
  for(let r=0;r<N;r++) for(let c=0;c<N;c++) { const p=board[r][c].querySelector('.queen-piece'); if(p) p.remove(); }

  for (let i = 0; i < steps.length; i++) {
    if (stopRequested) break;
    const s = steps[i];

    if (s.type === 'place') {
      sc++;
      // Update board
      queens[s.row] = s.col;
      const sq = board[s.row][s.col];
      const piece = document.createElement('div');
      piece.className = 'queen-piece';
      piece.textContent = '♛';
      piece.dataset.row = s.row;
      sq.appendChild(piece);
      if (showAtkCb.checked) { clearAllHighlights(); for(let r2=0;r2<N;r2++) if(queens[r2]>=0) markAttacks(r2,queens[r2],true); }
      stepsEl.textContent = sc;
      updateCallStack(s.row, s.col, 'place');
      await sleep(getDelay());

    } else if (s.type === 'remove') {
      bc++;
      const c = queens[s.row];
      if (c >= 0) {
        const sq = board[s.row][c];
        const piece = sq.querySelector('.queen-piece');
        if (piece) piece.remove();
        queens[s.row] = -1;
      }
      if (showAtkCb.checked) { clearAllHighlights(); for(let r2=0;r2<N;r2++) if(queens[r2]>=0) markAttacks(r2,queens[r2],true); }
      backtrEl.textContent = bc;
      updateCallStack(s.row, s.col, 'remove');
      await sleep(getDelay() * .6);

    } else if (s.type === 'solution') {
      updateCallStack(0, 0, 'solution');
      solIdxEl.textContent = allSolutions.indexOf(s.placement)+1;
      solTotEl.textContent = allSolutions.length;
      // flash board
      for(let r=0;r<N;r++) if (queens[r]>=0) {
        const p=board[r][queens[r]].querySelector('.queen-piece');
        if(p) { p.classList.remove('conflict'); p.classList.add('solved'); }
      }
      addToGallery(s.placement, allSolutions.length);
      await sleep(getDelay() * 4);
      // un-flash
      for(let r=0;r<N;r++) if(queens[r]>=0) {
        const p=board[r][queens[r]].querySelector('.queen-piece');
        if(p) p.classList.remove('solved');
      }
    }
  }
  isRunning=false; setRunningUI(false);
  showToast(`Done! Found ${solutions.length} solution${solutions.length!==1?'s':''}! 🎉`, 'success', 4000);
  prevSolBtn.disabled = allSolutions.length===0;
  nextSolBtn.disabled = allSolutions.length===0;
  currentSolIdx = allSolutions.length-1;
  displaySolution(allSolutions.length-1);
}

function sleep(ms) { return new Promise(res => setTimeout(res, ms)); }

// ── Solution Gallery ──────────────────────────────────────────
function addToGallery(placement, solNum) {
  if (galleryEl.querySelector('.empty-gallery')) galleryEl.innerHTML='';

  const item = document.createElement('div');
  item.className = 'solution-thumb';
  item.dataset.solIdx = solNum-1;

  // Mini board
  const mini = document.createElement('div');
  mini.className = 'thumb-mini';
  const sz = Math.max(4, Math.min(8, Math.floor(36/N)));
  mini.style.gridTemplateColumns = `repeat(${N}, ${sz}px)`;
  mini.style.width = `${N*sz+N-1}px`;

  for (let r=0;r<N;r++) for(let c=0;c<N;c++) {
    const cell = document.createElement('div');
    cell.className = `thumb-cell ${(r+c)%2===0?'':'th-dark'}`;
    cell.style.width=cell.style.height=sz+'px';
    if (placement[r]===c) {
      cell.classList.add('th-queen');
      cell.style.background='hsl(280,100%,65%)';
    }
    mini.appendChild(cell);
  }

  const info = document.createElement('div');
  info.innerHTML = `<div class="thumb-label">Solution #${solNum}</div><div class="thumb-sublabel">[${placement.join(', ')}]</div>`;

  item.appendChild(mini); item.appendChild(info);
  item.addEventListener('click', () => displaySolution(solNum-1));
  galleryEl.appendChild(item);
  galleryEl.scrollTop = galleryEl.scrollHeight;
}

function displaySolution(idx) {
  if (!allSolutions.length) return;
  currentSolIdx = Math.max(0, Math.min(allSolutions.length-1, idx));
  const sol = allSolutions[currentSolIdx];

  // Clear board
  queens = new Array(N).fill(-1);
  for(let r=0;r<N;r++) for(let c=0;c<N;c++) {
    const p=board[r][c].querySelector('.queen-piece'); if(p) p.remove();
    board[r][c].classList.remove('attack','attack-line','safe-target');
  }

  // Place queens
  for (let r=0;r<N;r++) {
    queens[r]=sol[r];
    const piece=document.createElement('div');
    piece.className='queen-piece solved'; piece.textContent='♛'; piece.dataset.row=r;
    board[r][sol[r]].appendChild(piece);
  }
  if (showAtkCb.checked) { clearAllHighlights(); for(let r=0;r<N;r++) markAttacks(r,sol[r],true); }

  // Gallery highlight
  galleryEl.querySelectorAll('.solution-thumb').forEach(el => {
    el.classList.toggle('active', parseInt(el.dataset.solIdx)===currentSolIdx);
  });
  solIdxEl.textContent = currentSolIdx+1;
  solTotEl.textContent = allSolutions.length;
}

// ── Step Mode ─────────────────────────────────────────────────
let stepSolver = null;

stepBtn.addEventListener('click', () => {
  if (isRunning) return;

  if (stepIdx === 0) {
    const res = preCompute();
    allSolutions = res.solutions;
    allSteps = res.steps;
    totalSolsEl.textContent = allSolutions.length;
    queens = new Array(N).fill(-1);
    for(let r=0;r<N;r++) for(let c=0;c<N;c++) {
      const p=board[r][c].querySelector('.queen-piece'); if(p) p.remove();
      board[r][c].classList.remove('attack','attack-line');
    }
    callStackEl.innerHTML='<div class="cs-empty">Press ⏭ Step to begin</div>';
    galleryEl.innerHTML='';
    showToast('Step mode: press ⏭ to advance','info');
  }

  if (stepIdx >= allSteps.length) {
    showToast('All steps exhausted, press Reset','info');
    stepIdx=0; return;
  }

  const s = allSteps[stepIdx++];
  let sc=parseInt(stepsEl.textContent)||0, bc=parseInt(backtrEl.textContent)||0;

  if (s.type==='place') {
    sc++;
    queens[s.row]=s.col;
    const sq=board[s.row][s.col];
    const piece=document.createElement('div'); piece.className='queen-piece'; piece.textContent='♛'; piece.dataset.row=s.row;
    sq.appendChild(piece);
    if(showAtkCb.checked){ clearAllHighlights(); for(let r=0;r<N;r++) if(queens[r]>=0) markAttacks(r,queens[r],true); }
    stepsEl.textContent=sc;
    updateCallStack(s.row,s.col,'place');
  } else if (s.type==='remove') {
    bc++;
    const c=queens[s.row];
    if(c>=0){ const p=board[s.row][c].querySelector('.queen-piece'); if(p) p.remove(); queens[s.row]=-1; }
    if(showAtkCb.checked){ clearAllHighlights(); for(let r=0;r<N;r++) if(queens[r]>=0) markAttacks(r,queens[r],true); }
    backtrEl.textContent=bc;
    updateCallStack(s.row,s.col,'remove');
  } else if (s.type==='solution') {
    const solN=allSolutions.findIndex(sol=>sol.every((v,i)=>queens[i]===v))+1||allSolutions.length;
    for(let r=0;r<N;r++) if(queens[r]>=0){ const p=board[r][queens[r]].querySelector('.queen-piece'); if(p){p.classList.remove('conflict');p.classList.add('solved');} }
    addToGallery([...queens], solN);
    updateCallStack(0,0,'solution');
    solIdxEl.textContent=solN; solTotEl.textContent=allSolutions.length;
    showToast(`Solution #${solN} found!`,'success',1500);
  }
});

// ── Navigation ────────────────────────────────────────────────
prevSolBtn.addEventListener('click', () => displaySolution(currentSolIdx-1));
nextSolBtn.addEventListener('click', () => displaySolution(currentSolIdx+1));

// ── Start / Stop ──────────────────────────────────────────────
startBtn.addEventListener('click', async () => {
  if (isRunning) return;
  isRunning=true; stopRequested=false; stepIdx=0;
  setRunningUI(true);
  initBoard();
  await animateSteps();
});

stopBtn.addEventListener('click', () => { stopRequested=true; });

function setRunningUI(running) {
  startBtn.disabled=running; stopBtn.disabled=!running;
  stepBtn.disabled=running; resetBtn.disabled=running;
  nSel.disabled=running;
}

// ── Init ──────────────────────────────────────────────────────
initBoard();
showToast('Select board size & click ▶ Solve to begin!','info',4000);
