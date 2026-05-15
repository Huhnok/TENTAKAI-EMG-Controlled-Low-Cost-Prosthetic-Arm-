/* ================================================================
   WEB APP LOGIC & UI BINDING
   ================================================================ */

document.addEventListener('DOMContentLoaded', () => {
    initScene();
    initUI();
    // Default to Screen 1
    showScreen(1);
});

// ==================== NAVIGATION / SCREENS ====================
function showScreen(stepNum) {
    APP.currentScreen = stepNum;
    
    // Hide all screens
    document.querySelectorAll('.app-screen').forEach(s => s.classList.remove('active'));
    // Deactivate all steps
    const dots = document.querySelectorAll('.step-item');
    dots.forEach((d, i) => {
        d.classList.remove('active', 'done');
        if (i < stepNum - 1) d.classList.add('done');
        else if (i === stepNum - 1) d.classList.add('active');
    });

    if (stepNum === 1) {
        document.getElementById('screen-measurements').classList.add('active');
    } else if (stepNum === 2) {
        document.getElementById('screen-modeling').classList.add('active');
        saveState();
        readMeasurementsFromUI();
        generateModels();
        setTimeout(() => {
            const container = document.getElementById('viewport-container');
            const toolbarH = document.getElementById('viewport-toolbar').offsetHeight;
            const rect = container.getBoundingClientRect();
            APP.renderer.setSize(rect.width, rect.height - toolbarH);
            APP.camera.aspect = rect.width / (rect.height - toolbarH);
            APP.camera.updateProjectionMatrix();
        }, 50);
    } else if (stepNum === 3) {
        document.getElementById('screen-export').classList.add('active');
        updatePrintCard(APP.params); // Refresh volume estimate
    }
}

// ==================== THREE.JS SCENE SETUP ====================
function initScene() {
    const canvas = document.getElementById('viewport-canvas');
    const container = document.getElementById('viewport-container');

    APP.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    APP.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    APP.renderer.setClearColor(0x1A1A2E);
    APP.renderer.shadowMap.enabled = true;
    APP.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    APP.renderer.localClippingEnabled = true;

    APP.scene = new THREE.Scene();
    APP.scene.fog = new THREE.Fog(0x1A1A2E, 80, 200);

    APP.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 500);
    APP.camera.position.set(20, 18, 30);
    APP.camera.lookAt(0, 8, 0);

    APP.controls = new THREE.OrbitControls(APP.camera, canvas);
    APP.controls.enableDamping = true;
    APP.controls.dampingFactor = 0.08;
    APP.controls.target.set(0, 8, 0);
    APP.controls.minDistance = 5;
    APP.controls.maxDistance = 120;

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.45);
    APP.scene.add(ambientLight);

    const dirLight1 = new THREE.DirectionalLight(0xffffff, 0.7);
    dirLight1.position.set(15, 25, 20);
    dirLight1.castShadow = true;
    dirLight1.shadow.mapSize.set(1024, 1024);
    APP.scene.add(dirLight1);

    const dirLight2 = new THREE.DirectionalLight(0xc9d1ff, 0.35);
    dirLight2.position.set(-10, 15, -15);
    APP.scene.add(dirLight2);

    const hemiLight = new THREE.HemisphereLight(0xadc1ff, 0x384860, 0.25);
    APP.scene.add(hemiLight);

    const gridHelper = new THREE.GridHelper(60, 30, 0x2a2a4a, 0x1f1f3a);
    gridHelper.position.y = -0.01;
    APP.scene.add(gridHelper);

    APP.clipPlane = new THREE.Plane(new THREE.Vector3(0, 0, -1), 0);

    window.addEventListener('resize', () => {
        if (APP.currentScreen !== 2) return;
        const rect = container.getBoundingClientRect();
        const toolbarH = document.getElementById('viewport-toolbar').offsetHeight;
        APP.renderer.setSize(rect.width, rect.height - toolbarH);
        APP.camera.aspect = rect.width / (rect.height - toolbarH);
        APP.camera.updateProjectionMatrix();
    });
    
    animate();
}

function animate() {
    APP.animationId = requestAnimationFrame(animate);
    if (APP.currentScreen === 2 && APP.renderer) {
        APP.controls.update();
        APP.renderer.render(APP.scene, APP.camera);
    }
}

// ==================== GENERATOR ====================
function generateModels() {
    const overlay = document.getElementById('loading-overlay');
    if (overlay) overlay.classList.add('show');
    
    requestAnimationFrame(() => {
    setTimeout(() => {
        try {
            if (APP.stumpGroup) { APP.scene.remove(APP.stumpGroup); disposeGroup(APP.stumpGroup); }
            if (APP.socketGroup) { APP.scene.remove(APP.socketGroup); disposeGroup(APP.socketGroup); }
            if (APP.electronicsGroup) { APP.scene.remove(APP.electronicsGroup); disposeGroup(APP.electronicsGroup); }

            const p = APP.params;
            const scaleFactor = p.scale / 100;
            const maxDiam = Math.max(...p.measurements.map(m => m.diam));
            const separation = maxDiam + 6;

            APP.stumpGroup = new THREE.Group();
            const stumpMesh = createStumpMesh(p);
            APP.stumpGroup.add(stumpMesh);
            APP.stumpGroup.position.x = -separation / 2;
            APP.stumpGroup.scale.set(scaleFactor, scaleFactor, scaleFactor);
            if (APP.isMirrored) APP.stumpGroup.scale.x *= -1;
            APP.scene.add(APP.stumpGroup);

            APP.socketGroup = new THREE.Group();
            const socketMesh = createSocketMesh(p);
            APP.socketGroup.add(socketMesh);
            const features = createTypeFeatures(p);
            APP.socketGroup.add(features);
            createRibMeshes(p).forEach(r => APP.socketGroup.add(r));

            if (p.stumpType === 'elbow') deformSocketOval(socketMesh, p);

            APP.socketGroup.position.x = separation / 2;
            APP.socketGroup.scale.set(scaleFactor, scaleFactor, scaleFactor);
            if (APP.isMirrored) APP.socketGroup.scale.x *= -1;
            APP.scene.add(APP.socketGroup);

            if (p.boxEnabled !== false) {
                APP.electronicsGroup = createElectronicsBox(p);
                APP.electronicsGroup.position.x = separation / 2;
                APP.electronicsGroup.scale.set(scaleFactor, scaleFactor, scaleFactor);
                if (APP.isMirrored) APP.electronicsGroup.scale.x *= -1;
                APP.scene.add(APP.electronicsGroup);
            }

            updateVisibility();
        } catch (err) {
            console.error('Model generation error:', err);
        } finally {
            if (overlay) overlay.classList.remove('show');
        }
    }, 50);
    });
}

function updateVisibility() {
    const clips = APP.viewMode === 'cross' ? [APP.clipPlane] : [];
    [APP.stumpGroup, APP.socketGroup, APP.electronicsGroup].forEach(group => {
        if (!group) return;
        const isSocket = group === APP.socketGroup || group === APP.electronicsGroup;
        const isStump = group === APP.stumpGroup;
        if (APP.viewMode === 'both' || APP.viewMode === 'cross') group.visible = true;
        else if (APP.viewMode === 'socket') group.visible = isSocket;
        else if (APP.viewMode === 'stump') group.visible = isStump;
        
        group.traverse(child => { if (child.isMesh) child.material.clippingPlanes = clips; });
    });
}

function disposeGroup(group) {
    group.traverse(child => {
        if (child.geometry) child.geometry.dispose();
        if (child.material) {
            if (Array.isArray(child.material)) child.material.forEach(m => m.dispose());
            else child.material.dispose();
        }
    });
}

// ==================== UI INITIALIZATION ====================
function initUI() {
    // Navigation Buttons
    document.getElementById('nav-to-2')?.addEventListener('click', () => showScreen(2));
    document.getElementById('nav-to-1')?.addEventListener('click', () => showScreen(1));
    document.getElementById('nav-to-3')?.addEventListener('click', () => showScreen(3));
    document.getElementById('nav-to-2-back')?.addEventListener('click', () => showScreen(2));
    document.getElementById('nav-start-over')?.addEventListener('click', () => {
        if(confirm('Are you sure you want to start over?')) location.reload();
    });

    renderMeasurementRows();

    // Measurement & Stump Forms
    document.getElementById('stump-type')?.addEventListener('change', (e) => {
        APP.params.stumpType = e.target.value;
        loadDefaultsForType(e.target.value);
    });
    document.getElementById('add-meas-btn')?.addEventListener('click', () => {
        const lastDist = APP.params.measurements.length > 0
            ? APP.params.measurements[APP.params.measurements.length - 1].dist + 3 : 0;
        APP.params.measurements.push({ dist: lastDist, diam: 10 });
        renderMeasurementRows();
    });

    document.querySelectorAll('input[name="tip-shape"]').forEach(r => {
        r.addEventListener('change', () => { APP.params.tipShape = r.value; });
    });
    document.querySelectorAll('#side-toggle button').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('#side-toggle button').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            APP.params.side = btn.dataset.val;
        });
    });
    document.getElementById('stump-length')?.addEventListener('change', (e) => {
        APP.params.stumpLength = parseFloat(e.target.value) || 22;
    });

    // Binding Right Panel Sliders (Modeling Screen)
    bindSlider('adj-scale', 'scale-val', v => `${v}%`, v => { APP.params.scale = v; liveUpdate(); });
    bindSlider('adj-wall', 'adj-wall-val', v => `${v} mm`, v => { APP.params.wallThick = v; liveUpdate(); });
    bindSlider('adj-liner', 'adj-liner-val', v => `${v} mm`, v => { APP.params.linerThick = v; liveUpdate(); });
    bindSlider('adj-trim', 'adj-trim-val', v => `${v} mm`, v => { APP.params.trimLineOffset = v; liveUpdate(); });
    bindSlider('adj-flare', 'adj-flare-val', v => `${v} mm`, v => { APP.params.proximalFlare = v; liveUpdate(); });
    bindSlider('adj-smooth', 'adj-smooth-val', v => v, v => { APP.params.smoothLevel = v; liveUpdate(); });

    // Box Controls
    document.getElementById('box-enabled')?.addEventListener('change', (e) => {
        APP.params.boxEnabled = e.target.checked;
        document.getElementById('box-controls').style.opacity = e.target.checked ? '1' : '0.5';
        document.getElementById('box-controls').style.pointerEvents = e.target.checked ? 'auto' : 'none';
        liveUpdate();
    });
    bindSlider('box-len', 'box-len-val', v => `${v} cm`, v => { APP.params.boxLen = v; liveUpdate(); });
    bindSlider('box-wid', 'box-wid-val', v => `${v} cm`, v => { APP.params.boxWid = v; liveUpdate(); });
    bindSlider('box-dep', 'box-dep-val', v => `${v} cm`, v => { APP.params.boxDep = v; liveUpdate(); });
    bindSlider('box-pos', 'box-pos-val', v => `${v}%`, v => { APP.params.boxPos = v; liveUpdate(); });
    bindSlider('box-pos-x', 'box-pos-x-val', v => `${v} cm`, v => { APP.params.boxPosX = v; liveUpdate(); });
    bindSlider('box-rot-x', 'box-rot-x-val', v => `${v}°`, v => { APP.params.boxRotX = v; liveUpdate(); });
    bindSlider('box-rot-y', 'box-rot-y-val', v => `${v}°`, v => { APP.params.boxRotY = v; liveUpdate(); });
    bindSlider('box-rot-z', 'box-rot-z-val', v => `${v}°`, v => { APP.params.boxRotZ = v; liveUpdate(); });
    bindSlider('box-angle', 'box-angle-val', v => `${v}°`, v => { APP.params.boxAngle = v; liveUpdate(); });

    // Viewport Toggle
    document.querySelectorAll('#viewport-toolbar .vp-btn[data-view]').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('#viewport-toolbar .vp-btn[data-view]').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            APP.viewMode = btn.dataset.view;
            updateVisibility();
        });
    });
    document.getElementById('btn-reset-cam')?.addEventListener('click', () => {
        APP.camera.position.set(20, 18, 30);
        APP.controls.target.set(0, 8, 0);
        APP.controls.update();
    });

    // Ribs
    document.getElementById('add-rib-btn')?.addEventListener('click', () => {
        if (APP.ribs.length >= 5) return;
        APP.ribs.push({ position: 50 });
        renderRibs();
        liveUpdate();
    });

    // Holes
    document.getElementById('add-hole-btn')?.addEventListener('click', () => {
        if (APP.params.holes.length >= 20) return;
        APP.params.holes.push({ type: 'triangle', posY: 50, angle: 0, scale: 1 });
        renderHoles();
        liveUpdate();
    });

    // Mirror, Undo, Redo
    document.getElementById('mirror-btn')?.addEventListener('click', () => {
        APP.isMirrored = !APP.isMirrored;
        if (APP.stumpGroup) APP.stumpGroup.scale.x *= -1;
        if (APP.socketGroup) APP.socketGroup.scale.x *= -1;
        if (APP.electronicsGroup) APP.electronicsGroup.scale.x *= -1;
    });
    document.getElementById('undo-btn')?.addEventListener('click', undo);
    document.getElementById('redo-btn')?.addEventListener('click', redo);

    // Export
    document.getElementById('exp-stl')?.addEventListener('click', exportSTL);
    document.getElementById('exp-obj')?.addEventListener('click', exportOBJ);
    document.getElementById('exp-pdf')?.addEventListener('click', exportMeasurements);
}

function bindSlider(sliderId, valId, fmt, onChange) {
    const slider = document.getElementById(sliderId);
    const valEl = document.getElementById(valId);
    if (!slider || !valEl) return;
    slider.value = APP.params[sliderId === 'adj-wall' ? 'wallThick' : (sliderId === 'adj-liner' ? 'linerThick' : (sliderId.replace('adj-','').replace('-','')) )] || slider.value;
    slider.addEventListener('input', () => {
        valEl.textContent = fmt(parseFloat(slider.value));
        if (onChange) onChange(parseFloat(slider.value));
    });
}
function liveUpdate() {
    clearTimeout(window.liveUpdateTimer);
    window.liveUpdateTimer = setTimeout(() => {
        saveState();
        generateModels();
    }, 250);
}

function renderMeasurementRows() {
    const container = document.getElementById('meas-rows');
    if (!container) return;
    container.innerHTML = '';
    APP.params.measurements.sort((a, b) => a.dist - b.dist);
    APP.params.measurements.forEach((m, i) => {
        const row = document.createElement('div');
        row.className = 'meas-row';
        row.innerHTML = `
            <input type="number" value="${m.dist}" min="0" max="60" step="0.5" data-idx="${i}" data-field="dist">
            <input type="number" value="${m.diam}" min="3" max="20" step="0.1" data-idx="${i}" data-field="diam">
            <button class="remove-btn" data-idx="${i}">&times;</button>
        `;
        container.appendChild(row);
    });
    container.querySelectorAll('input').forEach(inp => {
        inp.addEventListener('change', (e) => {
            const idx = parseInt(e.target.dataset.idx);
            const field = e.target.dataset.field;
            let val = parseFloat(e.target.value);
            APP.params.measurements[idx][field] = val;
        });
    });
    container.querySelectorAll('.remove-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            if (APP.params.measurements.length <= 3) return;
            APP.params.measurements.splice(parseInt(e.target.dataset.idx), 1);
            renderMeasurementRows();
        });
    });
}

function renderRibs() {
    const container = document.getElementById('rib-list');
    if (!container) return;
    container.innerHTML = '';
    APP.ribs.forEach((rib, i) => {
        const row = document.createElement('div');
        row.className = 'rib-row';
        row.innerHTML = `<span style="font-size:11px;color:#64748b;">Rib ${i+1}</span>
            <input type="range" min="10" max="90" value="${rib.position}" step="1">
            <button class="remove-btn" data-idx="${i}">&times;</button>`;
        container.appendChild(row);
        row.querySelector('input').addEventListener('input', (e) => {
            APP.ribs[i].position = parseInt(e.target.value); liveUpdate();
        });
        row.querySelector('.remove-btn').addEventListener('click', () => {
            APP.ribs.splice(i, 1); renderRibs(); liveUpdate();
        });
    });
}

function renderHoles() {
    const container = document.getElementById('hole-list');
    if (!container) return;
    container.innerHTML = '';
    APP.params.holes.forEach((hole, i) => {
        const row = document.createElement('div');
        row.style.background = 'var(--panel-bg)';
        row.style.padding = '8px';
        row.style.borderRadius = '4px';
        row.style.border = '1px solid var(--border-color)';
        row.style.display = 'flex';
        row.style.flexDirection = 'column';
        row.style.gap = '6px';
        
        row.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center;">
                <span style="font-size:11px; font-weight:600; color:var(--primary-color);">Cutout ${i + 1}</span>
                <button class="remove-btn" data-idx="${i}" style="margin:0;">&times;</button>
            </div>
            <div style="display:flex; justify-content:space-between; align-items:center; gap:8px;">
                <select class="hole-type-select" style="flex:1;">
                    <option value="triangle" ${hole.type === 'triangle' ? 'selected' : ''}>Triangle</option>
                    <option value="hexagon" ${hole.type === 'hexagon' ? 'selected' : ''}>Hexagon</option>
                    <option value="circle" ${hole.type === 'circle' ? 'selected' : ''}>Circle</option>
                    <option value="square" ${hole.type === 'square' ? 'selected' : ''}>Square</option>
                </select>
                <div style="display:flex; align-items:center; gap:4px; font-size:11px;">
                    Scale: <input class="hole-scale" type="range" min="0.5" max="3" value="${hole.scale}" step="0.1" style="width:50px; margin:0;">
                </div>
            </div>
            <div style="display:flex; align-items:center; gap:4px; font-size:11px;">
                Height: <input class="hole-y" type="range" min="10" max="90" value="${hole.posY}" step="1" style="flex:1; margin:0;">
            </div>
            <div style="display:flex; align-items:center; gap:4px; font-size:11px;">
                Angle: <input class="hole-angle" type="range" min="0" max="360" value="${hole.angle}" step="1" style="flex:1; margin:0;">
            </div>
        `;
        container.appendChild(row);

        row.querySelector('.remove-btn').addEventListener('click', () => {
            APP.params.holes.splice(i, 1); renderHoles(); liveUpdate();
        });
        row.querySelector('.hole-type-select').addEventListener('change', (e) => {
            hole.type = e.target.value; liveUpdate();
        });
        row.querySelector('.hole-scale').addEventListener('input', (e) => {
            hole.scale = parseFloat(e.target.value); liveUpdate();
        });
        row.querySelector('.hole-y').addEventListener('input', (e) => {
            hole.posY = parseFloat(e.target.value); liveUpdate();
        });
        row.querySelector('.hole-angle').addEventListener('input', (e) => {
            hole.angle = parseFloat(e.target.value); liveUpdate();
        });
    });
}

function readMeasurementsFromUI() {
    const inputs = document.querySelectorAll('#meas-rows input');
    inputs.forEach(inp => {
        APP.params.measurements[parseInt(inp.dataset.idx)][inp.dataset.field] = parseFloat(inp.value) || 0;
    });
    APP.params.stumpLength = parseFloat(document.getElementById('stump-length').value) || 22;
    APP.params.stumpType = document.getElementById('stump-type').value;
    APP.params.tipShape = document.querySelector('input[name="tip-shape"]:checked').value;
}

function loadDefaultsForType(type) {
    const defaults = {
        transradial: { length: 22, meas: [{dist:0,diam:6},{dist:5,diam:8},{dist:10,diam:9.5},{dist:15,diam:10.5},{dist:20,diam:11}] },
        wrist: { length: 25, meas: [{dist:0,diam:5.5},{dist:5,diam:7},{dist:12,diam:8.5},{dist:18,diam:9},{dist:22,diam:10},{dist:25,diam:9.5}] },
        transhumeral: { length: 15, meas: [{dist:0,diam:8},{dist:4,diam:10},{dist:8,diam:11},{dist:12,diam:11.5},{dist:15,diam:12}] },
        elbow: { length: 18, meas: [{dist:0,diam:6.5},{dist:4,diam:8.5},{dist:9,diam:9.5},{dist:14,diam:10},{dist:18,diam:12}] },
    };
    const d = defaults[type] || defaults.transradial;
    APP.params.stumpLength = d.length;
    APP.params.measurements = JSON.parse(JSON.stringify(d.meas));
    document.getElementById('stump-length').value = d.length;
    renderMeasurementRows();
}

function saveState() {
    APP.undoStack.push(JSON.parse(JSON.stringify(APP.params)));
    if (APP.undoStack.length > APP.maxHistory) APP.undoStack.shift();
    APP.redoStack = [];
}
function undo() {
    if (APP.undoStack.length === 0) return;
    APP.redoStack.push(JSON.parse(JSON.stringify(APP.params)));
    APP.params = APP.undoStack.pop();
    syncUIFromParams(); generateModels();
}
function redo() {
    if (APP.redoStack.length === 0) return;
    APP.undoStack.push(JSON.parse(JSON.stringify(APP.params)));
    APP.params = APP.redoStack.pop();
    syncUIFromParams(); generateModels();
}
function syncUIFromParams() {
    document.getElementById('adj-trim').value = APP.params.trimLineOffset;
    document.getElementById('adj-scale').value = APP.params.scale;
    renderMeasurementRows();
}

function updatePrintCard(params) {
    const filamentG = APP.modelVolume * 1.24 || 0;
    document.getElementById('rec-filament').textContent = `~${Math.round(filamentG)} g (${(filamentG / 1000).toFixed(2)} kg)`;
    document.getElementById('rec-supports').textContent = (params.stumpType === 'transhumeral' || params.stumpType === 'elbow') ? 'Required' : 'Minimal';
}

function exportSTL() {
    if (!APP.socketGroup) { alert('No model!'); return; }
    const exporter = new THREE.STLExporter();
    const group = new THREE.Group();
    if(APP.socketGroup) group.add(APP.socketGroup.clone());
    if(APP.electronicsGroup && APP.params.boxEnabled !== false) group.add(APP.electronicsGroup.clone());
    downloadBlob(new Blob([exporter.parse(group, { binary: true })], { type: 'application/octet-stream' }), `socket_${Date.now()}.stl`);
}
function exportOBJ() {
    if (!APP.socketGroup) { alert('No model!'); return; }
    const exporter = new THREE.OBJExporter();
    const group = new THREE.Group();
    if(APP.socketGroup) group.add(APP.socketGroup.clone());
    if(APP.electronicsGroup && APP.params.boxEnabled !== false) group.add(APP.electronicsGroup.clone());
    downloadBlob(new Blob([exporter.parse(group)], { type: 'text/plain' }), `socket_${Date.now()}.obj`);
}
function exportMeasurements() {
    const text = `PROSTHETIC SOCKET REPORT\nLength: ${APP.params.stumpLength}cm\nType: ${APP.params.stumpType}\n`;
    downloadBlob(new Blob([text], { type: 'text/plain' }), `report_${Date.now()}.txt`);
}
function downloadBlob(blob, filename) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
}
