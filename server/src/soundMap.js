// Where sounds come from in the city. Every pandal also plays dhak automatically
// (louder at regular pandals, a lone dhaki at ghetto ones), so only the extra
// sound sources are listed here. Member 1: line the roads up with these, or
// edit these to match your city.

const CROWD_ZONES = [
  // "jhamela" = packed, noisy crowds with police whistles. "murmur" = calmer chatter.
  { id: 'crowd-santosh-mitra', x: 60, z: -30, radius: 30, intensity: 'jhamela' },
  { id: 'crowd-md-ali-park', x: 20, z: -90, radius: 28, intensity: 'jhamela' },
  { id: 'crowd-deshapriya', x: 40, z: 70, radius: 30, intensity: 'jhamela' },
  { id: 'crowd-bagbazar', x: -120, z: -110, radius: 25, intensity: 'murmur' },
  { id: 'crowd-suruchi', x: -20, z: 120, radius: 25, intensity: 'murmur' },
  { id: 'crowd-ekdalia', x: 100, z: 90, radius: 25, intensity: 'murmur' },
  { id: 'crowd-college-square', x: -40, z: -60, radius: 22, intensity: 'murmur' },
  { id: 'crowd-crossing', x: 0, z: 0, radius: 20, intensity: 'murmur' },
];

// Main roads where honking cars drive. Each is a straight line from (x1,z1) to (x2,z2).
const ROADS = [
  { id: 'central-avenue', x1: 0, z1: -160, x2: 0, z2: 160 },
  { id: 'east-west-road', x1: -160, z1: 0, x2: 160, z2: 0 },
  { id: 'north-road', x1: -160, z1: -80, x2: 160, z2: -80 },
  { id: 'south-road', x1: -160, z1: 80, x2: 160, z2: 80 },
  { id: 'west-road', x1: -110, z1: -160, x2: -110, z2: 160 },
  { id: 'east-road', x1: 90, z1: -160, x2: 90, z2: 160 },
];

module.exports = { SOUND_MAP: { crowdZones: CROWD_ZONES, roads: ROADS } };
