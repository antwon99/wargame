# Combat Layout Primer

Combat boards are generated as a mirrored hexagon: player-controlled tiles occupy positive `r` rows, enemy tiles occupy negative `r` rows, and castles mirror across the center column (`(0, 8)` for players, `(0, -8)` for enemies). Territory counts stay balanced between the two sides so fog or visibility changes never reveal asymmetries.

## Neutral strip
- The only neutral territory is the single equator row at `r = 0`. Tiles there spawn as `claimable` so the center can be contested immediately once a side reaches it.
- No additional neutral rings are generated, preventing unreachable pockets from appearing when fog clears or UI visibility modes change.

## Purchase radius and frontier
- The player's frontier checks treat any tile within three hexes of the castle as immediately purchasable; enemies use a one-hex radius.
- Beyond those radii, tiles must either neighbor owned territory, a friendly building, or (for neutral centers) sit adjacent to an owned tile to become buyable.
