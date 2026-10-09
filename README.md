# Watermelon 2048

A browser game that mixes Suika-style fruit merging with 2048 tiles on a 4×4 board.

**Play:** https://nuclyee72.github.io/WMGame/

## How to play

- Aim in the strip outside the grid and release to drop a fruit. Two matching fruits merge into the next tier.
- When **Next** shows the swipe icon, you must swipe: gravity turns that way, the 2048 tiles slide, and a new tile appears.
- The value of the next new tile shows beside **Next**. On a swipe turn, a dashed cell — picked at random among cells with no tile or fruit — shows where it will land, whichever way you swipe. If a tile slides into that cell, the new tile lands on a random empty cell instead; if every cell holds a tile, the game ends. The tile appears once the fruit settles, or when you make the next swipe (fruit in its way slides aside).
- You can't drop into a column whose top cell holds a tile. Tiles can push a little fruit; if too much is in the way they bounce back.
- A **32** tile is hollow — roll a Tier 7 fruit into it and both burst.
- A **64** tile is an empty frame — every fruit passes through it, but it still slides and merges.
- Fruit poking past the dashed line for 2 seconds ends the game.
- Keys: `A` / `D` aim · `Space` drop · arrow keys swipe.

### Goals

Each goal is worth one star; reach all three for an all-clear. The game keeps going after that.

1. Make a 64 tile
2. Fill a 32 tile with a Tier 7 fruit
3. Make a Tier 8 fruit

### Fruit images

In **Fruit images** you can switch between the default fruits, the Plush set, or your own uploads (Custom).

## Run locally

The Plush set loads image files with `fetch`, so serve the folder instead of opening `index.html` directly:

```sh
python -m http.server 8000
```

Then open http://localhost:8000/.

## Credits

- The plush photos `1.jpg`–`8.jpg` and `7.png` (the **Plush** image set) are copyrighted by **NEXON**. This is an unofficial, non-commercial fan project and is not affiliated with or endorsed by NEXON.
- Physics by [matter.js](https://brm.io/matter-js/). Fonts: [Outfit](https://fonts.google.com/specimen/Outfit), [Pretendard](https://github.com/orioncactus/pretendard).
