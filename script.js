let map;
let directionsService;
let directionsRenderer1;
let directionsRenderer2;
let route1Data = null;
let route2Data = null;

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