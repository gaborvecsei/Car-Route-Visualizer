// Test suite for car sun exposure calculations
// Run with: node test_sun_exposure.js

// Import functions from script.js to avoid duplication
const fs = require('fs');
const scriptContent = fs.readFileSync('./script.js', 'utf8');

// Extract and evaluate the necessary functions
eval(scriptContent.match(/function calculateCarSideExposures[\s\S]*?^}/m)[0]);
eval(scriptContent.match(/function getCompassDirection[\s\S]*?^}/m)[0]);

// Essential test scenarios
const testCases = [
    // Cardinal directions
    { name: "Front", carBearing: 0, sunAzimuth: 0, expected: "100% front" },
    { name: "Back", carBearing: 0, sunAzimuth: 180, expected: "100% back" },
    { name: "Right", carBearing: 0, sunAzimuth: 90, expected: "100% right" },
    { name: "Left", carBearing: 0, sunAzimuth: 270, expected: "100% left" },
    
    // Key diagonals
    { name: "Front-right", carBearing: 0, sunAzimuth: 45, expected: "~50% front, ~50% right" },
    { name: "Front-left", carBearing: 0, sunAzimuth: 315, expected: "~50% front, ~50% left" },
    
    // Edge cases
    { name: "Issue case (348.5°)", carBearing: 0, sunAzimuth: 348.5, expected: "mostly front, some left" },
    { name: "Car rotated (East)", carBearing: 90, sunAzimuth: 0, expected: "100% left" },
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