precision highp float;
uniform samplerCube tPlayerTexture;
uniform sampler2D source;
uniform sampler2D tStage;
uniform sampler2D tRand3;
uniform sampler2D tJitter;
uniform sampler2D tGround;
uniform sampler2D tWall;
uniform mat4 lRot;
uniform mat4 invpv;
uniform vec3 eye;
uniform vec3 bounds;
uniform vec3 playerPosition;
uniform vec3 playerColor;
uniform vec2 resolution;
uniform vec2 tOffset;
uniform float resStage;
uniform float playerRadius;
uniform float time;

// Enumerate some voxel types.
const int NONE  = 0;
const int VOXEL = 1;
const int LIGHT = 2;

// Define an ambient light value.
vec3 ambient = vec3(0.001);

// Define a small value.
const float epsilon = 0.001;

// Define the maximum number of bounces we'll take during path tracing.
const int nBounces = 2;

// Check if a voxel is in-bounds.
bool inBounds(vec3 p) {
  return all(greaterThanEqual(p, vec3(0))) && all(lessThan(p, bounds));
}

// Gets the time of intersection between a ray and AABB.
bool rayAABB(vec3 origin, vec3 direction, vec3 bMin, vec3 bMax, out float t0) {
    vec3 omin = (bMin - origin) / direction;
    vec3 omax = (bMax - origin) / direction;
    vec3 imax = max(omax, omin);
    vec3 imin = min(omax, omin);
    float t1 = min(imax.x, min(imax.y, imax.z));
    t0 = max(imin.x, max(imin.y, imin.z));
    t0 = max(t0, 0.0);
    return t1 > t0;
}

// Gets the normal of a point on the surface of an AABB.
vec3 rayAABBNorm(vec3 p, vec3 v) {
  vec3 d = p - (v + 0.5);
  vec3 dabs = abs(d);
  if (dabs.x > dabs.y) {
    if (dabs.x > dabs.z) {
      return vec3(sign(d.x), 0, 0);
    } else {
      return vec3(0, 0, sign(d.z));
    }
  } else {
    if (dabs.y > dabs.z) {
      return vec3(0, sign(d.y), 0);
    } else {
      return vec3(0, 0, sign(d.z));
    }
  }
}

// Gets the UV coordinate of a point on the suface of an AABB.
vec2 rayAABBUV(vec3 p, vec3 v) {
  vec3 d = p - (v + 0.5);
  vec3 dabs = abs(d);
  if (dabs.x > dabs.y) {
    if (dabs.x > dabs.z) {
      return (p - v).yz;
    } else {
      return (p - v).xy;
    }
  } else {
    if (dabs.y > dabs.z) {
      return (p - v).xz;
    } else {
      return (p - v).xy;
    }
  }
}

// Returns the 2D UV coordinate that maps to a voxel in the 3D voxel data.
vec2 samplePoint(vec3 v) {
  float i = v.y * bounds.x * bounds.z + v.z * bounds.x + v.x;
  i = i / resStage;
  float y = floor(i);
  float x = fract(i) * resStage;
  x = (x + 0.5) / resStage;
  y = (y + 0.5) / resStage;
  return vec2(x, y);
}

// Returns the data for the voxel at v.
vec4 getVoxel(vec3 v) {
  if (!inBounds(v)) return vec4(0);
  vec2 s = samplePoint(v);
  return texture2D(tStage, s);
}

// Gets the time of intersection for a ray and a sphere, if any. Returns false
// if no intersection.
bool raySphereIntersect(vec3 r0, vec3 rd, vec3 s0, float sr, out float t) {
  vec3 s0_r0 = r0 - s0;
  float b = 2.0 * dot(rd, s0_r0);
  float c = dot(s0_r0, s0_r0) - (sr * sr);
  float d = b * b - 4.0 * c;
  if (d < 0.0) return false;
  t = (-b - sqrt(d))*0.5;
  return t >= 0.0;
}

// Gets the voxel intersected by a ray, if any. Returns false if no intersection.
bool rayGridIntersect(vec3 r0, vec3 r, out vec3 v) {
  v = floor(r0);
  vec3 stp = sign(r);
  vec3 tDelta = 1.0 / abs(r);
  vec3 tMax = step(0.0, r) * (1.0 - fract(r0)) + (1.0 - step(0.0, r)) * fract(r0);
  tMax = tMax/abs(r);
  for (int i = 0; i < 65536; i++) {
    if (tMax.x < tMax.y) {
      if (tMax.x < tMax.z) {
        v.x += stp.x;
        tMax.x += tDelta.x;
      } else {
        v.z += stp.z;
        tMax.z += tDelta.z;
      }
    } else {
      if (tMax.y <= tMax.z) {
        v.y += stp.y;
        tMax.y += tDelta.y;
      } else {
        v.z += stp.z;
        tMax.z += tDelta.z;
      }
    }
    if (!inBounds(v) && i != 0) return false;
    if (getVoxel(v).a != 0.0) return true;
  }
  return false;
}

// Performas an intersection test between a ray and the entire scene. Fills
// out intersection point p, normal n at p, and diffuse or emissive color c.
// Returns NONE, LIGHT, or VOXEL according to what was hit first.
int intersect(vec3 r0, vec3 r, out vec3 p, out vec3 n, out vec3 c) {
  vec3 v = vec3(0);
  bool hitVoxel = rayGridIntersect(r0, r, v);
  float tVoxel = 0.0;
  if (hitVoxel) {
    rayAABB(r0, r, floor(v), floor(v) + 1.0, tVoxel);
  }
  float tPlayer = 0.0;
  bool hitLight = raySphereIntersect(r0, r, playerPosition, playerRadius, tPlayer);
  if (hitVoxel && hitLight) {
    if (tVoxel < tPlayer) {
      p = r0 + tVoxel * r;
      n = rayAABBNorm(p, v);
      if (getVoxel(v).a == 1.0/255.0) {
        c = texture2D(tGround, rayAABBUV(p, v)).rgb;
      } else {
        c = texture2D(tWall, rayAABBUV(p, v)).rgb;
      }
      return VOXEL;
    } else {
      p = r0 + tPlayer * r;
      n = normalize(p - playerPosition);
      c = 8.0 * mix(vec3(0), vec3(playerColor), textureCube(tPlayerTexture, (lRot * vec4(n, 1)).xyz).rgb);
      return LIGHT;
    }
  } else if (hitVoxel) {
    p = r0 + tVoxel * r;
    n = rayAABBNorm(p, v);
    if (getVoxel(v).a == 1.0/255.0) {
      c = texture2D(tGround, rayAABBUV(p, v)).rgb;
    } else {
      c = texture2D(tWall, rayAABBUV(p, v)).rgb;
    }
    return VOXEL;
  } else if (hitLight) {
    p = r0 + tPlayer * r;
    n = normalize(p - playerPosition);
    c = 8.0 * mix(vec3(0), vec3(playerColor), textureCube(tPlayerTexture, (lRot * vec4(n, 1)).xyz).rgb);
    return LIGHT;
  }
  return NONE;
}

// Our main fragment function. Fills in a single fragment (~pixel).
void main() {
  // Calculate the inverse of the resolution to avoid multiple divisions.
  vec2 invres = 1.0/resolution;

  // Get the incoming value.
  vec4 src = texture2D(source, gl_FragCoord.xy * invres);

  // Recover NDC
  vec2 jitter = texture2D(tJitter, tOffset + gl_FragCoord.xy * invres).ba;
  vec4 ndc = vec4(
    2.0 * (gl_FragCoord.xy + jitter) * invres - 1.0,
    2.0 * gl_FragCoord.z - 1.0,
    1.0
  );

  // Calculate clip.
  vec4 clip = invpv * ndc;

  // Calculate 3D position.
  vec3 p3d = clip.xyz / clip.w;

  // Get the initial ray.
  vec3 r = normalize(p3d - eye);

  // Abort with ambient color if we dont even hit the voxel grid.
  float tBounds = 0.0;
  if (!rayAABB(eye, r, vec3(0,0,0), bounds, tBounds)) {
    gl_FragColor = src + vec4(ambient,1);
    return;
  }

  // Scoot the initial ray origin right up to the bounds of the voxel grid.
  vec3 r0 = eye + r * tBounds - r * epsilon;

  // Initialize mask and accumulators.
  vec3 mask = vec3(1);
  vec3 accm = vec3(0);

  // Iterate over our bounces.
  for (int b = 0; b <= nBounces; b++) {
    vec3 p = vec3(0);
    vec3 n = vec3(0);
    vec3 c = vec3(0);
    // Perform an intersection test against the scene.
    int type = intersect(r0, r, p, n, c);
    if (type == NONE) {
      // If we hit nothing, give up with the ambient color.
      accm += mask * ambient;
      break;
    } else if (b == 0 && type == LIGHT) {
      // If we hit a light source (the player), AND it's the first thing we hit,
      // set the color and abort.
      accm += mask * c;
      break;
    } else if (type == VOXEL) {
      // We hit a voxel. Update the mask according to the texture color. Inigo
      // Quilez would proooobably murder me for inverting the color correction
      // we do later. What can I say? Colors still vex me.
      mask *= pow(c, vec3(2.2));
      vec3 r3 = texture2D(tRand3, tOffset + gl_FragCoord.xy * invres).xyz;
      vec3 pos = playerPosition + r3 * playerRadius * 0.5;
      vec3 _p, _n, _c;
      // Shoot a ray at the sun.
      vec3 sPos = normalize(vec3(cos(time), -0.1, sin(time)));
      vec3 sc = r3 * 20.0 + 1000.0 * sPos;
      if (intersect(p + n * epsilon, normalize(sc - (p+n*epsilon)), _p, _n, _c) == NONE) {
        accm += mask * clamp(sin(time), 0.0, 1.0);
      }
      // Shoot a ray at the player.
      if (intersect(p + n * epsilon, normalize(pos - (p + n * epsilon)), _p, _n, _c) == LIGHT) {
        accm += mask * pow(playerRadius/distance(p, pos), 3.0) * _c;
      }
      // Set a new ray origin and direction.
      r = normalize(n + r3);
      r0 = p + epsilon * r;
    }
  }

  gl_FragColor = src + vec4(accm, 1);
}
