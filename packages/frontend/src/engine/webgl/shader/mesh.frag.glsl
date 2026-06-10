#version 300 es
precision mediump float;

in vec2 v_position;

uniform bool u_use_gradient;
uniform vec4 u_color;
uniform vec2 u_gradient_from;
uniform vec2 u_gradient_to;
uniform int u_gradient_stop_count;
uniform float u_gradient_offsets[4];
uniform vec4 u_gradient_colors[4];

out vec4 out_color;

vec4 premultiply(vec4 color) {
  return vec4(color.rgb * color.a, color.a);
}

vec4 get_gradient_color(float t) {
  if (u_gradient_stop_count <= 0) {
    return vec4(0.0);
  }
  if (t <= u_gradient_offsets[0]) {
    return premultiply(u_gradient_colors[0]);
  }

  for (int i = 1; i < 4; i += 1) {
    if (i >= u_gradient_stop_count) {
      break;
    }
    if (t <= u_gradient_offsets[i]) {
      float range = u_gradient_offsets[i] - u_gradient_offsets[i - 1];
      float progress = range == 0.0 ? 0.0 : (t - u_gradient_offsets[i - 1]) / range;
      vec4 from = u_gradient_colors[i - 1];
      vec4 to = u_gradient_colors[i];
      vec3 premultiplied = mix(from.rgb * from.a, to.rgb * to.a, progress);
      float alpha = mix(from.a, to.a, progress);
      return vec4(premultiplied, alpha);
    }
  }

  return premultiply(u_gradient_colors[u_gradient_stop_count - 1]);
}

void main() {
  if (!u_use_gradient) {
    out_color = premultiply(u_color);
    return;
  }

  vec2 direction = u_gradient_to - u_gradient_from;
  float length_squared = dot(direction, direction);
  float t = length_squared == 0.0
    ? 0.0
    : clamp(dot(v_position - u_gradient_from, direction) / length_squared, 0.0, 1.0);
  out_color = get_gradient_color(t);
}
