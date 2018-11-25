
"use strict";

const REGL = require('regl'); // Awesome webgl library of awesomeness.
const { mat4, vec3, vec2 } = require('gl-matrix'); // Matrix/vector math library.
const glsl = require('glslify'); // I don't know how to describe this in a sentence.
const createCube = require("primitive-cube"); // Cube mesh generator.
const unindex = require("unindex-mesh"); // Mesh de-indexer.
const renderEnvMap = require("regl-render-envmap"); // Renders an environment map.

const given = require('./given'); // Constatns for the game.

module.exports = async function Renderer(canvas) {

  // Create our webgl context. Get the float texture extension and disable
  // antialiasing.
  const regl = REGL({
    canvas: canvas,
    extensions: ['OES_texture_float'],
    attributes: {
      antialias: false
    },
  });

  // Load the wall and ground textures.
  const tWall = regl.texture(await loadImage(given.wallImage));
  const tGround = regl.texture(await loadImage(given.groundImage));

  // Create a set of pingpong fromeboffers.
  const pingPong = [
    regl.framebuffer({
      width: canvas.width,
      height: canvas.height,
      colorType: 'float'
    }),
    regl.framebuffer({
      width: canvas.width,
      height: canvas.height,
      colorType: 'float'
    }),
  ];

  // Keep track of our pingpong framebuffers.
  let pingPongIndex = 0;

  // Create a texture of random normalized 3D vectors.
  const tRand3 = regl.texture({
    width: 1024,
    height: 1024,
    format: 'rgb',
    type: 'float',
    wrap: 'repeat',
    data: randVec3(1024),
  });

  // Create a texture of uniform 2D vectors for use when antialiasing.
  const tJitter = regl.texture({
    width: 1024,
    height: 1024,
    format: 'luminance alpha',
    type: 'float',
    wrap: 'repeat',
    data: jitter(1024),
  });

  // Initialize our stage object with fake data.
  const stage = {
    width: 3,
    height: 3,
    depth: 3,
    potSize: 16,
    texture: regl.texture(),
  }

  // Create a cube mesh. We'll use this to render the player sphere texture to
  // a cube map.
  const cube = unindex(createCube(1));

  // The command we'll use to render our player's sphere texture.
  const playerTextureCmd = regl({
    vert: glsl(__dirname + '/glsl/player-texture.vert'),
    frag: glsl(__dirname + '/glsl/player-texture.frag'),
    attributes: {
      position: cube,
    },
    uniforms: {
      view: regl.prop("view"),
      projection: regl.prop("projection"),
    },
    viewport: regl.prop("viewport"),
    framebuffer: regl.prop("framebuffer"),
    count: cube.length / 3,
  });

  // Render the cube map for the player's sphere texture.
  const tPlayerTexture = renderEnvMap(regl, function(config) {
    regl.clear({
      color: [0, 0, 0, 1],
      depth: 1,
      framebuffer: config.framebuffer,
    });
    playerTextureCmd({
      view: config.view,
      projection: config.projection,
      viewport: config.viewport,
      framebuffer: config.framebuffer,
    });
  });

  // The command we'll use to sample a single frame of path tracing. We'll average
  // multiple frames tegether before presenting them to the user.
  const sampleCmd = regl({
    vert: glsl(__dirname + '/glsl/sample.vert'),
    frag: glsl(__dirname + '/glsl/sample.frag'),
    attributes: {
      position: ndcBox,
    },
    uniforms: {
      source: regl.prop('source'),
      invpv: regl.prop('invpv'),
      eye: regl.prop('eye'),
      resolution: regl.prop('res'),
      playerColor: regl.prop('playerColor'),
      playerRadius: given.player.radius,
      tJitter: tJitter,
      tRand3: tRand3,
      tPlayerTexture: tPlayerTexture,
      tGround: tGround,
      tWall: tWall,
      tOffset: regl.prop('tOffset'),
      tStage: stage.texture,
      playerPosition: regl.prop('playerPosition'),
      lRot: regl.prop('lRot'),
      time: regl.prop('time'),
      resStage: regl.prop('tStageSize'),
      bounds: regl.prop('bounds'),
    },
    viewport: regl.prop('viewport'),
    framebuffer: regl.prop('destination'),
    count: 6,
  });

  // We'll use this command to render the sampled data to the screen.
  const compositeCmd = regl({
    vert: glsl(__dirname + '/glsl/composite.vert'),
    frag: glsl(__dirname + '/glsl/composite.frag'),
    attributes: {
      position: ndcBox,
    },
    uniforms: {
      source: regl.prop('source'),
      count: regl.prop('count'),
    },
    viewport: regl.prop('viewport'),
    count: 6,
  });

  // Create the texture for the voxel scene data.
  function setStage(s) {
    stage.width = s.size;
    stage.height = s.size;
    stage.depth = s.depth;
    stage.potSize = fitPOT(stage.width * stage.height * s.depth);
    const stageData = new Uint8Array(stage.potSize * stage.potSize);
    stageData.fill(0);
    for (let x = 0; x < stage.width; x++) {
      for (let y = 0; y < stage.height; y++) {
        for (let z = 0; z < stage.depth; z++) {
          const d = s.data[[x,y,z]];
          if (d) {
            const i = y * stage.width * stage.depth + z * stage.width + x;
            stageData[i] = d;
          }
        }
      }
    }
    stage.texture({
      width: stage.potSize,
      height: stage.potSize,
      format: 'alpha',
      data: stageData,
    });
  }

  // Handle window resizes.
  function onResize() {
    canvas.height = canvas.clientHeight / 4;
    canvas.width = canvas.clientWidth / 4;
    pingPong[0]({
      width: canvas.width,
      height: canvas.height,
      colorType: 'float'
    });
    pingPong[1]({
      width: canvas.width,
      height: canvas.height,
      colorType: 'float'
    });
  }
  window.addEventListener('resize', onResize);

  // Initial sizing.
  onResize();

  // Render all the things!
  function render(player, cam) {

    // Get the 3D player position.
    const playerPosition = [player.position[0], player.position[1], 1 + given.player.radius];

    // Get the 3D camera position, target, and up vectors.
    const eye = [cam[0], cam[1] - 1, stage.depth + 4];
    const center = [eye[0], eye[1] + 1, 0];
    const up = [0, 1, 0];

    // Create the projection and view matrices and get the inverse projection * view
    // matrix.
    const proj = mat4.perspective([], Math.PI/3, canvas.width/canvas.height, 0.1, 1000);
    const view = mat4.lookAt([], eye, center, up);
    const pv = mat4.multiply([], proj, view);
    const invpv = mat4.invert([], pv);

    // Clear the current pingpong FBO.
    regl.clear({
      color: [0, 0, 0, 0],
      framebuffer: pingPong[1 - pingPongIndex],
    });

    // Figure out the current time so that we can set the sun position.
    let time = performance.now() * 0.00001 + 0.1;

    // We'll take this many samples before rendering to the screen.
    let sampleCount = 4;

    // Take sampleCount samples.
    for (let i = 0; i < sampleCount; i++) {
      regl.clear({
        depth: 1,
        framebuffer: pingPong[pingPongIndex],
      });
      sampleCmd({
        eye: eye,
        invpv: invpv,
        res: [canvas.width, canvas.height],
        tOffset: vec2.random([]),
        playerColor: player.color,
        playerPosition: playerPosition,
        time: time,
        lRot: player.rotation,
        tStageSize: stage.potSize,
        bounds: [stage.width, stage.height, stage.depth],
        viewport: {x: 0, y: 0, width: canvas.width, height: canvas.height},
        source: pingPong[1 - pingPongIndex],
        destination: pingPong[pingPongIndex],
      });
      pingPongIndex = 1 - pingPongIndex;
    }

    // Render to the screen.
    compositeCmd({
      source: pingPong[1 - pingPongIndex],
      count: sampleCount,
      viewport: {x: 0, y: 0, width: canvas.width, height: canvas.height},
    });

  }

  return {
    render: render,
    setStage: setStage
  }

}

// Full screen 2D mesh.
const ndcBox = [
  -1, -1,
   1, -1,
   1,  1,
  -1, -1,
   1,  1,
  -1,  1
]

// Find a 2D power-of-two resolution that will fit at least count pixels.
function fitPOT(count) {
  let size = 1;
  while (size * size < count) {
    size *= 2;
  }
  return size;
}

// Generate a set of random 3D vectors.
function randVec3(size) {
  const data = new Float32Array(size * size * 3);
  for (let i = 0; i < size * size; i++) {
    let r = vec3.random([]);
    data[i * 3 + 0] = r[0];
    data[i * 3 + 1] = r[1];
    data[i * 3 + 2] = r[2];
  }
  return data;
}

// Generate a set of random 2D vectors suitable for AA jitter.
function jitter(size) {
  const data = new Float32Array(size * size * 2);
  for (let i = 0; i < size * size; i++) {
    data[i * 2 + 0] = Math.random() - 0.5;
    data[i * 2 + 1] = Math.random() - 0.5;
  }
  return data;
};

// async/await image loading utility
function loadImage(src) {
  return new Promise((resolve, reject) => {
    let i = new Image();
    i.onload = () => {
      resolve(i);
    };
    i.onerror = reject;
    i.src = src;
  });
}
