#version 300 es
precision mediump float;

in vec2 a_position;

uniform mat3 u_matrix;
uniform vec2 u_resolution;

out vec2 v_uv;

void main() {
  vec3 device = u_matrix * vec3(a_position, 1.0);
  vec2 clip = device.xy / u_resolution * 2.0 - 1.0;
  gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
  v_uv = a_position;
}
