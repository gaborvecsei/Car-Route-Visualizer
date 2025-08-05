# Multi Maps Route Visualizer

A lightweight browser-based tool that visualizes multiple routes and highlights overlapping sections. Available in two versions:

## Features

- **Dual Route Input**: Define two routes with from/to locations
- **Route Visualization**: Display both routes simultaneously with different colors
- **Overlap Detection**: Automatically detect and highlight overlapping route segments
- **Interactive Map**: Pan, zoom, and explore the visualized routes

## Versions

### OpenStreetMap Version (Recommended - Free!)
- **File**: `index_osm.html`
- **No API key required**
- Uses Leaflet.js + OpenStreetMap tiles
- Free routing via OpenRouteService
- **Ready to use immediately**

### Google Maps Version
- **File**: `index.html`
- Requires Google Maps API key
- More detailed maps and routing options
- Costs may apply for API usage

## Setup

### Quick Start (OpenStreetMap - Free)

**Option 1: Local HTTP Server (Recommended)**
1. Run the local server:
   - **Mac/Linux**: `./serve.sh` or `python3 serve.py`
   - **Windows**: Double-click `serve.bat` or run `python serve.py`
2. Server automatically opens `http://localhost:8000/index_osm.html`
3. Start using immediately!

**Option 2: Direct File (Limited functionality)**
1. Open `index_osm.html` directly in browser
2. May have CORS restrictions with some routing services

### Google Maps Setup
1. **Get Google Maps API Key**
   - Visit [Google Cloud Console](https://console.cloud.google.com/)
   - Enable the Maps JavaScript API and Directions API
   - Create an API key

2. **Configure the Application**
   - Open `config.js`
   - Replace `YOUR_API_KEY_HERE` with your Google Maps API key

3. **Run the Application**
   - Open `index.html` in your web browser
   - Or serve it via a local web server for best results

## Usage

1. Enter starting and ending locations for Route 1
2. Enter starting and ending locations for Route 2
3. Click "Visualize Routes"
4. View the routes on the map:
   - **Red line**: Route 1
   - **Blue line**: Route 2
   - **Green highlights**: Overlapping segments
   - **Green markers**: Overlap points

## Files

### OpenStreetMap Version (Free)
- `index_osm.html` - OpenStreetMap interface
- `script_osm.js` - Leaflet.js functionality
- `config_osm.js` - OpenStreetMap configuration
- `styles.css` - UI styling (shared)

### Google Maps Version  
- `index.html` - Google Maps interface
- `script.js` - Google Maps functionality
- `config.js` - Google Maps configuration
- `styles.css` - UI styling (shared)

### Local Development Server
- `serve.py` - Python HTTP server with CORS support
- `serve.sh` - Unix/Mac startup script  
- `serve.bat` - Windows startup script

### Common
- `mission.md` - Project requirements
- `README.md` - This documentation

## Technical Details

### OpenStreetMap Version
- **Leaflet.js** - Interactive map library
- **OpenStreetMap tiles** - Free map data
- **Nominatim API** - Free geocoding service
- **OpenRouteService** - Free routing API (5000 requests/day)
- **No API key required** - Ready to use

### Google Maps Version
- **Google Maps JavaScript API** - Maps and routing
- **Directions Service** - Route calculation
- **Requires API key** - Costs may apply

### Both Versions
- **Overlap Algorithm** - Geometric distance calculation between route segments
- **Responsive Design** - Works on desktop and mobile devices
- **Pure JavaScript** - No additional frameworks