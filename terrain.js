function createTerrain() {
    GAME.terrain.length = 0;
    const lv = Math.min(GAME.level, 4); // cap at 4 (procedural levels reuse war1-4)
    const theme = GAME.theme;
    const platKey = `plat_war${lv}_${theme}`;
    const img = IMAGES[platKey];

    // Background Canvas (Sky, Sun, Buildings, Decor)
    GAME.bgCanvas = document.createElement("canvas");
    GAME.bgCanvas.width = GAME.width;
    GAME.bgCanvas.height = GAME.height;
    const bgCtx = GAME.bgCanvas.getContext("2d");

    // Foreground Terrain Canvas (Road/Trenches)
    GAME.terrainCanvas = document.createElement("canvas");
    GAME.terrainCanvas.width = GAME.width;
    GAME.terrainCanvas.height = GAME.height;
    const tctx = GAME.terrainCanvas.getContext("2d");

    // Helper: draw an image key full-canvas to background
    const drawBgLayer = (key, opacity = 1) => {
        const im = IMAGES[key];
        if (im && im.complete && im.naturalWidth > 0) {
            bgCtx.save();
            bgCtx.globalAlpha = opacity;
            bgCtx.drawImage(im, 0, 0, GAME.width, GAME.height);
            bgCtx.restore();
        }
    };

    // ── Procedural fallback (used when road image is missing or for levels 5-9)
    const fallback = () => {
        const seed = Math.random() * 1000;
        const diffBump = Math.min((GAME.difficulty - 1) * 25, 150);
        const hillH = 60 + Math.random() * 80 + diffBump;
        for (let x = 0; x <= GAME.width; x += 4) {
            let y = 450 + Math.sin(x / 150 + seed) * hillH + Math.sin(x / 50 + seed) * 15;
            if (x < 200) y = y * (x / 200) + 400 * (1 - x / 200);
            if (x > GAME.width - 200) y = y * ((GAME.width - x) / 200) + 400 * (1 - (GAME.width - x) / 200);
            GAME.terrain.push({ x, y });
        }
        const r = 20 + Math.floor(Math.random() * 40);
        const g = 30 + Math.floor(Math.random() * 60);
        const b = 25 + Math.floor(Math.random() * 30);

        // Draw basic sky/grad to bgCanvas
        const grad = bgCtx.createLinearGradient(0, 0, 0, GAME.height);
        grad.addColorStop(0, "#2c3b4a");
        grad.addColorStop(1, "#12181f");
        bgCtx.fillStyle = grad;
        bgCtx.fillRect(0, 0, GAME.width, GAME.height);

        // Draw terrain to terrainCanvas
        tctx.fillStyle = `rgba(${r},${g},${b},0.94)`;
        tctx.beginPath();
        tctx.moveTo(0, GAME.height);
        for (const p of GAME.terrain) tctx.lineTo(p.x, p.y);
        tctx.lineTo(GAME.width, GAME.height);
        tctx.closePath();
        tctx.fill();
        tctx.lineWidth = 12;
        tctx.strokeStyle = `rgba(${r + 30},${g + 40},${b + 30},0.8)`;
        tctx.beginPath();
        tctx.moveTo(GAME.terrain[0].x, GAME.terrain[0].y);
        for (const p of GAME.terrain) tctx.lineTo(p.x, p.y);
        tctx.stroke();
    };

    if (img && img.complete && img.naturalWidth > 0) {
        try {
            // 1️⃣  Sky layer
            drawBgLayer(`sky_war${lv}_${theme}`);
            // 2️⃣  Sun / moon
            const sunKey = lv === 4 ? `dec_war${lv}_moon_${theme}` : `sun_war${lv}_${theme}`;
            drawBgLayer(sunKey, 0.85);
            // 3️⃣  Main background (buildings, cityscape)
            drawBgLayer(`bg_war${lv}_${theme}`);
            // 4️⃣  Decorative props — pick 2-3 randomly
            const decors = WAR_DECOR[lv] || [];
            const pick = decors.slice().sort(() => Math.random() - 0.5).slice(0, 3);
            for (const base of pick) {
                drawBgLayer(`${base}_${theme}`, 0.9);
            }

            const useRoads = Math.random() > 0.4;
            if (useRoads) {
                // 5️⃣  Road / platform layer drawn to foreground canvas
                tctx.drawImage(img, 0, 0, GAME.width, GAME.height);

                // Carve TRENCHES into the flat road image to create map variety
                const seed = Math.random() * 1000;
                const hillH = 40 + Math.random() * 40;
                tctx.globalCompositeOperation = "destination-out";
                tctx.beginPath();
                tctx.moveTo(0, 0);
                tctx.lineTo(GAME.width, 0);
                for (let x = GAME.width; x >= 0; x -= 4) {
                    // Carve curve (leaves lower part intact)
                    let y = 380 + Math.sin(x / 110 + seed) * hillH + Math.sin(x / 30 + seed) * 15;
                    if (x < 150) y = y * (x / 150) + 360 * (1 - x / 150); // Flatten spawn
                    if (x > GAME.width - 150) y = y * ((GAME.width - x) / 150) + 360 * (1 - (GAME.width - x) / 150); // Flatten spawn
                    tctx.lineTo(x, y);
                }
                tctx.closePath();
                tctx.fill();
                tctx.globalCompositeOperation = "source-over"; // restore

                // Sample the terrain height strictly from the carved road image alpha
                const imgData = tctx.getImageData(0, 0, GAME.width, GAME.height).data;
                for (let x = 0; x <= GAME.width; x += 4) {
                    let foundY = 400;
                    for (let y = 0; y < GAME.height; y++) {
                        if (imgData[(y * GAME.width + x) * 4 + 3] > 50) { foundY = y; break; }
                    }
                    GAME.terrain.push({ x, y: foundY });
                }
            } else {
                // Procedurally generated massive hills (as foreground terrain only)
                const seed = Math.random() * 1000;
                const diffBump = Math.min((GAME.difficulty - 1) * 25, 150);
                const hillH = 60 + Math.random() * 80 + diffBump;
                for (let x = 0; x <= GAME.width; x += 4) {
                    let y = 450 + Math.sin(x / 150 + seed) * hillH + Math.sin(x / 50 + seed) * 15;
                    if (x < 150) y = y * (x / 150) + 400 * (1 - x / 150);
                    if (x > GAME.width - 150) y = y * ((GAME.width - x) / 150) + 400 * (1 - (GAME.width - x) / 150);
                    GAME.terrain.push({ x, y });
                }
                let baseR = 20, baseG = 30, baseB = 25;
                if (lv === 1) { baseR = 40; baseG = 80; baseB = 40; }       // Forest
                else if (lv === 2) { baseR = 90; baseG = 45; baseB = 30; }  // Desert/Ruins
                else if (lv === 3) { baseR = 100; baseG = 110; baseB = 120; } // Winter
                else if (lv === 4) { baseR = 25; baseG = 35; baseB = 60; }  // Night

                const r = baseR + Math.floor(Math.random() * 20);
                const g = baseG + Math.floor(Math.random() * 20);
                const b = baseB + Math.floor(Math.random() * 20);
                tctx.fillStyle = `rgba(${r},${g},${b},0.94)`;
                tctx.beginPath();
                tctx.moveTo(0, GAME.height);
                for (const p of GAME.terrain) tctx.lineTo(p.x, p.y);
                tctx.lineTo(GAME.width, GAME.height);
                tctx.closePath();
                tctx.fill();
                tctx.lineWidth = 12;
                tctx.strokeStyle = `rgba(${r + 30},${g + 40},${b + 30},0.8)`;
                tctx.beginPath();
                tctx.moveTo(GAME.terrain[0].x, GAME.terrain[0].y);
                for (const p of GAME.terrain) tctx.lineTo(p.x, p.y);
                tctx.stroke();
            }
        } catch (e) {
            fallback();
        }
    } else {
        fallback();
    }
}

function createSkyDecor() {
    GAME.clouds = [
        { x: 100, y: 95, w: 92, h: 36, speed: 0.06 },
        { x: 390, y: 70, w: 140, h: 44, speed: 0.04 },
        { x: 720, y: 110, w: 116, h: 34, speed: 0.05 }
    ];
}

function getTerrainY(x) {
    // Defensive: if terrain isn't built yet, return a safe default height
    const DEFAULT_Y = GAME.height ? GAME.height - 180 : 420;
    if (!GAME.terrain || GAME.terrain.length === 0) return DEFAULT_Y;

    if (x < 0) {
        const first = GAME.terrain[0];
        return (first && typeof first.y === 'number') ? first.y + (0 - x) * 5 : DEFAULT_Y;
    }
    if (x > GAME.width) {
        const last = GAME.terrain[GAME.terrain.length - 1];
        return (last && typeof last.y === 'number') ? last.y + (x - GAME.width) * 5 : DEFAULT_Y;
    }

    const clampedX = Math.max(0, Math.min(GAME.width, x));
    const index = Math.floor(clampedX / 4);
    const p1 = GAME.terrain[index] || GAME.terrain[GAME.terrain.length - 1] || { x: 0, y: DEFAULT_Y };
    const p2 = GAME.terrain[Math.min(index + 1, GAME.terrain.length - 1)] || p1;
    const denom = Math.max(1, (p2.x - p1.x) || 1);
    const t = (clampedX - (p1.x || 0)) / denom;
    return (p1.y || DEFAULT_Y) + ((p2.y || DEFAULT_Y) - (p1.y || DEFAULT_Y)) * t;
}

function getTerrainAngle(x) {
    if (!GAME.terrain || GAME.terrain.length === 0) {
        return 0;
    }
    const step = 20;
    const y1 = getTerrainY(x - step);
    const y2 = getTerrainY(x + step);
    return Math.atan2(y2 - y1, step * 2);
}

function carveTerrain(cx, cy, radius) {
    if (GAME.terrainCanvas) {
        let tctx = GAME.terrainCanvas.getContext("2d");
        tctx.save();
        tctx.globalCompositeOperation = "destination-out";
        tctx.beginPath();
        tctx.arc(cx, cy, radius, 0, Math.PI * 2);
        tctx.fill();
        tctx.restore();
    }

    for (let p of GAME.terrain) {
        let dx = p.x - cx;
        if (Math.abs(dx) < radius) {
            let dy = Math.sqrt(radius * radius - dx * dx);
            let craterBot = cy + dy;
            if (p.y < craterBot) {
                p.y = craterBot;
            }
        }
    }
}
