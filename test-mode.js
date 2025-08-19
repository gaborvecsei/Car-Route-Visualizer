// Test Mode Functionality
let currentMode = 'route';

const testCases = [
    { name: "Front", carBearing: 0, sunAzimuth: 0 },
    { name: "Back", carBearing: 0, sunAzimuth: 180 },
    { name: "Right", carBearing: 0, sunAzimuth: 90 },
    { name: "Left", carBearing: 0, sunAzimuth: 270 },
    { name: "Front-right", carBearing: 0, sunAzimuth: 45 },
    { name: "Front-left", carBearing: 0, sunAzimuth: 315 },
];

const switchMode = (mode) => {
    currentMode = mode;
    const routeElements = ['route-sidebar'];
    const testElements = ['test-sidebar', 'test-results'];
    const isRoute = mode === 'route';
    
    // Handle results elements separately to maintain their state
    const resultsPlaceholder = document.getElementById('results-placeholder');
    const carSummary = document.getElementById('car-summary');
    
    if (isRoute) {
        // Show route sidebar
        document.getElementById('route-sidebar').classList.remove('hidden');
        document.getElementById('test-sidebar').classList.add('hidden');
        document.getElementById('test-results').classList.add('hidden');
        
        // Restore the correct results state when returning to route mode
        // Check if we have actual results by checking if any percentage is not "0%"
        const frontPercentage = document.getElementById('front-percentage');
        const hasResults = frontPercentage && frontPercentage.textContent !== '0%';
        
        if (hasResults) {
            // Show the actual results
            if (resultsPlaceholder) resultsPlaceholder.classList.add('hidden');
            if (carSummary) carSummary.classList.remove('hidden');
        } else {
            // Show the placeholder
            if (resultsPlaceholder) {
                resultsPlaceholder.classList.remove('hidden');
                resultsPlaceholder.classList.add('flex');
            }
            if (carSummary) carSummary.classList.add('hidden');
        }
    } else {
        // Show test sidebar, hide route results
        document.getElementById('route-sidebar').classList.add('hidden');
        document.getElementById('test-sidebar').classList.remove('hidden');
        document.getElementById('test-results').classList.remove('hidden');
        
        // Hide both results elements when switching to test mode
        if (resultsPlaceholder) resultsPlaceholder.classList.add('hidden');
        if (carSummary) carSummary.classList.add('hidden');
    }
    
    // Update button styles
    const routeBtn = document.getElementById('route-mode-btn');
    const testBtn = document.getElementById('test-mode-btn');
    const activeClasses = ['bg-gray-900', 'text-white'];
    const inactiveClasses = ['bg-transparent', 'text-gray-600'];
    
    if (isRoute) {
        routeBtn.classList.add(...activeClasses);
        routeBtn.classList.remove(...inactiveClasses);
        testBtn.classList.remove(...activeClasses);
        testBtn.classList.add(...inactiveClasses);
    } else {
        testBtn.classList.add(...activeClasses);
        testBtn.classList.remove(...inactiveClasses);
        routeBtn.classList.remove(...activeClasses);
        routeBtn.classList.add(...inactiveClasses);
        initTestMode();
        
        // Smooth scroll to test section
        setTimeout(() => {
            const testSection = document.getElementById('test-sidebar');
            if (testSection) {
                testSection.scrollIntoView({ 
                    behavior: 'smooth', 
                    block: 'start',
                    inline: 'nearest'
                });
            }
        }, 150);
    }
};

const createTestVisualization = (testCase) => {
    const result = calculateCarSideExposures({ azimuth: testCase.sunAzimuth, elevation: 45 }, testCase.carBearing);
    const sunAngle = (testCase.sunAzimuth - 90) * Math.PI / 180;
    const sunX = 50 + Math.cos(sunAngle) * 40;
    const sunY = 50 + Math.sin(sunAngle) * 40;
    
    const exposureBar = (label, value, color) => 
        `<div class="flex items-center my-1">
            <span class="w-12 text-xs font-medium">${label}:</span>
            <div class="h-4 rounded ml-2 flex items-center justify-center text-xs font-medium text-white min-w-10" 
                 style="width: ${Math.max(40, value * 120)}px; background: ${color}; text-shadow: 1px 1px 1px rgba(0,0,0,0.5);">
                ${(value * 100).toFixed(1)}%
            </div>
        </div>`;
    
    return `
        <div class="mb-4">
            <div class="text-sm font-semibold mb-3">${testCase.name}</div>
            <div class="flex gap-6 items-center flex-wrap">
                <div class="relative w-48 h-48 flex-shrink-0">
                    <div class="w-full h-full border-2 border-gray-300 rounded-full compass-circle">
                        <div class="absolute inset-2 text-xs font-medium text-gray-600">
                            <div class="absolute top-0 left-1/2 -translate-x-1/2">N</div>
                            <div class="absolute top-1/2 right-0 -translate-y-1/2">E</div>
                            <div class="absolute bottom-0 left-1/2 -translate-x-1/2">S</div>
                            <div class="absolute top-1/2 left-0 -translate-y-1/2">W</div>
                        </div>
                        
                        <svg class="absolute inset-0 w-full h-full z-10">
                            <line x1="50%" y1="50%" x2="${sunX}%" y2="${sunY}%" stroke="#FFD700" stroke-width="2" opacity="0.8" stroke-dasharray="3,3"/>
                        </svg>
                        
                        <div class="absolute top-1/2 left-1/2 w-8 h-12 z-20" style="transform: translate(-50%, -50%) rotate(${testCase.carBearing}deg);">
                            <svg width="32" height="48" viewBox="0 0 32 48" class="drop-shadow-sm">
                                <rect x="6" y="4" width="20" height="40" rx="5" fill="#3b82f6" stroke="#1d4ed8"/>
                                <rect x="8" y="6" width="16" height="6" rx="2" fill="#60a5fa"/>
                                <rect x="8" y="36" width="16" height="6" rx="2" fill="#60a5fa"/>
                                <circle cx="12" cy="2" r="1.5" fill="#fbbf24"/>
                                <circle cx="20" cy="2" r="1.5" fill="#fbbf24"/>
                                <text x="16" y="-1" text-anchor="middle" font-size="6" fill="#374151">F</text>
                                <text x="29" y="26" text-anchor="middle" font-size="6" fill="#374151">R</text>
                                <text x="16" y="47" text-anchor="middle" font-size="6" fill="#374151">B</text>
                                <text x="3" y="26" text-anchor="middle" font-size="6" fill="#374151">L</text>
                            </svg>
                        </div>
                        
                        <div class="absolute w-6 h-6 rounded-full flex items-center justify-center text-sm z-20 sun-glow" 
                             style="left: ${sunX}%; top: ${sunY}%; transform: translate(-50%, -50%);">☀</div>
                    </div>
                </div>
                
                <div class="bg-secondary/30 rounded-md p-3 min-w-48 flex-1">
                    <h4 class="text-sm font-semibold mb-2">Exposure Results</h4>
                    ${exposureBar('Front', result.front, 'linear-gradient(to right, #ef4444, #f87171)')}
                    ${exposureBar('Back', result.back, 'linear-gradient(to right, #22c55e, #4ade80)')}
                    ${exposureBar('Left', result.left, 'linear-gradient(to right, #3b82f6, #60a5fa)')}
                    ${exposureBar('Right', result.right, 'linear-gradient(to right, #ec4899, #f472b6)')}
                    <div class="text-xs text-muted-foreground mt-2 space-y-1">
                        <div><strong>Car:</strong> ${getCompassDirection(testCase.carBearing)} (${testCase.carBearing}°)</div>
                        <div><strong>Sun:</strong> ${getCompassDirection(testCase.sunAzimuth)} (${testCase.sunAzimuth}°)</div>
                        <div><strong>Total:</strong> ${((result.front + result.back + result.left + result.right) * 100).toFixed(1)}%</div>
                    </div>
                </div>
            </div>
        </div>
    `;
};

const updateInteractiveTest = () => {
    const carBearing = parseInt(document.getElementById('car-bearing-slider').value);
    const sunAzimuth = parseInt(document.getElementById('sun-azimuth-slider').value);
    
    // Update display values
    const updates = [
        ['car-bearing-value', carBearing + '°'],
        ['sun-azimuth-value', sunAzimuth + '°'],
        ['car-bearing-compass', getCompassDirection(carBearing)],
        ['sun-azimuth-compass', getCompassDirection(sunAzimuth)]
    ];
    updates.forEach(([id, value]) => {
        document.getElementById(id).textContent = value;
    });
    
    const container = document.getElementById('test-visualization-container');
    container.innerHTML = createTestVisualization({ name: "Interactive Test", carBearing, sunAzimuth });
};

const runTestCase = (testCase) => {
    document.getElementById('car-bearing-slider').value = testCase.carBearing;
    document.getElementById('sun-azimuth-slider').value = testCase.sunAzimuth;
    updateInteractiveTest();
};

const initTestMode = () => {
    // Create test case buttons
    const buttonsContainer = document.getElementById('test-case-buttons');
    if (buttonsContainer && buttonsContainer.children.length === 0) {
        testCases.forEach(testCase => {
            const button = document.createElement('button');
            button.className = 'px-3 py-2 text-sm bg-white hover:bg-gray-50 rounded-md border border-gray-200 hover:border-gray-300 transition-colors font-medium';
            button.textContent = testCase.name;
            button.onclick = () => runTestCase(testCase);
            buttonsContainer.appendChild(button);
        });
    }
    
    // Initialize interactive test
    updateInteractiveTest();
};

// Make functions globally available
window.switchMode = switchMode;
window.updateInteractiveTest = updateInteractiveTest;
window.runTestCase = runTestCase;
window.initTestMode = initTestMode;

// Initialize on page load
document.addEventListener('DOMContentLoaded', function() {
    // Set up mode toggle
    if (window.location.hash === '#test') {
        switchMode('test');
    }
});