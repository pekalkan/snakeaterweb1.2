const socket = io();
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const miniCanvas = document.getElementById('minimap');
const miniCtx = miniCanvas.getContext('2d');

canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

let mouseX = 0, mouseY = 0, isBoosting = false;

// Input Handling
window.addEventListener('mousemove', e => { mouseX = e.clientX; mouseY = e.clientY; });
window.addEventListener('mousedown', () => isBoosting = true);
window.addEventListener('mouseup', () => isBoosting = false);
window.addEventListener('keydown', e => {
    if(e.code === 'Space') isBoosting = true;
    if(e.code === 'KeyE') socket.emit('cast_net');
});
window.addEventListener('keyup', e => { if(e.code === 'Space') isBoosting = false; });

// Send Input Loop
setInterval(() => {
    const angle = Math.atan2(mouseY - canvas.height/2, mouseX - canvas.width/2);
    socket.emit('input', { angle, isBoosting });
}, 1000/60);

// Game Rendering
socket.on('state', (state) => {
    const me = state.players[socket.id];
    if(!me) return;

    // Update UI
    document.getElementById('stats').innerText = `Length: ${Math.floor(me.length)} | Score: ${me.score}`;

    // Clear Screen
    ctx.fillStyle = '#12161c';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    // Center Camera on Player
    ctx.translate(canvas.width/2 - me.x, canvas.height/2 - me.y);

    // Draw Map Boundary
    ctx.beginPath();
    ctx.arc(0, 0, state.mapRadius, 0, Math.PI*2);
    ctx.strokeStyle = '#555';
    ctx.lineWidth = 5;
    ctx.stroke();

    // Draw Objects
    state.activeMines.forEach(m => drawCircle(m.x, m.y, m.radius, 'rgba(255,0,0,0.3)'));
    state.nets.forEach(n => drawCircle(n.x, n.y, n.radius, 'rgba(138, 43, 226, 0.4)'));

    state.foods.forEach(f => {
        let color = '#fff';
        if(f.type === 'boost') color = 'gold';
        if(f.type === 'shield') color = '#0f0';
        if(f.type === 'mine') color = '#f00';
        drawCircle(f.x, f.y, f.radius, color);
    });

    // Draw Snakes
    for(let id in state.players) {
        let p = state.players[id];
        let color = (id === socket.id) ? '#3cbe5a' : '#5a90be';
        if(p.invulnerable) color = '#0f0';
        
        // Draw Body Segments
        p.points.forEach(pt => drawCircle(pt.x, pt.y, p.thickness, color));
        // Draw Head
        drawCircle(p.x, p.y, p.thickness+2, '#fff'); 
        
        // Draw Name/ID
        ctx.fillStyle = 'white';
        ctx.font = '12px Arial';
        ctx.fillText(id.substring(0,4), p.x, p.y - 20);
    }
    ctx.restore();

    // Draw Minimap
    drawMinimap(state, me);
});

function drawCircle(x, y, r, color) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI*2);
    ctx.fillStyle = color;
    ctx.fill();
}

function drawMinimap(state, me) {
    miniCtx.clearRect(0,0,150,150);
    // Dynamic Scale for large map
    const scale = 150 / (state.mapRadius * 2); 
    const cx = 75, cy = 75;

    miniCtx.strokeStyle = '#888';
    miniCtx.beginPath();
    miniCtx.arc(cx, cy, state.mapRadius * scale, 0, Math.PI*2);
    miniCtx.stroke();

    for(let id in state.players) {
        let p = state.players[id];
        miniCtx.fillStyle = (id === socket.id) ? '#0f0' : '#f00';
        miniCtx.beginPath();
        miniCtx.arc(cx + p.x*scale, cy + p.y*scale, 2, 0, Math.PI*2);
        miniCtx.fill();
    }
}

// Game Over Handler
socket.on('game_over', (data) => {
    document.getElementById('finalScore').innerText = `Final Score: ${data.score}`;
    document.getElementById('gameOverScreen').classList.add('visible');
});

// Respawn Button
document.getElementById('respawnBtn').addEventListener('click', () => {
    document.getElementById('gameOverScreen').classList.remove('visible');
    socket.emit('respawn');
});