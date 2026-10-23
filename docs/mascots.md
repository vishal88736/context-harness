# Canopy mascot assets

These illustrations follow the user-supplied **Canopy Mascot Concepts** reference sheet. They were prepared with the built-in **image_gen** tool using the supplied sheet as an edit reference and genuine transparent backgrounds. No API-key/CLI fallback was used.

## Files and placement

All production assets live in `public/mascots/` as 768 × 768 WebP images with alpha transparency:

| File         | Character                                    | Placement                                                                 |
| ------------ | -------------------------------------------- | ------------------------------------------------------------------------- |
| `byte.webp`  | Leaf-topped coding robot with a tablet       | Home hero; one compact illustration in the workspace's empty conversation |
| `node.webp`  | Sprout-topped pod with orbiting source cards | Home source-selection feature                                             |
| `roo.webp`   | Small robot riding a paper plane             | Home request-inspection feature                                           |
| `stack.webp` | Friendly stack of context files              | Home saved-configuration feature                                          |
| `codey.webp` | Headphone-wearing cat with a laptop          | Home coding-workspace section                                             |

`src/components/CanopyMascot.tsx` supplies fixed image dimensions, decorative semantics, lazy loading, and optional hero fetch priority. `HomePage.tsx` composes the larger scenes; `home-page.css` controls their layout and reduced-motion behavior. `Chat.EmptyWorkspace` adds only Byte, styled by `appearance.css`. Mascots do not appear over messages, code editing, or execution controls, and never indicate that a tool is scanning files or that context was actually sent.

The original two-leaf logo remains the application identity. The reference sheet's text, card backgrounds, and provider logos are not embedded in the application.

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
