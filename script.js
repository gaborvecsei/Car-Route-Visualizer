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

function parseUrlParameters() {
    const urlParams = new URLSearchParams(window.location.search);
    const fromParam = urlParams.get('from');
    const toParam = urlParams.get('to');
    
    if (fromParam) {
        document.getElementById('route-from').value = decodeURIComponent(fromParam);
    }
    
    if (toParam) {
        document.getElementById('route-to').value = decodeURIComponent(toParam);
    }
    
    // If both parameters are present, automatically trigger analysis
    if (fromParam && toParam) {
        setTimeout(() => {
            visualizeRoutes();
        }, 1000); // Small delay to ensure map is fully initialized
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
    
    
    const today = new Date();
    document.getElementById('trip-date').value = today.toISOString().split('T')[0];
    document.getElementById('trip-time').value = '08:00';
    
    // Parse URL parameters and prefill inputs
    parseUrlParameters();
    
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
    const result = await tryOSRM(fromLocation, toLocation);
    console.log('Successfully got route from OSRM');
    return result;
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
    
    const startDateTime = createUTCDateTime(tripDate, tripTime);
    const arrivalDateTime = new Date(startDateTime.getTime() + (routeData.duration * 1000));
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
    const totalDistanceKm = routeData.distance / 1000;
    
    let details = '';
    for (let i = 0; i < numAnalysisPoints; i++) {
        const routeProgress = i / (numAnalysisPoints - 1);
        const timeOffsetSeconds = routeProgress * routeData.duration;
        const traveledDistance = (routeProgress * totalDistanceKm).toFixed(1);
        const absoluteTimeAtPosition = new Date(startDateTime.getTime() + (timeOffsetSeconds * 1000));
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

function createUTCDateTime(dateStr, timeStr) {
    return new Date(dateStr + 'T' + timeStr + ':00.000Z');
}

function formatTimeUTC(date) {
    return date.toLocaleTimeString('en-US', { 
        hour: '2-digit', 
        minute: '2-digit',
        hour12: true,
        timeZone: 'UTC'
    }) + ' UTC';
}

function validateRouteInputs() {
    const tripDate = document.getElementById('trip-date').value;
    const tripTime = document.getElementById('trip-time').value;
    
    if (!tripDate || !tripTime) {
        showStatus('Please select both date and time for the trip start.', 'error');
        return null;
    }
    
    if (!routeData) {
        showStatus('Please calculate route first by clicking "Visualize Route".', 'error');
        return null;
    }
    
    return createUTCDateTime(tripDate, tripTime);
}

function calculateAnalysisPoints(routePath, startDateTime) {
    const analysisData = [];
    const numAnalysisPoints = parseInt(document.getElementById('analysis-points').value) || 12;
    const totalDurationSeconds = routeData.duration;
    
    for (let i = 0; i < numAnalysisPoints; i++) {
        const routeProgress = i / (numAnalysisPoints - 1);
        const pathIndex = Math.floor(routeProgress * (routePath.length - 1));
        const position = routePath[pathIndex];
        
        const timeOffsetSeconds = routeProgress * totalDurationSeconds;
        const absoluteTimeAtPosition = new Date(startDateTime.getTime() + (timeOffsetSeconds * 1000));
        
        const sunPosition = calculateSunPosition(position[0], position[1], absoluteTimeAtPosition);
        
        let carBearing = 0;
        if (pathIndex < routePath.length - 1) {
            carBearing = calculateBearing(routePath[pathIndex], routePath[pathIndex + 1]);
        } else if (pathIndex > 0) {
            carBearing = calculateBearing(routePath[pathIndex - 1], routePath[pathIndex]);
        }
        
        const isDaylight = sunPosition.elevation > 0;
        const carSideExposures = isDaylight ? calculateCarSideExposures(sunPosition, carBearing) : 
            { front: 0, back: 0, left: 0, right: 0 };
        
        analysisData.push({
            location: position,
            absoluteTime: absoluteTimeAtPosition,
            routeProgress: routeProgress,
            sunAzimuth: sunPosition.azimuth,
            sunElevation: sunPosition.elevation,
            carBearing: carBearing,
            isDaylight: isDaylight,
            exposures: carSideExposures,
            time: absoluteTimeAtPosition
        });
    }
    
    return analysisData;
}

function trackSunPosition() {
    const startDateTime = validateRouteInputs();
    if (!startDateTime) return;
    
    clearSunMarkers();
    showStatus('Calculating sun positions and directions...', 'info');
    
    setTimeout(() => {
        const sunPositions = calculateAnalysisPoints(routeData.path, startDateTime);
        currentSunPositions = sunPositions;
        visualizeSunPositions(sunPositions);
        showStatus(`Sun positions calculated for ${sunPositions.length} points along the route.`, 'success');
    }, 500);
}


function visualizeSunPositions(sunPositions) {
    sunPositions.forEach((sunPos, index) => {
        const timeString = formatTimeUTC(sunPos.absoluteTime);
        
        const carBearing = sunPos.carBearing;
        
        // Create car icon marker instead of numbered dot
        const carSvg = `
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="-30 -30 120 180" width="60" height="120">
                <g fill="#2563eb" stroke="#1d4ed8" stroke-width="1" stroke-linecap="round" stroke-linejoin="round" transform="rotate(${carBearing} 30 60)">
                    <!-- Car body -->
                    <rect x="18" y="20" width="24" height="60" rx="8" fill="#3b82f6"/>
                    
                    <!-- Windshield -->
                    <path d="M22 35 C30 30 30 30 38 35" stroke="#60a5fa" stroke-width="2" fill="none"/>
                    
                    <!-- Rear window -->
                    <path d="M22 65 C30 70 30 70 38 65" stroke="#60a5fa" stroke-width="2" fill="none"/>
                    
                    <!-- Headlights -->
                    <circle cx="25" cy="18" r="2" fill="#fbbf24"/>
                    <circle cx="35" cy="18" r="2" fill="#fbbf24"/>
                    
                    <!-- Wheels -->
                    <rect x="16" y="28" width="4" height="8" rx="2" fill="#374151"/>
                    <rect x="40" y="28" width="4" height="8" rx="2" fill="#374151"/>
                    <rect x="16" y="64" width="4" height="8" rx="2" fill="#374151"/>
                    <rect x="40" y="64" width="4" height="8" rx="2" fill="#374151"/>
                </g>
            </svg>
        `;
        
        const carIcon = L.divIcon({
            html: carSvg,
            className: 'car-marker',
            iconSize: [60, 120],
            iconAnchor: [30, 60]
        });
        
        const locationMarker = L.marker([sunPos.location[0], sunPos.location[1]], {
            icon: carIcon,
            zIndexOffset: 1000
        }).addTo(map);
        
        // Create sky dome visualization
        if (sunPos.isDaylight) {
            createSkyDomeVisualization(sunPos, index);
        }
        
        const carSideExposures = sunPos.exposures;
        const relativeSunAngle = sunPos.isDaylight ? (sunPos.sunAzimuth - carBearing + 360) % 360 : 0;
        
        const popupContent = `
            <div style="font-family: Arial, sans-serif; max-width: 320px;">
                <h4 style="margin: 0 0 10px 0; color: #333;">🚗 Stop #${index + 1} - ${timeString}</h4>
                <div style="background: #f8f9fa; padding: 10px; border-radius: 5px; margin: 10px 0;">
                    <p style="margin: 2px 0;"><strong>🧭 Car Direction:</strong> ${getCompassDirection(carBearing)} (${carBearing.toFixed(1)}°)</p>
                    <p style="margin: 2px 0;"><strong>📊 Progress:</strong> ${(sunPos.routeProgress * 100).toFixed(1)}% along route</p>
                </div>
                <div style="background: #f8f9fa; padding: 10px; border-radius: 5px; margin: 10px 0;">
                    <p style="margin: 2px 0;"><strong>☀️ Sun Position:</strong></p>
                    <p style="margin: 2px 0;">• <strong>Direction:</strong> ${getCompassDirection(sunPos.sunAzimuth)} (${sunPos.sunAzimuth.toFixed(1)}°)</p>
                    <p style="margin: 2px 0;">• <strong>Height:</strong> ${sunPos.sunElevation.toFixed(1)}° above horizon</p>
                    ${sunPos.isDaylight ? `<p style="margin: 2px 0;">• <strong>Relative to car:</strong> ${relativeSunAngle.toFixed(1)}°</p>` : ''}
                    <p style="margin: 2px 0;">• <strong>Status:</strong> ${getSkyDescription(sunPos.sunElevation)}</p>
                </div>
                ${sunPos.isDaylight ? `
                    <div style="background: #fff3cd; padding: 8px; border-radius: 5px; margin: 10px 0;">
                        <p style="margin: 2px 0; font-weight: bold;">☀️ Sun Exposure:</p>
                        <p style="margin: 1px 0;">Front: ${(carSideExposures.front * 100).toFixed(1)}%</p>
                        <p style="margin: 1px 0;">Back: ${(carSideExposures.back * 100).toFixed(1)}%</p>
                        <p style="margin: 1px 0;">Left: ${(carSideExposures.left * 100).toFixed(1)}%</p>
                        <p style="margin: 1px 0;">Right: ${(carSideExposures.right * 100).toFixed(1)}%</p>
                    </div>
                ` : '<p style="color: #666; font-style: italic;">🌙 Nighttime - no sun exposure</p>'}
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
    
    const currentZoom = map.getZoom();
    const baseRadius = 5000;
    const zoomFactor = Math.pow(2, (11 - currentZoom));
    const horizonRadius = Math.max(200, baseRadius * zoomFactor);
    
    const elevationFactor = Math.max(0, elevation) / 90;
    const dramaticFactor = Math.pow(elevationFactor, 1.8);
    const sunDistance = horizonRadius * (1 - dramaticFactor);
    const sunDistanceInDegrees = sunDistance / 111000;
    
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

function calculateSunPosition(latitude, longitude, date) {
    const sunPosition = SunCalc.getPosition(date, latitude, longitude);
    return {
        elevation: sunPosition.altitude * 180 / Math.PI,
        azimuth: (sunPosition.azimuth * 180 / Math.PI + 180) % 360
    };
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


function showCarSunExposure() {
    const startDateTime = validateRouteInputs();
    if (!startDateTime) return;
    
    showStatus('Calculating car sun exposure summary...', 'info');
    
    setTimeout(() => {
        const carExposureData = calculateAnalysisPoints(routeData.path, startDateTime);
        updateSummaryVisualization(carExposureData);
        showStatus(`Car sun exposure summary updated.`, 'success');
    }, 500);
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
    
    const yellowIntensity = Math.round(exposureLevel * 255);
    const bgColor = `rgb(255, 255, ${255 - yellowIntensity})`;
    const textColor = yellowIntensity > 127 ? '#000000' : '#666666';
    
    labelContainer.style.backgroundColor = bgColor;
    labelContainer.style.color = textColor;
    labelContainer.style.borderColor = yellowIntensity > 50 ? '#d4a574' : 'hsl(214.3 31.8% 91.4%)';
}



function updateSummaryVisualization(carExposureData) {
    // Calculate average exposures for each side
    const daylightData = carExposureData.filter(data => data.isDaylight);
    
    if (daylightData.length === 0) {
        ['front', 'back', 'left', 'right'].forEach(side => {
            updateCarSideColor(`summary-${side}`, 0);
            document.getElementById(`${side}-percentage`).textContent = '0%';
        });
    } else {
        // Calculate averages
        const avgExposures = {
            front: daylightData.reduce((sum, data) => sum + data.exposures.front, 0) / daylightData.length,
            back: daylightData.reduce((sum, data) => sum + data.exposures.back, 0) / daylightData.length,
            left: daylightData.reduce((sum, data) => sum + data.exposures.left, 0) / daylightData.length,
            right: daylightData.reduce((sum, data) => sum + data.exposures.right, 0) / daylightData.length
        };
        
        Object.entries(avgExposures).forEach(([side, exposure]) => {
            updateCarSideColor(`summary-${side}`, exposure);
            document.getElementById(`${side}-percentage`).textContent = `${(exposure * 100).toFixed(0)}%`;
        });
        
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
}

window.onload = initMap;
