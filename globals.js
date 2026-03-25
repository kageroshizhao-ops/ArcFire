const canvas = document.getElementById("game");
canvas.width = 1200; // Fixed high-res width
canvas.height = 600; // Fixed high-res height
const ctx = canvas.getContext("2d");

const GAME = {
    width: canvas.width,
    height: canvas.height,
    gravity: 0.16,
    wind: 0,
    groundBase: 430,
    leftBound: 50,
    rightBound: canvas.width - 50,
    state: "title",
    turn: "player",
    winner: null,
    lastTime: 0,
    flashTimer: 0,
    screenShake: 0,
    titleTimer: 0,              // For "Press Any Key" pulse effect
    terrain: [],
    stars: [],
    clouds: [],
    effects: [],
    projectiles: [],
    debris: [],
    obstacles: [],
    powerUps: [],
    difficulty: 1,
    // NEW fields
    round: 1,
    playerScore: 0,
    enemyScore: 0,
    difficultyMode: "normal",   // "easy" | "normal" | "hard"
    paused: false,
    playerShots: 0,
    playerHits: 0,
    playerDamageDealt: 0,
    showHint: true,
    hintTimer: 6,               // seconds to show first-turn hint
    playerPowerUp: null,        // "size" | "missile" | null
    craters: [],                // Dynamic crater images on terrain
    burnZones: [],             // Napalm burn areas (tick by turns)
    level: 1,                   // Current stage layout
    theme: "bright",            // "bright" | "pale"
    killedEnemies: 0,           // Number of enemies killed in Endless mode
    ammoTypes: ["Standard", "Cluster", "Oil", "Napalm"],
    fireTrails: [],             // Persistent fire paths from 3-hit streaks
    playerHitStreak: 0,        // Consecutive hits by player on enemy
    enemyHitStreak: 0,         // Consecutive hits by enemy on player
    hitThisTurn: false,        // Did any hit occur this turn?
};

const keys = Object.create(null);

const IMAGES = {};

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

// Decoration layers per war zone / theme
const WAR_DECOR = {
    1: ["dec_war1_h1", "dec_war1_h2", "dec_war1_h3"],
    2: ["dec_war2_h1", "dec_war2_h2", "dec_war2_h3", "dec_war2_h4"],
    3: ["dec_war3_h2", "dec_war3_trees"],
    4: ["dec_war4_h1", "dec_war4_h2"],
};
