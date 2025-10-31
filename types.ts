import { POKEMON_LIFESPANS } from './constants';
export const rint = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;

export type ModalType = 'pokedex' | 'crafting' | 'market' | 'build' | null;
export type Inventory = { [key: string]: number };

export interface PlayerSkills {
  gerente: number;
  sortudo: number;
  tratador: number;
  treinador: number;
}

export class Player {
    name: string = 'Fazendeiro';
    profilePictureUrl: string | null = null;
    energy: number = 100;
    maxEnergy: number = 100;
    money: number = 200;
    inventory: Inventory = { wood: 10, stone: 5, seedGraoBaga: 5, seedCafeBaga: 3 };
    level: number = 1;
    experience: number = 0;
    experienceToNextLevel: number = 250;
    skills: PlayerSkills = {
      gerente: 0,
      sortudo: 0,
      tratador: 0,
      treinador: 0,
    };
    skillPoints: number = 0;
    team: string[] = [];

    // FIX: Safely check for item existence and quantity. The previous implementation could
    // cause a runtime error if an item was not in the inventory, resulting in `undefined`.
    hasItems(items: Inventory): boolean {
        return Object.entries(items).every(([key, value]) => {
            const currentVal = this.inventory[key];
            return (typeof currentVal === 'number' ? currentVal : 0) >= value;
        });
    }
    
    removeItems(items: Inventory): void {
        Object.entries(items).forEach(([key, value]) => {
            this.inventory[key] = (this.inventory[key] || 0) - value;
            if (this.inventory[key] <= 0) delete this.inventory[key];
        });
    }
    
    addItem(item: string, count: number): void {
        this.inventory[item] = (this.inventory[item] || 0) + count;
    }

    removeItem(item: string, count: number): boolean {
        if ((this.inventory[item] || 0) >= count) {
            this.inventory[item] -= count;
            if (this.inventory[item] <= 0) delete this.inventory[item];
            return true;
        }
        return false;
    }
}

export class Camera {
    x: number;
    y: number;
    scale: number = 1;
    minZoom: number;
    maxZoom: number;
    canvasWidth: number = 0;
    canvasHeight: number = 0;

    constructor(worldW: number, worldH: number, minZoom: number, maxZoom: number) {
        this.x = worldW / 2;
        this.y = worldH / 2;
        this.minZoom = minZoom;
        this.maxZoom = maxZoom;
    }
}

export type FertileZone = 
    | { shape: 'circle', x: number, y: number, r: number } 
    | { shape: 'poly', points: {x: number, y: number}[], center: {x: number, y: number}, radius: number };

export class FarmWorld {
    w: number;
    h: number;
    structs: Building[] = [];
    resources: Resource[] = [];
    specials: { type: string; points: {x: number, y: number}[] }[] = [];
    fertileZones: FertileZone[] = [];
    cosmeticElements: { type: string, x: number, y: number, size: number, shapeVariant: number, sizeVariant: number }[] = [];

    constructor(w: number, h: number) {
        this.w = w;
        this.h = h;
    }
}

export class Resource {
    id: string;
    type: string;
    x: number;
    y: number;
    size: number;
    shapeVariant: number;
    sizeVariant: number;
    spawnDay?: number;
    state?: 'bush' | 'flower';

    constructor(type: string, x: number, y: number, day?: number) {
        this.id = `res_${Date.now()}_${Math.random()}`;
        this.type = type;
        this.x = x;
        this.y = y;
        this.size = Math.random() * 0.2 + 0.9; // 90% to 110% base size
        this.shapeVariant = rint(0, 2); // For rocks: 3 shape patterns
        this.sizeVariant = rint(0, 2);  // For rocks: 3 size variations

        if (type === 'wild_plant') {
            this.spawnDay = day;
            this.state = 'bush';
        }
    }
}

export class Building {
    id: string;
    type: string;
    x: number;
    y: number;
    w: number;
    h: number;
    storage: { 
        pokemonKind?: string;
        revivingFossil?: string;
        revivalProgress?: number;
    } = {};
    rotation: number = 0;

    constructor(type: string, x: number, y: number, w: number, h: number) {
        this.id = `bld_${Date.now()}_${Math.random()}`;
        this.type = type;
        this.x = x;
        this.y = y;
        this.w = w;
        this.h = h;
    }
}

export class CropPlot {
    id: string;
    x: number;
    y: number;
    state: 'empty' | 'growing' | 'mature' = 'empty';
    type: string | null = null;
    growthDays: number = 0;
    matureTimeInDays: number = 0.5;
    fertilized: boolean = false;
    isWatered: boolean = false;
    rotation: number = 0;

    constructor(x: number, y: number) {
        this.id = `plot_${Date.now()}_${Math.random()}`;
        this.x = x;
        this.y = y;
    }
    
    plant(seedType: string) {
        this.state = 'growing';
        this.type = seedType;
        this.growthDays = 0;
        this.matureTimeInDays = 0.5; // 12 hours
        this.fertilized = false;
        this.isWatered = false;
    }
    
    harvest(player: Player) {
        if (this.state === 'mature' && this.type) {
            let yieldCount = 1;
            const doubleChance = this.fertilized ? 0.15 : 0.05;
            if (Math.random() < doubleChance) {
                yieldCount = 2;
            }
            const cropType = this.type.replace('seed', '').toLowerCase();
            player.addItem(cropType, yieldCount);
            this.state = 'empty';
            this.type = null;
            this.growthDays = 0;
            this.fertilized = false;
            this.isWatered = false;
            return { type: cropType, count: yieldCount };
        }
        return null;
    }
    
    water(bonusPercentage: number) {
        if(this.state === 'growing' && !this.isWatered) {
            this.isWatered = true;
        }
    }

    reset() {
        this.state = 'empty';
        this.type = null;
        this.growthDays = 0;
        this.fertilized = false;
        this.isWatered = false;
    }
}

export type HappinessModifier = number | { value: number; daysLeft: number };

export class Pokemon {
    id: string;
    name: string;
    kind: string;
    x: number;
    y: number;
    isShiny: boolean;
    gender: 'male' | 'female';
    age: number = 0;
    maxAge: number = 100;
    homeBuildingId: string | null = null;
    cooldown: number = 0;
    // FIX: Added optional `id` to the target to resolve a potential type error when accessing p.target.id
    target: { x: number; y: number; id?: string; } | null = null;
    aiState: 'idle' | 'moving' | 'working' = 'idle';
    moveSpeed: number = 30;
    isSleeping: boolean = false;
    Poder?: number;
    teleportState?: 'home' | 'away';
    teleportTimer?: number;
    actionTimer?: number;
    isImmortal: boolean = false;
    scheduledDeathHour: number | null = null;
    torchicsCured?: number;
    applesHarvested?: number;
    happiness: number = 50;
    happinessModifiers: { [key: string]: HappinessModifier } = {};
    isNew: boolean = true;

    constructor(kind: string, x: number, y: number, isShiny: boolean) {
        this.id = `poke_${Date.now()}_${Math.random()}`;
        this.kind = kind;
        this.name = kind;
        this.x = x;
        this.y = y;
        this.isShiny = isShiny;
        if (kind === 'Miltank') {
            this.gender = 'female';
        } else if (kind === 'Tauros') {
            this.gender = 'male';
        } else {
            this.gender = Math.random() < 0.5 ? 'male' : 'female';
        }
        this.maxAge = POKEMON_LIFESPANS[kind as keyof typeof POKEMON_LIFESPANS] || 100;
        if (['Happiny', 'Chansey', 'Blissey'].includes(kind)) {
            this.torchicsCured = 0;
        }
        if (['Mankey', 'Primeape', 'Aipom', 'Ambipom'].includes(kind)) {
            this.applesHarvested = 0;
        }
    }
}

export interface UIState {
    energy: number;
    maxEnergy: number;
    money: number;
    day: number;
    gameTime: number;
    inventory: Inventory;
    pokemons: Pokemon[];
    hasCampfire: boolean;
    dailyIncome: { [key: string]: number };
    tasks: Task[];
    dayChangeHour: number;
    averageHappiness: number;
    level: number;
    experience: number;
    experienceToNextLevel: number;
    playerName: string;
    playerProfilePictureUrl: string | null;
    skills: PlayerSkills;
    skillPoints: number;
    team: string[];
}

export type TaskDifficulty = 'Trivial' | 'Fácil' | 'Médio' | 'Difícil';
export type TaskFrequencyType = 'Única' | 'Diária' | 'Semanal' | 'Mensal' | 'Personalizada';

export interface TaskFrequency {
    type: TaskFrequencyType;
    daysOfWeek?: number[]; // 0 for Sunday, 1 for Monday, etc.
    customInterval?: 'dias' | 'semanas' | 'meses';
    customAmount?: number;
}

export interface Subtask {
    id: string;
    text: string;
    completed: boolean;
}

export interface Task {
    id: string;
    title: string;
    subtasks: Subtask[];
    difficulty: TaskDifficulty;
    tags: string[];
    frequency: TaskFrequency;
    dueDate?: string; // YYYY-MM-DD format
    createdAt: number; // timestamp
    lastCompletedAt?: number; // timestamp
}

export type AlarmFrequencyType = 'Único' | 'Diário' | 'Semanal';

export interface AlarmFrequency {
    type: AlarmFrequencyType;
    daysOfWeek?: number[]; // 0 for Sunday, 1 for Monday, etc.
}

export interface Alarm {
    id: string;
    time: string; // "HH:MM"
    note: string;
    frequency: AlarmFrequency;
    sound?: {
        name: string;
        data: string; // base64 encoded audio
    };
    fadeInDuration: number; // in seconds
    isEnabled: boolean;
    createdAt: number;
}

export interface TimerState {
    duration: number; // total seconds
    endTime: number | null; // timestamp when timer should end
    isRunning: boolean;
}

export interface WorldClockLocation {
    id: string;
    timezone: string; // IANA timezone name
    name: string;
}

export type WeatherType = 'clear' | 'rain' | 'storm' | 'harsh_sunlight';

export type GameEventType =
  | 'new_pokemon'
  | 'shiny_pokemon'
  | 'evolution'
  | 'death_age'
  | 'ability_find'
  | 'pest_attack'
  | 'pokemon_escape'
  | 'fossil_revived';

export interface GameEvent {
  id: string;
  type: GameEventType;
  message: string;
}

export interface GameState {
    player: Player;
    world: FarmWorld;
    pokemons: Pokemon[];
    cropPlots: CropPlot[];
    camera: Camera;
    gameTime: number;
    day: number;
    lastProductionDate: string;
    lastSave: number;
    lastUpdateTimestamp: number;
    pokemonSpriteCache: { [key: string]: HTMLImageElement };
    dailyIncome: { [key: string]: number };
    dailySpawns: { [key: string]: number };
    dailyResourceSpawns: { [key: string]: boolean };
    respawnQueue: { type: string, timer: number }[];
    dailyPidgeyBonusCount: number;
    tasks: Task[];
    hasChosenStarter: boolean;
    rainStreak: number;
    weatherToday: WeatherType;
    weatherYesterday: WeatherType;
    rainPeriods: { start: number; end: number }[];
    hasEncounteredEkans?: boolean;
    hasEncounteredSpearow?: boolean;
    dayChangeHour: number;
    alarms: Alarm[];
    timer: TimerState;
    worldClockLocations: WorldClockLocation[];
    lastKilledByStorm: string | null;
    eventQueue: GameEvent[];
}

export interface Recipe {
    id: string;
    name: string;
    input: { [key:string]: number };
    output: { [key:string]: number };
    requiresStructure?: string;
}

export interface PlaylistItem {
  id: string;
  name: string;
  url: string;
  type: 'local' | 'youtube';
  file?: File;
  subtitleUrl?: string;
}