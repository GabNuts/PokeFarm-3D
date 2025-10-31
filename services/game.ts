import { GameState, Player, Camera, FarmWorld, Resource, Building, CropPlot, Pokemon, rint, FertileZone, Task, HappinessModifier } from '../types';
import { CONFIG, POKEMON_DRAW_COLORS, POKEMON_IDS, POKEMON_CAPACITY, POKEMON_ABILITIES, POKEMON_LIFESPANS, POKEMON_EVOLUTIONS, NIGHT_COUNTERPARTS, DAY_COUNTERPARTS, ITEM_DISPLAY_NAMES } from '../constants';

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

// --- Happiness System Constants ---
const FIRE_TYPES = new Set(['Charmander', 'Charmeleon', 'Charizard', 'Growlithe', 'Arcanine', 'Torchic', 'Combusken', 'Blaziken', 'Litwick', 'Lampent', 'Chandelure']);
const WATER_TYPES = new Set(['Squirtle', 'Wartortle', 'Blastoise', 'Lotad', 'Lombre', 'Ludicolo', 'Goldeen', 'Seaking', 'Psyduck', 'Magikarp', 'Gyarados', 'Lapras', 'Omanyte', 'Omastar', 'Kabuto', 'Kabutops', 'Tirtouga', 'Carracosta']);
const ELECTRIC_TYPES = new Set(['Pichu', 'Pikachu', 'Raichu', 'Mareep', 'Flaaffy', 'Ampharos']);
const PROTECTOR_TYPES = new Set(['Growlithe', 'Arcanine', 'Meowth', 'Persian', 'Spearow', 'Fearow']);
const PEST_TYPES = new Set(['Rattata', 'Raticate', 'Ekans', 'Arbok']);

export function getSpeciesForCurrentTime(baseDayKind: string, gameTime: number): string {
    const hour = Math.floor((gameTime % 86400) / 3600);
    const counterpartInfo = NIGHT_COUNTERPARTS[baseDayKind];

    if (counterpartInfo && (hour >= counterpartInfo.sleepHour || hour < 6)) {
        return counterpartInfo.night;
    }
    return baseDayKind;
}

function preloadPokemonSprites(gs: GameState) {
    for (const name in POKEMON_IDS) {
        const id = POKEMON_IDS[name as keyof typeof POKEMON_IDS];
        if(!id) continue;
        
        // Preload regular sprite
        const regularKey = `${name}-regular`;
        if (!gs.pokemonSpriteCache[regularKey]) {
            const img = new Image();
            img.src = `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${id}.png`;
            gs.pokemonSpriteCache[regularKey] = img;
        }

        // Preload shiny sprite
        const shinyKey = `${name}-shiny`;
        if (!gs.pokemonSpriteCache[shinyKey]) {
            const shinyImg = new Image();
            shinyImg.src = `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/shiny/${id}.png`;
            gs.pokemonSpriteCache[shinyKey] = shinyImg;
        }
    }
}

export function getBuildSize(type: string): { w: number, h: number } {
    switch (type) {
        case 'farm_area': return { w: 160, h: 100 };
        case 'stable_miltank':
        case 'stable_mareep': return { w: 100, h: 80 };
        case 'coop': return { w: 80, h: 60 };
        case 'mine': return { w: 120, h: 120 };
        case 'lake': return { w: 150, h: 150 };
        case 'campfire': return { w: 50, h: 50 };
        case 'pokemon_gym': return { w: 180, h: 140 };
        case 'laboratory': return { w: 120, h: 120 };
        default: return { w: 100, h: 100 };
    }
}

export function getBuildCost(type: string): { money: number, resources: { [key: string]: number } } {
    switch (type) {
        case 'farm_area': return { money: 100, resources: { wood: 20 } };
        case 'stable_miltank':
        case 'stable_mareep': return { money: 250, resources: { wood: 50, stone: 10 } };
        case 'coop': return { money: 150, resources: { wood: 30 } };
        case 'mine': return { money: 500, resources: { wood: 100, stone: 50 } };
        case 'lake': return { money: 300, resources: { stone: 40 } };
        case 'campfire': return { money: 50, resources: { wood: 10, stone: 5 } };
        case 'pokemon_gym': return { money: 5000, resources: { wood: 250 } };
        case 'laboratory': return { money: 10000, resources: { wood: 200, stone: 200, metal: 50 } };
        default: return { money: 100, resources: {} };
    }
}


function updatePlayer(player: Player, dt: number) {
  player.energy = clamp(player.energy + CONFIG.energy.regenPerSec * dt, 0, player.maxEnergy);
}

function updatePassiveIncome(gs: GameState, dt: number) {
    const managerBonus = [1, 1.05, 1.10, 1.15, 1.20, 1.25][gs.player.skills.gerente] || 1;
    gs.pokemons.forEach(p => {
        if (p.isSleeping) return;
        const ability = POKEMON_ABILITIES[p.kind];
        if (ability?.type === 'passive_income' || ability?.passive_income_rate) {
            const rate = ability.rate || ability.passive_income_rate;
            if (!rate) return;
            const income = (rate * dt) * managerBonus;
            gs.player.money += income;
            if (income > 0) {
                 if (!gs.dailyIncome[p.kind]) gs.dailyIncome[p.kind] = 0;
                 gs.dailyIncome[p.kind] += income;
            }
        }
    });
}

export function isPointInPolygon(point: {x: number, y: number}, polygon: {x: number, y: number}[]) {
    let isInside = false;
    const n = polygon.length;
    for (let i = 0, j = n - 1; i < n; j = i++) {
        const xi = polygon[i].x, yi = polygon[i].y;
        const xj = polygon[j].x, yj = polygon[j].y;

        const intersect = ((yi > point.y) !== (yj > point.y))
            && (point.x < (xj - xi) * (point.y - yi) / (yj - yi) + xi);
        if (intersect) isInside = !isInside;
    }
    return isInside;
}

function getRandomPointInRiver(world: FarmWorld): {x: number, y: number} | null {
    const river = world.specials.find(s => s.type === 'river');
    if (!river) return null;

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of river.points) {
        minX = Math.min(minX, p.x);
        minY = Math.min(minY, p.y);
        maxX = Math.max(maxX, p.x);
        maxY = Math.max(maxY, p.y);
    }

    let attempts = 0;
    while (attempts < 100) {
        const point = { x: rint(minX, maxX), y: rint(minY, maxY) };
        if (isPointInPolygon(point, river.points)) {
            return point;
        }
        attempts++;
    }
    return null;
}

function isPositionInvalid(x: number, y: number, world: FarmWorld, isFlying: boolean = false): boolean {
    if (isFlying) {
        return false;
    }
    for (const s of world.structs) {
        if (s.type !== 'river_area' && x > s.x - 20 && x < s.x + s.w + 20 && y > s.y - 20 && y < s.y + s.h + 20) {
            return true;
        }
    }
    for (const sp of world.specials) {
        if (isPointInPolygon({x, y}, sp.points)) {
            return true;
        }
    }
    return false;
}

export function isPlacementAreaClear(x: number, y: number, w: number, h: number, world: FarmWorld, type: string | null): { clear: boolean, message: string } {
    const x1 = x;
    const y1 = y;
    const x2 = x + w;
    const y2 = y + h;

    const quarry = world.specials.find(s => s.type === 'quarry');

    if (type === 'mine') {
        if (!quarry) {
             return { clear: false, message: 'Erro: Pedreira não encontrada no mapa.' };
        }
        // Mine must be placed inside the quarry
        const centerPoint = {x: x1 + w/2, y: y1 + h/2};
        if (!isPointInPolygon(centerPoint, quarry.points)) {
            return { clear: false, message: 'A Mina deve ser construída sobre a área da pedreira.' };
        }
    }

    // 1. Boundary check
    const boundaryPadding = 20;
    if (x1 < boundaryPadding || x2 > world.w - boundaryPadding || y1 < boundaryPadding || y2 > world.h - boundaryPadding) {
        return { clear: false, message: 'Você não pode construir fora da área da fazenda.' };
    }
    
    // 2. Collision with specials (check corners and center)
    const checkPoints = [
        {x: x1, y: y1}, {x: x2, y: y1}, {x: x1, y: y2}, {x: x2, y: y2}, {x: x1 + w/2, y: y1 + h/2}
    ];
    for (const point of checkPoints) {
        for (const sp of world.specials) {
            // Allow mine inside quarry, but nothing else
            if (sp.type === 'quarry') {
                if (type !== 'mine' && isPointInPolygon(point, sp.points)) {
                    return { clear: false, message: 'Você não pode construir na área da pedreira.' };
                }
            } else { // It's the river
                if (isPointInPolygon(point, sp.points)) {
                    return { clear: false, message: 'Você não pode construir sobre a água.' };
                }
            }
        }
        for (const fz of world.fertileZones) {
            if (fz.shape === 'poly' && isPointInPolygon(point, fz.points)) {
                return { clear: false, message: 'Você não pode construir sobre solo fértil.' };
            }
        }
    }

    // 3. Collision with existing structures
    for (const struct of world.structs) {
        if (struct.type !== 'river_area' && x1 < struct.x + struct.w && x2 > struct.x && y1 < struct.y + struct.h && y2 > struct.y) {
            return { clear: false, message: 'Você não pode construir aqui, o espaço está ocupado.' };
        }
    }

    return { clear: true, message: '' };
}


function updateWorld(gs: GameState, dt: number) {
    const remainingQueue: typeof gs.respawnQueue = [];
    const itemsToRespawn: typeof gs.respawnQueue = [];

    for (const item of gs.respawnQueue) {
        item.timer -= dt;
        if (item.timer > 0) {
            remainingQueue.push(item);
        } else {
            itemsToRespawn.push(item);
        }
    }
    
    gs.respawnQueue = remainingQueue;

    if (itemsToRespawn.length > 0) {
        let treeCount = gs.world.resources.filter(r => r.type.endsWith('_tree')).length;
        let rockCount = gs.world.resources.filter(r => r.type === 'rock').length;
        let plantCount = gs.world.resources.filter(r => r.type === 'wild_plant').length;
        
        for (const item of itemsToRespawn) {
            let canSpawn = false;
            const isTree = item.type.endsWith('_tree');
            const isRock = item.type === 'rock';
            const isPlant = item.type === 'wild_plant';

            if (isTree && treeCount < CONFIG.world.maxTrees) {
                canSpawn = true;
                treeCount++;
            } else if (isRock && rockCount < CONFIG.world.maxRocks) {
                canSpawn = true;
                rockCount++;
            } else if (isPlant && plantCount < CONFIG.world.maxWildPlants) {
                canSpawn = true;
                plantCount++;
            }

            if (canSpawn) {
                let x = 0, y = 0, attempts = 0;
                let spawnPointFound = false;

                // New logic: 50% chance for trees to spawn in fertile zones
                if (isTree && Math.random() < 0.5 && gs.world.fertileZones.length > 0) {
                    const zone = gs.world.fertileZones[rint(0, gs.world.fertileZones.length - 1)];
                    if (zone.shape === 'poly') {
                        const bbox = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
                        zone.points.forEach(p => {
                            bbox.minX = Math.min(bbox.minX, p.x);
                            bbox.minY = Math.min(bbox.minY, p.y);
                            bbox.maxX = Math.max(bbox.maxX, p.x);
                            bbox.maxY = Math.max(bbox.maxY, p.y);
                        });

                        for (let i = 0; i < 50; i++) {
                            const candidateX = rint(bbox.minX, bbox.maxX);
                            const candidateY = rint(bbox.minY, bbox.maxY);

                            if (isPointInPolygon({ x: candidateX, y: candidateY }, zone.points) && !isPositionInvalid(candidateX, candidateY, gs.world)) {
                                x = candidateX;
                                y = candidateY;
                                spawnPointFound = true;
                                break;
                            }
                        }
                    }
                }
                
                // Fallback for failed fertile zone spawn, 50% chance for trees, or other resources
                if (!spawnPointFound) {
                    do {
                        x = rint(50, gs.world.w - 50);
                        y = rint(50, gs.world.h - 50);
                        attempts++;
                    } while (isPositionInvalid(x, y, gs.world) && attempts < 100);
                    if (attempts < 100) {
                        spawnPointFound = true;
                    }
                }

                if (spawnPointFound) {
                    let typeToSpawn = item.type;
                    if ((typeToSpawn === 'oak_tree' || typeToSpawn === 'pine_tree') && Math.random() < 0.1) {
                        typeToSpawn = 'apple_tree';
                    }

                    if (typeToSpawn) {
                        const newRes = new Resource(typeToSpawn, x, y, gs.day);
                        gs.world.resources.push(newRes);

                        if (typeToSpawn.endsWith('_tree')) {
                            const combeeFamilyCount = gs.pokemons.filter(p => ['Combee', 'Vespiquen'].includes(p.kind)).length;
                            if (combeeFamilyCount < 3 && (gs.dailySpawns.Combee || 0) < 1) {
                                const nearbyFlowers = gs.world.resources.filter(r => 
                                    r.type === 'wild_plant' && 
                                    r.state === 'flower' && 
                                    Math.hypot(newRes.x - r.x, newRes.y - r.y) < 80
                                );
                                if (nearbyFlowers.length >= 2 && Math.random() < 0.25) {
                                    const isShiny = Math.random() < calculateShinyChance(gs.player);
                                    gs.pokemons.push(new Pokemon('Combee', newRes.x + rint(-20, 20), newRes.y + rint(-20, 20), isShiny));
                                    gs.dailySpawns.Combee = (gs.dailySpawns.Combee || 0) + 1;
                                }
                            }
                        }
                    }
                }
            } else {
                 item.timer = 10;
                 gs.respawnQueue.push(item);
            }
        }
    }
}

function updatePokemonDayNightCycle(gs: GameState) {
    const hour = Math.floor((gs.gameTime % 86400) / 3600);

    if (hour >= 20 || hour < 6) { // It's night
        gs.pokemons.forEach(p => {
            const counterpartInfo = NIGHT_COUNTERPARTS[p.kind];
            if (counterpartInfo && hour >= counterpartInfo.sleepHour && !p.isSleeping) {
                // Time for this day-pokemon to sleep
                p.isSleeping = true;
                // Find a sleeping night-counterpart to wake up
                const nightPokemonToWake = gs.pokemons.find(nightP => nightP.kind === counterpartInfo.night && nightP.isSleeping);
                if (nightPokemonToWake) {
                    nightPokemonToWake.isSleeping = false;
                }
            }
        });
    } else if (hour >= 6 && hour < 20) { // It's day
        gs.pokemons.forEach(p => {
            // Wake up day pokemon
            if (NIGHT_COUNTERPARTS[p.kind] && p.isSleeping) {
                p.isSleeping = false;
            }
            // Put night pokemon to sleep
            if (DAY_COUNTERPARTS[p.kind] && !p.isSleeping) {
                p.isSleeping = true;
            }
        });
    }
}

function updatePokemons(gs: GameState, dt: number) {
    const findClosest = <T extends {id: string, x:number, y:number}>(source: Pokemon, targets: T[]): T | null => {
        let closest: T | null = null;
        let minDist = Infinity;
        for(const target of targets) {
            const dist = Math.hypot(source.x - target.x, source.y - target.y);
            if(dist < minDist) {
                minDist = dist;
                closest = target;
            }
        }
        return closest;
    };
    
    const flyingPokemonKinds = ['Zubat', 'Golbat', 'Crobat', 'Pidgey', 'Pidgeotto', 'Pidgeot', 'Aerodactyl'];
    const housePatrolKinds = ['Growlithe', 'Arcanine', 'Meowth', 'Persian'];

    const pokemonsToKeep: Pokemon[] = [];
    const newGhosts: Pokemon[] = [];
    const currentHour = Math.floor((gs.gameTime % 86400) / 3600);

    gs.pokemons.forEach(p_dead => {
        // --- DEATH CHECK (scheduled death) ---
        if (p_dead.scheduledDeathHour !== null && currentHour >= p_dead.scheduledDeathHour) {
            // This Pokémon dies now. Apply Luto modifiers to housemates
            if (p_dead.homeBuildingId) {
                gs.pokemons.forEach(p_survivor => {
                    if (p_survivor.homeBuildingId === p_dead.homeBuildingId && p_survivor.id !== p_dead.id) {
                        if (p_survivor.kind === p_dead.kind) {
                            p_survivor.happinessModifiers['Luto (Mesma Espécie)'] = { value: -20, daysLeft: 3 };
                        } else {
                            p_survivor.happinessModifiers['Luto (Companheiro)'] = { value: -10, daysLeft: 3 };
                        }
                    }
                });
            }

            let ghostChance = 0.15;
            let ghostKind: string = Math.random() < 0.5 ? 'Gastly' : 'Litwick';

            if (p_dead.kind === 'Primeape') {
                ghostChance = 0.05;
                ghostKind = 'Annihilape';
            }

            if (Math.random() < ghostChance) {
                const isNewGhostShiny = Math.random() < calculateShinyChance(gs.player);
                const newGhost = new Pokemon(ghostKind, p_dead.x, p_dead.y, isNewGhostShiny);
                
                // --- IMMORTALITY CHECK ---
                let immortalityChance = 0.001; // 0.1% for normal
                if (p_dead.isShiny) {
                    immortalityChance = 0.5; // 50% for dying shiny
                }
                if (newGhost.isShiny) { // Redundant but safe, shiny ghost from shiny parent
                    immortalityChance = 0.5;
                }
                
                if (Math.random() < immortalityChance) {
                    newGhost.isImmortal = true;
                }
                
                newGhosts.push(newGhost);
            }
            return; // Skip the rest of the logic for this pokemon as it's now dead
        }
        
        // If not dead, add to the keep list and continue with logic
        pokemonsToKeep.push(p_dead);
        const p = p_dead;

        if (p.isSleeping) return;

        // Manage the action timer for animations
        if (p.actionTimer && p.actionTimer > 0) {
            p.actionTimer -= dt;
            if (p.actionTimer <= 0) {
                p.actionTimer = 0;
                if (p.aiState === 'working') {
                    p.aiState = 'idle'; // Revert to idle after action animation
                }
            }
        }

        const abraFamily = ['Abra', 'Kadabra', 'Alakazam'];
        // --- TELEPORTATION LOGIC for Abra family ---
        if (abraFamily.includes(p.kind)) {
            if (p.teleportState === undefined) {
                p.teleportState = 'home';
                p.teleportTimer = rint(30, 60); // Initial cooldown
            }
    
            p.teleportTimer = Math.max(0, (p.teleportTimer || 0) - dt);
    
            if (p.teleportTimer <= 0) {
                if (p.teleportState === 'home') {
                    // TELEPORT AWAY
                    p.teleportState = 'away';
                    p.teleportTimer = rint(60, 120); // Stay away for 1-2 mins
    
                    let targetX, targetY, attempts = 0;
                    do {
                        targetX = rint(50, gs.world.w - 50);
                        targetY = rint(50, gs.world.h - 50);
                        attempts++;
                    } while (isPositionInvalid(targetX, targetY, gs.world) && attempts < 100);
    
                    if (attempts < 100) {
                        p.x = targetX;
                        p.y = targetY;
                        p.target = null;
                        p.aiState = 'idle';
                    } else {
                        // Failed to find a spot, try again later
                        p.teleportState = 'home';
                        p.teleportTimer = 30;
                    }
                } else { // state is 'away'
                    // TELEPORT HOME
                    p.teleportState = 'home';
                    p.teleportTimer = rint(180, 300); // Cooldown for 3-5 mins
    
                    const homeBuilding = gs.world.structs.find(s => s.id === p.homeBuildingId);
                    if (homeBuilding && homeBuilding.type === 'lake') {
                        const radius = Math.min(homeBuilding.w, homeBuilding.h) / 2 * 0.9;
                        const angle = Math.random() * Math.PI * 2;
                        const r = Math.random() * radius;
                        p.x = (homeBuilding.x + homeBuilding.w / 2) + Math.cos(angle) * r;
                        p.y = (homeBuilding.y + homeBuilding.h / 2) + Math.sin(angle) * r;
                        p.target = null;
                        p.aiState = 'idle';
                    } else {
                        // Can't find home, just become a wanderer for a bit longer
                         p.teleportTimer = 60;
                    }
                }
            }
        }

        p.cooldown = Math.max(0, p.cooldown - dt);
        const ability = POKEMON_ABILITIES[p.kind];

        // --- AUTOMATIC ABILITY ACTIONS (NO MOVEMENT REQUIRED) ---
        if (p.cooldown <= 0 && ability && p.aiState !== 'working') {
            let taskCompleted = false;
            switch (ability.type) {
                case 'apple_eater':
                    const appleTreeIndex = gs.world.resources.findIndex(res => res.type === 'apple_tree');
                    if (appleTreeIndex > -1) {
                        gs.world.resources.splice(appleTreeIndex, 1);
                        taskCompleted = true;
                    }
                    break;
                case 'water_crop':
                    const plotToWater = findClosest(p, gs.cropPlots.filter(plot => plot.state === 'growing' && !plot.isWatered));
                    if (plotToWater) {
                        plotToWater.water(ability.bonus);
                        taskCompleted = true;
                    }
                    break;
                case 'fertilize_crop':
                    const plotToFertilize = findClosest(p, gs.cropPlots.filter(plot => plot.state === 'growing' && !plot.fertilized));
                    if (plotToFertilize) {
                        plotToFertilize.fertilized = true;
                        taskCompleted = true;
                    }
                    break;
                case 'harvest_apple_tree':
                    const treeIndex = gs.world.resources.findIndex(res => res.type === 'apple_tree');
                    if (treeIndex > -1) {
                        gs.world.resources.splice(treeIndex, 1);
                        gs.respawnQueue.push({ type: 'oak_tree', timer: CONFIG.resourceRespawn.apple_tree || 240 });
                        const applesCollected = rint(1, 3);
                        gs.player.addItem('apple', applesCollected);
                        p.applesHarvested = (p.applesHarvested || 0) + applesCollected;
                        taskCompleted = true;
                    }
                    break;
                case 'harvest_plant':
                    const plantIndex = gs.world.resources.findIndex(res => res.type === 'wild_plant');
                    if (plantIndex > -1) {
                        const plant = gs.world.resources[plantIndex];
                        const item = plant.state === 'bush' ? 'fiber' : 'flower';
                        gs.player.addItem(item, 1);
                        gs.world.resources.splice(plantIndex, 1);
                        gs.respawnQueue.push({ type: 'wild_plant', timer: CONFIG.resourceRespawn.wild_plant || 150 });
                        taskCompleted = true;
                    }
                    break;
                case 'cooldown_item':
                    const isRestrictedToHome = (p.kind === 'Onix' || p.kind === 'Steelix');
                    if (!isRestrictedToHome) {
                        gs.player.addItem(ability.item, 1);
                        taskCompleted = true;
                    } else if (p.homeBuildingId) {
                        const home = gs.world.structs.find(s => s.id === p.homeBuildingId);
                        if (home && p.x > home.x && p.x < home.x + home.w && p.y > home.y && p.y < home.y + home.h) {
                            gs.player.addItem(ability.item, 1);
                            taskCompleted = true;
                        }
                    }
                    break;
            }
            if (taskCompleted) {
                p.cooldown = ability.cooldown;
                p.aiState = 'working';
                p.actionTimer = 1.0; // Animate for 1 second
            }
        }

        // --- MOVEMENT LOGIC ---
        // 1. Move towards target if it exists
        if (p.target) {
            const dist = Math.hypot(p.target.x - p.x, p.target.y - p.y);
            if (dist > 10) {
                const dx = p.target.x - p.x;
                const dy = p.target.y - p.y;
                p.x += (dx / dist) * p.moveSpeed * dt;
                p.y += (dy / dist) * p.moveSpeed * dt;
            } else {
                p.target = null;
                p.aiState = 'idle';
            }
        }

        // --- POSITION CLAMPING ---
        const isFlying = flyingPokemonKinds.includes(p.kind);
        const isAbraFamilyAway = abraFamily.includes(p.kind) && p.teleportState === 'away';
        const home = (p.homeBuildingId && !isAbraFamilyAway) ? gs.world.structs.find(s => s.id === p.homeBuildingId) : null;
        const isRiverPokemon = ['Magikarp', 'Gyarados', 'Psyduck', 'Lapras'].includes(p.kind);

        if (home && !isFlying) {
            if (home.type === 'river_area') {
                const riverSpecial = gs.world.specials.find(s => s.type === 'river');
                if (riverSpecial && !isPointInPolygon({ x: p.x, y: p.y }, riverSpecial.points)) {
                    const riverTarget = getRandomPointInRiver(gs.world);
                    if (riverTarget) {
                        p.x = riverTarget.x;
                        p.y = riverTarget.y;
                        p.target = null;
                        p.aiState = 'idle';
                    }
                }
            } else if (home.type === 'lake' || home.type === 'laboratory') {
                const centerX = home.x + home.w / 2;
                const centerY = home.y + home.h / 2;
                const radius = Math.min(home.w, home.h) / 2 * 0.9;
                const distFromCenter = Math.hypot(p.x - centerX, p.y - centerY);
                if (distFromCenter > radius) {
                    const angle = Math.atan2(p.y - centerY, p.x - centerX);
                    p.x = centerX + Math.cos(angle) * radius;
                    p.y = centerY + Math.sin(angle) * radius;
                    p.target = null;
                    p.aiState = 'idle';
                }
            } else {
                const padding = 10;
                p.x = clamp(p.x, home.x + padding, home.x + home.w - padding);
                p.y = clamp(p.y, home.y + padding, home.y + home.h - padding);
            }
        } else if (isRiverPokemon) {
            const river = gs.world.specials.find(s => s.type === 'river');
            if (river && !isPointInPolygon({ x: p.x, y: p.y }, river.points)) {
                const riverTarget = getRandomPointInRiver(gs.world);
                if (riverTarget) {
                    p.x = riverTarget.x;
                    p.y = riverTarget.y;
                    p.target = null;
                    p.aiState = 'idle';
                }
            }
        } else {
            const fencePadding = 50;
            p.x = clamp(p.x, fencePadding, gs.world.w - fencePadding);
            p.y = clamp(p.y, fencePadding, gs.world.h - fencePadding);

            if (!isFlying && isPositionInvalid(p.x, p.y, gs.world)) {
                p.target = null;
                p.aiState = 'idle';
            }
        }

        // 2. If idle, find a new random spot to wander to
        if (p.aiState === 'idle' && Math.random() < 0.01) {
            let targetX: number | undefined;
            let targetY: number | undefined;

            const isHousePatroller = housePatrolKinds.includes(p.kind);

            if (isHousePatroller) {
                const house = gs.world.structs.find(s => s.type === 'house');
                if (house) {
                    for (let i = 0; i < 10; i++) {
                        const angle = Math.random() * Math.PI * 2;
                        const radius = 80 + Math.random() * 120;
                        const tempX = (house.x + house.w / 2) + Math.cos(angle) * radius;
                        const tempY = (house.y + house.h / 2) + Math.sin(angle) * radius;
                        if (!isPositionInvalid(tempX, tempY, gs.world, false)) {
                            targetX = tempX;
                            targetY = tempY;
                            break;
                        }
                    }
                }
            } else if (home && !isFlying) {
                if (home.type === 'river_area') {
                    const riverTarget = getRandomPointInRiver(gs.world);
                    if (riverTarget) {
                        targetX = riverTarget.x;
                        targetY = riverTarget.y;
                    }
                } else if (home.type === 'lake' || home.type === 'laboratory') {
                    const radius = Math.min(home.w, home.h) / 2 * 0.9;
                    const angle = Math.random() * Math.PI * 2;
                    const r = Math.random() * radius;
                    targetX = (home.x + home.w / 2) + Math.cos(angle) * r;
                    targetY = (home.y + home.h / 2) + Math.sin(angle) * r;
                } else {
                    targetX = home.x + rint(10, home.w - 10);
                    targetY = home.y + rint(10, home.h - 10);
                }
            } else if (isRiverPokemon) {
                const riverTarget = getRandomPointInRiver(gs.world);
                if (riverTarget) {
                    targetX = riverTarget.x;
                    targetY = riverTarget.y;
                }
            }
            else { // General wanderers and flyers
                for (let i = 0; i < 10; i++) {
                    const tempX = p.x + rint(-120, 120);
                    const tempY = p.y + rint(-120, 120);
                    const clampedX = clamp(tempX, 50, gs.world.w - 50);
                    const clampedY = clamp(tempY, 50, gs.world.h - 50);

                    if (!isPositionInvalid(clampedX, clampedY, gs.world, isFlying)) {
                        targetX = clampedX;
                        targetY = clampedY;
                        break;
                    }
                }
            }

            if (targetX !== undefined && targetY !== undefined) {
                p.target = { x: targetX, y: targetY };
                p.aiState = 'moving';
            }
        }
    });

    gs.pokemons = [...pokemonsToKeep, ...newGhosts];
}


export function processDailySpawns(gs: GameState) {
    const coops = gs.world.structs.filter(s => s.type === 'coop');
    if (coops.length > 0) {
        const torchicCapacity = coops.length * POKEMON_CAPACITY.coop;
        const torchicCount = gs.pokemons.filter(p => ['Torchic', 'Combusken', 'Blaziken'].includes(p.kind)).length;
        if (torchicCount < torchicCapacity && Math.random() < 0.15) {
            const coop = coops[rint(0, coops.length - 1)];
            const isShiny = Math.random() < calculateShinyChance(gs.player);
            const newPokemon = new Pokemon('Torchic', coop.x + coop.w / 2, coop.y + coop.h / 2, isShiny);
            newPokemon.homeBuildingId = coop.id;
            gs.pokemons.push(newPokemon);
        }
    }

    // Miltank Stables
    const miltankStables = gs.world.structs.filter(s => s.type === 'stable' && s.storage.pokemonKind === 'Miltank');
    if (miltankStables.length > 0) {
        const miltankCapacity = miltankStables.length * POKEMON_CAPACITY.stable;
        const miltankCount = gs.pokemons.filter(p => p.kind === 'Miltank').length;
        if (miltankCount < miltankCapacity && Math.random() < 0.15) {
            const stable = miltankStables[rint(0, miltankStables.length - 1)];
            const isShiny = Math.random() < calculateShinyChance(gs.player);
            const newPokemon = new Pokemon('Miltank', stable.x + stable.w / 2, stable.y + stable.h / 2, isShiny);
            newPokemon.homeBuildingId = stable.id;
            gs.pokemons.push(newPokemon);
        }
    }

    // Mareep Stables
    const mareepStables = gs.world.structs.filter(s => s.type === 'stable' && s.storage.pokemonKind === 'Mareep');
    if (mareepStables.length > 0) {
        const mareepCapacity = mareepStables.length * 3; // New capacity
        const mareepCount = gs.pokemons.filter(p => ['Mareep', 'Flaaffy', 'Ampharos'].includes(p.kind)).length;
        if (mareepCount < mareepCapacity && Math.random() < 0.15) {
            const stable = mareepStables[rint(0, mareepStables.length - 1)];
            const isShiny = Math.random() < calculateShinyChance(gs.player);
            const newPokemon = new Pokemon('Mareep', stable.x + stable.w / 2, stable.y + stable.h / 2, isShiny);
            newPokemon.homeBuildingId = stable.id;
            gs.pokemons.push(newPokemon);
        }
    }
    
    const farmAreas = gs.world.structs.filter(s => s.type === 'farm_area');
    farmAreas.forEach(area => {
        const farmPokemonKinds = ['Diglett', 'Pidgey', 'Bulbasaur', ...Object.keys(DAY_COUNTERPARTS), ...Object.keys(NIGHT_COUNTERPARTS)];
        const pokemonInArea = gs.pokemons.filter(p => p.homeBuildingId === area.id && farmPokemonKinds.includes(p.kind)).length;
        const capacity = POKEMON_CAPACITY.farm_area || 3;

        if (pokemonInArea < capacity && Math.random() < 0.15) {
            const kind = Math.random() < 0.5 ? 'Pidgey' : 'Diglett';
            const timedKind = getSpeciesForCurrentTime(kind, gs.gameTime);
            const isShiny = Math.random() < calculateShinyChance(gs.player);
            const newPokemon = new Pokemon(timedKind, area.x + area.w / 2, area.y + area.h / 2, isShiny);
            newPokemon.homeBuildingId = area.id;
            gs.pokemons.push(newPokemon);
        }
    });

    const lakes = gs.world.structs.filter(s => s.type === 'lake');
    if (lakes.length > 0) {
        // Daily Squirtle/Lotad Spawn
        const squirtleFamily = ['Squirtle', 'Wartortle', 'Blastoise', 'Lotad', 'Lombre', 'Ludicolo'];
        const squirtleCount = gs.pokemons.filter(p => squirtleFamily.includes(p.kind)).length;
        if (squirtleCount < lakes.length && Math.random() < 0.15) {
            const lakesWithSquirtles = new Set(gs.pokemons.filter(p => squirtleFamily.includes(p.kind)).map(p => p.homeBuildingId));
            const availableLakes = lakes.filter(lake => !lakesWithSquirtles.has(lake.id));
            if (availableLakes.length > 0) {
                const lake = availableLakes[0];
                const timedKind = getSpeciesForCurrentTime('Squirtle', gs.gameTime);
                const isShiny = Math.random() < calculateShinyChance(gs.player);
                const newPokemon = new Pokemon(timedKind, lake.x + lake.w/2, lake.y + lake.h/2, isShiny);
                newPokemon.homeBuildingId = lake.id;
                gs.pokemons.push(newPokemon);
            }
        }
    }
     // Porygon Laboratory spawn
    const laboratories = gs.world.structs.filter(s => s.type === 'laboratory');
    laboratories.forEach(lab => {
        const porygonFamily = ['Porygon', 'Porygon2', 'Porygon-Z'];
        const porygonCount = gs.pokemons.filter(p => p.homeBuildingId === lab.id && porygonFamily.includes(p.kind)).length;
        const capacity = POKEMON_CAPACITY.laboratory || 4;

        if (porygonCount < capacity && Math.random() < 0.15) {
            const isShiny = Math.random() < calculateShinyChance(gs.player);
            const newPokemon = new Pokemon('Porygon', lab.x + lab.w / 2, lab.y + lab.h / 2, isShiny);
            newPokemon.homeBuildingId = lab.id;
            gs.pokemons.push(newPokemon);
            gs.eventQueue.push({ id: `evt_${Date.now()}`, type: 'new_pokemon', message: 'Um novo Porygon apareceu no laboratório!' });
        }
    });
}

export function isTaskCompletedToday(task: Task, today: Date): boolean {
    if (!task.lastCompletedAt) {
        return false;
    }
    const lastCompletedDate = new Date(task.lastCompletedAt);
    return lastCompletedDate.getFullYear() === today.getFullYear() &&
           lastCompletedDate.getMonth() === today.getMonth() &&
           lastCompletedDate.getDate() === today.getDate();
}

export function isTaskDueTomorrow(task: Task, today: Date): boolean {
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);

    switch (task.frequency.type) {
        case 'Única': {
            if (!task.dueDate) return false;
            const dueDate = new Date(task.dueDate + 'T00:00:00');
            return dueDate.getTime() === tomorrow.getTime();
        }
        case 'Diária':
            return true;

        case 'Semanal': {
            const dayOfWeek = tomorrow.getDay();
            return task.frequency.daysOfWeek?.includes(dayOfWeek) || false;
        }

        case 'Mensal': {
            if (!task.createdAt) return false;
            const createdDate = new Date(task.createdAt);
            return createdDate.getDate() === tomorrow.getDate();
        }

        case 'Personalizada': {
            if (!task.createdAt) return false;
            const createdAtDate = new Date(task.createdAt);
            createdAtDate.setHours(0, 0, 0, 0);

            if (tomorrow.getTime() < createdAtDate.getTime()) return false;
            
            const diffTime = tomorrow.getTime() - createdAtDate.getTime();
            const amount = task.frequency.customAmount || 1;
            
            switch(task.frequency.customInterval) {
                case 'dias': {
                    const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
                    return diffDays % amount === 0;
                }
                case 'semanas': {
                    const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
                    return diffDays % (amount * 7) === 0;
                }
                case 'meses': {
                    const monthDiff = (tomorrow.getFullYear() - createdAtDate.getFullYear()) * 12 + (tomorrow.getMonth() - createdAtDate.getMonth());
                    return tomorrow.getDate() === createdAtDate.getDate() && monthDiff >= 0 && monthDiff % amount === 0;
                }
            }
            return false;
        }
        default:
            return false;
    }
}

export function taskHasDueDate(task: Task): boolean {
    return !!task.dueDate;
}

export function isTaskDueOnDate(task: Task, date: Date): boolean {
    switch (task.frequency.type) {
        case 'Única':
            if (task.lastCompletedAt) return false;
            if (!task.dueDate) return true;
            const dueDate = new Date(task.dueDate + 'T00:00:00');
            const targetDate = new Date(date);
            targetDate.setHours(0,0,0,0);
            return dueDate.getTime() <= targetDate.getTime();

        case 'Diária':
            return true;

        case 'Semanal':
            const dayOfWeek = date.getDay(); // Sunday - 0, Monday - 1, ...
            return task.frequency.daysOfWeek?.includes(dayOfWeek) || false;

        case 'Mensal': {
            if (!task.createdAt) return false;
            const createdDate = new Date(task.createdAt);
            return createdDate.getDate() === date.getDate();
        }

        case 'Personalizada': {
            if (!task.createdAt) return false;
            const createdAtDate = new Date(task.createdAt);
            createdAtDate.setHours(0, 0, 0, 0);
            
            const currentDate = new Date(date);
            currentDate.setHours(0, 0, 0, 0);

            if (currentDate.getTime() < createdAtDate.getTime()) return false;
            const diffTime = Math.abs(currentDate.getTime() - createdAtDate.getTime());
            const amount = task.frequency.customAmount || 1;
            
            switch(task.frequency.customInterval) {
                case 'dias': {
                    const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
                    return diffDays % amount === 0;
                }
                case 'semanas': {
                    const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
                    return diffDays % (amount * 7) === 0;
                }
                case 'meses': {
                    const monthDiff = (currentDate.getFullYear() - createdAtDate.getFullYear()) * 12 + (currentDate.getMonth() - createdAtDate.getMonth());
                    return currentDate.getDate() === createdAtDate.getDate() && monthDiff >= 0 && monthDiff % amount === 0;
                }
            }
            return false;
        }
        default:
            return false;
    }
}

export function calculateShinyChance(player: Player): number {
  const baseChance = 0.003;
  const luckyBonus = [0, 0.0005, 0.001][player.skills.sortudo] || 0; // 0.05%, 0.1%
  return baseChance + luckyBonus;
}

export function updatePokemonHappiness(gs: GameState) {
    // --- Phase 0: Get farm-wide conditions ---
    const hasProtector = gs.pokemons.some(p => PROTECTOR_TYPES.has(p.kind));
    const pestCount = gs.pokemons.filter(p => PEST_TYPES.has(p.kind)).length;
    const hasTauros = gs.pokemons.some(p => p.kind === 'Tauros');
    const hasBouffalant = gs.pokemons.some(p => p.kind === 'Bouffalant');
    const tratadorBonus = [0, 2, 4, 6, 8, 10][gs.player.skills.tratador];

    // --- Phase 1: Handle new Pokémon events ---
    const newPokemons = gs.pokemons.filter(p => p.isNew);
    newPokemons.forEach(newPokemon => {
        if (newPokemon.homeBuildingId) {
            gs.pokemons.forEach(resident => {
                if (resident.homeBuildingId === newPokemon.homeBuildingId && resident.id !== newPokemon.id) {
                    if (resident.kind === newPokemon.kind) {
                        resident.happinessModifiers['Novo Companheiro (Mesma Espécie)'] = { value: 20, daysLeft: 3 };
                    }
                    resident.happinessModifiers['Novo Companheiro'] = { value: 10, daysLeft: 3 };
                }
            });
        }
        newPokemon.isNew = false; // Flag processed
    });
    
    // --- Phase 2 & 3: Daily Update Loop ---
    gs.pokemons.forEach(p => {
        const oldModifiers = { ...p.happinessModifiers };
        const newModifiers: { [key: string]: HappinessModifier } = {};

        // Process and keep existing temporary modifiers
        for (const key in oldModifiers) {
            const mod = oldModifiers[key];
            if (typeof mod === 'object' && mod.daysLeft !== undefined) {
                if (mod.daysLeft > 1) {
                    newModifiers[key] = { value: mod.value, daysLeft: mod.daysLeft - 1 };
                }
            } else if (typeof mod === 'number') {
                // Keep static non-daily modifiers (like from skills)
                if (key === 'Bônus de Tratador') {
                    newModifiers[key] = mod;
                }
            }
        }
        p.happinessModifiers = newModifiers;

        // Apply Static/Conditional Modifiers
        if (hasProtector && !PROTECTOR_TYPES.has(p.kind)) {
            p.happinessModifiers['Bônus de Proteção'] = 10;
        }
        if (pestCount > 0 && !PEST_TYPES.has(p.kind)) {
            p.happinessModifiers['Estresse de Praga'] = -5 * pestCount;
        }
        if (p.kind === 'Miltank' && (hasTauros || hasBouffalant)) {
            p.happinessModifiers['Bônus de Companheirismo'] = 10;
        }
        if (p.kind === 'Tauros' && hasBouffalant) {
            p.happinessModifiers['Rivalidade'] = -10;
        }
        if (p.kind === 'Bouffalant' && hasTauros) {
            p.happinessModifiers['Rivalidade'] = -10;
        }
        if (tratadorBonus > 0) {
            p.happinessModifiers['Bônus de Tratador'] = tratadorBonus;
        }

        // Apply Weather Modifiers
        switch (gs.weatherToday) {
            case 'rain':
                if (WATER_TYPES.has(p.kind)) p.happinessModifiers['Bônus de Chuva'] = 10;
                if (FIRE_TYPES.has(p.kind)) p.happinessModifiers['Mal-estar de Chuva'] = -10;
                break;
            case 'harsh_sunlight':
                if (FIRE_TYPES.has(p.kind)) p.happinessModifiers['Bônus de Sol Forte'] = 10;
                else p.happinessModifiers['Desconforto do Sol'] = -5;
                break;
            case 'storm':
                if (ELECTRIC_TYPES.has(p.kind)) p.happinessModifiers['Bônus de Tempestade'] = 10;
                else p.happinessModifiers['Estresse de Tempestade'] = -5;
                break;
        }

        // --- Phase 4: Recalculate Total Happiness ---
        let totalHappiness = 50; // Base value
        for (const key in p.happinessModifiers) {
            const mod = p.happinessModifiers[key];
            totalHappiness += (typeof mod === 'number' ? mod : mod.value);
        }
        p.happiness = clamp(totalHappiness, 0, 100);
    });

    // Handle Ekans bites after main loop to ensure modifiers are fresh
    const ekansFamily = gs.pokemons.filter(p => (p.kind === 'Ekans' || p.kind === 'Arbok') && !p.isSleeping);
    const torchicFamily = gs.pokemons.filter(p => ['Torchic', 'Combusken', 'Blaziken'].includes(p.kind) && !p.isSleeping);
    ekansFamily.forEach(ekans => {
        const ability = POKEMON_ABILITIES[ekans.kind];
        if (Math.random() < ability.biteChance) {
            const target = torchicFamily.find(t => t.homeBuildingId === ekans.homeBuildingId);
            if (target) {
                target.happinessModifiers['Picada de Ekans'] = { value: -20, daysLeft: 1 };
            }
        }
    });
}

export function processDailyProduction(gs: GameState) {
    gs.dailyIncome = {};
    gs.dailySpawns = {};
    gs.dailyResourceSpawns = {};

    gs.cropPlots.forEach(plot => {
        plot.isWatered = false;
    });

    if (gs.weatherToday === 'rain' || gs.weatherToday === 'storm') {
        gs.cropPlots.forEach(plot => {
            if (plot.state === 'growing') {
                plot.isWatered = true;
            }
        });
    }

    // --- Pest Control Logic ---
    const protectors = gs.pokemons.filter(p => PROTECTOR_TYPES.has(p.kind) && !p.isSleeping);
    const pests = gs.pokemons.filter(p => PEST_TYPES.has(p.kind) && !p.isSleeping);
    const removedPestIds = new Set<string>();

    if (protectors.length > 0 && pests.length > 0) {
        const treinadorBonus = [0, 0.10, 0.15, 0.20][gs.player.skills.treinador] || 0;
        
        const availablePests = [...pests];

        for (const protector of protectors) {
            if (availablePests.length === 0) break; // All pests dealt with

            const ability = POKEMON_ABILITIES[protector.kind];
            // Treat coop_protector as farm_protector for this logic
            if (!ability || (ability.type !== 'farm_protector' && ability.type !== 'coop_protector') || !ability.huntChance) continue;

            const huntChance = ability.huntChance + treinadorBonus;

            if (Math.random() < huntChance) {
                // Hunt successful, remove one pest
                const pestToRemove = availablePests.shift(); // Get and remove from local list
                if (pestToRemove) {
                    removedPestIds.add(pestToRemove.id);
                    gs.eventQueue.push({
                        id: `evt_${Date.now()}_${protector.id}`,
                        type: 'ability_find', // using this type for a green toast
                        message: `${protector.name} protegeu a fazenda e espantou um ${pestToRemove.kind}!`
                    });
                }
            }
        }
    }
    
    if (removedPestIds.size > 0) {
        gs.pokemons = gs.pokemons.filter(p => !removedPestIds.has(p.id));
    }

    updatePokemonHappiness(gs);

    // Process Pokémon abilities
    gs.pokemons.forEach(p => {
        if (p.isSleeping) return;
        const ability = POKEMON_ABILITIES[p.kind];
        if (!ability) return;

        switch (ability.type) {
            case 'daily_production':
                let amount = ability.amount;
                if (ability.chance && Math.random() < ability.chance) {
                    amount *= 2; // Double production
                }
                gs.player.addItem(ability.item, amount);
                break;
            case 'daily_conversion':
                if (gs.player.removeItem(ability.from, ability.amount)) {
                    gs.player.addItem(ability.to, ability.amount);
                }
                break;
            case 'daily_find':
                if (Math.random() < ability.chance) {
                    const item = ability.items[rint(0, ability.items.length - 1)];
                    gs.player.addItem(item, 1);
                    gs.eventQueue.push({ id: `evt_${Date.now()}`, type: 'ability_find', message: `${p.name} encontrou um(a) ${ITEM_DISPLAY_NAMES[item] || item}!` });
                }
                break;
        }
    });
     // Process Fossil Revival
    gs.world.structs.forEach(building => {
        if (building.type === 'laboratory' && building.storage.revivingFossil) {
            let totalBonus = 0;
            const porygonFamily = ['Porygon', 'Porygon2', 'Porygon-Z'];
            gs.pokemons.forEach(p => {
                if (p.homeBuildingId === building.id && porygonFamily.includes(p.kind)) {
                    const ability = POKEMON_ABILITIES[p.kind];
                    if (ability && ability.type === 'fossil_revival_accelerator') {
                        totalBonus += ability.bonus;
                    }
                }
            });

            const baseProgress = 1 / 7; // 7 days base
            const dailyProgress = baseProgress * (1 + totalBonus);
            building.storage.revivalProgress = (building.storage.revivalProgress || 0) + dailyProgress;

            if (building.storage.revivalProgress >= 1) {
                const fossilMap: { [key: string]: string } = {
                    'dome_fossil': 'Kabuto',
                    'helix_fossil': 'Omanyte',
                    'old_amber': 'Aerodactyl',
                    'jaw_fossil': 'Tyrunt',
                    'sail_fossil': 'Amaura',
                    'cover_fossil': 'Tirtouga',
                    'plume_fossil': 'Archen',
                    'skull_fossil': 'Cranidos',
                    'armor_fossil': 'Shieldon',
                    'root_fossil': 'Lileep',
                    'claw_fossil': 'Anorith',
                };
                const revivedKind = fossilMap[building.storage.revivingFossil];
                if (revivedKind) {
                    const isShiny = Math.random() < calculateShinyChance(gs.player);
                    const newPokemon = new Pokemon(revivedKind, building.x + building.w / 2, building.y + building.h / 2, isShiny);
                    newPokemon.isImmortal = true; // Fossil Pokémon don't die of old age
                    gs.pokemons.push(newPokemon);
                    gs.eventQueue.push({ id: `evt_${Date.now()}`, type: 'fossil_revived', message: `O fóssil foi ressuscitado! Um ${revivedKind} selvagem apareceu!` });
                }
                building.storage.revivingFossil = undefined;
                building.storage.revivalProgress = undefined;
            }
        }
    });


    // Update wild plants
    gs.world.resources.forEach(res => {
        if (res.type === 'wild_plant' && res.spawnDay !== undefined && (gs.day - res.spawnDay) >= 1) {
            res.state = 'flower';
        }
    });

    // Update Pokémon ages and check for death/evolution
    const pokemonsToKeep: Pokemon[] = [];
    gs.pokemons.forEach(p => {
        if (p.isImmortal) {
            pokemonsToKeep.push(p);
            return;
        }

        p.age++;
        if (p.age > p.maxAge) {
            // Schedule death for a random hour during the day
            if (p.scheduledDeathHour === null) {
                p.scheduledDeathHour = rint(7, 19); // Dies between 7 AM and 7 PM
            }
        }
        pokemonsToKeep.push(p);
    });
    gs.pokemons = pokemonsToKeep;

    // Reset daily Pidgey bonus
    gs.dailyPidgeyBonusCount = 0;
}


function processSpecialSpawns(gs: GameState) {
    // Rattata pest spawn
    if (gs.pokemons.filter(p => p.kind === 'Rattata' || p.kind === 'Raticate').length < 3) {
        if (Math.random() < 0.20) {
            const isShiny = Math.random() < calculateShinyChance(gs.player);
            // Spawn near a farm area
            const farmArea = gs.world.structs.find(s => s.type === 'farm_area');
            if (farmArea) {
                const x = farmArea.x + rint(0, farmArea.w);
                const y = farmArea.y + rint(0, farmArea.h);
                const newPokemon = new Pokemon('Rattata', x, y, isShiny);
                gs.pokemons.push(newPokemon);
                gs.eventQueue.push({ id: `evt_${Date.now()}`, type: 'pest_attack', message: 'Um Rattata apareceu e pode causar problemas!' });
            }
        }
    }

    // Ekans pest spawn (if coop exists)
    const coops = gs.world.structs.filter(s => s.type === 'coop');
    if (coops.length > 0 && !gs.hasEncounteredEkans) {
        if (Math.random() < 0.10) {
            gs.hasEncounteredEkans = true;
            const coop = coops[0];
            const isShiny = Math.random() < calculateShinyChance(gs.player);
            const newPokemon = new Pokemon('Ekans', coop.x, coop.y, isShiny);
            newPokemon.homeBuildingId = coop.id;
            gs.pokemons.push(newPokemon);
            gs.eventQueue.push({ id: `evt_${Date.now()}`, type: 'pest_attack', message: 'Um Ekans apareceu perto da granja!' });
        }
    }
    
    // Spearow protector spawn (if coop exists and Ekans has appeared)
    if (coops.length > 0 && gs.hasEncounteredEkans && !gs.hasEncounteredSpearow) {
        if (Math.random() < 0.15) {
            gs.hasEncounteredSpearow = true;
            const coop = coops[0];
            const isShiny = Math.random() < calculateShinyChance(gs.player);
            const newPokemon = new Pokemon('Spearow', coop.x, coop.y, isShiny);
            newPokemon.homeBuildingId = coop.id;
            gs.pokemons.push(newPokemon);
            gs.eventQueue.push({ id: `evt_${Date.now()}`, type: 'new_pokemon', message: 'Um Spearow apareceu para proteger a granja!' });
        }
    }
}

export function updateGame(gs: GameState, dt: number): boolean {
    const realTime = new Date();
    gs.gameTime = realTime.getHours() * 3600 + realTime.getMinutes() * 60 + realTime.getSeconds();

    updatePlayer(gs.player, dt);
    updatePassiveIncome(gs, dt);
    updatePokemons(gs, dt);
    updateWorld(gs, dt);

    const now = new Date();
    const gameDate = new Date(now);
    gameDate.setHours(gameDate.getHours() - gs.dayChangeHour);
    const dateString = `${gameDate.getFullYear()}-${gameDate.getMonth() + 1}-${gameDate.getDate()}`;

    if (gs.lastProductionDate !== dateString) {
        gs.day++;
        gs.lastProductionDate = dateString;
        processDailyProduction(gs);
        processDailySpawns(gs);
        processSpecialSpawns(gs);
        updatePokemonDayNightCycle(gs);
        return true;
    }
    return false;
}

export function saveGame(gs: GameState, isUnload = false) {
    gs.lastUpdateTimestamp = Date.now(); // Update timestamp before saving
    const stateToSave = { ...gs, pokemonSpriteCache: {} };
    localStorage.setItem('pokefarm_save', JSON.stringify(stateToSave));
    if (!isUnload) {
        console.log("Game saved!");
    }
}

export function loadGame(): GameState {
    const saved = localStorage.getItem('pokefarm_save');
    if (saved) {
        try {
            const parsed = JSON.parse(saved);
            return rehydrateGameState(parsed);
        } catch (e) {
            console.error("Failed to parse save game, starting new game.", e);
            return initializeNewGame();
        }
    }
    return initializeNewGame();
}

export function saveGameBackup(gs: GameState) {
    const stateToSave = { ...gs, pokemonSpriteCache: {} };
    localStorage.setItem('pokefarm_save_backup', JSON.stringify(stateToSave));
    alert('Backup salvo com sucesso!');
}

export function loadGameBackup(): GameState | null {
    const saved = localStorage.getItem('pokefarm_save_backup');
    if (saved) {
        const parsed = JSON.parse(saved);
        return rehydrateGameState(parsed);
    }
    return null;
}

export function rehydrateGameState(parsedData: any): GameState {
    // --- OFFLINE PROGRESS CALCULATION ---
    const now = Date.now();
    const lastUpdate = parsedData.lastUpdateTimestamp || now;
    const offlineSeconds = Math.max(0, (now - lastUpdate) / 1000);

    // Only process if offline for a meaningful duration (e.g., > 5 seconds)
    if (offlineSeconds > 5) { 
        // 1. Player Energy Regeneration
        if (parsedData.player) {
            const energyGained = offlineSeconds * CONFIG.energy.regenPerSec;
            const newEnergy = (parsedData.player.energy || 0) + energyGained;
            parsedData.player.energy = Math.min(parsedData.player.maxEnergy || 100, newEnergy);
        }

        // 2. Resource Respawn Queue
        if (parsedData.respawnQueue && Array.isArray(parsedData.respawnQueue)) {
            parsedData.respawnQueue.forEach((item: { timer: number }) => {
                item.timer -= offlineSeconds;
            });
        }
    }

    // --- REHYDRATION (existing logic) ---
    const gs = initializeNewGame();
    Object.assign(gs, parsedData);
    gs.player = Object.assign(new Player(), parsedData.player);
    gs.camera = Object.assign(new Camera(gs.world.w, gs.world.h, CONFIG.camera.minZoom, CONFIG.camera.maxZoom), parsedData.camera);
    gs.world = Object.assign(new FarmWorld(gs.world.w, gs.world.h), parsedData.world);
    gs.world.structs = parsedData.world.structs.map((s: any) => Object.assign(new Building(s.type, s.x, s.y, s.w, s.h), s));
    gs.world.resources = parsedData.world.resources.map((r: any) => Object.assign(new Resource(r.type, r.x, r.y), r));
    gs.pokemons = parsedData.pokemons.map((p: any) => {
        const pokemon = Object.assign(new Pokemon(p.kind, p.x, p.y, p.isShiny), p);
        pokemon.isNew = false; // Ensure loaded pokémon don't trigger new-arrival bonuses
        return pokemon;
    });
    gs.cropPlots = parsedData.cropPlots.map((p: any) => Object.assign(new CropPlot(p.x, p.y), p));

    // Important: Update timestamp after processing to prevent re-applying progress on quick refresh
    gs.lastUpdateTimestamp = now;
    
    preloadPokemonSprites(gs);
    return gs;
}


function generateRiverPath(worldW: number, worldH: number): {x: number, y: number}[] {
    const points: {x: number, y: number}[] = [];
    const amplitude = 80;
    const wavelength = worldW / 1.5; // Creates about 1.5 waves across the world width
    const frequency = (2 * Math.PI) / wavelength;
    const verticalOffset = worldH / 2;

    const step = 20; // Generate a point every 20 pixels for a smooth curve
    // Extend beyond world boundaries to ensure the polygon covers the edges completely
    for (let x = -step; x <= worldW + step; x += step) {
        const y = amplitude * Math.sin(frequency * x) + verticalOffset;
        points.push({ x, y });
    }
    return points;
}

function generateRiverPolygon(worldW: number, worldH: number): {x: number, y: number}[] {
    const path = generateRiverPath(worldW, worldH);
    
    const riverWidth = 70; // A fixed, consistent width as per the drawing
    const leftBank: {x: number, y: number}[] = [];
    const rightBank: {x: number, y: number}[] = [];

    for (let i = 0; i < path.length; i++) {
        const p1 = path[i];
        // To calculate the tangent, we need points before and after the current one
        const p_before = i > 0 ? path[i-1] : p1;
        const p_after = i < path.length - 1 ? path[i+1] : p1;
        
        const tangentX = p_after.x - p_before.x;
        const tangentY = p_after.y - p_before.y;
        
        const angle = Math.atan2(tangentY, tangentX);
        // The normal is a vector perpendicular to the tangent
        const normal = { x: -Math.sin(angle), y: Math.cos(angle) };

        // Create points for each bank by offsetting from the center path along the normal
        leftBank.push({ x: p1.x + normal.x * riverWidth, y: p1.y + normal.y * riverWidth });
        rightBank.push({ x: p1.x - normal.x * riverWidth, y: p1.y - normal.y * riverWidth });
    }
    // The polygon points need to be in a continuous order, so we reverse the second bank
    return [...leftBank, ...rightBank.reverse()];
}

function generateOrganicPolygon(centerX: number, centerY: number, avgRadius: number, segments: number, irregularity: number): {x: number, y: number}[] {
    const points: {x: number, y: number}[] = [];
    for (let i = 0; i < segments; i++) {
        const angle = (i / segments) * Math.PI * 2;
        const radius = avgRadius + (Math.random() - 0.5) * avgRadius * irregularity;
        points.push({
            x: centerX + Math.cos(angle) * radius,
            y: centerY + Math.sin(angle) * radius,
        });
    }
    return points;
}

function generateQuarryPolygon(worldW: number, worldH: number): {x: number, y: number}[] {
    const corner = rint(0, 3);
    const avgRadius = 220 + Math.random() * 40; // larger than fertile zones
    const margin = avgRadius + 50;
    let centerX: number, centerY: number;

    switch(corner) {
        case 0: centerX = margin; centerY = margin; break; // Top-Left
        case 1: centerX = worldW - margin; centerY = margin; break; // Top-Right
        case 2: centerX = worldW - margin; centerY = worldH - margin; break; // Bottom-Right
        default: centerX = margin; centerY = worldH - margin; break; // Bottom-Left
    }

    return generateOrganicPolygon(centerX, centerY, avgRadius, 16, 0.45);
}

function generateFertileZones(world: FarmWorld, count: number): FertileZone[] {
    const zones: FertileZone[] = [];
    let attempts = 0;
    while (zones.length < count && attempts < 200) {
        attempts++;
        const avgRadius = 150 + Math.random() * 50;
        const centerX = rint(avgRadius, world.w - avgRadius);
        const centerY = rint(avgRadius, world.h - avgRadius);
        
        // Basic check to avoid spawning inside river/quarry or too close to other zones
        if (isPositionInvalid(centerX, centerY, world)) continue;
        let tooClose = false;
        for (const zone of zones) {
            if (zone.shape === 'poly') {
                const dist = Math.hypot(centerX - zone.center.x, centerY - zone.center.y);
                if (dist < avgRadius + zone.radius) {
                    tooClose = true;
                    break;
                }
            }
        }
        if (tooClose) continue;

        const points = generateOrganicPolygon(centerX, centerY, avgRadius, 12, 0.4);
        
        // More robust check for overlap with special zones
        let overlapsSpecial = false;
        for (const point of points) {
            if (isPositionInvalid(point.x, point.y, world)) {
                overlapsSpecial = true;
                break;
            }
        }
        if (overlapsSpecial) continue;
        
        zones.push({
            shape: 'poly',
            points: points,
            center: {x: centerX, y: centerY},
            radius: avgRadius
        });
    }
    return zones;
}

function initializeNewGame(): GameState {
    const worldW = CONFIG.world.width;
    const worldH = CONFIG.world.height;

    const now = new Date();
    const currentTime = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
    const dateString = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;

    const gs: GameState = {
        player: new Player(),
        world: new FarmWorld(worldW, worldH),
        pokemons: [],
        cropPlots: [],
        camera: new Camera(worldW, worldH, CONFIG.camera.minZoom, CONFIG.camera.maxZoom),
        gameTime: currentTime,
        day: 1,
        lastProductionDate: dateString,
        lastSave: Date.now(),
        lastUpdateTimestamp: Date.now(),
        pokemonSpriteCache: {},
        dailyIncome: {},
        dailySpawns: {},
        dailyResourceSpawns: {},
        respawnQueue: [],
        dailyPidgeyBonusCount: 0,
        tasks: [],
        hasChosenStarter: false,
        rainStreak: 0,
        weatherToday: 'clear',
        weatherYesterday: 'clear',
        rainPeriods: [],
        dayChangeHour: 6,
        alarms: [],
        timer: { duration: 300, endTime: null, isRunning: false },
        worldClockLocations: [{ id: 'local', name: 'Local', timezone: Intl.DateTimeFormat().resolvedOptions().timeZone }],
        lastKilledByStorm: null,
        eventQueue: [],
    };
    
    // Create procedural features FIRST
    const riverPoints = generateRiverPolygon(worldW, worldH);
    gs.world.specials.push({ type: 'river', points: riverPoints });

    const quarryPoints = generateQuarryPolygon(worldW, worldH);
    gs.world.specials.push({ type: 'quarry', points: quarryPoints });
    
    gs.world.fertileZones = generateFertileZones(gs.world, 2);

    // Find a safe spot for initial buildings
    let house: Building | null = null;
    let farmArea: Building | null = null;
    for (let i = 0; i < 100; i++) { // 100 attempts to find a valid spot
        const houseX = rint(200, worldW - 400);
        const houseY = rint(200, worldH - 400);

        const houseSize = { w: 100, h: 80 };
        const farmAreaSize = getBuildSize('farm_area');
        
        const isHouseClear = isPlacementAreaClear(houseX, houseY, houseSize.w, houseSize.h, gs.world, null).clear;
        const isFarmAreaClear = isPlacementAreaClear(houseX, houseY + houseSize.h + 20, farmAreaSize.w, farmAreaSize.h, gs.world, null).clear;
        
        if (isHouseClear && isFarmAreaClear) {
            house = new Building('house', houseX, houseY, houseSize.w, houseSize.h);
            farmArea = new Building('farm_area', houseX, houseY + houseSize.h + 20, farmAreaSize.w, farmAreaSize.h);
            break;
        }
    }
    
    // Fallback if no spot was found (highly unlikely)
    if (!house || !farmArea) {
        house = new Building('house', worldW / 2 - 200, worldH / 2, 100, 80);
        farmArea = new Building('farm_area', worldW / 2 - 200, worldH / 2 + 100, 160, 100);
    }
    
    gs.world.structs.push(house, farmArea);
    
    // Place crop plots relative to the final farm area position
    const centerX = farmArea.x + farmArea.w / 2;
    const centerY = farmArea.y + farmArea.h / 2;
    const rotation = farmArea.rotation;
    const plotWidth = 24;
    const plotHeight = 16;
    const plotSpacing = 28;
    const numCols = 5;
    const numRows = 3;
    const totalPlotsWidth = (numCols - 1) * plotSpacing + plotWidth;
    const totalPlotsHeight = (numRows - 1) * plotSpacing + plotHeight;
    const startOffsetX = (farmArea.w - totalPlotsWidth) / 2;
    const startOffsetY = (farmArea.h - totalPlotsHeight) / 2;

    for (let row = 0; row < numRows; row++) {
        for (let col = 0; col < numCols; col++) {
            const localCenterX = startOffsetX + col * plotSpacing + plotWidth / 2;
            const localCenterY = startOffsetY + row * plotSpacing + plotHeight / 2;
            const relativeX = localCenterX - farmArea.w / 2;
            const relativeY = localCenterY - farmArea.h / 2;
            const rotatedX = relativeX * Math.cos(rotation) - relativeY * Math.sin(rotation);
            const rotatedY = relativeX * Math.sin(rotation) + relativeY * Math.cos(rotation);
            const finalX = centerX + rotatedX;
            const finalY = centerY + rotatedY;
            const newPlot = new CropPlot(finalX, finalY);
            newPlot.rotation = rotation;
            gs.cropPlots.push(newPlot);
        }
    }

    const spawnResource = (type: string) => {
        let x = 0, y = 0, attempts = 0;
        let spawnPointFound = false;

        const isTree = type.endsWith('_tree');
        // 50% chance for trees to spawn in fertile zones
        if (isTree && Math.random() < 0.5 && gs.world.fertileZones.length > 0) {
            const zone = gs.world.fertileZones[rint(0, gs.world.fertileZones.length - 1)];
            if (zone.shape === 'poly') {
                // Find a point within the polygon's bounding box and check if it's inside
                const bbox = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
                zone.points.forEach(p => {
                    bbox.minX = Math.min(bbox.minX, p.x);
                    bbox.minY = Math.min(bbox.minY, p.y);
                    bbox.maxX = Math.max(bbox.maxX, p.x);
                    bbox.maxY = Math.max(bbox.maxY, p.y);
                });

                for (let i = 0; i < 50; i++) { // 50 attempts to find a point in the zone
                    const candidateX = rint(bbox.minX, bbox.maxX);
                    const candidateY = rint(bbox.minY, bbox.maxY);

                    if (isPointInPolygon({ x: candidateX, y: candidateY }, zone.points) && !isPositionInvalid(candidateX, candidateY, gs.world)) {
                        x = candidateX;
                        y = candidateY;
                        spawnPointFound = true;
                        break;
                    }
                }
            }
        }
        
        // Fallback or 50% chance for trees, and for all other resources
        if (!spawnPointFound) {
            do {
                x = rint(50, worldW - 50);
                y = rint(50, worldH - 50);
                attempts++;
            } while (isPositionInvalid(x, y, gs.world) && attempts < 100);
            if (attempts < 100) {
                spawnPointFound = true;
            }
        }

        if (spawnPointFound) {
            gs.world.resources.push(new Resource(type, x, y, gs.day));
        }
    };

    for (let i = 0; i < CONFIG.spawn.oak_trees; i++) spawnResource('oak_tree');
    for (let i = 0; i < CONFIG.spawn.pine_trees; i++) spawnResource('pine_tree');
    for (let i = 0; i < CONFIG.spawn.rocks; i++) spawnResource('rock');
    for (let i = 0; i < CONFIG.spawn.wild_plants; i++) spawnResource('wild_plant');
    
    preloadPokemonSprites(gs);
    return gs;
}