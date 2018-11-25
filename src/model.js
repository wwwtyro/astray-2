"use strict";

const pl = require("planck-js"); // Physics library.
const { mat4, vec2, vec3 } = require("gl-matrix"); // Matrix/vector math library.

const given = require("./given"); // Constants for the game.

module.exports = function Model(level, onPlayerContact) {
  // Define the stage. Size is x,y dimension, depth is z, data will store the
  // voxel scene.
  const stage = {
    size: 2 * given.margin + given.initialSize + given.levelIncrease * level,
    depth: 3,
    data: {}
  };

  // Generate a maze with a margin of ground around it.
  const maze = generateSquareMaze(stage.size - given.margin * 2);

  // Unset the exit to the maze so that the player can exit. Top right.
  maze[
    [stage.size - (2 * given.margin + 1), stage.size - (2 * given.margin + 2)]
  ] = false;

  // Create the Planck world object.
  const world = pl.World({
    gravity: pl.Vec2(0, 0)
  });

  // A couple of constants to define voxel types. The renderer (View) will use
  // these to determine which textures to render.
  const typeGround = 1;
  const typeWall = 2;

  // Step through the stage area.
  for (let x = 0; x < stage.size; x++) {
    for (let y = 0; y < stage.size; y++) {
      // Set the ground voxel everywhere.
      stage.data[[x, y, 0]] = typeGround;
      if (maze[[x - given.margin, y - given.margin]]) {
        // If the maze is set at x,y (offset by the margin so that the maze is
        // centered), create a wall voxel.
        stage.data[[x, y, 1]] = typeWall;
        // Randomly increase the wall height to 2.
        if (Math.random() < 0.9) {
          stage.data[[x, y, 2]] = typeWall;
        }
        // Create a physics object representing the wall voxel.
        world
          .createBody({
            position: pl.Vec2(x + 0.5, y + 0.5)
          })
          .createFixture(pl.Box(0.5, 0.5));
      }
    }
  }

  // If the onPlayerContact handler exists and there was contact between the
  // player and something else, call the handler with relevant information.
  world.on("post-solve", e => {
    if (onPlayerContact) {
      const a = e.getFixtureA().getUserData();
      const b = e.getFixtureB().getUserData();
      if (a === "player" || b === "player") {
        onPlayerContact(e);
      }
    }
  });

  // Chreat the player physics object.
  const player = world.createDynamicBody({
    position: pl.Vec2(given.margin + 1.5, given.margin + 1.5),
    linearDamping: 1.5,
    angularDamping: 1.0
  });
  player.createFixture(pl.Circle(given.player.radius), {
    friction: 0.95,
    restitution: 0.25,
    density: 1,
    userData: "player"
  });
  player.setBullet(true);

  // Keep track of how the player has been rotated.
  const playerRotation = mat4.create();

  // Keep track of the player position and color.
  let playerPosition = [player.getPosition().x, player.getPosition().y];
  let playerColor = given.player.color.far;

  // Keep track of the camera position.
  let cameraPosition = playerPosition.slice();

  // World iteration
  function update() {
    // Take a physics time step.
    world.step(given.timeStep);

    // Get the new player position.
    const newPosition = [player.getPosition().x, player.getPosition().y];

    // Calculate how much the player moved and rotate the player accordingly.
    const d = vec2.sub([], newPosition, playerPosition);
    mat4.rotateX(playerRotation, playerRotation, d[1] / given.player.radius);
    mat4.rotateY(playerRotation, playerRotation, -d[0] / given.player.radius);

    // Update the playerPosition.
    playerPosition = newPosition.slice();

    // Calculate the playerColor according to how far the player is from the
    // exit.
    const exit = [stage.size - given.margin, stage.size - given.margin];
    const entrance = [given.margin + 1.5, given.margin + 1.5];
    const dist =
      vec2.distance(playerPosition, exit) / vec2.distance(exit, entrance);
    playerColor = vec3.lerp(
      [],
      given.player.color.near,
      given.player.color.far,
      dist
    );

    // Update the camera position.
    vec2.add(
      cameraPosition,
      cameraPosition,
      vec2.scale([], vec2.sub([], playerPosition, cameraPosition), 0.1)
    );
  }

  // Apply a force to the player.
  function pushPlayer(x, y) {
    player.applyForceToCenter(pl.Vec2(x, y), true);
  }

  // Check if the player has exited the maze.
  function isComplete() {
    return player.getPosition().x > stage.size - given.margin;
  }

  // Return the player position, rotation, and color.
  function getPlayer() {
    return {
      position: playerPosition.slice(),
      rotation: playerRotation.slice(),
      color: playerColor.slice()
    };
  }

  // Get the camera position.
  function getCamera() {
    return cameraPosition.slice();
  }

  // Get the stage object.
  function getStage() {
    return stage;
  }

  // Get the player's velocity.
  function getPlayerVelocity() {
    const v = player.getLinearVelocity();
    return [v.x, v.y];
  }

  return {
    update: update,
    pushPlayer: pushPlayer,
    isComplete: isComplete,
    getPlayer: getPlayer,
    getCamera: getCamera,
    getStage: getStage,
    getPlayerVelocity: getPlayerVelocity
  };
};

// Recursively generate a maze of dimensions (size, size). This could use some
// improvement; it generates unfun mazes and can fail if recursion limit is
// reached.
function generateSquareMaze(size) {
  const field = {};
  for (let x = 0; x < size; x++) {
    for (let y = 0; y < size; y++) {
      field[[x, y]] = true;
    }
  }
  return (function iterate(field, x, y) {
    field[[x, y]] = false;
    while (true) {
      const directions = [];
      if (x > 1 && field[[x - 2, y]]) {
        directions.push([-1, 0]);
      }
      if (x < size - 2 && field[[x + 2, y]] == true) {
        directions.push([1, 0]);
      }
      if (y > 1 && field[[x, y - 2]] == true) {
        directions.push([0, -1]);
      }
      if (y < size - 2 && field[[x, y + 2]] == true) {
        directions.push([0, 1]);
      }
      if (directions.length == 0) {
        return field;
      }
      const dir = directions[Math.floor(Math.random() * directions.length)];
      field[[x + dir[0], y + dir[1]]] = false;
      field = iterate(field, x + dir[0] * 2, y + dir[1] * 2);
    }
  })(field, 1, 1);
}
