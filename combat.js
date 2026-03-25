function spawnProjectile(tank, isHoming = false) {
    const angle = tank.angle * Math.PI / 180;
    const power = tank.power * 0.165;
    const muzzle = tank.muzzlePoint(); // Keep as function call

    GAME.projectile = {
        owner: tank.name, // Keep owner
        x: muzzle.x,
        y: muzzle.y,
        vx: Math.cos(angle) * power,
        vy: Math.sin(angle) * power,
        radius: 5, // Keep radius
        trail: [],
        homing: isHoming,
        animTimer: 0,
        shooter: tank
    };

    GAME.effects.push({
        type: "muzzle",
        x: muzzle.x,
        y: muzzle.y,
        angle: angle, // Use 'angle' here
        timer: 0.16,
        max: 0.16
    });

    GAME.flashTimer = 0.05;
    GAME.state = "projectile";

    // Track player shots
    if (tank === player) GAME.playerShots++;

    tank.state = "firing";
    tank.animFrame = 0;
    tank.animTimer = 0;

    // ── SFX ──
    if (typeof SFX !== "undefined") {
        SFX.play(isHoming ? "missile" : "cannon");
    }
}

function fireCurrentTank() {
    if (GAME.projectile || GAME.winner) return;

    if (GAME.turn === "player") {
        spawnProjectile(player);
    } else {
        spawnProjectile(enemy);
    }
}

function solveBallisticEstimate(dxAbs, dy, launchDegrees, gravity) {
    const theta = launchDegrees * Math.PI / 180;
    const denom = 2 * Math.pow(Math.cos(theta), 2) * (dxAbs * Math.tan(theta) - dy);
    if (denom <= 0) return null;
    return Math.sqrt((gravity * dxAbs * dxAbs) / denom);
}

function applyAIShot() {
    if (!GAME.useAI) return;
    if (GAME.turn !== "enemy" || GAME.state !== "aiming" || GAME.winner) return;

    const dx = player.x - enemy.x;
    const dy = (player.y - 24) - (enemy.y - 24);

    // Calculate expected wind drift (d = 0.5 * a * t^2) using a heuristic time-of-flight
    const estTicks = Math.abs(dx) * 0.14;
    const windDrift = 0.5 * GAME.wind * (estTicks * estTicks);

    // Hard AI perfectly predicts wind drag. Normal does okay. Easy ignores it.
    const comp = GAME.difficultyMode === "hard" ? 1.0 : (GAME.difficultyMode === "normal" ? 0.5 : 0.0);
    const aimDx = dx - (windDrift * comp);
    const distance = Math.abs(aimDx);

    let angleDeg = -145;
    let power = clamp(42 + distance * 0.04, 28, 92);

    const arcChoice = distance > 420 ? 50 : 38;
    // Enemy faces left if player is left, right if player is right
    angleDeg = aimDx < 0 ? (-180 + arcChoice) : -arcChoice;

    const rough = solveBallisticEstimate(distance, dy, arcChoice, GAME.gravity);
    if (rough) {
        power = clamp(rough * 6.06, 25, 95); // 1 / 0.165 = 6.06 true velocity multiplier
    }

    angleDeg += Math.random() * 3 - 1.5;
    power += Math.random() * 2 - 1;

    // ── Difficulty-aware AI error ──────────────────────────
    const errA = GAME.difficultyMode === "easy" ? 15
        : GAME.difficultyMode === "hard" ? 0.5
            : 3;
    const errP = GAME.difficultyMode === "easy" ? 10
        : GAME.difficultyMode === "hard" ? 0.2
            : 2.0;
    angleDeg += (Math.random() * 2 - 1) * errA;
    power += (Math.random() * 2 - 1) * errP;

    enemy.angle = clamp(angleDeg, -210, 30);
    enemy.power = clamp(power, 20, 100);

    setTimeout(() => {
        if (!GAME.winner && GAME.turn === "enemy" && GAME.state === "aiming") {
            fireCurrentTank();
        }
    }, 850);
}

function canClimb(tank, dir, dt) {
    const step = 6;
    const currentY = getTerrainY(tank.x);
    const nextY = getTerrainY(tank.x + dir * step);
    const rise = currentY - nextY; // Positive means climbing upwards

    // Check if the vertical climb over 6 pixels is greater than ~9 pixels (1.5 slope ratio).
    // This perfectly catches steep crater walls while allowing gentle dips.
    if (rise > step * 1.5) {
        return false;
    }
    return true;
}

function updateProjectile(dt) {
    if (!GAME.projectile) return;

    const p = GAME.projectile;

    // Make projectiles leave a stronger visual trail
    p.trail.push({ x: p.x, y: p.y, life: 0.65 });
    if (p.trail.length > 24) p.trail.shift();

    // Apply enhanced wind influence to make effects more visible in flight
    p.x += p.vx;
    p.y += p.vy;
    p.vy += GAME.gravity;
    p.vx += GAME.wind * 1.15;

    if (p.homing) {
        const target = p.shooter === player ? enemy : player;
        const tx = target.x;
        const ty = target.y - 24 * target.scale;
        const dx = tx - p.x;
        const dy = ty - p.y;
        const dist = Math.hypot(dx, dy);

        if (dist > 5) {
            const steerSpeed = 0.45;
            const desiredVx = (dx / dist) * 12;
            const desiredVy = (dy / dist) * 12;
            p.vx += (desiredVx - p.vx) * steerSpeed;
            p.vy += (desiredVy - p.vy) * steerSpeed;
        }
        p.animTimer += dt * 15;
    }

    for (const t of p.trail) t.life -= dt;
    p.trail = p.trail.filter(t => t.life > 0);

    const terrainY = getTerrainY(p.x);

    if (p.x < -20 || p.x > GAME.width + 20 || p.y > GAME.height + 30) {
        GAME.projectile = null;
        endTurn();
        return;
    }

    if (p.y >= terrainY - 2) {
        explode(p.x, terrainY - 2, 42, null);
        GAME.projectile = null;
        endTurn();
        return;
    }

    const hitTank = checkTankHit(p, player) || checkTankHit(p, enemy);
    if (hitTank) {
        explode(p.x, p.y, 48, hitTank);
        GAME.projectile = null;
        endTurn();
        return;
    }

    const hitObs = checkObstacleHit(p);
    if (hitObs) {
        explode(p.x, p.y, 42, null);
        GAME.projectile = null;
        endTurn();
        return;
    }
}

function checkTankHit(projectile, tank) {
    if (!tank.alive) return null;

    const angle = getTerrainAngle(tank.x);
    const cosA = Math.cos(angle);
    const sinA = Math.sin(angle);

    const dx = projectile.x - tank.x;
    const dy = projectile.y - tank.y;

    const lx = dx * cosA + dy * sinA;
    const ly = -dx * sinA + dy * cosA;

    const hitW = 64 * tank.scale;
    const hitH = 42 * tank.scale;

    const inRect = Math.abs(lx) < hitW / 2 && ly < 0 && ly > -hitH;

    return inRect ? tank : null;
}

function checkObstacleHit(projectile) {
    for (let obs of GAME.obstacles) {
        if (!obs.alive) continue;
        let oy = obs.y !== undefined ? obs.y : getTerrainY(obs.x);
        if (projectile.x > obs.x - obs.width / 2 && projectile.x < obs.x + obs.width / 2 &&
            projectile.y > oy - obs.height && projectile.y < oy) {
            return obs;
        }
    }
    return null;
}

function applyDamage(tank, amount) {
    if (!tank.alive) return;

    tank.hp = clamp(tank.hp - amount, 0, tank.maxHp);
    tank.hitFlash = 0.18;

    // Track player-dealt damage
    if (GAME.projectile && GAME.projectile.owner === "Player" && tank === enemy) {
        GAME.playerHits++;
        GAME.playerDamageDealt += amount;
    }

    if (tank.hp <= 0) {
        if (tank.alive) {
            tank.state = "exploding";
            tank.animFrame = 0;
            tank.animTimer = 0;
            // ── SFX ──
            if (typeof SFX !== "undefined") SFX.play("tankDestroyed");
        }
        tank.alive = false;
        tank.hp = 0;
        GAME.effects.push({
            type: "bigExplosion",
            x: tank.x,
            y: tank.y - 28,
            radius: 72,
            timer: 0.9,
            max: 0.9
        });
        GAME.winner = tank === player ? "Enemy Wins!" : "Player Wins!";
        // Determine winner tank (the opposite of the one that died)
        const winnerTank = (tank === player) ? enemy : player;
        GAME.winner = winnerTank.name || (winnerTank === player ? "Player" : "Enemy");
        GAME.state = "gameover";

        // Update scores
        if (winnerTank === player) GAME.playerScore++;
        else GAME.enemyScore++;
        GAME.round++;

        setTimeout(() => {
            const isPlayerWinner = winnerTank === player;
            const titleEl = document.getElementById("gameOverTitle");
            const descEl = document.getElementById("gameOverDesc");
            const nextBtn = document.getElementById("nextLevelBtn");

            if (GAME.mode === 'multiplayer') {
                titleEl.textContent = `${GAME.winner} WINS!`;
                descEl.textContent = "Great match.";
                nextBtn.textContent = "Play Again";
                nextBtn.style.display = "inline-block";
                nextBtn.onclick = function () { playAgain(); };
            } else {
                if (isPlayerWinner) {
                    titleEl.textContent = "VICTORY";
                    descEl.textContent = "Enemy tank eliminated.";
                    nextBtn.style.display = "inline-block";
                } else {
                    titleEl.textContent = "DEFEAT";
                    descEl.textContent = "Your tank was destroyed.";
                    nextBtn.style.display = "none";
                }
                nextBtn.textContent = "Next Level";
                nextBtn.onclick = loadNextLevel;
            }

            // Populate battle stats (still player-centric)
            const acc = GAME.playerShots > 0 ? Math.round((GAME.playerHits / GAME.playerShots) * 100) : 0;
            document.getElementById("statShots").textContent = GAME.playerShots;
            document.getElementById("statHits").textContent = GAME.playerHits;
            document.getElementById("statAccuracy").textContent = acc + "%";
            document.getElementById("statDamage").textContent = Math.round(GAME.playerDamageDealt);

            document.getElementById("gameOverScreen").classList.remove("hidden");
        }, 1500);
    }
}

function explode(x, y, radius, directTank) {
    carveTerrain(x, y, Math.max(radius, 42));
    GAME.screenShake = Math.max(GAME.screenShake, 8);

    // ── SFX ──
    if (typeof SFX !== "undefined") {
        SFX.play("shellHit", Math.min(1, 0.6 + radius / 80));
    }

    GAME.effects.push({
        type: "explosion",
        x,
        y,
        radius,
        timer: 0.55,
        max: 0.55
    });

    GAME.effects.push({
        type: "smoke",
        x,
        y,
        timer: 1.1,
        max: 1.1,
        radius: radius * 0.8
    });

    // Add level-specific crater decoration
    const lv = Math.min(GAME.level, 4);
    const craterNum = Math.floor(Math.random() * 3) + 1;
    GAME.craters.push({
        x, y,
        r: radius * 1.2,
        key: `crater${craterNum}_war${lv}_${GAME.theme}`,
        rotation: (Math.random() - 0.5) * 0.6
    });
    if (GAME.craters.length > 20) GAME.craters.shift();

    for (let i = 0; i < 12; i++) {
        GAME.debris.push({
            x,
            y,
            vx: (Math.random() - 0.5) * 5,
            vy: -Math.random() * 4 - 1,
            size: 2 + Math.random() * 3,
            life: 0.9 + Math.random() * 0.4
        });
    }

    [player, enemy].forEach(tank => {
        const angle = getTerrainAngle(tank.x);
        const cosA = Math.cos(angle);
        const sinA = Math.sin(angle);
        const dx = x - tank.x;
        const dy = y - tank.y;
        const lx = dx * cosA + dy * sinA;
        const ly = -dx * sinA + dy * cosA;

        const tx = tank.x + (0 * cosA - (-24) * sinA);
        const ty = tank.y + (0 * sinA + (-24 * tank.scale) * cosA);
        const dist = Math.hypot(tx - x, ty - y);

        if (dist <= radius + 36 * tank.scale) {
            const damage = Math.max(10, Math.round(38 - dist * 0.38));
            applyDamage(tank, damage);
        }
    });

    GAME.obstacles.forEach(obs => {
        if (!obs.alive) return;
        let oy = obs.y !== undefined ? obs.y : getTerrainY(obs.x);
        const dist = Math.hypot(obs.x - x, (oy - obs.height / 2) - y);
        if (dist <= radius + Math.max(obs.width, obs.height) / 2 + 10) {
            const damage = Math.max(15, Math.round(50 - dist * 0.45));
            obs.hp -= damage;
            if (obs.hp <= 0) obs.alive = false;
        }
    });

    if (directTank) applyDamage(directTank, 8);
}

function endTurn() {
    if (GAME.winner) return;

    GAME.state = "aiming";
    GAME.turn = GAME.turn === "player" ? "enemy" : "player";

    // ── Dynamic Wind Fluctuation ──
    const windMax = GAME.difficultyMode === "easy" ? 0.045 : (GAME.difficultyMode === "hard" ? 0.16 : 0.09);
    GAME.wind += (Math.random() * 2 - 1) * (windMax * 0.65); // dynamically shifts
    GAME.wind = Math.max(-windMax, Math.min(windMax, GAME.wind));

    [player, enemy].forEach(tank => {
        if (tank.effectTurns > 0) {
            tank.effectTurns--;
            if (tank.effectTurns <= 0) {
                tank.scale = 1.0;
            }
        }
    });

    if (Math.random() < 0.1) {
        const rVal = Math.random();
        const type = rVal < 0.33 ? "size" : (rVal < 0.66 ? "grow" : "missile");
        const x = 200 + Math.random() * (GAME.width - 400);
        GAME.powerUps.push({
            x,
            y: getTerrainY(x),
            type: type,
            pickedUp: false,
            bob: 0
        });
    }

    if (GAME.turn === "enemy") {
        if (GAME.useAI) {
            GAME.state = "moving";
            const dir = Math.random() < 0.5 ? -1 : 1;
            const dist = 40 + Math.random() * 80;
            enemy.targetX = clamp(enemy.x + dir * dist, player.x + 150, GAME.rightBound);
        } else {
            // multiplayer human-controlled: enter aiming so player 2 can control the tank
            GAME.state = "aiming";
        }
    }
}

function updatePlayerInput(dt) {
    if (GAME.state === "intro" || GAME.state !== "aiming" || GAME.winner) return;

    // In single player only the `player` turn is human; in multiplayer both turns are human
    if (GAME.mode !== 'multiplayer' && GAME.turn !== 'player') return;

    const moveSpeed = 86;
    let moved = false;

    const isPlayerTurn = GAME.turn === 'player';
    const tank = isPlayerTurn ? player : enemy;

    // determine control mapping depending on mode and which tank is active
    let leftKey, rightKey, angUpKey, angDownKey, powDownKey, powUpKey;
    if (GAME.mode === 'multiplayer') {
        if (isPlayerTurn) {
            leftKey = 'a'; rightKey = 'd'; angUpKey = 'arrowup'; angDownKey = 'arrowdown'; powDownKey = 'arrowleft'; powUpKey = 'arrowright';
        } else {
            leftKey = 'a'; rightKey = 'd'; angUpKey = 'arrowdown'; angDownKey = 'arrowup'; powDownKey = 'arrowright'; powUpKey = 'arrowleft';
        }
    } else {
        // single player: player uses WASD for movement and arrows for angle/power
        leftKey = 'a'; rightKey = 'd'; angUpKey = 'arrowup'; angDownKey = 'arrowdown'; powDownKey = 'arrowleft'; powUpKey = 'arrowright';
    }

    let minX = GAME.leftBound;
    let maxX = (tank === player) ? enemy.x - 150 : GAME.rightBound;
    GAME.obstacles.forEach(obs => {
        if (!obs.alive) return;
        if (obs.x > tank.x) maxX = Math.min(maxX, obs.x - obs.width / 2 - 42);
        else minX = Math.max(minX, obs.x + obs.width / 2 + 42);
    });

    if (keys[leftKey]) {
        if (canClimb(tank, -1, dt)) {
            tank.x = clamp(tank.x - moveSpeed * dt, minX, maxX);
            moved = true;
        }
    }
    if (keys[rightKey]) {
        if (canClimb(tank, 1, dt)) {
            tank.x = clamp(tank.x + moveSpeed * dt, minX, maxX);
            moved = true;
        }
    }

    if (keys[angUpKey]) tank.angle = clamp(tank.angle - 48 * dt, -170, 30);
    if (keys[angDownKey]) tank.angle = clamp(tank.angle + 48 * dt, -170, 30);
    if (keys[powDownKey]) tank.power = clamp(tank.power - 34 * dt, 20, 100);
    if (keys[powUpKey]) tank.power = clamp(tank.power + 34 * dt, 20, 100);

    if (moved) {
        if (tank.state !== "firing" && tank.alive) {
            tank.state = "moving";
        }
        tank.trackFrame += dt * 12;
        tank.bob += dt * 10;
    } else {
        if (tank.state === "moving") {
            tank.state = "idle";
        }
    }
}

function updateEnemyAI(dt) {
    if (!GAME.useAI) return;
    if (GAME.turn !== "enemy" || GAME.winner) return;

    if (GAME.state === "moving") {
        let minX = player.x + 150;
        let maxX = GAME.rightBound; // Restored hard bounds
        GAME.obstacles.forEach(obs => {
            if (!obs.alive) return;
            if (obs.x < enemy.x) minX = Math.max(minX, obs.x + obs.width / 2 + 42);
            else maxX = Math.min(maxX, obs.x - obs.width / 2 - 42);
        });

        enemy.targetX = clamp(enemy.targetX, minX, maxX);

        const moveSpeed = 60;
        const dx = enemy.targetX - enemy.x;

        if (Math.abs(dx) > moveSpeed * dt) {
            enemy.state = "moving";
            const dir = Math.sign(dx);

            if (canClimb(enemy, dir, dt)) {
                enemy.x = clamp(enemy.x + dir * moveSpeed * dt, minX, maxX);
            } else {
                // If slope is too steep, give up pursuing position and brace to fire!
                enemy.targetX = enemy.x;
            }

            enemy.trackFrame += dt * 12;
            enemy.bob += dt * 10;
        } else {
            enemy.state = "idle";
            enemy.x = enemy.targetX;
            GAME.state = "thinking";
            setTimeout(() => {
                if (!GAME.winner) {
                    GAME.state = "aiming";
                    applyAIShot();
                }
            }, 600);
        }
    }
}
