const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);

app.use(express.static('public'));

// --- OYUN AYARLARI ---
const FPS = 60;
let mapRadius = 6000; // Harita Büyüklüğü
const MIN_MAP_RADIUS = 500;
const SHRINK_RATE = 0.5; 

// --- YARDIMCI MATEMATİK ---
function dist(x1, y1, x2, y2) {
    return Math.hypot(x2 - x1, y2 - y1);
}

// --- SINIFLAR ---
class Snake {
    constructor(id, x, y) {
        this.id = id;
        this.x = x;
        this.y = y;
        this.angle = Math.random() * Math.PI * 2;
        this.points = [];
        this.length = 50; 
        this.thickness = 12;
        this.score = 0;
        this.speed = 3;
        
        // Durumlar
        this.isDead = false;
        
        // Vücut Başlangıcı
        for(let i=0; i<this.length; i++) {
            this.points.push({x: x, y: y});
        }
        
        this.isBoosting = false;
        this.boostTimer = 0;
        this.invulnerable = false;
        this.shieldTimer = 0;
        
        this.poisonTimer = 0; 
    }

    update() {
        if (this.isDead) return 'dead';

        // Hız Mantığı
        let currentSpeed = this.speed;
        if (this.isBoosting || this.boostTimer > 0) currentSpeed = 6;
        
        // Sayaçlar
        if (this.boostTimer > 0) this.boostTimer--;
        if (this.shieldTimer > 0) {
            this.shieldTimer--;
            if(this.shieldTimer <= 0) this.invulnerable = false;
        }

        // Hareket
        this.x += Math.cos(this.angle) * currentSpeed;
        this.y += Math.sin(this.angle) * currentSpeed;

        // Vücut Takibi
        this.points.unshift({x: this.x, y: this.y});
        while (this.points.length > this.length) {
            this.points.pop();
        }

        // ZEHİR (ALAN DIŞI) MANTIĞI
        if (dist(0,0, this.x, this.y) > mapRadius && !this.invulnerable) {
            this.poisonTimer++;
            if (this.poisonTimer > 300) { // 5 saniye (60fps * 5)
                return 'die'; 
            }
        } else {
            this.poisonTimer = 0; 
        }
        
        return 'alive';
    }
}

// --- GLOBAL DURUM ---
let players = {};
let foods = [];
let activeMines = [];
let nets = [];

// Başlangıç Yemleri
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
    // Yemleri etrafa saçmak için rastgelelik
    const scatterRange = 40; 
    const offsetX = (Math.random() - 0.5) * scatterRange;
    const offsetY = (Math.random() - 0.5) * scatterRange;
    spawnFood(x + offsetX, y + offsetY, 'normal');
}

function killPlayer(player) {
    if(player.isDead) return;
    
    player.isDead = true;

    // 1. Vücudu parçalayıp yeme dönüştür
    for (let i = 0; i < player.points.length; i += 2) {
        const pt = player.points[i];
        scatterFood(pt.x, pt.y);
    }

    // 2. ÖNEMLİ: Vücudu tamamen sil (Ekranda yeşil kısım kalmasın)
    player.points = []; 

    // İstemciye öldüğünü bildir
    io.to(player.id).emit('game_over', { score: player.score });
}

// --- SOCKET BAĞLANTISI ---
io.on('connection', (socket) => {
    console.log('Player connected:', socket.id);
    players[socket.id] = new Snake(socket.id, 0, 0);

    socket.on('input', (data) => {
        if(players[socket.id] && !players[socket.id].isDead) {
            // Validate input data
            if (typeof data !== 'object' || data === null) return;
            if (typeof data.angle !== 'number' || !isFinite(data.angle)) return;
            
            let p = players[socket.id];
            let diff = data.angle - p.angle;
            while (diff < -Math.PI) diff += Math.PI * 2;
            while (diff > Math.PI) diff -= Math.PI * 2;
            p.angle += Math.sign(diff) * Math.min(Math.abs(diff), 0.1);
            p.isBoosting = !!data.isBoosting;
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
            for(let i=0; i<p.length; i++) p.points.push({x: p.x, y: p.y});
        }
    });

    socket.on('cast_net', () => {
        if(players[socket.id] && !players[socket.id].isDead) {
            let p = players[socket.id];
            nets.push({
                x: p.x + Math.cos(p.angle) * 150,
                y: p.y + Math.sin(p.angle) * 150,
                radius: 100,
                owner: p.id,
                timer: 120
            });
        }
    });

    socket.on('disconnect', () => {
        delete players[socket.id];
    });
});

// --- OYUN DÖNGÜSÜ ---
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

        // Yem Yeme
        for(let i=foods.length-1; i>=0; i--) {
            let f = foods[i];
            if(dist(p.x, p.y, f.x, f.y) < p.thickness + f.radius) {
                if(f.type === 'normal') { p.length += 5; p.score += 10; }
                if(f.type === 'boost') p.boostTimer = 300;
                if(f.type === 'shield') { p.invulnerable = true; p.shieldTimer = 300; }
                if(f.type === 'mine') activeMines.push({x: f.x, y: f.y, radius: 150, timer: 180}); // timer: 3 saniye
                
                foods.splice(i, 1);
                spawnFood();
            }
        }

        // Diğer Yılanlarla Çarpışma
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

    // MAYINLAR (BOMBA)
    for(let i=activeMines.length-1; i>=0; i--) {
        activeMines[i].timer--;
        if(activeMines[i].timer <= 0) {
            // Patlama Anı!
            for(let id in players) {
                let p = players[id];
                if(p.isDead) continue;
                
                // Bomba merkezine olan mesafe
                let d = dist(p.x, p.y, activeMines[i].x, activeMines[i].y);
                
                // DÜZELTME: Eğer kafa, bombanın etki alanı (150px) içindeyse DİREKT ÖL.
                // Eskiden < 50 yapıyorduk, o yüzden bazen ölmüyordu. Şimdi tüm alanda öldürücü.
                if(d < 150) {
                    if(!p.invulnerable) {
                         killPlayer(p);
                    }
                }
            }
            activeMines.splice(i, 1);
        }
    }

    // Ağlar
    for(let i=nets.length-1; i>=0; i--) {
        nets[i].timer--;
        if(nets[i].timer <= 0) nets.splice(i, 1);
    }

    io.emit('state', { players, foods, activeMines, nets, mapRadius });
}, 1000/FPS);

http.listen(3000, () => console.log('Server running on port 3000'));