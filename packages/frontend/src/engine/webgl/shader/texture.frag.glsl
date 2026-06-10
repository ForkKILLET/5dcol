#version 300 es
precision mediump float;

in vec2 v_uv;

uniform sampler2D u_texture;
uniform float u_alpha;
uniform float u_lod_bias;

out vec4 out_color;

void main() {
  vec4 color = texture(u_texture, v_uv, u_lod_bias);
  float alpha = color.a * u_alpha;
  out_color = vec4(color.rgb * u_alpha, alpha);
}
