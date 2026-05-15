/* ================================================================
   GLOBAL STATE
   ================================================================ */
window.APP = {
    scene: null, camera: null, renderer: null, controls: null,
    stumpGroup: null, socketGroup: null, electronicsGroup: null,
    clipPlane: null,
    viewMode: 'both',
    isMirrored: false,
    undoStack: [], redoStack: [], maxHistory: 10,
    ribs: [],
    modelVolume: 0,
    animationId: null,
    currentScreen: 1,
    params: {
        stumpType: 'transradial',
        measurements: [
            { dist: 0, diam: 6 },
            { dist: 5, diam: 8 },
            { dist: 10, diam: 9.5 },
            { dist: 15, diam: 10.5 },
            { dist: 20, diam: 11 }
        ],
        stumpLength: 22,
        tipShape: 'rounded',
        side: 'left',
        linerThick: 3,
        wallThick: 4,
        scale: 100,
        trimLineOffset: 0,
        proximalFlare: 3,
        smoothLevel: 3,
        boxEnabled: true,
        boxLen: 8, boxWid: 5, boxDep: 3,
        boxPos: 50, boxPosX: 0, boxAngle: 180,
        boxRotX: 0, boxRotY: 0, boxRotZ: 0,
        holes: []
    }
};
