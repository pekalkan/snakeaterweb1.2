const socket = io();
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const miniCanvas = document.getElementById('minimap');
const miniCtx = miniCanvas.getContext('2d');

// Screens
const loginScreen = document.getElementById('loginScreen');
const lobbyScreen = document.getElementById('lobbyScreen');
const gameUI = document.getElementById('gameUI');
const gameOverScreen = document.getElementById('gameOverScreen');
const minimapEl = document.getElementById('minimap');

// Inputs
const usernameInput = document.getElementById('usernameInput');
const joinBtn = document.getElementById('joinBtn');
const readyBtn = document.getElementById('readyBtn');
const lobbyBtn = document.getElementById('lobbyBtn'); // Changed from respawnBtn
const playerList = document.getElementById('playerList');

// UI Stats
const statsBox = document.getElementById('stats');
const netBox = document.getElementById('netStatus');
const speedBox = document.getElementById('speedStatus');
const shrinkWarningBox = document.getElementById('shrinkWarning');
const shrinkStoppedBox = document.getElementById('shrinkStopped');
const finalScoreText = document.getElementById('finalScore');

canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

let mouseX = 0, mouseY = 0, isBoosting = false;
let stopMessageShown = false; 

// --- LOGIN ---
joinBtn.addEventListener('click', () => {
    const name = usernameInput.value || "Guest";
    socket.emit('join_game', name);
    loginScreen.style.display = 'none';
    lobbyScreen.style.display = 'flex';
});

// --- LOBBY ---
readyBtn.addEventListener('click', () => {
    socket.emit('player_ready');
    readyBtn.style.background = '#888';
});

socket.on('lobby_state', (players) => {
    playerList.innerHTML = '';
    players.forEach(p => {
        const row = document.createElement('div');
        row.className = 'player-row';
        const statusClass = p.isReady ? 'ready-green' : 'ready-red';
        const statusText = p.isReady ? 'READY' : 'WAITING';
        row.innerHTML = `<span>${p.username}</span> <span class="ready-status ${statusClass}">${statusText}</span>`;
        playerList.appendChild(row);
    });
});

// --- GAME START ---
socket.on('game_started', () => {
    lobbyScreen.style.display = 'none';
    gameOverScreen.style.display = 'none'; 
    gameUI.style.display = 'block';
    minimapEl.style.display = 'block';
});

// --- LEAVE TO LOBBY BUTTON ---
lobbyBtn.addEventListener('click', () => {
    socket.emit('leave_game'); // Tell server we left
    
    // Switch to Lobby UI immediately
    gameUI.style.display = 'none';
    minimapEl.style.display = 'none';
    gameOverScreen.style.display = 'none';
    lobbyScreen.style.display = 'flex';
    
    // Reset Ready Button
    readyBtn.style.background = '#44aa44';
});

// --- GAME OVER ---
socket.on('game_over', (data) => {
    finalScoreText.innerText = 'Final Score: ' + Math.floor(data.score);
    gameOverScreen.style.display = 'flex';
});

// --- CONTROLS ---
window.addEventListener('mousemove', e => { mouseX = e.clientX; mouseY = e.clientY; });
window.addEventListener('mousedown', () => isBoosting = true);
window.addEventListener('mouseup', () => isBoosting = false);
window.addEventListener('keydown', e => {
    if(e.code === 'Space') isBoosting = true;
    if(e.code === 'KeyE') socket.emit('cast_net');
});
window.addEventListener('keyup', e => { if(e.code === 'Space') isBoosting = false; });

setInterval(() => {
    const angle = Math.atan2(mouseY - canvas.height/2, mouseX - canvas.width/2);
    socket.emit('input', { angle, isBoosting });
}, 1000/60);

// --- RENDER ---
socket.on('game_state', (state) => {
    const me = state.players[socket.id];
    
    if (state.mapRadius > 1000) {
        stopMessageShown = false;
        shrinkStoppedBox.style.display = 'none';
    }

    if (state.isMapFixed) {
        shrinkWarningBox.style.display = 'none'; 
        if (!stopMessageShown) {
            shrinkStoppedBox.style.display = 'block';
            stopMessageShown = true;
            setTimeout(() => { shrinkStoppedBox.style.display = 'none'; }, 3000);
        }
    } else {
        shrinkWarningBox.style.display = state.shouldShowWarning ? 'block' : 'none';
    }

    if(me && !me.isDead) {
        statsBox.innerText = `Length: ${Math.floor(me.length)} | Score: ${me.score}`;
        
        if (me.currentNetCooldown <= 0) {
            netBox.innerText = "Net: READY (E)";
            netBox.style.color = "#0f0"; 
        } else {
            const secondsLeft = Math.ceil(me.currentNetCooldown / 1000);
            netBox.innerText = `Net: ${secondsLeft}s`;
            netBox.style.color = "#ff4444"; 
        }

        if (isBoosting) {
             speedBox.style.color = "gold";
             speedBox.innerText = "Speed: BOOSTING!";
        } else {
             speedBox.style.color = "white";
             speedBox.innerText = "Speed: Ready (Space)";
        }
    }

    ctx.fillStyle = '#12161c';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    
    if (me && !me.isDead) {
        ctx.translate(canvas.width/2 - me.x, canvas.height/2 - me.y);
    } else {
        // If dead, center camera on map center or keep last pos (here map center)
        ctx.translate(canvas.width/2, canvas.height/2); 
    }

    ctx.save();
    ctx.beginPath();
    ctx.arc(0, 0, state.mapRadius, 0, Math.PI*2);
    ctx.rect(-20000, -20000, 40000, 40000);
    ctx.fillStyle = 'rgba(75, 0, 130, 0.25)';
    ctx.fill('evenodd');
    ctx.restore();

    ctx.beginPath();
    ctx.arc(0, 0, state.mapRadius, 0, Math.PI*2);
    ctx.strokeStyle = '#8844ff';
    ctx.lineWidth = 5;
    ctx.stroke();

    state.activeMines.forEach(m => drawCircle(m.x, m.y, m.radius, 'rgba(255,0,0,0.3)'));
    state.nets.forEach(n => drawCircle(n.x, n.y, n.radius, 'rgba(138, 43, 226, 0.4)'));

    state.foods.forEach(f => {
        let color = '#fff';
        if(f.type === 'boost') color = 'gold';
        if(f.type === 'shield') color = '#0f0';
        if(f.type === 'mine') color = '#f00';
        drawCircle(f.x, f.y, f.radius, color);
    });

    for(let id in state.players) {
        let p = state.players[id];
        if (p.isDead) continue; 

        let color = (id === socket.id) ? '#3cbe5a' : '#5a90be';
        if(p.invulnerable) color = '#0f0';
        
        p.points.forEach(pt => drawCircle(pt.x, pt.y, p.thickness, color));
        drawCircle(p.x, p.y, p.thickness+2, '#fff'); 
        
        ctx.fillStyle = 'white';
        ctx.font = 'bold 14px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(p.username, p.x, p.y - 25);
    }
    ctx.restore();

    if(me && !me.isDead) drawMinimap(state, me);
});

function drawCircle(x, y, r, color) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI*2);
    ctx.fillStyle = color;
    ctx.fill();
}

function drawMinimap(state, me) {
    miniCtx.clearRect(0,0,150,150);
    const scale = 150 / (6000 * 2); 
    const cx = 75, cy = 75;

    miniCtx.strokeStyle = '#8844ff';
    miniCtx.beginPath();
    miniCtx.arc(cx, cy, state.mapRadius * scale, 0, Math.PI*2);
    miniCtx.stroke();
    
    miniCtx.fillStyle = 'rgba(75, 0, 130, 0.3)';
    miniCtx.fill(); 

    for(let id in state.players) {
        let p = state.players[id];
        if(p.isDead) continue;
        
        miniCtx.fillStyle = (id === socket.id) ? '#0f0' : '#f00';
        miniCtx.beginPath();
        miniCtx.arc(cx + p.x*scale, cy + p.y*scale, 2, 0, Math.PI*2);
        miniCtx.fill();
    }
}