let map;
let directionsService;
let directionsRenderer1;
let directionsRenderer2;
let route1Data = null;
let route2Data = null;
let sunMarkers = [];

function initMap() {
    map = new google.maps.Map(document.getElementById('map'), {
        zoom: CONFIG.DEFAULT_ZOOM,
        center: CONFIG.DEFAULT_CENTER
    });
    
    directionsService = new google.maps.DirectionsService();
    
    directionsRenderer1 = new google.maps.DirectionsRenderer({
        polylineOptions: {
            strokeColor: CONFIG.ROUTE_COLORS.ROUTE1,
            strokeWeight: 6,
            strokeOpacity: 0.8
        },
        suppressMarkers: false
    });
    
    directionsRenderer2 = new google.maps.DirectionsRenderer({
        polylineOptions: {
            strokeColor: CONFIG.ROUTE_COLORS.ROUTE2,
            strokeWeight: 6,
            strokeOpacity: 0.8
        },
        suppressMarkers: false
    });
    
    directionsRenderer1.setMap(map);
    directionsRenderer2.setMap(map);
    
    document.getElementById('visualize-btn').addEventListener('click', visualizeRoutes);
    document.getElementById('track-sun-btn').addEventListener('click', trackSunPosition);
    
    const today = new Date();
    document.getElementById('trip-date').value = today.toISOString().split('T')[0];
    
    showStatus('Map initialized. Enter your routes and click "Visualize Routes".', 'info');
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

function calculateRoute(origin, destination, renderer, routeNumber) {
    return new Promise((resolve, reject) => {
        const request = {
            origin: origin,
            destination: destination,
            travelMode: google.maps.TravelMode.DRIVING,
            optimizeWaypoints: true
        };
        
        directionsService.route(request, (result, status) => {
            if (status === 'OK') {
                renderer.setDirections(result);
                resolve({
                    routeNumber: routeNumber,
                    result: result,
                    path: result.routes[0].overview_path
                });
            } else {
                reject(`Route ${routeNumber} calculation failed: ${status}`);
            }
        });
    });
}

async function visualizeRoutes() {
    const inputs = validateInputs();
    if (!inputs) return;
    
    const button = document.getElementById('visualize-btn');
    button.disabled = true;
    showStatus('Calculating routes...', 'info');
    
    try {
        const [route1, route2] = await Promise.all([
            calculateRoute(inputs.route1From, inputs.route1To, directionsRenderer1, 1),
            calculateRoute(inputs.route2From, inputs.route2To, directionsRenderer2, 2)
        ]);
        
        route1Data = route1;
        route2Data = route2;
        
        showStatus('Routes calculated successfully. Analyzing overlaps...', 'info');
        
        setTimeout(() => {
            detectAndHighlightOverlaps();
        }, 1000);
        
    } catch (error) {
        showStatus(error, 'error');
    } finally {
        button.disabled = false;
    }
}

function detectAndHighlightOverlaps() {
    if (!route1Data || !route2Data) return;
    
    const overlaps = findRouteOverlaps(route1Data.path, route2Data.path);
    
    if (overlaps.length > 0) {
        highlightOverlaps(overlaps);
        showStatus(`Found ${overlaps.length} overlapping segments. Highlighted in green.`, 'success');
    } else {
        showStatus('Routes calculated successfully. No significant overlaps found.', 'success');
    }
}

function findRouteOverlaps(path1, path2, toleranceMeters = CONFIG.OVERLAP_TOLERANCE_METERS) {
    const overlaps = [];
    
    for (let i = 0; i < path1.length - 1; i++) {
        const segment1Start = path1[i];
        const segment1End = path1[i + 1];
        
        for (let j = 0; j < path2.length - 1; j++) {
            const segment2Start = path2[j];
            const segment2End = path2[j + 1];
            
            if (segmentsOverlap(segment1Start, segment1End, segment2Start, segment2End, toleranceMeters)) {
                overlaps.push({
                    route1Segment: [segment1Start, segment1End],
                    route2Segment: [segment2Start, segment2End],
                    midpoint: getSegmentMidpoint(segment1Start, segment1End)
                });
            }
        }
    }
    
    return overlaps;
}

function segmentsOverlap(seg1Start, seg1End, seg2Start, seg2End, toleranceMeters) {
    const distance1 = google.maps.geometry.spherical.computeDistanceBetween(seg1Start, seg2Start);
    const distance2 = google.maps.geometry.spherical.computeDistanceBetween(seg1Start, seg2End);
    const distance3 = google.maps.geometry.spherical.computeDistanceBetween(seg1End, seg2Start);
    const distance4 = google.maps.geometry.spherical.computeDistanceBetween(seg1End, seg2End);
    
    return Math.min(distance1, distance2, distance3, distance4) <= toleranceMeters;
}

function getSegmentMidpoint(start, end) {
    return google.maps.geometry.spherical.interpolate(start, end, 0.5);
}

function highlightOverlaps(overlaps) {
    overlaps.forEach((overlap, index) => {
        const overlapPolyline = new google.maps.Polyline({
            path: overlap.route1Segment,
            geodesic: true,
            strokeColor: CONFIG.ROUTE_COLORS.OVERLAP,
            strokeOpacity: 1.0,
            strokeWeight: 8,
            zIndex: 1000
        });
        
        overlapPolyline.setMap(map);
        
        const marker = new google.maps.Marker({
            position: overlap.midpoint,
            map: map,
            title: `Overlap ${index + 1}`,
            icon: {
                path: google.maps.SymbolPath.CIRCLE,
                fillColor: CONFIG.ROUTE_COLORS.OVERLAP,
                fillOpacity: 1,
                strokeColor: '#FFFFFF',
                strokeWeight: 2,
                scale: 8
            }
        });
    });
}

function trackSunPosition() {
    const selectedRoute = document.getElementById('selected-route').value;
    const tripDate = document.getElementById('trip-date').value;
    
    if (!tripDate) {
        showStatus('Please select a trip date.', 'error');
        return;
    }
    
    const routeData = selectedRoute === 'route1' ? route1Data : route2Data;
    
    if (!routeData) {
        showStatus('Please calculate routes first by clicking "Visualize Routes".', 'error');
        return;
    }
    
    clearSunMarkers();
    
    const date = new Date(tripDate + 'T08:00:00');
    showStatus('Calculating sun positions...', 'info');
    
    setTimeout(() => {
        const sunPositions = calculateSunPositionsAlongRoute(routeData.path, date);
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
        const segmentDistance = google.maps.geometry.spherical.computeDistanceBetween(
            routePath[i], 
            routePath[i + 1]
        ) / 1000;
        
        currentSegmentDistance += segmentDistance;
        
        if (currentSegmentDistance >= 50 || i === routePath.length - 2) {
            totalDistance += currentSegmentDistance;
            
            const position = routePath[i];
            const timeAtPosition = new Date(startDate.getTime() + (timeOffset * 60 * 60 * 1000));
            const sunPosition = calculateSunPosition(position.lat(), position.lng(), timeAtPosition);
            
            sunPositions.push({
                location: position,
                time: timeAtPosition,
                distance: totalDistance,
                sunAzimuth: sunPosition.azimuth,
                sunElevation: sunPosition.elevation,
                isDaylight: sunPosition.elevation > 0
            });
            
            timeOffset += currentSegmentDistance / averageSpeedKmh;
            currentSegmentDistance = 0;
        }
    }
    
    return sunPositions;
}

function calculateSunPosition(latitude, longitude, date) {
    const lat = latitude * Math.PI / 180;
    const lon = longitude * Math.PI / 180;
    
    const dayOfYear = Math.floor((date - new Date(date.getFullYear(), 0, 0)) / 86400000);
    const P = Math.asin(0.39795 * Math.cos(0.9856 * (dayOfYear - 81) * Math.PI / 180));
    
    const argument = (Math.sin(P) * Math.sin(lat) + Math.cos(P) * Math.cos(lat) * Math.cos(15 * (12 - (date.getHours() + date.getMinutes() / 60)) * Math.PI / 180));
    const elevation = Math.asin(argument);
    
    const azimuthArgument = (Math.sin(P) * Math.cos(lat) - Math.cos(P) * Math.sin(lat) * Math.cos(15 * (12 - (date.getHours() + date.getMinutes() / 60)) * Math.PI / 180)) / Math.cos(elevation);
    let azimuth = Math.atan2(-Math.cos(P) * Math.sin(15 * (12 - (date.getHours() + date.getMinutes() / 60)) * Math.PI / 180), azimuthArgument);
    
    if (azimuth < 0) azimuth += 2 * Math.PI;
    
    return {
        elevation: elevation * 180 / Math.PI,
        azimuth: azimuth * 180 / Math.PI
    };
}

function visualizeSunPositions(sunPositions) {
    sunPositions.forEach((sunPos, index) => {
        const timeString = sunPos.time.toLocaleTimeString('en-US', { 
            hour: '2-digit', 
            minute: '2-digit' 
        });
        
        const sunIcon = {
            path: 'M12,7c-2.76,0-5,2.24-5,5s2.24,5,5,5s5-2.24,5-5S14.76,7,12,7L12,7z M2,13l2,0c0.55,0,1-0.45,1-1s-0.45-1-1-1l-2,0 c-0.55,0-1,0.45-1,1S1.45,13,2,13z M20,13l2,0c0.55,0,1-0.45,1-1s-0.45-1-1-1l-2,0c-0.55,0-1,0.45-1,1S19.45,13,20,13z M11,2v2 c0,0.55,0.45,1,1,1s1-0.45,1-1V2c0-0.55-0.45-1-1-1S11,1.45,11,2z M11,20v2c0,0.55,0.45,1,1,1s1-0.45,1-1v-2 c0-0.55-0.45-1-1-1C11.45,19,11,19.45,11,20z M5.99,4.58c-0.39-0.39-1.03-0.39-1.41,0c-0.39,0.39-0.39,1.03,0,1.41l1.06,1.06 c0.39,0.39,1.03,0.39,1.41,0s0.39-1.03,0-1.41L5.99,4.58z M18.36,16.95c-0.39-0.39-1.03-0.39-1.41,0c-0.39,0.39-0.39,1.03,0,1.41 l1.06,1.06c0.39,0.39,1.03,0.39,1.41,0c0.39-0.39,0.39-1.03,0-1.41L18.36,16.95z M19.42,5.99c0.39-0.39,0.39-1.03,0-1.41 c-0.39-0.39-1.03-0.39-1.41,0l-1.06,1.06c-0.39,0.39-0.39,1.03,0,1.41s1.03,0.39,1.41,0L19.42,5.99z M7.05,18.36 c0.39-0.39,0.39-1.03,0-1.41c-0.39-0.39-1.03-0.39-1.41,0l-1.06,1.06c-0.39,0.39-0.39,1.03,0,1.41s1.03,0.39,1.41,0L7.05,18.36z',
            fillColor: sunPos.isDaylight ? '#FFD700' : '#4169E1',
            fillOpacity: 1,
            strokeColor: '#FFA500',
            strokeWeight: 2,
            scale: 1.5,
            anchor: new google.maps.Point(12, 12)
        };
        
        const marker = new google.maps.Marker({
            position: sunPos.location,
            map: map,
            icon: sunIcon,
            title: `Time: ${timeString}\nDistance: ${sunPos.distance.toFixed(1)}km\nSun Elevation: ${sunPos.sunElevation.toFixed(1)}°\nSun Azimuth: ${sunPos.sunAzimuth.toFixed(1)}°`
        });
        
        const infoContent = `
            <div style="font-family: Arial, sans-serif; max-width: 250px;">
                <h4 style="margin: 0 0 10px 0; color: #333;">Sun Position #${index + 1}</h4>
                <p style="margin: 3px 0;"><strong>Time:</strong> ${timeString}</p>
                <p style="margin: 3px 0;"><strong>Distance:</strong> ${sunPos.distance.toFixed(1)} km</p>
                <p style="margin: 3px 0;"><strong>Sun Elevation:</strong> ${sunPos.sunElevation.toFixed(1)}°</p>
                <p style="margin: 3px 0;"><strong>Sun Azimuth:</strong> ${sunPos.sunAzimuth.toFixed(1)}°</p>
                <p style="margin: 3px 0;"><strong>Status:</strong> ${sunPos.isDaylight ? '☀️ Daylight' : '🌙 Night'}</p>
            </div>
        `;
        
        const infoWindow = new google.maps.InfoWindow({
            content: infoContent
        });
        
        marker.addListener('click', () => {
            infoWindow.open(map, marker);
        });
        
        sunMarkers.push(marker);
    });
}

function clearSunMarkers() {
    sunMarkers.forEach(marker => {
        marker.setMap(null);
    });
    sunMarkers = [];
}