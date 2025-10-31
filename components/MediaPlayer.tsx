
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { PlaylistItem } from '../types';

const formatTime = (seconds: number) => {
    if (isNaN(seconds) || !isFinite(seconds)) return '00:00';
    const floorSeconds = Math.floor(seconds);
    const min = Math.floor(floorSeconds / 60);
    const sec = floorSeconds % 60;
    return `${min.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
};

const YouTubePrompt: React.FC<{
  onClose: () => void;
  onLoad: (url: string) => void;
}> = ({ onClose, onLoad }) => {
  const [url, setUrl] = useState('');
  return (
    <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-gradient-to-b from-[#8f5d3a] to-[#5b3f26] p-4 rounded-xl shadow-2xl z-[80] border-4 border-[#5b3f26] text-white">
      <h4 className="font-bold text-lg mb-2">Carregar Vídeo do YouTube</h4>
      <input
        type="text"
        value={url}
// FIX: Explicitly typed the event handler to resolve potential type errors.
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setUrl(e.target.value)}
        placeholder="Cole o link do YouTube aqui..."
        className="w-full bg-black/50 p-2 rounded border border-white/10 outline-none"
      />
      <div className="flex justify-end gap-2 mt-4">
        <button onClick={onClose} className="bg-gray-500 hover:bg-gray-400 text-white font-bold py-1 px-3 rounded-lg text-sm">Cancelar</button>
        <button onClick={() => onLoad(url)} className="bg-green-600 hover:bg-green-500 text-white font-bold py-1 px-3 rounded-lg text-sm">Carregar</button>
      </div>
    </div>
  );
};

const PlaylistModal: React.FC<{
  isOpen: boolean;
  playlist: PlaylistItem[];
  currentIndex: number;
  onClose: () => void;
  onRemove: (index: number) => void;
  onReorder: (dragIndex: number, dropIndex: number) => void;
  onAddFiles: () => void;
  onPlayTrack: (index: number) => void;
}> = ({ isOpen, playlist, currentIndex, onClose, onRemove, onReorder, onAddFiles, onPlayTrack }) => {
    const [dragIndex, setDragIndex] = useState<number | null>(null);

    const handleDragStart = (e: React.DragEvent<HTMLDivElement>, index: number) => {
        setDragIndex(index);
        e.dataTransfer.effectAllowed = 'move';
    };

    const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.currentTarget.classList.add('drag-over');
    };
    
    const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
        e.currentTarget.classList.remove('drag-over');
    };

    const handleDrop = (e: React.DragEvent<HTMLDivElement>, dropIndex: number) => {
        e.preventDefault();
        e.currentTarget.classList.remove('drag-over');
        if (dragIndex !== null) {
            onReorder(dragIndex, dropIndex);
            setDragIndex(null);
        }
    };
    
  if (!isOpen) return null;

  return (
    <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-gradient-to-b from-[#8f5d3a] to-[#5b3f26] p-4 rounded-xl shadow-2xl z-[80] w-96 max-h-[70vh] flex flex-col border-4 border-[#5b3f26] text-white">
      <div className="flex justify-between items-center mb-3">
        <h3 className="text-xl font-bold">Playlist</h3>
        <button onClick={onClose} className="text-2xl font-bold hover:text-red-400">&times;</button>
      </div>
      <div className="flex-grow overflow-y-auto pr-2 space-y-1">
        {playlist.map((item, index) => (
          <div
            key={item.id}
            className={`playlist-item flex items-center gap-2 p-2 rounded ${currentIndex === index ? 'bg-green-600/30' : 'bg-black/20'}`}
            draggable
            onDragStart={(e) => handleDragStart(e, index)}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={(e) => handleDrop(e, index)}
            onDoubleClick={() => onPlayTrack(index)}
          >
            <span className="cursor-pointer" onClick={() => onPlayTrack(index)}>▶️</span>
            <span className="flex-grow truncate">{item.name}</span>
            <button onClick={() => onRemove(index)} className="text-red-400 font-bold text-lg hover:text-red-600">×</button>
          </div>
        ))}
         {playlist.length === 0 && <p className="text-center opacity-50 p-4">A playlist está vazia.</p>}
      </div>
      <div className="mt-4 border-t border-white/10 pt-3">
        <button onClick={onAddFiles} className="w-full bg-green-600 hover:bg-green-500 text-white font-bold py-2 px-4 rounded-lg text-sm">➕ Adicionar Arquivos</button>
      </div>
    </div>
  );
};


interface MediaPlayerProps {
  isVisible: boolean;
  position: { x: number; y: number };
  setPosition: (pos: { x: number; y: number }) => void;
  size: { width: number, height: number };
  onSetSize: (size: { width: number, height: number }) => void;
  onMinimize: () => void;
  playlist: PlaylistItem[];
  currentTrackIndex: number;
  onNext: () => void;
  onPrev: () => void;
  onShuffle: () => void;
  isShuffled: boolean;
  onLoadFiles: (replace: boolean) => void;
  onLoadYouTube: (url: string) => void;
  onSetPlaylist: (newPlaylist: PlaylistItem[]) => void;
  onSetTrackIndex: (index: number) => void;
}
export const MediaPlayer: React.FC<MediaPlayerProps> = (props) => {
    const { isVisible, position, setPosition, size, onSetSize, onMinimize, playlist, currentTrackIndex, onNext, onPrev, onShuffle, isShuffled, onLoadFiles, onLoadYouTube, onSetPlaylist, onSetTrackIndex } = props;
    
    const playerRef = useRef<HTMLDivElement>(null);
    const videoRef = useRef<HTMLVideoElement>(null);
    const dragStartRef = useRef<{ x: number, y: number, playerX: number, playerY: number } | null>(null);
    const resizeStartRef = useRef<{ x: number, y: number, width: number, height: number } | null>(null);


    const [isPlaying, setIsPlaying] = useState(false);
    const [duration, setDuration] = useState(0);
    const [currentTime, setCurrentTime] = useState(0);
    const [volume, setVolume] = useState(1);
    const [isMuted, setIsMuted] = useState(false);
    const [isVolumeSliderVisible, setVolumeSliderVisible] = useState(false);
    const [isPlaylistModalOpen, setIsPlaylistModalOpen] = useState(false);
    const [isYouTubePromptOpen, setIsYouTubePromptOpen] = useState(false);

    const currentTrack = playlist[currentTrackIndex];

    const handlePlayPause = () => {
        if (!videoRef.current) return;
        if (isPlaying) videoRef.current.pause();
        else videoRef.current.play();
    };

    const handleStop = () => {
        if (videoRef.current) {
            videoRef.current.pause();
            videoRef.current.currentTime = 0;
        }
    };
    
    const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (videoRef.current) {
            videoRef.current.currentTime = Number(e.target.value);
        }
    };
    
    const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newVolume = Number(e.target.value);
        if (videoRef.current) videoRef.current.volume = newVolume;
        setVolume(newVolume);
        if (newVolume > 0) setIsMuted(false);
    };

    const handleToggleMute = () => {
        const newMutedState = !isMuted;
        if (videoRef.current) videoRef.current.muted = newMutedState;
        setIsMuted(newMutedState);
    };
    
    const handleAddSubtitles = () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.vtt,.srt';
        input.onchange = (e) => {
            const file = (e.target as HTMLInputElement).files?.[0];
            if (file && currentTrack) {
                const newPlaylist = [...playlist];
                const trackToUpdate = { ...newPlaylist[currentTrackIndex] };
                if (trackToUpdate.subtitleUrl) URL.revokeObjectURL(trackToUpdate.subtitleUrl);
                trackToUpdate.subtitleUrl = URL.createObjectURL(file);
                newPlaylist[currentTrackIndex] = trackToUpdate;
                onSetPlaylist(newPlaylist);
            }
        };
        input.click();
    };

    // Dragging Logic
    const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
        if (!playerRef.current) return;
        dragStartRef.current = {
            x: e.clientX,
            y: e.clientY,
            playerX: playerRef.current.offsetLeft,
            playerY: playerRef.current.offsetTop,
        };
        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
    };

    const handleMouseMove = useCallback((e: MouseEvent) => {
        if (!dragStartRef.current || !playerRef.current) return;
        const dx = e.clientX - dragStartRef.current.x;
        const dy = e.clientY - dragStartRef.current.y;
        const newX = dragStartRef.current.playerX + dx;
        const newY = dragStartRef.current.playerY + dy;
        
        const maxX = window.innerWidth - size.width;
        const maxY = window.innerHeight - size.height;
        
        setPosition({
            x: Math.max(0, Math.min(newX, maxX)),
            y: Math.max(0, Math.min(newY, maxY)),
        });
    }, [setPosition, size]);

    const handleMouseUp = useCallback(() => {
        dragStartRef.current = null;
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
    }, [handleMouseMove]);
    
    // Resizing Logic
    const handleResizeMouseMove = useCallback((e: MouseEvent) => {
        if (!resizeStartRef.current) return;
        const dx = e.clientX - resizeStartRef.current.x;
        const dy = e.clientY - resizeStartRef.current.y;
        
        const newWidth = resizeStartRef.current.width + dx;
        const newHeight = resizeStartRef.current.height + dy;
        
        const clampedWidth = Math.max(300, newWidth);
        const clampedHeight = Math.max(250, newHeight);

        onSetSize({ width: clampedWidth, height: clampedHeight });
    }, [onSetSize]);

    const handleResizeMouseUp = useCallback(() => {
        resizeStartRef.current = null;
        window.removeEventListener('mousemove', handleResizeMouseMove);
        window.removeEventListener('mouseup', handleResizeMouseUp);
    }, [handleResizeMouseMove]);

    const handleResizeMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
        e.stopPropagation();
        resizeStartRef.current = {
            x: e.clientX,
            y: e.clientY,
            width: size.width,
            height: size.height,
        };
        window.addEventListener('mousemove', handleResizeMouseMove);
        window.addEventListener('mouseup', handleResizeMouseUp);
    };


    // Video Event Listeners Effect
    useEffect(() => {
        const video = videoRef.current;
        if (!video) return;

        const updatePlayState = () => setIsPlaying(!video.paused);
        const updateTime = () => setCurrentTime(video.currentTime);
        const updateDuration = () => setDuration(video.duration);

        video.addEventListener('play', updatePlayState);
        video.addEventListener('pause', updatePlayState);
        video.addEventListener('ended', onNext);
        video.addEventListener('timeupdate', updateTime);
        video.addEventListener('loadedmetadata', updateDuration);
        
        return () => {
            video.removeEventListener('play', updatePlayState);
            video.removeEventListener('pause', updatePlayState);
            video.removeEventListener('ended', onNext);
            video.removeEventListener('timeupdate', updateTime);
            video.removeEventListener('loadedmetadata', updateDuration);
        };
    }, [onNext]);


  return (
    <>
      <div
        ref={playerRef}
        className="media-player-window"
        style={{
            top: `${position.y}px`,
            left: `${position.x}px`,
            width: `${size.width}px`,
            height: `${size.height}px`,
            display: isVisible ? 'flex' : 'none'
        }}
      >
        <div className="media-player-header" onMouseDown={handleMouseDown}>
            <div className="flex justify-between items-center">
                <h4 className="font-bold text-lg m-0">PokeTV</h4>
                <button onClick={onMinimize} className="text-xl font-bold hover:text-red-400 leading-none p-0 bg-transparent border-none cursor-pointer">－</button>
            </div>
        </div>
        
        <div className="p-2 flex-grow flex flex-col min-h-0">
          <div className="relative w-full bg-black rounded-md overflow-hidden flex-grow">
            {currentTrack?.type === 'local' ? (
                <video ref={videoRef} src={currentTrack.url} className="w-full h-full object-contain" autoPlay playsInline>
                    {currentTrack.subtitleUrl && <track kind="subtitles" src={currentTrack.subtitleUrl} default />}
                </video>
            ) : currentTrack?.type === 'youtube' ? (
                <iframe
                    src={currentTrack.url}
                    className="w-full h-full"
                    allow="autoplay; encrypted-media"
                    allowFullScreen
                    title="YouTube Video Player"
                />
            ) : (
                <div className="w-full h-full flex items-center justify-center text-gray-500">Nenhuma mídia carregada</div>
            )}
           </div>

          <div className="media-player-display">
            <div className="flex items-center gap-2 text-xs">
                <span>{formatTime(currentTime)}</span>
                <input
                    type="range"
                    min="0"
                    max={duration}
                    value={currentTime}
                    onChange={handleSeek}
                    className="progress-slider flex-grow"
                    disabled={!currentTrack}
                />
                <span>{formatTime(duration)}</span>
            </div>
          </div>

          <div className="media-player-controls flex justify-around items-center">
            <button onClick={onShuffle} title="Embaralhar" style={{ color: isShuffled ? '#2fa66b' : 'inherit' }}>🔀</button>
            <button onClick={onPrev} disabled={!currentTrack} title="Anterior">⏪</button>
            <button onClick={handlePlayPause} className="text-3xl" disabled={!currentTrack} title={isPlaying ? 'Pausar' : 'Reproduzir'}>{isPlaying ? '⏸️' : '▶️'}</button>
            <button onClick={handleStop} disabled={!currentTrack} title="Parar">⏹️</button>
            <button onClick={onNext} disabled={!currentTrack} title="Próximo">⏩</button>
            <div 
                className="relative flex items-center" 
                onMouseEnter={() => setVolumeSliderVisible(true)} 
                onMouseLeave={() => setVolumeSliderVisible(false)}
            >
                <button onClick={handleToggleMute} title="Volume">{isMuted || volume === 0 ? '🔇' : volume < 0.5 ? '🔉' : '🔊'}</button>
                {isVolumeSliderVisible && (
                    <input type="range" min="0" max="1" step="0.01" value={volume} onChange={handleVolumeChange} className="volume-slider absolute left-full ml-2" />
                )}
            </div>
          </div>
          
          <div className="media-player-actions flex justify-around items-center mt-2 pt-2 border-t-2 border-white/10">
            <button onClick={() => onLoadFiles(true)} title="Adicionar Arquivos (Substituir Playlist)">➕</button>
            <button onClick={() => setIsYouTubePromptOpen(true)} className="youtube-btn" title="Carregar do YouTube (Substituir Playlist)">▶️</button>
            <button onClick={handleAddSubtitles} disabled={!currentTrack || currentTrack.type !== 'local'} title="Adicionar Legenda">💬</button>
            <button onClick={() => setIsPlaylistModalOpen(true)} title="Ver Playlist">🎵</button>
          </div>
        </div>
        <div className="media-player-resize-handle" onMouseDown={handleResizeMouseDown}></div>
      </div>
      {isPlaylistModalOpen && (
        <PlaylistModal
            isOpen={isPlaylistModalOpen}
            onClose={() => setIsPlaylistModalOpen(false)}
            playlist={playlist}
            currentIndex={currentTrackIndex}
            onRemove={(index) => {
                const newPlaylist = playlist.filter((_, i) => i !== index);
                onSetPlaylist(newPlaylist);
            }}
            onReorder={(dragIndex, dropIndex) => {
                const newPlaylist = [...playlist];
                const [draggedItem] = newPlaylist.splice(dragIndex, 1);
                newPlaylist.splice(dropIndex, 0, draggedItem);
                onSetPlaylist(newPlaylist);
            }}
            onAddFiles={() => onLoadFiles(false)}
            onPlayTrack={onSetTrackIndex}
        />
      )}
      {isYouTubePromptOpen && (
          <YouTubePrompt
            onClose={() => setIsYouTubePromptOpen(false)}
            onLoad={(url) => {
                onLoadYouTube(url);
                setIsYouTubePromptOpen(false);
            }}
          />
      )}
    </>
  );
};