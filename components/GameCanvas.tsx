import React, { useRef, useEffect, useCallback, useMemo } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GameState, CropPlot, Resource, Building, Pokemon } from '../types';
import { getBuildSize, isPlacementAreaClear } from '../services/game';
import { POKEMON_IDS } from '../constants';

interface GameCanvasProps {
  gameStateRef: React.MutableRefObject<GameState | null>;
  isBuildMode: boolean;
  selectedBuildType: string | null;
  buildRotation: number;
  activePlantingSeed: string | null;
  onPlaceBuilding: (x: number, y: number) => void;
  onOpenCrafting: () => void;
  onOpenBuildingInfo: (buildingId: string) => void;
  onPlantActiveSeed: (plot: CropPlot) => void;
  onStateUpdate: () => void;
  onShowNotification: (message: string) => void;
  onOpenPokemonDetail: (pokemon: Pokemon) => void;
  onCollectResource: (resourceId: string) => void;
}

// --- Day/Night Cycle Colors ---
const TIME_OF_DAY_PALETTES = {
    DEEP_NIGHT: { // Madrugada (00-04)
        ambient: new THREE.Color(0x404060),
        directional: new THREE.Color(0x6070A0),
        background: new THREE.Color(0x030810),
        fog: new THREE.Color(0x030810),
        intensity: { ambient: 0.45, directional: 0.8 }
    },
    DAWN: { // Amanhecer (04-06)
        ambient: new THREE.Color(0x8e6a8e),
        directional: new THREE.Color(0xffa07a),
        background: new THREE.Color(0x4a4a6a),
        fog: new THREE.Color(0x4a4a6a),
        intensity: { ambient: 0.5, directional: 1.5 }
    },
    MORNING: { // Manhã (06-12)
        ambient: new THREE.Color(0xffffff),
        directional: new THREE.Color(0xffffff),
        background: new THREE.Color(0x87ceeb),
        fog: new THREE.Color(0x87ceeb),
        intensity: { ambient: 0.7, directional: 2.5 }
    },
    AFTERNOON: { // Tarde (12-17)
        ambient: new THREE.Color(0xffeebb),
        directional: new THREE.Color(0xffd700),
        background: new THREE.Color(0x6495ed),
        fog: new THREE.Color(0x6495ed),
        intensity: { ambient: 0.6, directional: 2.2 }
    },
    SUNSET: { // Pôr do Sol (17-19)
        ambient: new THREE.Color(0xcc6666),
        directional: new THREE.Color(0xff6347),
        background: new THREE.Color(0x8b008b),
        fog: new THREE.Color(0x8b008b),
        intensity: { ambient: 0.8, directional: 2.8 }
    },
    DUSK: { // Anoitecer (19-20) - Blue Hour
        ambient: new THREE.Color(0x455595),
        directional: new THREE.Color(0x6070B0),
        background: new THREE.Color(0x1a2a4a),
        fog: new THREE.Color(0x1a2a4a),
        intensity: { ambient: 0.45, directional: 1.2 }
    },
    NIGHT: { // Noite (20-00)
        ambient: new THREE.Color(0x6060A0),
        directional: new THREE.Color(0x8090C0),
        background: new THREE.Color(0x0b1a2a),
        fog: new THREE.Color(0x0b1a2a),
        intensity: { ambient: 0.65, directional: 1.2 }
    }
};

const FIRE_TYPES = new Set(['Charmander', 'Charmeleon', 'Charizard', 'Growlithe', 'Arcanine', 'Torchic', 'Combusken', 'Blaziken', 'Litwick', 'Lampent', 'Chandelure']);

function getTimeOfDayInfo(gameTime: number) {
    const hours = (gameTime / 3600) % 24;

    const keyframes = [
        // Previous day for interpolation around midnight
        { hour: -4, palette: TIME_OF_DAY_PALETTES.NIGHT }, // Represents 20:00

        // Current day
        { hour: 0, palette: TIME_OF_DAY_PALETTES.DEEP_NIGHT },   // 00:00 Madrugada
        { hour: 4, palette: TIME_OF_DAY_PALETTES.DAWN },      // 04:00 Amanhecer
        { hour: 6, palette: TIME_OF_DAY_PALETTES.MORNING },    // 06:00 Manhã
        { hour: 12, palette: TIME_OF_DAY_PALETTES.AFTERNOON }, // 12:00 Tarde
        { hour: 17, palette: TIME_OF_DAY_PALETTES.SUNSET },    // 17:00 Pôr do Sol
        { hour: 19, palette: TIME_OF_DAY_PALETTES.DUSK },      // 19:00 Anoitecer
        { hour: 20, palette: TIME_OF_DAY_PALETTES.NIGHT },     // 20:00 Noite
        
        // Next day for interpolation after 20:00
        { hour: 24, palette: TIME_OF_DAY_PALETTES.DEEP_NIGHT }, // Wraps to 00:00
    ];

    let fromFrame: typeof keyframes[0] | undefined, toFrame: typeof keyframes[0] | undefined;
    for (let i = 0; i < keyframes.length - 1; i++) {
        if (hours >= keyframes[i].hour && hours < keyframes[i+1].hour) {
            fromFrame = keyframes[i];
            toFrame = keyframes[i+1];
            break;
        }
    }
     if (!fromFrame || !toFrame) {
        // Fallback for edge cases, should not happen with the new keyframe setup
        fromFrame = keyframes[2];
        toFrame = keyframes[3];
    }
    
    const frameDuration = toFrame.hour - fromFrame.hour;
    const timeIntoFrame = hours - fromFrame.hour;
    const t = frameDuration > 0 ? timeIntoFrame / frameDuration : 0;

    const sunriseHour = 6; // Manhã starts
    const sunsetHour = 19; // Anoitecer starts
    const daylightHours = sunsetHour - sunriseHour;
    
    let sunAngle = Math.PI; // Sun below horizon (night)
    if (hours > sunriseHour && hours < sunsetHour) {
        // Map hours during the day to a 0-PI range for the sun arc
        sunAngle = ((hours - sunriseHour) / daylightHours) * Math.PI;
    }

    return {
        from: fromFrame.palette,
        to: toFrame.palette,
        t,
        sunAngle
    };
}


// --- Helper Functions ---
const createTree = (type: 'oak' | 'pine' | 'apple') => {
    const group = new THREE.Group();
    if (type === 'pine') {
        const trunk = new THREE.Mesh(new THREE.CylinderGeometry(4, 6, 40), new THREE.MeshStandardMaterial({ color: 0x5a2d0c }));
        trunk.position.y = 20;
        const leaves1 = new THREE.Mesh(new THREE.ConeGeometry(25, 40), new THREE.MeshStandardMaterial({ color: 0x1a4d28 }));
        leaves1.position.y = 50;
        const leaves2 = new THREE.Mesh(new THREE.ConeGeometry(20, 35), new THREE.MeshStandardMaterial({ color: 0x226034 }));
        leaves2.position.y = 65;
        group.add(trunk, leaves1, leaves2);
    } else { // oak or apple
        const trunk = new THREE.Mesh(new THREE.CylinderGeometry(6, 8, 30), new THREE.MeshStandardMaterial({ color: 0x6b3b1b }));
        trunk.position.y = 15;
        const leaves1 = new THREE.Mesh(new THREE.SphereGeometry(25), new THREE.MeshStandardMaterial({ color: 0x2e6b2f }));
        leaves1.position.set(0, 45, 0);
        const leaves2 = new THREE.Mesh(new THREE.SphereGeometry(20), new THREE.MeshStandardMaterial({ color: 0x3a853b }));
        leaves2.position.set(20, 35, 5);
        const leaves3 = new THREE.Mesh(new THREE.SphereGeometry(22), new THREE.MeshStandardMaterial({ color: 0x255a26 }));
        leaves3.position.set(-15, 38, -5);
        group.add(trunk, leaves1, leaves2, leaves3);
        if (type === 'apple') {
            const foliageSpheres = [
                { center: leaves1.position, radius: 25 },
                { center: leaves2.position, radius: 20 },
                { center: leaves3.position, radius: 22 }
            ];

            const appleCount = 10 + Math.floor(Math.random() * 6); // 10 to 15 apples
            for(let i = 0; i < appleCount; i++) {
                const apple = new THREE.Mesh(
                    new THREE.SphereGeometry(3.5), // A bit larger
                    new THREE.MeshStandardMaterial({ color: 0xdc2626 }) // Brighter red
                );

                // Pick a random foliage sphere to attach the apple to
                const targetSphere = foliageSpheres[Math.floor(Math.random() * foliageSpheres.length)];

                // Generate a random point on the surface of the sphere
                const pointOnSphere = new THREE.Vector3(
                    Math.random() - 0.5,
                    Math.random() - 0.5,
                    Math.random() - 0.5
                ).normalize();
                
                // Scale by radius (slightly inside) and offset by the sphere's center
                pointOnSphere.multiplyScalar(targetSphere.radius * 0.9);
                pointOnSphere.add(targetSphere.center);

                apple.position.copy(pointOnSphere);
                group.add(apple);
            }
        }
    }
    group.traverse(child => {
        if (child instanceof THREE.Mesh) child.castShadow = true;
    });
    return group;
};

const createRock = () => {
    const geo = new THREE.IcosahedronGeometry(10 + Math.random() * 5, 0);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
        const displacement = Math.random() * 2;
        const vertex = new THREE.Vector3().fromBufferAttribute(pos, i);
        vertex.multiplyScalar(1 + displacement / vertex.length());
        pos.setXYZ(i, vertex.x, vertex.y, vertex.z);
    }
    const mat = new THREE.MeshStandardMaterial({ color: 0x8f8f8f, flatShading: true });
    return new THREE.Mesh(geo, mat);
};

const createWildPlant = (resource: Resource) => {
    const group = new THREE.Group();
    const bushMat = new THREE.MeshStandardMaterial({ color: 0x4CAF50 }); // Green
    const bush = new THREE.Mesh(new THREE.SphereGeometry(10, 8, 6), bushMat);
    bush.position.y = 5;
    group.add(bush);

    if (resource.state === 'flower') {
        const flowerColors = [0xFFC0CB, 0xFFFF00, 0xFFFFFF, 0xDA70D6, 0xF08080]; // Pink, Yellow, White, Orchid, LightCoral
        const randomColor = flowerColors[Math.floor(Math.random() * flowerColors.length)];
        const flowerMat = new THREE.MeshStandardMaterial({ color: randomColor });
        const flower = new THREE.Mesh(new THREE.SphereGeometry(3), flowerMat);
        flower.position.y = 15;
        group.add(flower);
    }
    group.traverse(child => {
        if (child instanceof THREE.Mesh) child.castShadow = true;
    });
    return group;
};

const createPlantMesh = (plot: CropPlot) => {
    const group = new THREE.Group();
    group.name = 'plant';

    if (plot.state === 'empty' || !plot.type) {
        return group;
    }

    const stemMat = new THREE.MeshStandardMaterial({ color: 0x556B2F });
    const foliageMat = new THREE.MeshStandardMaterial({ color: 0x228B22 });

    if (plot.state === 'growing') {
        const stemGeo = new THREE.CylinderGeometry(0.8, 1.2, 10);
        const stem = new THREE.Mesh(stemGeo, stemMat);
        stem.position.y = 5;
        const foliageGeo = new THREE.IcosahedronGeometry(4, 0);
        const foliage = new THREE.Mesh(foliageGeo, foliageMat);
        foliage.position.y = 10;
        group.add(stem, foliage);
    } else if (plot.state === 'mature') {
        const stemGeo = new THREE.CylinderGeometry(1, 1.5, 20);
        const stem = new THREE.Mesh(stemGeo, stemMat);
        stem.position.y = 10;
        const foliageGeo = new THREE.IcosahedronGeometry(8, 0);
        const foliage = new THREE.Mesh(foliageGeo, foliageMat);
        foliage.position.y = 20;
        group.add(stem, foliage);

        let cropColor = 0xffff00; // Default yellow
        if (plot.type.includes('Grao')) cropColor = 0xF5DEB3;
        if (plot.type.includes('Doce')) cropColor = 0xFF6347;
        if (plot.type.includes('Cacau')) cropColor = 0x8B4513;
        if (plot.type.includes('Cafe')) cropColor = 0x6F4E37;

        const cropGeo = new THREE.SphereGeometry(3, 8, 8);
        const cropMat = new THREE.MeshStandardMaterial({ color: cropColor });
        const crop = new THREE.Mesh(cropGeo, cropMat);
        crop.position.y = 20 + 4;
        group.add(crop);
    }

    group.traverse(c => { if (c instanceof THREE.Mesh) c.castShadow = true; });
    return group;
};

const createFertilizerEffect = () => {
    const group = new THREE.Group();
    group.name = 'fertilizer_effect';
    const particleGeo = new THREE.SphereGeometry(0.5, 4, 4);
    const particleMat = new THREE.MeshBasicMaterial({ color: 0xADFF2F });

    for (let i = 0; i < 5; i++) {
        const particle = new THREE.Mesh(particleGeo, particleMat);
        const angle = (i / 5) * Math.PI * 2;
        const radius = 10;
        particle.position.set(Math.cos(angle) * radius, 2, Math.sin(angle) * radius);
        group.add(particle);
    }
    return group;
};


const createHouse = () => {
    const group = new THREE.Group();

    // --- Paleta de Cores e Materiais (Tip #4) ---
    const foundationColor = 0xababab; // Light grey stone
    const wallColor = 0xf5eecf;       // Warm off-white
    const frameColor = 0x5a3d1a;      // Dark oak log
    const roofColor = 0x4a2a1a;       // Darker wood for roof
    const glassColor = 0xadd8e6;      // Light blue for glass

    const foundationMat = new THREE.MeshStandardMaterial({ color: foundationColor });
    const wallMat = new THREE.MeshStandardMaterial({ color: wallColor });
    const frameMat = new THREE.MeshStandardMaterial({ color: frameColor });
    const roofMat = new THREE.MeshStandardMaterial({ color: roofColor, side: THREE.DoubleSide });
    const glassMat = new THREE.MeshStandardMaterial({ color: glassColor, transparent: true, opacity: 0.4 });

    // --- Forma em L (Shape - Tip #1) ---
    const mainWidth = 100, mainDepth = 60;
    const wingWidth = 50, wingDepth = 50;
    const wallHeight = 50;
    const foundationHeight = 4;

    // --- Fundação Clara (Foundation - Tip #3) ---
    const foundationMain = new THREE.Mesh(new THREE.BoxGeometry(mainWidth + 4, foundationHeight, mainDepth + 4), foundationMat);
    foundationMain.position.y = foundationHeight / 2;
    const foundationWing = new THREE.Mesh(new THREE.BoxGeometry(wingWidth + 4, foundationHeight, wingDepth + 4), foundationMat);
    foundationWing.position.set(-mainWidth / 2 - wingWidth / 2, foundationHeight / 2, mainDepth / 2 - wingDepth / 2);
    group.add(foundationMain, foundationWing);

    // --- Estrutura Visível e Paredes Recuadas (Depth & Structure - Tip #2, #13) ---
    const createFramedWall = (width: number, height: number, depth: number) => {
        const wallGroup = new THREE.Group();
        const frameSize = 6;
        // Paredes
        const wall = new THREE.Mesh(new THREE.BoxGeometry(width - frameSize, height, depth - frameSize), wallMat);
        wallGroup.add(wall);
        // Pilares (frame vertical)
        const pillarGeo = new THREE.BoxGeometry(frameSize, height, frameSize);
        [-1, 1].forEach(i => {
            [-1, 1].forEach(j => {
                const pillar = new THREE.Mesh(pillarGeo, frameMat);
                pillar.position.set(i * (width / 2), 0, j * (depth / 2));
                wallGroup.add(pillar);
            });
        });
        // Vigas (frame horizontal)
        const beamHGeo = new THREE.BoxGeometry(width, frameSize, frameSize);
        const beamVGeo = new THREE.BoxGeometry(frameSize, frameSize, depth);
        [-1, 1].forEach(i => {
            const beamH = new THREE.Mesh(beamHGeo, frameMat);
            beamH.position.set(0, i * (height/2), 0);
            const beamV = new THREE.Mesh(beamVGeo, frameMat);
            beamV.position.set(0, i * (height/2), 0);
        });
        return wallGroup;
    };
    
    const mainWall = createFramedWall(mainWidth, wallHeight, mainDepth);
    mainWall.position.y = wallHeight / 2 + foundationHeight;
    group.add(mainWall);

    const wingWall = createFramedWall(wingWidth, wallHeight, wingDepth);
    wingWall.position.set(-mainWidth / 2 - wingWidth / 2, wallHeight / 2 + foundationHeight, mainDepth / 2 - wingDepth / 2);
    group.add(wingWall);

    // --- Varanda (Adiciona Profundidade - Tip #2) ---
    const porchDepth = 30;
    const porch = new THREE.Group();
    const porchFloor = new THREE.Mesh(new THREE.BoxGeometry(mainWidth, 2, porchDepth), frameMat);
    porchFloor.position.set(0, foundationHeight + 1, mainDepth / 2 + porchDepth / 2);
    porch.add(porchFloor);

    const pillarGeo = new THREE.CylinderGeometry(3, 3, wallHeight*0.8, 8);
    [-1, 1].forEach(i => {
        const pillar = new THREE.Mesh(pillarGeo, frameMat);
        pillar.position.set(i * (mainWidth/2 - 5), (wallHeight*0.8)/2, mainDepth/2 + porchDepth - 5);
        porch.add(pillar);
    });
    // Grades (Blocos Incompletos - Tip #10)
    const railGeo = new THREE.BoxGeometry(mainWidth, 4, 2);
    const rail = new THREE.Mesh(railGeo, frameMat);
    rail.position.set(0, 18, mainDepth/2 + porchDepth - 2);
    porch.add(rail);
    group.add(porch);
    
    // --- Telhado Dinâmico com Beirais (Roof & Overhangs - Tip #8, #9) ---
    const roofY = foundationHeight + wallHeight;
    const roofHeight = 40;
    const overhang = 8;

    // Telhado principal
    const mainRoof = new THREE.Mesh(new THREE.BufferGeometry(), roofMat);
    const mainRoofV = new Float32Array([
        -(mainWidth/2+overhang), roofY, -(mainDepth/2+overhang),  // 0
         (mainWidth/2+overhang), roofY, -(mainDepth/2+overhang),  // 1
         (mainWidth/2+overhang), roofY,  (mainDepth/2+overhang),  // 2
        -(mainWidth/2+overhang), roofY,  (mainDepth/2+overhang),  // 3
        0, roofY + roofHeight, -(mainDepth/2+overhang), // 4
        0, roofY + roofHeight,  (mainDepth/2+overhang),  // 5
    ]);
    mainRoof.geometry.setAttribute('position', new THREE.BufferAttribute(mainRoofV, 3));
    mainRoof.geometry.setIndex([0,1,4, 1,2,5, 1,5,4, 2,3,5, 3,0,4, 3,4,5]);
    mainRoof.geometry.computeVertexNormals();
    group.add(mainRoof);
    
    // Telhado da varanda
    const porchRoof = new THREE.Mesh(new THREE.BoxGeometry(mainWidth+overhang, 4, porchDepth+overhang), roofMat);
    porchRoof.position.set(0, roofY, mainDepth/2 + porchDepth/2);
    porchRoof.rotation.x = -0.4;
    group.add(porchRoof);
    
    // Telhado da ala
    const wingRoof = new THREE.Mesh(new THREE.BufferGeometry(), roofMat);
    const wingCenterX = -mainWidth/2 - wingWidth/2;
    const wingCenterZ = mainDepth/2 - wingDepth/2;
    const wingRoofV = new Float32Array([
        wingCenterX-(wingWidth/2+overhang), roofY, wingCenterZ-(wingDepth/2+overhang),
        wingCenterX+(wingWidth/2+overhang), roofY, wingCenterZ-(wingDepth/2+overhang),
        wingCenterX+(wingWidth/2+overhang), roofY, wingCenterZ+(wingDepth/2+overhang),
        wingCenterX-(wingWidth/2+overhang), roofY, wingCenterZ+(wingDepth/2+overhang),
        wingCenterX-(wingWidth/2+overhang), roofY+roofHeight, wingCenterZ,
        wingCenterX+(wingWidth/2+overhang), roofY+roofHeight, wingCenterZ,
    ]);
    wingRoof.geometry.setAttribute('position', new THREE.BufferAttribute(wingRoofV, 3));
    wingRoof.geometry.setIndex([0,1,5, 0,5,4, 1,2,5, 2,3,4, 2,4,5, 3,0,4]);
    wingRoof.geometry.computeVertexNormals();
    group.add(wingRoof);
    
    // --- Água-furtada / Dormer (Telhado Dinâmico - Tip #8) ---
    const dormer = new THREE.Group();
    dormer.position.set(25, roofY + 15, -mainDepth/2 - 5);
    const dormerWall = new THREE.Mesh(new THREE.BoxGeometry(20, 15, 1), wallMat);
    dormer.add(dormerWall);
    const dormerRoof = new THREE.Mesh(new THREE.BoxGeometry(24, 2, 15), roofMat);
    dormerRoof.position.y = 7.5; dormerRoof.rotation.x = -0.7;
    dormer.add(dormerRoof);
    group.add(dormer);

    // --- Janelas e Portas com Moldura (Framing - Tip #7) ---
    const createWindow = (w: number, h: number) => {
        const windowGroup = new THREE.Group();
        const frameSize = 2;
        // Vidro
        const glass = new THREE.Mesh(new THREE.BoxGeometry(w, h, 1), glassMat);
        windowGroup.add(glass);
        // Moldura
        const frameTop = new THREE.Mesh(new THREE.BoxGeometry(w + frameSize, frameSize, 2), frameMat);
        frameTop.position.y = h/2;
        const frameBottom = frameTop.clone(); frameBottom.position.y = -h/2;
        const frameLeft = new THREE.Mesh(new THREE.BoxGeometry(frameSize, h, 2), frameMat);
        frameLeft.position.x = -w/2;
        const frameRight = frameLeft.clone(); frameRight.position.x = w/2;
        windowGroup.add(frameTop, frameBottom, frameLeft, frameRight);
        return windowGroup;
    };
    const win1 = createWindow(20, 25);
    win1.position.set(-35, foundationHeight + wallHeight/2, mainDepth/2 + 3.1);
    group.add(win1);

    const win2 = createWindow(20,25);
    win2.position.set(wingCenterX, foundationHeight + wallHeight/2, wingCenterZ + wingDepth/2 + 3.1);
    group.add(win2);
    
    // Porta
    const door = new THREE.Mesh(new THREE.BoxGeometry(20, 40, 2), frameMat);
    door.position.set(0, foundationHeight + 20, mainDepth / 2 + 3.1);
    group.add(door);

    // --- Chaminé e Detalhes (Greebling - Tip #11) ---
    const chimney = new THREE.Mesh(new THREE.BoxGeometry(15, 60, 15), foundationMat);
    chimney.position.set(mainWidth/2 - 15, roofY + 10, -10);
    group.add(chimney);

    // --- Luzes ---
    const internalLight = new THREE.PointLight(0xfff0c1, 0, 150, 2);
    internalLight.position.set(0, 30, 0);
    internalLight.name = "building_light";
    group.add(internalLight);

    const lantern = new THREE.PointLight(0xffd6a1, 0, 100);
    lantern.position.set(0, wallHeight * 0.7, mainDepth/2 + porchDepth/2);
    lantern.name = "building_light_flicker";
    lantern.castShadow = true;
    group.add(lantern);

    group.traverse(child => {
        if (child instanceof THREE.Mesh) {
            child.castShadow = true;
            child.receiveShadow = true;
        }
    });

    return group;
};


const createFarmArea = (width: number, height: number) => {
    const group = new THREE.Group();
    const postMat = new THREE.MeshStandardMaterial({ color: 0x6b4f3a });
    const railMat = new THREE.MeshStandardMaterial({ color: 0x8b5e3c });
    const postGeo = new THREE.CylinderGeometry(2, 2, 15);
    
    const postPositions = [
        {x: -width/2, z: -height/2}, {x: width/2, z: -height/2}, 
        {x: -width/2, z: height/2}, {x: width/2, z: height/2}
    ];

    postPositions.forEach(pos => {
        const post = new THREE.Mesh(postGeo, postMat);
        post.position.set(pos.x, 7.5, pos.z);
        group.add(post);
    });

    const railGeoH = new THREE.BoxGeometry(width, 3, 3);
    const rail1 = new THREE.Mesh(railGeoH, railMat);
    rail1.position.set(0, 10, -height/2);
    const rail2 = new THREE.Mesh(railGeoH, railMat);
    rail2.position.set(0, 10, height/2);
    group.add(rail1, rail2);

    const railGeoV = new THREE.BoxGeometry(3, 3, height);
    const rail3 = new THREE.Mesh(railGeoV, railMat);
    rail3.position.set(-width/2, 10, 0);
    const rail4 = new THREE.Mesh(railGeoV, railMat);
    rail4.position.set(width/2, 10, 0);
    group.add(rail3, rail4);

    group.traverse(child => {
        if (child instanceof THREE.Mesh) child.castShadow = true;
    });
    return group;
}

const createStable = (width: number, height: number) => {
    const group = new THREE.Group();

    // Minecraft-style materials
    const logMat = new THREE.MeshStandardMaterial({ color: 0x5a2d0c }); // Spruce Log color
    const plankMat = new THREE.MeshStandardMaterial({ color: 0x8b5e3c }); // Oak Planks color
    const cobblestoneMat = new THREE.MeshStandardMaterial({ color: 0x8f8f8f }); // Cobblestone color
    const roofMat = new THREE.MeshStandardMaterial({ color: 0x6b3b1b }); // Dark Oak color
    const hayMat = new THREE.MeshStandardMaterial({ color: 0xD2B48C }); // Hay Bale color
    const waterMat = new THREE.MeshStandardMaterial({ color: 0x4682B4, transparent: true, opacity: 0.8 });

    const buildingDepth = height;
    const buildingWidth = width * 0.7; // 70% for the enclosed building
    const paddockWidth = width * 0.3; // 30% for the open paddock

    const buildingX = -width / 2 + buildingWidth / 2;
    const paddockX = width / 2 - paddockWidth / 2;

    // --- 1. Foundation (Cobblestone) ---
    const foundation = new THREE.Mesh(new THREE.BoxGeometry(buildingWidth, 4, buildingDepth), cobblestoneMat);
    foundation.position.set(buildingX, 2, 0);
    group.add(foundation);

    // --- 2. Building Frame (Logs) ---
    const logHeight = 40;
    const logSize = 6;
    const logGeo = new THREE.BoxGeometry(logSize, logHeight, logSize);
    const cornerPositions = [
        { x: -buildingWidth / 2 + logSize / 2, z: -buildingDepth / 2 + logSize / 2 },
        { x: buildingWidth / 2 - logSize / 2, z: -buildingDepth / 2 + logSize / 2 },
        { x: -buildingWidth / 2 + logSize / 2, z: buildingDepth / 2 - logSize / 2 },
        { x: buildingWidth / 2 - logSize / 2, z: buildingDepth / 2 - logSize / 2 },
    ];
    cornerPositions.forEach(pos => {
        const log = new THREE.Mesh(logGeo, logMat);
        log.position.set(buildingX + pos.x, logHeight / 2 + 4, pos.z);
        group.add(log);
    });
    
    // --- 3. Walls (Planks) ---
    const wallHeight = logHeight;
    const backWall = new THREE.Mesh(new THREE.BoxGeometry(buildingWidth - logSize, wallHeight, 2), plankMat);
    backWall.position.set(buildingX, wallHeight / 2 + 4, -buildingDepth / 2);
    const leftWall = new THREE.Mesh(new THREE.BoxGeometry(2, wallHeight, buildingDepth - logSize), plankMat);
    leftWall.position.set(buildingX - buildingWidth / 2, wallHeight / 2 + 4, 0);
    group.add(backWall, leftWall);

    // Front Wall (with large opening) & Right Wall (connecting to paddock)
    const frontWallPart = new THREE.Mesh(new THREE.BoxGeometry(buildingWidth - logSize, wallHeight / 2, 2), plankMat);
    frontWallPart.position.set(buildingX, wallHeight * 0.75 + 4, buildingDepth / 2);
    const rightWallPart = new THREE.Mesh(new THREE.BoxGeometry(2, wallHeight / 2, buildingDepth - logSize), plankMat);
    rightWallPart.position.set(buildingX + buildingWidth / 2, wallHeight * 0.75 + 4, 0);
    group.add(frontWallPart, rightWallPart);


    // --- 4. A-Frame Roof ---
    const roofBaseY = 4 + logHeight;
    const roofPeakY = roofBaseY + 25;
    
    // Create the sloped roof panels
    const roofRun = buildingWidth / 2;
    const roofRise = roofPeakY - roofBaseY;
    const roofAngle = Math.atan(roofRise / roofRun);
    const roofPanelLength = Math.hypot(roofRun, roofRise);
    const roofPanelDepth = buildingDepth + 8; // Overhang
    
    const roofPanelGeo = new THREE.BoxGeometry(roofPanelLength, 2, roofPanelDepth);

    const leftRoof = new THREE.Mesh(roofPanelGeo, roofMat);
    leftRoof.position.set(buildingX - roofRun / 2, roofBaseY + roofRise / 2, 0);
    leftRoof.rotation.z = roofAngle;
    
    const rightRoof = new THREE.Mesh(roofPanelGeo, roofMat);
    rightRoof.position.set(buildingX + roofRun / 2, roofBaseY + roofRise / 2, 0);
    rightRoof.rotation.z = -roofAngle;
    group.add(leftRoof, rightRoof);


    // --- 5. Paddock ---
    const paddockGroup = new THREE.Group();
    paddockGroup.position.x = paddockX;
    const postGeo = new THREE.BoxGeometry(4, 15, 4);
    const railHGeo = new THREE.BoxGeometry(paddockWidth, 3, 2);
    const railVGeo = new THREE.BoxGeometry(2, 3, height);
    
    const fenceY = 15/2;
    const railY = 12;

    const posts = [
        new THREE.Vector3(-paddockWidth/2, fenceY, -height/2),
        new THREE.Vector3(paddockWidth/2, fenceY, -height/2),
        new THREE.Vector3(paddockWidth/2, fenceY, height/2),
        new THREE.Vector3(-paddockWidth/2, fenceY, height/2),
    ];
    posts.forEach(pos => {
        const post = new THREE.Mesh(postGeo, logMat);
        post.position.copy(pos);
        paddockGroup.add(post);
    });
    
    const railH1 = new THREE.Mesh(railHGeo, plankMat); railH1.position.set(0, railY, -height/2);
    const railH2 = railH1.clone(); railH2.position.set(0, railY, height/2);
    const railV1 = new THREE.Mesh(railVGeo, plankMat); railV1.position.set(paddockWidth/2, railY, 0);
    paddockGroup.add(railH1, railH2, railV1);
    group.add(paddockGroup);


    // --- 6. Interior & Details ---
    const hayGeo = new THREE.BoxGeometry(15, 15, 20);
    const hay1 = new THREE.Mesh(hayGeo, hayMat);
    hay1.position.set(buildingX - buildingWidth/4, 4 + 15/2, -buildingDepth/4);
    const hay2 = hay1.clone();
    hay2.position.set(buildingX + buildingWidth/4, 4 + 15/2, -buildingDepth/4);
    group.add(hay1, hay2);
    
    const trough = new THREE.Mesh(new THREE.BoxGeometry(30, 10, 12), cobblestoneMat);
    trough.position.set(paddockX, 5, height/2 - 10);
    const water = new THREE.Mesh(new THREE.BoxGeometry(28, 4, 10), waterMat);
    water.position.set(paddockX, 7, height/2 - 10); // Centered in the top part of the trough
    group.add(trough, water);

    // --- 7. Light source ---
    const light = new THREE.PointLight(0xffd6a1, 0, 150);
    light.position.set(buildingX, 30, 0);
    light.castShadow = true;
    light.name = "building_light_flicker"; // Use flicker for a cozy feel
    group.add(light);
    
    group.traverse(c => { c.castShadow = true; c.receiveShadow = true; });
    return group;
};

const createCoop = (width: number, height: number) => {
    const group = new THREE.Group();
    // Minecraft-inspired materials
    const plankMat = new THREE.MeshStandardMaterial({ color: 0xaf8f69 }); // Oak planks
    const logMat = new THREE.MeshStandardMaterial({ color: 0x5a2d0c }); // Spruce logs
    const roofMat = new THREE.MeshStandardMaterial({ color: 0x8f8f8f }); // Cobblestone stairs -> flat grey
    const fenceMat = new THREE.MeshStandardMaterial({ color: 0x8b5e3c }); // Spruce fence

    // Layout: House on the left, yard on the right
    const houseWidth = width * 0.4;
    const yardWidth = width * 0.6;
    const houseDepth = height;
    
    const houseX = -width / 2 + houseWidth / 2;
    const yardX = width / 2 - yardWidth / 2;

    // --- 1. The Coop House ---
    const houseGroup = new THREE.Group();
    houseGroup.position.x = houseX;
    
    // Log frame
    const logHeight = 25;
    const logGeo = new THREE.BoxGeometry(4, logHeight, 4);
    const logPositions = [
        {x: -houseWidth/2+2, z: -houseDepth/2+2}, {x: houseWidth/2-2, z: -houseDepth/2+2},
        {x: -houseWidth/2+2, z: houseDepth/2-2}, {x: houseWidth/2-2, z: houseDepth/2-2}
    ];
    logPositions.forEach(pos => {
        const log = new THREE.Mesh(logGeo, logMat);
        log.position.set(pos.x, logHeight / 2, pos.z);
        houseGroup.add(log);
    });

    // Plank Walls
    const backWall = new THREE.Mesh(new THREE.BoxGeometry(houseWidth-4, logHeight, 2), plankMat);
    backWall.position.set(0, logHeight/2, -houseDepth/2);
    const leftWall = new THREE.Mesh(new THREE.BoxGeometry(2, logHeight, houseDepth-4), plankMat);
    leftWall.position.set(-houseWidth/2, logHeight/2, 0);
    
    // Front wall with window
    const frontWallBottom = new THREE.Mesh(new THREE.BoxGeometry(houseWidth-4, logHeight * 0.4, 2), plankMat);
    frontWallBottom.position.set(0, logHeight*0.2, houseDepth/2);
    const frontWallTop = new THREE.Mesh(new THREE.BoxGeometry(houseWidth-4, logHeight * 0.4, 2), plankMat);
    frontWallTop.position.set(0, logHeight*0.8, houseDepth/2);
    const frontWallSide = new THREE.Mesh(new THREE.BoxGeometry(houseWidth*0.2, logHeight*0.2, 2), plankMat);
    frontWallSide.position.set(0, logHeight*0.5, houseDepth/2); // Middle bar for window
    
    houseGroup.add(backWall, leftWall, frontWallBottom, frontWallTop, frontWallSide);

    // Roof (simple flat slabs)
    const roof = new THREE.Mesh(new THREE.BoxGeometry(houseWidth, 2, houseDepth), roofMat);
    roof.position.set(0, logHeight, 0);
    houseGroup.add(roof);

    // Light
    const light = new THREE.PointLight(0xffd6a1, 0, 80);
    light.position.y = logHeight - 5;
    light.name = "building_light";
    houseGroup.add(light);
    
    group.add(houseGroup);

    // --- 2. The Yard ---
    const yardGroup = new THREE.Group();
    yardGroup.position.x = yardX;
    
    const fenceHeight = 12;
    const postGeo = new THREE.BoxGeometry(3, fenceHeight, 3);
    const railHGeo = new THREE.BoxGeometry(yardWidth, 2, 2);
    const railVGeo = new THREE.BoxGeometry(2, 2, height);
    
    // Posts
    const yardPosts = [
        {x: -yardWidth/2, z: -height/2}, {x: yardWidth/2, z: -height/2},
        {x: yardWidth/2, z: height/2}, {x: -yardWidth/2, z: height/2}
    ];
    yardPosts.forEach(pos => {
        const post = new THREE.Mesh(postGeo, fenceMat);
        post.position.set(pos.x, fenceHeight/2, pos.z);
        yardGroup.add(post);
    });
    
    // Rails (Top and Bottom)
    const railYTop = fenceHeight * 0.8;
    const railYBottom = fenceHeight * 0.4;
    
    const railBackTop = new THREE.Mesh(railHGeo, fenceMat);
    railBackTop.position.set(0, railYTop, -height/2);
    const railBackBottom = railBackTop.clone();
    railBackBottom.position.y = railYBottom;
    
    const frontRailTop = railBackTop.clone();
    frontRailTop.position.z = height/2;
    const frontRailBottom = frontRailTop.clone();
    frontRailBottom.position.y = railYBottom;

    const railRightTop = new THREE.Mesh(railVGeo, fenceMat);
    railRightTop.position.set(yardWidth/2, railYTop, 0);
    const railRightBottom = railRightTop.clone();
    railRightBottom.position.y = railYBottom;

    yardGroup.add(railBackTop, railBackBottom, frontRailTop, frontRailBottom, railRightTop, railRightBottom);
    
    // Gate on the front
    const gateGeo = new THREE.BoxGeometry(15, fenceHeight, 2);
    const gate = new THREE.Mesh(gateGeo, fenceMat);
    gate.position.set(0, fenceHeight/2, height/2);
    // Remove the part of the front rail where the gate is
    yardGroup.remove(frontRailTop, frontRailBottom);
    const frontRailLeftTop = new THREE.Mesh(new THREE.BoxGeometry(yardWidth/2 - 7.5, 2, 2), fenceMat);
    frontRailLeftTop.position.set(-(yardWidth/2 + 7.5)/2, railYTop, height/2);
    const frontRailLeftBottom = frontRailLeftTop.clone(); frontRailLeftBottom.position.y = railYBottom;
    const frontRailRightTop = frontRailLeftTop.clone();
    frontRailRightTop.position.x = (yardWidth/2 + 7.5)/2;
    const frontRailRightBottom = frontRailRightTop.clone(); frontRailRightBottom.position.y = railYBottom;
    yardGroup.add(gate, frontRailLeftTop, frontRailLeftBottom, frontRailRightTop, frontRailRightBottom);
    
    // --- 3. Details in Yard ---
    const feederMat = new THREE.MeshStandardMaterial({ color: 0x7d6a58 });
    const waterMat = new THREE.MeshStandardMaterial({ color: 0xADD8E6 });
    const feeder = new THREE.Mesh(new THREE.CylinderGeometry(8, 8, 4), feederMat);
    feeder.position.set(yardWidth/2 - 20, 2, height/2 - 20);
    yardGroup.add(feeder);

    const water = new THREE.Mesh(new THREE.CylinderGeometry(6, 6, 3), waterMat);
    water.position.set(yardWidth/2 - 20, 1.5, -height/2 + 20);
    yardGroup.add(water);
    
    group.add(yardGroup);
    
    group.traverse(c => { c.castShadow = true; c.receiveShadow = true; });
    return group;
};


const createMineEntrance = (width: number, height: number) => {
    const group = new THREE.Group();
    const woodMat = new THREE.MeshStandardMaterial({ color: 0x5a2d0c });
    const darkWoodMat = new THREE.MeshStandardMaterial({ color: 0x3d281a });
    const metalMat = new THREE.MeshStandardMaterial({ color: 0x444444 });
    const holeMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a });

    // 1. The Entrance Hole
    const hole = new THREE.Mesh(new THREE.BoxGeometry(50, 10, 30), holeMat);
    hole.position.set(0, -5, -10); // Recessed into the ground
    group.add(hole);

    // 2. Wooden Frame
    const beamV1 = new THREE.Mesh(new THREE.BoxGeometry(10, 60, 10), woodMat);
    beamV1.position.set(-30, 30, 5);
    beamV1.rotation.z = -0.1;
    const beamV2 = beamV1.clone();
    beamV2.position.x = 30;
    beamV2.rotation.z = 0.1;
    const beamH = new THREE.Mesh(new THREE.BoxGeometry(70, 10, 10), woodMat);
    beamH.position.set(0, 60, 5);
    group.add(beamV1, beamV2, beamH);

    // 3. Roof
    const roof = new THREE.Mesh(new THREE.BoxGeometry(80, 5, 40), darkWoodMat);
    roof.position.set(0, 65, -10);
    roof.rotation.x = 0.3;
    group.add(roof);
    
    // 4. Minecart Tracks
    const railGeo = new THREE.BoxGeometry(4, 2, 70);
    const rail1 = new THREE.Mesh(railGeo, metalMat);
    rail1.position.set(-15, 1, 15);
    const rail2 = rail1.clone();
    rail2.position.x = 15;
    group.add(rail1, rail2);
    
    const tieGeo = new THREE.BoxGeometry(40, 2, 4);
    for(let i = 0; i < 5; i++) {
        const tie = new THREE.Mesh(tieGeo, woodMat);
        tie.position.set(0, 0.5, i * 15 - 10);
        group.add(tie);
    }
    
    // 5. Details: Workbench and Barrels
    const bench = new THREE.Mesh(new THREE.BoxGeometry(25, 15, 15), woodMat);
    bench.position.set(-50, 7.5, 0);
    group.add(bench);
    
    const barrelGeo = new THREE.CylinderGeometry(8, 8, 20, 12);
    const barrel1 = new THREE.Mesh(barrelGeo, woodMat);
    barrel1.position.set(50, 10, 0);
    const barrel2 = barrel1.clone();
    barrel2.position.set(45, 10, 18);
    group.add(barrel1, barrel2);

    // 6. Lantern Light
    const light = new THREE.PointLight(0xffa500, 0, 120);
    light.position.set(0, 50, 15); // Hanging from the top beam
    light.name = "building_light_flicker";
    group.add(light);

    group.traverse(c => { c.castShadow = true; c.receiveShadow = true; });
    return group;
};

const createZenLake = (width: number, height: number) => {
    const group = new THREE.Group();
    const waterMat = new THREE.MeshStandardMaterial({ color: 0x4682B4, transparent: true, opacity: 0.7 });
    const stoneMat = new THREE.MeshStandardMaterial({ color: 0x4e4e4e });
    const woodMat = new THREE.MeshStandardMaterial({ color: 0xb92121 }); // Red bridge/torii

    const water = new THREE.Mesh(new THREE.CylinderGeometry(width/2, height/2, 2, 32), waterMat);
    water.position.y = 1;
    water.receiveShadow = true;
    group.add(water);

    for(let i=0; i<30; i++) {
        const angle = Math.random() * Math.PI * 2;
        const radius = width/2 + (Math.random() - 0.5) * 10;
        const stone = new THREE.Mesh(new THREE.IcosahedronGeometry(5 + Math.random() * 5), stoneMat);
        stone.position.set(Math.cos(angle) * radius, 3, Math.sin(angle) * radius);
        stone.castShadow = true;
        group.add(stone);
    }
    
    const lanternBase = new THREE.Mesh(new THREE.CylinderGeometry(4, 6, 15), stoneMat);
    lanternBase.position.set(width/2 - 10, 7.5, 0);
    const lanternTop = new THREE.Mesh(new THREE.CylinderGeometry(8, 2, 5), stoneMat);
    lanternTop.position.set(width/2 - 10, 17.5, 0);
    const light = new THREE.PointLight(0xffffff, 0, 80);
    light.position.set(width/2 - 10, 20, 0);
    light.name = "building_light";
    group.add(lanternBase, lanternTop, light);
    
    group.traverse(c => { c.castShadow = true; });
    return group;
};

const createCampfire = (width: number, height: number) => {
    const group = new THREE.Group();
    const stoneMat = new THREE.MeshStandardMaterial({ color: 0x3e3e3e });
    const woodMat = new THREE.MeshStandardMaterial({ color: 0x6b3b1b });

    for(let i=0; i<12; i++) {
        const angle = (i/12) * Math.PI * 2;
        const stone = new THREE.Mesh(new THREE.IcosahedronGeometry(8), stoneMat);
        stone.position.set(Math.cos(angle) * width/2.5, 4, Math.sin(angle) * height/2.5);
        group.add(stone);
    }

    const log1 = new THREE.Mesh(new THREE.CylinderGeometry(4, 4, 25), woodMat);
    log1.rotateZ(Math.PI / 4);
    const log2 = log1.clone();
    log2.rotateY(Math.PI / 2);
    group.add(log1, log2);
    
    const light = new THREE.PointLight(0xffa500, 0, 300);
    light.position.y = 25;
    light.castShadow = true;
    light.name = "building_light_flicker";
    group.add(light);
    
    group.traverse(c => { c.castShadow = true; });
    return group;
};

const createPokemonGym = (width: number, height: number) => {
    const group = new THREE.Group();
    const wallMat = new THREE.MeshStandardMaterial({ color: 0xf1e4d3 }); // Creamy wall
    const roofMat = new THREE.MeshStandardMaterial({ color: 0x333333, side: THREE.DoubleSide }); // Dark tile roof
    const stoneMat = new THREE.MeshStandardMaterial({ color: 0x6c757d }); // Grey stone
    const bambooMat = new THREE.MeshStandardMaterial({ color: 0x3d994e }); // Bamboo green

    const buildingWidth = width * 0.7;
    const buildingHeight = height * 0.7;
    const gardenDepth = height * 0.3;

    const buildingZ = -height / 2 + buildingHeight / 2;

    // --- 1. The Dojo Building ---
    const dojoGroup = new THREE.Group();
    dojoGroup.position.z = buildingZ;

    // Stone Foundation
    const foundation = new THREE.Mesh(new THREE.BoxGeometry(buildingWidth, 8, buildingHeight), stoneMat);
    foundation.position.y = 4;
    dojoGroup.add(foundation);

    // Main Walls
    const walls = new THREE.Mesh(new THREE.BoxGeometry(buildingWidth, 50, buildingHeight), wallMat);
    walls.position.y = 33; // 8 (base) + 25 (half height)
    dojoGroup.add(walls);

    // Roof Structure
    const roofHeightVal = 20;
    const roofOverhang = 15;
    const roofBaseWidth = buildingWidth + roofOverhang;
    const roofBaseHeight = buildingHeight + roofOverhang;
    const roofGeo = new THREE.BufferGeometry();
    const vertices = new Float32Array([
        -roofBaseWidth/2, 58, -roofBaseHeight/2,
         roofBaseWidth/2, 58, -roofBaseHeight/2,
         roofBaseWidth/2, 58,  roofBaseHeight/2,
        -roofBaseWidth/2, 58,  roofBaseHeight/2,
        -buildingWidth/2, 58 + roofHeightVal, -buildingHeight/2,
         buildingWidth/2, 58 + roofHeightVal, -buildingHeight/2,
         buildingWidth/2, 58 + roofHeightVal,  buildingHeight/2,
        -buildingWidth/2, 58 + roofHeightVal,  buildingHeight/2,
    ]);
    const indices = [0,1,5, 0,5,4, 1,2,6, 1,6,5, 2,3,7, 2,7,6, 3,0,4, 3,4,7, 4,5,6, 4,6,7];
    roofGeo.setIndex(indices);
    roofGeo.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
    roofGeo.computeVertexNormals();
    const mainRoof = new THREE.Mesh(roofGeo, roofMat);
    dojoGroup.add(mainRoof);

    // Second roof tier
    const topRoofWidth = buildingWidth * 0.6;
    const topRoofHeight = buildingHeight * 0.6;
    const topRoofGeo = new THREE.BufferGeometry();
    const topV = new Float32Array([
        -(topRoofWidth/2 + 10), 58 + roofHeightVal, -(topRoofHeight/2 + 10),
         (topRoofWidth/2 + 10), 58 + roofHeightVal, -(topRoofHeight/2 + 10),
         (topRoofWidth/2 + 10), 58 + roofHeightVal,  (topRoofHeight/2 + 10),
        -(topRoofWidth/2 + 10), 58 + roofHeightVal,  (topRoofHeight/2 + 10),
        -topRoofWidth/2, 58 + roofHeightVal + 15, -topRoofHeight/2,
         topRoofWidth/2, 58 + roofHeightVal + 15, -topRoofHeight/2,
         topRoofWidth/2, 58 + roofHeightVal + 15,  topRoofHeight/2,
        -topRoofWidth/2, 58 + roofHeightVal + 15,  topRoofHeight/2,
    ]);
    topRoofGeo.setIndex(indices);
    topRoofGeo.setAttribute('position', new THREE.BufferAttribute(topV, 3));
    topRoofGeo.computeVertexNormals();
    const topRoof = new THREE.Mesh(topRoofGeo, roofMat);
    dojoGroup.add(topRoof);

    // Shoji Door (front)
    const doorGroup = new THREE.Group();
    doorGroup.position.set(0, 28, buildingHeight / 2 + 1);
    const doorFrameMat = new THREE.MeshStandardMaterial({ color: 0x3d281a });
    const doorPaperMat = new THREE.MeshStandardMaterial({ color: 0xe6d4b8 });
    for (let i = -1; i <= 1; i += 2) {
        const panel = new THREE.Group();
        panel.position.x = (i * 15) / 2;
        const mainPanel = new THREE.Mesh(new THREE.BoxGeometry(15, 40, 1), doorPaperMat);
        panel.add(mainPanel);
        const hFrame = new THREE.Mesh(new THREE.BoxGeometry(15, 1, 1.2), doorFrameMat);
        hFrame.position.y = 19.5;
        const hFrame2 = hFrame.clone(); hFrame2.position.y = -19.5;
        const vFrame = new THREE.Mesh(new THREE.BoxGeometry(1, 40, 1.2), doorFrameMat);
        vFrame.position.x = 7;
        const vFrame2 = vFrame.clone(); vFrame2.position.x = -7;
        panel.add(hFrame, hFrame2, vFrame, vFrame2);
        doorGroup.add(panel);
    }
    dojoGroup.add(doorGroup);

    // Windows with frames
    const createWindow = (x: number, y: number, z: number) => {
        const windowGroup = new THREE.Group();
        windowGroup.position.set(x, y, z);
        const glass = new THREE.Mesh(new THREE.PlaneGeometry(25, 25), new THREE.MeshBasicMaterial({ color: 0x111111, transparent: true, opacity: 0.8 }));
        windowGroup.add(glass);
        const frameMat = new THREE.MeshStandardMaterial({ color: 0x3d281a });
        const horiz = new THREE.Mesh(new THREE.BoxGeometry(27, 2, 2), frameMat);
        horiz.position.y = 12.5;
        const horiz2 = horiz.clone(); horiz2.position.y = -12.5;
        const vert = new THREE.Mesh(new THREE.BoxGeometry(2, 27, 2), frameMat);
        vert.position.x = 12.5;
        const vert2 = vert.clone(); vert2.position.x = -12.5;
        const lattice1 = new THREE.Mesh(new THREE.BoxGeometry(27, 0.5, 0.5), frameMat);
        const lattice2 = new THREE.Mesh(new THREE.BoxGeometry(0.5, 27, 0.5), frameMat);
        windowGroup.add(horiz, horiz2, vert, vert2, lattice1, lattice2);
        return windowGroup;
    };
    const window1 = createWindow(-buildingWidth / 3, 35, buildingHeight / 2 + 0.1);
    const window2 = createWindow(buildingWidth / 3, 35, buildingHeight / 2 + 0.1);
    dojoGroup.add(window1, window2);

    group.add(dojoGroup);

    // --- 2. The Garden ---
    const gardenGroup = new THREE.Group();
    const gardenZ = height / 2 - gardenDepth / 2;
    gardenGroup.position.z = gardenZ;
    
    // Bamboo Grove
    const createBamboo = (h: number) => {
        const stalk = new THREE.Mesh(new THREE.CylinderGeometry(2, 2, h, 8), bambooMat);
        stalk.position.y = h / 2;
        return stalk;
    };
    const groveX = -width / 2 + 30;
    for(let i=0; i<8; i++) {
        const bamboo = createBamboo(40 + Math.random() * 20);
        bamboo.position.x = groveX + (Math.random() - 0.5) * 20;
        bamboo.position.z = (Math.random() - 0.5) * gardenDepth;
        gardenGroup.add(bamboo);
    }
    
    // Stone Lantern
    const lanternGroup = new THREE.Group();
    const lanternBase = new THREE.Mesh(new THREE.CylinderGeometry(5, 7, 15), stoneMat);
    lanternBase.position.y = 7.5;
    const lanternTop = new THREE.Mesh(new THREE.CylinderGeometry(10, 3, 6), stoneMat);
    lanternTop.position.y = 18;
    const light = new THREE.PointLight(0xffd6a1, 0, 150);
    light.position.y = 20;
    light.name = "building_light_flicker";
    lanternGroup.add(lanternBase, lanternTop, light);
    lanternGroup.position.set(width / 2 - 40, 0, 0);
    gardenGroup.add(lanternGroup);

    // Rocks
    for (let i = 0; i < 3; i++) {
        const rock = createRock();
        rock.scale.set(0.3, 0.3, 0.3);
        (rock.material as THREE.MeshStandardMaterial).color.setHex(0x5c625a);
        rock.position.set( (Math.random() - 0.5) * (width * 0.8), 5, (Math.random() - 0.5) * (gardenDepth * 0.8) );
        gardenGroup.add(rock);
    }

    group.add(gardenGroup);

    group.traverse(c => { c.castShadow = true; c.receiveShadow = true; });
    return group;
};

const createLaboratory = () => {
    const group = new THREE.Group();

    // Modern Material Palette
    const whiteMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8 });
    const darkMat = new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.5 });
    const glassMat = new THREE.MeshStandardMaterial({ color: 0x87ceeb, transparent: true, opacity: 0.4, roughness: 0.1 });
    const accentMat = new THREE.MeshStandardMaterial({ color: 0x00ffff, emissive: 0x00ffff, emissiveIntensity: 2 });

    // --- 1. Main Rectangular Block (with depth) ---
    const mainWidth = 120, mainHeight = 50, mainDepth = 80;
    const frameSize = 4;
    
    // Outer Frame
    const frame = new THREE.Mesh(new THREE.BoxGeometry(mainWidth, mainHeight, mainDepth), darkMat);
    frame.position.y = mainHeight / 2;
    group.add(frame);

    // Inner Walls (recessed for depth & to prevent z-fighting)
    const innerWall = new THREE.Mesh(new THREE.BoxGeometry(mainWidth - frameSize, mainHeight - 0.1, mainDepth - frameSize), whiteMat);
    innerWall.position.y = mainHeight / 2;
    group.add(innerWall);

    // --- 2. Central Glass Tower (Shape variation) ---
    const towerRadius = 40;
    const towerHeight = 70;
    const glassTower = new THREE.Mesh(new THREE.CylinderGeometry(towerRadius, towerRadius, towerHeight, 32), glassMat);
    glassTower.position.y = towerHeight / 2;
    group.add(glassTower);
    
    // Tower roof and floor
    const towerRoof = new THREE.Mesh(new THREE.CylinderGeometry(towerRadius, towerRadius, 2, 32), darkMat);
    towerRoof.position.y = towerHeight;
    const towerFloor = new THREE.Mesh(new THREE.CylinderGeometry(towerRadius, towerRadius, 2, 32), darkMat);
    towerFloor.position.y = 1;
    group.add(towerRoof, towerFloor);

    // --- 3. Roof Details (Greebling) ---
    const roofVent = new THREE.Mesh(new THREE.BoxGeometry(30, 8, 20), darkMat);
    roofVent.position.set(-40, mainHeight, 0);
    group.add(roofVent);
    
    // Antenna
    const antennaBase = new THREE.Mesh(new THREE.CylinderGeometry(2, 4, 15), darkMat);
    antennaBase.position.set(45, mainHeight + 7.5, 20);
    const antennaPole = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 30), whiteMat);
    antennaPole.position.set(45, mainHeight + 15 + 15, 20);
    const antennaTip = new THREE.Mesh(new THREE.SphereGeometry(2), accentMat);
    antennaTip.position.set(45, mainHeight + 15 + 30, 20);
    group.add(antennaBase, antennaPole, antennaTip);

    // --- 4. Entrance and Windows (Framing) ---
    const entrance = new THREE.Mesh(new THREE.BoxGeometry(20, 35, frameSize + 1), darkMat);
    entrance.position.set(0, 35/2, mainDepth/2);
    group.add(entrance);
    
    const longWindow = new THREE.Mesh(new THREE.BoxGeometry(mainWidth - frameSize, 15, 1), glassMat);
    longWindow.position.set(0, mainHeight * 0.6, -mainDepth/2);
    group.add(longWindow);


    // --- 5. Lighting ---
    const internalLight = new THREE.PointLight(0x00ffff, 0, 200, 2); // Cyan light
    internalLight.position.y = towerHeight / 2;
    internalLight.name = "building_light";
    group.add(internalLight);

    const entranceLight1 = new THREE.PointLight(0xf0f8ff, 0, 80, 2); // Cool white (AliceBlue)
    entranceLight1.position.set(-12, 38, mainDepth / 2 + 5); // Left of entrance, slightly higher
    entranceLight1.name = "building_light";
    const entranceLight2 = entranceLight1.clone();
    entranceLight2.position.x = 12; // Right of entrance
    group.add(entranceLight1, entranceLight2);


    group.traverse(c => { 
        c.castShadow = true; 
        c.receiveShadow = true;
    });
    return group;
};


const createFlatPolygonMesh = (points: {x: number, y: number}[], color: THREE.ColorRepresentation, yOffset: number, transparent: boolean = false, opacity: number = 1) => {
    const shape = new THREE.Shape();
    shape.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
        shape.lineTo(points[i].x, points[i].y);
    }
    shape.closePath();

    const geometry = new THREE.ShapeGeometry(shape);
    const material = new THREE.MeshStandardMaterial({ color, transparent, opacity, side: THREE.DoubleSide });
    
    // Correctly orient the 2D shape in the 3D XZ plane
    const pos = geometry.attributes.position;
    const vertices = [];
    for (let i = 0; i < pos.count; i++) {
        vertices.push(pos.getX(i), yOffset, pos.getY(i));
    }
    
    const orientedGeometry = new THREE.BufferGeometry();
    orientedGeometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    orientedGeometry.setIndex(new THREE.BufferAttribute(geometry.index.array, 1));
    orientedGeometry.computeVertexNormals();

    const mesh = new THREE.Mesh(orientedGeometry, material);
    mesh.receiveShadow = true;
    return mesh;
};


export const GameCanvas: React.FC<GameCanvasProps> = (props) => {
  const { gameStateRef, isBuildMode, selectedBuildType, buildRotation, activePlantingSeed, onPlaceBuilding, onOpenCrafting, onOpenBuildingInfo, onPlantActiveSeed, onStateUpdate, onShowNotification, onOpenPokemonDetail, onCollectResource } = props;
  const mountRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);

  const objectMap = useRef(new Map<string, number>()).current;
  const textureLoader = useMemo(() => new THREE.TextureLoader(), []);
  const raycaster = useMemo(() => new THREE.Raycaster(), []);
  const mouse = useMemo(() => new THREE.Vector2(), []);
  
  const buildPreviewObjectRef = useRef<THREE.Object3D | null>(null);
  const plantingCursorMeshRef = useRef<THREE.Mesh | null>(null);
  
  useEffect(() => {
    if (plantingCursorMeshRef.current) {
      plantingCursorMeshRef.current.visible = !!activePlantingSeed;
    }
  }, [activePlantingSeed]);

  const getNightness = useCallback((gameTime: number) => {
    const hour = Math.floor((gameTime % 86400) / 3600);
    if (hour >= 6 && hour < 20) return 0; // Day
    if (hour >= 20 && hour < 22) return (hour - 20 + (gameTime % 3600) / 3600) / 2; // Sunset
    if (hour >= 22 || hour < 4) return 1; // Night
    if (hour >= 4 && hour < 6) return 1 - ((hour - 4 + (gameTime % 3600) / 3600) / 2); // Sunrise
    return 0;
  }, []);

  const getGroundIntersection = useCallback((event: MouseEvent) => {
    if (!rendererRef.current || !cameraRef.current || !sceneRef.current) return null;
    const rect = rendererRef.current.domElement.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(mouse, cameraRef.current);
    const ground = sceneRef.current.getObjectByName('ground');
    if (!ground) return null;
    const intersects = raycaster.intersectObject(ground);
    return intersects.length > 0 ? intersects[0].point : null;
  }, [mouse, raycaster]);
  
  const handleResize = useCallback(() => {
    if (!cameraRef.current || !rendererRef.current || !mountRef.current) return;
    const { clientWidth, clientHeight } = mountRef.current;
    
    if (clientHeight === 0) return;

    cameraRef.current.aspect = clientWidth / clientHeight;
    cameraRef.current.updateProjectionMatrix();
    rendererRef.current.setSize(clientWidth, clientHeight);
  }, []);

  // Handle Build Preview Model
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    const cleanup = () => {
        if (buildPreviewObjectRef.current) {
            scene.remove(buildPreviewObjectRef.current);
            buildPreviewObjectRef.current.traverse(child => {
                if (child instanceof THREE.Mesh) {
                    child.geometry.dispose();
                    if (Array.isArray(child.material)) {
                        child.material.forEach(m => m.dispose());
                    } else if (child.material) {
                        child.material.dispose();
                    }
                }
            });
            buildPreviewObjectRef.current = null;
        }
    };

    if (isBuildMode && selectedBuildType) {
        cleanup(); 

        const size = getBuildSize(selectedBuildType);
        let newPreview: THREE.Group | null = null;
        const typeForCreator = selectedBuildType.startsWith('stable_') ? 'stable' : selectedBuildType;

        switch (typeForCreator) {
            case 'house': newPreview = createHouse(); break;
            case 'farm_area': newPreview = createFarmArea(size.w, size.h); break;
            case 'stable': newPreview = createStable(size.w, size.h); break;
            case 'coop': newPreview = createCoop(size.w, size.h); break;
            case 'mine': newPreview = createMineEntrance(size.w, size.h); break;
            case 'lake': newPreview = createZenLake(size.w, size.h); break;
            case 'campfire': newPreview = createCampfire(size.w, size.h); break;
            case 'pokemon_gym': newPreview = createPokemonGym(size.w, size.h); break;
            case 'laboratory': newPreview = createLaboratory(); break;
            default: break;
        }

        if (newPreview) {
            newPreview.traverse(child => {
                if (child instanceof THREE.Mesh) {
                    child.material = new THREE.MeshStandardMaterial({
                        transparent: true,
                        opacity: 0.6,
                        color: 0x00ff00 
                    });
                    child.castShadow = false;
                }
                if (child instanceof THREE.PointLight) {
                    child.visible = false;
                }
            });
            newPreview.visible = false; 
            scene.add(newPreview);
            buildPreviewObjectRef.current = newPreview;
        }
    } else {
        cleanup();
    }
    
    return cleanup;
  }, [isBuildMode, selectedBuildType]);


  // Handle Mouse Interactions
  useEffect(() => {
    const handlePointerMove = (event: MouseEvent) => {
        const intersection = getGroundIntersection(event);
        if (!intersection) {
            if (buildPreviewObjectRef.current) buildPreviewObjectRef.current.visible = false;
            return;
        }
        
        if (!gameStateRef.current) return;

        if (isBuildMode && buildPreviewObjectRef.current && selectedBuildType) {
            buildPreviewObjectRef.current.visible = true;

            const originalSize = getBuildSize(selectedBuildType);
            const isRotated = buildRotation === Math.PI / 2 || buildRotation === (3 * Math.PI) / 2;
            const size = isRotated ? { w: originalSize.h, h: originalSize.w } : originalSize;
            
            const placeX = Math.floor(intersection.x - size.w / 2);
            const placeY = Math.floor(intersection.z - size.h / 2);
            const placementCheck = isPlacementAreaClear(placeX, placeY, size.w, size.h, gameStateRef.current.world, selectedBuildType);
            
            buildPreviewObjectRef.current.position.set(intersection.x, 0, intersection.z);
            buildPreviewObjectRef.current.rotation.y = buildRotation;
            
            const newColor = placementCheck.clear ? 0x00ff00 : 0xff0000;
            buildPreviewObjectRef.current.traverse(child => {
                if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshStandardMaterial) {
                    child.material.color.set(newColor);
                }
            });
        }
        
        if (activePlantingSeed && plantingCursorMeshRef.current) {
            plantingCursorMeshRef.current.position.set(intersection.x, 0.2, intersection.z);
        }
    };

    const handleClick = (event: MouseEvent) => {
        if (!rendererRef.current || !cameraRef.current || !sceneRef.current || !gameStateRef.current) return;
        const rect = rendererRef.current.domElement.getBoundingClientRect();
        mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
        raycaster.setFromCamera(mouse, cameraRef.current);

        const intersection = getGroundIntersection(event);
        if (isBuildMode && intersection) {
            onPlaceBuilding(intersection.x, intersection.z);
            return;
        }

        const intersects = raycaster.intersectObjects(sceneRef.current.children, true);
        for (const intersect of intersects) {
            let obj: THREE.Object3D | null = intersect.object;
            // FIX: Refined type checks for object metadata to prevent potential runtime errors and satisfy TypeScript's strictness.
            let data: { id: string; type: string } | null = null;
            
            // Traverse up the hierarchy to find the main object with userData
            while (obj && obj !== sceneRef.current) {
                if (obj.userData && typeof obj.userData.id === 'string' && typeof obj.userData.type === 'string') {
                    data = obj.userData as { id: string; type: string };
                    break;
                }
                obj = obj.parent;
            }
            
            if (data) {
                switch (data.type) {
                    case 'pokemon':
                        const pokemon = gameStateRef.current.pokemons.find(p => p.id === data.id);
                        if (pokemon) onOpenPokemonDetail(pokemon);
                        return;
                    case 'building': 
                        const building = gameStateRef.current.world.structs.find(b => b.id === data.id);
                        if (building?.type === 'house') onOpenCrafting();
                        else if (building) onOpenBuildingInfo(building.id);
                        return;
                    case 'resource':
                        onCollectResource(data.id);
                        return;
                    case 'crop_plot':
                        const plot = gameStateRef.current.cropPlots.find(p => p.id === data.id);
                        if (!plot) return;
                        if(activePlantingSeed) onPlantActiveSeed(plot);
                        else if (plot.state === 'mature') {
                           plot.harvest(gameStateRef.current.player);
                           onStateUpdate();
                        }
                        return;
                }
            }
        }
    };
    
    const canvas = rendererRef.current?.domElement;
    canvas?.addEventListener('pointermove', handlePointerMove);
    canvas?.addEventListener('click', handleClick);
    return () => {
        canvas?.removeEventListener('pointermove', handlePointerMove);
        canvas?.removeEventListener('click', handleClick);
    }
  }, [getGroundIntersection, isBuildMode, activePlantingSeed, buildRotation, onPlaceBuilding, onOpenBuildingInfo, onOpenPokemonDetail, onStateUpdate, onShowNotification, onPlantActiveSeed, onOpenCrafting, selectedBuildType, gameStateRef, onCollectResource]);


  // Init and Animation Loop
  useEffect(() => {
    if (!mountRef.current || !gameStateRef.current) return;
    const gs = gameStateRef.current;
    const container = mountRef.current;

    // --- Scene Setup ---
    const scene = new THREE.Scene();
    sceneRef.current = scene;
    const initialPalette = TIME_OF_DAY_PALETTES.MORNING;

    scene.fog = new THREE.FogExp2(initialPalette.fog.getHex(), 0.0007);
    scene.background = new THREE.Color(initialPalette.background.getHex());

    const camera = new THREE.PerspectiveCamera(60, container.clientWidth / container.clientHeight, 10, 5000);
    camera.position.set(gs.world.w / 2, 800, gs.world.h / 2 + 500);
    cameraRef.current = camera;
    
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.shadowMap.enabled = true;
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;
    
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(gs.world.w / 2, 0, gs.world.h / 2);
    controls.enableRotate = true;
    controls.maxPolarAngle = Math.PI / 2.2;
    controls.minDistance = 200;
    controls.maxDistance = 1500;
    controls.update();
    controlsRef.current = controls;
    
    window.addEventListener('resize', handleResize);
    handleResize();

    // --- Lighting ---
    const ambientLight = new THREE.AmbientLight(initialPalette.ambient, initialPalette.intensity.ambient);
    scene.add(ambientLight);
    const dirLight = new THREE.DirectionalLight(initialPalette.directional, initialPalette.intensity.directional);
    dirLight.position.set(gs.world.w / 2 - 800, 800, gs.world.h / 2 - 800);
    dirLight.target.position.set(gs.world.w / 2, 0, gs.world.h / 2);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 4096;
    dirLight.shadow.mapSize.height = 4096;
    const shadowCamSize = Math.max(gs.world.w, gs.world.h) / 1.5;
    dirLight.shadow.camera.left = -shadowCamSize;
    dirLight.shadow.camera.right = shadowCamSize;
    dirLight.shadow.camera.top = shadowCamSize;
    dirLight.shadow.camera.bottom = -shadowCamSize;
    dirLight.shadow.camera.near = 100;
    dirLight.shadow.camera.far = 2000;
    scene.add(dirLight);
    scene.add(dirLight.target);

    // --- Ground Plane ---
    const groundGeo = new THREE.PlaneGeometry(gs.world.w, gs.world.h);
    const groundMat = new THREE.MeshStandardMaterial({ color: 0x6dbf6d });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(gs.world.w / 2, 0, gs.world.h / 2);
    ground.receiveShadow = true;
    ground.name = "ground";
    scene.add(ground);
    
    gs.world.specials.forEach(special => {
        if (special.type === 'river') {
            // Render banks first, so water is on top
            const bankMaterial = new THREE.MeshStandardMaterial({ color: 0xc2b280 }); // Sandy color
            const numBankPoints = special.points.length / 2;
            const leftBankPoints = special.points.slice(0, numBankPoints).map(p => new THREE.Vector3(p.x, 0.3, p.y));
            const rightBankPoints = special.points.slice(numBankPoints).reverse().map(p => new THREE.Vector3(p.x, 0.3, p.y));

            if (leftBankPoints.length > 1) {
                const leftCurve = new THREE.CatmullRomCurve3(leftBankPoints, false, 'catmullrom', 0.5);
                const leftBankGeo = new THREE.TubeGeometry(leftCurve, 64, 10, 8, false);
                const leftBankMesh = new THREE.Mesh(leftBankGeo, bankMaterial);
                leftBankMesh.receiveShadow = true;
                scene.add(leftBankMesh);
            }
             if (rightBankPoints.length > 1) {
                const rightCurve = new THREE.CatmullRomCurve3(rightBankPoints, false, 'catmullrom', 0.5);
                const rightBankGeo = new THREE.TubeGeometry(rightCurve, 64, 10, 8, false);
                const rightBankMesh = new THREE.Mesh(rightBankGeo, bankMaterial);
                rightBankMesh.receiveShadow = true;
                scene.add(rightBankMesh);
            }

            const riverMesh = createFlatPolygonMesh(special.points, 0x4682B4, 0.2, true, 0.7);
            riverMesh.name = "river";
            scene.add(riverMesh);
        } else if (special.type === 'quarry') {
            const quarryMesh = createFlatPolygonMesh(special.points, 0x9c8e79, 0.1);
            quarryMesh.name = "quarry";
            scene.add(quarryMesh);
        }
    });

    gs.world.fertileZones.forEach(zone => {
        if (zone.shape === 'poly') {
            const fertileMesh = createFlatPolygonMesh(zone.points, 0x558B2F, 0.1);
            fertileMesh.name = `fertile_zone_${zone.center.x}`;
            scene.add(fertileMesh);
        }
    });


    // --- Build/Planting Cursors ---
    const plantCursorGeo = new THREE.RingGeometry(16, 18, 32);
    const plantCursorMat = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide });
    plantingCursorMeshRef.current = new THREE.Mesh(plantCursorGeo, plantCursorMat);
    plantingCursorMeshRef.current.rotation.x = -Math.PI / 2;
    plantingCursorMeshRef.current.visible = false;
    scene.add(plantingCursorMeshRef.current);

    // --- Animation Loop ---
    let animationFrameId: number;
    const animate = () => {
        animationFrameId = requestAnimationFrame(animate);
        const currentGs = gameStateRef.current;
        if (!currentGs || !rendererRef.current || !sceneRef.current || !cameraRef.current) return;

        // --- Day/Night Cycle Update ---
        const todInfo = getTimeOfDayInfo(currentGs.gameTime);
        const tempColor = new THREE.Color();
        const nightness = getNightness(currentGs.gameTime);

        // Lerp background and fog
        tempColor.copy(todInfo.from.background).lerp(todInfo.to.background, todInfo.t);
        if (sceneRef.current.background instanceof THREE.Color) {
            sceneRef.current.background.copy(tempColor);
        }
        if(sceneRef.current.fog instanceof THREE.FogExp2) {
            sceneRef.current.fog.color.copy(tempColor);
        }

        // Lerp ambient light
        ambientLight.color.copy(todInfo.from.ambient).lerp(todInfo.to.ambient, todInfo.t);
        ambientLight.intensity = THREE.MathUtils.lerp(todInfo.from.intensity.ambient, todInfo.to.intensity.ambient, todInfo.t);

        // Lerp directional light
        dirLight.color.copy(todInfo.from.directional).lerp(todInfo.to.directional, todInfo.t);
        dirLight.intensity = THREE.MathUtils.lerp(todInfo.from.intensity.directional, todInfo.to.intensity.directional, todInfo.t);

        // Update sun position for shadow direction
        const sunDistance = 800;
        dirLight.position.set(
            gs.world.w / 2 - Math.cos(todInfo.sunAngle) * sunDistance,
            Math.sin(todInfo.sunAngle) * sunDistance * 1.2,
            gs.world.h / 2 - Math.cos(todInfo.sunAngle * 0.5) * sunDistance * 0.5 
        );
        dirLight.target.position.set(gs.world.w / 2, 0, gs.world.h / 2);

        sceneRef.current.traverse(obj => {
          const light = obj as THREE.PointLight;
          if (light.isLight) {
              if (obj.name === "building_light") {
                  light.intensity = nightness > 0.5 ? 180 : 0;
              } else if (obj.name === "building_light_flicker") {
                  light.intensity = nightness > 0.5 ? (150 + Math.sin(performance.now() * 0.01) * 40) : 0;
              }
          }
        });


        // Sync Scene with GameState
        const existingIds = new Set<string>();

        // Update Pokemon
        currentGs.pokemons.forEach(p => {
            if (!p || !p.id) return;
            existingIds.add(p.id);

            const isGhost = ['Gastly', 'Litwick', 'Haunter', 'Gengar', 'Lampent', 'Chandelure', 'Annihilape'].includes(p.kind);
            const isNight = getNightness(currentGs.gameTime) > 0.5;

            if (objectMap.has(p.id)) {
                const objId = objectMap.get(p.id);
                const obj = objId ? sceneRef.current.getObjectById(objId) : null;
                
                if (obj) { // obj is a THREE.Group
                    const baseSpriteSize = 48;
                    const baseHeight = 24;
                    let yOffset = 0;
                    let scaleMod = 1.0;
                    const time = performance.now();
                    const randomPhase = (p.id.charCodeAt(p.id.length - 1) % 100) / 100 * Math.PI * 2;

                    switch (p.aiState) {
                        case 'moving':
                            yOffset = Math.sin(time * 0.008 + randomPhase) * 4;
                            break;
                        case 'working':
                            const progress = 1.0 - (p.actionTimer || 0);
                            const animationCurve = Math.sin(progress * Math.PI);
                            yOffset = animationCurve * 12;
                            scaleMod = 1 + animationCurve * 0.1;
                            break;
                        case 'idle':
                            scaleMod = 1 + Math.sin(time * 0.001 + randomPhase) * 0.05;
                            break;
                    }
                    
                    obj.position.x = p.x;
                    obj.position.z = p.y;
                    
                    const sprite = obj.getObjectByName('sprite');
                    if (sprite) {
                        sprite.position.y = baseHeight + yOffset;
                        sprite.scale.set(baseSpriteSize * scaleMod, baseSpriteSize * scaleMod, 1);
                    }
                    
                    const shadow = obj.getObjectByName('shadow');
                    if (shadow) {
                        shadow.visible = todInfo.sunAngle < Math.PI && todInfo.sunAngle > 0;
                    }

                    const light = obj.getObjectByName('pokemon_light') as THREE.PointLight;
                    if (light) {
                        light.intensity = nightness > 0.5 ? Math.max(0, 30 + Math.sin(time * 0.007 + randomPhase) * 5) : 0;
                    }

                    obj.visible = !p.isSleeping && (!isGhost || isNight);
                } else {
                    objectMap.delete(p.id);
                }
            } else {
                const pokemonId = POKEMON_IDS[p.kind as keyof typeof POKEMON_IDS];
                if (!pokemonId) return;
                
                const group = new THREE.Group();

                const map = textureLoader.load(`https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${p.isShiny ? 'shiny/' : ''}${pokemonId}.png`);
                map.magFilter = THREE.NearestFilter;
                const mat = new THREE.SpriteMaterial({ map, transparent: true, alphaTest: 0.5 });
                const sprite = new THREE.Sprite(mat);
                sprite.scale.set(48, 48, 1);
                sprite.position.y = 24;
                sprite.name = 'sprite';

                const shadowGeo = new THREE.CircleGeometry(15, 32);
                const shadowMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.4 });
                const shadow = new THREE.Mesh(shadowGeo, shadowMat);
                shadow.rotation.x = -Math.PI / 2;
                shadow.position.y = 0.5;
                shadow.name = 'shadow';
                
                group.add(sprite);
                group.add(shadow);

                if (FIRE_TYPES.has(p.kind)) {
                    const light = new THREE.PointLight(0xffa500, 0, 80);
                    light.position.y = 15;
                    light.name = "pokemon_light";
                    group.add(light);
                }
                
                group.userData = { id: p.id, type: 'pokemon' };
                group.position.set(p.x, 0, p.y);
                group.visible = !p.isSleeping && (!isGhost || isNight);
                
                sceneRef.current.add(group);
                objectMap.set(p.id, group.id);
            }
        });


        // Update Buildings, Resources, CropPlots
        // FIX: Replaced `forEach` with a `for...of` loop to fix a TypeScript type inference issue
        // where `item.id` was sometimes treated as `unknown`. This provides better type safety.
        const allItems: (Building | Resource | CropPlot)[] = [...currentGs.world.structs, ...currentGs.world.resources, ...currentGs.cropPlots];
        for (const item of allItems) {
            const isCropPlot = 'plant' in item;
            existingIds.add(item.id);

            if (!objectMap.has(item.id)) {
                let mesh: THREE.Object3D | null = null;
                
                 if (isCropPlot) {
                    const plot = item as CropPlot;
                    const group = new THREE.Group();
                    group.position.set(plot.x, 0.1, plot.y);
                    group.rotation.y = plot.rotation || 0;

                    const geo = new THREE.BoxGeometry(24, 0.1, 16);
                    const mat = new THREE.MeshStandardMaterial({ color: 0x8b5e3c });
                    const plotMesh = new THREE.Mesh(geo, mat);
                    plotMesh.name = 'plot';
                    group.add(plotMesh);
                    
                    const plantMesh = createPlantMesh(plot);
                    group.add(plantMesh);

                    const fertilizerEffect = createFertilizerEffect();
                    fertilizerEffect.visible = false;
                    group.add(fertilizerEffect);

                    mesh = group;
                    mesh.userData = { id: item.id, type: 'crop_plot' };
                } else if ('type' in item) { 
                    const br = item as Building | Resource;
                    if ('w' in br) { // Is a building
                        const building = br as Building;
                        const isRotated = building.rotation === Math.PI / 2 || building.rotation === (3 * Math.PI) / 2;
                        const renderW = isRotated ? building.h : building.w;
                        const renderH = isRotated ? building.w : building.h;

                        switch (building.type) {
                            case 'river_area': break;
                            case 'house': mesh = createHouse(); break;
                            case 'farm_area': mesh = createFarmArea(building.w, building.h); break;
                            case 'stable': mesh = createStable(building.w, building.h); break;
                            case 'coop': mesh = createCoop(building.w, building.h); break;
                            case 'mine': mesh = createMineEntrance(building.w, building.h); break;
                            case 'lake': mesh = createZenLake(building.w, building.h); break;
                            case 'campfire': mesh = createCampfire(building.w, building.h); break;
                            case 'pokemon_gym': mesh = createPokemonGym(building.w, building.h); break;
                            case 'laboratory': mesh = createLaboratory(); break;
                            default:
                                const geo = new THREE.BoxGeometry(renderW, 50, renderH);
                                const mat = new THREE.MeshStandardMaterial({ color: 0xcccccc });
                                mesh = new THREE.Mesh(geo, mat);
                                break;
                        }

                        if (mesh) {
                            const centerX = building.x + renderW / 2;
                            const centerZ = building.y + renderH / 2;
                            mesh.position.set(centerX, 0, centerZ);
                            mesh.rotation.y = building.rotation;
                            mesh.castShadow = true;
                            mesh.userData = { id: building.id, type: 'building' };
                        }
                    } else { // Is a resource
                        const resource = br as Resource;
                        switch (resource.type) {
                            case 'oak_tree': case 'pine_tree': case 'apple_tree':
                                const treeType = resource.type.includes('pine') ? 'pine' : resource.type.includes('apple') ? 'apple' : 'oak';
                                mesh = createTree(treeType);
                                mesh.position.set(resource.x, 0, resource.y);
                                break;
                            case 'rock':
                                mesh = createRock();
                                // Ground the rock by calculating its lowest point and offsetting
                                mesh.geometry.computeBoundingBox();
                                if (mesh.geometry.boundingBox) {
                                    const yOffset = -mesh.geometry.boundingBox.min.y;
                                    mesh.position.set(resource.x, yOffset, resource.y);
                                } else {
                                    mesh.position.set(resource.x, 10, resource.y); // Fallback
                                }
                                break;
                            case 'wild_plant':
                                mesh = createWildPlant(resource as Resource);
                                mesh.position.set(resource.x, 0, resource.y);
                                break;
                        }
                        if (mesh) {
                           mesh.castShadow = true;
                           mesh.userData = { id: resource.id, type: 'resource' };
                        }
                    }
                }
                
                if (mesh) {
                    sceneRef.current.add(mesh);
                    objectMap.set(item.id, mesh.id);
                } else if ('w' in item && item.type === 'river_area') {
                    // This is a special logical area, not a mesh.
                    objectMap.set(item.id, -1);
                }
            }
             if (isCropPlot) {
                const plotId = objectMap.get(item.id);
                if (plotId === undefined) return;
                const group = sceneRef.current.getObjectById(plotId) as THREE.Group;
                if (group) {
                    const plot = item as CropPlot;

                    const plotBase = group.getObjectByName('plot') as THREE.Mesh;
                    if (plotBase && plotBase.material instanceof THREE.MeshStandardMaterial) {
                        const targetColor = plot.isWatered ? 0x5a3d2b : 0x8b5e3c;
                        plotBase.material.color.lerp(new THREE.Color(targetColor), 0.1);
                    }

                    const oldPlantMesh = group.getObjectByName('plant');
                    if(oldPlantMesh) {
                        group.remove(oldPlantMesh);
                    }
                    const newPlantMesh = createPlantMesh(plot);
                    group.add(newPlantMesh);

                    const fertilizerEffect = group.getObjectByName('fertilizer_effect') as THREE.Group;
                    if (fertilizerEffect) {
                        fertilizerEffect.visible = plot.fertilized;
                        if (plot.fertilized) {
                            fertilizerEffect.children.forEach((particle, i) => {
                                const time = performance.now() * 0.002;
                                particle.position.y = 2 + Math.sin(time + i) * 1.5;
                            });
                        }
                    }
                }
            }
        }

        // Cleanup stale objects from scene
        const currentIdsInScene = new Set(objectMap.keys());
        for (const id of currentIdsInScene) {
            // FIX: Explicitly cast `id` to string to resolve a TypeScript error where it was being inferred as `unknown`.
            if (!existingIds.has(id as string)) {
                const objId = objectMap.get(id as string);
                if (objId) {
                    const obj = sceneRef.current.getObjectById(objId);
                    if (obj) {
                        sceneRef.current.remove(obj);
                        obj.traverse(child => {
                            if (child instanceof THREE.Mesh) {
                                child.geometry.dispose();
                                if (Array.isArray(child.material)) {
                                    child.material.forEach(m => m.dispose());
                                } else if (child.material) {
                                    child.material.dispose();
                                }
                            }
                        });
                    }
                }
                objectMap.delete(id as string);
            }
        }

        controlsRef.current?.update();
        rendererRef.current.render(sceneRef.current, cameraRef.current);
    };

    animate();

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', handleResize);
      if (mountRef.current && rendererRef.current) {
        mountRef.current.removeChild(rendererRef.current.domElement);
      }
      rendererRef.current?.dispose();
    };
  }, [gameStateRef, handleResize, textureLoader]);
  
  return <div ref={mountRef} className="w-full h-full" />;
};