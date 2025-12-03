# 🐍 Snakeater Battle Royale

**Snakeater** is a skill-based, multiplayer "Battle Royale" snake game inspired by *Slither.io*, built using Node.js and Socket.io.

Players gather in a lobby system, and once everyone is ready, they are dropped into the arena together. The goal is to be the last snake surviving by evading the shrinking poisonous gas, trapping opponents, and utilizing special abilities.

---

## 🌟 Features

### 🎮 Gameplay Mechanics
* **Fluid Movement:** Vector-based movement system controlled by the mouse.
* **Dynamic Thickness:** As the snake grows in length, its body also becomes thicker.
* **Boost:** Sprint using `SPACE` or `LEFT CLICK`.
    * *Cost:* Boosting consumes mass (shortens length) and drops food behind.
* **Collision:** If a snake's head collides with another snake's body, it dies and turns into food.

### ⚔️ Abilities & Power-ups
* **🕸️ Net Ability:** Thrown with the `E` key. If an opponent hits this net, their length begins to melt rapidly. (30-second cooldown).
* **💣 Mines:** Red orbs on the map turn into mines.
    * *Head Contact:* Instant death.
    * *Body Contact:* Reduces length by 50%.
* **🛡️ Shield:** Green orbs provide invulnerability for 5 seconds.
* **⚡ Boost Orb:** Yellow orbs provide free boosting without losing mass.

### 🌍 Map & Atmosphere
* **Wave Shrinking:** The map does not shrink continuously. It follows a cycle: 20 seconds shrinking (Warning shown), 20 seconds waiting.
* **Poison Zone:** The area outside the safe zone appears purple and foggy. Snakes remaining outside for more than 5 seconds die.
* **Stabilization:** When the map radius reaches 500 units, shrinking stops, and the final battle begins.

### 🖥️ Interface & System
* **Lobby System:** Username entry, waiting room, and a "Ready" check system.
* **HUD:** Score, Speed Status, Net Cooldown, and Minimap.
* **Sound Effects:** Background music, explosion, boost, and poison effects.
* **Game Over:** The losing player returns to the lobby, while winners can continue roaming the map.

---

## 🕹️ Controls

| Key / Action | Function |
| :--- | :--- |
| **Mouse Movement** | Steers the snake. |
| **Left Click / SPACE** | **Boost:** Increases speed (Consumes mass). |
| **E** | **Net:** Throws a net forward (Melts opponents). |
| **R** | **Return:** Used to return to the lobby after dying. |

---

## 🚀 Installation & Usage

**Node.js** is required to run this project on your machine.

1.  **Install Dependencies:**
    Open your terminal and run:
    ```bash
    npm install
    ```
    *(If `package.json` is missing: run `npm init -y` followed by `npm install express socket.io`)*

2.  **Start the Server:**
    ```bash
    node server.js
    ```

3.  **Join the Game:**
    Open your browser and navigate to:
    `http://localhost:3000`

    *To play with friends on the same network, use your local IP address (e.g., `http://192.168.1.35:3000`).*

---

## 📂 File Structure

* **server.js:** The brain of the game. Handles physics engine, collision detection, lobby management, and the game loop.
* **public/**
    * **index.html:** The game interface (Login, Lobby, HUD, Game Over screens).
    * **client.js:** Rendering logic, sound management, and server communication.
    * **assets/:** Sound files (`.mp3`, `.ogg`).

---

## 🛠️ Developer Notes

* The game is configured to run at **60 FPS**.
* Shrink rates and cooldown timers can be adjusted in the `CONSTANTS` section of `server.js`.
* Audio files start playing upon the first user interaction (click) due to browser autoplay policies.

---

