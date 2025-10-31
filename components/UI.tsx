
import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { UIState, Inventory, Pokemon, Player, Recipe, Building, Task, TaskDifficulty, TaskFrequency, TaskFrequencyType, Subtask, GameState, Alarm, AlarmFrequency, AlarmFrequencyType, TimerState, WorldClockLocation, PlayerSkills } from '../types';
import { RECIPES, MARKET_PRICES, POKEMON_IDS, POKEMON_CAPACITY, CRAFTING_ENERGY_COST, POKEMON_EVOLUTIONS, ITEM_DISPLAY_NAMES, ALL_POKEMON_SPECIES, POKEMON_ABILITIES, ITEM_ICONS } from '../constants';
import { getBuildCost, isTaskDueOnDate, isTaskCompletedToday, isTaskDueTomorrow, taskHasDueDate } from '../services/game';

const useDraggable = (id: string) => {
    const [position, setPosition] = useState(() => {
        const savedPosition = sessionStorage.getItem(`draggable-pos-${id}`);
        if (savedPosition) {
            const pos = JSON.parse(savedPosition);
            // Boundary check for saved position to avoid off-screen on resize
            pos.x = Math.max(0, Math.min(pos.x, window.innerWidth - 200)); 
            pos.y = Math.max(0, Math.min(pos.y, window.innerHeight - 100));
            return pos;
        }
        
        // Default to a centered position with a random offset
        const width = 450; // Average modal width
        const height = 500; // Average modal height
        const initialX = (window.innerWidth - width) / 2;
        const initialY = (window.innerHeight - height) / 2;
        
        const offsetX = Math.floor((Math.random() - 0.5) * 80); // +/- 40px
        const offsetY = Math.floor((Math.random() - 0.5) * 80); // +/- 40px

        return { 
            x: Math.max(20, initialX + offsetX), 
            y: Math.max(20, initialY + offsetY)
        };
    });

    const elementRef = useRef<HTMLDivElement>(null);
    const dragStartRef = useRef<{ startX: number, startY: number, initialX: number, initialY: number } | null>(null);

    const handleMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
        // Prevent drag from starting on interactive elements like buttons
        if ((e.target as HTMLElement).closest('button, a, input, select, textarea')) {
            return;
        }
        if (!elementRef.current) return;
        dragStartRef.current = {
            startX: e.clientX,
            startY: e.clientY,
            initialX: elementRef.current.offsetLeft,
            initialY: elementRef.current.offsetTop
        };
        e.preventDefault();
        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
    }, []);

    const handleMouseMove = useCallback((e: MouseEvent) => {
        if (!dragStartRef.current || !elementRef.current) return;
        const dx = e.clientX - dragStartRef.current.startX;
        const dy = e.clientY - dragStartRef.current.startY;
        
        const newX = dragStartRef.current.initialX + dx;
        const newY = dragStartRef.current.initialY + dy;

        const { offsetWidth, offsetHeight } = elementRef.current;
        const maxX = window.innerWidth - offsetWidth;
        const maxY = window.innerHeight - offsetHeight;

        const clampedX = Math.max(0, Math.min(newX, maxX));
        const clampedY = Math.max(0, Math.min(newY, maxY));
        
        setPosition({ x: clampedX, y: clampedY });
    }, []);

    const handleMouseUp = useCallback(() => {
        if (dragStartRef.current) {
            sessionStorage.setItem(`draggable-pos-${id}`, JSON.stringify(position));
        }
        dragStartRef.current = null;
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
    }, [handleMouseMove, id, position]);

    return {
        position,
        handleMouseDown,
        elementRef
    };
};




interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footerContent?: React.ReactNode;
  widthClass?: string;
  modalId: string;
}
const Modal: React.FC<ModalProps> = ({ isOpen, onClose, title, children, footerContent, widthClass = 'max-w-lg', modalId }) => {
  const { position, handleMouseDown, elementRef } = useDraggable(modalId);
  
  if (!isOpen) return null;
  return (
    <div 
        ref={elementRef}
        style={{ top: `${position.y}px`, left: `${position.x}px` }}
        className={`fixed bg-gradient-to-b from-[#8f5d3a] to-[#5b3f26] p-4 rounded-xl shadow-2xl z-[70] min-w-[380px] w-full ${widthClass} max-h-[85vh] flex flex-col border-4 border-[#5b3f26]`}
    >
      <div onMouseDown={handleMouseDown} className="cursor-move">
        <h3 className="m-0 mb-3 text-white border-b-2 border-white/10 pb-2 text-xl font-bold select-none">{title}</h3>
      </div>
      <div className="overflow-y-auto flex-grow pr-2">{children}</div>
      <div className="mt-4 flex justify-end">
        {footerContent || <button onClick={onClose} className="btn-wood">Fechar</button>}
      </div>
    </div>
  );
};
const BtnWood: React.FC<{onClick: () => void; children: React.ReactNode; className?: string, disabled?: boolean}> = ({ onClick, children, className, disabled }) => (
    <div onClick={!disabled ? onClick : undefined} className={`bg-gradient-to-b from-[#a06b43] to-[#603a20] rounded-lg py-2 px-4 text-white cursor-pointer border border-white/10 text-base hover:brightness-110 select-none ${className} ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}>
        {children}
    </div>
);

const PokeballIcon: React.FC<{className?: string}> = ({ className }) => (
    <svg className={className} viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
        <circle cx="50" cy="50" r="48" fill="#f0f0f0" stroke="#333" strokeWidth="4"/>
        <path d="M 50 2 A 48 48 0 0 1 50 98 Z" fill="#f44336" />
        <line x1="2" y1="50" x2="98" y2="50" stroke="#333" strokeWidth="6"/>
        <circle cx="50" cy="50" r="15" fill="#f0f0f0" stroke="#333" strokeWidth="4"/>
        <circle cx="50" cy="50" r="8" fill="#333"/>
    </svg>
);

const DifficultyPokeballIcon: React.FC<{ difficulty: TaskDifficulty }> = ({ difficulty }) => {
    const color = {
        'Trivial': '#4ade80', // green-400
        'Fácil': '#38bdf8', // sky-400
        'Médio': '#f59e0b', // amber-500
        'Difícil': '#ef4444', // red-500
    }[difficulty];

    return (
        <svg viewBox="0 0 100 100" className="w-4 h-4 inline-block">
            <circle cx="50" cy="50" r="48" fill="#f0f0f0" stroke="#333" strokeWidth="4"/>
            <path d="M 50 2 A 48 48 0 0 1 50 98 Z" fill={color} />
            <line x1="2" y1="50" x2="98" y2="50" stroke="#333" strokeWidth="6"/>
            <circle cx="50" cy="50" r="15" fill="#f0f0f0" stroke="#333" strokeWidth="4"/>
            <circle cx="50" cy="50" r="8" fill="#333"/>
        </svg>
    );
};

const GenderIcon: React.FC<{ gender: 'male' | 'female', className?: string }> = ({ gender, className }) => {
  if (gender === 'male') {
    return <span className={`inline-flex items-center justify-center w-4 h-4 rounded-full bg-blue-500 text-white font-bold text-xs ${className}`}>♂</span>;
  }
  return <span className={`inline-flex items-center justify-center w-4 h-4 rounded-full bg-pink-500 text-white font-bold text-xs ${className}`}>♀</span>;
};

export const ProfileIcon: React.FC<{
    profilePictureUrl: string | null;
    onClick: () => void;
}> = ({ profilePictureUrl, onClick }) => {
    return (
        <div 
            className="fixed top-24 left-3 w-40 h-40 rounded-full cursor-pointer z-50 border-4 border-[#8f5d3a] shadow-lg hover:scale-105 transition-transform"
            onClick={onClick}
            title="Abrir perfil"
        >
            <img 
                src={profilePictureUrl || 'https://i.imgur.com/placeh.png'} 
                alt="Perfil"
                className="w-full h-full object-cover rounded-full"
            />
        </div>
    );
};

export const ProfileModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    level: number;
    experience: number;
    experienceToNextLevel: number;
    name: string;
    profilePictureUrl: string | null;
    onNameChange: (newName: string) => void;
    onPictureChange: (newUrl: string) => void;
    skillPoints: number;
    onOpenSkills: () => void;
    team: string[];
    allPokemons: Pokemon[];
    onOpenTeam: () => void;
}> = ({ isOpen, onClose, level, experience, experienceToNextLevel, name, profilePictureUrl, onNameChange, onPictureChange, skillPoints, onOpenSkills, team, allPokemons, onOpenTeam }) => {
    const fileInputRef = useRef<HTMLInputElement>(null);
    
    const getSpriteUrl = (pokemon: Pokemon) => {
        const pokemonId = POKEMON_IDS[pokemon.kind as keyof typeof POKEMON_IDS];
        if (!pokemonId) return '';
        const shinyPath = pokemon.isShiny ? 'shiny/' : '';
        return `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${shinyPath}${pokemonId}.png`;
    };

    const teamPokemons = useMemo(() => {
        const teamSet = new Set(team);
        return allPokemons.filter(p => teamSet.has(p.id))
            .sort((a, b) => team.indexOf(a.id) - team.indexOf(b.id)); // Maintain order
    }, [allPokemons, team]);

    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file) {
            const newUrl = URL.createObjectURL(file);
            onPictureChange(newUrl);
        }
    };
    
    const footer = <BtnWood onClick={onClose}>Fechar</BtnWood>;

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Ficha do Jogador" footerContent={footer} modalId="profile-modal">
            <div className="flex flex-col items-center p-3">
                <label className="cursor-pointer group" htmlFor="profile-picture-upload-modal" title="Clique para mudar a imagem">
                    <div className="w-32 h-32 rounded-full bg-black/20 mx-auto mb-2 overflow-hidden border-2 border-white/20 relative">
                        <img
                            src={profilePictureUrl || 'https://i.imgur.com/placeh.png'}
                            alt="Foto de Perfil"
                            className="w-full h-full object-cover"
                        />
                        <div className="absolute inset-0 bg-black/50 flex items-center justify-center text-white text-3xl opacity-0 group-hover:opacity-100 transition-opacity">
                            ✏️
                        </div>
                    </div>
                    <input
                        id="profile-picture-upload-modal"
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        onChange={handleFileChange}
                        className="hidden"
                    />
                </label>
                <input
                    type="text"
                    value={name}
                    // FIX: Explicitly typed the event handler to resolve potential type errors.
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => onNameChange(e.target.value)}
                    className="w-full bg-transparent text-center text-white font-bold text-xl focus:outline-none focus:border-b-2 border-white/50 pb-1"
                />
                <div className="text-center text-sm opacity-90 mt-4">Nível {level}</div>
                <div className="w-full bg-black/30 rounded-full h-4 my-1 relative border border-black/50" title={`${experience} / ${experienceToNextLevel} XP`}>
                    <div
                        className="bg-gradient-to-r from-green-400 to-green-600 h-full rounded-full transition-all duration-500"
                        style={{ width: `${(experience / experienceToNextLevel) * 100}%` }}
                    ></div>
                    <div className="absolute inset-0 flex items-center justify-center text-xs font-mono text-white" style={{textShadow: '1px 1px 2px #000'}}>
                        {experience} / {experienceToNextLevel}
                    </div>
                </div>
                <div className="mt-4 w-full">
                    <BtnWood onClick={onOpenSkills} className="w-full text-center relative">
                        Habilidades
                        {skillPoints > 0 && (
                            <span className="absolute -top-2 -right-2 bg-red-500 text-white text-xs font-bold rounded-full w-6 h-6 flex items-center justify-center border-2 border-[#8f5d3a]">
                                {skillPoints}
                            </span>
                        )}
                    </BtnWood>
                </div>
                 <div className="mt-4 w-full">
                    <h4 className="font-bold text-center mb-2">Time Pokémon</h4>
                    <div className="grid grid-cols-3 gap-2 bg-black/20 p-2 rounded-lg">
                        {teamPokemons.map(p => (
                            <div key={p.id} className="flex flex-col items-center bg-black/20 p-1 rounded" title={`${p.name} (${p.kind})`}>
                                <img src={getSpriteUrl(p)} alt={p.name} className="w-12 h-12 image-pixelated"/>
                                <span className="text-xs truncate w-full text-center">{p.name}</span>
                            </div>
                        ))}
                        {Array.from({ length: 6 - teamPokemons.length }).map((_, i) => (
                             <div key={i} className="flex flex-col items-center justify-center bg-black/10 p-1 rounded h-[68px] border-2 border-dashed border-white/10">
                                <span className="text-2xl opacity-30">+</span>
                            </div>
                        ))}
                    </div>
                     <BtnWood onClick={onOpenTeam} className="w-full text-center mt-3">
                        Gerenciar Time
                    </BtnWood>
                </div>
            </div>
        </Modal>
    );
};


const SettingsWindow: React.FC<{
    onClose: () => void;
    onSaveToFile: () => void;
    onLoadFromFile: () => void;
    onCheat: (resource: 'money' | 'wood' | 'stone' | 'energy' | 'metal') => void;
    onUpdateDayChangeHour: (hour: number) => void;
    onAdvanceTime24h: () => void;
    onSpawnPokemon: (kind: string) => void;
    uiState: UIState;
}> = ({ onClose, onSaveToFile, onLoadFromFile, onCheat, onUpdateDayChangeHour, onAdvanceTime24h, onSpawnPokemon, uiState }) => {
    
    const { position, handleMouseDown, elementRef } = useDraggable('settings-window');
    const [selectedSpawnPokemon, setSelectedSpawnPokemon] = useState<string>(ALL_POKEMON_SPECIES[0]);

    return (
        <div
            ref={elementRef}
            style={{ top: position.y, left: position.x }}
            className="fixed bg-gradient-to-b from-[#6e492e] to-[#4a321f] p-3 rounded-lg z-[70] w-64 shadow-xl border-2 border-[#4a321f]"
        >
            <div className="flex justify-between items-center mb-2 pb-2 border-b border-white/10 cursor-move" onMouseDown={handleMouseDown}>
                <h4 className="font-bold text-white text-center select-none">Configurações</h4>
                <button onClick={onClose} className="text-white font-bold hover:text-red-400">X</button>
            </div>
            
            <div className="flex flex-col gap-2">
              <button onClick={onSaveToFile} className="bg-gradient-to-b from-[#a06b43] to-[#603a20] hover:brightness-110 text-white text-sm py-1.5 rounded-md transition-all w-full text-center">Salvar em Arquivo</button>
              <button onClick={onLoadFromFile} className="bg-gradient-to-b from-[#a06b43] to-[#603a20] hover:brightness-110 text-white text-sm py-1.5 rounded-md transition-all w-full text-center">Carregar de Arquivo</button>
            </div>
            
            <div className="border-t border-white/20 my-2"></div>
            <div className="flex flex-col gap-1">
                <label htmlFor="dayChangeHourSelect" className="text-xs text-white/80">Hora de início do dia</label>
                <select
                    id="dayChangeHourSelect"
                    value={uiState.dayChangeHour}
// FIX: Explicitly typed the event handler to resolve potential type errors.
                    onChange={(e: React.ChangeEvent<HTMLSelectElement>) => onUpdateDayChangeHour(parseInt(e.target.value, 10))}
                    className="settings-select bg-black/50 text-white text-sm py-1 rounded border border-white/10 focus:ring-2 focus:ring-[#a06b43] outline-none"
                >
                    {Array.from({ length: 24 }, (_, i) => (
                        <option key={i} value={i}>{i.toString().padStart(2, '0')}:00</option>
                    ))}
                </select>
            </div>
            
            <div className="border-t border-white/20 my-3"></div>
            
            <h4 className="font-bold text-white mb-2 text-center border-b border-white/10 pb-2">Painel de Cheats</h4>
            <div className="flex flex-col gap-2">
              <button onClick={() => onCheat('money')} className="bg-gradient-to-b from-[#a06b43] to-[#603a20] hover:brightness-110 text-white text-sm py-1.5 rounded-md transition-all w-full text-center">+10000 Dinheiro</button>
              <button onClick={() => onCheat('wood')} className="bg-gradient-to-b from-[#a06b43] to-[#603a20] hover:brightness-110 text-white text-sm py-1.5 rounded-md transition-all w-full text-center">+1000 Madeira</button>
              <button onClick={() => onCheat('stone')} className="bg-gradient-to-b from-[#a06b43] to-[#603a20] hover:brightness-110 text-white text-sm py-1.5 rounded-md transition-all w-full text-center">+1000 Pedra</button>
              <button onClick={() => onCheat('metal')} className="bg-gradient-to-b from-[#a06b43] to-[#603a20] hover:brightness-110 text-white text-sm py-1.5 rounded-md transition-all w-full text-center">+1000 Metal</button>
              <button onClick={() => onCheat('energy')} className="bg-gradient-to-b from-[#a06b43] to-[#603a20] hover:brightness-110 text-white text-sm py-1.5 rounded-md transition-all w-full text-center">Regenerar Energia</button>
              <button onClick={onAdvanceTime24h} className="bg-gradient-to-b from-[#a06b43] to-[#603a20] hover:brightness-110 text-white text-sm py-1.5 rounded-md transition-all w-full text-center">Avançar 24h (Debug)</button>
            </div>

            <div className="border-t border-white/20 my-3"></div>
            <h4 className="font-bold text-white mb-2 text-center border-b border-white/10 pb-2">Gerar Pokémon (Debug)</h4>
            <div className="flex gap-2">
                <select
                    value={selectedSpawnPokemon}
// FIX: Explicitly typed the event handler to resolve potential type errors.
                    onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setSelectedSpawnPokemon(e.target.value)}
                    className="settings-select bg-black/50 text-white text-sm py-1 rounded border border-white/10 focus:ring-2 focus:ring-[#a06b43] outline-none flex-grow"
                >
                    {ALL_POKEMON_SPECIES.map(kind => (
                        <option key={kind} value={kind}>{kind}</option>
                    ))}
                </select>
                <button
                    onClick={() => onSpawnPokemon(selectedSpawnPokemon)}
                    className="bg-green-600 hover:bg-green-500 text-white text-xs py-1 px-2 rounded-md transition-all text-center"
                >
                    Gerar
                </button>
            </div>
        </div>
    );
};

interface TopBarProps {
  uiState: UIState;
  onPokedex: () => void;
  onMarket: () => void;
  onBuild: () => void;
  isSettingsMenuOpen: boolean;
  onToggleSettingsMenu: () => void;
  onSaveToFile: () => void;
  onLoadFromFile: () => void;
  onCheat: (resource: 'money' | 'wood' | 'stone' | 'energy' | 'metal') => void;
  onUpdateDayChangeHour: (hour: number) => void;
  onAdvanceTime24h: () => void;
  onSpawnPokemon: (kind: string) => void;
  isMediaPlayerVisible: boolean;
  onToggleMediaPlayer: () => void;
}
export const TopBar: React.FC<TopBarProps> = ({ 
    uiState, onPokedex, onMarket, onBuild,
    isSettingsMenuOpen, onToggleSettingsMenu, onSaveToFile, onLoadFromFile,
    onCheat, onUpdateDayChangeHour, onAdvanceTime24h, onSpawnPokemon,
    isMediaPlayerVisible, onToggleMediaPlayer
}) => {
  const { energy, maxEnergy, money, inventory, dailyIncome, averageHappiness } = uiState;
  const [showMoneyTooltip, setShowMoneyTooltip] = useState(false);
  
  const inventoryItems = Object.keys(inventory).filter(k => inventory[k] > 0);
  
  const energyTextColorClass = energy < 20
    ? 'text-red-400'
    : energy < 50
    ? 'text-yellow-400'
    : 'text-white';


  return (
    <>
        <div className="absolute left-3 right-3 top-3 h-auto md:h-auto rounded-xl p-2 md:p-3 flex flex-col md:flex-row items-center gap-3 bg-gradient-to-b from-[#8f5d3a] to-[#5b3f26] shadow-2xl z-50">
            <div className="flex items-center gap-3 font-bold text-xl text-white mr-3">
                <PokeballIcon className="w-8 h-8" />
                <span>PokéFarm</span>
            </div>
            <div className="flex items-center gap-2 flex-wrap justify-center">
                <div className="bg-white/5 py-1 px-2.5 rounded-lg min-w-[100px] text-center">
                    <div className="text-sm opacity-90">Energia</div>
                    <div className={`font-bold text-lg transition-colors duration-500 ${energyTextColorClass}`}>{Math.floor(energy)}/{maxEnergy}</div>
                </div>
                <div 
                    className="relative bg-white/5 py-1 px-2.5 rounded-lg min-w-[100px] text-center cursor-pointer"
                    onMouseEnter={() => setShowMoneyTooltip(true)}
                    onMouseLeave={() => setShowMoneyTooltip(false)}
                >
                    <div className="text-sm opacity-90">Dinheiro</div>
                    <div className="font-bold text-lg">${Math.floor(money)}</div>
                    {showMoneyTooltip && dailyIncome && typeof dailyIncome === 'object' && Object.keys(dailyIncome).length > 0 && (
                        <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 w-48 bg-black/80 p-2 rounded-md text-left text-xs z-10 whitespace-nowrap shadow-lg">
                            <div className="font-bold mb-1 border-b border-white/10 pb-1">Renda do Último Dia</div>
                            {Object.entries(dailyIncome).map(([source, amount]) => (
                                <div key={source} className="flex justify-between mt-1">
                                    <span>{source}:</span>
                                    <span>${(Number(amount)).toFixed(2)}</span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
                <div className="bg-white/5 py-1 px-2.5 rounded-lg min-w-[100px] text-center">
                    <div className="text-sm opacity-90">❤️ Felicidade</div>
                    <div className="font-bold text-lg">{averageHappiness}</div>
                </div>
            </div>
            <div className="hidden lg:flex gap-1.5 flex-wrap mx-2 flex-1 items-center">
                {inventoryItems.map(k => (
                    <div key={k} className="flex items-center gap-1 bg-black/20 p-1 rounded-md text-sm" title={ITEM_DISPLAY_NAMES[k] || k}>
                        <span className="text-lg leading-none">{ITEM_ICONS[k] || '❓'}</span>
                        <span className="font-mono">{inventory[k]}</span>
                    </div>
                ))}
            </div>
            <div className="flex items-center gap-2 mt-2 md:mt-0 md:ml-auto">
                <BtnWood onClick={onPokedex}>📘 Pokédex</BtnWood>
                <BtnWood onClick={onBuild}>🗺️ Construir</BtnWood>
                <BtnWood onClick={onMarket}>🏪 Mercado</BtnWood>
                <button
                    onClick={onToggleMediaPlayer}
                    className={`w-9 h-9 flex items-center justify-center rounded-lg text-2xl font-bold shadow-md transition-colors ${
                        isMediaPlayerVisible 
                        ? 'bg-green-600/80 hover:bg-green-500' 
                        : 'bg-purple-600/50 hover:bg-purple-500'
                    }`}
                    aria-label="Alternar Player"
                    title="Alternar Player"
                >
                    🎵
                </button>
                <div className="relative">
                    <button 
                        onClick={onToggleSettingsMenu}
                        className="bg-blue-600/50 hover:bg-blue-600/80 text-white w-9 h-9 flex items-center justify-center rounded-lg text-2xl font-bold shadow-md transition-colors"
                        aria-label="Menu"
                        title="Menu"
                    >
                        ⚙️
                    </button>
                </div>
            </div>
        </div>
        {isSettingsMenuOpen && (
            <SettingsWindow 
                onClose={onToggleSettingsMenu}
                uiState={uiState}
                onSaveToFile={onSaveToFile}
                onLoadFromFile={onLoadFromFile}
                onCheat={onCheat}
                onUpdateDayChangeHour={onUpdateDayChangeHour}
                onAdvanceTime24h={onAdvanceTime24h}
                onSpawnPokemon={onSpawnPokemon}
            />
        )}
    </>
  );
};

const BUILD_ICONS: { [key: string]: string } = {
    farm_area: '🌱',
    stable_miltank: '🐄',
    stable_mareep: '🐑',
    coop: '🐔',
    mine: '⛏️',
    lake: '🏞️',
    campfire: '🔥',
    pokemon_gym: '🏆',
    laboratory: '🔬',
};

export const BuildModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  player: Player;
  onSelect: (type: string) => void;
  modalId: string;
}> = ({ isOpen, onClose, player, onSelect, modalId }) => {
    const buildOptions = [
        { type: 'farm_area', title: 'Área de Cultivo' },
        { type: 'stable_miltank', title: 'Estábulo (Miltank)' },
        { type: 'stable_mareep', title: 'Estábulo (Mareep)' },
        { type: 'coop', title: 'Granja' },
        { type: 'mine', title: 'Mina' },
        { type: 'lake', title: 'Lago Zen' },
        { type: 'campfire', title: 'Fogueira' },
        { type: 'pokemon_gym', title: 'Ginásio Pokémon' },
        { type: 'laboratory', title: 'Laboratório' },
    ];
    
    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Construções" modalId={modalId}>
            <div className="space-y-2">
                {buildOptions.map(opt => {
                    const cost = getBuildCost(opt.type);
                    const canAfford = player.money >= cost.money && player.hasItems(cost.resources);
                    const costString = Object.entries(cost.resources)
                        .map(([key, value]) => `${ITEM_DISPLAY_NAMES[key] || key}: ${value}`)
                        .join(' ') + ` $${cost.money}`;

                    return (
                        <div key={opt.type} className={`flex items-center gap-4 p-2.5 rounded-lg transition-all duration-200 bg-white/5 ${!canAfford ? 'opacity-50' : ''}`}>
                            <div className="text-4xl bg-black/20 w-16 h-16 flex items-center justify-center rounded-lg">{BUILD_ICONS[opt.type] || '?'}</div>
                            <div className="flex-grow">
                                <div className="font-semibold text-lg">{opt.title}</div>
                                <div className="text-sm opacity-80">{costString}</div>
                                {opt.type === 'mine' && <div className="text-xs text-amber-300 mt-1">Deve ser construída sobre a pedreira.</div>}
                            </div>
                            <button 
                                onClick={() => onSelect(opt.type)}
                                disabled={!canAfford}
                                className="bg-[#2fa66b] text-white py-2 px-4 rounded-md cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed hover:brightness-110"
                            >
                                Construir
                            </button>
                        </div>
                    );
                })}
            </div>
            <div className="text-center mt-4 text-gray-300 text-xs">Selecione uma construção e clique no mapa para posicionar.</div>
        </Modal>
    );
};

export const PokedexModal: React.FC<{ 
    isOpen: boolean; 
    onClose: () => void; 
    pokemons: Pokemon[];
    player: Player;
    onRenamePokemon: (pokemonId: string, newName: string) => void;
    onEvolvePokemon: (pokemonId: string) => void;
    onLocatePokemon: (pokemonId: string) => void;
    onReleasePokemon: (pokemonId: string, pokemonName: string) => void;
    modalId: string;
}> = ({ isOpen, onClose, pokemons, player, onRenamePokemon, onEvolvePokemon, onLocatePokemon, onReleasePokemon, modalId }) => {
  const [filter, setFilter] = useState('');

  const availableSpecies = useMemo(() => {
    const species = new Set(pokemons.map(p => p.kind));
    return Array.from(species).sort();
  }, [pokemons]);

  const filteredPokemons = useMemo(() => {
    if (!filter) return pokemons;
    return pokemons.filter(p => p.kind === filter);
  }, [pokemons, filter]);

  const getSpriteUrl = (pokemon: Pokemon) => {
    const baseUrl = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/';
    const shinyPath = pokemon.isShiny ? 'shiny/' : '';
    const pokemonId = POKEMON_IDS[pokemon.kind as keyof typeof POKEMON_IDS];
    if(!pokemonId) return '';
    return `${baseUrl}${shinyPath}${pokemonId}.png`;
  };

  const HappinessHeart: React.FC<{ happiness: number }> = ({ happiness }) => {
    const color =
        happiness <= 20 ? '#ef4444' : // red-500
        happiness <= 40 ? '#f59e0b' : // amber-500
        happiness <= 60 ? '#a1a1aa' : // zinc-400
        happiness <= 80 ? '#4ade80' : // green-400
        '#22d3ee'; // cyan-400
    
    return (
        <svg viewBox="0 0 24 24" className="w-4 h-4 inline-block" fill={color} title={`Felicidade: ${happiness}/100`}>
            <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
        </svg>
    );
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Pokédex da Fazenda" modalId={modalId}>
      <div className="flex items-center gap-3 mb-3">
          <label htmlFor="pokedex-filter" className="text-sm">Filtrar por espécie:</label>
          <select 
            id="pokedex-filter"
            value={filter} 
// FIX: Explicitly typed the event handler to resolve potential type errors.
            onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setFilter(e.target.value)}
            className="bg-white/10 rounded p-1.5 text-sm flex-grow"
          >
            <option value="">Todos</option>
            {availableSpecies.map(kind => <option key={kind} value={kind}>{kind}</option>)}
          </select>
      </div>

      <div className="space-y-2">
        {filteredPokemons.length > 0 ? filteredPokemons.map(p => {
            const evolutionTarget = POKEMON_EVOLUTIONS[p.kind];
            const canEvolve = evolutionTarget && player.hasItems({ 'evolution_stone': 1 });

            return (
              <div key={p.id} className="flex items-center gap-3 p-2 bg-white/5 rounded-md">
                <img src={getSpriteUrl(p)} alt={p.kind} className="w-12 h-12 image-pixelated bg-black/20 rounded-full" />
                <div className="flex-grow">
                    <div className="flex items-center gap-2">
                        <input 
                            type="text" 
                            value={p.name}
// FIX: Explicitly typed the event handler to resolve potential type errors.
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => onRenamePokemon(p.id, e.target.value)}
                            className="font-bold text-lg bg-transparent border-b border-transparent focus:border-white/50 focus:outline-none w-full"
                        />
                        <HappinessHeart happiness={p.happiness} />
                        {p.isShiny && <span className="text-xs font-bold text-yellow-400 bg-yellow-900/50 px-1.5 py-0.5 rounded-full">✨ Shiny!</span>}
                    </div>
                    <div className="text-xs opacity-80 flex items-center gap-1.5">
                        {p.kind} <GenderIcon gender={p.gender} />
                    </div>
                    <div className="text-xs opacity-60">
                        Idade: {p.age} / {p.maxAge} dias
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <button 
                        onClick={() => onLocatePokemon(p.id)}
                        className="bg-green-600 text-white text-xl p-1 rounded-md hover:bg-green-500 w-8 h-8 flex items-center justify-center"
                        title="Localizar e ver detalhes"
                    >
                        🎯
                    </button>
                    <button
                        onClick={() => onReleasePokemon(p.id, p.name)}
                        className="bg-red-700 text-white text-xl p-1 rounded-md hover:bg-red-600 w-8 h-8 flex items-center justify-center"
                        title="Libertar Pokémon"
                    >
                        🗑️
                    </button>
                    {evolutionTarget && (
                        <div className="text-right">
                            <button 
                                onClick={() => onEvolvePokemon(p.id)}
                                disabled={!canEvolve}
                                className="bg-blue-600 text-white text-sm py-1 px-3 rounded-md hover:bg-blue-500 disabled:bg-gray-500 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                Evoluir
                            </button>
                            <div className="text-xs opacity-70 mt-1">
                                Custo: 1 Pedra
                            </div>
                        </div>
                    )}
                </div>
              </div>
            )
        }) : (
          <div className="opacity-60 p-5 text-center">Nenhum Pokémon encontrado.</div>
        )}
      </div>
    </Modal>
  );
};

const getHappinessStatus = (happiness: number): { text: string; color: string } => {
    if (happiness <= 20) return { text: 'Miserável', color: 'text-red-500' };
    if (happiness <= 40) return { text: 'Infeliz', color: 'text-yellow-500' };
    if (happiness <= 60) return { text: 'Neutro', color: 'text-gray-300' };
    if (happiness <= 80) return { text: 'Feliz', color: 'text-green-400' };
    return { text: 'Radiante', color: 'text-cyan-400' };
};

export const PokemonDetailModal: React.FC<{
    pokemon: Pokemon | null;
    onClose: () => void;
    gameState: GameState;
    onReleasePokemon: (pokemonId: string, pokemonName: string) => void;
}> = ({ pokemon, onClose, gameState, onReleasePokemon }) => {
    const [showModifiers, setShowModifiers] = useState(false);
    useEffect(() => {
        if (!pokemon) setShowModifiers(false);
    }, [pokemon]);

    if (!pokemon) return null;

    const getSpriteUrl = (poke: Pokemon) => {
        const baseUrl = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/';
        const shinyPath = poke.isShiny ? 'shiny/' : '';
        const pokemonId = POKEMON_IDS[poke.kind as keyof typeof POKEMON_IDS];
        if(!pokemonId) return '';
        return `${baseUrl}${shinyPath}${pokemonId}.png`;
    };

    const ability = POKEMON_ABILITIES[pokemon.kind as keyof typeof POKEMON_ABILITIES];
    const abilityDescription = () => {
        if (!ability) return 'Nenhuma habilidade especial.';
        switch(ability.type) {
            case 'daily_production': return `Produz ${ability.amount}${ability.chance > 0 ? ` (+${ability.chance * 100}%)` : ''} de ${ITEM_DISPLAY_NAMES[ability.item] || ability.item} por dia.`;
            case 'passive_income': return `Gera $${(ability.rate * 86400).toFixed(2)} por dia passivamente.`;
            case 'cooldown_item': return `Coleta ${ITEM_DISPLAY_NAMES[ability.item] || ability.item} a cada ${ability.cooldown} segundos.`;
            case 'harvest_plant': return `Colhe plantas selvagens a cada ${ability.cooldown} segundos.`;
            case 'water_crop': return `Rega plantações a cada ${ability.cooldown} segundos, acelerando o crescimento em ${ability.bonus*100}%.`;
            case 'fertilize_crop': return `Fertiliza plantações a cada ${ability.cooldown} segundos.`;
            case 'farm_protector': return `Tem ${ability.huntChance*100}% de chance de espantar pragas diariamente.`;
            case 'passive_harvest': return `Tem ${ability.chance * 100}% de chance de colher plantações maduras automaticamente.`;
            default: return 'Habilidade especial desconhecida.';
        }
    };

    const footer = (
         <div className="flex justify-between w-full">
            <button 
                onClick={() => onReleasePokemon(pokemon.id, pokemon.name)}
                className="bg-red-700 hover:bg-red-600 text-white font-bold py-2 px-4 rounded-lg text-sm"
            >
                Libertar
            </button>
            <BtnWood onClick={onClose} className="ml-auto">Fechar</BtnWood>
         </div>
    );
    
    const happinessStatus = getHappinessStatus(pokemon.happiness);
    const hasModifiers = Object.keys(pokemon.happinessModifiers).length > 0;

    return (
        <Modal isOpen={!!pokemon} onClose={onClose} title="Detalhes do Pokémon" footerContent={footer} modalId={`pokemon-detail-${pokemon.id}`}>
            <div className="flex flex-col items-center gap-4">
                <img src={getSpriteUrl(pokemon)} alt={pokemon.name} className="w-32 h-32 image-pixelated bg-black/20 rounded-full" />
                <div className="text-center">
                    <h3 className="text-2xl font-bold flex items-center justify-center gap-2">{pokemon.name} {pokemon.isShiny && '✨'} <GenderIcon gender={pokemon.gender} /></h3>
                    <p className="text-sm opacity-80">{pokemon.kind}</p>
                </div>
                <div className="w-full bg-white/5 rounded-lg p-3 text-sm space-y-2">
                    <div className="flex justify-between"><span>Idade:</span> <span>{pokemon.age} / {pokemon.maxAge} dias</span></div>
                    {pokemon.Poder && <div className="flex justify-between"><span>Poder:</span> <span>{pokemon.Poder}</span></div>}
                    <div className="flex justify-between"><span>Habilidade:</span> <span className="text-right">{abilityDescription()}</span></div>
                </div>
                <div className="w-full bg-white/5 rounded-lg p-3 text-sm space-y-2">
                    <div className="flex justify-between items-center">
                        <span>Felicidade:</span>
                        <span className={happinessStatus.color}>{happinessStatus.text} ({pokemon.happiness}/100)</span>
                    </div>
                    <div className="w-full bg-black/30 rounded-full h-2.5">
                        <div className="bg-green-500 h-2.5 rounded-full" style={{ width: `${pokemon.happiness}%` }}></div>
                    </div>
                    {hasModifiers && (
                        <div>
                            <button onClick={() => setShowModifiers(s => !s)} className="text-xs text-blue-300 hover:underline mt-1">
                                {showModifiers ? 'Ocultar Modificadores' : 'Mostrar Modificadores'}
                            </button>
                            {showModifiers && (
                                <div className="mt-2 p-2 bg-black/20 rounded text-xs space-y-1">
                                    {Object.entries(pokemon.happinessModifiers).map(([reason, mod]) => {
                                        const value = typeof mod === 'number' ? mod : mod.value;
                                        return (
                                            <div key={reason} className="flex justify-between">
                                                <span>{reason}:</span>
                                                <span className={value > 0 ? 'text-green-400' : 'text-red-400'}>{value > 0 ? `+${value}` : value}</span>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </Modal>
    );
};

interface TabsProps {
    tabs: string[];
    activeTab: string;
    onTabChange: (tab: string) => void;
}
const Tabs: React.FC<TabsProps> = ({ tabs, activeTab, onTabChange }) => (
    <div className="flex gap-2 mb-3 border-b border-white/10 pb-2">
        {tabs.map(tab => (
            <div key={tab}
                 onClick={() => onTabChange(tab)}
                 className={`py-2 px-4 cursor-pointer rounded-t-lg capitalize transition-colors ${activeTab === tab ? 'bg-[#2fa66b] text-white font-semibold' : 'bg-white/5 hover:bg-white/10'}`}>
                {tab}
            </div>
        ))}
    </div>
);

export const CraftingModal: React.FC<{ isOpen: boolean; onClose: () => void; player: Player; hasCampfire: boolean; onCraft: (recipeId: string) => void; modalId: string }> = ({ isOpen, onClose, player, hasCampfire, onCraft, modalId }) => {
  const [activeTab, setActiveTab] = useState<'processing' | 'cooking'>('processing');
  
  const renderRecipes = (recipes: Recipe[]) => {
      return recipes.map(recipe => {
        const canCraft = player.hasItems(recipe.input);
        const hasStructure = !recipe.requiresStructure || (recipe.requiresStructure === 'campfire' && hasCampfire);
        const hasEnergy = player.energy >= CRAFTING_ENERGY_COST;
        const enabled = canCraft && hasStructure && hasEnergy;

        return (
            <div key={recipe.id} className="flex justify-between items-center p-2 my-1 bg-white/5 rounded-md">
                <div className="flex-1">
                    <strong>{recipe.name}</strong>
                    <div className="text-xs opacity-80">
                        {Object.entries(recipe.input).map(([k, v]) => `${ITEM_DISPLAY_NAMES[k] || k}: ${v}`).join(', ')} → {Object.entries(recipe.output).map(([k, v]) => `${ITEM_DISPLAY_NAMES[k] || k}: ${v}`).join(', ')}
                        <span className="ml-2 text-yellow-400">(-{CRAFTING_ENERGY_COST}⚡)</span>
                    </div>
                    {recipe.requiresStructure && !hasStructure && <div className="text-xs text-red-400">Requer: {recipe.requiresStructure}</div>}
                    {!hasEnergy && <div className="text-xs text-yellow-500">Energia insuficiente</div>}
                </div>
                <button onClick={() => onCraft(recipe.id)} disabled={!enabled} className="bg-[#2fa66b] text-white py-1.5 px-3 rounded-md cursor-pointer text-xs disabled:opacity-40 disabled:cursor-not-allowed hover:brightness-110">Criar</button>
            </div>
        );
      });
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Casa - Crafting & Receitas" modalId={modalId}>
        <Tabs tabs={['processing', 'cooking']} activeTab={activeTab} onTabChange={(tab) => setActiveTab(tab as 'processing' | 'cooking')} />
        <div>
            {activeTab === 'processing' && renderRecipes(RECIPES.processing)}
            {activeTab === 'cooking' && renderRecipes(RECIPES.cooking)}
        </div>
    </Modal>
  );
};

export const MarketModal: React.FC<{isOpen: boolean; onClose: () => void; player: Player; onTransaction: (type: 'buy' | 'sell', item: string, price: number, quantity?: number) => void; modalId: string}> = ({ isOpen, onClose, player, onTransaction, modalId }) => {
    const [activeTab, setActiveTab] = useState<'comprar' | 'vender' | 'fósseis'>('comprar');
    const [sellQuantities, setSellQuantities] = useState<{ [key: string]: string }>({});
    const [buyQuantities, setBuyQuantities] = useState<{ [key: string]: string }>({});

    const fossilKeys = useMemo(() => ['dome_fossil', 'helix_fossil', 'old_amber', 'jaw_fossil', 'sail_fossil', 'cover_fossil', 'plume_fossil', 'skull_fossil', 'armor_fossil', 'root_fossil', 'claw_fossil'], []);

    const handleSellTransaction = (item: string, price: number) => {
        const currentAmount = player.inventory[item] || 0;
        let amountToSell = parseInt(sellQuantities[item] || '1', 10);

        if (isNaN(amountToSell) || amountToSell < 1) {
            amountToSell = 1;
        }
        amountToSell = Math.min(amountToSell, currentAmount);

        if (amountToSell > 0) {
            onTransaction('sell', item, price, amountToSell);
            setSellQuantities(prev => ({...prev, [item]: '1'}));
        }
    };
    
    const BuyItemRow: React.FC<{item: string, price: number}> = ({ item, price }) => {
        const quantity = parseInt(buyQuantities[item] || '1', 10) || 1;
        const totalCost = price * quantity;
        const canAfford = player.money >= totalCost;
        const maxCanBuy = Math.floor(player.money / price);

        const handleBuyTransaction = (item: string, price: number) => {
            let amountToBuy = parseInt(buyQuantities[item] || '1', 10);
            if (isNaN(amountToBuy) || amountToBuy < 1) amountToBuy = 1;
            
            if (player.money >= price * amountToBuy) {
                onTransaction('buy', item, price, amountToBuy);
                setBuyQuantities(prev => ({...prev, [item]: '1'}));
            }
        };

        return (
            <div className="flex justify-between items-center p-2 my-1 bg-white/5 rounded-md">
                <div className="flex items-center gap-3">
                    <span className="text-2xl w-8 text-center">{ITEM_ICONS[item] || '❓'}</span>
                    <div>
                        <strong className="capitalize">{ITEM_DISPLAY_NAMES[item] || item}</strong>
                        <div className="text-xs opacity-80">Preço: ${price}</div>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <input
                        type="number"
                        value={buyQuantities[item] || '1'}
// FIX: Explicitly typed the event handler to resolve potential type errors.
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                            const val = e.target.value;
                            if (val === '' || (parseInt(val, 10) > 0 && !isNaN(parseInt(val, 10)))) {
                                setBuyQuantities(prev => ({ ...prev, [item]: val }));
                            }
                        }}
                        className="w-20 bg-black/50 text-white text-center py-1 rounded border border-white/10"
                        min="1"
                    />
                    <button
                        onClick={() => setBuyQuantities(prev => ({ ...prev, [item]: maxCanBuy.toString() }))}
                        disabled={maxCanBuy < 1}
                        className="bg-[#a06b43] hover:brightness-110 text-white text-xs py-1 px-2 rounded-md disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                        Máx
                    </button>
                    <button
                        onClick={() => handleBuyTransaction(item, price)}
                        disabled={!canAfford}
                        className="bg-[#2fa66b] text-white py-1.5 px-3 rounded-md cursor-pointer text-xs disabled:opacity-40 disabled:cursor-not-allowed hover:brightness-110"
                    >
                        Comprar
                    </button>
                </div>
            </div>
        );
    };


    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Mercado" modalId={modalId}>
            <Tabs tabs={['comprar', 'vender', 'fósseis']} activeTab={activeTab} onTabChange={(tab) => setActiveTab(tab as 'comprar' | 'vender' | 'fósseis')} />
            <div>
                {activeTab === 'comprar' && (Object.entries(MARKET_PRICES.buy) as [string, number][])
                    .filter(([item]) => !fossilKeys.includes(item))
                    .map(([item, price]) => <BuyItemRow key={item} item={item} price={price} />
                )}
                {activeTab === 'fósseis' && (Object.entries(MARKET_PRICES.buy) as [string, number][])
                    .filter(([item]) => fossilKeys.includes(item))
                    .map(([item, price]) => <BuyItemRow key={item} item={item} price={price} />
                )}
                {activeTab === 'vender' && (Object.entries(MARKET_PRICES.sell) as [string, number][]).map(([item, price]) => {
                    const currentAmount = player.inventory[item] || 0;
                    const hasItem = currentAmount > 0;
                    return (
                        <div key={item} className={`flex justify-between items-center p-2 my-1 bg-white/5 rounded-md ${!hasItem ? 'opacity-50' : ''}`}>
                            <div className="flex items-center gap-3">
                                <span className="text-2xl w-8 text-center">{ITEM_ICONS[item] || '❓'}</span>
                                <div>
                                    <strong className="capitalize">{ITEM_DISPLAY_NAMES[item] || item}</strong> ({currentAmount})
                                    <div className="text-xs opacity-80">Vende por: ${price}</div>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <input
                                    type="number"
                                    value={sellQuantities[item] || '1'}
// FIX: Explicitly typed the event handler to resolve potential type errors.
                                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSellQuantities(prev => ({ ...prev, [item]: e.target.value }))}
                                    className="w-20 bg-black/50 text-white text-center py-1 rounded border border-white/10"
                                    min="1"
                                    max={currentAmount}
                                    disabled={!hasItem}
                                />
                                <button
                                    onClick={() => setSellQuantities(prev => ({ ...prev, [item]: currentAmount.toString() }))}
                                    disabled={!hasItem}
                                    className="bg-[#a06b43] hover:brightness-110 text-white text-xs py-1 px-2 rounded-md disabled:opacity-40 disabled:cursor-not-allowed"
                                >
                                    Tudo
                                </button>
                                <button
                                    onClick={() => handleSellTransaction(item, price)}
                                    disabled={!hasItem}
                                    className="bg-[#2fa66b] text-white py-1.5 px-3 rounded-md cursor-pointer text-xs disabled:opacity-40 disabled:cursor-not-allowed hover:brightness-110"
                                >
                                    Vender
                                </button>
                            </div>
                        </div>
                    );
                })}
            </div>
        </Modal>
    );
};

export const BuildingInfoModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  building: Building | null;
  allPokemons: Pokemon[];
  player: Player;
  onRequestDestroy: (buildingId: string) => void;
  onLocatePokemon: (pokemonId: string) => void;
  onMeditate: (buildingId: string) => void;
  onStartFossilRevival: (buildingId: string, fossilType: string) => void;
  modalId: string;
}> = ({ isOpen, onClose, building, allPokemons, player, onRequestDestroy, onLocatePokemon, onMeditate, onStartFossilRevival, modalId }) => {
    if (!building) return null;

    const handleDestroyClick = () => {
        if (building) {
            onRequestDestroy(building.id);
        }
    };

    const pokemonsInBuilding = allPokemons.filter(p => p.homeBuildingId === building.id);
    
    // Squirtles and Abras are special residents of lakes and don't count towards the Goldeen capacity.
    const squirtleFamily = ['Squirtle', 'Wartortle', 'Blastoise', 'Lotad', 'Lombre', 'Ludicolo'];
    const abraFamily = ['Abra', 'Kadabra', 'Alakazam'];
    const occupancy = building.type === 'lake'
        ? pokemonsInBuilding.filter(p => !squirtleFamily.includes(p.kind) && !abraFamily.includes(p.kind)).length
        : pokemonsInBuilding.length;

    const capacity = (building.type === 'stable' && building.storage.pokemonKind === 'Mareep')
        ? 3
        : (POKEMON_CAPACITY[building.type as keyof typeof POKEMON_CAPACITY] || 0);
    
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
    const availableFossils = ['dome_fossil', 'helix_fossil', 'old_amber', 'jaw_fossil', 'sail_fossil', 'cover_fossil', 'plume_fossil', 'skull_fossil', 'armor_fossil', 'root_fossil', 'claw_fossil'].filter(fossil => player.hasItems({ [fossil]: 1 }));


    const footer = (
        <div className="flex justify-between w-full items-center">
            {building.type !== 'house' && (
                <button
                    onClick={handleDestroyClick}
                    className="bg-red-700 hover:bg-red-600 text-white font-bold py-2 px-4 rounded-lg text-sm"
                >
                    Destruir
                </button>
            )}
            <button 
                onClick={onClose} 
                className="bg-gradient-to-b from-[#a06b43] to-[#603a20] rounded-lg py-2 px-3 text-white border border-white/10 text-sm hover:brightness-110 select-none ml-auto"
            >
                Fechar
            </button>
        </div>
    );

    return (
        <Modal 
            isOpen={isOpen} 
            onClose={onClose} 
            title={`Informações: ${buildingTitles[building.type] || building.type}`}
            footerContent={footer}
            modalId={modalId}
        >
            {building.type === 'lake' && (
                <button 
                    onClick={() => onMeditate(building.id)}
                    className="absolute top-4 right-4 text-3xl cursor-pointer hover:scale-110 transition-transform bg-transparent border-none p-0" 
                    title="Meditar"
                >
                    🧘
                </button>
            )}
            <div className="space-y-3">
                <div className="flex justify-between p-2 bg-white/5 rounded-md">
                    <strong>Tipo:</strong>
                    <span className="capitalize">{building.type} {building.storage.pokemonKind ? `(${building.storage.pokemonKind})` : ''}</span>
                </div>
                {capacity > 0 && (
                     <div className="flex justify-between p-2 bg-white/5 rounded-md">
                        <strong>Capacidade:</strong>
                        <span>{occupancy} / {capacity}</span>
                    </div>
                )}
                <div className="p-2 bg-white/5 rounded-md">
                    <strong>Pokémon Residentes:</strong>
                    {pokemonsInBuilding.length > 0 ? (
                        <div className="space-y-2 mt-1">
                            {pokemonsInBuilding.map(p => (
                                <div key={p.id} className="flex justify-between items-center bg-black/10 p-2 rounded">
                                    <span className="flex items-center gap-1.5">
                                        {p.name} ({p.kind}) <GenderIcon gender={p.gender} />
                                    </span>
                                    <button 
                                        onClick={() => onLocatePokemon(p.id)}
                                        className="bg-green-600 text-white text-xl p-1 rounded-md hover:bg-green-500 w-8 h-8 flex items-center justify-center"
                                        title="Localizar e ver detalhes"
                                    >
                                        🎯
                                    </button>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <p className="opacity-60 text-sm mt-1">Nenhum Pokémon aqui.</p>
                    )}
                </div>
                 {building.type === 'laboratory' && (
                    <div className="p-3 bg-blue-900/20 rounded-lg border border-blue-400/30">
                        <h4 className="font-bold text-lg text-cyan-300 mb-2">Câmara de Ressurreição</h4>
                        {building.storage.revivingFossil ? (
                            <div>
                                <p>Ressuscitando: <span className="font-semibold">{ITEM_DISPLAY_NAMES[building.storage.revivingFossil]}</span></p>
                                <div className="w-full bg-black/30 rounded-full h-4 my-1 relative border border-black/50">
                                    <div
                                        className="bg-gradient-to-r from-cyan-400 to-blue-600 h-full rounded-full transition-all duration-500"
                                        style={{ width: `${(building.storage.revivalProgress || 0) * 100}%` }}
                                    ></div>
                                    <div className="absolute inset-0 flex items-center justify-center text-xs font-mono text-white" style={{textShadow: '1px 1px 2px #000'}}>
                                        {Math.floor((building.storage.revivalProgress || 0) * 100)}%
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div>
                                <p className="opacity-80">Nenhum fóssil sendo ressuscitado.</p>
                                {availableFossils.length > 0 ? (
                                    <div className="mt-2 space-y-2">
                                        <p className="text-sm">Selecione um fóssil para começar:</p>
                                        {availableFossils.map(fossil => (
                                            <button
                                                key={fossil}
                                                onClick={() => onStartFossilRevival(building.id, fossil)}
                                                className="w-full text-left flex items-center gap-2 p-2 rounded bg-white/10 hover:bg-white/20 transition-colors"
                                            >
                                                <span className="text-2xl">{ITEM_ICONS[fossil]}</span>
                                                <span>{ITEM_DISPLAY_NAMES[fossil]}</span>
                                                <span className="ml-auto text-xs opacity-70">x{player.inventory[fossil]}</span>
                                            </button>
                                        ))}
                                    </div>
                                ) : (
                                    <p className="text-sm opacity-60 mt-2">Você não possui fósseis.</p>
                                )}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </Modal>
    );
};

interface PlantingToolbarProps {
    player: Player;
    activeSeed: string | null;
    onSelectSeed: (seedType: string) => void;
    onCancel: () => void;
}
export const PlantingToolbar: React.FC<PlantingToolbarProps> = ({ player, activeSeed, onSelectSeed, onCancel }) => {
    const seedItems = [
        { id: 'seedGraoBaga', name: ITEM_DISPLAY_NAMES['seedGraoBaga'], icon: ITEM_ICONS['seedGraoBaga'] },
        { id: 'seedDoceBaga', name: ITEM_DISPLAY_NAMES['seedDoceBaga'], icon: ITEM_ICONS['seedDoceBaga'] },
        { id: 'seedCacauBaga', name: ITEM_DISPLAY_NAMES['seedCacauBaga'], icon: ITEM_ICONS['seedCacauBaga'] },
        { id: 'seedCafeBaga', name: ITEM_DISPLAY_NAMES['seedCafeBaga'], icon: ITEM_ICONS['seedCafeBaga'] },
        { id: 'fertilizer', name: ITEM_DISPLAY_NAMES['fertilizer'], icon: ITEM_ICONS['fertilizer'] },
    ];
    
    const availableSeeds = seedItems.filter(item => (player.inventory[item.id] || 0) > 0);

    // If there's an active seed, show the planting mode UI
    if (activeSeed) {
        return (
            <div className="fixed bottom-4 left-1/2 -translate-x-1/2 bg-gradient-to-b from-[#8f5d3a] to-[#5b3f26] p-2 rounded-xl shadow-2xl z-50 flex items-center gap-2 animate-fade-in-up">
                <span className="text-white font-bold">Modo de Plantio: {ITEM_DISPLAY_NAMES[activeSeed]}</span>
                <button onClick={onCancel} className="bg-red-600/80 hover:bg-red-500 text-white w-8 h-8 flex items-center justify-center rounded-lg text-xl font-bold shadow-md transition-colors">
                    X
                </button>
            </div>
        );
    }
    
    // If no active seed but player has seeds, show the selection UI
    if (availableSeeds.length > 0) {
        return (
            <div className="fixed bottom-4 left-1/2 -translate-x-1/2 bg-gradient-to-b from-[#8f5d3a] to-[#5b3f26] p-2 rounded-xl shadow-2xl z-50 flex items-center gap-2 animate-fade-in-up">
                {availableSeeds.map(item => (
                    <button 
                        key={item.id}
                        onClick={() => onSelectSeed(item.id)}
                        className="flex items-center gap-2 bg-black/20 p-2 rounded-lg hover:bg-black/40 transition-colors"
                        title={`${item.name} (x${player.inventory[item.id]})`}
                    >
                        <span className="text-2xl">{item.icon}</span>
                        <span className="text-white font-mono">{player.inventory[item.id]}</span>
                    </button>
                ))}
            </div>
        );
    }

    // If no active seed and no seeds in inventory, render nothing
    return null;
};
// FIX: Added definitions for all missing UI components and types to resolve import errors.

export interface ToastData {
    id: number;
    message: string;
    type: 'info' | 'success' | 'warning' | 'error' | 'shiny';
}

export const ToastContainer: React.FC<{
    toasts: ToastData[];
    onDismiss: (id: number) => void;
    onDismissAll: () => void;
}> = ({ toasts, onDismiss, onDismissAll }) => {
    const toastBgColors = {
        info: 'bg-blue-500',
        success: 'bg-green-500',
        warning: 'bg-yellow-500',
        error: 'bg-red-500',
        shiny: 'bg-gradient-to-r from-purple-500 to-pink-500',
    };
    return (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-[100] w-96 space-y-2">
            {toasts.length > 1 && (
                 <button onClick={onDismissAll} className="w-full text-right text-xs text-white/70 hover:text-white mb-1">Limpar tudo</button>
            )}
            {toasts.map(toast => (
                <div key={toast.id} className={`flex items-start justify-between p-3 rounded-lg shadow-lg text-white ${toastBgColors[toast.type]}`}>
                    <p className="text-sm flex-grow">{toast.message}</p>
                    <button onClick={() => onDismiss(toast.id)} className="ml-2 text-xl font-bold leading-none">&times;</button>
                </div>
            ))}
        </div>
    );
};

export const UINotification: React.FC<{ message: string }> = ({ message }) => {
    return (
        <div className={`fixed bottom-5 left-1/2 -translate-x-1/2 bg-black/70 text-white py-2 px-5 rounded-full transition-opacity duration-300 z-[90] ${message ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
            {message}
        </div>
    );
};

export const StarterSelectionModal: React.FC<{
    isOpen: boolean;
    onSelect: (kind: 'Growlithe' | 'Meowth') => void;
}> = ({ isOpen, onSelect }) => {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/80 z-[100] flex items-center justify-center">
            <div className="bg-gradient-to-b from-[#8f5d3a] to-[#5b3f26] p-6 rounded-xl shadow-2xl text-white text-center border-4 border-[#5b3f26]">
                <h2 className="text-2xl font-bold mb-4">Escolha seu Companheiro Inicial!</h2>
                <p className="mb-6">Sua jornada na fazenda começa agora. Quem irá te acompanhar?</p>
                <div className="flex justify-center gap-6">
                    <div onClick={() => onSelect('Growlithe')} className="cursor-pointer p-4 bg-white/5 rounded-lg hover:bg-white/10 transition-all">
                        <img src={`https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${POKEMON_IDS['Growlithe']}.png`} alt="Growlithe" className="w-24 h-24 image-pixelated mx-auto"/>
                        <h3 className="font-bold text-lg mt-2">Growlithe</h3>
                        <p className="text-xs opacity-80">Leal e protetor.</p>
                    </div>
                    <div onClick={() => onSelect('Meowth')} className="cursor-pointer p-4 bg-white/5 rounded-lg hover:bg-white/10 transition-all">
                        <img src={`https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${POKEMON_IDS['Meowth']}.png`} alt="Meowth" className="w-24 h-24 image-pixelated mx-auto"/>
                        <h3 className="font-bold text-lg mt-2">Meowth</h3>
                        <p className="text-xs opacity-80">Astuto e sortudo.</p>
                    </div>
                </div>
            </div>
        </div>
    );
};

export const ConfirmModal: React.FC<{
    isOpen: boolean;
    message: string;
    onConfirm: () => void;
    onCancel: () => void;
    modalId: string;
}> = ({ isOpen, message, onConfirm, onCancel, modalId }) => {
    const footer = (
        <div className="flex gap-2">
            <button onClick={onCancel} className="bg-gray-500 hover:bg-gray-400 text-white font-bold py-2 px-4 rounded-lg">Cancelar</button>
            <button onClick={onConfirm} className="bg-red-600 hover:bg-red-500 text-white font-bold py-2 px-4 rounded-lg">Confirmar</button>
        </div>
    );
    return (
        <Modal isOpen={isOpen} onClose={onCancel} title="Confirmação" footerContent={footer} modalId={modalId}>
            <p>{message}</p>
        </Modal>
    );
};

export const TaskForm: React.FC<{
    task: Task | null;
    onSave: (task: Task) => void;
    onCancel: () => void;
}> = ({ task, onSave, onCancel }) => {
    const { position, handleMouseDown, elementRef } = useDraggable(task?.id || 'new-task-form');
    const [title, setTitle] = useState('');
    const [difficulty, setDifficulty] = useState<TaskDifficulty>('Trivial');
    const [tags, setTags] = useState('');
    const [dueDate, setDueDate] = useState('');
    const [frequency, setFrequency] = useState<TaskFrequency>({ type: 'Única' });
    const [subtasks, setSubtasks] = useState<Subtask[]>([]);
    const [newSubtask, setNewSubtask] = useState('');

    useEffect(() => {
        if (task) {
            setTitle(task.title);
            setDifficulty(task.difficulty);
            setTags(task.tags.join(', '));
            setDueDate(task.dueDate || '');
            setFrequency(task.frequency);
            setSubtasks(task.subtasks);
        } else {
            setTitle('');
            setDifficulty('Trivial');
            setTags('');
            setDueDate('');
            setFrequency({ type: 'Única' });
            setSubtasks([]);
        }
    }, [task]);

    const handleSave = () => {
        if (!title) return;
        const savedTask: Task = {
            id: task?.id || `task_${Date.now()}`,
            title,
            difficulty,
            tags: tags.split(',').map(t => t.trim()).filter(Boolean),
            dueDate: dueDate || undefined,
            frequency,
            subtasks,
            createdAt: task?.createdAt || Date.now(),
            lastCompletedAt: task?.lastCompletedAt,
        };
        onSave(savedTask);
    };

    const handleSubtaskKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter' && newSubtask.trim()) {
            e.preventDefault();
            setSubtasks([...subtasks, { id: `sub_${Date.now()}`, text: newSubtask.trim(), completed: false }]);
            setNewSubtask('');
        }
    };
    
    const removeSubtask = (id: string) => {
        setSubtasks(subtasks.filter(st => st.id !== id));
    };
    
    const weekDays = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
    const toggleDay = (dayIndex: number) => {
        const currentDays = frequency.daysOfWeek || [];
        const newDays = currentDays.includes(dayIndex) 
            ? currentDays.filter(d => d !== dayIndex)
            : [...currentDays, dayIndex];
        setFrequency({ ...frequency, daysOfWeek: newDays.sort() });
    };


    return (
        <div
            ref={elementRef}
            style={{ top: `${position.y}px`, left: `${position.x}px` }}
            className="fixed bg-[#6e492e] p-4 rounded-2xl w-[380px] shadow-2xl max-h-[calc(100vh-12rem)] flex flex-col text-white z-50">
            <div onMouseDown={handleMouseDown} className="flex justify-between items-center mb-4 cursor-move">
                <h3 className="text-2xl font-bold select-none">{task ? 'Editar Tarefa' : 'Nova Tarefa'}</h3>
                <button onClick={onCancel} className="text-2xl">&times;</button>
            </div>
            <div className="flex-grow overflow-y-auto pr-2 space-y-4">
                <div>
                    <label className="text-sm opacity-90">Título</label>
                    {/* FIX: Explicitly typed the event handler to resolve potential type errors. */}
                    <input type="text" value={title} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTitle(e.target.value)} className="w-full mt-1 p-2 bg-[#4a321f] rounded-md border border-transparent focus:outline-none focus:border-amber-400" />
                </div>
                <div>
                    <label className="text-sm opacity-90">Dificuldade</label>
                    {/* FIX: Explicitly typed the event handler to resolve potential type errors. */}
                    <select value={difficulty} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setDifficulty(e.target.value as TaskDifficulty)} className="task-form-select w-full mt-1 p-2 bg-[#4a321f] rounded-md border border-transparent focus:outline-none focus:border-amber-400">
                        <option value="Trivial">Trivial</option>
                        <option value="Fácil">Fácil</option>
                        <option value="Médio">Médio</option>
                        <option value="Difícil">Difícil</option>
                    </select>
                </div>
                <div>
                    <label className="text-sm opacity-90">Tags (separadas por vírgula)</label>
                    {/* FIX: Explicitly typed the event handler to resolve potential type errors. */}
                    <input type="text" value={tags} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTags(e.target.value)} className="w-full mt-1 p-2 bg-[#4a321f] rounded-md border border-transparent focus:outline-none focus:border-amber-400" />
                </div>
                <div>
                    <label className="text-sm opacity-90">Data Limite (Opcional)</label>
                    {/* FIX: Explicitly typed the event handler to resolve potential type errors. */}
                    <input type="date" value={dueDate} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDueDate(e.target.value)} className="w-full mt-1 p-2 bg-[#4a321f] rounded-md border border-transparent focus:outline-none focus:border-amber-400" />
                </div>
                <div>
                    <label className="text-sm opacity-90">Frequência</label>
                    {/* FIX: Explicitly typed the event handler to resolve potential type errors. */}
                    <select value={frequency.type} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setFrequency({ type: e.target.value as TaskFrequencyType, daysOfWeek: [] })} className="task-form-select w-full mt-1 p-2 bg-[#4a321f] rounded-md border border-transparent focus:outline-none focus:border-amber-400">
                        <option value="Única">Única</option>
                        <option value="Diária">Diária</option>
                        <option value="Semanal">Semanal</option>
                        <option value="Mensal">Mensal</option>
                        <option value="Personalizada">Personalizada</option>
                    </select>
                </div>
                {frequency.type === 'Semanal' && (
                    <div className="flex justify-center gap-1 mt-2">
                        {weekDays.map((day, index) => (
                            <button
                                key={day}
                                onClick={() => toggleDay(index)}
                                className={`w-9 h-9 rounded-full text-xs font-bold transition-colors ${
                                    frequency.daysOfWeek?.includes(index) ? 'bg-green-500 text-white' : 'bg-black/30 text-white/70'
                                }`}
                            >
                                {day}
                            </button>
                        ))}
                    </div>
                )}
                {frequency.type === 'Personalizada' && (
                     <div className="flex items-center gap-2">
                        <label className="text-sm">A cada</label>
                        {/* FIX: Explicitly typed the event handler to resolve potential type errors. */}
                        <input 
                            type="number" 
                            min="1" 
                            value={frequency.customAmount || 1} 
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFrequency({...frequency, customAmount: parseInt(e.target.value) || 1 })}
                            className="w-16 p-2 bg-[#4a321f] rounded-md border border-transparent focus:outline-none focus:border-amber-400" 
                        />
                        {/* FIX: Explicitly typed the event handler to resolve potential type errors. */}
                        <select 
                            value={frequency.customInterval || 'dias'}
                            onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setFrequency({...frequency, customInterval: e.target.value as 'dias'|'semanas'|'meses'})}
                            className="task-form-select flex-grow p-2 bg-[#4a321f] rounded-md border border-transparent focus:outline-none focus:border-amber-400"
                        >
                            <option value="dias">dias</option>
                            <option value="semanas">semanas</option>
                            <option value="meses">meses</option>
                        </select>
                    </div>
                )}
                 <div>
                    <label className="text-sm opacity-90">Subtarefas</label>
                    {/* FIX: Explicitly typed the event handler to resolve potential type errors. */}
                    <input 
                        type="text" 
                        value={newSubtask} 
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewSubtask(e.target.value)} 
                        onKeyDown={handleSubtaskKeyDown}
                        placeholder="Adicionar subtarefa e pressionar Enter..."
                        className="w-full mt-1 p-2 bg-[#4a321f] rounded-md border border-transparent focus:outline-none focus:border-amber-400" 
                    />
                    <div className="mt-2 space-y-1">
                        {subtasks.map(st => (
                            <div key={st.id} className="flex items-center justify-between bg-black/20 p-1.5 rounded text-sm">
                                <span>{st.text}</span>
                                <button onClick={() => removeSubtask(st.id)} className="text-red-400 font-bold px-1">&times;</button>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
            <div className="mt-4">
                 <button onClick={handleSave} className="w-full bg-[#a06b43] hover:brightness-110 text-white font-bold py-2.5 px-4 rounded-lg">Salvar Tarefa</button>
            </div>
        </div>
    );
};

export const SkillsModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    skills: PlayerSkills;
    skillPoints: number;
    onUpgradeSkill: (skill: keyof PlayerSkills) => void;
}> = ({ isOpen, onClose, skills, skillPoints, onUpgradeSkill }) => {
    
    const skillData = {
        gerente: { name: 'Gerente', max: 5, description: 'Aumenta a renda passiva e o valor de venda dos itens em 5% por nível.' },
        sortudo: { name: 'Sortudo', max: 2, description: 'Aumenta a chance de encontrar Pokémon Shiny e outros eventos de sorte.' },
        tratador: { name: 'Tratador', max: 5, description: 'Aumenta a felicidade base de todos os seus Pokémon em 2 pontos por nível.' },
        treinador: { name: 'Treinador', max: 3, description: 'Adiciona +10%/+15%/+20% de chance para Pokémon Protetores (Growlithe, etc) eliminarem pragas da fazenda.' },
    };

    const footer = <BtnWood onClick={onClose}>Fechar</BtnWood>;

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Habilidades" footerContent={footer} modalId="skills-modal">
            <div className="p-2 space-y-4">
                <div className="text-center bg-black/20 p-3 rounded-lg">
                    <h4 className="font-bold text-lg">Pontos de Habilidade Disponíveis</h4>
                    <p className="text-3xl font-bold text-yellow-400">{skillPoints}</p>
                </div>
                
                {Object.keys(skillData).map(key => {
                    const skillKey = key as keyof PlayerSkills;
                    const data = skillData[skillKey];
                    const currentLevel = skills[skillKey] || 0;
                    const canUpgrade = skillPoints > 0 && currentLevel < data.max;

                    return (
                        <div key={skillKey} className="bg-white/5 p-3 rounded-lg flex items-center gap-4">
                            <div className="flex-grow">
                                <h5 className="font-bold text-lg">{data.name}</h5>
                                <p className="text-xs opacity-80 mt-1">{data.description}</p>
                                <div className="flex items-center gap-2 mt-2">
                                    <span className="text-sm">Nível: {currentLevel} / {data.max}</span>
                                    <div className="w-full h-2 bg-black/30 rounded-full flex-grow">
                                        <div className="h-full bg-green-500 rounded-full" style={{ width: `${(currentLevel / data.max) * 100}%` }}></div>
                                    </div>
                                </div>
                            </div>
                            <button
                                onClick={() => onUpgradeSkill(skillKey)}
                                disabled={!canUpgrade}
                                className="bg-green-600 hover:bg-green-500 text-white font-bold py-2 px-4 rounded-lg text-sm disabled:bg-gray-500 disabled:cursor-not-allowed"
                            >
                                Melhorar
                            </button>
                        </div>
                    );
                })}
            </div>
        </Modal>
    );
};

export const TeamSelectionModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    onSave: (newTeam: string[]) => void;
    allPokemons: Pokemon[];
    currentTeamIds: string[];
    modalId: string;
}> = ({ isOpen, onClose, onSave, allPokemons, currentTeamIds, modalId }) => {
    const [selectedIds, setSelectedIds] = useState(new Set(currentTeamIds));

    useEffect(() => {
        if (isOpen) {
            setSelectedIds(new Set(currentTeamIds));
        }
    }, [isOpen, currentTeamIds]);

    const handleTogglePokemon = (id: string) => {
        const newSelectedIds = new Set(selectedIds);
        if (newSelectedIds.has(id)) {
            newSelectedIds.delete(id);
        } else {
            if (newSelectedIds.size < 6) {
                newSelectedIds.add(id);
            }
        }
        setSelectedIds(newSelectedIds);
    };

    const handleSave = () => {
        onSave(Array.from(selectedIds));
    };
    
    const getSpriteUrl = (pokemon: Pokemon) => {
        const pokemonId = POKEMON_IDS[pokemon.kind as keyof typeof POKEMON_IDS];
        if (!pokemonId) return '';
        const shinyPath = pokemon.isShiny ? 'shiny/' : '';
        return `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${shinyPath}${pokemonId}.png`;
    };

    const footer = (
        <div className="flex gap-2">
            <BtnWood onClick={onClose}>Cancelar</BtnWood>
            <button onClick={handleSave} className="bg-green-600 hover:bg-green-500 text-white font-bold py-2 px-4 rounded-lg">
                Salvar Time
            </button>
        </div>
    );

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Selecionar Time" footerContent={footer} modalId={modalId} widthClass="max-w-3xl">
            <div className="p-2">
                <div className="mb-4 text-center bg-black/20 p-2 rounded-lg">
                    <h4 className="font-bold">Seu Time ({selectedIds.size}/6)</h4>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                        <h5 className="font-semibold text-lg mb-2 text-center">Pokémon Disponíveis</h5>
                        <div className="bg-black/10 p-2 rounded-lg h-96 overflow-y-auto space-y-2">
                            {allPokemons.map(p => {
                                const isSelected = selectedIds.has(p.id);
                                return (
                                    <div
                                        key={p.id}
                                        onClick={() => handleTogglePokemon(p.id)}
                                        className={`flex items-center gap-3 p-2 rounded-md cursor-pointer transition-colors ${
                                            isSelected ? 'bg-green-800/50 opacity-50' : 'bg-white/10 hover:bg-white/20'
                                        }`}
                                    >
                                        <img src={getSpriteUrl(p)} alt={p.name} className="w-10 h-10 image-pixelated" />
                                        <div className="flex-grow">
                                            <p className="font-semibold">{p.name} {p.isShiny && '✨'}</p>
                                            <p className="text-xs opacity-70">{p.kind}</p>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                    <div className="md:col-span-2">
                         <h5 className="font-semibold text-lg mb-2 text-center">Time Atual</h5>
                         <div className="bg-black/10 p-2 rounded-lg h-96 grid grid-cols-2 lg:grid-cols-3 gap-2 content-start">
                             {Array.from(selectedIds).map(id => {
                                const p = allPokemons.find(poke => poke.id === id);
                                if (!p) return null;
                                return (
                                    <div
                                        key={p.id}
                                        onClick={() => handleTogglePokemon(p.id)}
                                        className="relative p-2 rounded-lg bg-white/10 cursor-pointer flex flex-col items-center justify-center"
                                    >
                                        <img src={getSpriteUrl(p)} alt={p.name} className="w-16 h-16 image-pixelated" />
                                        <p className="font-semibold text-sm truncate w-full text-center">{p.name}</p>
                                        <p className="text-xs opacity-70">{p.kind}</p>
                                        <div className="absolute top-1 right-1 text-red-500 text-lg font-bold">
                                            &times;
                                        </div>
                                    </div>
                                );
                             })}
                         </div>
                    </div>
                </div>
            </div>
        </Modal>
    );
};

export const DeathNotificationModal: React.FC<{
    isOpen: boolean;
    pokemonName: string;
    onClose: () => void;
}> = ({ isOpen, pokemonName, onClose }) => {
    if (!isOpen) return null;
    return (
         <div className="fixed inset-0 bg-black/80 z-[100] flex items-center justify-center p-4">
            <div className="bg-gradient-to-b from-gray-700 to-gray-900 p-6 rounded-xl shadow-2xl text-white text-center border-4 border-gray-900 max-w-sm">
                <h2 className="text-2xl font-bold mb-4">Uma Despedida...</h2>
                <p className="mb-6">Infelizmente, <span className="font-bold">{pokemonName}</span> nos deixou devido a uma tempestade severa. As memórias continuarão vivas.</p>
                 <BtnWood onClick={onClose}>Ok</BtnWood>
            </div>
        </div>
    );
};

export const AlarmNotificationModal: React.FC<{
    isOpen: boolean;
    alarm: Alarm | null;
    onStop: () => void;
}> = ({ isOpen, alarm, onStop }) => {
    if (!isOpen || !alarm) return null;

    return (
        <div className="fixed inset-0 bg-black/80 z-[100] flex items-center justify-center">
            <div className="bg-gradient-to-b from-blue-800 to-blue-900 p-6 rounded-xl shadow-2xl text-white text-center border-4 border-blue-900">
                <h2 className="text-4xl font-bold mb-4 animate-pulse">⏰ Alarme! ⏰</h2>
                <p className="text-lg mb-2">{alarm.time}</p>
                <p className="text-xl mb-6">{alarm.note || "Hora de acordar!"}</p>
                <button onClick={onStop} className="bg-red-600 hover:bg-red-500 text-white font-bold py-3 px-8 rounded-lg text-lg">
                    Parar
                </button>
            </div>
        </div>
    );
};

function getMoonPhase(date: Date = new Date()): { emoji: string; name: string } {
    const LUNAR_CYCLE = 29.530588853;
    // Known new moon: 2024-02-09T23:59:00Z
    const KNOWN_NEW_MOON_MS = 1707523140000;

    const now_ms = date.getTime();
    const age = ((now_ms - KNOWN_NEW_MOON_MS) / (1000 * 60 * 60 * 24)) % LUNAR_CYCLE;

    // Handle negative age for dates before the known new moon
    const lunarDay = age < 0 ? age + LUNAR_CYCLE : age;

    const phaseIndex = Math.floor((lunarDay / LUNAR_CYCLE) * 8 + 0.5) % 8;

    const phases = [
        { emoji: "🌑", name: "Lua Nova" },
        { emoji: "🌒", name: "Crescente" },
        { emoji: "🌓", name: "Quarto Crescente" },
        { emoji: "🌔", name: "Gibosa Crescente" },
        { emoji: "🌕", name: "Lua Cheia" },
        { emoji: "🌖", name: "Gibosa Minguante" },
        { emoji: "🌗", name: "Quarto Minguante" },
        { emoji: "🌘", name: "Minguante" },
    ];
    return phases[phaseIndex];
}

export const ClockWidget: React.FC<{ day: number; onClick: () => void; }> = ({ day, onClick }) => {
    const [time, setTime] = useState(new Date());
    const [weather, setWeather] = useState<{ temp: number; description: string; icon: string } | null>(null);
    const [moonPhase, setMoonPhase] = useState<{ emoji: string; name: string } | null>(null);

    useEffect(() => {
        const timerId = setInterval(() => setTime(new Date()), 1000);
        return () => clearInterval(timerId);
    }, []);
    
    useEffect(() => {
        const updateWeatherAndMoon = () => {
            const fetchWeather = async () => {
                try {
                    const lat = -23.31;
                    const lon = -51.16;
                    const apiKey = 'fc1ffbe5890909b23b23add758711a43';
                    const url = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${apiKey}&units=metric&lang=pt_br`;
                    
                    const response = await fetch(url);
                    if (!response.ok) {
                        throw new Error('Weather data fetch failed');
                    }
                    const data = await response.json();
                    
                    setWeather({
                        temp: Math.round(data.main.temp),
                        description: data.weather[0].description.charAt(0).toUpperCase() + data.weather[0].description.slice(1),
                        icon: data.weather[0].icon,
                    });
                } catch (error) {
                    console.error("Error fetching weather:", error);
                     setWeather({ temp: 23, description: 'Nublado', icon: '04d' });
                }
            };
            fetchWeather();
            setMoonPhase(getMoonPhase());
        };

        updateWeatherAndMoon();
        const weatherInterval = setInterval(updateWeatherAndMoon, 15 * 60 * 1000);
        return () => clearInterval(weatherInterval);
    }, []);

    const timeString = time.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    const dateString = time.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' });
    const formattedDate = dateString.replace('.',',');

    return (
        <div onClick={onClick} className="fixed bottom-2 left-5 w-72 h-72 rounded-full bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-[#a57a5e] to-[#6b4f3a] shadow-2xl flex flex-col items-center justify-center text-white cursor-pointer select-none border-4 border-[#5b3f26]/80 z-50">
            <div className="flex w-full justify-around items-start px-2 -mb-2">
                {weather ? (
                    <div className="flex flex-col items-center text-center">
                        <div className="flex items-center justify-center h-14">
                            <img src={`https://openweathermap.org/img/wn/${weather.icon}@2x.png`} alt={weather.description} className="w-14 h-14 -ml-2" />
                            <span className="text-4xl font-light">{weather.temp}°C</span>
                        </div>
                        <div className="text-sm -mt-1 opacity-90 w-28 truncate">{weather?.description}</div>
                    </div>
                ) : <div className="h-14 w-28 text-sm flex items-center justify-center">Carregando...</div>}
                {moonPhase ? (
                    <div className="flex flex-col items-center text-center" title={moonPhase.name}>
                        <div className="h-14 flex items-center justify-center">
                            <span className="text-5xl">{moonPhase.emoji}</span>
                        </div>
                        <div className="text-sm -mt-1 opacity-90 w-28 truncate">{moonPhase.name}</div>
                    </div>
                ) : <div className="h-14 w-28"></div>}
            </div>
            
            <div className="text-8xl font-bold font-sans my-0 flex items-center leading-none" style={{textShadow: '3px 3px 6px rgba(0,0,0,0.8)'}}>
                <span>{timeString.split(':')[0]}</span>
                <span className="animate-pulse text-7xl pb-2">:</span>
                <span>{timeString.split(':')[1]}</span>
            </div>
            
            <div className="text-2xl font-semibold -mt-2">Dia {day}</div>
            <div className="text-base opacity-90">{formattedDate}</div>
        </div>
    );
};

export const TaskManager: React.FC<{
    tasks: Task[];
    day: number;
    onCompleteTask: (taskId: string) => void;
    onDeleteTask: (taskId: string) => void;
    onEditTask: (task: Task) => void;
    onNewTask: () => void;
    onToggleSubtask: (taskId: string, subtaskId: string) => void;
}> = ({ tasks, day, onCompleteTask, onNewTask, onEditTask, onDeleteTask, onToggleSubtask }) => {
    const [isCollapsed, setIsCollapsed] = useState(false);
    const [isFiltersOpen, setIsFiltersOpen] = useState(true);
    const [dateFilter, setDateFilter] = useState('Hoje');
    const [expandedTasks, setExpandedTasks] = useState<Set<string>>(new Set());

    const toggleTaskExpansion = (taskId: string) => {
        setExpandedTasks(prev => {
            const newSet = new Set(prev);
            if (newSet.has(taskId)) {
                newSet.delete(taskId);
            } else {
                newSet.add(taskId);
            }
            return newSet;
        });
    };

    const today = useMemo(() => new Date(), [day]);
    const filteredTasks = useMemo(() => {
        const filtered = tasks.filter(task => {
            const dateMatch = (() => {
                switch(dateFilter) {
                    case 'Hoje': return isTaskDueOnDate(task, today);
                    case 'Amanhã': return isTaskDueTomorrow(task, today);
                    case 'Com Data': return taskHasDueDate(task);
                    case 'Todas': return true;
                    default: return true;
                }
            })();

            return dateMatch;
        });

        return filtered.sort((a, b) => {
            const aCompleted = isTaskCompletedToday(a, today);
            const bCompleted = isTaskCompletedToday(b, today);
            if (aCompleted && !bCompleted) return 1;
            if (!aCompleted && bCompleted) return -1;
            return a.createdAt - b.createdAt;
        });
    }, [tasks, today, dateFilter]);

    return (
        <div className={`fixed top-24 right-0 transition-transform duration-500 flex items-start ${isCollapsed ? 'translate-x-[calc(100%-32px)]' : ''}`}>
            <div onClick={() => setIsCollapsed(!isCollapsed)} className="bg-[#5b3f26] w-8 h-16 rounded-l-lg cursor-pointer flex items-center justify-center text-white font-bold mt-40 text-lg shadow-lg">
                {isCollapsed ? '❮' : '❯'}
            </div>
            <div className="w-[300px] h-[calc(100vh-9rem)] bg-[#6e492e] rounded-l-2xl shadow-2xl flex flex-col p-4 text-white">
                <div className="flex items-center gap-2 text-2xl font-bold mb-4">
                    <span>📋</span>
                    <h3>Tarefas</h3>
                </div>
                
                {/* Filters */}
                <div>
                    <div onClick={() => setIsFiltersOpen(!isFiltersOpen)} className="flex justify-between items-center cursor-pointer mb-2">
                        <h4 className="font-semibold">Filtros</h4>
                        <span>{isFiltersOpen ? '▼' : '▶'}</span>
                    </div>
                    {isFiltersOpen && (
                        <div className="bg-black/10 p-2 rounded-lg mb-4">
                            <div className="flex justify-between gap-1">
                                {['Hoje', 'Amanhã', 'Com Data', 'Todas'].map(f => (
                                    <button key={f} onClick={() => setDateFilter(f)} className={`text-xs px-2 py-1 rounded-full flex-1 ${dateFilter === f ? 'bg-green-500' : 'bg-black/20'}`}>{f}</button>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                 <button onClick={onNewTask} className="w-full bg-[#a06b43] hover:brightness-110 text-white font-bold py-2 px-4 rounded-lg mb-4 text-center">
                    + Nova Tarefa
                 </button>

                <div className="flex-grow overflow-y-auto pr-2 space-y-2">
                    {filteredTasks.length > 0 ? filteredTasks.map(task => {
                        const isCompleted = isTaskCompletedToday(task, today);
                        const hasSubtasks = task.subtasks && task.subtasks.length > 0;
                        const isExpanded = expandedTasks.has(task.id);
                        return (
                            <div key={task.id} className={`bg-black/20 p-3 rounded-lg flex flex-col gap-2 transition-opacity ${isCompleted ? 'opacity-50' : ''}`}>
                                <div className="flex justify-between items-start">
                                    <div className="flex-grow mr-2" onClick={() => hasSubtasks && toggleTaskExpansion(task.id)}>
                                        <div className="flex items-center gap-2 cursor-pointer">
                                            {hasSubtasks && (
                                                <button className="text-sm p-0 h-full focus:outline-none">
                                                    <span className={`inline-block transition-transform transform ${isExpanded ? 'rotate-90' : ''}`}>▶</span>
                                                </button>
                                            )}
                                            <div className={`font-semibold ${isCompleted ? 'line-through' : ''}`}>{task.title}</div>
                                        </div>
                                        <div className={`text-xs opacity-70 flex items-center gap-2 mt-1 ${hasSubtasks ? 'pl-6' : ''}`}>
                                            <DifficultyPokeballIcon difficulty={task.difficulty} />
                                            <span className="truncate">{task.tags.join(', ')}</span>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-1 flex-shrink-0">
                                        <button onClick={(e) => { e.stopPropagation(); onEditTask(task); }} title="Editar" className="p-1 hover:bg-white/10 rounded">✏️</button>
                                        <button onClick={(e) => { e.stopPropagation(); onDeleteTask(task.id); }} title="Excluir" className="p-1 hover:bg-white/10 rounded">🗑️</button>
                                        <button onClick={(e) => { e.stopPropagation(); onCompleteTask(task.id); }} title={isCompleted ? "Completa!" : "Completar"} disabled={isCompleted} className={`p-1 hover:bg-white/10 rounded text-xl ${isCompleted ? 'cursor-default' : ''}`}>
                                            {isCompleted ? '🎉' : '✅'}
                                        </button>
                                    </div>
                                </div>
                                {hasSubtasks && isExpanded && (
                                    <div className="pl-6 border-l-2 border-white/10 space-y-1 ml-2 animate-fade-in-up" style={{ animationDuration: '0.3s' }}>
                                        {task.subtasks.map(sub => (
                                            <div key={sub.id} className="flex items-center gap-2 text-sm">
                                                <input type="checkbox" checked={sub.completed} onChange={() => onToggleSubtask(task.id, sub.id)} className="accent-green-500" />
                                                <span className={sub.completed ? 'line-through opacity-50' : ''}>{sub.text}</span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        );
                    }) : (
                        <div className="text-center opacity-70 pt-8">
                            Nenhuma tarefa encontrada.
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

// --- TimeManagerModal Sub-components ---

const AlarmForm: React.FC<{
    alarm: Alarm | 'new';
    onSave: (alarm: Alarm) => void;
    onCancel: () => void;
}> = ({ alarm, onSave, onCancel }) => {
    const isNew = alarm === 'new';
    const [time, setTime] = useState(isNew ? '08:00' : alarm.time);
    const [note, setNote] = useState(isNew ? '' : alarm.note);
    const [frequency, setFrequency] = useState<AlarmFrequency>(isNew ? { type: 'Diário' } : alarm.frequency);
    const [sound, setSound] = useState(isNew ? undefined : alarm.sound);
    const [fadeInDuration, setFadeInDuration] = useState(isNew ? 0 : alarm.fadeInDuration || 0);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (event) => {
                setSound({
                    name: file.name,
                    data: event.target?.result as string,
                });
            };
            reader.readAsDataURL(file);
        }
    };

    const handleSave = () => {
        const alarmData: Alarm = {
            id: isNew ? `alarm_${Date.now()}` : alarm.id,
            time,
            note,
            frequency,
            sound,
            fadeInDuration,
            isEnabled: isNew ? true : alarm.isEnabled,
            createdAt: isNew ? Date.now() : alarm.createdAt,
        };
        onSave(alarmData);
    };
    
    const weekDays = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
    const toggleDay = (dayIndex: number) => {
        const currentDays = frequency.daysOfWeek || [];
        const newDays = currentDays.includes(dayIndex) 
            ? currentDays.filter(d => d !== dayIndex)
            : [...currentDays, dayIndex];
        setFrequency({ ...frequency, daysOfWeek: newDays.sort() });
    };

    return (
        <div className="bg-black/20 p-4 rounded-lg space-y-4">
            <h4 className="font-bold text-lg">{isNew ? 'Novo Alarme' : 'Editar Alarme'}</h4>
            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label className="text-sm">Hora</label>
                    {/* FIX: Explicitly typed the event handler to resolve potential type errors. */}
                    <input type="time" value={time} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTime(e.target.value)} className="w-full mt-1 p-2 bg-[#4a321f] rounded-md" />
                </div>
                <div>
                    <label className="text-sm">Frequência</label>
                    {/* FIX: Explicitly typed the event handler to resolve potential type errors. */}
                    <select value={frequency.type} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setFrequency({ type: e.target.value as AlarmFrequencyType })} className="w-full mt-1 p-2 bg-[#4a321f] rounded-md">
                        <option value="Único">Único</option>
                        <option value="Diário">Diário</option>
                        <option value="Semanal">Semanal</option>
                    </select>
                </div>
            </div>
            {frequency.type === 'Semanal' && (
                <div className="flex justify-center gap-1">
                    {weekDays.map((day, index) => (
                        <button key={day} onClick={() => toggleDay(index)} className={`w-9 h-9 rounded-full text-xs font-bold ${frequency.daysOfWeek?.includes(index) ? 'bg-green-500' : 'bg-black/30'}`}>{day}</button>
                    ))}
                </div>
            )}
            <div>
                <label className="text-sm">Nota</label>
                {/* FIX: Explicitly typed the event handler to resolve potential type errors. */}
                <input type="text" value={note} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNote(e.target.value)} placeholder="Opcional" className="w-full mt-1 p-2 bg-[#4a321f] rounded-md" />
            </div>
            <div>
                 <label className="text-sm">Som</label>
                 <div className="flex items-center gap-2 mt-1">
                    <label htmlFor="sound-upload" className="flex-grow bg-[#4a321f] p-2 rounded-md cursor-pointer truncate text-white/80 hover:text-white">
                        {sound?.name || "Padrão"}
                    </label>
                    <input id="sound-upload" type="file" accept="audio/*" onChange={handleFileChange} className="hidden" />
                    {sound && <button onClick={() => setSound(undefined)} className="text-red-400 text-xs hover:underline">Remover</button>}
                 </div>
            </div>
            <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 text-sm">
                    {/* FIX: Explicitly typed the event handler to resolve potential type errors. */}
                    <input type="checkbox" checked={fadeInDuration > 0} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFadeInDuration(e.target.checked ? 5 : 0)} />
                    Aumento gradual de volume
                </label>
                {fadeInDuration > 0 && (
                    <div className="flex items-center gap-2">
                        {/* FIX: Explicitly typed the event handler to resolve potential type errors. */}
                        <input type="number" value={fadeInDuration} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFadeInDuration(parseInt(e.target.value, 10) || 0)} min="1" max="60" className="w-16 p-1 bg-[#4a321f] rounded-md"/>
                        <span className="text-xs">segundos</span>
                    </div>
                )}
            </div>
            <div className="flex justify-end gap-2">
                <button onClick={onCancel} className="bg-gray-600 hover:bg-gray-500 py-2 px-4 rounded-md text-sm">Cancelar</button>
                <button onClick={handleSave} className="bg-green-600 hover:bg-green-500 py-2 px-4 rounded-md text-sm">Salvar</button>
            </div>
        </div>
    );
};

const AlarmsTab: React.FC<{
    alarms: Alarm[];
    onSave: (alarm: Alarm) => void;
    onDelete: (alarmId: string) => void;
    onToggle: (alarmId: string, isEnabled: boolean) => void;
}> = ({ alarms, onSave, onDelete, onToggle }) => {
    const [editingAlarm, setEditingAlarm] = useState<Alarm | 'new' | null>(null);

    if (editingAlarm) {
        return <AlarmForm alarm={editingAlarm} onSave={(alarm) => { onSave(alarm); setEditingAlarm(null); }} onCancel={() => setEditingAlarm(null)} />
    }
    
    const formatFrequency = (freq: AlarmFrequency) => {
        if (freq.type === 'Semanal') {
            if (!freq.daysOfWeek || freq.daysOfWeek.length === 0) return 'Semanal (nenhum dia)';
            const days = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
            return freq.daysOfWeek.map(d => days[d]).join(', ');
        }
        return freq.type;
    };

    return (
        <div>
            <button onClick={() => setEditingAlarm('new')} className="w-full bg-green-600/80 hover:bg-green-600 text-white font-bold py-2.5 rounded-lg mb-4 text-center">
                + Novo Alarme
            </button>
            <div className="space-y-2">
                {alarms.map(alarm => (
                    <div key={alarm.id} className="p-3 bg-black/20 rounded-lg flex items-center gap-4">
                        <div className="flex-grow">
                            <p className="text-2xl font-light">{alarm.time}</p>
                            <p className="text-sm opacity-80">{alarm.note || 'Alarme'}</p>
                            <p className="text-xs opacity-60">{formatFrequency(alarm.frequency)}</p>
                        </div>
                        <div className="flex items-center gap-3">
                            <button onClick={() => setEditingAlarm(alarm)} className="text-sm hover:underline">Editar</button>
                            <button onClick={() => onDelete(alarm.id)} className="text-sm text-red-400 hover:underline">Excluir</button>
                            <label className="relative inline-flex items-center cursor-pointer">
                                {/* FIX: Explicitly typed the event handler to resolve potential type errors. */}
                                <input type="checkbox" checked={alarm.isEnabled} onChange={(e: React.ChangeEvent<HTMLInputElement>) => onToggle(alarm.id, e.target.checked)} className="sr-only peer" />
                                <div className="w-11 h-6 bg-gray-600 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-green-600"></div>
                            </label>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

const TimerTab: React.FC<{
    timer: TimerState;
    onUpdate: (newState: Partial<TimerState>) => void;
}> = ({ timer, onUpdate }) => {
    const [displayTime, setDisplayTime] = useState(0);
    const [minutes, setMinutes] = useState(Math.floor(timer.duration / 60).toString());
    const [seconds, setSeconds] = useState((timer.duration % 60).toString());
    const intervalRef = useRef<number | null>(null);

    useEffect(() => {
        const tick = () => {
            if (timer.isRunning && timer.endTime) {
                const remaining = Math.max(0, timer.endTime - Date.now());
                setDisplayTime(remaining);
            } else {
                 setDisplayTime(timer.duration * 1000);
            }
        };

        if (timer.isRunning) {
            tick();
            intervalRef.current = window.setInterval(tick, 100);
        } else {
             tick();
        }
        
        return () => {
            if (intervalRef.current) clearInterval(intervalRef.current);
        };
    }, [timer]);

    const handleStart = () => {
        const totalSeconds = (parseInt(minutes, 10) || 0) * 60 + (parseInt(seconds, 10) || 0);
        onUpdate({ duration: totalSeconds, endTime: Date.now() + totalSeconds * 1000, isRunning: true });
    };

    const handlePause = () => {
        if (!timer.endTime) return;
        const remaining = timer.endTime - Date.now();
        onUpdate({ duration: Math.round(remaining / 1000), isRunning: false, endTime: null });
    };

    const handleReset = () => {
        const totalSeconds = (parseInt(minutes, 10) || 0) * 60 + (parseInt(seconds, 10) || 0);
        onUpdate({ duration: totalSeconds, endTime: null, isRunning: false });
    };
    
    const formattedTime = useMemo(() => {
        const totalSeconds = Math.ceil(displayTime / 1000);
        const mins = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
        const secs = (totalSeconds % 60).toString().padStart(2, '0');
        return `${mins}:${secs}`;
    }, [displayTime]);

    return (
        <div className="flex flex-col items-center justify-center p-4">
            <div className="text-7xl font-mono mb-4">{formattedTime}</div>
            
            {timer.isRunning ? (
                <div className="flex items-center gap-4">
                    <button onClick={handlePause} className="w-32 bg-yellow-600/80 hover:bg-yellow-600 text-white font-bold py-2.5 rounded-lg">Pausar</button>
                    <button onClick={handleReset} className="w-32 bg-red-600/80 hover:bg-red-600 text-white font-bold py-2.5 rounded-lg">Resetar</button>
                </div>
            ) : (
                <div className="w-full space-y-4">
                    <div className="flex items-center justify-center gap-2">
                        {/* FIX: Explicitly typed the event handler to resolve potential type errors. */}
                        <input type="number" value={minutes} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setMinutes(e.target.value)} className="w-24 p-2 text-2xl text-center bg-[#4a321f] rounded-md" min="0" />
                        <span className="text-2xl">:</span>
                        {/* FIX: Explicitly typed the event handler to resolve potential type errors. */}
                        <input type="number" value={seconds} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSeconds(e.target.value)} className="w-24 p-2 text-2xl text-center bg-[#4a321f] rounded-md" min="0" max="59" />
                    </div>
                    <button onClick={handleStart} className="w-full bg-green-600/80 hover:bg-green-600 text-white font-bold py-2.5 rounded-lg">Iniciar</button>
                </div>
            )}
        </div>
    );
};

const WorldClockDisplay: React.FC<{
    location: WorldClockLocation;
    onDelete: (locationId: string) => void;
}> = ({ location, onDelete }) => {
    const [time, setTime] = useState('');

    useEffect(() => {
        const update = () => {
            const date = new Date();
            try {
                const timeString = date.toLocaleTimeString('pt-BR', { timeZone: location.timezone, hour: '2-digit', minute: '2-digit', second: '2-digit' });
                setTime(timeString);
            } catch (e) {
                console.error(`Invalid timezone: ${location.timezone}`);
                setTime('Inválido');
            }
        };
        update();
        const interval = setInterval(update, 1000);
        return () => clearInterval(interval);
    }, [location.timezone]);
    
    return (
        <div className="p-3 bg-black/20 rounded-lg flex items-center justify-between">
            <div>
                <p className="text-lg font-semibold">{location.name}</p>
            </div>
            <div className="flex items-center gap-4">
                <p className="text-3xl font-mono">{time}</p>
                {location.id !== 'local' && (
                    <button onClick={() => onDelete(location.id)} className="text-red-400 hover:underline text-sm">Remover</button>
                )}
            </div>
        </div>
    );
};


const timezones = [
    { id: 'America/New_York', name: 'Nova York' },
    { id: 'Europe/London', name: 'Londres' },
    { id: 'Asia/Tokyo', name: 'Tóquio' },
    { id: 'Australia/Sydney', name: 'Sydney' },
    { id: 'America/Sao_Paulo', name: 'São Paulo' },
    { id: 'Europe/Paris', name: 'Paris' },
    { id: 'Asia/Dubai', name: 'Dubai' },
    { id: 'America/Los_Angeles', name: 'Los Angeles' },
];

const WorldClockTab: React.FC<{
    locations: WorldClockLocation[];
    onAdd: (location: WorldClockLocation) => void;
    onDelete: (locationId: string) => void;
}> = ({ locations, onAdd, onDelete }) => {
    const [selectedTimezone, setSelectedTimezone] = useState(timezones[0].id);

    const handleAddTimezone = () => {
        const tz = timezones.find(t => t.id === selectedTimezone);
        if (tz && !locations.some(l => l.id === tz.id)) {
            onAdd({ id: tz.id, name: tz.name, timezone: tz.id });
        }
    };

    return (
        <div>
            <div className="flex gap-2 mb-4 p-2 bg-black/10 rounded-lg">
                {/* FIX: Explicitly typed the event handler to resolve potential type errors. */}
                <select value={selectedTimezone} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setSelectedTimezone(e.target.value)} className="flex-grow p-2 bg-[#4a321f] rounded-md">
                    {timezones.map(tz => <option key={tz.id} value={tz.id}>{tz.name}</option>)}
                </select>
                <button onClick={handleAddTimezone} className="bg-green-600/80 hover:bg-green-600 text-white font-bold py-2 px-4 rounded-lg">Adicionar</button>
            </div>
            <div className="space-y-2">
                {locations.map(location => (
                    <WorldClockDisplay key={location.id} location={location} onDelete={onDelete} />
                ))}
            </div>
        </div>
    );
};

// --- Weather Forecast Tab ---
interface DailyForecast {
    dt: number;
    temp: {
        min: number;
        max: number;
    };
    weather: {
        description: string;
        icon: string;
    }[];
}

const WeatherForecastTab: React.FC = () => {
    const [forecast, setForecast] = useState<DailyForecast[] | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetchForecast = async () => {
            try {
                setLoading(true);
                setError(null);
                const lat = -23.31;
                const lon = -51.16;
                const apiKey = 'fc1ffbe5890909b23b23add758711a43';
                // Using the 5 day / 3 hour forecast API which is available on the free tier
                const url = `https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&appid=${apiKey}&units=metric&lang=pt_br`;

                const response = await fetch(url);
                if (!response.ok) {
                    throw new Error('Falha ao buscar dados da previsão.');
                }
                const data = await response.json();
                
                // Process the 3-hour data into daily summaries
                const dailyData: { [key: string]: { dt: number, temps: number[], weathers: any[] } } = {};
                
                data.list.forEach((item: any) => {
                    const date = new Date(item.dt * 1000);
                    const dateString = date.toDateString();

                    if (!dailyData[dateString]) {
                        dailyData[dateString] = { dt: item.dt, temps: [], weathers: [] };
                    }

                    dailyData[dateString].temps.push(item.main.temp);
                    dailyData[dateString].weathers.push({
                        ...item.weather[0],
                        hour: date.getHours()
                    });
                });

                const todayString = new Date().toDateString();
                
                const processedForecast = Object.values(dailyData)
                    .filter(day => new Date(day.dt * 1000).toDateString() !== todayString) // Exclude today
                    .map(dayInfo => {
                        // Find weather for around midday for a representative icon
                        let representativeWeather = dayInfo.weathers.find(w => w.hour >= 12 && w.hour <= 15);
                        if (!representativeWeather) {
                            representativeWeather = dayInfo.weathers[0]; // Fallback
                        }
                        
                        return {
                            dt: dayInfo.dt,
                            temp: {
                                min: Math.min(...dayInfo.temps),
                                max: Math.max(...dayInfo.temps),
                            },
                            weather: [{
                                description: representativeWeather.description,
                                icon: representativeWeather.icon,
                            }],
                        };
                    }).slice(0, 5); // Limit to 5 days as per API

                setForecast(processedForecast);
            } catch (err: any) {
                setError(err.message || 'Ocorreu um erro.');
                console.error("Error fetching forecast:", err);
            } finally {
                setLoading(false);
            }
        };

        fetchForecast();
    }, []);

    const getDayOfWeek = (timestamp: number, index: number) => {
        if (index === 0) {
            return "Amanhã";
        }
        const date = new Date(timestamp * 1000);
        return date.toLocaleDateString('pt-BR', { weekday: 'long' });
    };

    if (loading) {
        return <div className="text-center p-8">Carregando previsão do tempo...</div>;
    }

    if (error) {
        return <div className="text-center p-8 text-red-400">{error}</div>;
    }

    return (
        <div className="space-y-2">
            {forecast?.map((day, index) => (
                <div key={index} className="flex items-center justify-between p-2 bg-black/20 rounded-lg">
                    <div className="w-1/3 font-semibold capitalize">
                        {getDayOfWeek(day.dt, index)}
                    </div>
                    <div className="flex items-center gap-2 w-1/3">
                        <img 
                            src={`https://openweathermap.org/img/wn/${day.weather[0].icon}.png`} 
                            alt={day.weather[0].description} 
                            className="w-10 h-10"
                        />
                        <span className="text-sm capitalize">{day.weather[0].description}</span>
                    </div>
                    <div className="w-1/3 text-right">
                        <span className="font-semibold">{Math.round(day.temp.max)}°</span>
                        <span className="opacity-70 ml-2">{Math.round(day.temp.min)}°</span>
                    </div>
                </div>
            ))}
        </div>
    );
};


export const TimeManagerModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    gameState: GameState;
    onSaveAlarm: (alarm: Alarm) => void;
    onDeleteAlarm: (alarmId: string) => void;
    onToggleAlarm: (alarmId: string, isEnabled: boolean) => void;
    onTimerUpdate: (newState: Partial<TimerState>) => void;
    onAddWorldClock: (location: WorldClockLocation) => void;
    onDeleteWorldClock: (locationId: string) => void;
    modalId: string;
}> = ({ isOpen, onClose, gameState, onSaveAlarm, onDeleteAlarm, onToggleAlarm, onTimerUpdate, onAddWorldClock, onDeleteWorldClock, modalId }) => {
    const [activeTab, setActiveTab] = useState('alarmes');

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Gerenciador de Tempo" modalId={modalId} widthClass="max-w-xl">
            <Tabs tabs={['alarmes', 'timer', 'relógio mundial', 'previsão']} activeTab={activeTab} onTabChange={setActiveTab} />
            {activeTab === 'alarmes' && (
                <AlarmsTab
                    alarms={gameState.alarms}
                    onSave={onSaveAlarm}
                    onDelete={onDeleteAlarm}
                    onToggle={onToggleAlarm}
                />
            )}
            {activeTab === 'timer' && (
                <TimerTab
                    timer={gameState.timer}
                    onUpdate={onTimerUpdate}
                />
            )}
            {activeTab === 'relógio mundial' && (
                <WorldClockTab
                    locations={gameState.worldClockLocations}
                    onAdd={onAddWorldClock}
                    onDelete={onDeleteWorldClock}
                />
            )}
             {activeTab === 'previsão' && (
                <WeatherForecastTab />
            )}
        </Modal>
    );
};