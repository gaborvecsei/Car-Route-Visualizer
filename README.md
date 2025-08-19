# Route Sun Exposure Visualizer

Analyze which side of your car gets hit by the sun during road trips.

![Route Sun Exposure Visualizer](art/index.jpeg)

## Calculations

### Car Sun Exposure Model

For each point along the route, we calculate the relative angle between the sun and car orientation:

**Relative Sun Angle:**
$$\theta_{rel} = (A_{sun} - B_{car} + 360°) \bmod 360°$$

Where $B_{car}$ is the car's bearing (travel direction).

**Side Exposure Calculation:**
Each car side's exposure is calculated using angular difference with tolerance:

For each side with orientation $\theta_{side}$:
1. Calculate angular difference: $\alpha = |\theta_{rel} - \theta_{side}|$
2. Handle wraparound: $\alpha = \min(\alpha, 360° - \alpha)$  
3. Apply exposure formula with 90° tolerance:
   
$$E_{side} = \begin{cases}
\cos(\alpha) & \text{if } \alpha \leq 90° \\
0 & \text{if } \alpha > 90°
\end{cases}$$

Where $\theta_{side}$ represents the side's orientation:
- Front: $0°$
- Right: $90°$ 
- Back: $180°$
- Left: $270°$

The raw exposure values are then normalized so that:
$$E_{front} + E_{back} + E_{left} + E_{right} = 1$$

This ensures the total sun energy hitting the car is conserved and distributed among the sides based on geometry, while the 90° tolerance prevents sides from receiving exposure when the sun is behind them.

## Interactive Sun Exposure Visualization

![Interactive Sun Exposure Visualization](art/exposure_test.png)

## Limitations

- **Perfect Weather**: Assumes clear skies with no atmospheric obstructions
- **Flat Terrain**: Ignores hills, mountains, trees, buildings, and other shadows
- **Simplified Car Model**: Car direction calculated from straight-line segments between route points
- **UTC Time Only**: All calculations use UTC time without local timezone adjustments
