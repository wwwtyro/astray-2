"use strict";

const { vec2 } = require("gl-matrix"); // Matrix/vector math library
const { Howl } = require("howler"); // Sound library

const given = require("./given"); // Constants for the game
const View = require("./view"); // Renderer
const Model = require("./model"); // Game logic

async function main() {
  // Grab the canvas
  const canvas = document.getElementById("render-canvas");

  // Set our level to one.
  let level = 1;

  // Initialize our game logic. We'll throw this away when the player makes it
  // to level 2.
  let model = Model(level, onPlayerContact);

  // Initialize our renderer
  const view = await View(canvas);
  view.setStage(model.getStage());

  // Create the rolling sound and play it on loop with zero volume. We'll increase
  // the volume as the player speeds up.
  const rollingSound = new Howl({
    src: [given.rollingSound],
    volume: 0,
    loop: true,
    rate: 4.0
  });
  rollingSound.play();

  // Play a sound when the player hits the wall. Adjust the volume according to
  // the player's speed and the angle of the impact.
  function onPlayerContact(contact) {
    let v = vec2.dot(
      [contact.v_normal.x, contact.v_normal.y],
      model.getPlayerVelocity()
    );
    v = Math.abs(v);
    new Howl({
      src: [given.clinkSound],
      volume: v / 16
    }).play();
  }

  // Keep track of keyboard keys being pressed.
  const kb = {};
  window.addEventListener("keydown", e => (kb[e.code] = true));
  window.addEventListener("keyup", e => (kb[e.code] = false));

  // Our main game loop.
  async function loop() {
    // Apply a force to the player according to what keys are being pressed.
    if (kb.ArrowRight) model.pushPlayer(given.player.speed, 0);
    if (kb.ArrowLeft) model.pushPlayer(-given.player.speed, 0);
    if (kb.ArrowUp) model.pushPlayer(0, given.player.speed);
    if (kb.ArrowDown) model.pushPlayer(0, -given.player.speed);

    // If the H key is being pressed, show help.
    if (kb.KeyH) {
      document.getElementById("help").style.display = "inline-block";
    } else {
      document.getElementById("help").style.display = "none";
    }

    // Take a timestep.
    model.update();

    // Render the scene.
    view.render(model.getPlayer(), model.getCamera());

    // Change the volume of the rolling sound according to how fast the player
    // is moving.
    rollingSound.volume(vec2.length(model.getPlayerVelocity()) / 16.0);

    // If the player exited the maze, increment the level, play the ding! sound,
    // fade out, instantiate the new level, and fade in.
    if (model.isComplete()) {
      level++;
      document.getElementById("level").innerText = `Level ${level}`;
      new Howl({ src: [given.dingSound] }).play();
      for (let i = 0; i <= 60; i++) {
        canvas.style.opacity = 1 - i / 60;
        model.update();
        rollingSound.volume(vec2.length(model.getPlayerVelocity()) / 16.0);
        view.render(model.getPlayer(), model.getCamera());
        await display();
      }
      model = Model(level, onPlayerContact);
      view.setStage(model.getStage());
      for (let i = 0; i <= 15; i++) {
        canvas.style.opacity = i / 15;
        model.update();
        rollingSound.volume(vec2.length(model.getPlayerVelocity()) / 16.0);
        view.render(model.getPlayer(), model.getCamera());
        await display();
      }
    }

    // And do it all again!
    requestAnimationFrame(loop);
  }

  // Initiate the game loop.
  loop();
}

// Call our asynchronous main function.
main();

// Wait for the browser to render the current frame.
function display() {
  return new Promise(r => {
    requestAnimationFrame(r);
  });
}
