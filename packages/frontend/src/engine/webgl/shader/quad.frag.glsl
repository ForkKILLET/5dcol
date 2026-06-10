#version 300 es
precision mediump float;

uniform vec4 u_color;

out vec4 out_color;

vec4 premultiply(vec4 color) {
  return vec4(color.rgb * color.a, color.a);
}

void main() {
  out_color = premultiply(u_color);
}
