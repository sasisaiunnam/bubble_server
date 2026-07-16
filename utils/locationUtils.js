const BUBBLE_DIAMETER_KM = 3;

/**
 * Calculates a unique grid ID for a given latitude and longitude.
 * This creates a grid of bubbles across the map.
 * @param {number} lat - Latitude
 * @param {number} lon - Longitude
 * @returns {string} A unique ID for the grid cell.
 */
const getGridCellId = (lat, lon) => {
  // ~3km grid. One degree of latitude is ~111km. 3/111 is ~0.027.
  const lat_step = BUBBLE_DIAMETER_KM / 111.32;
  const lon_step = BUBBLE_DIAMETER_KM / (111.32 * Math.cos(lat * (Math.PI / 180)));
  const gridLat = Math.floor(lat / lat_step);
  const gridLon = Math.floor(lon / lon_step);
  return `grid_${gridLat}_${gridLon}`;
};

module.exports = { getGridCellId, BUBBLE_DIAMETER_KM };