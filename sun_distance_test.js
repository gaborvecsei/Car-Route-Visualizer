// Simple test script to calculate sun distances for different elevation angles
// Run with: node sun_distance_test.js

// Settings to test (you can modify these)
const baseRadius = 3000; // meters
const currentZoom = 8;   // map zoom level
const userSizeMultiplier = 1; // dome size slider value
const exponentialCurve = 1.1; // dramatic factor exponent

// Calculate horizon radius (same as in main script)
const zoomFactor = Math.pow(2, (11 - currentZoom));
const horizonRadius = Math.max(200, baseRadius * zoomFactor * userSizeMultiplier);

console.log(`Settings:`);
console.log(`- Base radius: ${baseRadius}m`);
console.log(`- Zoom level: ${currentZoom}`);
console.log(`- Size multiplier: ${userSizeMultiplier}x`);
console.log(`- Exponential curve: ${exponentialCurve}`);
console.log(`- Calculated horizon radius: ${horizonRadius}m`);
console.log(`\nSun distances by elevation:`);
console.log(`Elevation | Distance | % of Horizon | Line Description`);
console.log(`----------|----------|--------------|------------------`);

// Test elevations from 90° down to 0°
for (let elevation = 90; elevation >= 0; elevation -= 10) {
    const elevationFactor = Math.max(0, elevation) / 90;
    const dramaticFactor = Math.pow(elevationFactor, exponentialCurve);
    const sunDistance = horizonRadius * (1 - dramaticFactor);
    const percentage = (sunDistance / horizonRadius * 100);
    
    let description;
    if (percentage < 10) description = "Very short";
    else if (percentage < 30) description = "Short";
    else if (percentage < 50) description = "Medium";
    else if (percentage < 80) description = "Long";
    else description = "Very long";
    
    console.log(`${elevation.toString().padStart(8)}° | ${Math.round(sunDistance).toString().padStart(7)}m | ${percentage.toFixed(1).padStart(10)}% | ${description}`);
}

console.log(`\nTo modify settings, edit the variables at the top of this script.`);
