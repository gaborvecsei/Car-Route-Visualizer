// Constants from config.js
const CONFIG = {
    DEFAULT_CENTER: [40.7128, -74.0060],
    DEFAULT_ZOOM: 7,
    ROUTE_COLORS: { ROUTE1: '#0000FF' },
    NOMINATIM_URL: 'https://nominatim.openstreetmap.org/search'
};

// Single State Object Pattern - unified state management
const AppState = {
    route: { data: null, layer: null },
    sun: { positions: [], markers: [] },
    car: { markers: [] },
    ui: { loading: false, status: '', timeout: null },
    get isReady() { return this.route.data !== null; }
};

// DOM element cache - populated once on initialization  
const DOM = {};

let map;

// Utility functions
const logError = (error, context = '') => {
    console.error(`Error in ${context}:`, error);
    if (typeof gtag !== 'undefined') {
        gtag('event', 'exception', { description: `${context}: ${error.message}`, fatal: false });
    }
};

const setLoadingState = (isLoading, message = '') => {
    const button = DOM.visualizeBtn;
    
    if (isLoading) {
        button.disabled = true;
        button.classList.add('loading');
        button.innerHTML = `<span class="button-icon">⏳</span> ${message || 'Analyzing...'}`;
        AppState.ui.loading = true;
        
        if (AppState.ui.timeout) clearTimeout(AppState.ui.timeout);
        AppState.ui.timeout = setTimeout(() => {
            if (AppState.ui.loading) showStatus('Analysis is taking longer than expected. Please wait...', 'info');
        }, 15000);
    } else {
        button.disabled = false;
        button.classList.remove('loading');
        button.innerHTML = `<span class="button-icon">☀️</span> Analyze Sun Exposure`;
        AppState.ui.loading = false;
        
        if (AppState.ui.timeout) {
            clearTimeout(AppState.ui.timeout);
            AppState.ui.timeout = null;
        }
    }
};

// URL parameter handling
const handleUrlParameters = () => {
    const urlParams = new URLSearchParams(window.location.search);
    const params = {
        from: urlParams.get('from'),
        to: urlParams.get('to'),
        date: urlParams.get('date'),
        utctime: urlParams.get('utctime'),
        points: urlParams.get('points')
    };
    
    const elements = {
        from: DOM.routeFrom,
        to: DOM.routeTo,
        date: DOM.tripDate,
        utctime: DOM.tripTime,
        points: DOM.analysisPoints
    };
    
    // Set values for existing parameters
    Object.keys(params).forEach(key => {
        if (params[key] && elements[key]) {
            elements[key].value = key === 'from' || key === 'to' ? 
                decodeURIComponent(params[key]) : params[key];
        }
    });
    
    // Validate points range
    if (params.points) {
        const points = parseInt(params.points);
        if (points >= 6 && points <= 20) {
            elements.points.value = points;
        }
    }
    
    // Auto-trigger if both locations present
    if (params.from && params.to) {
        setTimeout(visualizeRoutes, 1000);
    }
};

const updateUrlWithParameters = (routeFrom, routeTo) => {
    const params = new URLSearchParams();
    const paramData = [
        ['from', routeFrom], 
        ['to', routeTo],
        ['date', DOM.tripDate.value],
        ['utctime', DOM.tripTime.value],
        ['points', DOM.analysisPoints.value]
    ];
    
    paramData.forEach(([key, value]) => {
        if (value) params.set(key, key.includes('from') || key.includes('to') ? encodeURIComponent(value) : value);
    });
    
    window.history.pushState({ path: window.location.pathname + '?' + params }, '', window.location.pathname + '?' + params);
};

const initMap = () => {
    // Populate DOM cache once
    DOM.visualizeBtn = document.getElementById('visualize-btn');
    DOM.routeFrom = document.getElementById('route-from');
    DOM.routeTo = document.getElementById('route-to');
    DOM.tripDate = document.getElementById('trip-date');
    DOM.tripTime = document.getElementById('trip-time');
    DOM.analysisPoints = document.getElementById('analysis-points');
    DOM.status = document.getElementById('status');
    DOM.routeDataContent = document.getElementById('route-data-content');
    DOM.resultsPlaceholder = document.getElementById('results-placeholder');
    DOM.carSummary = document.getElementById('car-summary');
    
    map = L.map('map').setView(CONFIG.DEFAULT_CENTER, CONFIG.DEFAULT_ZOOM);
    
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors'
    }).addTo(map);
    
    // Event delegation pattern - single handler for multiple events
    document.addEventListener('click', e => {
        const handlers = {
            'visualize-btn': visualizeRoutes,
            'analysis-points-toggle': toggleAnalysisPoints
        };
        handlers[e.target.id]?.();
    });
    
    // Keypress events for inputs
    [DOM.routeFrom, DOM.routeTo].forEach(input => 
        input.addEventListener('keypress', e => e.key === 'Enter' && visualizeRoutes())
    );
    
    // Set defaults
    const today = new Date();
    DOM.tripDate.value = today.toISOString().split('T')[0];
    DOM.tripTime.value = '08:00';
    
    handleUrlParameters();
    showStatus('Map initialized. Enter your route and click "Analyze Sun Exposure".', 'info');
};

const showStatus = (message, type = 'info') => {
    DOM.status.textContent = message;
    DOM.status.className = `status-message ${type}`;
};

const validateInputs = () => {
    const routeFrom = DOM.routeFrom.value.trim();
    const routeTo = DOM.routeTo.value.trim();
    const tripDate = DOM.tripDate.value;
    const tripTime = DOM.tripTime.value;
    
    if (!routeFrom || !routeTo) {
        showStatus('Please fill in both route fields.', 'error');
        return null;
    }
    
    if (!tripDate || !tripTime) {
        showStatus('Please select both date and time for the trip start.', 'error');
        return null;
    }
    
    if (!AppState.route.data) {
        showStatus('Please calculate route first by clicking "Visualize Route".', 'error');
        return null;
    }
    
    return { 
        routeFrom, 
        routeTo, 
        startDateTime: new Date(`${tripDate}T${tripTime}:00.000Z`)
    };
};

// Consolidated API helper functions
const apiRequest = async (url, errorContext) => {
    try {
        const response = await fetch(url, { headers: { 'Accept': 'application/json' } });
        if (!response.ok) throw new Error(`${response.status}: ${response.statusText}`);
        return await response.json();
    } catch (error) {
        throw new Error(`${errorContext} failed: ${error.message}`);
    }
};

const geocodeLocation = async (address) => {
    const url = `${CONFIG.NOMINATIM_URL}?format=json&q=${encodeURIComponent(address)}&limit=1`;
    const data = await apiRequest(url, `Geocoding "${address}"`);
    
    if (data.length === 0) throw new Error(`Location not found: ${address}`);
    
    return {
        lat: parseFloat(data[0].lat),
        lng: parseFloat(data[0].lon),
        name: data[0].display_name
    };
};

const calculateRoute = async (fromLocation, toLocation) => {
    const osrmUrl = `https://router.project-osrm.org/route/v1/driving/${fromLocation.lng},${fromLocation.lat};${toLocation.lng},${toLocation.lat}?overview=full&geometries=geojson&steps=true`;
    const data = await apiRequest(osrmUrl, 'Route calculation');
    
    if (data.code !== 'Ok') throw new Error(`OSRM API error: ${data.message || 'Unknown error'}`);
    
    if (data.routes?.[0]?.geometry) {
        const route = data.routes[0];
        const coordinates = route.geometry.coordinates.map(coord => [coord[1], coord[0]]);
        console.log('Successfully got route from OSRM');
        return { path: coordinates, distance: route.distance, duration: route.duration };
    }
    
    throw new Error('No valid route found in OSRM response');
};

const visualizeRoutes = async () => {
    const routeFrom = DOM.routeFrom.value.trim();
    const routeTo = DOM.routeTo.value.trim();
    
    if (!routeFrom || !routeTo) {
        showStatus('Please fill in both route fields.', 'error');
        return;
    }
    
    const button = DOM.visualizeBtn;
    button.disabled = true;
    
    try {
        showStatus('Geocoding locations...', 'info');
        clearPreviousRoutes();
        
        const [fromLocation, toLocation] = await Promise.all([
            geocodeLocation(routeFrom),
            geocodeLocation(routeTo)
        ]);
        
        showStatus('Calculating route...', 'info');
        AppState.route.data = await calculateRoute(fromLocation, toLocation);
        
        displayRoute(AppState.route.data, CONFIG.ROUTE_COLORS.ROUTE1, 'Route');
        fitMapToRoutes([AppState.route.data]);
        updateRouteDataSection(AppState.route.data);
        
        // Format duration inline
        const formatDuration = (seconds) => {
            const totalMinutes = Math.round(seconds / 60);
            const hours = Math.floor(totalMinutes / 60);
            const minutes = totalMinutes % 60;
            return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
        };
        
        const routeDistance = (AppState.route.data.distance / 1000).toFixed(1);
        const routeTime = formatDuration(AppState.route.data.duration);
        
        showStatus(`Route calculated successfully! 📍 Distance: ${routeDistance}km | ⏱️ Time: ${routeTime}`, 'success');
        updateUrlWithParameters(routeFrom, routeTo);
        
        // Auto-trigger sun calculations
        setTimeout(() => {
            trackSunPosition();
            setTimeout(showCarSunExposure, 1000);
        }, 500);
        
    } catch (error) {
        logError(error, 'visualizeRoutes');
        showStatus(error.message, 'error');
    } finally {
        button.disabled = false;
    }
};

const clearPreviousRoutes = () => {
    if (AppState.route.layer) {
        map.removeLayer(AppState.route.layer);
        AppState.route.layer = null;
    }
    clearSunMarkers();
    clearCarVisualization();
    AppState.sun.positions = [];
    AppState.route.data = null;
    
    DOM.routeDataContent.innerHTML = '<p class="text-muted-foreground italic text-center text-lg">Calculate a route above to see the API data being used for analysis...</p>';
};

// Template utilities
const formatTime = date => date.toLocaleTimeString('en-US', { 
    hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'UTC' 
}) + ' UTC';

const createCard = (icon, title, value, subtitle = '') => `
    <div class="p-4 bg-secondary/50 rounded-lg border">
        <div class="flex items-center gap-3 mb-2">
            <span class="text-xl">${icon}</span>
            <span class="font-semibold">${title}</span>
        </div>
        <p class="text-muted-foreground">${value}</p>
        ${subtitle ? `<p class="text-xs text-muted-foreground mt-1">${subtitle}</p>` : ''}
    </div>`;

const updateRouteDataSection = (routeData) => {
    const formatDuration = (seconds) => {
        const totalMinutes = Math.round(seconds / 60);
        const hours = Math.floor(totalMinutes / 60);
        const minutes = totalMinutes % 60;
        return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
    };
    
    const routeDistance = (routeData.distance / 1000).toFixed(1);
    const routeTime = formatDuration(routeData.duration);
    const numAnalysisPoints = parseInt(DOM.analysisPoints.value) || 12;
    
    const startDateTime = new Date(`${DOM.tripDate.value}T${DOM.tripTime.value}:00.000Z`);
    const arrivalDateTime = new Date(startDateTime.getTime() + (routeData.duration * 1000));
    
    DOM.routeDataContent.innerHTML = `
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            ${createCard('📍', 'Distance', `${routeDistance} km`, 'From OpenStreetMap API')}
            ${createCard('⏱️', 'Travel Time', routeTime, 'From routing service')}
            ${createCard('🚀', 'Start', formatTime(startDateTime))}
            ${createCard('🏁', 'Arrival', formatTime(arrivalDateTime))}
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
                            ${generateAnalysisPointsDetails(routeData, startDateTime, numAnalysisPoints)}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>`;
};

const generateAnalysisPointsDetails = (routeData, startDateTime, numAnalysisPoints) => {
    const totalDistanceKm = routeData.distance / 1000;
    
    return Array.from({ length: numAnalysisPoints }, (_, i) => {
        const routeProgress = i / (numAnalysisPoints - 1);
        const timeOffsetSeconds = routeProgress * routeData.duration;
        const traveledDistance = (routeProgress * totalDistanceKm).toFixed(1);
        const absoluteTimeAtPosition = new Date(startDateTime.getTime() + (timeOffsetSeconds * 1000));
        
        return `
            <tr class="border-b hover:bg-secondary/50 transition-colors">
                <td class="p-3 font-medium">${i + 1}</td>
                <td class="p-3 text-muted-foreground">${(routeProgress * 100).toFixed(1)}%</td>
                <td class="p-3 text-muted-foreground">${traveledDistance} km</td>
                <td class="p-3 text-muted-foreground">${formatTime(absoluteTimeAtPosition)}</td>
            </tr>`;
    }).join('');
};

const toggleAnalysisPoints = () => {
    const details = document.getElementById('analysis-points-details');
    const toggle = document.getElementById('analysis-points-toggle');
    const isHidden = details.classList.contains('hidden');
    
    details.classList.toggle('hidden');
    toggle.textContent = isHidden ? 'Hide Details' : 'Show Details';
};

const displayRoute = (routeData, color, label) => {
    const layer = L.polyline(routeData.path, {
        color,
        weight: 6,
        opacity: 0.7
    }).addTo(map);
    
    AppState.route.layer = layer;
    
    const formatDuration = (seconds) => {
        const totalMinutes = Math.round(seconds / 60);
        const hours = Math.floor(totalMinutes / 60);
        const minutes = totalMinutes % 60;
        return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
    };
    
    layer.bindPopup(`
        <strong>${label}</strong><br>
        📍 Distance: ${(routeData.distance / 1000).toFixed(1)} km<br>
        ⏱️ Travel Time: ${formatDuration(routeData.duration)}
    `);
};

const fitMapToRoutes = (routes) => {
    const allPoints = routes.flatMap(route => route.path);
    
    if (allPoints.length > 0) {
        const bounds = L.latLngBounds(allPoints);
        map.fitBounds(bounds, { padding: [20, 20] });
    }
};

// Haversine distance calculation
const getDistance = (point1, point2) => {
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
};


const calculateAnalysisPoints = (routePath, startDateTime) => {
    const numAnalysisPoints = parseInt(DOM.analysisPoints.value) || 12;
    const totalDurationSeconds = AppState.route.data.duration;
    
    return Array.from({ length: numAnalysisPoints }, (_, i) => {
        const routeProgress = i / (numAnalysisPoints - 1);
        const pathIndex = Math.floor(routeProgress * (routePath.length - 1));
        const position = routePath[pathIndex];
        
        const timeOffsetSeconds = routeProgress * totalDurationSeconds;
        const absoluteTimeAtPosition = new Date(startDateTime.getTime() + (timeOffsetSeconds * 1000));
        
        const sunPosition = calculateSunPosition(position[0], position[1], absoluteTimeAtPosition);
        
        // Calculate car bearing from route direction
        const carBearing = pathIndex < routePath.length - 1 ? 
            calculateBearing(routePath[pathIndex], routePath[pathIndex + 1]) :
            pathIndex > 0 ? calculateBearing(routePath[pathIndex - 1], routePath[pathIndex]) : 0;
        
        const isDaylight = sunPosition.elevation > 0;
        const carSideExposures = isDaylight ? 
            calculateCarSideExposures(sunPosition, carBearing) : 
            { front: 0, back: 0, left: 0, right: 0 };
        
        return {
            location: position,
            absoluteTime: absoluteTimeAtPosition,
            routeProgress,
            sunAzimuth: sunPosition.azimuth,
            sunElevation: sunPosition.elevation,
            carBearing,
            isDaylight,
            exposures: carSideExposures,
            time: absoluteTimeAtPosition
        };
    });
};

const trackSunPosition = () => {
    const inputs = validateInputs();
    if (!inputs) return;
    
    clearSunMarkers();
    showStatus('Calculating sun positions and directions...', 'info');
    setTimeout(() => {
        AppState.sun.positions = calculateAnalysisPoints(AppState.route.data.path, inputs.startDateTime);
        visualizeSunPositions(AppState.sun.positions);
        showStatus(`Sun positions calculated for ${AppState.sun.positions.length} points along the route.`, 'success');
    }, 500);
};
// Car SVG template for visualization
const createCarSvg = (carBearing) => `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="-30 -30 120 180" width="60" height="120">
        <g fill="#2563eb" stroke="#1d4ed8" stroke-width="1" stroke-linecap="round" stroke-linejoin="round" transform="rotate(${carBearing} 30 60)">
            <rect x="18" y="20" width="24" height="60" rx="8" fill="#3b82f6"/>
            <path d="M22 35 C30 30 30 30 38 35" stroke="#60a5fa" stroke-width="2" fill="none"/>
            <path d="M22 65 C30 70 30 70 38 65" stroke="#60a5fa" stroke-width="2" fill="none"/>
            <circle cx="25" cy="18" r="2" fill="#fbbf24"/>
            <circle cx="35" cy="18" r="2" fill="#fbbf24"/>
            <rect x="16" y="28" width="4" height="8" rx="2" fill="#374151"/>
            <rect x="40" y="28" width="4" height="8" rx="2" fill="#374151"/>
            <rect x="16" y="64" width="4" height="8" rx="2" fill="#374151"/>
            <rect x="40" y="64" width="4" height="8" rx="2" fill="#374151"/>
        </g>
    </svg>
`;

// Create popup content for car markers
const createCarPopupContent = (sunPos, index) => {
    const carBearing = sunPos.carBearing;
    const carSideExposures = sunPos.exposures;
    const relativeSunAngle = sunPos.isDaylight ? (sunPos.sunAzimuth - carBearing + 360) % 360 : 0;
    
    const exposureSection = sunPos.isDaylight ? `
        <div style="background: #fff3cd; padding: 8px; border-radius: 5px; margin: 10px 0;">
            <p style="margin: 2px 0; font-weight: bold;">☀️ Sun Exposure:</p>
            ${['Front', 'Back', 'Left', 'Right'].map(side => 
                `<p style="margin: 1px 0;">${side}: ${(carSideExposures[side.toLowerCase()] * 100).toFixed(1)}%</p>`
            ).join('')}
        </div>
    ` : '<p style="color: #666; font-style: italic;">🌙 Nighttime - no sun exposure</p>';
    
    return `
        <div style="font-family: Arial, sans-serif; max-width: 320px;">
            <h4 style="margin: 0 0 10px 0; color: #333;">🚗 Stop #${index + 1} - ${formatTime(sunPos.absoluteTime)}</h4>
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
            ${exposureSection}
            <p style="margin: 3px 0; font-size: 12px; color: #666;">
                ${sunPos.isDaylight ? '🌅 Line color & length show sun height: RED/short = overhead, YELLOW/long = horizon' : '🌙 Nighttime - no sun visible'}
            </p>
        </div>
    `;
};

const visualizeSunPositions = (sunPositions) => {
    sunPositions.forEach((sunPos, index) => {
        const carIcon = L.divIcon({
            html: createCarSvg(sunPos.carBearing),
            className: 'car-marker',
            iconSize: [60, 120],
            iconAnchor: [30, 60]
        });
        
        const locationMarker = L.marker([sunPos.location[0], sunPos.location[1]], {
            icon: carIcon,
            zIndexOffset: 1000
        }).addTo(map);
        
        if (sunPos.isDaylight) {
            createSkyDomeVisualization(sunPos, index);
        }
        
        locationMarker.bindPopup(createCarPopupContent(sunPos, index));
        AppState.sun.markers.push(locationMarker);
    });
};

const createSkyDomeVisualization = (sunPos, index) => {
    const [lat, lng] = sunPos.location;
    const { sunAzimuth: azimuth, sunElevation: elevation } = sunPos;
    
    // Calculate sun position on sky dome
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
    
    // Create sun marker with dynamic sizing and coloring
    const sunSize = Math.max(12, 20 - (elevation / 90) * 8);
    const markerColors = getSunMarkerColors(elevation);
    
    const sunIcon = L.divIcon({
        html: `<div style="
            width: ${sunSize}px; height: ${sunSize}px; 
            background: ${markerColors.background}; 
            border: 2px solid ${markerColors.border}; 
            border-radius: 50%; display: flex; 
            align-items: center; justify-content: center;
            font-size: ${Math.max(8, sunSize - 8)}px;
            color: white; text-shadow: 1px 1px 1px rgba(0,0,0,0.8);
            box-shadow: 0 0 ${sunSize/2}px ${markerColors.shadow};
        ">☀</div>`,
        className: 'sun-in-sky',
        iconSize: [sunSize, sunSize],
        iconAnchor: [sunSize/2, sunSize/2]
    });
    
    const sunMarker = L.marker([sunLat, sunLng], {
        icon: sunIcon,
        zIndexOffset: 800
    }).addTo(map);
    
    // Create elevation line with color based on sun height
    const elevationLine = L.polyline([[lat, lng], [sunLat, sunLng]], {
        color: getSunLineColor(elevation),
        weight: 6,
        opacity: 1.0
    }).addTo(map);
    
    sunMarker.bindPopup(`
        <div style="font-family: Arial, sans-serif; text-align: center; max-width: 200px;">
            <strong>☀️ Sun in Sky</strong><br>
            <p style="margin: 5px 0; font-size: 12px;">
                Looking ${getCompassDirection(azimuth)}<br>
                ${elevation.toFixed(1)}° above horizon<br>
                <em>${getSkyDescription(elevation)}</em>
            </p>
        </div>
    `);
    
    AppState.sun.markers.push(sunMarker, elevationLine);
};

const clearSunMarkers = () => {
    AppState.sun.markers.forEach(marker => map.removeLayer(marker));
    AppState.sun.markers = [];
};

const refreshSunVisualization = () => {
    if (AppState.sun.positions.length > 0) {
        clearSunMarkers();
        visualizeSunPositions(AppState.sun.positions);
        console.log(`Refreshed sun visualization with ${AppState.sun.positions.length} positions at zoom level ${map.getZoom()}`);
    }
};

// Sun position and description utilities
const calculateSunPosition = (latitude, longitude, date) => {
    const sunPosition = SunCalc.getPosition(date, latitude, longitude);
    return {
        elevation: sunPosition.altitude * 180 / Math.PI,
        azimuth: (sunPosition.azimuth * 180 / Math.PI + 180) % 360
    };
};

const getCompassDirection = (azimuth) => {
    const directions = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
    return directions[Math.round(azimuth / 22.5) % 16];
};

const getSkyDescription = (elevation) => {
    if (elevation < 5) return 'Just above horizon';
    if (elevation < 15) return 'Low in sky';
    if (elevation < 30) return 'Moderately low';
    if (elevation < 60) return 'High in sky';
    if (elevation < 80) return 'Very high';
    return 'Nearly overhead';
};

// Simplified sun color calculations
const getSunLineColor = (elevation) => {
    if (elevation >= 70) return '#FF0080';
    if (elevation >= 50) return '#FF4500';
    if (elevation >= 30) return '#FF8C00';
    if (elevation >= 10) return '#FFA500';
    return '#FFD700';
};

const getSunMarkerColors = (elevation) => {
    const colorMap = {
        70: { bg: 'radial-gradient(circle, #FF0080 0%, #FF4500 70%, #FF6B00 100%)', border: '#FF0080', shadow: 'rgba(255, 0, 128, 0.8)' },
        50: { bg: 'radial-gradient(circle, #FF4500 0%, #FF6B00 70%, #FF8C00 100%)', border: '#FF4500', shadow: 'rgba(255, 69, 0, 0.8)' },
        30: { bg: 'radial-gradient(circle, #FF8C00 0%, #FFA500 70%, #FFB84D 100%)', border: '#FF8C00', shadow: 'rgba(255, 140, 0, 0.8)' },
        10: { bg: 'radial-gradient(circle, #FFA500 0%, #FFD700 70%, #FFEB99 100%)', border: '#FFA500', shadow: 'rgba(255, 165, 0, 0.8)' },
        0: { bg: 'radial-gradient(circle, #FFD700 0%, #FFEB99 70%, #FFF8DC 100%)', border: '#FFD700', shadow: 'rgba(255, 215, 0, 0.8)' }
    };
    
    for (const [threshold, colors] of Object.entries(colorMap).map(([k, v]) => [parseInt(k), v])) {
        if (elevation >= threshold) {
            return { background: colors.bg, border: colors.border, shadow: colors.shadow };
        }
    }
    
    return { background: '#FFD700', border: '#FFD700', shadow: 'rgba(255, 215, 0, 0.8)' };
};

const showCarSunExposure = () => {
    const inputs = validateInputs();
    if (!inputs) return;
    
    showStatus('Calculating car sun exposure summary...', 'info');
    setTimeout(() => {
        updateSummaryVisualization(calculateAnalysisPoints(AppState.route.data.path, inputs.startDateTime));
        showStatus(`Car sun exposure summary updated.`, 'success');
    }, 500);
};

// Bearing calculation between two points
const calculateBearing = (point1, point2) => {
    const lat1 = point1[0] * Math.PI / 180;
    const lat2 = point2[0] * Math.PI / 180;
    const deltaLng = (point2[1] - point1[1]) * Math.PI / 180;
    
    const y = Math.sin(deltaLng) * Math.cos(lat2);
    const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(deltaLng);
    
    return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
};

const calculateCarSideExposures = (sunPosition, carBearing) => {
    const relativeSunAngle = (sunPosition.azimuth - carBearing + 360) % 360;
    
    const calculateSideExposure = (targetAngle) => {
        let angle = Math.abs(relativeSunAngle - targetAngle);
        angle = Math.min(angle, 360 - angle);
        return angle <= 90 ? Math.cos(angle * Math.PI / 180) : 0;
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
};

// Consolidated car exposure visualization
const updateCarSideColor = (side, exposureLevel) => {
    const percentageElement = document.getElementById(`${side}-percentage`);
    const labelContainer = percentageElement?.closest('.bg-background');
    
    if (!labelContainer) return;
    
    const yellowIntensity = Math.round(exposureLevel * 255);
    Object.assign(labelContainer.style, {
        backgroundColor: `rgb(255, 255, ${255 - yellowIntensity})`,
        color: yellowIntensity > 127 ? '#000000' : '#666666',
        borderColor: yellowIntensity > 50 ? '#d4a574' : 'hsl(214.3 31.8% 91.4%)'
    });
};

const updateSummaryVisualization = (carExposureData) => {
    const daylightData = carExposureData.filter(data => data.isDaylight);
    const sides = ['front', 'back', 'left', 'right'];
    
    if (daylightData.length === 0) {
        sides.forEach(side => {
            updateCarSideColor(side, 0);
            document.getElementById(`${side}-percentage`).textContent = '0%';
        });
    } else {
        // Calculate and apply average exposures
        const avgExposures = sides.reduce((acc, side) => {
            acc[side] = daylightData.reduce((sum, data) => sum + data.exposures[side], 0) / daylightData.length;
            return acc;
        }, {});
        
        let maxExposure = { side: '', value: -1 };
        let minExposure = { side: '', value: 2 };
        
        Object.entries(avgExposures).forEach(([side, exposure]) => {
            updateCarSideColor(side, exposure);
            document.getElementById(`${side}-percentage`).textContent = `${(exposure * 100).toFixed(0)}%`;
            
            if (exposure > maxExposure.value) maxExposure = { side, value: exposure };
            if (exposure < minExposure.value) minExposure = { side, value: exposure };
        });
        
        // Console summary
        console.log('\n=== TRIP SUMMARY ===');
        console.log('Average sun exposure levels:');
        sides.forEach(side => console.log(`  ${side.charAt(0).toUpperCase() + side.slice(1)}: ${(avgExposures[side] * 100).toFixed(1)}%`));
        console.log(`Most exposed: ${maxExposure.side} (${(maxExposure.value * 100).toFixed(1)}%)`);
        console.log(`Least exposed: ${minExposure.side} (${(minExposure.value * 100).toFixed(1)}%)`);
    }
    
    // Toggle visibility
    DOM.resultsPlaceholder.style.display = 'none';
    DOM.carSummary.style.display = 'block';
};

const clearCarVisualization = () => {
    DOM.resultsPlaceholder.style.display = 'flex';
    DOM.carSummary.style.display = 'none';
};

window.onload = initMap;
