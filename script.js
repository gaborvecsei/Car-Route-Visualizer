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
    
    const startDateTime = new Date(tripDate + 'T' + tripTime + ':00');
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
    let totalDistance = 0;
    let currentSegmentDistance = 0;
    let timeOffset = 0;
    const averageSpeedKmh = 80;
    
    for (let i = 0; i < routePath.length - 1; i++) {
        const segmentDistance = getDistance(routePath[i], routePath[i + 1]) / 1000;
        
        currentSegmentDistance += segmentDistance;
        
        if (currentSegmentDistance >= 50 || i === routePath.length - 2) {
            totalDistance += currentSegmentDistance;
            
            const position = routePath[i];
            const timeAtPosition = new Date(startDate.getTime() + (timeOffset * 60 * 60 * 1000));
            const sunPosition = calculateSunPosition(position[0], position[1], timeAtPosition);
            
            const isDaylight = sunPosition.elevation > 0;
            
            console.log(`Stop ${sunPositions.length + 1} at ${timeAtPosition.toLocaleString()}:`);
            console.log(`  Location: ${position[0].toFixed(3)}, ${position[1].toFixed(3)}`);
            console.log(`  Sun elevation: ${sunPosition.elevation.toFixed(1)}°, Azimuth: ${sunPosition.azimuth.toFixed(1)}° (${isDaylight ? 'DAY' : 'NIGHT'})`);
            
            sunPositions.push({
                location: position,
                time: timeAtPosition,
                distance: totalDistance,
                sunAzimuth: sunPosition.azimuth,
                sunElevation: sunPosition.elevation,
                isDaylight: isDaylight
            });
            
            timeOffset += currentSegmentDistance / averageSpeedKmh;
            currentSegmentDistance = 0;
        }
    }
    
    return sunPositions;
}

function calculateSunPosition(latitude, longitude, date) {
    // Simple but reliable sun position calculation
    const lat = latitude * Math.PI / 180;
    const lon = longitude * Math.PI / 180;
    
    // Get day of year
    const start = new Date(date.getFullYear(), 0, 0);
    const diff = date - start;
    const dayOfYear = Math.floor(diff / (1000 * 60 * 60 * 24));
    
    // Solar declination (simplified)
    const declination = 23.45 * Math.sin((360 * (284 + dayOfYear) / 365) * Math.PI / 180) * Math.PI / 180;
    
    // Hour angle - this is the key calculation
    const localTime = date.getHours() + date.getMinutes() / 60;
    
    // Approximate longitude correction (4 minutes per degree of longitude)
    const timeZoneCorrection = longitude / 15; // Convert longitude to hours
    const solarTime = localTime - timeZoneCorrection;
    
    // Hour angle from solar noon (positive in afternoon)
    const hourAngle = (solarTime - 12) * 15 * Math.PI / 180;
    
    // Calculate sun elevation
    const elevation = Math.asin(
        Math.sin(declination) * Math.sin(lat) + 
        Math.cos(declination) * Math.cos(lat) * Math.cos(hourAngle)
    );
    
    // Calculate azimuth (0° = North, 90° = East)
    let azimuth = Math.atan2(
        Math.sin(hourAngle),
        Math.cos(hourAngle) * Math.sin(lat) - Math.tan(declination) * Math.cos(lat)
    );
    
    // Convert to 0-360° range
    azimuth = (azimuth * 180 / Math.PI + 180) % 360;
    
    const result = {
        elevation: elevation * 180 / Math.PI,
        azimuth: azimuth
    };
    
    // Debug logging
    console.log(`Sun position at ${date.toLocaleString()}:`);
    console.log(`  Lat: ${latitude.toFixed(3)}°, Lon: ${longitude.toFixed(3)}°`);
    console.log(`  Local time: ${localTime.toFixed(2)}h, Solar time: ${solarTime.toFixed(2)}h`);
    console.log(`  Day of year: ${dayOfYear}, Declination: ${(declination * 180 / Math.PI).toFixed(1)}°`);
    console.log(`  Hour angle: ${(hourAngle * 180 / Math.PI).toFixed(1)}°`);
    console.log(`  → Elevation: ${result.elevation.toFixed(1)}°, Azimuth: ${result.azimuth.toFixed(1)}°`);
    console.log(`  → ${result.elevation > 0 ? 'DAYLIGHT' : 'NIGHTTIME'}`);
    
    return result;
}

function visualizeSunPositions(sunPositions) {
    sunPositions.forEach((sunPos, index) => {
        const timeString = sunPos.time.toLocaleTimeString('en-US', { 
            hour: '2-digit', 
            minute: '2-digit' 
        });
        
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
                <p style="margin: 3px 0;"><strong>Distance:</strong> ${sunPos.distance.toFixed(1)} km from start</p>
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
    const baseRadius = 3000; // Moderate increase from original 2000m for better visibility
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
    const checkFrequency = parseInt(document.getElementById('check-frequency').value) || 5;
    
    if (!tripDate || !tripTime) {
        showStatus('Please select both date and time for the trip start.', 'error');
        return;
    }
    
    if (!routeData) {
        showStatus('Please calculate route first by clicking "Visualize Route".', 'error');
        return;
    }
    
    clearCarVisualization();
    
    const startDateTime = new Date(tripDate + 'T' + tripTime + ':00');
    showStatus('Calculating car sun exposure...', 'info');
    
    setTimeout(() => {
        const carExposureData = calculateCarSunExposure(routeData.path, startDateTime, checkFrequency);
        visualizeCarSunExposure(carExposureData);
        showStatus(`Car sun exposure calculated for ${carExposureData.length} points along the route.`, 'success');
    }, 500);
}

function calculateCarSunExposure(routePath, startDate, intervalKm) {
    const carExposureData = [];
    let totalDistance = 0;
    let currentSegmentDistance = 0;
    let timeOffset = 0;
    const averageSpeedKmh = 80;
    
    for (let i = 0; i < routePath.length - 1; i++) {
        const segmentDistance = getDistance(routePath[i], routePath[i + 1]) / 1000;
        currentSegmentDistance += segmentDistance;
        
        if (currentSegmentDistance >= intervalKm || i === routePath.length - 2) {
            totalDistance += currentSegmentDistance;
            
            const position = routePath[i];
            const timeAtPosition = new Date(startDate.getTime() + (timeOffset * 60 * 60 * 1000));
            const sunPosition = calculateSunPosition(position[0], position[1], timeAtPosition);
            
            // Calculate car orientation (bearing to next point)
            let carBearing = 0;
            if (i < routePath.length - 1) {
                carBearing = calculateBearing(routePath[i], routePath[i + 1]);
            } else if (i > 0) {
                carBearing = calculateBearing(routePath[i - 1], routePath[i]);
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
                time: timeAtPosition,
                distance: totalDistance,
                sunAzimuth: sunPosition.azimuth,
                sunElevation: sunPosition.elevation,
                carBearing: carBearing,
                isDaylight: isDaylight,
                exposures: carSideExposures
            });
            
            timeOffset += currentSegmentDistance / averageSpeedKmh;
            currentSegmentDistance = 0;
        }
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
    const element = document.getElementById(elementId);
    const percentage = exposureLevel * 100;
    
    // Remove existing exposure classes
    element.classList.remove('exposure-low', 'exposure-medium', 'exposure-high');
    
    // Add appropriate class based on exposure percentage
    if (percentage >= 40) {
        element.classList.add('exposure-high');
    } else if (percentage >= 20) {
        element.classList.add('exposure-medium');
    } else if (percentage > 0) {
        element.classList.add('exposure-low');
    }
    // If percentage is 0, no class is added (uses default styling)
}

function visualizeCarSunExposure(carExposureData) {
    // Console logging for debugging
    console.log('=== CAR SUN EXPOSURE ANALYSIS ===');
    console.log(`Analyzed ${carExposureData.length} points along the route:`);
    
    carExposureData.forEach((carData, index) => {
        const timeString = carData.time.toLocaleTimeString('en-US', { 
            hour: '2-digit', 
            minute: '2-digit' 
        });
        
        console.log(`\n--- Point ${index + 1} at ${timeString} ---`);
        console.log(`Location: [${carData.location[0].toFixed(4)}, ${carData.location[1].toFixed(4)}]`);
        console.log(`Distance: ${carData.distance.toFixed(1)} km from start`);
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
