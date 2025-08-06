# Multi Maps Route Visualizer

A lightweight tool for visualizing two routes and tracking sun positions along them.

## Features

- **Dual Route Visualization**: Display two routes on OpenStreetMap
- **Sun Position Tracking**: Calculate and visualize sun position along routes with sky dome
- **No API Keys Required**: Uses free OpenStreetMap services

## Quick Start

1. Run the server: `python3 serve.py`
2. Open the automatically opened browser tab
3. Enter your two routes and click "Visualize Routes"
4. Use "Track Sun Position" to see sun positions along selected route

## Files

- `index.html` - Main application interface
- `script.js` - Route calculation and sun tracking logic
- `config.js` - Configuration settings
- `serve.py` - Development server
- `styles.css` - UI styling

## Usage

1. Enter start/end locations for both routes
2. Click "Visualize Routes" to see routes on map (blue/red lines)
3. Set date/time and select a route
4. Click "Track Sun Position" to see sun positions with visual sky dome
5. Adjust dome size with the slider for better visibility

## Technical

- **Leaflet.js** with OpenStreetMap tiles
- **OSRM** for routing with simulation fallback
- **Nominatim** for geocoding
- Pure JavaScript, no frameworks required