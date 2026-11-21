// The pandal layout of the city. The server owns this list so every player sees
// the same pandals in the same places. Member 1 (city builder) should place the
// 3D pandal models at these coordinates, or edit this list to match the city.
//
// Coordinates are world units on the ground plane (y is up). The city spans
// -WORLD_HALF_SIZE..WORLD_HALF_SIZE on both X and Z.

// Layout follows real Kolkata (north = -Z, the Hooghly river on the west, -X),
// compressed so the whole city can be crossed within one round:
//   North Kolkata on the river: Bagbazar, Kumartuli, Ahiritola
//   Central: Md. Ali Park, College Square, Santosh Mitra Square (Sealdah)
//   South Kolkata: Deshapriya Park, Tridhara, Ekdalia Evergreen, Suruchi Sangha (New Alipore)
const PANDALS = [
  { id: 'bagbazar', name: 'Bagbazar Sarbojanin', type: 'regular', x: -128, z: -130 },
  { id: 'kumartuli', name: 'Kumartuli Park', type: 'regular', x: -130, z: -100 },
  { id: 'ahiritola', name: 'Ahiritola Sarbojanin', type: 'regular', x: -128, z: -55 },
  { id: 'md-ali-park', name: 'Md. Ali Park', type: 'regular', x: -60, z: -55 },
  { id: 'college-square', name: 'College Square', type: 'regular', x: -30, z: -25 },
  { id: 'santosh-mitra', name: 'Santosh Mitra Square', type: 'regular', x: 30, z: -35 },
  { id: 'deshapriya-park', name: 'Deshapriya Park', type: 'regular', x: -45, z: 105 },
  { id: 'tridhara', name: 'Tridhara Sammilani', type: 'regular', x: -18, z: 100 },
  { id: 'ekdalia', name: 'Ekdalia Evergreen', type: 'regular', x: 40, z: 110 },
  { id: 'suruchi-sangha', name: 'Suruchi Sangha', type: 'regular', x: -85, z: 140 },

  // Ghetto pandals: small para pujas hidden in the lanes, worth more points.
  { id: 'golir-maa', name: 'Golir Maa', type: 'ghetto', x: -85, z: -110 },
  { id: 'chhoto-para', name: 'Chhoto Para Club', type: 'ghetto', x: 12, z: 25 },
  { id: 'rooftop-durga', name: 'Rooftop Durga', type: 'ghetto', x: 60, z: -92 },
  { id: 'tram-depot', name: 'Tram Depot Puja', type: 'ghetto', x: -70, z: 50 },
  { id: 'chai-dokan', name: 'Chai Dokan Pandal', type: 'ghetto', x: 120, z: 40 },
];

// Where players appear when a round starts (one per player slot, up to 8).
const SPAWN_POINTS = [
  { x: 0, z: 0 },
  { x: 4, z: 0 },
  { x: -4, z: 0 },
  { x: 0, z: 4 },
  { x: 0, z: -4 },
  { x: 4, z: 4 },
  { x: -4, z: -4 },
  { x: 4, z: -4 },
];

function getPandal(id) {
  return PANDALS.find((p) => p.id === id) || null;
}

module.exports = { PANDALS, SPAWN_POINTS, getPandal };
