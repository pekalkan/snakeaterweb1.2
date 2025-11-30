const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);

app.use(express.static('public'));

// --- GAME SETTINGS ---
const FPS = 60;
let mapRadius = 6000; // Large Map
const MIN_MAP_RADIUS = 500;
const SHRINK_RATE = 0.5; 
const NET_COOLDOWN_MS = 30000; // 30 Seconds

// --- MATH HELPERS ---
function dist(x1, y1, x2, y2) {
    return Math.hypot(x2 - x1, y2 - y1);
}

// --- CLASSES ---
class Snake {
    constructor(id, x, y) {
        this.id = id;
        this.x = x;
        this.y = y;
        this.angle = Math.random() * Math.PI * 2;
        this.points = [];
        this.length = 50; 
        this.thickness = 12; // Base thickness
        this.score = 0;
        this.speed = 3;
        
        // State
        this.isDead = false;
        
        // Initialize body
        for(let i=0; i<this.length; i++) {
            this.points.push({x: x, y: y});
        }
        
        this.isBoosting = false;
        this.boostTimer = 0;
        this.invulnerable = false;
        this.shieldTimer = 0;
        
        this.poisonTimer = 0; 
        
        // Ability Cooldowns
        this.lastNetTime = 0; 
        this.currentNetCooldown = 0; 
    }

    update() {
        if (this.isDead) return 'dead';

        // Speed Logic
        let currentSpeed = this.speed;
        if (this.isBoosting || this.boostTimer > 0) currentSpeed = 6;
        
        // Handle Effect Timers
        if (this.boostTimer > 0) this.boostTimer--;
        if (this.shieldTimer > 0) {
            this.shieldTimer--;
            if(this.shieldTimer <= 0) this.invulnerable = false;
        }

        // Calculate Net Cooldown for UI
        const now = Date.now();
        const timePassed = now - this.lastNetTime;
        this.currentNetCooldown = Math.max(0, NET_COOLDOWN_MS - timePassed);

        // Dynamic Thickness Logic
        this.thickness = 12 + (this.length * 0.02); 
        if (this.thickness > 35) this.thickness = 35;

        // Movement
        this.x += Math.cos(this.angle) * currentSpeed;
        this.y += Math.sin(this.angle) * currentSpeed;

        // Body Tracking
        this.points.unshift({x: this.x, y: this.y});
        while (this.points.length > this.length) {
            this.points.pop();
        }

        // Poison / Out of Bounds Logic
        if (dist(0,0, this.x, this.y) > mapRadius && !this.invulnerable) {
            this.poisonTimer++;
            if (this.poisonTimer > 300) { // 5 seconds
                return 'die'; 
            }
        } else {
            this.poisonTimer = 0; 
        }
        
        return 'alive';
    }
}

// --- GLOBAL STATE ---
let players = {};
let foods = [];
let activeMines = [];
let nets = [];

// Initial Food Spawn
for(let i=0; i<600; i++) spawnFood();

function spawnFood(x, y, specificType) {
    let spawnX = x;
    let spawnY = y;
    
    if (spawnX === undefined || spawnY === undefined) {
        const angle = Math.random() * Math.PI * 2;
        const r = Math.random() * mapRadius;
        spawnX = Math.cos(angle) * r;
        spawnY = Math.sin(angle) * r;
    }

    let type = 'normal';
    if (specificType) {
        type = specificType;
    } else {
        const typeRoll = Math.random();
        if (typeRoll < 0.05) type = 'boost';
        else if (typeRoll < 0.1) type = 'shield';
        else if (typeRoll < 0.15) type = 'mine';
    }

    foods.push({
        x: spawnX,
        y: spawnY,
        type: type,
        radius: type === 'normal' ? 6 : 10,
        id: Math.random()
    });
}

function scatterFood(x, y) {
    const scatterRange = 40; 
    const offsetX = (Math.random() - 0.5) * scatterRange;
    const offsetY = (Math.random() - 0.5) * scatterRange;
    spawnFood(x + offsetX, y + offsetY, 'normal');
}

function killPlayer(player) {
    if(player.isDead) return;
    
    player.isDead = true;

    // 1. Turn body into scattered food
    for (let i = 0; i < player.points.length; i += 2) {
        const pt = player.points[i];
        scatterFood(pt.x, pt.y);
    }

    // 2. Clear body from screen
    player.points = []; 

    io.to(player.id).emit('game_over', { score: player.score });
}

// --- SOCKET CONNECTION ---
io.on('connection', (socket) => {
    console.log('Player connected:', socket.id);
    players[socket.id] = new Snake(socket.id, 0, 0);

    socket.on('input', (data) => {
        if(players[socket.id] && !players[socket.id].isDead) {
            let p = players[socket.id];
            let diff = data.angle - p.angle;
            while (diff < -Math.PI) diff += Math.PI * 2;
            while (diff > Math.PI) diff -= Math.PI * 2;
            p.angle += Math.sign(diff) * Math.min(Math.abs(diff), 0.1);
            p.isBoosting = data.isBoosting;
        }
    });
    
    socket.on('respawn', () => {
        if (players[socket.id]) {
            let p = players[socket.id];
            p.isDead = false;
            p.x = (Math.random() - 0.5) * 1000;
            p.y = (Math.random() - 0.5) * 1000;
            p.length = 50;
            p.score = 0;
            p.points = [];
            p.poisonTimer = 0;
            p.lastNetTime = 0;
            for(let i=0; i<p.length; i++) p.points.push({x: p.x, y: p.y});
        }
    });

    socket.on('cast_net', () => {
        if(players[socket.id] && !players[socket.id].isDead) {
            let p = players[socket.id];
            
            // --- COOLDOWN CHECK ---
            const now = Date.now();
            if (now - p.lastNetTime > NET_COOLDOWN_MS) { 
                p.lastNetTime = now;
                
                nets.push({
                    x: p.x + Math.cos(p.angle) * 150,
                    y: p.y + Math.sin(p.angle) * 150,
                    radius: 100,
                    owner: p.id,
                    timer: 120 
                });
            }
        }
    });

    socket.on('disconnect', () => {
        delete players[socket.id];
    });
});

// --- GAME LOOP ---
setInterval(() => {
    if(mapRadius > MIN_MAP_RADIUS) mapRadius -= SHRINK_RATE;

    for (let id in players) {
        let p = players[id];
        
        if (p.isDead) continue; 

        const status = p.update();
        if (status === 'die') {
            killPlayer(p);
            continue;
        }

        // Check Food
        for(let i=foods.length-1; i>=0; i--) {
            let f = foods[i];
            if(dist(p.x, p.y, f.x, f.y) < p.thickness + f.radius) {
                if(f.type === 'normal') { p.length += 5; p.score += 10; }
                if(f.type === 'boost') p.boostTimer = 300;
                if(f.type === 'shield') { p.invulnerable = true; p.shieldTimer = 300; }
                if(f.type === 'mine') activeMines.push({x: f.x, y: f.y, radius: 150, timer: 180}); 
                
                foods.splice(i, 1);
                spawnFood();
            }
        }

        // --- CHECK NETS (FIXED) ---
        for (let n of nets) {
            // FIXED: Net ignores its owner
            if (n.owner !== p.id) {
                if (dist(p.x, p.y, n.x, n.y) < n.radius) {
                    if (!p.invulnerable) {
                        p.length -= 1.0; 
                        if (p.length < 10) killPlayer(p);
                    }
                }
            }
        }

        // Check Collision with Other Snakes
        for(let otherId in players) {
            if(id === otherId) continue;
            let enemy = players[otherId];
            if(enemy.isDead || p.invulnerable) continue;

            let crashed = false;
            for(let i=0; i<enemy.points.length; i++) {
                if(dist(p.x, p.y, enemy.points[i].x, enemy.points[i].y) < p.thickness + enemy.thickness) {
                    crashed = true;
                    break;
                }
            }

            if (crashed) {
                killPlayer(p); 
                if(!enemy.isDead) enemy.score += 100;
                break;
            }
        }
    }

    // Update Mines
    for(let i=activeMines.length-1; i>=0; i--) {
        activeMines[i].timer--;
        if(activeMines[i].timer <= 0) {
            // Explode
            for(let id in players) {
                let p = players[id];
                if(p.isDead || p.invulnerable) continue;
                
                // 1. Head Check (Instant Death)
                let headDist = dist(p.x, p.y, activeMines[i].x, activeMines[i].y);
                if(headDist < 150) {
                    killPlayer(p);
                    continue; 
                }

                // 2. Body Check (Halve Length)
                let bodyHit = false;
                for(let j = 0; j < p.points.length; j += 5) { 
                    let pt = p.points[j];
                    if(dist(pt.x, pt.y, activeMines[i].x, activeMines[i].y) < 150) {
                        bodyHit = true;
                        break;
                    }
                }

                if (bodyHit) {
                    p.length = Math.floor(p.length / 2);
                    if(p.points.length > p.length) {
                        p.points.splice(p.length);
                    }
                }
            }
            activeMines.splice(i, 1);
        }
    }

    // Update Nets
    for(let i=nets.length-1; i>=0; i--) {
        nets[i].timer--;
        if(nets[i].timer <= 0) nets.splice(i, 1);
    }

    io.emit('state', { players, foods, activeMines, nets, mapRadius });
}, 1000/FPS);

http.listen(3000, () => console.log('Server running on port 3000'));