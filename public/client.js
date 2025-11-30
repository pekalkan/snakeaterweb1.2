const socket = io();
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const miniCanvas = document.getElementById('minimap');
const miniCtx = miniCanvas.getContext('2d');

const gameOverScreen = document.getElementById('gameOverScreen');
const finalScoreText = document.getElementById('finalScore');
const respawnBtn = document.getElementById('respawnBtn');
const statsBox = document.getElementById('stats');
const netBox = document.getElementById('netStatus');
const speedBox = document.getElementById('speedStatus');
const shrinkWarningBox = document.getElementById('shrinkWarning');

canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

let mouseX = 0, mouseY = 0, isBoosting = false;

window.addEventListener('mousemove', e => { mouseX = e.clientX; mouseY = e.clientY; });
window.addEventListener('mousedown', () => isBoosting = true);
window.addEventListener('mouseup', () => isBoosting = false);
window.addEventListener('keydown', e => {
    if(e.code === 'Space') isBoosting = true;
    if(e.code === 'KeyE') socket.emit('cast_net');
});
window.addEventListener('keyup', e => { if(e.code === 'Space') isBoosting = false; });

respawnBtn.addEventListener('click', () => {
    socket.emit('respawn');
    gameOverScreen.classList.add('hidden'); 
});

setInterval(() => {
    const angle = Math.atan2(mouseY - canvas.height/2, mouseX - canvas.width/2);
    socket.emit('input', { angle, isBoosting });
}, 1000/60);

socket.on('game_over', (data) => {
    finalScoreText.innerText = 'Final Score: ' + Math.floor(data.score);
    gameOverScreen.classList.remove('hidden'); 
});

socket.on('state', (state) => {
    const me = state.players[socket.id];
    
    // --- UPDATED: Warning logic uses the specific flag for 3-second display ---
    if (state.shouldShowWarning) {
        shrinkWarningBox.style.display = 'block';
    } else {
        shrinkWarningBox.style.display = 'none';
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

    // Render Game
    ctx.fillStyle = '#12161c';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    
    if (me && !me.isDead) {
        ctx.translate(canvas.width/2 - me.x, canvas.height/2 - me.y);
    } else {
        ctx.translate(canvas.width/2, canvas.height/2); 
    }

    ctx.beginPath();
    ctx.arc(0, 0, state.mapRadius, 0, Math.PI*2);
    ctx.strokeStyle = '#555';
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
        ctx.font = '12px Arial';
        ctx.fillText(id.substring(0,4), p.x, p.y - 20);
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
    const scale = 150 / (state.mapRadius * 2); 
    const cx = 75, cy = 75;

    miniCtx.strokeStyle = '#888';
    miniCtx.beginPath();
    miniCtx.arc(cx, cy, state.mapRadius * scale, 0, Math.PI*2);
    miniCtx.stroke();

    for(let id in state.players) {
        let p = state.players[id];
        if(p.isDead) continue;
        
        miniCtx.fillStyle = (id === socket.id) ? '#0f0' : '#f00';
        miniCtx.beginPath();
        miniCtx.arc(cx + p.x*scale, cy + p.y*scale, 2, 0, Math.PI*2);
        miniCtx.fill();
    }
}