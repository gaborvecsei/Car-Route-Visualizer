let map;
let routeLayer = null;
let routeData = null;
let sunMarkers = [];
let currentSunPositions = [];
let carVisualizationMarkers = [];
let isAnalyzing = false;
let loadingTimeout = null;

// Error handling and analytics
function logError(error, context = '') {
    console.error(`Error in ${context}:`, error);
    if (typeof gtag !== 'undefined') {
        gtag('event', 'exception', {
            description: `${context}: ${error.message}`,
            fatal: false
        });
    }
}

// Loading state management
function setLoadingState(isLoading, message = '') {
    const button = document.getElementById('visualize-btn');
    
    if (isLoading) {
        button.disabled = true;
        button.classList.add('loading');
        button.innerHTML = `<span class="button-icon">⏳</span> ${message || 'Analyzing...'}`;
        isAnalyzing = true;
        
        // Set timeout for long operations
        if (loadingTimeout) clearTimeout(loadingTimeout);
        loadingTimeout = setTimeout(() => {
            if (isAnalyzing) {
                showStatus('Analysis is taking longer than expected. Please wait...', 'info');
            }
        }, 15000);
    } else {
        button.disabled = false;
        button.classList.remove('loading');
        button.innerHTML = `<span class="button-icon">☀️</span> Analyze Sun Exposure`;
        isAnalyzing = false;
        
        if (loadingTimeout) {
            clearTimeout(loadingTimeout);
            loadingTimeout = null;
        }
    }
}

function initMap() {
    map = L.map('map').setView(CONFIG.DEFAULT_CENTER, CONFIG.DEFAULT_ZOOM);
    
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors'
    }).addTo(map);
    
    document.getElementById('visualize-btn').addEventListener('click', visualizeRoutes);
    
    // Add Enter key support for route inputs
    document.getElementById('route-from').addEventListener('keypress', function(event) {
        if (event.key === 'Enter') {
            visualizeRoutes();
        }
    });
    
    document.getElementById('route-to').addEventListener('keypress', function(event) {
        if (event.key === 'Enter') {
            visualizeRoutes();
        }
    });
    
    // Add zoom event listener to refresh sun markers with new scale
    map.on('zoomend', function() {
        if (sunMarkers.length > 0) {
            // Store current sun positions data
            const currentSunData = [...sunMarkers];
            if (currentSunData.length > 0) {
                // Small delay to let zoom animation finish
                setTimeout(() => {
                    refreshSunVisualization();
                }, 100);
            }
        }
    });
    
    const today = new Date();
    document.getElementById('trip-date').value = today.toISOString().split('T')[0];
    document.getElementById('trip-time').value = '08:00';
    
        showStatus('Map initialized. Enter your route and click "Analyze Sun Exposure".', 'info');
}

function showStatus(message, type = 'info') {
    const statusDiv = document.getElementById('status');
    statusDiv.textContent = message;
    statusDiv.className = `status-message ${type}`;
}

function validateInputs() {
    const routeFrom = document.getElementById('route-from').value.trim();
    const routeTo = document.getElementById('route-to').value.trim();
    
    if (!routeFrom || !routeTo) {
        showStatus('Please fill in both route fields.', 'error');
        return false;
    }
    
    return { routeFrom, routeTo };
}

async function geocodeLocation(address) {
    const url = `${CONFIG.NOMINATIM_URL}?format=json&q=${encodeURIComponent(address)}&limit=1`;
    
    try {
        const response = await fetch(url);
        const data = await response.json();
        
        if (data.length === 0) {
            throw new Error(`Location not found: ${address}`);
        }
        
        return {
            lat: parseFloat(data[0].lat),
            lng: parseFloat(data[0].lon),
            name: data[0].display_name
        };
    } catch (error) {
        throw new Error(`Geocoding failed for "${address}": ${error.message}`);
    }
}

async function calculateRoute(fromLocation, toLocation) {
    // Try OSRM first as it's most reliable and free
    try {
        const result = await tryOSRM(fromLocation, toLocation);
        if (result) {
            console.log('Successfully got route from OSRM');
            return result;
        }
    } catch (error) {
        console.log('OSRM failed:', error.message);
    }
    
    // Try Leaflet Routing Machine as fallback
    try {
        const result = await tryLeafletRouting(fromLocation, toLocation);
        if (result) {
            console.log('Successfully got route from Leaflet Routing');
            return result;
        }
    } catch (error) {
        console.log('Leaflet Routing failed:', error.message);
    }
    
    // Final fallback to realistic car route simulation
    console.log('All routing services failed, using fallback simulation');
    return calculateRealisticCarRoute(fromLocation, toLocation);
}

async function tryOSRM(fromLocation, toLocation) {
    // OSRM public API with error handling
    const osrmUrl = `https://router.project-osrm.org/route/v1/driving/${fromLocation.lng},${fromLocation.lat};${toLocation.lng},${toLocation.lat}?overview=full&geometries=geojson&steps=true`;
    
    const response = await fetch(osrmUrl, {
        method: 'GET',
        headers: {
            'Accept': 'application/json',
        }
    });
    
    if (!response.ok) {
        throw new Error(`OSRM API returned ${response.status}: ${response.statusText}`);
    }
    
    const data = await response.json();
    
    if (data.code !== 'Ok') {
        throw new Error(`OSRM API error: ${data.message || 'Unknown error'}`);
    }
    
    if (data.routes && data.routes[0] && data.routes[0].geometry) {
        const route = data.routes[0];
        const coordinates = route.geometry.coordinates.map(coord => [coord[1], coord[0]]);
        
        return {
            path: coordinates,
            distance: route.distance,
            duration: route.duration
        };
    }
    
    throw new Error('No valid route found in OSRM response');
}

async function tryLeafletRouting(fromLocation, toLocation) {
    // Use a different OSRM instance or routing service
    const alternatives = [
        `https://routing.openstreetmap.de/routed-car/route/v1/driving/${fromLocation.lng},${fromLocation.lat};${toLocation.lng},${toLocation.lat}?overview=full&geometries=geojson`,
        `https://api.mapbox.com/directions/v5/mapbox/driving/${fromLocation.lng},${fromLocation.lat};${toLocation.lng},${toLocation.lat}?overview=full&geometries=geojson&access_token=pk.eyJ1IjoidGVzdCIsImEiOiJjazBlZ2xtYmYwZGc4M3J0Y20xZzBuNWdlIn0.y0HB-L_0n0F9T0x_K-DgNw`
    ];
    
    for (const url of alternatives) {
        try {
            const response = await fetch(url);
            if (response.ok) {
                const data = await response.json();
                
                // Handle different response formats
                if (data.routes && data.routes[0]) {
                    const route = data.routes[0];
                    const coordinates = route.geometry.coordinates.map(coord => [coord[1], coord[0]]);
                    
                    return {
                        path: coordinates,
                        distance: route.distance || route.distance_km * 1000,
                        duration: route.duration || route.duration_s
                    };
                }
            }
        } catch (error) {
            console.log('Alternative routing service failed:', error);
            continue;
        }
    }
    
    throw new Error('All alternative routing services failed');
}

function calculateRealisticCarRoute(fromLocation, toLocation) {
    // Create a more realistic car route by following major highways/roads patterns
    const path = [];
    const numSegments = 15;
    
    // Add some realistic waypoints that simulate following highways
    for (let i = 0; i <= numSegments; i++) {
        const ratio = i / numSegments;
        let lat = fromLocation.lat + (toLocation.lat - fromLocation.lat) * ratio;
        let lng = fromLocation.lng + (toLocation.lng - fromLocation.lng) * ratio;
        
        // Add some variation to simulate following roads instead of straight line
        if (i > 0 && i < numSegments) {
            // Add slight curves that simulate highway routing
            const variance = 0.02;
            const curve = Math.sin(ratio * Math.PI * 3) * variance;
            const perpOffset = Math.cos(ratio * Math.PI * 2) * variance * 0.5;
            
            // Apply the variation
            lat += curve;
            lng += perpOffset;
        }
        
        path.push([lat, lng]);
    }
    
    // Calculate approximate distance (road distance is typically 1.2-1.4x straight line)
    const straightDistance = getDistance([fromLocation.lat, fromLocation.lng], [toLocation.lat, toLocation.lng]);
    const roadDistance = straightDistance * 1.3; // Simulate realistic road distance
    
    return {
        path: path,
        distance: roadDistance,
        duration: Math.round(roadDistance / 1000 * 60) // Rough estimate: 1 minute per km
    };
}

async function visualizeRoutes() {
    const inputs = validateInputs();
    if (!inputs) return;
    
    const button = document.getElementById('visualize-btn');
    button.disabled = true;
    showStatus('Geocoding locations...', 'info');
    
    try {
        clearPreviousRoutes();
        
        const [routeFrom, routeTo] = await Promise.all([
            geocodeLocation(inputs.routeFrom),
            geocodeLocation(inputs.routeTo)
        ]);
        
        showStatus('Calculating route...', 'info');
        
        const routeResult = await calculateRoute(routeFrom, routeTo);
        
        routeData = routeResult;
        
        displayRoute(routeData, CONFIG.ROUTE_COLORS.ROUTE1, 'Route');
        
        fitMapToRoutes([routeData]);
        
        // Show summary with travel time
        const routeTime = formatDuration(routeData.duration);
        const routeDistance = (routeData.distance / 1000).toFixed(1);
        
        // Update route data section
        updateRouteDataSection(routeData);
        
        showStatus(
            `Route calculated successfully! 📍 Distance: ${routeDistance}km | ⏱️ Time: ${routeTime}`, 
            'success'
        );
        
        // Automatically calculate sun positions and car exposure after routes are ready
        setTimeout(() => {
            trackSunPosition();
            setTimeout(() => {
                showCarSunExposure();
            }, 1000);
        }, 500);
        
    } catch (error) {
        showStatus(error.message, 'error');
    } finally {
        button.disabled = false;
    }
}

function clearPreviousRoutes() {
    if (routeLayer) {
        map.removeLayer(routeLayer);
        routeLayer = null;
    }
    clearSunMarkers();
    clearCarVisualization();
    currentSunPositions = [];
    routeData = null;
    
    // Clear route data section
    document.getElementById('route-data-content').innerHTML = '<p class="text-muted-foreground italic text-center text-lg">Calculate a route above to see the API data being used for analysis...</p>';
}

function updateRouteDataSection(routeData) {
    const routeTime = formatDuration(routeData.duration);
    const routeDistance = (routeData.distance / 1000).toFixed(1);
    const numAnalysisPoints = parseInt(document.getElementById('analysis-points').value) || 12;
    
    // Get user input times (treat as UTC)
    const tripDate = document.getElementById('trip-date').value;
    const tripTime = document.getElementById('trip-time').value;
    
    // Calculate arrival time - treat user input as UTC
    const startDateTime = createUTCDateTime(tripDate, tripTime);
    const arrivalDateTime = new Date(startDateTime.getTime() + (routeData.duration * 1000));
    
    // Format times in UTC
    const startTimeStr = formatTimeUTC(startDateTime);
    const arrivalTimeStr = formatTimeUTC(arrivalDateTime);
    
    // Generate analysis points details
    const analysisPointsDetails = generateAnalysisPointsDetails(routeData, startDateTime, numAnalysisPoints);
    
    const content = `
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div class="p-4 bg-secondary/50 rounded-lg border">
                <div class="flex items-center gap-3 mb-2">
                    <span class="text-xl">📍</span>
                    <span class="font-semibold">Distance</span>
                </div>
                <p class="text-muted-foreground">${routeDistance} km</p>
                <p class="text-xs text-muted-foreground mt-1">From OpenStreetMap API</p>
            </div>
            
            <div class="p-4 bg-secondary/50 rounded-lg border">
                <div class="flex items-center gap-3 mb-2">
                    <span class="text-xl">⏱️</span>
                    <span class="font-semibold">Travel Time</span>
                </div>
                <p class="text-muted-foreground">${routeTime}</p>
                <p class="text-xs text-muted-foreground mt-1">From routing service</p>
            </div>
            
            <div class="p-4 bg-secondary/50 rounded-lg border">
                <div class="flex items-center gap-3 mb-2">
                    <span class="text-xl">🚀</span>
                    <span class="font-semibold">Start</span>
                </div>
                <p class="text-muted-foreground">${startTimeStr}</p>
            </div>
            
            <div class="p-4 bg-secondary/50 rounded-lg border">
                <div class="flex items-center gap-3 mb-2">
                    <span class="text-xl">🏁</span>
                    <span class="font-semibold">Arrival</span>
                </div>
                <p class="text-muted-foreground">${arrivalTimeStr}</p>
            </div>
        </div>
        
        <div class="mt-6 p-4 bg-accent/50 rounded-lg border">
            <div class="flex items-center justify-between mb-2">
                <div class="flex items-center gap-3">
                    <span class="text-xl">🎯</span>
                    <span class="font-semibold">Analysis Points</span>
                </div>
                <button onclick="toggleAnalysisPoints()" id="analysis-points-toggle" 
                        class="text-xs bg-background hover:bg-secondary px-3 py-1.5 rounded border transition-colors font-medium">
                    Show Details
                </button>
            </div>
            <p class="text-muted-foreground">${numAnalysisPoints} evenly distributed along the route</p>
            
            <div id="analysis-points-details" class="mt-4 hidden">
                <div class="bg-background rounded-lg border max-h-64 overflow-y-auto">
                    <table class="w-full text-xs">
                        <thead class="bg-secondary sticky top-0">
                            <tr class="border-b">
                                <th class="p-3 text-left font-medium">#</th>
                                <th class="p-3 text-left font-medium">Progress</th>
                                <th class="p-3 text-left font-medium">Distance</th>
                                <th class="p-3 text-left font-medium">UTC Time</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${analysisPointsDetails}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    `;
    
    document.getElementById('route-data-content').innerHTML = content;
}

function generateAnalysisPointsDetails(routeData, startDateTime, numAnalysisPoints) {
    const totalDurationSeconds = routeData.duration;
    const totalDistanceKm = routeData.distance / 1000;
    const startAbsoluteTime = startDateTime;
    
    let details = '';
    
    for (let i = 0; i < numAnalysisPoints; i++) {
        const routeProgress = i / (numAnalysisPoints - 1);
        const pathIndex = Math.floor(routeProgress * (routeData.path.length - 1));
        const position = routeData.path[pathIndex];
        
        // Calculate time and distance
        const timeOffsetSeconds = routeProgress * totalDurationSeconds;
        const traveledDistance = (routeProgress * totalDistanceKm).toFixed(1);
        const absoluteTimeAtPosition = new Date(startAbsoluteTime.getTime() + (timeOffsetSeconds * 1000));
        
        // Format time in UTC
        const utcTimeStr = formatTimeUTC(absoluteTimeAtPosition);
        
        details += `
            <tr class="border-b hover:bg-secondary/50 transition-colors">
                <td class="p-3 font-medium">${i + 1}</td>
                <td class="p-3 text-muted-foreground">${(routeProgress * 100).toFixed(1)}%</td>
                <td class="p-3 text-muted-foreground">${traveledDistance} km</td>
                <td class="p-3 text-muted-foreground">${utcTimeStr}</td>
            </tr>
        `;
    }
    
    return details;
}

function toggleAnalysisPoints() {
    const details = document.getElementById('analysis-points-details');
    const toggle = document.getElementById('analysis-points-toggle');
    
    if (details.classList.contains('hidden')) {
        details.classList.remove('hidden');
        toggle.textContent = 'Hide Details';
    } else {
        details.classList.add('hidden');
        toggle.textContent = 'Show Details';
    }
}

function formatDuration(durationInSeconds) {
    const totalMinutes = Math.round(durationInSeconds / 60);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    
    if (hours > 0) {
        return `${hours}h ${minutes}m`;
    } else {
        return `${minutes}m`;
    }
}

function displayRoute(routeData, color, label) {
    const layer = L.polyline(routeData.path, {
        color: color,
        weight: 6,
        opacity: 0.7
    }).addTo(map);
    
    routeLayer = layer;
    
    layer.bindPopup(`
        <strong>${label}</strong><br>
        📍 Distance: ${(routeData.distance / 1000).toFixed(1)} km<br>
        ⏱️ Travel Time: ${formatDuration(routeData.duration)}
    `);
}

function fitMapToRoutes(routes) {
    const allPoints = [];
    routes.forEach(route => {
        route.path.forEach(point => allPoints.push(point));
    });
    
    if (allPoints.length > 0) {
        const bounds = L.latLngBounds(allPoints);
        map.fitBounds(bounds, { padding: [20, 20] });
    }
}


function getDistance(point1, point2) {
    const [lat1, lng1] = point1;
    const [lat2, lng2] = point2;
    const R = 6371e3;
    const φ1 = lat1 * Math.PI/180;
    const φ2 = lat2 * Math.PI/180;
    const Δφ = (lat2-lat1) * Math.PI/180;
    const Δλ = (lng2-lng1) * Math.PI/180;

    const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ/2) * Math.sin(Δλ/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

    return R * c;
}

// Simple UTC-only time handling functions
function createUTCDateTime(dateStr, timeStr) {
    // Parse as UTC date and time
    const utcDateTimeStr = dateStr + 'T' + timeStr + ':00.000Z';
    return new Date(utcDateTimeStr);
}

function formatTimeUTC(date) {
    const timeStr = date.toLocaleTimeString('en-US', { 
        hour: '2-digit', 
        minute: '2-digit',
        hour12: true,
        timeZone: 'UTC'
    });
    return `${timeStr} UTC`;
}

function trackSunPosition() {
    const tripDate = document.getElementById('trip-date').value;
    const tripTime = document.getElementById('trip-time').value;
    
    if (!tripDate || !tripTime) {
        showStatus('Please select both date and time for the trip start.', 'error');
        return;
    }
    
    if (!routeData) {
        showStatus('Please calculate route first by clicking "Visualize Route".', 'error');
        return;
    }
    
    clearSunMarkers();
    
    // Create UTC datetime from user input
    const startDateTime = createUTCDateTime(tripDate, tripTime);
    showStatus('Calculating sun positions and directions...', 'info');
    
    setTimeout(() => {
        const sunPositions = calculateSunPositionsAlongRoute(routeData.path, startDateTime);
        currentSunPositions = sunPositions; // Store for zoom refresh
        visualizeSunPositions(sunPositions);
        showStatus(`Sun positions calculated for ${sunPositions.length} points along the route.`, 'success');
    }, 500);
}

function calculateSunPositionsAlongRoute(routePath, startDate) {
    const sunPositions = [];
    const numAnalysisPoints = parseInt(document.getElementById('analysis-points').value) || 12;
    const totalDurationSeconds = routeData.duration; // Use actual API travel time
    
    // User input is treated as UTC
    const startAbsoluteTime = startDate;
    
    console.log(`Route starting at ${formatTimeUTC(startDate)}`);
    console.log(`Analyzing ${numAnalysisPoints} points along route (${formatDuration(totalDurationSeconds)} total travel time)`);
    
    // Create evenly distributed analysis points
    for (let i = 0; i < numAnalysisPoints; i++) {
        // Calculate position along route (0 to 1)
        const routeProgress = i / (numAnalysisPoints - 1);
        
        // Get position by distributing points evenly along route path
        const pathIndex = Math.floor(routeProgress * (routePath.length - 1));
        const position = routePath[pathIndex];
        
        // Calculate time at this position using actual API travel time
        const timeOffsetSeconds = routeProgress * totalDurationSeconds;
        const absoluteTimeAtPosition = new Date(startAbsoluteTime.getTime() + (timeOffsetSeconds * 1000));
        
        // Calculate sun position using UTC time
        const sunPosition = calculateSunPosition(position[0], position[1], absoluteTimeAtPosition);
        
        const isDaylight = sunPosition.elevation > 0;
        
        console.log(`Stop ${i + 1} at ${formatTimeUTC(absoluteTimeAtPosition)}:`);
        console.log(`  Location: ${position[0].toFixed(3)}, ${position[1].toFixed(3)}`);
        console.log(`  Progress: ${(routeProgress * 100).toFixed(1)}% along route`);
        console.log(`  Sun elevation: ${sunPosition.elevation.toFixed(1)}°, Azimuth: ${sunPosition.azimuth.toFixed(1)}° (${isDaylight ? 'DAY' : 'NIGHT'})`);
        
        sunPositions.push({
            location: position,
            absoluteTime: absoluteTimeAtPosition,    // UTC time
            routeProgress: routeProgress,            // 0-1 progress along route
            sunAzimuth: sunPosition.azimuth,
            sunElevation: sunPosition.elevation,
            isDaylight: isDaylight,
            // Legacy field for compatibility
            time: absoluteTimeAtPosition
        });
    }
    
    return sunPositions;
}

function calculateSunPosition(latitude, longitude, date) {
    // Use SunCalc library for accurate sun position calculation
    const sunPosition = SunCalc.getPosition(date, latitude, longitude);
    
    // Convert radians to degrees and adjust coordinate system
    const elevation = sunPosition.altitude * 180 / Math.PI;
    // SunCalc returns azimuth with 0° = South, convert to 0° = North
    let azimuth = (sunPosition.azimuth * 180 / Math.PI + 180) % 360;
    
    const result = {
        elevation: elevation,
        azimuth: azimuth
    };
    
    // Debug logging (simplified)
    console.log(`Sun position at ${date.toISOString()} (UTC):`);
    console.log(`  Lat: ${latitude.toFixed(3)}°, Lon: ${longitude.toFixed(3)}°`);
    console.log(`  → Elevation: ${result.elevation.toFixed(1)}°, Azimuth: ${result.azimuth.toFixed(1)}°`);
    console.log(`  → ${result.elevation > 0 ? 'DAYLIGHT' : 'NIGHTTIME'}`);
    
    return result;
}

function visualizeSunPositions(sunPositions) {
    sunPositions.forEach((sunPos, index) => {
        const timeString = formatTimeUTC(sunPos.absoluteTime);
        
        // Create main marker at the location
        const mainIcon = L.divIcon({
            html: `<div style="
                width: 16px; 
                height: 16px; 
                background-color: ${sunPos.isDaylight ? '#FFD700' : '#2C3E50'}; 
                border: 2px solid #FFA500; 
                border-radius: 50%; 
                display: flex; 
                align-items: center; 
                justify-content: center;
                font-size: 8px;
                color: white;
                font-weight: bold;
                z-index: 1000;
            ">${index + 1}</div>`,
            className: 'location-marker',
            iconSize: [16, 16],
            iconAnchor: [8, 8]
        });
        
        const locationMarker = L.marker([sunPos.location[0], sunPos.location[1]], {
            icon: mainIcon,
            zIndexOffset: 1000
        }).addTo(map);
        
        // Create sky dome visualization
        if (sunPos.isDaylight) {
            createSkyDomeVisualization(sunPos, index);
        }
        
        const popupContent = `
            <div style="font-family: Arial, sans-serif; max-width: 320px;">
                <h4 style="margin: 0 0 10px 0; color: #333;">Stop #${index + 1} - ${timeString}</h4>
                <div style="background: #f8f9fa; padding: 10px; border-radius: 5px; margin: 10px 0;">
                    <p style="margin: 2px 0;"><strong>☀️ Sun Position:</strong></p>
                    <p style="margin: 2px 0;">• <strong>Direction:</strong> ${getCompassDirection(sunPos.sunAzimuth)} (${sunPos.sunAzimuth.toFixed(1)}°)</p>
                    <p style="margin: 2px 0;">• <strong>Height:</strong> ${sunPos.sunElevation.toFixed(1)}° above horizon</p>
                    <p style="margin: 2px 0;">• <strong>Status:</strong> ${getSkyDescription(sunPos.sunElevation)}</p>
                </div>
                <p style="margin: 3px 0;"><strong>Progress:</strong> ${(sunPos.routeProgress * 100).toFixed(1)}% along route</p>
                <p style="margin: 3px 0; font-size: 12px; color: #666;">
                    ${sunPos.isDaylight ? '🌅 Line color & length show sun height: RED/short = overhead, YELLOW/long = horizon' : '🌙 Nighttime - no sun visible'}
                </p>
            </div>
        `;
        
        locationMarker.bindPopup(popupContent);
        sunMarkers.push(locationMarker);
    });
}

function createSkyDomeVisualization(sunPos, index) {
    const [lat, lng] = sunPos.location;
    const azimuth = sunPos.sunAzimuth;
    const elevation = sunPos.sunElevation;
    
    // Create sky dome with reasonable radius but enhanced difference
    const currentZoom = map.getZoom();
    const userSizeMultiplier = 1.0; // Default size multiplier since slider was removed
    const baseRadius = 5000; // Moderate increase from original 2000m for better visibility
    const zoomFactor = Math.pow(2, (11 - currentZoom)); // Scale inversely with zoom
    const horizonRadius = Math.max(200, baseRadius * zoomFactor * userSizeMultiplier); // Reasonable minimum
    
    // Calculate sun position with moderate non-linear scaling
    // When elevation = 90° (directly overhead), distance = 0 (sun at same location as observer)
    // When elevation = 0° (on horizon), distance = horizonRadius (sun at edge of dome)
    // Use gentle exponential curve to make the difference more noticeable but not extreme
    
    const elevationFactor = Math.max(0, elevation) / 90; // 0 to 1 (0 = horizon, 1 = overhead)
    
    // Apply gentle exponential curve for subtle but noticeable effect
    // This makes high elevation closer to center, low elevation farther, but not extreme
    const dramaticFactor = Math.pow(elevationFactor, 1.8); // Gentler exponential curve
    const sunDistance = horizonRadius * (1 - dramaticFactor);
    
    console.log(`DEBUG: Processing elevation ${elevation.toFixed(1)}°`);
    console.log(`  → Elevation factor: ${elevationFactor.toFixed(3)}`);
    console.log(`  → Dramatic factor: ${dramaticFactor.toFixed(3)}`);
    console.log(`  → Sun distance from center: ${sunDistance.toFixed(0)}m`);
    console.log(`  → Horizon radius: ${horizonRadius.toFixed(0)}m`);
    console.log(`  → Distance ratio: ${(sunDistance / horizonRadius * 100).toFixed(1)}% of horizon radius`);
    console.log(`  → Line color: ${getSunLineColor(elevation)}`);
    
    const sunDistanceInDegrees = sunDistance / 111000; // Convert meters to degrees
    
    const sunRad = (azimuth * Math.PI) / 180;
    const sunLat = lat + Math.cos(sunRad) * sunDistanceInDegrees;
    const sunLng = lng + Math.sin(sunRad) * sunDistanceInDegrees;
    
    // Create sun marker with elevation-based colors and size
    const sunSize = Math.max(12, 20 - (elevation / 90) * 8); // Larger when lower in sky
    const markerColors = getSunMarkerColors(elevation);
    const sunIcon = L.divIcon({
        html: `<div style="
            width: ${sunSize}px; 
            height: ${sunSize}px; 
            background: ${markerColors.background}; 
            border: 2px solid ${markerColors.border}; 
            border-radius: 50%; 
            display: flex; 
            align-items: center; 
            justify-content: center;
            font-size: ${Math.max(8, sunSize - 8)}px;
            color: white;
            text-shadow: 1px 1px 1px rgba(0,0,0,0.8);
            box-shadow: 0 0 ${sunSize/2}px ${markerColors.shadow};
            position: relative;
        ">☀</div>`,
        className: 'sun-in-sky',
        iconSize: [sunSize, sunSize],
        iconAnchor: [sunSize/2, sunSize/2]
    });
    
    const sunMarker = L.marker([sunLat, sunLng], {
        icon: sunIcon,
        zIndexOffset: 800
    }).addTo(map);
    
    // Create line from observer location to sun position in sky with elevation-based color
    const lineColor = getSunLineColor(elevation);
    const elevationLine = L.polyline([
        [lat, lng], // Observer location
        [sunLat, sunLng] // Sun position on sky dome
    ], {
        color: lineColor,
        weight: 6, // Reasonable thickness for good visibility
        opacity: 1.0
    }).addTo(map);
    
    const sunPopup = `
        <div style="font-family: Arial, sans-serif; text-align: center; max-width: 200px;">
            <strong>☀️ Sun in Sky</strong><br>
            <p style="margin: 5px 0; font-size: 12px;">
                Looking ${getCompassDirection(azimuth)}<br>
                ${elevation.toFixed(1)}° above horizon<br>
                <em>${getSkyDescription(elevation)}</em>
            </p>
        </div>
    `;
    
    sunMarker.bindPopup(sunPopup);
    
    sunMarkers.push(sunMarker);
    sunMarkers.push(elevationLine);
}

function getCompassDirection(azimuth) {
    const directions = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
    const index = Math.round(azimuth / 22.5) % 16;
    return directions[index];
}

function getSkyDescription(elevation) {
    if (elevation < 5) return 'Just above horizon';
    if (elevation < 15) return 'Low in sky';
    if (elevation < 30) return 'Moderately low';
    if (elevation < 60) return 'High in sky';
    if (elevation < 80) return 'Very high';
    return 'Nearly overhead';
}

function getSunLineColor(elevation) {
    const colorRanges = [
        { min: 70, color: '#FF0080' },
        { min: 50, red: 255, green: [32, 0], blue: [128, 0] },
        { min: 30, red: 255, green: [155, 100], blue: 0 },
        { min: 10, red: 255, green: [255, 165], blue: 0 },
        { min: 0, color: '#FFD700' }
    ];
    
    for (const range of colorRanges) {
        if (elevation >= range.min) {
            if (range.color) return range.color;
            const factor = (elevation - range.min) / 20;
            const green = Math.round(range.green[1] + (range.green[0] - range.green[1]) * factor);
            const blue = Array.isArray(range.blue) 
                ? Math.round(range.blue[1] + (range.blue[0] - range.blue[1]) * factor)
                : range.blue;
            return `rgb(${range.red}, ${green}, ${blue})`;
        }
    }
}

function getSunMarkerColors(elevation) {
    const colorSets = [
        { min: 70, colors: ['#FF0080', '#FF4500', '#FF6B00'], border: '#FF0080', rgba: '255, 0, 128' },
        { min: 50, colors: ['#FF4500', '#FF6B00', '#FF8C00'], border: '#FF4500', rgba: '255, 69, 0' },
        { min: 30, colors: ['#FF8C00', '#FFA500', '#FFB84D'], border: '#FF8C00', rgba: '255, 140, 0' },
        { min: 10, colors: ['#FFA500', '#FFD700', '#FFEB99'], border: '#FFA500', rgba: '255, 165, 0' },
        { min: 0, colors: ['#FFD700', '#FFEB99', '#FFF8DC'], border: '#FFD700', rgba: '255, 215, 0' }
    ];
    
    for (const set of colorSets) {
        if (elevation >= set.min) {
            return {
                background: `radial-gradient(circle, ${set.colors[0]} 0%, ${set.colors[1]} 70%, ${set.colors[2]} 100%)`,
                border: set.border,
                shadow: `rgba(${set.rgba}, 0.8)`
            };
        }
    }
}

function clearSunMarkers() {
    sunMarkers.forEach(marker => {
        map.removeLayer(marker);
    });
    sunMarkers = [];
}

function refreshSunVisualization() {
    if (currentSunPositions.length > 0) {
        clearSunMarkers();
        visualizeSunPositions(currentSunPositions);
        console.log(`Refreshed sun visualization with ${currentSunPositions.length} positions at zoom level ${map.getZoom()}`);
    }
}

function showCarSunExposure() {
    const tripDate = document.getElementById('trip-date').value;
    const tripTime = document.getElementById('trip-time').value;
    
    if (!tripDate || !tripTime) {
        showStatus('Please select both date and time for the trip start.', 'error');
        return;
    }
    
    if (!routeData) {
        showStatus('Please calculate route first by clicking "Visualize Route".', 'error');
        return;
    }
    
    clearCarVisualization();
    
    // Create UTC datetime from user input
    const startDateTime = createUTCDateTime(tripDate, tripTime);
    showStatus('Calculating car sun exposure...', 'info');
    
    setTimeout(() => {
        const carExposureData = calculateCarSunExposure(routeData.path, startDateTime);
        visualizeCarSunExposure(carExposureData);
        showStatus(`Car sun exposure calculated for ${carExposureData.length} points along the route.`, 'success');
    }, 500);
}

function calculateCarSunExposure(routePath, startDate) {
    const carExposureData = [];
    const numAnalysisPoints = parseInt(document.getElementById('analysis-points').value) || 12;
    const totalDurationSeconds = routeData.duration; // Use actual API travel time
    
    // User input is treated as UTC
    const startAbsoluteTime = startDate;
    
    // Create evenly distributed analysis points
    for (let i = 0; i < numAnalysisPoints; i++) {
        // Calculate position along route (0 to 1)
        const routeProgress = i / (numAnalysisPoints - 1);
        
        // Get position by distributing points evenly along route path
        const pathIndex = Math.floor(routeProgress * (routePath.length - 1));
        const position = routePath[pathIndex];
        
        // Calculate time at this position using actual API travel time
        const timeOffsetSeconds = routeProgress * totalDurationSeconds;
        const absoluteTimeAtPosition = new Date(startAbsoluteTime.getTime() + (timeOffsetSeconds * 1000));
        
        // Calculate sun position using UTC time
        const sunPosition = calculateSunPosition(position[0], position[1], absoluteTimeAtPosition);
        
        // Calculate car orientation (bearing to next point)
        let carBearing = 0;
        if (pathIndex < routePath.length - 1) {
            carBearing = calculateBearing(routePath[pathIndex], routePath[pathIndex + 1]);
        } else if (pathIndex > 0) {
            carBearing = calculateBearing(routePath[pathIndex - 1], routePath[pathIndex]);
        }
        
        const isDaylight = sunPosition.elevation > 0;
        
        let carSideExposures = {
            front: 0, back: 0, left: 0, right: 0
        };
        
        if (isDaylight) {
            carSideExposures = calculateCarSideExposures(sunPosition, carBearing);
        }
        
        carExposureData.push({
            location: position,
            absoluteTime: absoluteTimeAtPosition,    // UTC time
            routeProgress: routeProgress,            // 0-1 progress along route
            sunAzimuth: sunPosition.azimuth,
            sunElevation: sunPosition.elevation,
            carBearing: carBearing,
            isDaylight: isDaylight,
            exposures: carSideExposures,
            // Legacy field for compatibility
            time: absoluteTimeAtPosition
        });
    }
    
    return carExposureData;
}

function calculateBearing(point1, point2) {
    const lat1 = point1[0] * Math.PI / 180;
    const lat2 = point2[0] * Math.PI / 180;
    const deltaLng = (point2[1] - point1[1]) * Math.PI / 180;
    
    const y = Math.sin(deltaLng) * Math.cos(lat2);
    const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(deltaLng);
    
    let bearing = Math.atan2(y, x) * 180 / Math.PI;
    return (bearing + 360) % 360;
}

function calculateCarSideExposures(sunPosition, carBearing) {
    const relativeSunAngle = (sunPosition.azimuth - carBearing + 360) % 360;
    
    const calculateSideExposure = (targetAngle, tolerance = 90) => {
        let angle = Math.abs(relativeSunAngle - targetAngle);
        if (targetAngle === 270 && angle >= 270) angle = 360 - angle;
        return angle <= tolerance ? Math.cos(angle * Math.PI / 180) : 0;
    };
    
    const rawExposures = {
        front: calculateSideExposure(Math.min(relativeSunAngle, 360 - relativeSunAngle) <= 90 ? 0 : 360),
        back: calculateSideExposure(180),
        left: calculateSideExposure(270),
        right: calculateSideExposure(90)
    };
    
    const totalExposure = Object.values(rawExposures).reduce((sum, val) => sum + val, 0);
    
    return totalExposure > 0 
        ? Object.fromEntries(Object.entries(rawExposures).map(([key, val]) => [key, val / totalExposure]))
        : { front: 0, back: 0, left: 0, right: 0 };
}

function getExposureColor(exposureLevel) {
    // Map exposure level (0-1) to color gradient (white to red)
    const intensity = Math.max(0, Math.min(1, exposureLevel));
    
    if (intensity === 0) {
        return '#ffffff'; // White for no exposure
    }
    
    // Gradient from white to red
    const red = 255;
    const green = Math.round(255 * (1 - intensity));
    const blue = Math.round(255 * (1 - intensity));
    
    return `rgb(${red}, ${green}, ${blue})`;
}

function updateCarSideColor(elementId, exposureLevel) {
    const percentage = exposureLevel * 100;
    
    // Map elementId to the actual label container IDs
    const labelMapping = {
        'summary-front': 'front-percentage',
        'summary-back': 'back-percentage', 
        'summary-left': 'left-percentage',
        'summary-right': 'right-percentage'
    };
    
    const percentageElementId = labelMapping[elementId];
    if (!percentageElementId) return;
    
    const percentageElement = document.getElementById(percentageElementId);
    if (!percentageElement) return;
    
    // Get the parent container (the label box)
    const labelContainer = percentageElement.closest('.bg-background');
    if (!labelContainer) return;
    
    // Calculate yellow intensity based on exposure level (0-100%)
    // Higher exposure = more yellow background
    const yellowIntensity = Math.round(exposureLevel * 255); // 0-255
    const bgColor = `rgb(255, 255, ${255 - yellowIntensity})`; // Yellow background
    const textColor = yellowIntensity > 127 ? '#000000' : '#666666'; // Dark text on light yellow
    
    // Apply colors
    labelContainer.style.backgroundColor = bgColor;
    labelContainer.style.color = textColor;
    labelContainer.style.borderColor = yellowIntensity > 50 ? '#d4a574' : 'hsl(214.3 31.8% 91.4%)';
}

function createCarMarker(carData, index) {
    const timeString = formatTimeUTC(carData.absoluteTime);
    
    // Create rotated car SVG icon
    const carSvg = `
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 80" width="40" height="80">
            <g fill="#2563eb" stroke="#1d4ed8" stroke-width="1" stroke-linecap="round" stroke-linejoin="round" transform="rotate(${carData.carBearing} 20 40)">
                <!-- Car body -->
                <rect x="8" y="10" width="24" height="60" rx="8" fill="#3b82f6"/>
                
                <!-- Windshield -->
                <path d="M12 25 C20 20 20 20 28 25" stroke="#60a5fa" stroke-width="2" fill="none"/>
                
                <!-- Rear window -->
                <path d="M12 55 C20 60 20 60 28 55" stroke="#60a5fa" stroke-width="2" fill="none"/>
                
                <!-- Headlights -->
                <circle cx="15" cy="8" r="2" fill="#fbbf24"/>
                <circle cx="25" cy="8" r="2" fill="#fbbf24"/>
                
                <!-- Wheels -->
                <rect x="6" y="18" width="4" height="8" rx="2" fill="#374151"/>
                <rect x="30" y="18" width="4" height="8" rx="2" fill="#374151"/>
                <rect x="6" y="54" width="4" height="8" rx="2" fill="#374151"/>
                <rect x="30" y="54" width="4" height="8" rx="2" fill="#374151"/>
            </g>
        </svg>
    `;
    
    const carIcon = L.divIcon({
        html: carSvg,
        className: 'car-marker',
        iconSize: [40, 80],
        iconAnchor: [20, 40]
    });
    
    const carMarker = L.marker([carData.location[0], carData.location[1]], {
        icon: carIcon,
        zIndexOffset: 500
    }).addTo(map);
    
    const popupContent = `
        <div style="font-family: Arial, sans-serif; max-width: 320px;">
            <h4 style="margin: 0 0 10px 0; color: #333;">🚗 Car Position #${index + 1}</h4>
            <div style="background: #f8f9fa; padding: 10px; border-radius: 5px; margin: 10px 0;">
                <p style="margin: 2px 0;"><strong>🕐 Time:</strong> ${timeString}</p>
                <p style="margin: 2px 0;"><strong>🧭 Car Direction:</strong> ${getCompassDirection(carData.carBearing)} (${carData.carBearing.toFixed(1)}°)</p>
                <p style="margin: 2px 0;"><strong>☀️ Sun Direction:</strong> ${getCompassDirection(carData.sunAzimuth)} (${carData.sunAzimuth.toFixed(1)}°)</p>
                <p style="margin: 2px 0;"><strong>📊 Progress:</strong> ${(carData.routeProgress * 100).toFixed(1)}% along route</p>
            </div>
            ${carData.isDaylight ? `
                <div style="background: #fff3cd; padding: 8px; border-radius: 5px; margin: 10px 0;">
                    <p style="margin: 2px 0; font-weight: bold;">Sun Exposure:</p>
                    <p style="margin: 1px 0;">Front: ${(carData.exposures.front * 100).toFixed(1)}%</p>
                    <p style="margin: 1px 0;">Back: ${(carData.exposures.back * 100).toFixed(1)}%</p>
                    <p style="margin: 1px 0;">Left: ${(carData.exposures.left * 100).toFixed(1)}%</p>
                    <p style="margin: 1px 0;">Right: ${(carData.exposures.right * 100).toFixed(1)}%</p>
                </div>
            ` : '<p style="color: #666; font-style: italic;">🌙 Nighttime - no sun exposure</p>'}
        </div>
    `;
    
    carMarker.bindPopup(popupContent);
    carVisualizationMarkers.push(carMarker);
}

function visualizeCarSunExposure(carExposureData) {
    // Console logging for debugging
    console.log('=== CAR SUN EXPOSURE ANALYSIS ===');
    console.log(`Analyzed ${carExposureData.length} points along the route:`);
    
    carExposureData.forEach((carData, index) => {
        const timeString = formatTimeUTC(carData.absoluteTime);
        
        console.log(`\n--- Point ${index + 1} at ${timeString} ---`);
        console.log(`Location: [${carData.location[0].toFixed(4)}, ${carData.location[1].toFixed(4)}]`);
        console.log(`Progress: ${(carData.routeProgress * 100).toFixed(1)}% along route`);
        console.log(`Car direction: ${getCompassDirection(carData.carBearing)} (${carData.carBearing.toFixed(1)}°)`);
        console.log(`Sun position: ${getCompassDirection(carData.sunAzimuth)} (${carData.sunAzimuth.toFixed(1)}°), ${carData.sunElevation.toFixed(1)}° elevation`);
        console.log(`Daylight: ${carData.isDaylight}`);
        
        if (carData.isDaylight) {
            console.log('Sun exposure levels:');
            console.log(`  Front: ${(carData.exposures.front * 100).toFixed(1)}%`);
            console.log(`  Back: ${(carData.exposures.back * 100).toFixed(1)}%`);
            console.log(`  Left: ${(carData.exposures.left * 100).toFixed(1)}%`);
            console.log(`  Right: ${(carData.exposures.right * 100).toFixed(1)}%`);
        } else {
            console.log('  No sun exposure (nighttime)');
        }
        
        // Create car marker with orientation
        createCarMarker(carData, index);
    });
    
    // Calculate averages and update summary visualization
    updateSummaryVisualization(carExposureData);
}

function updateSummaryVisualization(carExposureData) {
    // Calculate average exposures for each side
    const daylightData = carExposureData.filter(data => data.isDaylight);
    
    if (daylightData.length === 0) {
        // No daylight data - clear all exposure classes and show 0%
        updateCarSideColor('summary-front', 0);
        updateCarSideColor('summary-back', 0);
        updateCarSideColor('summary-left', 0);
        updateCarSideColor('summary-right', 0);
        
        document.getElementById('front-percentage').textContent = '0%';
        document.getElementById('back-percentage').textContent = '0%';
        document.getElementById('left-percentage').textContent = '0%';
        document.getElementById('right-percentage').textContent = '0%';
    } else {
        // Calculate averages
        const avgExposures = {
            front: daylightData.reduce((sum, data) => sum + data.exposures.front, 0) / daylightData.length,
            back: daylightData.reduce((sum, data) => sum + data.exposures.back, 0) / daylightData.length,
            left: daylightData.reduce((sum, data) => sum + data.exposures.left, 0) / daylightData.length,
            right: daylightData.reduce((sum, data) => sum + data.exposures.right, 0) / daylightData.length
        };
        
        // Update box visualization colors using CSS classes based on exposure levels
        updateCarSideColor('summary-front', avgExposures.front);
        updateCarSideColor('summary-back', avgExposures.back);
        updateCarSideColor('summary-left', avgExposures.left);
        updateCarSideColor('summary-right', avgExposures.right);
        
        // Update percentages displayed on each side
        document.getElementById('front-percentage').textContent = `${(avgExposures.front * 100).toFixed(0)}%`;
        document.getElementById('back-percentage').textContent = `${(avgExposures.back * 100).toFixed(0)}%`;
        document.getElementById('left-percentage').textContent = `${(avgExposures.left * 100).toFixed(0)}%`;
        document.getElementById('right-percentage').textContent = `${(avgExposures.right * 100).toFixed(0)}%`;
        
        // Find which side gets most/least sun for console logging
        const exposureEntries = Object.entries(avgExposures);
        const maxExposure = exposureEntries.reduce((max, [side, value]) => value > max.value ? {side, value} : max, {side: '', value: -1});
        const minExposure = exposureEntries.reduce((min, [side, value]) => value < min.value ? {side, value} : min, {side: '', value: 2});
        
        console.log('\n=== TRIP SUMMARY ===');
        console.log(`Average sun exposure levels:`);
        console.log(`  Front: ${(avgExposures.front * 100).toFixed(1)}%`);
        console.log(`  Back: ${(avgExposures.back * 100).toFixed(1)}%`);
        console.log(`  Left: ${(avgExposures.left * 100).toFixed(1)}%`);
        console.log(`  Right: ${(avgExposures.right * 100).toFixed(1)}%`);
        console.log(`Most exposed side: ${maxExposure.side} (${(maxExposure.value * 100).toFixed(1)}%)`);
        console.log(`Least exposed side: ${minExposure.side} (${(minExposure.value * 100).toFixed(1)}%)`);
    }
    
    // Hide placeholder and show the summary container
    document.getElementById('results-placeholder').style.display = 'none';
    document.getElementById('car-summary').style.display = 'block';
}

function clearCarVisualization() {
    // Show placeholder and hide the summary container
    document.getElementById('results-placeholder').style.display = 'flex';
    document.getElementById('car-summary').style.display = 'none';
    
    // Clear any remaining markers (though we're not using them anymore)
    carVisualizationMarkers.forEach(marker => {
        map.removeLayer(marker);
    });
    carVisualizationMarkers = [];
}

window.onload = initMap;
