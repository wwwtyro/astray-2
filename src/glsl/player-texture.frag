precision highp float;
varying vec3 vPos;
#pragma glslify: snoise3 = require(glsl-noise/simplex/3d)
void main() {
  float n = 0.5 * snoise3(normalize(vPos)) + 0.5;
  n = pow(n, 2.0);
  vec3 c = vec3(smoothstep(0.0, 1.0, n));
  gl_FragColor = vec4(c,1);
}
