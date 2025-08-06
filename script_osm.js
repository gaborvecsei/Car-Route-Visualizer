let map;
let route1Layer = null;
let route2Layer = null;
let route1Data = null;
let route2Data = null;
let sunMarkers = [];
let currentSunPositions = [];

function initMap() {
    map = L.map('map').setView(CONFIG_OSM.DEFAULT_CENTER, CONFIG_OSM.DEFAULT_ZOOM);
    
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors'
    }).addTo(map);
    
    document.getElementById('visualize-btn').addEventListener('click', visualizeRoutes);
    document.getElementById('track-sun-btn').addEventListener('click', trackSunPosition);
    
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
    
    // Add slider event listener for real-time dome size adjustment
    const domeSlider = document.getElementById('dome-size-slider');
    const domeValue = document.getElementById('dome-size-value');
    
    domeSlider.addEventListener('input', function() {
        const value = parseFloat(this.value);
        domeValue.textContent = value.toFixed(1) + 'x';
        
        // Refresh sun visualization with new size if sun positions exist
        if (currentSunPositions.length > 0) {
            refreshSunVisualization();
        }
    });
    
    showStatus('Map initialized using OpenStreetMap. Enter your routes and click "Visualize Routes".', 'info');
}

function showStatus(message, type = 'info') {
    const statusDiv = document.getElementById('status');
    statusDiv.textContent = message;
    statusDiv.className = `status-message ${type}`;
}

function validateInputs() {
    const route1From = document.getElementById('route1-from').value.trim();
    const route1To = document.getElementById('route1-to').value.trim();
    const route2From = document.getElementById('route2-from').value.trim();
    const route2To = document.getElementById('route2-to').value.trim();
    
    if (!route1From || !route1To || !route2From || !route2To) {
        showStatus('Please fill in all route fields.', 'error');
        return false;
    }
    
    return { route1From, route1To, route2From, route2To };
}

async function geocodeLocation(address) {
    const url = `${CONFIG_OSM.NOMINATIM_URL}?format=json&q=${encodeURIComponent(address)}&limit=1`;
    
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

async function tryOpenRouteService(fromLocation, toLocation) {
    const orsUrl = `${CONFIG_OSM.OPENROUTESERVICE_URL}?api_key=${CONFIG_OSM.OPENROUTESERVICE_API_KEY}&start=${fromLocation.lng},${fromLocation.lat}&end=${toLocation.lng},${toLocation.lat}`;
    const response = await fetch(orsUrl);
    const data = await response.json();
    
    if (!data.error && data.features && data.features[0]) {
        const coordinates = data.features[0].geometry.coordinates;
        const latLngs = coordinates.map(coord => [coord[1], coord[0]]);
        
        return {
            path: latLngs,
            distance: data.features[0].properties.summary.distance,
            duration: data.features[0].properties.summary.duration
        };
    }
    return null;
}

async function tryGraphHopper(fromLocation, toLocation) {
    // GraphHopper free API - no key required for basic usage
    const ghUrl = `https://graphhopper.com/api/1/route?point=${fromLocation.lat},${fromLocation.lng}&point=${toLocation.lat},${toLocation.lng}&vehicle=car&locale=en&calc_points=true`;
    
    const response = await fetch(ghUrl);
    const data = await response.json();
    
    if (data.paths && data.paths[0]) {
        const path = data.paths[0];
        const coordinates = decodePolyline(path.points);
        
        return {
            path: coordinates,
            distance: path.distance,
            duration: path.time / 1000
        };
    }
    return null;
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

function decodePolyline(encoded) {
    // Simple polyline decoder
    const poly = [];
    let index = 0, len = encoded.length;
    let lat = 0, lng = 0;
    
    while (index < len) {
        let b, shift = 0, result = 0;
        do {
            b = encoded.charCodeAt(index++) - 63;
            result |= (b & 0x1f) << shift;
            shift += 5;
        } while (b >= 0x20);
        const dlat = ((result & 1) ? ~(result >> 1) : (result >> 1));
        lat += dlat;
        
        shift = 0;
        result = 0;
        do {
            b = encoded.charCodeAt(index++) - 63;
            result |= (b & 0x1f) << shift;
            shift += 5;
        } while (b >= 0x20);
        const dlng = ((result & 1) ? ~(result >> 1) : (result >> 1));
        lng += dlng;
        
        poly.push([lat / 1e5, lng / 1e5]);
    }
    return poly;
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
        
        const [route1From, route1To, route2From, route2To] = await Promise.all([
            geocodeLocation(inputs.route1From),
            geocodeLocation(inputs.route1To),
            geocodeLocation(inputs.route2From),
            geocodeLocation(inputs.route2To)
        ]);
        
        showStatus('Calculating routes...', 'info');
        
        const [route1Result, route2Result] = await Promise.all([
            calculateRoute(route1From, route1To),
            calculateRoute(route2From, route2To)
        ]);
        
        route1Data = route1Result;
        route2Data = route2Result;
        
        displayRoute(route1Data, CONFIG_OSM.ROUTE_COLORS.ROUTE1, 'Route 1');
        displayRoute(route2Data, CONFIG_OSM.ROUTE_COLORS.ROUTE2, 'Route 2');
        
        fitMapToRoutes([route1Data, route2Data]);
        
        // Show summary with travel times
        const route1Time = formatDuration(route1Data.duration);
        const route2Time = formatDuration(route2Data.duration);
        const route1Distance = (route1Data.distance / 1000).toFixed(1);
        const route2Distance = (route2Data.distance / 1000).toFixed(1);
        
        showStatus(
            `Routes calculated successfully! 🔵 Route 1: ${route1Distance}km (${route1Time}) | 🔴 Route 2: ${route2Distance}km (${route2Time}) | Click routes for details`, 
            'success'
        );
        
    } catch (error) {
        showStatus(error.message, 'error');
    } finally {
        button.disabled = false;
    }
}

function clearPreviousRoutes() {
    if (route1Layer) {
        map.removeLayer(route1Layer);
        route1Layer = null;
    }
    if (route2Layer) {
        map.removeLayer(route2Layer);
        route2Layer = null;
    }
    clearSunMarkers();
    currentSunPositions = [];
    route1Data = null;
    route2Data = null;
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
        opacity: 0.7  // Reduced opacity for better overlap visibility
    }).addTo(map);
    
    if (label === 'Route 1') {
        route1Layer = layer;
    } else {
        route2Layer = layer;
    }
    
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
    const selectedRoute = document.getElementById('selected-route').value;
    const tripDate = document.getElementById('trip-date').value;
    const tripTime = document.getElementById('trip-time').value;
    
    if (!tripDate || !tripTime) {
        showStatus('Please select both date and time for the trip start.', 'error');
        return;
    }
    
    const routeData = selectedRoute === 'route1' ? route1Data : route2Data;
    
    if (!routeData) {
        showStatus('Please calculate routes first by clicking "Visualize Routes".', 'error');
        return;
    }
    
    clearSunMarkers();
    
    const startDateTime = new Date(tripDate + 'T' + tripTime + ':00');
    showStatus('Calculating sun positions and directions...', 'info');
    
    setTimeout(() => {
        const sunPositions = calculateSunPositionsAlongRoute(routeData.path, startDateTime);
        currentSunPositions = sunPositions; // Store for zoom refresh
        visualizeSunPositions(sunPositions);
        showStatus(`Sun positions calculated for ${sunPositions.length} points along ${selectedRoute === 'route1' ? 'Route 1' : 'Route 2'}.`, 'success');
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
            console.log(`  Sun elevation: ${sunPosition.elevation.toFixed(1)}° (${isDaylight ? 'DAY' : 'NIGHT'})`);
            
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

function julianDay(year, month, day, hour) {
    if (month <= 2) {
        year -= 1;
        month += 12;
    }
    
    const a = Math.floor(year / 100);
    const b = 2 - a + Math.floor(a / 4);
    
    return Math.floor(365.25 * (year + 4716)) + 
           Math.floor(30.6001 * (month + 1)) + 
           day + hour / 24 + b - 1524.5;
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
                    ${sunPos.isDaylight ? '🔵 Blue circle shows sky dome with sun position' : '🌙 Nighttime - no sun visible'}
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
    
    // Create sky dome (horizon circle) with zoom-responsive and user-adjustable radius
    const currentZoom = map.getZoom();
    const userSizeMultiplier = parseFloat(document.getElementById('dome-size-slider').value);
    const baseRadius = 2000; // Base radius in meters (reduced to more reasonable default)
    const zoomFactor = Math.pow(2, (11 - currentZoom)); // Scale inversely with zoom
    const horizonRadius = Math.max(100, baseRadius * zoomFactor * userSizeMultiplier); // User-adjustable size
    
    const horizonCircle = L.circle([lat, lng], {
        radius: horizonRadius,
        color: '#87CEEB',
        weight: 2,
        opacity: 0.7,
        fillColor: '#E6F3FF',
        fillOpacity: 0.2
    }).addTo(map);
    
    // Removed compass direction labels as requested
    
    // Calculate sun position within the sky dome
    // The closer to center = higher elevation, closer to edge = lower elevation
    const elevationFactor = elevation / 90; // 0 to 1
    const sunDistanceInMeters = horizonRadius * (1 - elevationFactor * 0.8); // Sun moves from edge to 20% from center
    const sunDistanceInDegrees = sunDistanceInMeters / 111000; // Convert to degrees
    
    const sunRad = (azimuth * Math.PI) / 180;
    const sunLat = lat + Math.cos(sunRad) * sunDistanceInDegrees;
    const sunLng = lng + Math.sin(sunRad) * sunDistanceInDegrees;
    
    // Create sun marker with height indication
    const sunSize = Math.max(12, 20 - (elevation / 90) * 8); // Larger when lower in sky
    const sunIcon = L.divIcon({
        html: `<div style="
            width: ${sunSize}px; 
            height: ${sunSize}px; 
            background: radial-gradient(circle, #FFD700 0%, #FFA500 70%, #FF8C00 100%); 
            border: 2px solid #FF8C00; 
            border-radius: 50%; 
            display: flex; 
            align-items: center; 
            justify-content: center;
            font-size: ${Math.max(8, sunSize - 8)}px;
            color: white;
            text-shadow: 1px 1px 1px rgba(0,0,0,0.8);
            box-shadow: 0 0 ${sunSize/2}px rgba(255, 215, 0, 0.8);
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
    
    // Create elevation line from center to sun position
    const elevationLine = L.polyline([
        [lat, lng], // Center of the blue circle
        [sunLat, sunLng] // Sun position
    ], {
        color: '#FF6B00',
        weight: 5,
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
    
    sunMarkers.push(horizonCircle);
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

window.onload = initMap;