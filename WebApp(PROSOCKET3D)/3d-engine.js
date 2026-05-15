/* ================================================================
   THREE.JS 3D ENGINE & GENERATORS
   ================================================================ */

function createSkinBumpMap() {
    const size = 256;
    const canvas = document.createElement('canvas');
    canvas.width = size; canvas.height = size;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#808080';
    ctx.fillRect(0, 0, size, size);
    for (let i = 0; i < size; i++) {
        for (let j = 0; j < size; j++) {
            const v = 128 + (Math.random() - 0.5) * 30
                     + Math.sin(i * 0.3) * 5
                     + Math.cos(j * 0.25) * 5
                     + Math.sin(i * 0.05 + j * 0.07) * 15;
            const c = Math.max(0, Math.min(255, v));
            ctx.fillStyle = `rgb(${c},${c},${c})`;
            ctx.fillRect(i, j, 1, 1);
        }
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(3, 3);
    return tex;
}

function buildStumpProfile(params) {
    const meas = [...params.measurements].sort((a, b) => a.dist - b.dist);
    const tipShape = params.tipShape;
    const stumpType = params.stumpType;
    const stumpLen = params.stumpLength;

    if (meas.length > 0 && meas[meas.length - 1].dist < stumpLen) {
        meas.push({ dist: stumpLen, diam: meas[meas.length - 1].diam * 1.02 });
    }

    const controlPoints = [];
    const tipRadius = meas.length > 0 ? meas[0].diam / 2 : 3;
    let domeScale = 0.6;
    if (tipShape === 'flat') domeScale = 0.15;
    if (tipShape === 'pointed') domeScale = 1.0;

    const domeDepth = tipRadius * domeScale;
    const domeSteps = 10;
    for (let i = 0; i <= domeSteps; i++) {
        const t = i / domeSteps;
        const angle = -Math.PI / 2 + t * Math.PI / 2;
        let x = tipRadius * Math.cos(angle);
        let y = -domeDepth + (domeDepth) * ((Math.sin(angle) + 1));

        if (tipShape === 'pointed') {
            x = tipRadius * Math.pow(t, 1.5);
            y = -domeDepth + domeDepth * t;
        } else if (tipShape === 'flat') {
            if (i === 0) { x = 0; y = -domeDepth; }
            else if (i <= 2) { x = tipRadius * (i / 2) * 0.3; y = -domeDepth + domeDepth * 0.1 * i; }
        }
        controlPoints.push(new THREE.Vector2(Math.max(x, 0), y));
    }

    for (let i = 0; i < meas.length; i++) {
        controlPoints.push(new THREE.Vector2(meas[i].diam / 2, meas[i].dist));
    }

    const foldDist = stumpLen - 1.5;
    const topRadius = meas.length > 0 ? meas[meas.length - 1].diam / 2 : 5.5;
    controlPoints.push(new THREE.Vector2(topRadius * 0.95, foldDist));
    controlPoints.push(new THREE.Vector2(topRadius * 1.01, stumpLen + 0.3));
    controlPoints.sort((a, b) => a.y - b.y);

    const filtered = [controlPoints[0]];
    for (let i = 1; i < controlPoints.length; i++) {
        if (Math.abs(controlPoints[i].y - filtered[filtered.length - 1].y) > 0.01) {
            filtered.push(controlPoints[i]);
        }
    }

    const curve = new THREE.SplineCurve(filtered);
    const numSamples = 80;
    const profilePoints = curve.getPoints(numSamples);
    profilePoints.forEach(p => { p.x = Math.max(p.x, 0.01); });
    profilePoints[0].x = 0.001;

    return profilePoints;
}

function createStumpGeometry(params) {
    const profile = buildStumpProfile(params);
    const segMap = { 1: 32, 2: 48, 3: 64, 4: 96, 5: 128 };
    const segments = segMap[params.smoothLevel] || 64;

    const geometry = new THREE.LatheGeometry(profile, segments);
    const positions = geometry.attributes.position;
    const seed = Math.random() * 1000;
    
    for (let i = 0; i < positions.count; i++) {
        let x = positions.getX(i);
        let y = positions.getY(i);
        let z = positions.getZ(i);
        const r = Math.sqrt(x * x + z * z);
        if (r < 0.1) continue; 
        const angle = Math.atan2(z, x);

        let noise = Math.sin(angle * 7 + y * 2.5 + seed) * 0.08
                   + Math.sin(angle * 13 + y * 4.1 + seed * 0.7) * 0.04
                   + Math.sin(angle * 3.7 + y * 1.3 + seed * 1.3) * 0.06;

        if (params.stumpType === 'transradial') {
            const ulnaAngle = 0;
            const radiusAngle = Math.PI;
            const normY = y / params.stumpLength;
            if (normY > 0.1 && normY < 0.85) {
                const ulnaDiff = Math.abs(Math.atan2(Math.sin(angle - ulnaAngle), Math.cos(angle - ulnaAngle)));
                const radDiff = Math.abs(Math.atan2(Math.sin(angle - radiusAngle), Math.cos(angle - radiusAngle)));
                if (ulnaDiff < 0.35) noise += 0.15 * (0.35 - ulnaDiff) / 0.35 * (1 - Math.abs(normY - 0.5) * 1.5);
                if (radDiff < 0.35) noise += 0.12 * (0.35 - radDiff) / 0.35 * (1 - Math.abs(normY - 0.5) * 1.5);
            }
        }
        if (params.stumpType === 'wrist') {
            const normY = y / params.stumpLength;
            if (normY > 0.0 && normY < 0.2) {
                const flare = Math.sin(normY / 0.2 * Math.PI) * 0.2;
                noise += flare * Math.abs(Math.cos(angle * 2));
            }
        }
        if (params.stumpType === 'elbow') {
            const normY = y / params.stumpLength;
            if (normY > 0.75) {
                const factor = (normY - 0.75) / 0.25;
                const medAngle = Math.PI / 2;
                const latAngle = -Math.PI / 2;
                const medDiff = Math.abs(Math.atan2(Math.sin(angle - medAngle), Math.cos(angle - medAngle)));
                const latDiff = Math.abs(Math.atan2(Math.sin(angle - latAngle), Math.cos(angle - latAngle)));
                if (medDiff < 0.5) noise += factor * 0.4 * (0.5 - medDiff) / 0.5;
                if (latDiff < 0.5) noise += factor * 0.4 * (0.5 - latDiff) / 0.5;
                noise += factor * 0.15;
            }
        }

        const newR = r + noise;
        const scale = newR / r;
        positions.setX(i, x * scale);
        positions.setZ(i, z * scale);
    }

    positions.needsUpdate = true;
    geometry.computeVertexNormals();

    return geometry;
}

function createStumpMesh(params) {
    const geometry = createStumpGeometry(params);
    const bumpMap = createSkinBumpMap();
    const material = new THREE.MeshStandardMaterial({
        color: 0xC68642, roughness: 0.8, metalness: 0.0,
        bumpMap: bumpMap, bumpScale: 0.15, side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
}

function buildSocketProfile(params) {
    const stumpProfile = buildStumpProfile(params);
    const linerOff = params.linerThick / 10;
    const wallOff = params.wallThick / 10;
    const flare = params.proximalFlare / 10;
    const trimOff = params.trimLineOffset / 10;
    const socketLen = params.stumpLength + 2 + trimOff;

    const outerProfile = [];
    const innerProfile = [];

    for (let i = 0; i < stumpProfile.length; i++) {
        const p = stumpProfile[i];
        if (p.y > socketLen) continue;
        const innerR = p.x + linerOff;
        const outerR = innerR + wallOff;
        innerProfile.push(new THREE.Vector2(innerR, p.y));
        outerProfile.push(new THREE.Vector2(outerR, p.y));
    }

    const uProfile = [];
    uProfile.push(new THREE.Vector2(0, -0.1));
    const outerBottomR = outerProfile.length > 0 ? outerProfile[0].x : 4;
    uProfile.push(new THREE.Vector2(outerBottomR, -0.1));

    for (let i = 0; i < outerProfile.length; i++) {
        uProfile.push(outerProfile[i].clone());
    }

    const lastOuter = outerProfile[outerProfile.length - 1];
    const topY = lastOuter ? lastOuter.y : socketLen;
    const topOuterR = lastOuter ? lastOuter.x : 7;
    uProfile.push(new THREE.Vector2(topOuterR + flare * 0.5, topY + 0.15));
    uProfile.push(new THREE.Vector2(topOuterR + flare, topY + 0.3));
    uProfile.push(new THREE.Vector2(topOuterR + flare * 0.8, topY + 0.45));

    const lastInner = innerProfile[innerProfile.length - 1];
    const topInnerR = lastInner ? lastInner.x : 6;
    uProfile.push(new THREE.Vector2(topInnerR + flare * 0.3, topY + 0.4));
    uProfile.push(new THREE.Vector2(topInnerR, topY));

    for (let i = innerProfile.length - 1; i >= 0; i--) {
        uProfile.push(innerProfile[i].clone());
    }

    const innerBottomR = innerProfile.length > 0 ? innerProfile[0].x : 3.5;
    uProfile.push(new THREE.Vector2(innerBottomR, wallOff));
    uProfile.push(new THREE.Vector2(0, wallOff));

    return { uProfile, outerProfile, innerProfile, socketLen, topY };
}

function createSocketGeometry(params) {
    const { uProfile } = buildSocketProfile(params);
    const segMap = { 1: 32, 2: 48, 3: 64, 4: 96, 5: 128 };
    const segments = segMap[params.smoothLevel] || 64;

    const curve = new THREE.SplineCurve(uProfile);
    const smoothed = curve.getPoints(120);
    smoothed.forEach(p => { p.x = Math.max(p.x, 0); });

    const geometry = new THREE.LatheGeometry(smoothed, segments);
    geometry.computeVertexNormals();
    return geometry;
}

function createSocketMesh(params) {
    const geometry = createSocketGeometry(params);
    let material = new THREE.MeshStandardMaterial({
        color: 0xE8E8E8, roughness: 0.4, metalness: 0.1, side: THREE.DoubleSide,
    });
    let mesh = new THREE.Mesh(geometry, material);

    if (params.holes && params.holes.length > 0 && typeof CSG !== 'undefined') {
        const { outerProfile, socketLen } = buildSocketProfile(params);
        function getRadius(h) {
            if (!outerProfile || outerProfile.length < 2) return 5;
            for (let i = 0; i < outerProfile.length - 1; i++) {
                if (outerProfile[i].y <= h && outerProfile[i + 1].y >= h) {
                    const t = (h - outerProfile[i].y) / (outerProfile[i + 1].y - outerProfile[i].y);
                    return outerProfile[i].x + t * (outerProfile[i + 1].x - outerProfile[i].x);
                }
            }
            return outerProfile[outerProfile.length - 1]?.x || 5;
        }

        mesh.updateMatrixWorld(true);
        let socketCSG;
        try {
            socketCSG = CSG.fromMesh(mesh);
        } catch(e) {
            console.warn("CSG creation failed. Ensure three-csg-ts is loaded.", e);
        }

        if (socketCSG) {
            params.holes.forEach((hole, idx) => {
                const hPosY = socketLen * (hole.posY / 100);
                const r = getRadius(hPosY);
                const hAngle = hole.angle * Math.PI / 180;
                
                let drillGeo;
                const s = hole.scale * 0.8;
                const depth = 3; 
                
                if (hole.type === 'triangle') {
                    drillGeo = new THREE.CylinderGeometry(s, s, depth, 3);
                    drillGeo.rotateY(Math.PI / 6); // Point up
                } else if (hole.type === 'hexagon') {
                    drillGeo = new THREE.CylinderGeometry(s, s, depth, 6);
                } else if (hole.type === 'square') {
                    drillGeo = new THREE.BoxGeometry(s*1.8, depth, s*1.8);
                } else {
                    drillGeo = new THREE.CylinderGeometry(s, s, depth, 16); 
                }

                // Orient drill so its length punches radically outwards
                drillGeo.rotateX(Math.PI / 2);

                const drillMesh = new THREE.Mesh(drillGeo, material);
                drillMesh.position.z = r;

                const pivotGroup = new THREE.Group();
                pivotGroup.add(drillMesh);
                pivotGroup.position.y = hPosY;
                pivotGroup.rotation.y = hAngle;

                pivotGroup.updateMatrixWorld(true);
                
                const finalDrillMesh = new THREE.Mesh(drillGeo.clone());
                finalDrillMesh.applyMatrix4(drillMesh.matrixWorld);
                finalDrillMesh.updateMatrix();

                try {
                    const drillCSG = CSG.fromMesh(finalDrillMesh);
                    socketCSG = socketCSG.subtract(drillCSG);
                } catch(e) {
                    console.warn("CSG subtract failed for hole " + idx, e);
                }
            });

            try {
                const csgMesh = CSG.toMesh(socketCSG, mesh.matrix, material);
                csgMesh.geometry.computeVertexNormals();
                mesh = csgMesh;
            } catch(e) {}
        }
    }

    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
}

function createTypeFeatures(params) {
    const group = new THREE.Group();
    const { outerProfile, socketLen, topY } = buildSocketProfile(params);
    const mat = new THREE.MeshStandardMaterial({ color: 0xE8E8E8, roughness: 0.4, metalness: 0.1 });
    const darkMat = new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.6, metalness: 0.2 });
    const accentMat = new THREE.MeshStandardMaterial({ color: 0xCCCCCC, roughness: 0.3, metalness: 0.15 });

    function getRadius(h) {
        if (!outerProfile || outerProfile.length < 2) return 5;
        for (let i = 0; i < outerProfile.length - 1; i++) {
            if (outerProfile[i].y <= h && outerProfile[i + 1].y >= h) {
                const t = (h - outerProfile[i].y) / (outerProfile[i + 1].y - outerProfile[i].y);
                return outerProfile[i].x + t * (outerProfile[i + 1].x - outerProfile[i].x);
            }
        }
        return outerProfile[outerProfile.length - 1].x;
    }

    const type = params.stumpType;

    if (type === 'transradial') {
        const plateGeo = new THREE.CylinderGeometry(4, 4, 0.4, 32);
        const plate = new THREE.Mesh(plateGeo, accentMat);
        plate.position.y = -0.3;
        plate.castShadow = true;
        group.add(plate);

        for (let i = 0; i < 4; i++) {
            const angle = (Math.PI / 2) * i;
            const holeGeo = new THREE.CylinderGeometry(0.25, 0.25, 0.5, 12);
            const hole = new THREE.Mesh(holeGeo, darkMat);
            hole.position.set(Math.cos(angle) * 2, -0.3, Math.sin(angle) * 2);
            group.add(hole);
        }

        const lugGeo = new THREE.BoxGeometry(1.5, 0.8, 0.5);
        const topR = getRadius(topY);
        const lug1 = new THREE.Mesh(lugGeo, mat.clone());
        lug1.position.set(topR + 0.25, topY, 0);
        group.add(lug1);
        const lug2 = new THREE.Mesh(lugGeo, mat.clone());
        lug2.position.set(-topR - 0.25, topY, 0);
        group.add(lug2);
    }

    if (type === 'wrist') {
        const plateGeo = new THREE.CylinderGeometry(4, 4, 0.4, 32);
        const plate = new THREE.Mesh(plateGeo, accentMat);
        plate.position.y = -0.3;
        group.add(plate);

        for (let i = 0; i < 4; i++) {
            const angle = (Math.PI / 2) * i;
            const holeGeo = new THREE.CylinderGeometry(0.25, 0.25, 0.5, 12);
            const hole = new THREE.Mesh(holeGeo, darkMat);
            hole.position.set(Math.cos(angle) * 2, -0.3, Math.sin(angle) * 2);
            group.add(hole);
        }

        const windowY = socketLen * 0.25;
        const windowR = getRadius(windowY);
        for (let side = 0; side < 2; side++) {
            const angleOff = side === 0 ? Math.PI / 2 : -Math.PI / 2;
            const shape = new THREE.Shape();
            shape.ellipse(0, 0, 1, 1.5, 0, Math.PI * 2, false, 0);
            const windowGeo = new THREE.ExtrudeGeometry(shape, { depth: 0.8, bevelEnabled: true, bevelThickness: 0.15, bevelSize: 0.15, bevelSegments: 4 });
            const win = new THREE.Mesh(windowGeo, darkMat);
            win.position.set(Math.cos(angleOff) * (windowR - 0.1), windowY, Math.sin(angleOff) * (windowR - 0.1));
            win.rotation.y = -angleOff;
            win.rotation.x = Math.PI / 2;
            group.add(win);
        }
    }

    if (type === 'transhumeral') {
        const topR = getRadius(topY);
        const torusGeo = new THREE.TorusGeometry(topR + 2, 1.5, 8, 24, Math.PI * 0.6);
        const saddle = new THREE.Mesh(torusGeo, mat.clone());
        saddle.position.y = topY;
        saddle.rotation.x = Math.PI / 2;
        saddle.rotation.z = -Math.PI * 0.3;
        saddle.castShadow = true;
        group.add(saddle);

        const capShape = new THREE.Shape();
        capShape.moveTo(0, 0);
        capShape.absarc(0, 0, topR + 2.5, -0.3, Math.PI * 0.6, false);
        capShape.lineTo(0, 0);
        const capGeo = new THREE.ExtrudeGeometry(capShape, { depth: 0.4, bevelEnabled: false });
        const cap = new THREE.Mesh(capGeo, mat.clone());
        cap.position.set(0, topY + 1, 0);
        cap.rotation.x = Math.PI / 2;
        group.add(cap);

        const bracketGeo = new THREE.BoxGeometry(1, 3, 0.4);
        const bracket1 = new THREE.Mesh(bracketGeo, accentMat);
        bracket1.position.set(-1.5, -1.5, 0);
        bracket1.castShadow = true;
        group.add(bracket1);

        const bracket2 = new THREE.Mesh(bracketGeo, accentMat);
        bracket2.position.set(1.5, -1.5, 0);
        bracket2.castShadow = true;
        group.add(bracket2);

        const pinGeo = new THREE.CylinderGeometry(0.3, 0.3, 0.5, 12);
        const pin1 = new THREE.Mesh(pinGeo, darkMat);
        pin1.position.set(-1.5, -2, 0);
        pin1.rotation.x = Math.PI / 2;
        group.add(pin1);
        const pin2 = new THREE.Mesh(pinGeo, darkMat);
        pin2.position.set(1.5, -2, 0);
        pin2.rotation.x = Math.PI / 2;
        group.add(pin2);

        for (let i = 0; i < 3; i++) {
            const slitY = socketLen * (0.3 + i * 0.2);
            const slitR = getRadius(slitY);
            const slitGeo = new THREE.BoxGeometry(2, 0.1, 0.3);
            const slit = new THREE.Mesh(slitGeo, darkMat);
            slit.position.set(0, slitY, slitR + 0.1);
            group.add(slit);
        }
    }

    if (type === 'elbow') {
        const plateGeo = new THREE.CylinderGeometry(4, 4, 0.4, 32);
        const plate = new THREE.Mesh(plateGeo, accentMat);
        plate.position.y = -0.3;
        group.add(plate);

        for (let i = 0; i < 4; i++) {
            const angle = (Math.PI / 2) * i;
            const holeGeo = new THREE.CylinderGeometry(0.25, 0.25, 0.5, 12);
            const hole = new THREE.Mesh(holeGeo, darkMat);
            hole.position.set(Math.cos(angle) * 2, -0.3, Math.sin(angle) * 2);
            group.add(hole);
        }

        const topR = getRadius(topY);
        for (let s = 0; s < 2; s++) {
            const side = s === 0 ? 1 : -1;
            const tabShape = new THREE.Shape();
            tabShape.moveTo(0, -1);
            tabShape.lineTo(1.5, -1);
            tabShape.absarc(1.5, 0, 1, -Math.PI / 2, Math.PI / 2, false);
            tabShape.lineTo(0, 1);
            tabShape.lineTo(0, -1);
            const tabGeo = new THREE.ExtrudeGeometry(tabShape, { depth: 0.5, bevelEnabled: true, bevelSize: 0.1, bevelThickness: 0.05, bevelSegments: 2 });
            const tab = new THREE.Mesh(tabGeo, accentMat);
            tab.position.set(side * (topR + 0.5), topY - 1, 0);
            tab.rotation.y = side > 0 ? 0 : Math.PI;
            group.add(tab);

            const pinGeo = new THREE.CylinderGeometry(0.3, 0.3, 0.6, 12);
            const pin = new THREE.Mesh(pinGeo, darkMat);
            pin.position.set(side * (topR + 1.5), topY - 1, 0.25);
            pin.rotation.x = Math.PI / 2;
            group.add(pin);
        }
    }

    return group;
}

function createElectronicsBox(params) {
    const { outerProfile, socketLen } = buildSocketProfile(params);
    const len = params.boxLen;
    const wid = params.boxWid;
    let dep = params.boxDep;
    
    // Thick walls and heavy fillets for the "seamless flushed" organic look
    const wallT = 0.8; 
    const fillet = 0.8; 
    const flareAmount = 1.5; // How much it flares out at the base to merge into the socket
    const zFillet = 0.3; // Top lip rounding

    const mat = new THREE.MeshStandardMaterial({ color: 0xE8E8E8, roughness: 0.4, metalness: 0.1 });
    const darkMat = new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.5, metalness: 0.2 });

    const boxY = socketLen * (params.boxPos / 100);

    function getRadius(h) {
        if (!outerProfile || outerProfile.length < 2) return 5;
        for (let i = 0; i < outerProfile.length - 1; i++) {
            if (outerProfile[i].y <= h && outerProfile[i + 1].y >= h) {
                const t = (h - outerProfile[i].y) / (outerProfile[i + 1].y - outerProfile[i].y);
                return outerProfile[i].x + t * (outerProfile[i + 1].x - outerProfile[i].x);
            }
        }
        return outerProfile[outerProfile.length - 1]?.x || 5;
    }
    const socketR = getRadius(boxY);

    function buildRoundedRect(path, x, y, w, h, r) {
        const hw = w / 2, hh = h / 2;
        r = Math.min(r, hw, hh);
        path.moveTo(x - hw + r, y - hh);
        path.lineTo(x + hw - r, y - hh);
        path.quadraticCurveTo(x + hw, y - hh, x + hw, y - hh + r);
        path.lineTo(x + hw, y + hh - r);
        path.quadraticCurveTo(x + hw, y + hh, x + hw - r, y + hh);
        path.lineTo(x - hw + r, y + hh);
        path.quadraticCurveTo(x - hw, y + hh, x - hw, y + hh - r);
        path.lineTo(x - hw, y - hh + r);
        path.quadraticCurveTo(x - hw, y - hh, x - hw + r, y - hh);
    }

    // Outer shape
    const outerShape = new THREE.Shape();
    buildRoundedRect(outerShape, 0, 0, len, wid, fillet);
    // Inner hole for the bay
    const innerHole = new THREE.Path();
    buildRoundedRect(innerHole, 0, 0, len - wallT * 2, wid - wallT * 2, fillet * 0.4);
    outerShape.holes.push(innerHole);

    // Use bevel to get the rounded top edge
    const wallGeo = new THREE.ExtrudeGeometry(outerShape, {
        depth: dep,
        bevelEnabled: true,
        bevelThickness: zFillet,
        bevelSize: zFillet,
        bevelSegments: 4,
    });
    const wallMesh = new THREE.Mesh(wallGeo, mat);

    // Floor of the bay
    const floorShape = new THREE.Shape();
    buildRoundedRect(floorShape, 0, 0, len - wallT * 2 + 0.1, wid - wallT * 2 + 0.1, fillet * 0.4);
    const floorGeo = new THREE.ExtrudeGeometry(floorShape, { depth: 0.2, bevelEnabled: false });
    const floorMesh = new THREE.Mesh(floorGeo, mat);
    floorMesh.position.set(0, 0, 0);

    const boxGroup = new THREE.Group();
    boxGroup.add(wallMesh);
    boxGroup.add(floorMesh);

    // Cable exit hole
    const holeGeo = new THREE.CylinderGeometry(0.5, 0.5, wallT * 3, 16);
    const hole = new THREE.Mesh(holeGeo, darkMat);
    hole.rotation.z = Math.PI / 2;
    hole.position.set(len / 2, 0, 0.8);
    boxGroup.add(hole);
    
    // Glass/Screen Lid
    const glassShape = new THREE.Shape();
    buildRoundedRect(glassShape, 0, 0, len - wallT * 2 + 0.4, wid - wallT * 2 + 0.4, fillet * 0.4);
    const glassGeo = new THREE.ExtrudeGeometry(glassShape, { depth: 0.1, bevelEnabled: false });
    const glassMat = new THREE.MeshPhysicalMaterial({ 
        color: 0x88ccff, metalness: 0.1, roughness: 0.1, 
        transmission: 0.8, transparent: true, opacity: 0.6 
    });
    const glassMesh = new THREE.Mesh(glassGeo, glassMat);
    glassMesh.position.set(0, 0, dep - 0.2); 
    boxGroup.add(glassMesh);

    // SDF for normal and masking
    function sdRoundBox(x, y, L, W, R) {
        const qx = Math.abs(x) - L/2 + R;
        const qy = Math.abs(y) - W/2 + R;
        return Math.sqrt(Math.max(qx, 0)**2 + Math.max(qy, 0)**2) + Math.min(Math.max(qx, qy), 0) - R;
    }
    function getNormal(x, y, L, W, R) {
        const eps = 0.001;
        const nx = sdRoundBox(x + eps, y, L, W, R) - sdRoundBox(x - eps, y, L, W, R);
        const ny = sdRoundBox(x, y + eps, L, W, R) - sdRoundBox(x, y - eps, L, W, R);
        const l = Math.sqrt(nx*nx + ny*ny) || 1;
        return { nx: nx/l, ny: ny/l };
    }

    // Prepare User Tilt Rotations
    const boxRotX = (params.boxRotX || 0) * Math.PI / 180;
    const boxRotY = (params.boxRotY || 0) * Math.PI / 180;
    const boxRotZ = (params.boxRotZ || 0) * Math.PI / 180;
    const euler = new THREE.Euler(boxRotX, boxRotY, boxRotZ, 'XYZ');
    const rotMat = new THREE.Matrix4().makeRotationFromEuler(euler);

    boxGroup.updateMatrixWorld(true);

    boxGroup.children.forEach(mesh => {
        if (!mesh.isMesh) return;
        mesh.updateMatrix();
        const geo = mesh.geometry.clone();
        geo.applyMatrix4(mesh.matrix); // Bake local offsets (e.g. hole rotation, glass position)
        
        const pos = geo.attributes.position;
        for (let i = 0; i < pos.count; i++) {
            const vec = new THREE.Vector3().fromBufferAttribute(pos, i);
            let origZ = vec.z;
            
            // Only apply organic flare strictly to the outer enclosing wall mold
            if (mesh === wallMesh) {
                // Squash the bottom bevel to keep base absolutely flat before sag
                if (origZ < 0) vec.z = origZ = 0;

                const d = sdRoundBox(vec.x, vec.y, len, wid, fillet);
                let wallRatio = (d - (-wallT)) / wallT; 
                wallRatio = Math.max(0, Math.min(1, wallRatio)); 
                
                const zCurve = Math.pow(Math.max(0, 1 - origZ / dep), 2.0);
                const { nx, ny } = getNormal(vec.x, vec.y, len, wid, fillet);
                const flare = flareAmount * wallRatio * zCurve;
                
                vec.x += nx * flare;
                vec.y += ny * flare;
            }
            
            // Apply User Pivot / Tilt Rotation relative to the center origin
            vec.applyMatrix4(rotMat);
            
            // X-Shift (Tangential Shifting)
            const posX = (params.boxPosX || 0);
            vec.x += posX;

            // Compute ideal mapping to the cylinder surface
            // The box's center originates at Z = 0 on a plane tangent to the cylinder at X=0.
            // The cylinder surface relative to that plane is a negative Z curve.
            const rSq = socketR * socketR;
            const xSq = vec.x * vec.x;
            const surfaceZ = (xSq < rSq) ? (Math.sqrt(rSq - xSq) - socketR) : -socketR;

            // Melt: If the transformed point sits above the cylinder surface, stretch it down continuously like hot glue.
            // Only melt the base (origZ near 0), keeping top geometries (origZ=dep) totally undistorted.
            let stretchDown = 0;
            if (vec.z > surfaceZ) {
                const airGap = vec.z - surfaceZ;
                const meltFactor = Math.pow(Math.max(0, 1 - origZ / dep), 1.5); 
                stretchDown = airGap * meltFactor;
            }

            pos.setXYZ(i, vec.x, vec.y, vec.z - stretchDown);
        }
        
        pos.needsUpdate = true;
        geo.computeVertexNormals();

        // Overwrite and clear individual transforms as they are now perfectly baked inside the mesh itself
        mesh.geometry = geo;
        mesh.position.set(0, 0, 0);
        mesh.rotation.set(0, 0, 0);
        mesh.updateMatrix();
    });

    const mountAngleDeg = (params.boxAngle !== undefined) ? params.boxAngle : 180;
    const rotAngle = mountAngleDeg * Math.PI / 180;

    // Insert group into positioning layer over cylinder
    const positionGroup = new THREE.Group();
    positionGroup.add(boxGroup);
    positionGroup.position.set(0, 0, socketR - 0.1); 

    const rotGroup = new THREE.Group();
    rotGroup.add(positionGroup);
    rotGroup.position.y = boxY;
    rotGroup.rotation.y = rotAngle;

    const outerGroup = new THREE.Group();
    outerGroup.add(rotGroup);
    outerGroup.traverse(child => {
        // Exclude glass mesh from shadow so it doesn't cast dark internal blocks
        if (child.isMesh && child !== glassMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
        }
    });

    return outerGroup;
}

function createRibMeshes(params) {
    const ribs = [];
    const { outerProfile, socketLen } = buildSocketProfile(params);
    const mat = new THREE.MeshStandardMaterial({ color: 0xD0D0D0, roughness: 0.35, metalness: 0.15 });

    function getRadius(h) {
        if (!outerProfile || outerProfile.length < 2) return 5;
        for (let i = 0; i < outerProfile.length - 1; i++) {
            if (outerProfile[i].y <= h && outerProfile[i + 1].y >= h) {
                const t = (h - outerProfile[i].y) / (outerProfile[i + 1].y - outerProfile[i].y);
                return outerProfile[i].x + t * (outerProfile[i + 1].x - outerProfile[i].x);
            }
        }
        return outerProfile[outerProfile.length - 1]?.x || 5;
    }

    APP.ribs.forEach(rib => {
        const ribY = socketLen * (rib.position / 100);
        const r = getRadius(ribY);
        if (r < 1) return;
        const ribGeo = new THREE.TorusGeometry(r + 0.1, 0.15, 8, 48);
        const ribMesh = new THREE.Mesh(ribGeo, mat);
        ribMesh.position.y = ribY;
        ribMesh.rotation.x = Math.PI / 2;
        ribMesh.castShadow = true;
        ribs.push(ribMesh);
    });

    return ribs;
}

function deformSocketOval(socketMesh, params) {
    const geo = socketMesh.geometry;
    const positions = geo.attributes.position;
    const socketLen = params.stumpLength + 2 + params.trimLineOffset / 10;

    for (let i = 0; i < positions.count; i++) {
        const y = positions.getY(i);
        const normY = y / socketLen;
        if (normY > 0.65) {
            const factor = (normY - 0.65) / 0.35;
            const x = positions.getX(i);
            const z = positions.getZ(i);
            positions.setX(i, x * (1 + 0.15 * factor));
            positions.setZ(i, z * (1 - 0.1 * factor));
        }
    }
    positions.needsUpdate = true;
    geo.computeVertexNormals();
}
