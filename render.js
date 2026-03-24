function drawCloud(x, y, w, h) {
    ctx.beginPath();
    ctx.arc(x, y, h * 0.42, 0, Math.PI * 2);
    ctx.arc(x + w * 0.22, y - h * 0.16, h * 0.5, 0, Math.PI * 2);
    ctx.arc(x + w * 0.48, y - h * 0.1, h * 0.58, 0, Math.PI * 2);
    ctx.arc(x + w * 0.72, y, h * 0.46, 0, Math.PI * 2);
    ctx.fill();
}

function drawBackground() {
    if (GAME.bgCanvas) {
        ctx.drawImage(GAME.bgCanvas, 0, 0);
    } else {
        const grad = ctx.createLinearGradient(0, 0, 0, GAME.height);
        grad.addColorStop(0, "#2c3b4a");
        grad.addColorStop(1, "#12181f");
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, GAME.width, GAME.height);
    }

    GAME.clouds.forEach(cloud => {
        ctx.fillStyle = "rgba(255,255,255,0.18)";
        drawCloud(cloud.x, cloud.y, cloud.w, cloud.h);
    });
}

function drawBush(x, y, scale) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    ctx.fillStyle = "#356f2d";
    ctx.beginPath();
    ctx.arc(-8, 0, 10, 0, Math.PI * 2);
    ctx.arc(2, -6, 12, 0, Math.PI * 2);
    ctx.arc(12, 1, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
}

function drawRock(x, y, scale) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    ctx.fillStyle = "#7d7f85";
    ctx.beginPath();
    ctx.moveTo(-18, 10);
    ctx.lineTo(-10, -10);
    ctx.lineTo(8, -16);
    ctx.lineTo(22, -4);
    ctx.lineTo(18, 12);
    ctx.lineTo(0, 18);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,0.2)";
    ctx.stroke();
    ctx.restore();
}

function drawTerrain() {
    // Only show the terrain canvas when the battle has started (not on the intro screen)
    if (GAME.state === "intro") return;
    if (GAME.terrainCanvas) {
        ctx.drawImage(GAME.terrainCanvas, 0, 0);
    }
}

function roundRect(ctx, x, y, w, h, r, fill, stroke) {
    const radius = Math.min(Math.abs(w), Math.abs(h), r);
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + w - radius, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
    ctx.lineTo(x + w, y + h - radius);
    ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
    ctx.lineTo(x + radius, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
    if (fill) ctx.fill();
    if (stroke) ctx.stroke();
}

function drawTank(tank) {
    const x = tank.x;
    const y = tank.y;
    const angle = tank.state === "parachuting" ? 0 : getTerrainAngle(x); // No rotation when parachuting
    const flashAlpha = tank.hitFlash > 0 ? 0.45 : 0;
    const prefix = tank.color === "green" ? "blue" : "red";
    const dir = tank.facing === 1 ? "right" : "left";

    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.translate(x, y + (tank.state === "parachuting" ? 0 : Math.sin(tank.bob) * 0.6)); // No bob when parachuting
    ctx.rotate(angle);
    ctx.scale(tank.scale, tank.scale);

    let state = tank.state;
    if (!tank.alive && state !== "exploding") {
        state = "exploding";
    }

    if (state === "parachuting") {
        // Use dedicated parachute tank image, or fallback to composition
        const parachuteTankKey = tank.color === "green" ? "tankBlueParachute" : "tankRedParachute";
        const parachuteTankImg = IMAGES[parachuteTankKey];
        if (parachuteTankImg && parachuteTankImg.complete && parachuteTankImg.width > 0) {
            ctx.drawImage(parachuteTankImg, -48, -72, 96, 96);
        } else {
            // Draw parachute so bottom touches the tank's top
            const paraImg = IMAGES["parachute"];
            if (paraImg && paraImg.complete && paraImg.width > 0) {
                ctx.drawImage(paraImg, -32, -136, 64, 64);
            }
            // Draw tank using same base offsets as normal tank so ground alignment is consistent
            const tankImg = IMAGES[`${prefix}_idle_${dir}`];
            if (tankImg && tankImg.complete && tankImg.width > 0) {
                ctx.drawImage(tankImg, -48, -72, 96, 96);
            }
        }
    } else {
        let key = `${prefix}_${state}_${dir}`;
        if (state === "idle") key = `${prefix}_idle_${dir}`;
        else if (state === "moving") key = `${prefix}_move_${dir}`;
        else if (state === "firing") key = `${prefix}_fire_${dir}`;
        else if (state === "exploding") key = `${prefix}_explode_${dir}`;
        else key = `${prefix}_idle_${dir}`;

        let img = IMAGES[key];

        if (img && img.complete && img.width > 0) {
            if (state === "idle") {
                ctx.drawImage(img, -48, -72, 96, 96);
            } else {
                let cols = Math.floor(img.width / 64) || 1;
                let rows = Math.floor(img.height / 64) || 1;
                let totalFrames = cols * rows;

                let frame = tank.animFrame % totalFrames;
                if (state === "exploding" && tank.animFrame >= totalFrames - 1) {
                    frame = totalFrames - 1;
                }
                if (state === "firing" && tank.animFrame >= totalFrames - 1) {
                    frame = totalFrames - 1;
                }

                let sx = (frame % cols) * 64;
                let sy = Math.floor(frame / cols) * 64;

                ctx.drawImage(img, sx, sy, 64, 64, -48, -72, 96, 96);
            }
        } else {
            ctx.fillStyle = tank.color;
            ctx.fillRect(-36, -30, 72, 30);
        }
    }

    if (flashAlpha > 0) {
        ctx.globalCompositeOperation = "source-atop";
        ctx.fillStyle = `rgba(255,255,255,${flashAlpha})`;
        ctx.fillRect(-80, -80, 160, 160);
    }

    ctx.restore();
}

function drawAimGuide() {
    if (GAME.state !== "aiming" || GAME.winner) return;

    // Only show aim guide for human-controlled turn(s).
    if (GAME.mode !== 'multiplayer' && GAME.turn !== 'player') return;

    const activeTank = GAME.turn === 'player' ? player : enemy;
    const muzzle = activeTank.muzzlePoint();
    const rad = activeTank.angle * Math.PI / 180;
    const preview = [];

    let x = muzzle.x;
    let y = muzzle.y;
    let vx = Math.cos(rad) * activeTank.power * 0.165;
    let vy = Math.sin(rad) * activeTank.power * 0.165;

    for (let i = 0; i < 35; i++) {
        // Step 2 frames per iteration to preview trajectory far out efficiently
        x += vx; y += vy; vy += GAME.gravity; vx += GAME.wind;
        x += vx; y += vy; vy += GAME.gravity; vx += GAME.wind;
        preview.push({ x, y });
        if (y > getTerrainY(x)) break;
    }

    ctx.save();
    for (let i = 0; i < preview.length; i++) {
        const p = preview[i];
        ctx.globalAlpha = 1 - i / preview.length;
        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.arc(p.x, p.y, 2.4 - i * 0.03, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.restore();
}

function drawProjectile() {
    const p = GAME.projectile;
    if (!p) return;

    ctx.save();

    if (p.trail.length > 1) {
        ctx.beginPath();
        for (let i = 0; i < p.trail.length; i++) {
            const t = p.trail[i];
            const alpha = (t.life * 0.7) * (i / p.trail.length);
            if (i === 0) ctx.moveTo(t.x, t.y);
            else ctx.lineTo(t.x, t.y);
        }
        ctx.strokeStyle = "rgba(234,239,255,0.85)";
        ctx.lineWidth = 2;
        ctx.globalAlpha = 0.55;
        ctx.stroke();
    }

    for (const t of p.trail) {
        ctx.globalAlpha = t.life * 0.7;
        ctx.fillStyle = "rgba(248,248,255,0.97)";
        ctx.beginPath();
        ctx.arc(t.x, t.y, 4.0 * t.life, 0, Math.PI * 2);
        ctx.fill();
    }

    ctx.restore();

    ctx.save();
    ctx.translate(p.x, p.y);
    const angle = Math.atan2(p.vy, p.vx);
    ctx.rotate(angle);

    if (p.homing) {
        const frame = Math.floor(p.animTimer) % 2 === 0 ? "missile1" : "missile2";
        const img = IMAGES[frame];
        if (img) {
            ctx.drawImage(img, -24, -12, 48, 24);
        } else {
            ctx.fillStyle = "#ff4444";
            ctx.fillRect(-12, -4, 24, 8);
        }
    } else {
        ctx.fillStyle = "#6b7179";
        roundRect(ctx, -8, -4, 16, 8, 3, true, false);
        ctx.fillStyle = "#c7ccd3";
        roundRect(ctx, 2, -3, 6, 6, 2, true, false);
    }
    ctx.restore();
}

function drawObstacles() {
    GAME.obstacles.forEach(obs => {
        if (!obs.alive) return;
        let oy = obs.y !== undefined ? obs.y : getTerrainY(obs.x);
        let angle = getTerrainAngle(obs.x);
        ctx.save();
        ctx.translate(obs.x, oy);
        ctx.rotate(angle);

        let drawn = false;
        if (obs.type === "image" && obs.imgKey) {
            const img = IMAGES[obs.imgKey];
            if (img && (img.width > 0 || img.naturalWidth > 0)) {
                ctx.drawImage(img, -obs.width / 2, -obs.height, obs.width, obs.height);
                drawn = true;
            }
        }

        if (!drawn) {
            if (obs.type === "bunker") {
                ctx.fillStyle = "#5a5c62";
                ctx.beginPath();
                ctx.moveTo(-obs.width / 2, 0);
                ctx.lineTo(-obs.width / 2, -obs.height + 14);
                ctx.quadraticCurveTo(0, -obs.height - 10, obs.width / 2, -obs.height + 14);
                ctx.lineTo(obs.width / 2, 0);
                ctx.fill();

                ctx.lineWidth = 3;
                ctx.strokeStyle = "#38393d";
                ctx.stroke();

                ctx.fillStyle = "#111";
                ctx.fillRect(-obs.width / 4, -obs.height / 1.5, obs.width / 2, 8);
            } else {
                drawRock(0, -obs.height / 2, obs.width / 30);
            }
        }

        // Health bar for the obstacle
        ctx.fillStyle = "rgba(0,0,0,0.5)";
        ctx.fillRect(-obs.width / 2, -obs.height - 14, obs.width, 5);
        ctx.fillStyle = "#7aff7a";
        ctx.fillRect(-obs.width / 2, -obs.height - 14, Math.max(0, obs.width * (obs.hp / obs.maxHp)), 5);

        // Damage smoke state
        if (obs.hp < obs.maxHp) {
            ctx.fillStyle = "rgba(0,0,0,0.5)";
            const smokeRadius = (1 - obs.hp / obs.maxHp) * Math.max(obs.width, obs.height) * 0.4;
            ctx.beginPath();
            ctx.arc(0, -obs.height / 2, smokeRadius, 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.restore();
    });
}

function drawEffects() {
    for (const effect of GAME.effects) {
        const progress = 1 - effect.timer / effect.max;

        if (effect.type === "muzzle") {
            ctx.save();
            ctx.translate(effect.x, effect.y);
            ctx.rotate(effect.angle);
            ctx.globalAlpha = 1 - progress;

            const grad = ctx.createRadialGradient(0, 0, 1, 0, 0, 34);
            grad.addColorStop(0, "rgba(255,255,255,1)");
            grad.addColorStop(0.35, "rgba(255,235,140,0.95)");
            grad.addColorStop(1, "rgba(255,120,30,0)");

            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(34, -11);
            ctx.lineTo(24, 0);
            ctx.lineTo(34, 11);
            ctx.closePath();
            ctx.fill();
            ctx.restore();
        }

        if (effect.type === "explosion" || effect.type === "bigExplosion") {
            const scale = effect.type === "bigExplosion" ? 1.45 : 1;
            const r = effect.radius * (0.25 + progress) * scale;

            ctx.save();
            ctx.globalAlpha = 1 - progress * 0.9;
            const grad = ctx.createRadialGradient(effect.x, effect.y, 2, effect.x, effect.y, r);
            grad.addColorStop(0, "rgba(255,255,240,1)");
            grad.addColorStop(0.22, "rgba(255,223,110,0.95)");
            grad.addColorStop(0.6, "rgba(255,130,40,0.82)");
            grad.addColorStop(1, "rgba(110,30,20,0)");
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(effect.x, effect.y, r, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }

        if (effect.type === "smoke") {
            ctx.save();
            ctx.globalAlpha = 0.5 * (1 - progress);
            for (let i = 0; i < 5; i++) {
                ctx.fillStyle = "rgba(80,80,80,0.7)";
                ctx.beginPath();
                ctx.arc(
                    effect.x + Math.sin(i * 1.3) * 18 * progress,
                    effect.y - 15 * progress - i * 6,
                    effect.radius * 0.18 + i * 3,
                    0,
                    Math.PI * 2
                );
                ctx.fill();
            }
            ctx.restore();
        }

        if (effect.type === "dirtSplash") {
            if (!effect.soundPlayed) {
                effect.soundPlayed = true;
                if (typeof SFX !== "undefined") {
                    SFX.play("tankLanding", 1.0);
                }
            }
            const splash = Math.max(0, 1 - effect.timer / effect.max);
            const radius = effect.radius * splash;
            ctx.save();
            ctx.globalAlpha = 0.8 * (1 - splash);
            ctx.fillStyle = "rgba(120, 92, 46, 0.95)";
            const particles = 14;
            for (let i = 0; i < particles; i++) {
                const angle = (i / particles) * Math.PI * 2 + (effect.seed || 0);
                const distance = radius * (0.35 + Math.random() * 0.7);
                const px = effect.x + Math.cos(angle) * distance;
                const py = effect.y + Math.sin(angle) * distance * 0.4;
                const pr = 2 + Math.random() * 3;
                ctx.beginPath();
                ctx.arc(px, py, pr * (1 - splash), 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.restore();
        }
    }

    GAME.debris.forEach(d => {
        ctx.save();
        ctx.globalAlpha = Math.max(0, d.life);
        ctx.fillStyle = "#6d5233";
        ctx.fillRect(d.x, d.y, d.size, d.size);
        ctx.restore();
    });
}

function drawPanelText(x, y, text, color, size = 16) {
    ctx.fillStyle = color;
    ctx.font = `${size >= 16 ? "700" : "500"} ${size}px Arial`;
    ctx.fillText(text, x, y);
}

function drawGauge(cx, cy, radius, angleValue, min, max, color) {
    ctx.save();
    ctx.translate(cx, cy);

    ctx.strokeStyle = "rgba(10,18,26,0.85)";
    ctx.lineWidth = 12;
    ctx.beginPath();
    ctx.arc(0, 0, radius, Math.PI, 0);
    ctx.stroke();

    ctx.strokeStyle = color;
    ctx.lineWidth = 10;
    const percent = clamp((angleValue - min) / (max - min), 0, 1);
    ctx.beginPath();
    ctx.arc(0, 0, radius, Math.PI, Math.PI + Math.PI * percent);
    ctx.stroke();

    const needleAngle = Math.PI + Math.PI * percent;
    ctx.strokeStyle = "#f3f8ff";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(Math.cos(needleAngle) * (radius - 8), Math.sin(needleAngle) * (radius - 8));
    ctx.stroke();

    ctx.fillStyle = "rgba(10,18,26,0.9)";
    ctx.beginPath();
    ctx.arc(0, 0, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
}

function updateEffects(dt) {
    GAME.effects.forEach(effect => effect.timer -= dt);
    GAME.effects = GAME.effects.filter(effect => effect.timer > 0);

    GAME.debris.forEach(d => {
        d.x += d.vx;
        d.y += d.vy;
        d.vy += 0.12;
        d.life -= dt;
    });

    GAME.debris = GAME.debris.filter(d => d.life > 0 && d.y < GAME.height + 30);

    [player, enemy].forEach(tank => {
        tank.hitFlash = Math.max(0, tank.hitFlash - dt);

        let prefix = tank.color === "green" ? "blue" : "red";
        let dir = tank.facing === 1 ? "right" : "left";

        if (tank.state === "moving" && tank.alive) {
            tank.animTimer += dt * 10;
            if (tank.animTimer > 1) {
                tank.animTimer = 0;
                tank.animFrame++;
            }
        } else if (tank.state === "firing") {
            tank.animTimer += dt * 15;
            if (tank.animTimer > 1) {
                tank.animTimer = 0;
                tank.animFrame++;
                let key = `${prefix}_fire_${dir}`;
                let img = IMAGES[key];
                let frames = img ? Math.floor(img.width / 64) * Math.floor(img.height / 64) : 12;
                if (!frames || frames <= 0) frames = 1;

                if (tank.animFrame >= frames) {
                    tank.state = "idle";
                }
            }
        } else if (tank.state === "exploding") {
            tank.animTimer += dt * 10;
            if (tank.animTimer > 1) {
                tank.animTimer = 0;
                tank.animFrame++;
                let key = `${prefix}_explode_${dir}`;
                let img = IMAGES[key];
                let frames = img ? Math.floor(img.width / 64) * Math.floor(img.height / 64) : 12;
                if (!frames || frames <= 0) frames = 1;

                if (tank.animFrame >= frames - 1) {
                    tank.animFrame = frames - 1;
                }
            }
        }
    });

    GAME.flashTimer = Math.max(0, GAME.flashTimer - dt);
    GAME.screenShake = Math.max(0, GAME.screenShake - dt * 20);
}

function drawCraters() {
    for (const c of GAME.craters) {
        const img = IMAGES[c.key];
        if (img && img.complete && img.naturalWidth > 0) {
            ctx.save();
            ctx.globalAlpha = 0.82;
            ctx.translate(c.x, c.y);
            ctx.rotate(c.rotation);
            ctx.drawImage(img, -c.r, -c.r * 0.5, c.r * 2, c.r);
            ctx.restore();
        }
    }
}

function drawCanvasHUD() {
    // Draw simple but sleek health bars on canvas
    const margin = 20;
    const barW = 240;
    const barH = 14;

    // Player HP Bar (Left)
    drawBar(margin, margin, barW, barH, player.hp / player.maxHp, "#71e07a", player.name || "COMMANDER", player.angle, player.power);

    // Enemy HP Bar (Right)
    drawBar(GAME.width - barW - margin, margin, barW, barH, enemy.hp / enemy.maxHp, "#ff6b6b", enemy.name || "ENEMY ACES", enemy.angle, enemy.power);

    // Center Display (Round, Score, Wind, Turn)
    drawCenterStats();
}

function drawCenterStats() {
    const cx = GAME.width / 2;
    const panelW = 320;
    const panelH = 72;
    const px = cx - panelW / 2;
    const py = 10;

    // Background panel
    ctx.fillStyle = "rgba(6, 14, 24, 0.82)";
    ctx.strokeStyle = "rgba(255, 255, 255, 0.1)";
    ctx.lineWidth = 1;
    roundRect(ctx, px, py, panelW, panelH, 14, true, true);

    // Accent top border line
    ctx.fillStyle = "rgba(255, 213, 79, 0.6)";
    ctx.fillRect(px + 20, py, panelW - 40, 2);

    // Row 1 – Label
    ctx.font = "bold 9px 'Orbitron', sans-serif";
    ctx.fillStyle = "rgba(255, 255, 255, 0.35)";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillText(`ROUND ${GAME.round}`, cx, py + 7);

    // Row 2 – Score
    ctx.font = "bold 24px 'Orbitron', sans-serif";
    ctx.fillStyle = "#ffffff";
    ctx.fillText(`${GAME.playerScore}  —  ${GAME.enemyScore}`, cx, py + 20);

    // Row 3 – Turn indicator
    const isPlayer = GAME.turn === "player";
    const turnName = (isPlayer ? player.name : enemy.name) || (isPlayer ? "PLAYER" : "ENEMY");
    ctx.font = "bold 10px 'Orbitron', sans-serif";
    ctx.fillStyle = isPlayer ? "#71e07a" : "#ff6b6b";
    const turnText = isPlayer ? `▶  ${turnName.toUpperCase()} TURN` : `${turnName.toUpperCase()} TURN  ◀`;
    ctx.fillText(turnText, cx, py + 50);

    // Wind block – left side
    const ws = GAME.wind;
    const wDir = ws > 0.01 ? "→" : (ws < -0.01 ? "←" : "•");
    const windText = (Math.abs(ws) * 100).toFixed(1);
    ctx.textAlign = "left";
    ctx.font = "bold 9px 'Orbitron', sans-serif";
    ctx.fillStyle = "rgba(255,255,255,0.38)";
    ctx.fillText("WIND", px + 14, py + 18);
    ctx.font = "600 14px 'Rajdhani', sans-serif";
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.fillText(wDir + " " + windText, px + 14, py + 32);

    // Stats block – right side
    ctx.textAlign = "right";
    ctx.font = "bold 9px 'Orbitron', sans-serif";
    ctx.fillStyle = "rgba(255,255,255,0.38)";
    ctx.fillText("SHOTS / HITS", px + panelW - 14, py + 18);
    ctx.font = "600 14px 'Rajdhani', sans-serif";
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.fillText(`${GAME.playerShots} / ${GAME.playerHits}`, px + panelW - 14, py + 32);
}

function drawBar(x, y, w, h, percent, color, label, angle, power) {
    // Background
    ctx.fillStyle = "rgba(6, 14, 24, 0.8)";
    roundRect(ctx, x, y, w, h, 7, true, true);

    // Fill
    if (percent > 0) {
        ctx.fillStyle = color;
        roundRect(ctx, x, y, w * percent, h, 7, true, false);

        // Glow effect
        ctx.save();
        ctx.shadowBlur = 12;
        ctx.shadowColor = color;
        ctx.stroke();
        ctx.restore();
    }

    // Label
    ctx.fillStyle = "#fff";
    ctx.font = "bold 13px 'Orbitron', sans-serif";
    ctx.textAlign = label === "COMMANDER" ? "left" : "right";
    ctx.textBaseline = "top";
    ctx.fillText(label, x + (label === "COMMANDER" ? 0 : w), y + h + 10);

    // Stats Sub-labels (Angle & Power)
    ctx.font = "600 12px 'Rajdhani', sans-serif";
    ctx.fillStyle = "rgba(255,255,255,0.7)";
    const statText = `ANG: ${Math.round(label === "COMMANDER" ? -angle : angle + 180)}°  |  PWR: ${Math.round(power)}%`;
    ctx.textAlign = label === "COMMANDER" ? "left" : "right";
    ctx.fillText(statText, x + (label === "COMMANDER" ? 0 : w), y + h + 28);

    // HP Percentage
    ctx.fillStyle = color;
    ctx.font = "bold 12px 'Orbitron', sans-serif";
    ctx.textAlign = label === "COMMANDER" ? "right" : "left";
    ctx.fillText(Math.round(percent * 100) + "%", x + (label === "COMMANDER" ? w : 0), y + h + 10);
}

function drawWindOverlay() {
    if (GAME.state === "intro" || GAME.winner) return;
    const ws = GAME.wind;
    if (Math.abs(ws) < 0.005) return;

    // Draw animated wind streaks across the canvas
    ctx.save();
    const strength = Math.min(1, Math.abs(ws) * 12);
    const numStreaks = Math.ceil(18 + Math.abs(ws) * 170);
    const t = (Date.now() / 1000) % 1;

    for (let i = 0; i < numStreaks; i++) {
        const seed = (i * 0.6180339887) % 1;
        const y = 40 + seed * (GAME.height - 90);
        const len = 40 + seed * (80 + Math.abs(ws) * 40);
        const ox = ((seed + t * Math.sign(ws)) % 1) * (GAME.width + len) - len * 0.5;
        const alpha = 0.08 + seed * 0.22 * strength;

        ctx.globalAlpha = alpha;
        ctx.strokeStyle = `rgba(190,220,255,${0.5 + strength * 0.4})`;
        ctx.lineWidth = 1 + seed * 2;
        ctx.beginPath();
        ctx.moveTo(ox, y);
        ctx.lineTo(ox + (ws > 0 ? len : -len), y + (seed - 0.5) * 10);
        ctx.stroke();
    }

    // Big wind direction arrow at top center for strong wind
    if (Math.abs(ws) > 0.02) {
        const arrowSize = Math.min(120, 60 + Math.abs(ws) * 330);
        const centerX = GAME.width / 2;
        const centerY = 34;
        const dir = ws > 0 ? 1 : -1;

        ctx.beginPath();
        ctx.moveTo(centerX - dir * arrowSize * 0.45, centerY);
        ctx.lineTo(centerX + dir * arrowSize * 0.45, centerY);
        ctx.strokeStyle = `rgba(255,255,255,${0.75 + strength * 0.25})`;
        ctx.lineWidth = 5;
        ctx.stroke();

        ctx.fillStyle = `rgba(255,255,255,${0.8 + strength * 0.2})`;
        ctx.beginPath();
        const head = arrowSize * 0.11;
        const bx = centerX + dir * arrowSize * 0.45;
        ctx.moveTo(bx, centerY);
        ctx.lineTo(bx - dir * head, centerY - head * 0.8);
        ctx.lineTo(bx - dir * head, centerY + head * 0.8);
        ctx.closePath();
        ctx.fill();
    }

    ctx.restore();
}

function drawHint() {
    if (!GAME.showHint || GAME.turn !== "player" || GAME.state !== "aiming") return;

    const alpha = Math.min(1, GAME.hintTimer * 0.5);
    const cx = GAME.width / 2;
    const cy = GAME.height - 48;

    ctx.save();
    ctx.globalAlpha = alpha;

    // Background pill
    const text = "A/D: Move  |  ↑↓: Aim  |  ←→: Power  |  Space: Fire  |  ESC: Pause";
    ctx.font = "bold 13px 'Rajdhani', Arial";
    const tw = ctx.measureText(text).width;
    const pw = tw + 32, ph = 28;

    ctx.fillStyle = "rgba(6,14,24,0.82)";
    roundRect(ctx, cx - pw / 2, cy - ph / 2, pw, ph, 14, true, true);

    ctx.fillStyle = "rgba(255,213,79,0.85)";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, cx, cy);
    ctx.restore();
}

function updatePowerUps(dt) {
    GAME.powerUps.forEach(pu => {
        if (pu.pickedUp) return;
        pu.bob += dt * 2;

        // Keep power up on terrain if it changes (craters)
        pu.y = getTerrainY(pu.x);
        const pickupDist = 68;
        [player, enemy].forEach(tank => {
            const opponent = tank === player ? enemy : player;
            const tankCenterY = tank.y - 24 * tank.scale;
            const puCenterY = pu.y - 45;
            const dist = Math.hypot(tank.x - pu.x, tankCenterY - puCenterY);

            if (dist < pickupDist && !pu.pickedUp) {
                pu.pickedUp = true;
                // ── SFX ──
                if (typeof SFX !== "undefined") SFX.play("powerUp");
                if (pu.type === "size") {
                    tank.scale = 0.6;
                    tank.effectTurns = 4;
                } else if (pu.type === "grow") {
                    opponent.scale = 1.5;
                    opponent.effectTurns = 4;
                } else if (pu.type === "missile") {
                    tank.state = "firing";
                    tank.animFrame = 0;
                    spawnProjectile(tank, true);
                    updateHUD();
                }

                GAME.effects.push({
                    type: "muzzle",
                    x: pu.x,
                    y: pu.y - 45,
                    angle: -Math.PI / 2,
                    timer: 0.4,
                    max: 0.4
                });
            }
        });

    });
    GAME.powerUps = GAME.powerUps.filter(pu => !pu.pickedUp);
}

function drawPowerUps() {
    GAME.powerUps.forEach(pu => {
        ctx.save(); ctx.translate(pu.x, pu.y - 45 + Math.sin(pu.bob) * 12);

        ctx.fillStyle = pu.type === "size" ? "rgba(120, 230, 255, 0.35)" : "rgba(255, 120, 255, 0.35)";
        ctx.strokeStyle = "rgba(255, 255, 255, 0.7)";
        ctx.lineWidth = 3;

        const r = 34;
        const pSize = 4;
        for (let x = -r; x <= r; x += pSize) {
            for (let y = -r; y <= r; y += pSize) {
                if (x * x + y * y <= r * r) {
                    if ((Math.abs(x) + Math.abs(y)) % (pSize * 2) === 0) {
                        ctx.fillRect(x, y, pSize, pSize);
                    }
                }
            }
        }

        ctx.beginPath();
        for (let a = 0; a < Math.PI * 2; a += Math.PI / 12) {
            const bx = Math.round((Math.cos(a) * r) / pSize) * pSize;
            const by = Math.round((Math.sin(a) * r) / pSize) * pSize;
            if (a === 0) ctx.moveTo(bx, by);
            else ctx.lineTo(bx, by);
        }
        ctx.closePath();
        ctx.stroke();

        // Only draw the correct icon inside
        const isMissile = pu.type === "missile";
        const icon = isMissile ? IMAGES["missile1"] : IMAGES["size_power_up"];
        if (icon) {
            ctx.save();
            ctx.rotate(Math.sin(pu.bob * 0.5) * 0.15);
            if (!isMissile) {
                ctx.filter = pu.type === "size" ? "none" : "hue-rotate(120deg)";
            }
            const s = pu.type === "size" ? 42 : (isMissile ? 54 : 54);
            ctx.drawImage(icon, -s / 2, -s / 2, s, s);
            ctx.filter = "none";
            ctx.restore();
        }

        ctx.restore();

    });
}
