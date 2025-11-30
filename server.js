const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);

app.use(express.static('public'));

// --- OYUN AYARLARI ---
const FPS = 60;
let mapRadius = 2000; // Harita büyüklüğü
const MIN_MAP_RADIUS = 500;
const SHRINK_RATE = 0.5; // Daralma hızı

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
        this.length = 50; // Başlangıç boyu
        this.thickness = 12;
        this.score = 0;
        this.speed = 3;
        
        // Başlangıç vücudu
        for(let i=0; i<this.length; i++) {
            this.points.push({x: x, y: y});
        }
        
        this.isBoosting = false;
        this.boostTimer = 0;
        this.invulnerable = false;
        this.shieldTimer = 0;
    }

    update() {
        // Hız Ayarı
        let currentSpeed = this.speed;
        if (this.isBoosting || this.boostTimer > 0) currentSpeed = 6;
        
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

        // Alan Dışı Kontrolü (Zehir)
        if (dist(0,0, this.x, this.y) > mapRadius && !this.invulnerable) {
            this.length = Math.max(10, this.length - 0.5);
        }
    }
}

let players = {};
let foods = [];
let activeMines = [];
let nets = [];

// Yemleri Oluştur
for(let i=0; i<100; i++) spawnFood();

function spawnFood() {
    const angle = Math.random() * Math.PI * 2;
    const r = Math.random() * mapRadius;
    const typeRoll = Math.random();
    let type = 'normal';
    
    if (typeRoll < 0.05) type = 'boost';
    else if (typeRoll < 0.1) type = 'shield';
    else if (typeRoll < 0.15) type = 'mine';

    foods.push({
        x: Math.cos(angle) * r,
        y: Math.sin(angle) * r,
        type: type,
        radius: type === 'normal' ? 6 : 10,
        id: Math.random()
    });
}

io.on('connection', (socket) => {
    console.log('Oyuncu geldi:', socket.id);
    players[socket.id] = new Snake(socket.id, 0, 0);

    socket.on('input', (data) => {
        if(players[socket.id]) {
            let p = players[socket.id];
            // Yumuşak dönüş
            let diff = data.angle - p.angle;
            while (diff < -Math.PI) diff += Math.PI * 2;
            while (diff > Math.PI) diff -= Math.PI * 2;
            p.angle += Math.sign(diff) * Math.min(Math.abs(diff), 0.1);
            p.isBoosting = data.isBoosting;
        }
    });

    socket.on('cast_net', () => {
        if(players[socket.id]) {
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

setInterval(() => {
    if(mapRadius > MIN_MAP_RADIUS) mapRadius -= SHRINK_RATE;

    for (let id in players) {
        let p = players[id];
        p.update();

        // Yem Yeme
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

        // KESME MEKANİĞİ (En Önemli Kısım)
        for(let otherId in players) {
            if(id === otherId) continue;
            let enemy = players[otherId];
            if(enemy.invulnerable) continue;

            // Düşmanın vücuduna çarpma kontrolü
            for(let i=5; i<enemy.points.length; i++) {
                if(dist(p.x, p.y, enemy.points[i].x, enemy.points[i].y) < p.thickness + enemy.thickness) {
                    // Kestik!
                    let stolen = enemy.points.length - i;
                    enemy.points.splice(i);
                    enemy.length = enemy.points.length;
                    p.score += stolen * 10;
                    p.length += stolen * 0.5;
                    break;
                }
            }
        }
    }

    // Mayınlar
    for(let i=activeMines.length-1; i>=0; i--) {
        activeMines[i].timer--;
        if(activeMines[i].timer <= 0) {
            // Patlama
            for(let id in players) {
                if(dist(players[id].x, players[id].y, activeMines[i].x, activeMines[i].y) < 150) {
                    if(!players[id].invulnerable) players[id].length /= 2;
                }
            }
            activeMines.splice(i, 1);
        }
    }

    io.emit('state', { players, foods, activeMines, nets, mapRadius });
}, 1000/FPS);

http.listen(3000, () => console.log('Oyun sunucusu çalışıyor: port 3000'));