precision highp float;
uniform sampler2D source;
uniform float count;
varying vec2 vPos;

void main() {
  vec4 color = texture2D(source, vPos)/count;
  color.rgb = pow(color.rgb, vec3(1.0/2.2));
  gl_FragColor = color;
}
