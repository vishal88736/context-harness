# Canopy mascot assets

These illustrations follow the user-supplied **Canopy Mascot Concepts** reference sheet. They were prepared with the built-in **image_gen** tool using the supplied sheet as an edit reference and genuine transparent backgrounds. No API-key/CLI fallback was used.

## Files and placement

All production assets live in `public/mascots/` as 768 × 768 WebP images with alpha transparency:

| File         | Character                                    | Placement                                                    |
| ------------ | -------------------------------------------- | ------------------------------------------------------------ |
| `byte.webp`  | Leaf-topped coding robot with a tablet       | Static home hero; compact workspace empty-state illustration |
| `node.webp`  | Sprout-topped pod with orbiting source cards | Home source-selection feature                                |
| `roo.webp`   | Small robot riding a paper plane             | One roaming companion around the home viewport edges         |
| `stack.webp` | Friendly stack of context files              | Home saved-configuration feature                             |
| `codey.webp` | Headphone-wearing cat with a laptop          | Home coding-workspace section                                |

`src/components/CanopyMascot.tsx` supplies fixed image dimensions, decorative semantics, lazy loading, and optional priority loading. `HomePage.tsx` composes the scenes; `home-page.css` controls their compact, responsive layout, and `home-motion.css` adds subtle entrance, chip, and hover motion. The request-inspection feature uses an Eye icon rather than another Byte. `HomeRoamer.tsx` and `home-roamer.css` provide the single moving Roo and its stationary control. `Chat.EmptyWorkspace` adds only Byte, styled by `appearance.css`. Mascots do not appear over workspace messages, code editing, or execution controls, and never indicate that a tool is scanning files or that context was actually sent.

`HomeClosing.tsx` and `home-closing.css` create the **Make room for your next idea** ending using layered paper, a small window, pencil lines, and the existing leaf logo. This illustration is code-native decorative artwork, not an additional mascot or a simulated application state.

The original two-leaf logo remains the application identity. The reference sheet's text, card backgrounds, and provider logos are not embedded in the application.

## Animation and controls

Roo is the single travelling mascot. A 28-second eased CSS loop moves the complete paper-plane illustration around the viewport edges, so it remains visible while scrolling through the home page. Its heading flips at turns, the illustration gently bobs and banks, and a light dashed SVG trail makes the flight direction easier to follow. `HomeRoamer` measures the viewport on mount and resize, including visual-viewport changes; Roo is 148 px on desktop and 104 px on mobile. The fixed decorative layer has `pointer-events: none` and is hidden from assistive technology. The other characters stay still; the animation does not change facial expressions or simulate tool activity.

The hero copy has a brief staggered entrance. Its source, context, and code chips drift by only 5 px on slow loops while retaining their original angles. Fine-pointer layouts add small feature-card lifts and button/arrow hover responses. These effects use transforms and opacity, stay within the landing page, and do not animate the coding workspace.

`HomePage` applies `data-motion="running"` or `"paused"` to the home wrapper. The fixed **Pause Roo / Play Roo** control stores `canopy.homeMotion` as `auto` or `paused` in browser storage and synchronizes changes across tabs. It freezes Roo's route, heading and banking loops together with the ambient hero-chip drift. Document visibility and the OS reduced-motion preference also gate animation. Reduced motion disables the home animations and transitions, hides the flight trail, and shows a disabled **Motion off** control; the page content remains visible. `HomeRoamer` returns no layer or control when the workspace route is active. The workspace Byte has no animation.

The home hero gets eager/high-priority loading only while the home route is visible; Roo loads with priority when mounted on Home. Hidden static home artwork uses lazy/default-priority loading. Decorative hero orbits are bounded at tablet widths; small screens keep the stationary motion control accessible. The closing illustration has a subtle desktop hover response only when the OS permits motion.

## Asset identity

Reference-sheet SHA-256: `d8fb16d7b41251a0c1748c56d61beda870265f892c72143f0ffcfa2904da9c46`.

The committed WebP assets have these SHA-256 checksums:

| Asset        | SHA-256                                                            |
| ------------ | ------------------------------------------------------------------ |
| `byte.webp`  | `9343d1518a0632b7c1645ade2b090bd2b05a25368787d4ff2cf9fbcb72e701f7` |
| `codey.webp` | `dd8fa232d901ee38162f90959e0de1134d79e52913d58dac7030bc13968a7aa0` |
| `node.webp`  | `ab12738260d9a93211771d5243681be85c919387f08da721224db1490f0723c6` |
| `roo.webp`   | `061ecd6a4f61454ef3f06df63c437428c5d630270a20764cc947a23b33208143` |
| `stack.webp` | `dce3c93b52a5eb896bf5c4b02455a39b3ffb0791e2cfbe819444dd6a4ffee8fa` |

## Generation prompt set

Each character used a separate built-in image-generation call, with the same supplied reference sheet and `transparent_background: true`. The shared prompt below replaces `{subject}` with one of the five subject descriptions that follow.

```text
Use case: background-extraction / identity-preserve.
Asset type: transparent website mascot cutout.
Input image: the supplied Canopy mascot concept sheet is the EDIT TARGET and exact character/style reference.
Primary request: isolate only {subject}
Create a clean high-quality single-character cutout faithful to the supplied design. Retain the soft painted 3D/clay illustration finish, subtle brush grain, ivory #F8F8FA, teal #486C77, lavender #DFE2ED, apricot #EEB171, dark navy #2B3A42. The character should be expressive and polished, never flat clipart. Keep the full silhouette completely inside a centered square frame, with generous clear transparent margin on every side, including sprout, ears, tail or plane. Use genuine alpha transparency behind the character and its small accompanying props, suitable on both light and dark web backgrounds. No sheet layout, no background card, no opaque rectangle, no title, no captions, no watermark, no provider logos. Only the requested character; do not include any other mascot. Retain only the code glyph where it is part of this character's tablet/laptop/face. Target approximately 1024 by 1024 pixels.
```

### Byte

```text
BYTE, the character in the FIRST card of the top row: a round ivory coding robot, dark navy faceplate with a crisp white </> glyph, small teal circular ear pieces, a two-leaf teal sprout on the head, compact little feet, holding a dark teal tablet. Preserve this specific design and its proportions.
```

### Codey

```text
CODEY, the character in the SECOND card of the top row: a cream cat with peach inner ears, curved peach-tipped tail, large teal headphones, a dark teal laptop with a white </> glyph. Preserve the specific seated pose, friendly cat face, proportions and design.
```

### Node

```text
NODE, the character in the THIRD card of the top row: an ivory leaf-shaped teardrop pod robot with a navy face and two small ivory eyes, two teal leaves on a slender stalk above its head, small ivory body with teal necktie and little dark legs. It has a delicate curved orbital line and a few small teal code cards and peach file icons around it. Preserve this design.
```

### Stack

```text
STACK, the character in the FOURTH card of the top row: a friendly small stack of ivory and peach paper files inside teal-edged folders, a simple smiling face with navy dot eyes on the front ivory square, small arms and dark legs, a few restrained floating file/code cards behind. Preserve this specific file-stack creature.
```

### Roo

```text
ROO, the character in the FIFTH card of the top row: a small ivory sprout-topped robot with a dark navy oval face, teal round ear pieces, little teal shoes and a friendly pointing pose, riding a folded dark-teal paper airplane. Preserve its specific appearance and the entire paper airplane.
```

## Web encoding

The generated PNG originals remain in the image tool's output directory. The production deliverables are copied into this repository through WebP encoding, without changing the artwork or compositing a background:

```bash
magick original.png -resize '768x768>' -quality 88 \
  -define webp:alpha-quality=100 public/mascots/character.webp
```

The five assets total approximately 280 KiB. `magick identify` confirmed an alpha channel for every production image. Existing assets should be replaced only when their character design is intentionally updated.
