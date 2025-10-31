
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { TopBar, BuildModal, PokedexModal, CraftingModal, MarketModal, BuildingInfoModal, PlantingToolbar, TaskManager, ClockWidget, StarterSelectionModal, ConfirmModal, TimeManagerModal, AlarmNotificationModal, DeathNotificationModal, ToastContainer, ToastData, UINotification, PokemonDetailModal, ProfileIcon, ProfileModal, SkillsModal, TaskForm, TeamSelectionModal } from './components/UI';
import { GameCanvas } from './components/GameCanvas';
import { GameState, ModalType, UIState, Player, Camera, FarmWorld, CropPlot, Pokemon, Resource, Building, rint, Task, Alarm, TimerState, WorldClockLocation, PlaylistItem } from './types';
import { CONFIG, RECIPES, MARKET_PRICES, POKEMON_LIFESPANS, CRAFTING_ENERGY_COST, POKEMON_EVOLUTIONS, POKEMON_IDS, POKEMON_CAPACITY, ITEM_DISPLAY_NAMES } from './constants';
// FIX: Removed non-existent import 'processSpecialSpawns'.
import { updateGame, getBuildCost, getBuildSize, saveGame, loadGame, saveGameBackup, loadGameBackup, rehydrateGameState, isPlacementAreaClear, getSpeciesForCurrentTime, processDailyProduction, processDailySpawns, calculateShinyChance } from './services/game';
import { MediaPlayer } from './components/MediaPlayer';

const App: React.FC = () => {
  const [activeModal, setActiveModal] = useState<ModalType>(null);
  const [infoModalBuilding, setInfoModalBuilding] = useState<Building | null>(null);
  const [activePlantingSeed, setActivePlantingSeed] = useState<string | null>(null);
  const [isSettingsMenuOpen, setIsSettingsMenuOpen] = useState(false);

  const gameStateRef = useRef<GameState | null>(null);
  const [uiState, setUiState] = useState<UIState | null>(null);
  const [isBuildMode, setIsBuildMode] = useState(false);
  const [selectedBuildType, setSelectedBuildType] = useState<string | null>(null);
  const [buildRotation, setBuildRotation] = useState(0);

  const [activeTask, setActiveTask] = useState<Task | 'new' | null>(null);
  const [isChoosingStarter, setIsChoosingStarter] = useState(false);
  const [confirmation, setConfirmation] = useState<{ message: string; onConfirm: () => void; } | null>(null);
  const [isTimeManagerOpen, setIsTimeManagerOpen] = useState(false);
  const [triggeredAlarm, setTriggeredAlarm] = useState<Alarm | null>(null);
  const [killedPokemonName, setKilledPokemonName] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const fadeIntervalRef = useRef<number | null>(null);
  const lastTriggeredAlarmsRef = useRef(new Map<string, number>());
  const [toasts, setToasts] = useState<ToastData[]>([]);
  const [notification, setNotification] = useState('');
  const notificationTimeoutRef = useRef<number | null>(null);
  const [detailedPokemon, setDetailedPokemon] = useState<Pokemon | null>(null);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [isSkillsModalOpen, setIsSkillsModalOpen] = useState(false);
  const [isTeamModalOpen, setIsTeamModalOpen] = useState(false);


  // --- Media Player State ---
  const [playlist, setPlaylist] = useState<PlaylistItem[]>([]);
  const [originalPlaylist, setOriginalPlaylist] = useState<PlaylistItem[]>([]);
  const [currentTrackIndex, setCurrentTrackIndex] = useState(0);
  const [isShuffled, setIsShuffled] = useState(false);
  const [isMediaPlayerVisible, setIsMediaPlayerVisible] = useState(true);
  const [mediaPlayerPosition, setMediaPlayerPosition] = useState({ x: 50, y: 50 });
  const [mediaPlayerSize, setMediaPlayerSize] = useState({ width: 380, height: 388 });


  const showNotification = useCallback((message: string) => {
    if (notificationTimeoutRef.current) {
        clearTimeout(notificationTimeoutRef.current);
    }
    setNotification(message);
    notificationTimeoutRef.current = window.setTimeout(() => {
        setNotification('');
        notificationTimeoutRef.current = null;
    }, 3000); // Notification lasts for 3 seconds
  }, []);

  const addToast = useCallback((message: string, type: ToastData['type'] = 'info') => {
    const newToast: ToastData = {
        id: Date.now() + Math.random(),
        message,
        type,
    };
    setToasts(currentToasts => [...currentToasts, newToast]);
  }, []);

  const dismissToast = (id: number) => {
    setToasts(currentToasts => currentToasts.filter(t => t.id !== id));
  };

  const dismissAllToasts = useCallback(() => {
    setToasts([]);
  }, []);
  
  const handleCloseModal = useCallback(() => {
    setActiveModal(null);
    setInfoModalBuilding(null);
    setActiveTask(null);
    setIsTimeManagerOpen(false);
    setIsSkillsModalOpen(false);
    setIsTeamModalOpen(false);
  }, []);
  
  const handleClosePokemonDetail = useCallback(() => {
    setDetailedPokemon(null);
  }, []);

  const handleOpenBuildingInfo = (buildingId: string) => {
    const building = gameStateRef.current?.world.structs.find(b => b.id === buildingId);
    if (building) {
        setInfoModalBuilding(building);
    }
  };

  const handleOpenPokemonDetail = (pokemon: Pokemon) => {
    setDetailedPokemon(pokemon);
  };


  const updateUI = useCallback(() => {
    if (gameStateRef.current) {
      const gs = gameStateRef.current;
      
      const totalHappiness = gs.pokemons.reduce((sum, p) => sum + p.happiness, 0);
      const averageHappiness = gs.pokemons.length > 0 ? Math.round(totalHappiness / gs.pokemons.length) : 0;
      
      setUiState({
        energy: gs.player.energy,
        maxEnergy: gs.player.maxEnergy,
        money: gs.player.money,
        day: gs.day,
        gameTime: gs.gameTime,
        inventory: gs.player.inventory,
        pokemons: gs.pokemons,
        hasCampfire: gs.world.structs.some(s => s.type === 'campfire'),
        dailyIncome: gs.dailyIncome,
        tasks: gs.tasks,
        dayChangeHour: gs.dayChangeHour,
        averageHappiness: averageHappiness,
        level: gs.player.level,
        experience: gs.player.experience,
        experienceToNextLevel: gs.player.experienceToNextLevel,
        playerName: gs.player.name,
        playerProfilePictureUrl: gs.player.profilePictureUrl,
        skills: gs.player.skills,
        skillPoints: gs.player.skillPoints,
        team: gs.player.team,
      });
    }
  }, []);

  useEffect(() => {
    // FIX: This initialization block now runs only once when the component mounts,
    // preventing an infinite loop caused by re-loading the game state every time
    // the starter selection modal's visibility changed.
    if (gameStateRef.current === null) {
        const loadedState = loadGame();
        gameStateRef.current = loadedState;
        
        if (!loadedState.hasChosenStarter) {
            setIsChoosingStarter(true);
        }
    }

    updateUI();

    let animationFrameId: number;
    let lastTime = performance.now();
    let uiUpdateCounter = 0;

    const gameLoop = (timestamp: number) => {
      const dt = (timestamp - lastTime) / 1000;
      lastTime = timestamp;
      uiUpdateCounter += dt;

      if (gameStateRef.current && !isChoosingStarter) {
        const dailyProdOccurred = updateGame(gameStateRef.current, dt);
        
        // Process event queue for toasts
        const events = gameStateRef.current.eventQueue;
        if (events.length > 0) {
            events.forEach(event => {
                let toastType: ToastData['type'] = 'info';
                if (event.type === 'shiny_pokemon') toastType = 'shiny';
                else if (event.type === 'pest_attack') toastType = 'warning';
                else if (event.type === 'ability_find') toastType = 'success';
                else if (event.type === 'fossil_revived') toastType = 'shiny';
                
                addToast(event.message, toastType);
            });
            gameStateRef.current.eventQueue = []; // Clear queue
        }
        
        if (dailyProdOccurred) {
          const gs = gameStateRef.current;
          if (gs.lastKilledByStorm) {
              setKilledPokemonName(gs.lastKilledByStorm);
              gs.lastKilledByStorm = null; // Reset after reading
          }
          updateUI();
          uiUpdateCounter = 0;
        } else if (uiUpdateCounter > 1) {
            updateUI();
            uiUpdateCounter = 0;
        }
      }
      animationFrameId = requestAnimationFrame(gameLoop);
    };

    gameLoop(performance.now());
    
    const saveInterval = setInterval(() => {
        if(gameStateRef.current) {
            saveGame(gameStateRef.current);
        }
    }, CONFIG.autosaveIntervalSec * 1000);

    const handleBeforeUnload = () => {
        if(gameStateRef.current) saveGame(gameStateRef.current, true);
    };
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      cancelAnimationFrame(animationFrameId);
      clearInterval(saveInterval);
      window.removeEventListener('beforeunload', handleBeforeUnload);
      if(gameStateRef.current) saveGame(gameStateRef.current, true);
       // Cleanup Object URLs from playlist
      playlist.forEach(item => {
        if (item.url.startsWith('blob:')) URL.revokeObjectURL(item.url);
        if (item.subtitleUrl?.startsWith('blob:')) URL.revokeObjectURL(item.subtitleUrl);
      });
      // Cleanup profile picture URL
      if (gameStateRef.current?.player.profilePictureUrl?.startsWith('blob:')) {
        URL.revokeObjectURL(gameStateRef.current.player.profilePictureUrl);
      }
    };
  }, [updateUI, isChoosingStarter, addToast, playlist]);
  
  const handleSelectStarter = (kind: 'Growlithe' | 'Meowth') => {
    const gs = gameStateRef.current;
    if (!gs) return;
    
    const house = gs.world.structs.find(s => s.type === 'house');
    if (!house) {
        console.error("House not found, cannot place starter Pokémon.");
        return;
    }

    const startX = house.x + house.w / 2;
    const startY = house.y + house.h + 10;
    
    const isShiny = Math.random() < 0.005;
    const starterPokemon = new Pokemon(kind, startX, startY, isShiny);
    starterPokemon.homeBuildingId = house.id;
    gs.pokemons.push(starterPokemon);
    gs.hasChosenStarter = true;
    
    if(isShiny) {
        addToast(`🌟 UAU! Seu primeiro companheiro é um ${kind} Shiny! Que sorte!`, 'shiny');
    } else {
        addToast(`Você e seu novo ${kind} estão prontos para começar!`, 'success');
    }
    
    setIsChoosingStarter(false);
    updateUI();
  };

  const handleSelectBuilding = (type: string) => {
    setSelectedBuildType(type);
    setIsBuildMode(true);
    setBuildRotation(0);
    handleCloseModal();
  };

  const handlePlaceBuilding = (x: number, y: number) => {
    if (!selectedBuildType || !gameStateRef.current) return;
    const gs = gameStateRef.current;
    
    const originalSize = getBuildSize(selectedBuildType);
    const isRotated = buildRotation === Math.PI / 2 || buildRotation === (3 * Math.PI) / 2;
    const size = isRotated ? { w: originalSize.h, h: originalSize.w } : originalSize;

    const placeX = Math.floor(x - size.w / 2);
    const placeY = Math.floor(y - size.h / 2);

    const placementCheck = isPlacementAreaClear(placeX, placeY, size.w, size.h, gs.world, selectedBuildType);
    if (!placementCheck.clear) {
        showNotification(placementCheck.message);
        return;
    }

    const cost = getBuildCost(selectedBuildType);
    const canAfford = gs.player.money >= cost.money && Object.entries(cost.resources).every(([key, value]) => (gs.player.inventory[key] || 0) >= value);

    if (canAfford) {
      gs.player.money -= cost.money;
      gs.player.removeItems(cost.resources);
      
      const buildingRect = { x: placeX, y: placeY, w: size.w, h: size.h };
      gs.world.resources = gs.world.resources.filter(resource => {
          const isInside = (
              resource.x >= buildingRect.x &&
              resource.x <= buildingRect.x + buildingRect.w &&
              resource.y >= buildingRect.y &&
              resource.y <= buildingRect.y + buildingRect.h
          );
          return !isInside;
      });
      
      // FIX: Refactored building type determination to be more explicit and robust,
      // fixing a bug where all buildings were being created as 'farm_area'.
      const coreBuildingType = selectedBuildType.startsWith('stable_') 
          ? 'stable' 
          : selectedBuildType;
      
      const newBuilding = new Building(coreBuildingType, placeX, placeY, originalSize.w, originalSize.h);
      newBuilding.rotation = buildRotation;
      gs.world.structs.push(newBuilding);
      
      const spawnPokemon = (kind: string, assignHome: boolean = true) => {
          const isShiny = Math.random() < calculateShinyChance(gs.player);
          const newPokemon = new Pokemon(kind, newBuilding.x + rint(20, newBuilding.w-20), newBuilding.y + rint(20, newBuilding.h-20), isShiny);
          if (assignHome) {
            newPokemon.homeBuildingId = newBuilding.id;
          }
          if (kind === 'Machop') {
              newPokemon.Poder = rint(1, 10);
          }
          gs.pokemons.push(newPokemon);
          if (isShiny) {
              addToast(`🌟 Incrível! Um ${kind} Shiny se mudou para a nova construção!`, 'shiny');
          } else {
              addToast(`Um ${kind} se mudou para a nova construção!`, 'info');
          }
      };

      switch(coreBuildingType) {
        case 'stable': {
            const kind = selectedBuildType === 'stable_miltank' ? 'Miltank' : 'Mareep';
            spawnPokemon(kind);
            newBuilding.storage.pokemonKind = kind;
            break;
        }
        case 'farm_area': {
            const centerX = newBuilding.x + originalSize.w / 2;
            const centerY = newBuilding.y + originalSize.h / 2;
            const rotation = newBuilding.rotation;
            const plotWidth = 24;
            const plotHeight = 16;
            const plotSpacing = 28;
            const numCols = 5;
            const numRows = 3;

            const totalPlotsWidth = (numCols - 1) * plotSpacing + plotWidth;
            const totalPlotsHeight = (numRows - 1) * plotSpacing + plotHeight;
            const startOffsetX = (originalSize.w - totalPlotsWidth) / 2;
            const startOffsetY = (originalSize.h - totalPlotsHeight) / 2;

            for (let row = 0; row < numRows; row++) {
                for (let col = 0; col < numCols; col++) {
                    const localCenterX = startOffsetX + col * plotSpacing + plotWidth / 2;
                    const localCenterY = startOffsetY + row * plotSpacing + plotHeight / 2;
                    const relativeX = localCenterX - originalSize.w / 2;
                    const relativeY = localCenterY - originalSize.h / 2;

                    const rotatedX = relativeX * Math.cos(rotation) - relativeY * Math.sin(rotation);
                    const rotatedY = relativeX * Math.sin(rotation) + relativeY * Math.cos(rotation);
                    
                    const finalX = centerX + rotatedX;
                    const finalY = centerY + rotatedY;

                    const newPlot = new CropPlot(finalX, finalY);
                    newPlot.rotation = rotation;
                    gs.cropPlots.push(newPlot);
                }
            }
            
            if (Math.random() < 0.15) spawnPokemon(getSpeciesForCurrentTime('Diglett', gs.gameTime));
            if (Math.random() < 0.15) spawnPokemon(getSpeciesForCurrentTime('Pidgey', gs.gameTime));
            break;
        }
        case 'mine':
            spawnPokemon('Onix');
            newBuilding.storage.pokemonKind = 'Onix';
            break;
        case 'coop':
            spawnPokemon('Torchic');
            newBuilding.storage.pokemonKind = 'Torchic';
            break;
        case 'lake':
            spawnPokemon('Goldeen');
            if(Math.random() < 0.15) spawnPokemon(getSpeciesForCurrentTime('Squirtle', gs.gameTime), true);
            newBuilding.storage.pokemonKind = 'Goldeen';
            break;
        case 'campfire':
            if (Math.random() < 0.15) spawnPokemon('Charmander', false);
            break;
        case 'pokemon_gym':
            spawnPokemon('Machop');
            break;
        case 'laboratory':
            spawnPokemon('Porygon');
            break;
      }

      updateUI();
      setIsBuildMode(false);
      setSelectedBuildType(null);
      setBuildRotation(0);
    } else {
      showNotification('Recursos Insuficientes!');
    }
  };
  
  const handleBuildClick = () => {
    if (isBuildMode) {
        setIsBuildMode(false);
        setSelectedBuildType(null);
        setActivePlantingSeed(null);
        setBuildRotation(0);
    } else {
        setActiveModal(prev => prev === 'build' ? null : 'build');
    }
  };
  
  const handleDestroyBuilding = (buildingId: string) => {
    const gs = gameStateRef.current;
    if (!gs) return;

    const buildingIndex = gs.world.structs.findIndex(b => b.id === buildingId);
    if (buildingIndex === -1) return;

    const buildingToDestroy = gs.world.structs[buildingIndex];
    const residentPokemons = gs.pokemons.filter(p => p.homeBuildingId === buildingId);
    const pokemonsToRemove = new Set<string>();
    
    const potentialNewHomes = gs.world.structs.filter(
        b => b.id !== buildingId && b.type === buildingToDestroy.type
    );

    const squirtleFamily = ['Squirtle', 'Wartortle', 'Blastoise', 'Lotad', 'Lombre', 'Ludicolo'];

    residentPokemons.forEach(pokemon => {
        if (buildingToDestroy.type === 'lake' && squirtleFamily.includes(pokemon.kind)) {
            pokemonsToRemove.add(pokemon.id);
            return; 
        }
        
        let relocated = false;
        for (const home of potentialNewHomes) {
            const residentsOfHome = gs.pokemons.filter(p => p.homeBuildingId === home.id);
            const isMareepStable = home.type === 'stable' && home.storage.pokemonKind === 'Mareep';
            const capacity = isMareepStable ? 3 : POKEMON_CAPACITY[home.type as keyof typeof POKEMON_CAPACITY] || 0;
            
            const occupancy = home.type === 'lake' 
                ? residentsOfHome.filter(p => !squirtleFamily.includes(p.kind)).length
                : residentsOfHome.length;

            if (occupancy < capacity) {
                pokemon.homeBuildingId = home.id;
                relocated = true;
                break;
            }
        }

        if (!relocated) {
            pokemonsToRemove.add(pokemon.id);
        }
    });
    
    const pokemonsThatWillBeRemoved = gs.pokemons.filter(p => pokemonsToRemove.has(p.id));
    
    gs.world.structs.splice(buildingIndex, 1);

    gs.pokemons = gs.pokemons.filter(p => !pokemonsToRemove.has(p.id));
    
    pokemonsThatWillBeRemoved.forEach(pokemon => {
        addToast(`${pokemon.name} fugiu por não ter um lar.`, 'warning');
    });

    if (buildingToDestroy.type === 'farm_area') {
        gs.cropPlots = gs.cropPlots.filter(plot => {
            const isInside = (
                plot.x >= buildingToDestroy.x &&
                plot.x <= buildingToDestroy.x + buildingToDestroy.w &&
                plot.y >= buildingToDestroy.y &&
                plot.y <= buildingToDestroy.y + buildingToDestroy.h
            );
            return !isInside;
        });
    }

    handleCloseModal();
    updateUI();
  };

  const buildingTitles: {[key: string]: string} = {
    'coop': 'Granja',
    'stable': 'Estábulo',
    'mine': 'Mina',
    'lake': 'Lago Zen',
    'farm_area': 'Área de Cultivo',
    'campfire': 'Fogueira',
    'pokemon_gym': 'Ginásio Pokémon',
    'laboratory': 'Laboratório',
  };

  const handleRequestDestroy = (buildingId: string) => {
    const building = gameStateRef.current?.world.structs.find(b => b.id === buildingId);
    if (!building) return;
    
    const buildingName = buildingTitles[building.type] || building.type;

    setConfirmation({
        message: `Você tem certeza que deseja destruir esta construção (${buildingName})? Pokémon residentes serão realocados se possível, caso contrário, serão perdidos.`,
        onConfirm: () => {
            handleDestroyBuilding(buildingId);
            setConfirmation(null);
        }
    });
  };

  const handleCancelConfirmation = () => {
      setConfirmation(null);
  };

  const handleCraft = (recipeId: string) => {
      const gs = gameStateRef.current;
      if (!gs) return;
      
      if (gs.player.energy < CRAFTING_ENERGY_COST) {
          showNotification("Energia Insuficiente!");
          return;
      }

      const allRecipes = [...RECIPES.processing, ...RECIPES.cooking];
      const recipe = allRecipes.find(r => r.id === recipeId);
      if (recipe) {
          if (gs.player.hasItems(recipe.input)) {
            gs.player.removeItems(recipe.input);
            for (const k in recipe.output) {
                gs.player.addItem(k, recipe.output[k]);
            }
            gs.player.energy -= CRAFTING_ENERGY_COST;
            updateUI();
          } else {
            showNotification("Faltam Ingredientes!");
          }
      }
  };

  const handleMarketTransaction = (type: 'buy' | 'sell', item: string, price: number, quantity: number = 1) => {
    const gs = gameStateRef.current;
    if (!gs) return;
    if (type === 'buy') {
      const totalCost = price * quantity;
      if (gs.player.money >= totalCost) {
        gs.player.money -= totalCost;
        gs.player.addItem(item, quantity);
      }
    } else {
      if (gs.player.removeItem(item, quantity)) {
        const earnings = price * quantity;
        gs.player.money += earnings;
        if (!gs.dailyIncome) gs.dailyIncome = {};
        gs.dailyIncome['Vendas'] = (gs.dailyIncome['Vendas'] || 0) + earnings;
      }
    }
    updateUI();
  };
  
  const handleRenamePokemon = (pokemonId: string, newName: string) => {
    const gs = gameStateRef.current;
    if (!gs) return;
    const pokemon = gs.pokemons.find(p => p.id === pokemonId);
    if (pokemon) {
        pokemon.name = newName;
        updateUI();
    }
  };
  
  const handleEvolvePokemon = (pokemonId: string) => {
    const gs = gameStateRef.current;
    if (!gs) return;
    const pokemon = gs.pokemons.find(p => p.id === pokemonId);
    if (!pokemon) return;

    const evolutionTarget = POKEMON_EVOLUTIONS[pokemon.kind];
    if (!evolutionTarget) return;

    if (gs.player.removeItem('evolution_stone', 1)) {
        const oldName = pokemon.name;
        if (pokemon.name === pokemon.kind) {
            pokemon.name = evolutionTarget;
        }
        pokemon.kind = evolutionTarget;
        pokemon.age = 0;
        pokemon.maxAge = POKEMON_LIFESPANS[evolutionTarget as keyof typeof POKEMON_LIFESPANS] || 100;
        
        const id = POKEMON_IDS[evolutionTarget as keyof typeof POKEMON_IDS];
        if (id) {
            const regularKey = `${evolutionTarget}-regular`;
            if (!gs.pokemonSpriteCache[regularKey]) {
                const img = new Image();
                img.src = `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${id}.png`;
                gs.pokemonSpriteCache[regularKey] = img;
            }
            const shinyKey = `${evolutionTarget}-shiny`;
            if (!gs.pokemonSpriteCache[shinyKey]) {
                const shinyImg = new Image();
                shinyImg.src = `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/shiny/${id}.png`;
                gs.pokemonSpriteCache[shinyKey] = shinyImg;
            }
        }
        
        updateUI();
        addToast(`Parabéns! Seu ${oldName} evoluiu para ${evolutionTarget}!`, 'success');
    } else {
        showNotification('Pedra da Evolução necessária!');
    }
  };

  const handleLocatePokemon = (pokemonId: string) => {
    const gs = gameStateRef.current;
    if (!gs) return;
    const pokemon = gs.pokemons.find(p => p.id === pokemonId);
    if (pokemon) {
        gs.camera.x = pokemon.x;
        gs.camera.y = pokemon.y;
        setDetailedPokemon(pokemon);
        handleCloseModal();
    }
  };

  const handleReleasePokemon = (pokemonId: string) => {
    const gs = gameStateRef.current;
    if (!gs) return;

    const pokemonToRemove = gs.pokemons.find(p => p.id === pokemonId);
    if (pokemonToRemove) {
      gs.pokemons = gs.pokemons.filter(p => p.id !== pokemonId);
      gs.player.team = gs.player.team.filter(id => id !== pokemonId);
      addToast(`${pokemonToRemove.name} foi libertado e voltou para a natureza.`, 'info');
      if (detailedPokemon?.id === pokemonId) {
        setDetailedPokemon(null);
      }
      handleCloseModal();
      updateUI();
    }
  };

  const handleRequestReleasePokemon = (pokemonId: string, pokemonName: string) => {
    setConfirmation({
      message: `Você tem certeza que deseja libertar ${pokemonName}? Esta ação não pode ser desfeita.`,
      onConfirm: () => {
        handleReleasePokemon(pokemonId);
        setConfirmation(null);
      }
    });
  };

  const handleSelectSeedForPlanting = (seedType: string) => {
      setActivePlantingSeed(seedType);
      setIsBuildMode(false);
  };
  
  const handleCancelPlanting = useCallback(() => {
      setActivePlantingSeed(null);
  }, []);

  const handlePlantActiveSeed = (plot: CropPlot) => {
    const gs = gameStateRef.current;
    if (!gs || !activePlantingSeed) return;

    if (activePlantingSeed.startsWith('seed')) {
        if (plot.state !== 'empty') return;
        if (gs.player.removeItem(activePlantingSeed, 1)) {
            plot.plant(activePlantingSeed);
            updateUI();
        } else {
            setActivePlantingSeed(null);
        }
    } else if (activePlantingSeed === 'fertilizer') {
        if (plot.state !== 'growing' || plot.fertilized) return;
        
        const FERTILIZER_ENERGY_COST = 5;
        if (gs.player.energy < FERTILIZER_ENERGY_COST) {
            showNotification("Energia Insuficiente!");
            return;
        }

        if (gs.player.removeItem('fertilizer', 1)) {
            gs.player.energy -= FERTILIZER_ENERGY_COST;
            plot.fertilized = true;
            updateUI();
        } else {
            setActivePlantingSeed(null);
        }
    }
  };

  const handleCheat = (resource: 'money' | 'wood' | 'stone' | 'energy' | 'metal') => {
    if (!gameStateRef.current) return;
    const gs = gameStateRef.current;
    switch (resource) {
        case 'money':
            gs.player.money += 10000;
            break;
        case 'wood':
            gs.player.addItem('wood', 1000);
            break;
        case 'stone':
            gs.player.addItem('stone', 1000);
            break;
        case 'metal':
            gs.player.addItem('metal', 1000);
            break;
        case 'energy':
            gs.player.energy = gs.player.maxEnergy;
            break;
    }
    updateUI();
  };

  const handleCheatSpawnPokemon = (kind: string) => {
    const gs = gameStateRef.current;
    if (!gs) return;

    const house = gs.world.structs.find(s => s.type === 'house');
    if (!house) {
        console.error("Casa não encontrada para gerar Pokémon.");
        addToast(`Falha ao gerar ${kind}: casa não encontrada.`, 'error');
        return;
    }

    const spawnX = house.x + house.w / 2 + rint(-50, 50);
    const spawnY = house.y + house.h + rint(20, 50);

    const isShiny = Math.random() < calculateShinyChance(gs.player);
    const newPokemon = new Pokemon(kind, spawnX, spawnY, isShiny);

    gs.pokemons.push(newPokemon);
    updateUI();
    
    if (isShiny) {
        addToast(`🌟 UAU! Um ${kind} Shiny de teste apareceu!`, 'shiny');
    } else {
        addToast(`Um ${kind} de teste apareceu perto da casa.`, 'info');
    }
  };

  const handleAdvanceTime24h = () => {
    const gs = gameStateRef.current;
    if (!gs) return;

    processDailyProduction(gs);
    processDailySpawns(gs);
    gs.day++;
    
    const now = new Date();
    const gameDate = new Date(now);
    gameDate.setHours(gameDate.getHours() - gs.dayChangeHour);
    const dateString = `${gameDate.getFullYear()}-${gameDate.getMonth() + 1}-${gameDate.getDate()}`;
    gs.lastProductionDate = dateString;
    
    updateUI();
    addToast(`Avançou 24 horas. Agora é dia ${gs.day}.`, 'info');
  };

  const handleSaveTask = (task: Task) => {
    const gs = gameStateRef.current;
    if (!gs) return;

    const existingIndex = gs.tasks.findIndex(t => t.id === task.id);
    if (existingIndex > -1) {
      const newTasks = [...gs.tasks];
      newTasks[existingIndex] = task;
      gs.tasks = newTasks;
    } else {
      gs.tasks = [...gs.tasks, task];
    }
    setActiveTask(null);
    updateUI();
  };

  const handleCompleteTask = (taskId: string) => {
    const gs = gameStateRef.current;
    if (!gs) return;

    const taskIndex = gs.tasks.findIndex(t => t.id === taskId);
    if (taskIndex === -1) return;
    
    const task = gs.tasks[taskIndex];
    
    // Energy Reward
    const energyRewards = { 'Trivial': 10, 'Fácil': 25, 'Médio': 50, 'Difícil': 100 };
    const reward = energyRewards[task.difficulty];
    gs.player.energy = Math.min(gs.player.maxEnergy, gs.player.energy + reward);

    // Experience Reward & Level Up
    const xpRewards = { 'Trivial': 5, 'Fácil': 20, 'Médio': 50, 'Difícil': 100 };
    const xpGained = xpRewards[task.difficulty];
    gs.player.experience += xpGained;
    addToast(`+${xpGained} XP!`, 'success');

    while (gs.player.experience >= gs.player.experienceToNextLevel) {
        gs.player.experience -= gs.player.experienceToNextLevel;
        gs.player.level++;
        gs.player.skillPoints++;
        gs.player.experienceToNextLevel *= 2;
        addToast(`🎉 Parabéns! Você alcançou o Nível ${gs.player.level}!`, 'success');
    }

    const newTasks = [...gs.tasks];
    newTasks[taskIndex] = { ...newTasks[taskIndex], lastCompletedAt: Date.now() };
    gs.tasks = newTasks;
    
    updateUI();
  };

  const handleDeleteTask = (taskId: string) => {
      const gs = gameStateRef.current;
      if (!gs) return;
      gs.tasks = gs.tasks.filter(t => t.id !== taskId);
      updateUI();
  };
  
  const handleRequestDeleteTask = (taskId: string) => {
    const task = gameStateRef.current?.tasks.find(t => t.id === taskId);
    if (!task) return;
    setConfirmation({
        message: `Você tem certeza que deseja excluir a tarefa "${task.title}"?`,
        onConfirm: () => {
            handleDeleteTask(taskId);
            setConfirmation(null);
        }
    });
  };

  const handleToggleSubtask = (taskId: string, subtaskId: string) => {
      const gs = gameStateRef.current;
      if (!gs) return;

      const newTasks = gs.tasks.map(task => {
          if (task.id === taskId) {
              const newSubtasks = task.subtasks.map(subtask => {
                  if (subtask.id === subtaskId) {
                      return { ...subtask, completed: !subtask.completed };
                  }
                  return subtask;
              });
              return { ...task, subtasks: newSubtasks };
          }
          return task;
      });

      gs.tasks = newTasks;
      updateUI();
  };

  const handleToggleSettingsMenu = () => {
    setIsSettingsMenuOpen(prev => !prev);
  };

  const handleSaveBackup = () => {
      if (gameStateRef.current) {
          saveGameBackup(gameStateRef.current);
          setIsSettingsMenuOpen(false);
      }
  };
  
  const handleLoadBackup = () => {
      if (confirm('Você tem certeza que deseja carregar o backup? Todo o progresso não salvo (desde o último backup) será perdido.')) {
          const backupState = loadGameBackup();
          if (backupState) {
              gameStateRef.current = backupState;
               if (!backupState.hasChosenStarter) {
                    setIsChoosingStarter(true);
                } else {
                    setIsChoosingStarter(false);
                }
              updateUI();
              setIsSettingsMenuOpen(false);
              showNotification('Backup carregado com sucesso!');
          } else {
              showNotification('Nenhum backup encontrado.');
          }
      }
  };

  const handleSaveToFile = () => {
    if (!gameStateRef.current) return;
    
    const stateToSave = { ...gameStateRef.current, pokemonSpriteCache: {} };
    const dataStr = JSON.stringify(stateToSave);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);

    const link = document.createElement('a');
    link.href = url;
    const date = new Date();
    const dateString = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')}`;
    link.download = `pokefarm-save-${dateString}.json`;
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    setIsSettingsMenuOpen(false);
  };
  
  const handleLoadFromFile = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.onchange = (e) => {
        const file = (e.target as HTMLInputElement).files?.[0];
        if (!file) return;

        if (confirm('Você tem certeza que deseja carregar este arquivo? Todo o progresso atual será perdido.')) {
            const reader = new FileReader();
            reader.onload = (event) => {
                try {
                    const json = event.target?.result as string;
                    const parsedData = JSON.parse(json);
                    const rehydrated = rehydrateGameState(parsedData);
                    gameStateRef.current = rehydrated;
                    if (!rehydrated.hasChosenStarter) {
                        setIsChoosingStarter(true);
                    } else {
                        setIsChoosingStarter(false);
                    }
                    updateUI();
                    showNotification('Jogo carregado com sucesso!');
                } catch (error) {
                    console.error("Erro ao carregar o arquivo de salvamento:", error);
                    showNotification('Falha ao carregar o arquivo.');
                }
            };
            reader.readAsText(file);
        }
    };
    input.click();
    setIsSettingsMenuOpen(false);
  };
  
  const handleUpdateDayChangeHour = (hour: number) => {
      if (gameStateRef.current) {
          gameStateRef.current.dayChangeHour = hour;
          updateUI();
      }
  };

  const handleSaveAlarm = (alarm: Alarm) => {
    if (!gameStateRef.current) return;
    const existingIndex = gameStateRef.current.alarms.findIndex(a => a.id === alarm.id);
    if (existingIndex > -1) {
        gameStateRef.current.alarms[existingIndex] = alarm;
    } else {
        gameStateRef.current.alarms.push(alarm);
    }
    updateUI();
  };

  const handleDeleteAlarm = (alarmId: string) => {
      if (!gameStateRef.current) return;
      gameStateRef.current.alarms = gameStateRef.current.alarms.filter(a => a.id !== alarmId);
      updateUI();
  };

  const handleToggleAlarm = (alarmId: string, isEnabled: boolean) => {
      if (!gameStateRef.current) return;
      const alarm = gameStateRef.current.alarms.find(a => a.id === alarmId);
      if (alarm) {
          alarm.isEnabled = isEnabled;
          updateUI();
      }
  };

  const handleTimerUpdate = (newTimerState: Partial<TimerState>) => {
      if (!gameStateRef.current) return;
      gameStateRef.current.timer = { ...gameStateRef.current.timer, ...newTimerState };
      updateUI();
  };

  const handleAddWorldClock = (location: WorldClockLocation) => {
      if (!gameStateRef.current) return;
      if (!gameStateRef.current.worldClockLocations.some(l => l.id === location.id)) {
        gameStateRef.current.worldClockLocations.push(location);
        updateUI();
      }
  };
  
  const handleDeleteWorldClock = (locationId: string) => {
      if (!gameStateRef.current) return;
      gameStateRef.current.worldClockLocations = gameStateRef.current.worldClockLocations.filter(l => l.id !== locationId);
      updateUI();
  };

  const playAlarmSound = (alarm: Alarm) => {
      stopAlarmSound(); 

      const audioSrc = alarm.sound?.data || 'https://actions.google.com/sounds/v1/alarms/alarm_clock.ogg';
      const audio = new Audio(audioSrc);
      audioRef.current = audio;

      if (alarm.fadeInDuration > 0) {
          const audioCtx = new window.AudioContext();
          audioContextRef.current = audioCtx;
          const source = audioCtx.createMediaElementSource(audio);
          const gainNode = audioCtx.createGain();
          gainNodeRef.current = gainNode;
          
          gainNode.gain.setValueAtTime(0, audioCtx.currentTime);
          gainNode.gain.linearRampToValueAtTime(1, audioCtx.currentTime + alarm.fadeInDuration);
          
          source.connect(gainNode);
          gainNode.connect(audioCtx.destination);
          
      }
      
      audio.play().catch(e => console.error("Erro ao tocar o alarme:", e));
  };

  const stopAlarmSound = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current = null;
    }
    if (gainNodeRef.current && audioContextRef.current) {
        gainNodeRef.current.disconnect();
        gainNodeRef.current = null;
    }
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close();
        audioContextRef.current = null;
    }
    if (fadeIntervalRef.current) {
        clearInterval(fadeIntervalRef.current);
        fadeIntervalRef.current = null;
    }
  };

  const showDesktopNotification = (title: string, options: NotificationOptions) => {
    if (!('Notification' in window)) return;

    const show = () => new Notification(title, options);

    if (Notification.permission === 'granted') {
        show();
    } else if (Notification.permission !== 'denied') {
        Notification.requestPermission().then(permission => {
            if (permission === 'granted') {
                show();
            }
        });
    }
  };


  useEffect(() => {
    const interval = setInterval(() => {
        if (!gameStateRef.current) return;
        
        let isAlarmShowing = false;
        setTriggeredAlarm(current => {
            if (current) isAlarmShowing = true;
            return current;
        });
        if (isAlarmShowing) return;

        const { alarms, timer } = gameStateRef.current;
        const now = new Date();
        const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
        const todayDay = now.getDay();

        for (const alarm of alarms) {
            if (!alarm.isEnabled || alarm.time !== currentTime) continue;

            const lastTriggeredTimestamp = lastTriggeredAlarmsRef.current.get(alarm.id);
            if (lastTriggeredTimestamp && (now.getTime() - lastTriggeredTimestamp < 60000)) {
                continue;
            }
            
            let shouldTrigger = false;
            switch(alarm.frequency.type) {
                case 'Único':
                    shouldTrigger = true;
                    break;
                case 'Diário':
                    shouldTrigger = true;
                    break;
                case 'Semanal':
                    if (alarm.frequency.daysOfWeek?.includes(todayDay)) shouldTrigger = true;
                    break;
            }

            if (shouldTrigger) {
                setTriggeredAlarm(alarm);
                playAlarmSound(alarm);
                showDesktopNotification('Alarme PokéFarm!', { body: alarm.note || `São ${alarm.time}!` });
                lastTriggeredAlarmsRef.current.set(alarm.id, Date.now());
                if(alarm.frequency.type === 'Único') {
                    alarm.isEnabled = false;
                }
                break; 
            }
        }
        
        if (timer.isRunning && timer.endTime && now.getTime() >= timer.endTime) {
            const tempTimerAlarm: Alarm = {
                id: 'timer_alarm', time: '', note: 'O tempo acabou!', frequency: { type: 'Único' },
                fadeInDuration: 0, isEnabled: true, createdAt: 0,
            };
            setTriggeredAlarm(tempTimerAlarm);
            playAlarmSound(tempTimerAlarm);
            showDesktopNotification('Timer PokéFarm!', { body: 'O tempo acabou!' });
            
            gameStateRef.current.timer.isRunning = false;
            gameStateRef.current.timer.endTime = null;
        }

    }, 1000);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
        if (event.key === 'r' && isBuildMode) {
            setBuildRotation(prev => (prev + Math.PI / 2) % (2 * Math.PI));
            return;
        }

        if (event.key === 'Escape') {
            if (isChoosingStarter) {
                return;
            }
            if (detailedPokemon) {
                handleClosePokemonDetail();
                return;
            }
            if (triggeredAlarm) {
                stopAlarmSound();
                setTriggeredAlarm(null);
                return;
            }
            if (activeModal || infoModalBuilding || activeTask || isTimeManagerOpen || isProfileModalOpen || isSkillsModalOpen || isTeamModalOpen) {
                handleCloseModal();
                setIsProfileModalOpen(false);
            } else if (activePlantingSeed) {
                handleCancelPlanting();
            } else if (isBuildMode) {
                setIsBuildMode(false);
                setSelectedBuildType(null);
                setBuildRotation(0);
            } else if (isSettingsMenuOpen) {
                setIsSettingsMenuOpen(false);
            }
        }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
        window.removeEventListener('keydown', handleKeyDown);
    };
  }, [
      activeModal, 
      infoModalBuilding, 
      activeTask, 
      activePlantingSeed, 
      isBuildMode, 
      isSettingsMenuOpen,
      isChoosingStarter,
      isTimeManagerOpen,
      triggeredAlarm,
      detailedPokemon,
      isProfileModalOpen,
      isSkillsModalOpen,
      isTeamModalOpen,
      handleCloseModal, 
      handleCancelPlanting,
      handleClosePokemonDetail
  ]);

  const handleMeditate = (buildingId: string) => {
    const gs = gameStateRef.current;
    if (!gs) return;

    const MEDITATE_ENERGY_COST = 5;
    if (gs.player.energy < MEDITATE_ENERGY_COST) {
        addToast("Energia Insuficiente para meditar.", 'warning');
        return;
    }

    const building = gs.world.structs.find(b => b.id === buildingId);
    if (!building || building.type !== 'lake') return;

    const abraFamily = ['Abra', 'Kadabra', 'Alakazam'];
    const hasAbraFamily = gs.pokemons.some(p => p.homeBuildingId === buildingId && abraFamily.includes(p.kind));

    if (hasAbraFamily) {
        addToast("A presença psíquica neste lago já é forte.", 'info');
        return;
    }

    gs.player.energy -= MEDITATE_ENERGY_COST;

    if (Math.random() < 0.10) { // 10% chance
        const isShiny = Math.random() < calculateShinyChance(gs.player);
        const newPokemon = new Pokemon('Abra', building.x + building.w / 2, building.y + building.h / 2, isShiny);
        newPokemon.homeBuildingId = building.id;
        gs.pokemons.push(newPokemon);
        addToast(
            isShiny ? '🌟 Incrível! Sua meditação atraiu um Abra Shiny!' : 'Sua meditação atraiu um Abra para o lago!',
            isShiny ? 'shiny' : 'success'
        );
    } else {
        addToast('Você meditou profundamente, sentindo a tranquilidade do lago.', 'info');
    }

    updateUI();
  };
   const handleStartFossilRevival = (buildingId: string, fossilType: string) => {
    const gs = gameStateRef.current;
    if (!gs) return;

    const building = gs.world.structs.find(b => b.id === buildingId);
    if (!building || building.type !== 'laboratory' || building.storage.revivingFossil) return;

    if (gs.player.removeItem(fossilType, 1)) {
        building.storage.revivingFossil = fossilType;
        building.storage.revivalProgress = 0;
        addToast(`A ressurreição de ${ITEM_DISPLAY_NAMES[fossilType]} começou!`, 'success');
        updateUI();
    } else {
        addToast(`Você não tem um ${ITEM_DISPLAY_NAMES[fossilType]}.`, 'error');
    }
    };


  const handleCollectResource = useCallback((resourceId: string) => {
    const gs = gameStateRef.current;
    if (!gs) return;

    const resourceIndex = gs.world.resources.findIndex(r => r.id === resourceId);
    if (resourceIndex === -1) return;

    const resource = gs.world.resources[resourceIndex];

    const isWoodTree = resource.type.endsWith('_tree') && resource.type !== 'apple_tree';
    const isRock = resource.type === 'rock';
    const isAppleTree = resource.type === 'apple_tree';
    const isWildPlant = resource.type === 'wild_plant';

    let requiredEnergy = -1;
    if (isWildPlant) requiredEnergy = 5;
    else if (isAppleTree) requiredEnergy = 10;
    else if (isWoodTree) requiredEnergy = 8;
    else if (isRock) requiredEnergy = 10;

    if (requiredEnergy === -1) return;

    if (gs.player.energy < requiredEnergy) {
        showNotification("Energia Insuficiente!");
        return;
    }

    gs.player.energy -= requiredEnergy;
    
    if (isWoodTree) {
        gs.player.addItem('wood', rint(1, 3));
    } else if (isRock) {
        gs.player.addItem('stone', rint(1, 3));
        if (Math.random() < 0.05) {
            gs.player.addItem('metal', 1);
        }
    } else if (isAppleTree) {
        gs.player.addItem('apple', rint(1, 3));
    } else if (isWildPlant) {
        const item = resource.state === 'bush' ? 'fiber' : 'flower';
        gs.player.addItem(item, 1);
    }
    
    gs.world.resources.splice(resourceIndex, 1);
    const respawnTime = CONFIG.resourceRespawn[resource.type as keyof typeof CONFIG.resourceRespawn] || 1800;
    gs.respawnQueue.push({ type: resource.type, timer: respawnTime });

    const resourceToPokemonMap: { [key: string]: string } = {
        'oak_tree': 'Timburr',
        'pine_tree': 'Timburr',
        'rock': 'Geodude',
        'wild_plant': 'Bulbasaur',
        'apple_tree': 'Mankey',
    };

    const basePokemonKind = resourceToPokemonMap[resource.type];
    if (basePokemonKind) {
        const pokemonKind = getSpeciesForCurrentTime(basePokemonKind, gs.gameTime);
        if (!gs.dailyResourceSpawns[pokemonKind] && Math.random() < 0.15) {
            gs.dailyResourceSpawns[pokemonKind] = true;
            
            const spawnX = resource.x + rint(-15, 15);
            const spawnY = resource.y + rint(-15, 15);
            const isShiny = Math.random() < calculateShinyChance(gs.player);
            
            const newPokemon = new Pokemon(pokemonKind, spawnX, spawnY, isShiny);
            gs.pokemons.push(newPokemon);

            if (isShiny) {
                addToast(`🌟 UAU! Um ${pokemonKind} Shiny apareceu!`, 'shiny');
            } else {
                addToast(`Um ${pokemonKind} selvagem apareceu!`, 'success');
            }
        }
    }


    updateUI();
  }, [updateUI, showNotification, addToast]);
  
    // --- Media Player Handlers ---
  const handleNextTrack = useCallback(() => {
    if (playlist.length === 0) return;
    setCurrentTrackIndex((prevIndex) => (prevIndex + 1) % playlist.length);
  }, [playlist.length]);

  const handlePrevTrack = () => {
    if (playlist.length === 0) return;
    setCurrentTrackIndex((prevIndex) => (prevIndex - 1 + playlist.length) % playlist.length);
  };
  
  const handleShuffle = () => {
      const newIsShuffled = !isShuffled;
      setIsShuffled(newIsShuffled);

      if (newIsShuffled) {
          const currentTrack = playlist[currentTrackIndex];
          const remainingTracks = playlist.filter((_, i) => i !== currentTrackIndex);
          for (let i = remainingTracks.length - 1; i > 0; i--) {
              const j = Math.floor(Math.random() * (i + 1));
              [remainingTracks[i], remainingTracks[j]] = [remainingTracks[j], remainingTracks[i]];
          }
          const shuffledPlaylist = [currentTrack, ...remainingTracks];
          setOriginalPlaylist(playlist);
          setPlaylist(shuffledPlaylist);
          setCurrentTrackIndex(0);
      } else {
          const currentTrackId = playlist[currentTrackIndex]?.id;
          const newIndex = originalPlaylist.findIndex(track => track.id === currentTrackId);
          setPlaylist(originalPlaylist);
          setCurrentTrackIndex(newIndex >= 0 ? newIndex : 0);
      }
  };

  const handleLoadFiles = (replace: boolean) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.accept = 'audio/*,video/*';
    input.onchange = (e) => {
        const files = (e.target as HTMLInputElement).files;
        if (files) {
            const newItems: PlaylistItem[] = Array.from(files).map(file => ({
                id: `local_${Date.now()}_${Math.random()}`,
                name: file.name,
                url: URL.createObjectURL(file),
                type: 'local',
                file: file,
            }));

            if (replace) {
                 // Revoke old object URLs before replacing
                playlist.forEach(item => {
                    if(item.url.startsWith('blob:')) URL.revokeObjectURL(item.url);
                });
                setPlaylist(newItems);
                setOriginalPlaylist(newItems);
                setCurrentTrackIndex(0);
            } else {
                const updatedPlaylist = [...playlist, ...newItems];
                setPlaylist(updatedPlaylist);
                setOriginalPlaylist(updatedPlaylist);
            }
        }
    };
    input.click();
  };
  
  const handleLoadYouTube = (url: string) => {
      let videoId = '';
      try {
          const urlObj = new URL(url);
          if (urlObj.hostname === 'youtu.be') {
              videoId = urlObj.pathname.slice(1);
          } else if (urlObj.hostname.includes('youtube.com')) {
              videoId = urlObj.searchParams.get('v') || '';
          }
      } catch (error) {
          console.error("Invalid YouTube URL", error);
          addToast("Link do YouTube inválido!", 'error');
          return;
      }

      if (videoId) {
          const newItem: PlaylistItem = {
              id: `youtube_${videoId}`,
              name: `YouTube: ${videoId}`,
              url: `https://www.youtube.com/embed/${videoId}?autoplay=1`,
              type: 'youtube',
          };
          setPlaylist([newItem]);
          setOriginalPlaylist([newItem]);
          setCurrentTrackIndex(0);
      } else {
          addToast("Não foi possível extrair o ID do vídeo do YouTube.", 'error');
      }
  };

  const handleToggleMediaPlayer = () => {
    setIsMediaPlayerVisible(prev => !prev);
  };

  const handleUpdatePlayerName = (newName: string) => {
    if (gameStateRef.current) {
        gameStateRef.current.player.name = newName;
        updateUI();
    }
  };

  const handleUpdateProfilePicture = (imageUrl: string) => {
    if (gameStateRef.current) {
        // Revoke the old object URL if it exists to prevent memory leaks
        const oldUrl = gameStateRef.current.player.profilePictureUrl;
        if (oldUrl && oldUrl.startsWith('blob:')) {
            URL.revokeObjectURL(oldUrl);
        }
        gameStateRef.current.player.profilePictureUrl = imageUrl;
        updateUI();
    }
  };

  const handleUpgradeSkill = (skill: keyof import('./types').PlayerSkills) => {
      const gs = gameStateRef.current;
      if (!gs || gs.player.skillPoints <= 0) return;

      const skillMaxLevels = {
          gerente: 5,
          sortudo: 2,
          tratador: 5,
          treinador: 3,
      };

      if (gs.player.skills[skill] < skillMaxLevels[skill]) {
          gs.player.skills[skill]++;
          gs.player.skillPoints--;
          updateUI();
      }
  };

  const handleSaveTeam = (newTeamIds: string[]) => {
    const gs = gameStateRef.current;
    if (!gs) return;

    const oldTeamIds = new Set(gs.player.team);
    const newTeamIdsSet = new Set(newTeamIds);

    const teamBonus = 10;
    const bonusKey = 'Bônus de Time';

    // Find who was added
    for (const id of newTeamIds) {
        if (!oldTeamIds.has(id)) {
            const pokemon = gs.pokemons.find(p => p.id === id);
            if (pokemon) {
                pokemon.happiness = Math.min(100, pokemon.happiness + teamBonus);
                pokemon.happinessModifiers[bonusKey] = teamBonus;
            }
        }
    }

    // Find who was removed
    for (const id of gs.player.team) {
        if (!newTeamIdsSet.has(id)) {
            const pokemon = gs.pokemons.find(p => p.id === id);
            if (pokemon) {
                pokemon.happiness = Math.max(0, pokemon.happiness - teamBonus);
                delete pokemon.happinessModifiers[bonusKey];
            }
        }
    }
    
    gs.player.team = newTeamIds;
    setIsTeamModalOpen(false);
    updateUI();
  };


  if (!uiState || !gameStateRef.current) {
    return <div className="w-full h-full flex items-center justify-center">Carregando...</div>;
  }

  return (
    <div className="relative w-full h-full overflow-hidden">
      <UINotification message={notification} />
      <ToastContainer toasts={toasts} onDismiss={dismissToast} onDismissAll={dismissAllToasts} />
      <GameCanvas 
        gameStateRef={gameStateRef}
        isBuildMode={isBuildMode}
        selectedBuildType={selectedBuildType}
        buildRotation={buildRotation}
        activePlantingSeed={activePlantingSeed}
        onPlaceBuilding={handlePlaceBuilding}
        onOpenCrafting={() => setActiveModal('crafting')}
        onOpenBuildingInfo={handleOpenBuildingInfo}
        onPlantActiveSeed={handlePlantActiveSeed}
        onStateUpdate={updateUI}
        onShowNotification={showNotification}
        onOpenPokemonDetail={handleOpenPokemonDetail}
        onCollectResource={handleCollectResource}
      />
      <TopBar 
        uiState={uiState} 
        onPokedex={() => setActiveModal(activeModal === 'pokedex' ? null : 'pokedex')}
        onMarket={() => setActiveModal(activeModal === 'market' ? null : 'market')}
        onBuild={handleBuildClick}
        isSettingsMenuOpen={isSettingsMenuOpen}
        onToggleSettingsMenu={handleToggleSettingsMenu}
        onSaveToFile={handleSaveToFile}
// FIX: Changed 'onLoadFromFile' to 'handleLoadFromFile' to pass the correct function prop.
        onLoadFromFile={handleLoadFromFile}
        onCheat={handleCheat}
        onUpdateDayChangeHour={handleUpdateDayChangeHour}
        onAdvanceTime24h={handleAdvanceTime24h}
        onSpawnPokemon={handleCheatSpawnPokemon}
        isMediaPlayerVisible={isMediaPlayerVisible}
        onToggleMediaPlayer={handleToggleMediaPlayer}
      />
      
      <ProfileIcon
        profilePictureUrl={uiState.playerProfilePictureUrl}
        onClick={() => setIsProfileModalOpen(true)}
      />
      <ProfileModal
        isOpen={isProfileModalOpen}
        onClose={() => setIsProfileModalOpen(false)}
        level={uiState.level}
        experience={uiState.experience}
        experienceToNextLevel={uiState.experienceToNextLevel}
        name={uiState.playerName}
        profilePictureUrl={uiState.playerProfilePictureUrl}
        onNameChange={handleUpdatePlayerName}
        onPictureChange={handleUpdateProfilePicture}
        skillPoints={uiState.skillPoints}
        onOpenSkills={() => {
            setIsProfileModalOpen(false);
            setIsSkillsModalOpen(true);
        }}
        team={uiState.team}
        allPokemons={gameStateRef.current.pokemons}
        onOpenTeam={() => {
            setIsProfileModalOpen(false);
            setIsTeamModalOpen(true);
        }}
      />
      
      {activeTask && (
          <TaskForm 
              task={activeTask === 'new' ? null : activeTask}
              onSave={handleSaveTask}
              onCancel={() => setActiveTask(null)}
          />
      )}

      <TaskManager 
          tasks={uiState.tasks}
          day={uiState.day}
          onCompleteTask={handleCompleteTask}
          onDeleteTask={handleRequestDeleteTask}
          onToggleSubtask={handleToggleSubtask}
          onEditTask={(task) => setActiveTask(task)}
          onNewTask={() => setActiveTask('new')}
      />
      
      <ClockWidget day={uiState.day} onClick={() => setIsTimeManagerOpen(true)} />
      
      <PlantingToolbar
        player={gameStateRef.current.player}
        activeSeed={activePlantingSeed}
        onSelectSeed={handleSelectSeedForPlanting}
        onCancel={handleCancelPlanting}
       />
      
      <MediaPlayer
        isVisible={isMediaPlayerVisible}
        onMinimize={() => setIsMediaPlayerVisible(false)}
        position={mediaPlayerPosition}
        setPosition={setMediaPlayerPosition}
        size={mediaPlayerSize}
        onSetSize={setMediaPlayerSize}
        playlist={playlist}
        currentTrackIndex={currentTrackIndex}
        onNext={handleNextTrack}
        onPrev={handlePrevTrack}
        onShuffle={handleShuffle}
        isShuffled={isShuffled}
        onLoadFiles={handleLoadFiles}
        onLoadYouTube={handleLoadYouTube}
        onSetPlaylist={setPlaylist}
        onSetTrackIndex={setCurrentTrackIndex}
      />

      <StarterSelectionModal isOpen={isChoosingStarter} onSelect={handleSelectStarter} />
      <PokedexModal 
        isOpen={activeModal === 'pokedex'} 
        onClose={handleCloseModal} 
        pokemons={uiState.pokemons}
        player={gameStateRef.current.player}
        onRenamePokemon={handleRenamePokemon} 
        onEvolvePokemon={handleEvolvePokemon}
        onLocatePokemon={handleLocatePokemon}
        onReleasePokemon={handleRequestReleasePokemon}
        modalId="pokedex"
      />
      <PokemonDetailModal
        pokemon={detailedPokemon}
        onClose={handleClosePokemonDetail}
        gameState={gameStateRef.current}
        onReleasePokemon={handleRequestReleasePokemon}
      />
      <CraftingModal isOpen={activeModal === 'crafting'} onClose={handleCloseModal} player={gameStateRef.current.player} hasCampfire={uiState.hasCampfire} onCraft={handleCraft} modalId="crafting" />
      <MarketModal isOpen={activeModal === 'market'} onClose={handleCloseModal} player={gameStateRef.current.player} onTransaction={handleMarketTransaction} modalId="market" />
      <BuildModal isOpen={activeModal === 'build'} onClose={handleCloseModal} player={gameStateRef.current.player} onSelect={handleSelectBuilding} modalId="build" />
      <BuildingInfoModal 
        isOpen={!!infoModalBuilding} 
        onClose={handleCloseModal} 
        building={infoModalBuilding} 
        allPokemons={gameStateRef.current.pokemons} 
        player={gameStateRef.current.player}
        onRequestDestroy={handleRequestDestroy}
        onLocatePokemon={handleLocatePokemon}
        onMeditate={handleMeditate}
        onStartFossilRevival={handleStartFossilRevival}
        modalId={`building-info-${infoModalBuilding?.id || ''}`}
      />
      <TimeManagerModal
          isOpen={isTimeManagerOpen}
          onClose={() => setIsTimeManagerOpen(false)}
          gameState={gameStateRef.current}
          onSaveAlarm={handleSaveAlarm}
          onDeleteAlarm={handleDeleteAlarm}
          onToggleAlarm={handleToggleAlarm}
          onTimerUpdate={handleTimerUpdate}
          onAddWorldClock={handleAddWorldClock}
          onDeleteWorldClock={handleDeleteWorldClock}
          modalId="time-manager"
      />
       <SkillsModal
        isOpen={isSkillsModalOpen}
        onClose={() => setIsSkillsModalOpen(false)}
        skills={uiState.skills}
        skillPoints={uiState.skillPoints}
        onUpgradeSkill={handleUpgradeSkill}
      />
      <TeamSelectionModal
        isOpen={isTeamModalOpen}
        onClose={() => setIsTeamModalOpen(false)}
        onSave={handleSaveTeam}
        allPokemons={gameStateRef.current.pokemons}
        currentTeamIds={uiState.team}
        modalId="team-selection"
      />
      <AlarmNotificationModal
        isOpen={!!triggeredAlarm}
        alarm={triggeredAlarm}
        onStop={() => {
            stopAlarmSound();
            setTriggeredAlarm(null);
        }}
      />
      <DeathNotificationModal
        isOpen={!!killedPokemonName}
        pokemonName={killedPokemonName || ''}
        onClose={() => setKilledPokemonName(null)}
      />
      <ConfirmModal
        isOpen={!!confirmation}
        message={confirmation?.message || ''}
        onConfirm={confirmation?.onConfirm || (() => {})}
        onCancel={handleCancelConfirmation}
        modalId="confirm"
      />
    </div>
  );
};

export default App;
