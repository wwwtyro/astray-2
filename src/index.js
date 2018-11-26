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

  window.addEventListener("deviceorientation", e => {
    if (model.isComplete()) return;
    let dx = (e.beta - 30) / 180;
    let dy = e.gamma / 90;
    dx = Math.pow(Math.abs(dx), 0.5) * Math.sign(dx);
    dy = Math.pow(Math.abs(dy), 0.5) * Math.sign(dy);
    model.pushPlayer(given.player.speed * dy, -given.player.speed * dx);
  });

  // Our main game loop.
  async function loop() {
    // Apply a force to the player according to what keys are being pressed.
    if (kb.ArrowRight) model.pushPlayer(given.player.speed, 0);
    if (kb.ArrowLeft) model.pushPlayer(-given.player.speed, 0);
    if (kb.ArrowUp) model.pushPlayer(0, given.player.speed);
    if (kb.ArrowDown) model.pushPlayer(0, -given.player.speed);
    if (kb.Digit1) view.setResolution(1);
    if (kb.Digit2) view.setResolution(2);
    if (kb.Digit3) view.setResolution(3);
    if (kb.Digit4) view.setResolution(4);
    if (kb.Digit5) view.setResolution(5);
    if (kb.Digit6) view.setResolution(6);
    if (kb.Digit7) view.setResolution(7);
    if (kb.Digit8) view.setResolution(8);

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

// Utility for checking mobile browsers from detectmobilebrowsers.com.
window.mobilecheck = function() {
  var check = false;
  (function(a) {
    if (
      /(android|bb\d+|meego).+mobile|avantgo|bada\/|blackberry|blazer|compal|elaine|fennec|hiptop|iemobile|ip(hone|od)|iris|kindle|lge |maemo|midp|mmp|mobile.+firefox|netfront|opera m(ob|in)i|palm( os)?|phone|p(ixi|re)\/|plucker|pocket|psp|series(4|6)0|symbian|treo|up\.(browser|link)|vodafone|wap|windows ce|xda|xiino/i.test(
        a
      ) ||
      /1207|6310|6590|3gso|4thp|50[1-6]i|770s|802s|a wa|abac|ac(er|oo|s\-)|ai(ko|rn)|al(av|ca|co)|amoi|an(ex|ny|yw)|aptu|ar(ch|go)|as(te|us)|attw|au(di|\-m|r |s )|avan|be(ck|ll|nq)|bi(lb|rd)|bl(ac|az)|br(e|v)w|bumb|bw\-(n|u)|c55\/|capi|ccwa|cdm\-|cell|chtm|cldc|cmd\-|co(mp|nd)|craw|da(it|ll|ng)|dbte|dc\-s|devi|dica|dmob|do(c|p)o|ds(12|\-d)|el(49|ai)|em(l2|ul)|er(ic|k0)|esl8|ez([4-7]0|os|wa|ze)|fetc|fly(\-|_)|g1 u|g560|gene|gf\-5|g\-mo|go(\.w|od)|gr(ad|un)|haie|hcit|hd\-(m|p|t)|hei\-|hi(pt|ta)|hp( i|ip)|hs\-c|ht(c(\-| |_|a|g|p|s|t)|tp)|hu(aw|tc)|i\-(20|go|ma)|i230|iac( |\-|\/)|ibro|idea|ig01|ikom|im1k|inno|ipaq|iris|ja(t|v)a|jbro|jemu|jigs|kddi|keji|kgt( |\/)|klon|kpt |kwc\-|kyo(c|k)|le(no|xi)|lg( g|\/(k|l|u)|50|54|\-[a-w])|libw|lynx|m1\-w|m3ga|m50\/|ma(te|ui|xo)|mc(01|21|ca)|m\-cr|me(rc|ri)|mi(o8|oa|ts)|mmef|mo(01|02|bi|de|do|t(\-| |o|v)|zz)|mt(50|p1|v )|mwbp|mywa|n10[0-2]|n20[2-3]|n30(0|2)|n50(0|2|5)|n7(0(0|1)|10)|ne((c|m)\-|on|tf|wf|wg|wt)|nok(6|i)|nzph|o2im|op(ti|wv)|oran|owg1|p800|pan(a|d|t)|pdxg|pg(13|\-([1-8]|c))|phil|pire|pl(ay|uc)|pn\-2|po(ck|rt|se)|prox|psio|pt\-g|qa\-a|qc(07|12|21|32|60|\-[2-7]|i\-)|qtek|r380|r600|raks|rim9|ro(ve|zo)|s55\/|sa(ge|ma|mm|ms|ny|va)|sc(01|h\-|oo|p\-)|sdk\/|se(c(\-|0|1)|47|mc|nd|ri)|sgh\-|shar|sie(\-|m)|sk\-0|sl(45|id)|sm(al|ar|b3|it|t5)|so(ft|ny)|sp(01|h\-|v\-|v )|sy(01|mb)|t2(18|50)|t6(00|10|18)|ta(gt|lk)|tcl\-|tdg\-|tel(i|m)|tim\-|t\-mo|to(pl|sh)|ts(70|m\-|m3|m5)|tx\-9|up(\.b|g1|si)|utst|v400|v750|veri|vi(rg|te)|vk(40|5[0-3]|\-v)|vm40|voda|vulc|vx(52|53|60|61|70|80|81|83|85|98)|w3c(\-| )|webc|whit|wi(g |nc|nw)|wmlb|wonu|x700|yas\-|your|zeto|zte\-/i.test(
        a.substr(0, 4)
      )
    )
      check = true;
  })(navigator.userAgent || navigator.vendor || window.opera);
  return check;
};

if (mobilecheck()) {
  document.getElementById("help-help").innerText =
    "Tilt your phone to navigate.";
}
