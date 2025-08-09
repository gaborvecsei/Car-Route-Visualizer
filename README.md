# Route Sun Exposure Visualizer

Analyze which side of your car gets hit by the sun during road trips.

## Quick Start

1. Run: `python3 serve.py`
2. Open the browser tab that opens automatically
3. Enter your route (from/to locations)
4. Set trip date and time
5. Click "Analyze Sun Exposure"

## Features

- Calculate sun exposure on each side of your car (front/back/left/right)
- Real-time sun position tracking along your route
- No API keys required - uses free OpenStreetMap services

## Calculation Approach

### Route Analysis

1. **Route Planning**: Uses OpenStreetMap routing services (OSRM) to get detailed route coordinates and actual travel time
2. **Analysis Points**: Distributes a fixed number of analysis points (6-20, default 12) evenly along the route
3. **Time Calculation**: Uses actual API travel time distributed proportionally across analysis points

### Car Bearing Calculation

The bearing (direction) between waypoints is calculated using:

$$\theta = \arctan2(\sin\Delta\lambda \cos\phi_2, \cos\phi_1 \sin\phi_2 - \sin\phi_1 \cos\phi_2 \cos\Delta\lambda)$$

Where $\theta$ is converted to degrees and normalized to 0°-360°.

### Sun Position Calculation

Sun position (azimuth and elevation) is calculated using the [SunCalc](https://github.com/mourner/suncalc) library, which implements precise astronomical formulas.

### Fallback Route Generation

When routing APIs fail, a fallback route is generated using the Haversine formula for distance estimation:

$$d = 2R \arcsin\left(\sqrt{\sin^2\left(\frac{\Delta\phi}{2}\right) + \cos\phi_1 \cos\phi_2 \sin^2\left(\frac{\Delta\lambda}{2}\right)}\right)$$

Where $R$ = 6,371 km (Earth's radius).

### Car Sun Exposure Model

For each point along the route, we calculate the relative angle between the sun and car orientation:

**Relative Sun Angle:**
$$\theta_{rel} = (A_{sun} - B_{car} + 360°) \bmod 360°$$

Where $B_{car}$ is the car's bearing (travel direction).

**Side Exposure Calculation:**
Each car side's exposure is modeled as:

$$E_{side} = \max(0, \cos(\theta_{rel} - \theta_{side}))$$

Where $\theta_{side}$ represents the side's orientation:
- Front: $0°$
- Right: $90°$ 
- Back: $180°$
- Left: $270°$

The exposure values are normalized so that:
$$E_{front} + E_{back} + E_{left} + E_{right} = 1$$

This ensures the total sun energy hitting the car is conserved and distributed among the sides based on geometry.

## Limitations and Assumptions

This tool makes several simplifying assumptions that affect accuracy:

### Basic Assumptions
- **Constant Speed**: Travel time is distributed evenly across the route (no traffic, stops, or speed variations)
- **Straight-Line Segments**: Car direction is calculated using straight lines between analysis points
- **Perfect Weather**: Assumes clear skies with no clouds, fog, or atmospheric effects
- **Flat Terrain**: Ignores hills, mountains, trees, buildings, and other obstructions
- **Direct Sunlight Only**: No calculations for reflected light, diffused light, or shadows
- **Static Car Orientation**: Assumes car always faces the travel direction (no turning considerations)

### Timezone Handling
- Uses geographical coordinate-based timezone detection
- Accounts for local solar time at each location
- May have minor inaccuracies near timezone boundaries

### Route Sampling
- Analysis points are distributed evenly along the route path
- Number of points is user-configurable (6-20, default 12)
- More points provide finer detail but don't necessarily improve accuracy given other limitations

**Note**: This tool is designed for planning and curiosity purposes. Real-world sun exposure varies significantly due to weather, terrain, traffic patterns, and many other factors not considered in these calculations.