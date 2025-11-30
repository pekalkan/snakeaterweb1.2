const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);

app.use(express.static('public'));

// --- GAME SETTINGS ---
const FPS = 60;
const INITIAL_MAP_RADIUS = 6000;
let mapRadius = INITIAL_MAP_RADIUS;
const MIN_MAP_RADIUS = 500; // Stops shrinking here
const SHRINK_RATE = 1.0; 
const NET_COOLDOWN_MS = 30000; // 30 Seconds

// --- MATH HELPERS ---
function dist(x1, y1, x2, y2) {
    return Math.hypot(x2 - x1, y2 - y1);
}

// --- CLASSES ---
class Snake {
    constructor(id) {
        this.id = id;
        this.username = "Unknown"; 
        this.isReady = false;      
        
        // Game Properties
        this.x = 0;
        this.y = 0;
        this.angle = 0;
        this.points = [];
        this.length = 50; 
        this.thickness = 12; 
        this.score = 0;
        this.speed = 3;
        this.isDead = true; // Default dead until spawn
        
        this.isBoosting = false; 
        this.boostTimer = 0;     
        this.invulnerable = false;
        this.shieldTimer = 0;
        this.poisonTimer = 0; 
        this.lastNetTime = 0; 
        this.currentNetCooldown = 0;
        this.massDropTimer = 0; 
    }

    reset(startX, startY) {
        this.x = startX;
        this.y = startY;
        this.angle = Math.random() * Math.PI * 2;
        this.points = [];
        this.length = 50;
        this.thickness = 12;
        this.score = 0;
        this.isDead = false;
        this.isBoosting = false;
        this.invulnerable = false;
        this.shieldTimer = 0;
        this.boostTimer = 0;
        this.poisonTimer = 0;
        
        for(let i=0; i<this.length; i++) {
            this.points.push({x: this.x, y: this.y});
        }
    }

    update() {
        if (this.isDead) return 'dead';

        let currentSpeed = this.speed;

        // --- SPEED & MASS DROP LOGIC ---
        if (this.boostTimer > 0) {
            currentSpeed = 6;
            this.boostTimer--;
        } 
        else if (this.isBoosting) {
            if (this.length > 20) {
                currentSpeed = 6;
                this.massDropTimer++;
                if (this.massDropTimer > 10) { 
                    this.length -= 1;
                    this.score = Math.max(0, this.score - 10);
                    const tail = this.points[this.points.length - 1];
                    if (tail) spawnFood(tail.x, tail.y, 'normal');
                    this.massDropTimer = 0;
                }
            } else {
                currentSpeed = this.speed; 
            }
        } else {
            this.massDropTimer = 0;
        }

        if (this.shieldTimer > 0) {
            this.shieldTimer--;
            if(this.shieldTimer <= 0) this.invulnerable = false;
        }

        const now = Date.now();
        const timePassed = now - this.lastNetTime;
        this.currentNetCooldown = Math.max(0, NET_COOLDOWN_MS - timePassed);

        this.thickness = 12 + (this.length * 0.02); 
        if (this.thickness > 35) this.thickness = 35;

        this.x += Math.cos(this.angle) * currentSpeed;
        this.y += Math.sin(this.angle) * currentSpeed;

        this.points.unshift({x: this.x, y: this.y});
        while (this.points.length > this.length) {
            this.points.pop();
        }

        // Poison Logic
        if (dist(0,0, this.x, this.y) > mapRadius && !this.invulnerable) {
            this.poisonTimer++;
            if (this.poisonTimer > 300) return 'die'; 
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
let gameRunning = false; 

// Shrink State
let isShrinking = false;
let shrinkTimer = 0; 

function spawnFood(x, y, specificType) {
    let spawnX = x;
    let spawnY = y;
    
    if (spawnX === undefined || spawnY === undefined) {
        const angle = Math.random() * Math.PI * 2;
        const r = Math.random() * Math.max(100, mapRadius); 
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
    for (let i = 0; i < player.points.length; i += 2) {
        const pt = player.points[i];
        scatterFood(pt.x, pt.y);
    }
    player.points = []; 
    // Send game over only to the loser
    io.to(player.id).emit('game_over', { score: player.score });
    
    // We NO LONGER automatically reset the game for everyone here.
    // The survivors keep playing.
}

function startGame() {
    gameRunning = true;
    mapRadius = INITIAL_MAP_RADIUS;
    foods = [];
    activeMines = [];
    nets = [];
    isShrinking = false;
    shrinkTimer = 0;
    
    // Spawn Initial Food
    for(let i=0; i<420; i++) spawnFood();
    
    // Reset all players who are ready
    const safeR = Math.max(100, mapRadius - 500);
    
    Object.values(players).forEach(p => {
        if (p.isReady) {
            const sx = (Math.random() - 0.5) * safeR;
            const sy = (Math.random() - 0.5) * safeR;
            p.reset(sx, sy);
        }
    });

    io.emit('game_started');
}

io.on('connection', (socket) => {
    console.log('Player connected:', socket.id);
    players[socket.id] = new Snake(socket.id);

    socket.on('join_game', (username) => {
        if(players[socket.id]) {
            players[socket.id].username = username || "Guest";
        }
    });

    socket.on('player_ready', () => {
        if (players[socket.id]) {
            players[socket.id].isReady = !players[socket.id].isReady; 
            
            // Start game if everyone is ready and at least 1 person exists
            const allPlayers = Object.values(players);
            if (allPlayers.length > 0 && allPlayers.every(p => p.isReady)) {
                startGame();
            }
        }
    });

    // NEW: Player manually leaving to lobby
    socket.on('leave_game', () => {
        if(players[socket.id]) {
            players[socket.id].isReady = false;
            players[socket.id].isDead = true;
            players[socket.id].points = [];
        }
    });

    socket.on('input', (data) => {
        if(gameRunning && players[socket.id] && !players[socket.id].isDead) {
            let p = players[socket.id];
            let diff = data.angle - p.angle;
            while (diff < -Math.PI) diff += Math.PI * 2;
            while (diff > Math.PI) diff -= Math.PI * 2;
            p.angle += Math.sign(diff) * Math.min(Math.abs(diff), 0.1);
            p.isBoosting = data.isBoosting;
        }
    });

    socket.on('cast_net', () => {
        if(gameRunning && players[socket.id] && !players[socket.id].isDead) {
            let p = players[socket.id];
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
    // LOBBY PHASE
    if (!gameRunning) {
        const lobbyData = Object.values(players).map(p => ({
            username: p.username,
            isReady: p.isReady
        }));
        io.emit('lobby_state', lobbyData);
        return; 
    }

    // GAME PHASE
    let shouldShowWarning = false;
    let isMapFixed = false;

    if (mapRadius <= MIN_MAP_RADIUS) {
        mapRadius = MIN_MAP_RADIUS;
        isShrinking = false;
        isMapFixed = true; 
    } else {
        shrinkTimer++;
        if (isShrinking) {
            mapRadius -= SHRINK_RATE;
            if (shrinkTimer <= 180) shouldShowWarning = true;
            if (shrinkTimer > 1200) { 
                isShrinking = false;
                shrinkTimer = 0;
            }
        } else {
            if (shrinkTimer > 1200) { 
                isShrinking = true;
                shrinkTimer = 0;
            }
        }
    }

    for (let id in players) {
        let p = players[id];
        if (p.isDead) continue; 

        const status = p.update();
        if (status === 'die') {
            killPlayer(p);
            continue;
        }

        // Food
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

        // Nets
        for (let n of nets) {
            if (n.owner !== p.id) {
                if (dist(p.x, p.y, n.x, n.y) < n.radius) {
                    if (!p.invulnerable) {
                        p.length -= 1.0; 
                        if (p.length < 10) killPlayer(p);
                    }
                }
            }
        }

        // Collision
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

    // Mines
    for(let i=activeMines.length-1; i>=0; i--) {
        activeMines[i].timer--;
        if(activeMines[i].timer <= 0) {
            for(let id in players) {
                let p = players[id];
                if(p.isDead || p.invulnerable) continue;
                
                let headDist = dist(p.x, p.y, activeMines[i].x, activeMines[i].y);
                if(headDist < 150) {
                    killPlayer(p);
                    continue; 
                }

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
                    if(p.points.length > p.length) p.points.splice(p.length);
                }
            }
            activeMines.splice(i, 1);
        }
    }

    // Nets Timer
    for(let i=nets.length-1; i>=0; i--) {
        nets[i].timer--;
        if(nets[i].timer <= 0) nets.splice(i, 1);
    }

    io.emit('game_state', { players, foods, activeMines, nets, mapRadius, shouldShowWarning, isMapFixed });
}, 1000/FPS);

http.listen(3000, () => console.log('Server running on port 3000'));