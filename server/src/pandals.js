// The pandal layout of the city. The server owns this list so every player sees
// the same pandals in the same places. Member 1 (city builder) should place the
// 3D pandal models at these coordinates, or edit this list to match the city.
//
// Coordinates are world units on the ground plane (y is up). The city spans
// -WORLD_HALF_SIZE..WORLD_HALF_SIZE on both X and Z.

const PANDALS = [
  { id: 'bagbazar', name: 'Bagbazar Sarbojanin', type: 'regular', x: -120, z: -110 },
  { id: 'kumartuli', name: 'Kumartuli Park', type: 'regular', x: -80, z: -130 },
  { id: 'ahiritola', name: 'Ahiritola Sarbojanin', type: 'regular', x: -130, z: -40 },
  { id: 'college-square', name: 'College Square', type: 'regular', x: -40, z: -60 },
  { id: 'md-ali-park', name: 'Md. Ali Park', type: 'regular', x: 20, z: -90 },
  { id: 'santosh-mitra', name: 'Santosh Mitra Square', type: 'regular', x: 60, z: -30 },
  { id: 'deshapriya-park', name: 'Deshapriya Park', type: 'regular', x: 40, z: 70 },
  { id: 'ekdalia', name: 'Ekdalia Evergreen', type: 'regular', x: 100, z: 90 },
  { id: 'suruchi-sangha', name: 'Suruchi Sangha', type: 'regular', x: -20, z: 120 },
  { id: 'tridhara', name: 'Tridhara Sammilani', type: 'regular', x: 110, z: 20 },

  // Ghetto pandals: small, hidden in lanes, worth more points.
  { id: 'golir-maa', name: 'Golir Maa', type: 'ghetto', x: -95, z: 15 },
  { id: 'chhoto-para', name: 'Chhoto Para Club', type: 'ghetto', x: 5, z: 25 },
  { id: 'rooftop-durga', name: 'Rooftop Durga', type: 'ghetto', x: 135, z: -120 },
  { id: 'tram-depot', name: 'Tram Depot Puja', type: 'ghetto', x: -140, z: 135 },
  { id: 'chai-dokan', name: 'Chai Dokan Pandal', type: 'ghetto', x: 75, z: 140 },
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
