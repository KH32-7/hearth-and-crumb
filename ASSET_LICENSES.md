# Asset licenses

## Art
- Painted textures, concept-based title art, wall paintings and the clock face were generated for this project with Higgsfield (GPT Image 2.5) and edited (tiling, colour) for the game.
- All 3D models are procedural (built in code). Fonts: Gaegu, Gowun Dodum, Jua (SIL Open Font License, via @fontsource).

## Audio

Every file in `public/audio/` comes from **CC0 (public domain)** sources. Nothing here is CC-BY, non-commercial or AI-generated, so no attribution is legally required. The credits below are a courtesy and an audit trail. All files were re-processed with ffmpeg/numpy: trimmed, high- and low-pass filtered, pitched where noted, layered, crossfaded into loops, peak-normalized (SFX to -3 dBFS, ambience to -6 dBFS, music to about -20 dBFS RMS with peaks at or below -4 dBFS) and encoded as Ogg Vorbis (q4 for SFX, q3 for ambience and music).

Nothing was played back by ear during sourcing. Files were chosen from their names, descriptions and spectral/envelope analysis. **Audition every file before release.**

## Source packs

| Key | Pack / page | Author | License |
|---|---|---|---|
| K-IF | Interface Sounds, https://kenney.nl/assets/interface-sounds | Kenney (kenney.nl) | CC0 1.0 |
| K-IM | Impact Sounds, https://kenney.nl/assets/impact-sounds | Kenney | CC0 1.0 |
| K-RPG | RPG Audio, https://kenney.nl/assets/rpg-audio | Kenney | CC0 1.0 |
| K-CAS | Casino Audio, https://kenney.nl/assets/casino-audio | Kenney | CC0 1.0 |
| K-JIN | Music Jingles, https://kenney.nl/assets/music-jingles | Kenney | CC0 1.0 |
| GH | General Household Sound Effects, https://opengameart.org/content/general-household-sound-effects | bretbernhoft | CC0 |
| RD1 | 100 CC0 SFX, https://opengameart.org/content/100-cc0-sfx | rubberduck | CC0 |
| RD2 | 100 CC0 SFX #2, https://opengameart.org/content/100-cc0-sfx-2 | rubberduck | CC0 |
| RDL | 30 CC0 SFX loops, https://opengameart.org/content/30-cc0-sfx-loops | rubberduck | CC0 |
| RDS | 40 CC0 water / splash / slime SFX, https://opengameart.org/content/40-cc0-water-splash-slime-sfx | rubberduck | CC0 |
| FIRE1 | Fireplace Sound loop, https://opengameart.org/content/fireplace-sound-loop | PagDev | CC0 |
| FIRE2 | Fire Crackling, https://opengameart.org/content/fire-crackling | AntumDeluge | CC0 |
| PWL | Bell dings/chimes, https://opengameart.org/content/bell-dingschimes | PWL | CC0 |
| STEAM | Steam release sounds, https://opengameart.org/content/steam-release-sounds | bart | CC0 (the author notes "attribution appreciated") |
| PURCH | Purchasing Sound Effect, https://opengameart.org/content/purchasing-sound-effect | Spring Spring | CC0 |
| CAT | Cat Purr & Meow, https://opengameart.org/content/cat-purr-meow | Kerzoven | CC0 |
| PARK | Park ambiences, https://opengameart.org/content/park-ambiences | Thimras | CC0 |
| MORN | AMB Morning Sounds (Perfect Loop), https://opengameart.org/content/amb-morning-sounds-perfect-loop | Kresiek The Furry | CC0 |
| SHOP | The Shop, https://opengameart.org/content/the-shop | LEGIT Audio | CC0 |
| M1 | Chill lofi inspired [loop edit], https://opengameart.org/content/chill-lofi-inspired-loop-edit (original: https://opengameart.org/content/chill-lofi-inspired) | omfgdude (music), qubodup (loop edit) | CC0 |
| M2 | Cozy Puzzle In-Game 1, https://opengameart.org/content/cozy-puzzle-in-game-1 | MintoDog | CC0 |
| M3 | Bluebonnet, https://opengameart.org/content/bluebonnet | Kistol | CC0 |
| M4 | A Small Fire Will Do (Calming Loop), https://opengameart.org/content/a-small-fire-will-do-calming-loop | Trex0n | CC0 |

## Per-file mapping

| id | Source file(s) | Pack | Fit | Processing notes |
|---|---|---|---|---|
| ui_click | drop_003.ogg | K-IF | good | soft tonal "bloop" click |
| ui_hover | click_002.ogg | K-IF | good | 12 ms tick, low-passed |
| ui_open | bookFlip1.ogg | K-RPG | good | page flip |
| pickup | handleSmallLeather.ogg | K-RPG | good | soft leather/handle grab |
| place_wood | impactWood_light_002.ogg | K-IM | good | |
| place_metal | impactMetal_light_001.ogg + impactPlate_light_000.ogg | K-IM | good | layered, metal top end softened |
| flour_pour | shakingcoffeegrounds01.wav (12.0–13.8 s) | GH | substitute | coffee grounds shaken, band-limited and faded to give a powdery "shhh" |
| water_pour | kitchensink02.wav (10–12 s) | GH | substitute | running kitchen tap, faded in and out |
| mixer_loop | sfx100v2_loop_machine_01.ogg | RD2 | substitute | generic small motor loop, crossfaded seamless (7.2 s) |
| knead_1..3 | slime_16/15/09.ogg + impactPunch_medium_000/003/004.ogg | RDS + K-IM | substitute | real slime squish layered over a low-passed soft slap |
| scraper_cut | kitchencuttingboard01.wav (7.05–7.9 s) | GH | good | real knife chop on a cutting board |
| dough_plop | impactSoft_heavy_000.ogg + slime_04.ogg | K-IM + RDS | substitute | soft thud plus a little squish |
| roll_shape | rolling.ogg | RDL | substitute | generic rolling loop, low-passed, doubled to 1.8 s |
| brush_glaze | card-slide-5.ogg | K-CAS | substitute | card slide pitched down 15% and low-passed to sound like a soft brush stroke |
| oven_open | microwave_door_open.ogg | RD1 | substitute | appliance door pitched down 18% to sound heavier |
| oven_close | microwave_door_close.ogg | RD1 | substitute | same as oven_open |
| oven_loop | airfryer01.wav (20–42 s) + fire.wav | GH + FIRE1 | substitute | air-fryer fan low-passed into a hum, quiet fire crackle on top, 20 s seamless loop |
| timer_ding | bell_ding2.wav | PWL | good | |
| perfect_chime | jingles_STEEL10.ogg | K-JIN | good | rising steel-drum figure |
| good_chime | jingles_PIZZI12.ogg | K-JIN | good | short pizzicato rise |
| fail_soft | jingles_PIZZI07.ogg | K-JIN | good | descending chromatic "wah-wah" on pizzicato |
| burnt_hiss | steam hisses - Marker #1.wav + fire-1.wav | STEAM + FIRE2 | good | |
| coin | handleCoins.ogg | K-RPG | good | |
| register | metalLatch.ogg + bell_01.ogg + snd_purchase_0.wav | K-RPG + RD1 + PURCH | substitute | built from a latch "cha", a bell "ching" and a coin jingle |
| door_bell | bell_03.ogg | RD1 | good | small shaken bell, top end softened |
| footstep_wood_1..4 | footstep_wood_000..003.ogg + sfx100v2_footstep_wood_01..04.ogg | K-IM + RD2 | good | Kenney thud layered with real wood-floor steps for texture |
| paper_bag | paper_02.ogg | RD1 | substitute | paper crinkle |
| cat_meow | cat_softmew.wav | CAT | good | real cat; high-passed and denoised (the source has some room noise) |
| cat_purr | cat_purrsleepy_loop.wav | CAT | good | real purr, crossfaded seamless (5.25 s) |
| sparkle | glass_002.ogg + glass_001.ogg (pitched up) + glass_004.ogg | K-IF | good | three-note glassy twinkle |
| level_up | jingles_STEEL02.ogg | K-JIN | good | rising steel-drum run |
| day_end | jingles_SAX11.ogg | K-JIN | ok | short (0.6 s) descending sax resolution |
| amb_street | park_ambience_birds.wav (40–106 s) + amb_morning.wav | PARK + MORN | substitute | park birdsong plus outdoor morning ambience, 63 s seamless loop. No bicycle bell, and no guarantee of voices |
| amb_kitchen | TheShopCollection_convenience_store_drinks_fridge_drone(_2).wav | SHOP | good | fridge/room drone, low-passed, 44 s seamless loop |
| music_day_1 | chilllofir-loop.ogg | M1 | good | lo-fi jazzy piano, 97 s, seamless loop edit |
| music_day_2 | cozy_puzzle_in-game_1_bpm118_0.ogg | M2 | good | bossa nova (sax, flute, mallets), 130 s, loopable |
| music_menu | bluebonnet_in_b_major_looped_0.ogg | M3 | good | gentle happy piano, 109 s, looped version |
| music_evening | a_small_fire_will_do.wav | M4 | good | calm acoustic guitar, 64 s loop |

