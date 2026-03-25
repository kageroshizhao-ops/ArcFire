function spawnProjectile(tank, isHoming = false, type = "Standard") {
    const angle = tank.angle * Math.PI / 180;
    const power = tank.power * 0.165;
    const muzzle = tank.muzzlePoint();

    const p = {
        owner: tank.name,
        x: muzzle.x,
        y: muzzle.y,
        vx: Math.cos(angle) * power,
        vy: Math.sin(angle) * power,
        radius: 5,
        trail: [],
        fullTrail: [],  // Complete path history for fire trail effect
        homing: isHoming,
        animTimer: 0,
        shooter: tank,
        type: type,
        isSplit: false
    };

    GAME.projectiles.push(p);

    GAME.effects.push({
        type: "muzzle",
        x: muzzle.x,
        y: muzzle.y,
        angle: angle,
        timer: 0.16,
        max: 0.16
    });

    GAME.flashTimer = 0.05;
    GAME.state = "projectile";

    // Track shots
    if (tank === player) GAME.playerShots++;
    else if (tank === enemy) GAME.enemyShots++;

    tank.state = "firing";
    tank.animFrame = 0;
    tank.animTimer = 0;

    // ── SFX ──
    if (typeof SFX !== "undefined") {
        SFX.play(isHoming ? "missile" : "cannon");
    }
}

function fireCurrentTank() {
    if (GAME.projectiles.length > 0 || GAME.winner) return;

    const tank = GAME.turn === "player" ? player : enemy;
    const ammoIndex = tank.selectedAmmoSlot;
    const ammoName = GAME.ammoTypes[ammoIndex];
    
    spawnProjectile(tank, false, ammoName);
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
    // Note that the actual physics uses `vx += GAME.wind * 1.15`
    let estTicks = Math.abs(dx) * 0.14;
    let windDrift = 0.5 * (GAME.wind * 1.15) * (estTicks * estTicks);

    // Hard AI perfectly predicts wind drag. Normal does okay. Easy ignores it.
    let comp = GAME.difficultyMode === "hard" ? 1.0 : (GAME.difficultyMode === "normal" ? 0.5 : 0.0);
    let aimDx = dx - (windDrift * comp);
    let distance = Math.abs(aimDx);

    let arcChoice = distance > 420 ? 50 : 38;
    
    // In Hard mode, iteratively improve the time-of-flight estimate for pin-point accuracy
    if (GAME.difficultyMode === "hard") {
        const roughInit = solveBallisticEstimate(distance, dy, arcChoice, GAME.gravity);
        if (roughInit) {
            const vx = roughInit * Math.cos(arcChoice * Math.PI / 180);
            if (vx > 0) {
                estTicks = distance / vx;
                windDrift = 0.5 * (GAME.wind * 1.15) * (estTicks * estTicks);
                aimDx = dx - windDrift;
                distance = Math.abs(aimDx);
                arcChoice = distance > 420 ? 50 : 38; // Recalculate arc if distance changes drastically
            }
        }
    }

    let angleDeg = -145;
    let power = clamp(42 + distance * 0.04, 28, 92);
    // Enemy faces left if player is left, right if player is right
    angleDeg = aimDx < 0 ? (-180 + arcChoice) : -arcChoice;

    const rough = solveBallisticEstimate(distance, dy, arcChoice, GAME.gravity);
    if (rough) {
        power = clamp(rough * 6.06, 25, 95); // 1 / 0.165 = 6.06 true velocity multiplier
    }

    if (GAME.difficultyMode === "hard") {
        // Hard mode uses a physics simulation loop to guarantee a direct hit
        let bestDistance = Infinity;
        let bestAngle = angleDeg;
        let bestPower = power;

        const targetX = player.x;
        const targetY = player.y - 24 * player.scale;
        
        // Save current angle to restore later, because muzzlePoint() uses enemy.angle
        const oldAngle = enemy.angle;

        // Sweep angles and power around the heuristic guess
        for (let a = angleDeg - 12; a <= angleDeg + 12; a += 1.25) {
            enemy.angle = a;
            const muzzle = enemy.muzzlePoint();
            const rad = a * Math.PI / 180;
            
            for (let p = Math.max(20, power - 25); p <= Math.min(100, power + 25); p += 2.5) {
                let sx = muzzle.x;
                let sy = muzzle.y;
                let svx = Math.cos(rad) * p * 0.165;
                let svy = Math.sin(rad) * p * 0.165;

                let simClosest = Infinity;
                for (let tk = 0; tk < 180; tk++) {
                    sx += svx;
                    sy += svy;
                    svy += GAME.gravity;
                    svx += GAME.wind * 1.15;

                    const d = Math.hypot(targetX - sx, targetY - sy);
                    if (d < simClosest) simClosest = d;

                    if (sy > targetY + 30) break;
                }

                if (simClosest < bestDistance) {
                    bestDistance = simClosest;
                    bestAngle = a;
                    bestPower = p;
                }
            }
        }
        
        enemy.angle = oldAngle;

        // If a highly accurate shot is found, use it
        if (bestDistance < 60) {
            angleDeg = bestAngle;
            power = bestPower;
        }
    }

    // Baseline random scatter
    const baseScatterA = GAME.difficultyMode === "hard" ? 0.3 : 1.5;
    const baseScatterP = GAME.difficultyMode === "hard" ? 0.2 : 1.0;
    
    angleDeg += (Math.random() * 2 - 1) * baseScatterA;
    power += (Math.random() * 2 - 1) * baseScatterP;

    // ── Difficulty-aware AI error ──────────────────────────
    const errA = GAME.difficultyMode === "easy" ? 15
        : GAME.difficultyMode === "hard" ? 1.0 // Give user a chance (down from perfect 0.05)
            : 3;
    const errP = GAME.difficultyMode === "easy" ? 10
        : GAME.difficultyMode === "hard" ? 0.8 // Give user a chance (down from perfect 0.05)
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
    if (GAME.projectiles.length === 0) return;

    for (let i = GAME.projectiles.length - 1; i >= 0; i--) {
        const p = GAME.projectiles[i];

        // Trail
        p.trail.push({ x: p.x, y: p.y, life: 0.65 });
        if (p.trail.length > 24) p.trail.shift();
        // Full path record (for fire trail on 3-hit streak)
        if (!p.fullTrail) p.fullTrail = [];
        p.fullTrail.push({ x: p.x, y: p.y });

        // Physics
        p.x += p.vx;
        p.y += p.vy;
        p.vy += GAME.gravity;
        p.vx += GAME.wind * 1.15;

        // Homing
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

        // Bounds
        if (p.x < -20 || p.x > GAME.width + 20 || p.y > GAME.height + 60) {
            GAME.projectiles.splice(i, 1);
            if (GAME.projectiles.length === 0) endTurn();
            continue;
        }

        const terrainY = getTerrainY(p.x);
        let hit = false;
        let collider = null;

        // Collision Check
        if (p.y >= terrainY - 2) {
            hit = true;
        } else {
            collider = checkTankHit(p, player) || checkTankHit(p, enemy);
            if (!collider) collider = checkObstacleHit(p);
            if (collider) hit = true;
        }

        if (hit) {
            handleProjectileImpact(p, i, terrainY, collider);
        }
    }
}

function handleProjectileImpact(p, index, terrainY, collider) {
    const isCluster = p.type === "Cluster" && !p.isSplit;
    const isOil = p.type === "Oil";
    const isNapalm = p.type === "Napalm";

    if (isCluster) {
        // Cluster splits into 2 smaller bombs.
        // Those sub-bombs use the existing Submunition impact path (smaller blast/damage).
        const baseSpeed = Math.hypot(p.vx, p.vy);
        const baseAngle = Math.atan2(p.vy, p.vx);

        const shooterTank = p.shooter || (p.owner === "Player" ? player : enemy);

        // Remove the original cluster shell immediately.
        GAME.projectiles.splice(index, 1);

        // Small visual pop (no terrain carving/damage by itself).
        GAME.effects.push({
            type: "explosion",
            x: p.x,
            y: p.y,
            radius: 26,
            timer: 0.28,
            max: 0.28
        });

        // Spawn two submunitions with opposite spread.
        const subSpeed = Math.max(5, baseSpeed * 0.45);
        const spread = 18 * Math.PI / 180;

        for (let i = 0; i < 2; i++) {
            const sign = i === 0 ? -1 : 1;
            const ang = baseAngle + sign * spread + (Math.random() - 0.5) * spread * 0.35;

            GAME.projectiles.push({
                owner: shooterTank ? shooterTank.name : p.owner,
                x: p.x,
                y: p.y,
                vx: Math.cos(ang) * subSpeed,
                vy: Math.sin(ang) * subSpeed,
                radius: 4.6,
                trail: [],
                homing: false,
                animTimer: 0,
                shooter: shooterTank,
                type: "Submunition",
                isSplit: true,
                fullTrail: []
            });
        }

        // endTurn() will be called automatically once all submunitions finish.
        if (GAME.projectiles.length === 0) endTurn();
    } else if (isOil) {
        // Oil Impact
        const splashRadius = 68;
        // Oil does NOT carve craters and does NOT deal damage.
        // It only immobilizes tanks inside the puddle radius.
        
        // Puddle effect
        GAME.effects.push({
            type: "oilPuddle",
            x: p.x,
            y: terrainY,
            radius: splashRadius,
            timer: 3.5,
            max: 3.5
        });

        // Apply Stuck Effect
        [player, enemy].forEach(tank => {
            const dist = Math.abs(tank.x - p.x);
            if (dist < splashRadius + 20) {
                // How many of this tank's own turns it cannot move for.
                tank.stuckTurns = 4;
                GAME.effects.push({
                    type: "text",
                    x: tank.x,
                    y: tank.y - 72,
                    text: "IMMOBILIZED",
                    color: "#f1c40f",
                    timer: 1.8,
                    max: 1.8
                });
            }
        });

        GAME.projectiles.splice(index, 1);
        if (GAME.projectiles.length === 0) endTurn();
    } else if (isNapalm) {
        // Napalm Impact
        // - No crater
        // - Small direct damage only if we hit a tank
        // - Burns for 2 turns in a zone similar to the oil puddle
        const burnRadius = 76;

        // If collision resolution landed on terrain (no collider), still detect direct tank hit.
        const hitTank = (collider instanceof Tank) ? collider : (checkTankHit(p, player) || checkTankHit(p, enemy));
        const centerY = hitTank ? hitTank.y : terrainY;
        GAME.burnZones.push({
            x: p.x,
            y: centerY,
            radius: burnRadius,
            turnsLeft: 2,
            skipNextTick: true // Don't apply burn damage immediately on impact/endTurn
        });

        if (hitTank) {
            // "Little damage" on direct hit; the burn does the rest.
            applyDamage(hitTank, 12);
        }

        GAME.projectiles.splice(index, 1);
        if (GAME.projectiles.length === 0) endTurn();
    } else {
        // Standard Impact
        const radius = p.type === "Submunition" ? 28 : 42;
        const damageMult = p.type === "Submunition" ? 0.6 : 1.0;
        
        explode(p.x, p.y, radius, (collider instanceof Tank ? collider : null), damageMult);
        GAME.projectiles.splice(index, 1);
        
        if (GAME.projectiles.length === 0) endTurn();
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

function spawnFireTrailFromProjectile(proj) {
    if (!proj || !proj.fullTrail || proj.fullTrail.length < 2 || proj.trailSpawned) return;
    proj.trailSpawned = true; // Avoid multiple trails from the same shell
    // Store a snapshot of the flight path as a fire trail effect
    GAME.fireTrails.push({
        owner: proj.shooter === player ? "player" : "enemy",
        points: proj.fullTrail.slice(),   // Copy the full path
        timer: 4.0,                        // Burns for 4 seconds with fade
        max: 4.0,
        seed: Math.random() * 1000        // For staggered flicker animation
    });
}

function applyDamage(tank, amount) {
    if (!tank.alive) return;

    tank.hp = clamp(tank.hp - amount, 0, tank.maxHp);
    tank.hitFlash = 0.18;
    GAME.hitThisTurn = true;

    // ── Track damage dealt & hit streaks ──
    // We walk GAME.projectiles to find the active shooter since applyDamage
    // is called inside explode() which doesn't receive the projectile directly.
    const activeProj = GAME.projectiles.find(pr =>
        (pr.shooter === player && tank === enemy) ||
        (pr.shooter === enemy && tank === player)
    );

    if (activeProj) {
        if (activeProj.shooter === player && tank === enemy) {
            GAME.playerHits++;
            GAME.playerDamageDealt += amount;
            GAME.playerHitStreak++;
            GAME.enemyHitStreak = 0; // enemy missed this exchange
            if (GAME.playerHitStreak >= 3) {
                spawnFireTrailFromProjectile(activeProj);
                // Show streak badge
                GAME.effects.push({
                    type: "text",
                    x: tank.x,
                    y: tank.y - 90,
                    text: `🔥 ${GAME.playerHitStreak}-HIT STREAK!`,
                    color: "#ff6a00",
                    timer: 2.2,
                    max: 2.2
                });
            }
        } else if (activeProj.shooter === enemy && tank === player) {
            GAME.enemyHits++;
            GAME.enemyDamageDealt += amount;
            GAME.enemyHitStreak++;
            GAME.playerHitStreak = 0;
            if (GAME.enemyHitStreak >= 3) {
                spawnFireTrailFromProjectile(activeProj);
                GAME.effects.push({
                    type: "text",
                    x: tank.x,
                    y: tank.y - 90,
                    text: `🔥 ENEMY ${GAME.enemyHitStreak}-HIT STREAK!`,
                    color: "#ff6a00",
                    timer: 2.2,
                    max: 2.2
                });
            }
        }
    } else {
        // Fallback: legacy projectile tracking (kept for backward compat)
        if (GAME.projectile) {
            if (GAME.projectile.shooter === player && tank === enemy) {
                GAME.playerHits++;
                GAME.playerDamageDealt += amount;
            } else if (GAME.projectile.shooter === enemy && tank === player) {
                GAME.enemyHits++;
                GAME.enemyDamageDealt += amount;
            }
        }
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

        if (GAME.mode === 'endless' && tank === enemy) {
            // Endless Mode: Just score and respawn
            GAME.playerScore += 100;
            GAME.killedEnemies++;
            GAME.winner = null; // No winner yet
            GAME.state = "respawning"; // prevent endTurn from passing turn to dead enemy

            setTimeout(() => {
                respawnEnemy();
                GAME.state = "aiming"; // Return to aiming state after explosion
                GAME.turn = "player";  // Give player another turn after a kill
            }, 2000);

            return; // Don't proceed to game over
        }

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
                descEl.textContent = "Great match!";
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

            // Populate battle stats based on winner
            const shots = isPlayerWinner ? GAME.playerShots : GAME.enemyShots;
            const hits = isPlayerWinner ? GAME.playerHits : GAME.enemyHits;
            const dmg = isPlayerWinner ? GAME.playerDamageDealt : GAME.enemyDamageDealt;
            const acc = shots > 0 ? Math.min(100, Math.round((hits / shots) * 100)) : 0;

            document.getElementById("statShots").textContent = shots;
            document.getElementById("statHits").textContent = hits;
            document.getElementById("statAccuracy").textContent = acc + "%";
            document.getElementById("statDamage").textContent = Math.round(dmg);

            document.getElementById("gameOverScreen").classList.remove("hidden");
        }, 1500);
    }
}

function explode(x, y, radius, directTank, damageMult = 1.0) {
    carveTerrain(x, y, Math.max(radius, 42));
    GAME.screenShake = Math.max(GAME.screenShake, 8 * damageMult);

    // ── SFX ──
    if (typeof SFX !== "undefined") {
        SFX.play("shellHit", Math.min(1, (0.6 + radius / 80) * damageMult));
    }

    GAME.effects.push({
        type: "explosion",
        x,
        y,
        radius: radius * damageMult,
        timer: 0.55,
        max: 0.55
    });

    GAME.effects.push({
        type: "smoke",
        x,
        y,
        timer: 1.1,
        max: 1.1,
        radius: radius * 0.8 * damageMult
    });

    // Add level-specific crater decoration
    const lv = Math.min(GAME.level, 4);
    const craterNum = Math.floor(Math.random() * 3) + 1;
    GAME.craters.push({
        x, y,
        r: radius * 1.2 * damageMult,
        key: `crater${craterNum}_war${lv}_${GAME.theme}`,
        rotation: (Math.random() - 0.5) * 0.6
    });
    if (GAME.craters.length > 20) GAME.craters.shift();

    for (let i = 0; i < Math.floor(12 * damageMult); i++) {
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
            const baseDamage = radius * 0.9;
            const damage = Math.max(5, Math.round((baseDamage - dist * 0.38) * damageMult));
            applyDamage(tank, damage);
        }
    });

    GAME.obstacles.forEach(obs => {
        if (!obs.alive) return;
        let oy = obs.y !== undefined ? obs.y : getTerrainY(obs.x);
        const dist = Math.hypot(obs.x - x, (oy - obs.height / 2) - y);
        if (dist <= radius + Math.max(obs.width, obs.height) / 2 + 10) {
            const damage = Math.max(10, Math.round((50 - dist * 0.45) * damageMult));
            obs.hp -= damage;
            if (obs.hp <= 0) obs.alive = false;
        }
    });

    if (directTank) applyDamage(directTank, 8 * damageMult);
}

function endTurn() {
    if (GAME.winner || GAME.state === "respawning") return;

    // The tank whose turn we are ending (status ticks should happen when the tank acts).
    const actorTank = GAME.turn === "player" ? player : enemy;

    GAME.state = "aiming";
    GAME.turn = GAME.turn === "player" ? "enemy" : "player";

    if (!GAME.hitThisTurn) {
        if (actorTank === player) {
            GAME.playerHitStreak = 0;
        } else {
            GAME.enemyHitStreak = 0;
        }
    }
    GAME.hitThisTurn = false;

    // ── Dynamic Wind Fluctuation ──
    const windMax = GAME.difficultyMode === "easy" ? 0.045 : (GAME.difficultyMode === "hard" ? 0.16 : 0.09);
    // Completely randomizes wind direction and strength each turn
    GAME.wind = (Math.random() * 2 - 1) * windMax;

    // Only tick stuck status for the tank that just finished its turn.
    if (actorTank.stuckTurns > 0) actorTank.stuckTurns--;

    // Keep existing behavior for other turn-based effects.
    [player, enemy].forEach(tank => {
        if (tank.effectTurns > 0) {
            tank.effectTurns--;
            if (tank.effectTurns <= 0) {
                tank.scale = 1.0;
            }
        }
    });

    // Napalm burn zones: apply damage while they last.
    if (GAME.burnZones && GAME.burnZones.length > 0) {
        const burnDamagePerTurn = 7; // "Little damage" over time
        for (let i = GAME.burnZones.length - 1; i >= 0; i--) {
            const zone = GAME.burnZones[i];

            if (zone.skipNextTick) {
                zone.skipNextTick = false;
                continue;
            }

            [player, enemy].forEach(tank => {
                if (!tank.alive) return;
                const distX = Math.abs(tank.x - zone.x);
                if (distX <= zone.radius) {
                    applyDamage(tank, burnDamagePerTurn);
                }
            });

            if (GAME.winner) return;

            zone.turnsLeft--;
            if (zone.turnsLeft <= 0) {
                GAME.burnZones.splice(i, 1);
            }
        }
    }

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

    // Block controls if any tank is parachuting to avoid animation skips and floating issues
    if (player.state === "parachuting" || enemy.state === "parachuting") return;

    const moveSpeed = 86;
    let moved = false;

    const isPlayerTurn = GAME.turn === 'player';
    const tank = isPlayerTurn ? player : enemy;
    const isStuck = tank.stuckTurns > 0;

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

    // Stuck tanks cannot move horizontally, but can still change angle/power.
    if (!isStuck) {
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
        // If stuck, skip movement this turn and go straight to aiming/shooting.
        if (enemy.stuckTurns > 0) {
            enemy.state = "idle";
            GAME.state = "thinking";
            setTimeout(() => {
                if (!GAME.winner) {
                    GAME.state = "aiming";
                    applyAIShot();
                }
            }, 600);
            return;
        }

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
