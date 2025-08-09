// Test suite for car sun exposure calculations
// Run with: node test_sun_exposure.js

// Copy the calculation functions from script.js
function calculateCarSideExposures(sunPosition, carBearing) {
    const relativeSunAngle = (sunPosition.azimuth - carBearing + 360) % 360;
    
    const calculateSideExposure = (targetAngle, tolerance = 90) => {
        let angle = Math.abs(relativeSunAngle - targetAngle);
        // Handle wraparound for all angles (not just 270°)
        angle = Math.min(angle, 360 - angle);
        return angle <= tolerance ? Math.cos(angle * Math.PI / 180) : 0;
    };
    
    const rawExposures = {
        front: calculateSideExposure(0),
        back: calculateSideExposure(180),
        left: calculateSideExposure(270),
        right: calculateSideExposure(90)
    };
    
    const totalExposure = Object.values(rawExposures).reduce((sum, val) => sum + val, 0);
    
    return totalExposure > 0 
        ? Object.fromEntries(Object.entries(rawExposures).map(([key, val]) => [key, val / totalExposure]))
        : { front: 0, back: 0, left: 0, right: 0 };
}

function getCompassDirection(azimuth) {
    const directions = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
    const index = Math.round(azimuth / 22.5) % 16;
    return directions[index];
}

// Test scenarios
const testCases = [
    // Basic cardinal directions
    { name: "Sun directly in front", carBearing: 0, sunAzimuth: 0, expected: "100% front" },
    { name: "Sun directly behind", carBearing: 0, sunAzimuth: 180, expected: "100% back" },
    { name: "Sun directly to right", carBearing: 0, sunAzimuth: 90, expected: "100% right" },
    { name: "Sun directly to left", carBearing: 0, sunAzimuth: 270, expected: "100% left" },
    
    // 45-degree angles (should be 50/50 splits)
    { name: "Sun front-right diagonal", carBearing: 0, sunAzimuth: 45, expected: "~50% front, ~50% right" },
    { name: "Sun front-left diagonal", carBearing: 0, sunAzimuth: 315, expected: "~50% front, ~50% left" },
    { name: "Sun back-right diagonal", carBearing: 0, sunAzimuth: 135, expected: "~50% back, ~50% right" },
    { name: "Sun back-left diagonal", carBearing: 0, sunAzimuth: 225, expected: "~50% back, ~50% left" },
    
    // The reported issue case
    { name: "Reported issue case", carBearing: 0, sunAzimuth: 348.5, expected: "mostly front, some left" },
    
    // Car facing different directions
    { name: "Car facing East, sun from North", carBearing: 90, sunAzimuth: 0, expected: "100% left" },
    { name: "Car facing South, sun from East", carBearing: 180, sunAzimuth: 90, expected: "100% left" },
    
    // Edge cases near boundaries
    { name: "Sun at 1° (almost front)", carBearing: 0, sunAzimuth: 1, expected: "mostly front" },
    { name: "Sun at 359° (almost front)", carBearing: 0, sunAzimuth: 359, expected: "mostly front" },
    { name: "Sun at 89° (front-right boundary)", carBearing: 0, sunAzimuth: 89, expected: "small front, mostly right" },
    { name: "Sun at 91° (right-back boundary)", carBearing: 0, sunAzimuth: 91, expected: "small back, mostly right" },
];

console.log("=== CAR SUN EXPOSURE CALCULATION TESTS ===\n");

function runTest(testCase) {
    const sunPosition = { azimuth: testCase.sunAzimuth, elevation: 45 }; // Fixed elevation for testing
    const result = calculateCarSideExposures(sunPosition, testCase.carBearing);
    
    const relativeSunAngle = (testCase.sunAzimuth - testCase.carBearing + 360) % 360;
    
    console.log(`Test: ${testCase.name}`);
    console.log(`  Car bearing: ${testCase.carBearing}° (${getCompassDirection(testCase.carBearing)})`);
    console.log(`  Sun azimuth: ${testCase.sunAzimuth}° (${getCompassDirection(testCase.sunAzimuth)})`);
    console.log(`  Relative sun angle: ${relativeSunAngle.toFixed(1)}°`);
    console.log(`  Expected: ${testCase.expected}`);
    console.log(`  Actual results:`);
    console.log(`    Front: ${(result.front * 100).toFixed(1)}%`);
    console.log(`    Back:  ${(result.back * 100).toFixed(1)}%`);
    console.log(`    Left:  ${(result.left * 100).toFixed(1)}%`);
    console.log(`    Right: ${(result.right * 100).toFixed(1)}%`);
    
    // Verify total adds up to 100%
    const total = (result.front + result.back + result.left + result.right) * 100;
    console.log(`  Total: ${total.toFixed(1)}% ${Math.abs(total - 100) < 0.1 ? '✅' : '❌'}`);
    
    // Check if results match expectations for key test cases
    let status = "?";
    if (testCase.name.includes("directly in front") && result.front > 0.99) status = "✅";
    else if (testCase.name.includes("directly behind") && result.back > 0.99) status = "✅";
    else if (testCase.name.includes("directly to right") && result.right > 0.99) status = "✅";
    else if (testCase.name.includes("directly to left") && result.left > 0.99) status = "✅";
    else if (testCase.name.includes("diagonal") && Math.abs(result.front + result.right + result.back + result.left - 1) < 0.01) {
        // For diagonal cases, check if it's roughly 50/50
        const values = Object.values(result).filter(v => v > 0.1);
        if (values.length === 2 && Math.abs(values[0] - values[1]) < 0.2) status = "✅";
        else status = "❌";
    }
    else if (testCase.name.includes("Reported issue") && result.front > 0.5 && result.left > 0.1 && result.left < 0.5) status = "✅";
    
    console.log(`  Status: ${status}`);
    console.log("");
    
    return { testCase, result, relativeSunAngle, status };
}

// Run all tests
const results = testCases.map(runTest);

// Summary
console.log("=== TEST SUMMARY ===");
const passed = results.filter(r => r.status === "✅").length;
const failed = results.filter(r => r.status === "❌").length;
const unknown = results.filter(r => r.status === "?").length;

console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
console.log(`Unknown: ${unknown}`);
console.log(`Total: ${results.length}`);

if (failed > 0) {
    console.log("\n=== FAILED TESTS ===");
    results.filter(r => r.status === "❌").forEach(r => {
        console.log(`❌ ${r.testCase.name}`);
        console.log(`   Expected: ${r.testCase.expected}`);
        console.log(`   Got: F:${(r.result.front*100).toFixed(1)}% B:${(r.result.back*100).toFixed(1)}% L:${(r.result.left*100).toFixed(1)}% R:${(r.result.right*100).toFixed(1)}%`);
    });
}