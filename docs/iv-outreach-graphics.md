# IV Outreach original graphics

Created November 12, 2026 using OpenAI's built-in `image_gen.imagegen` tool. Four separate generations, one selected output per prompt; no CLI or external image provider. The installed IV Studio illustration `src/renderer/src/assets/iv-eye.webp` was inspected first and supplied as a **style reference only**, at Matthew's request. The generated compositions are specific to outreach, discovery, review and replies.

All original PNG outputs were copied byte-for-byte into the renderer assets directory. No code edits, image compositing, cropping, recoloring or format conversion were applied to the generated image files. Presentation uses CSS sizing and background positioning. All four outputs were visually inspected for palette, composition, correct outreach subject matter and absence of in-image text.

## Files and prompts

### outreach-hero-v1.png

Workspace: `C:/Users/Matthew/Desktop/fitscout/src/renderer/src/assets/outreach-hero-v1.png`

Generated original: `C:/Users/Matthew/.codex/generated_images/01a1d131-4ee9-7f60-901b-7b5b74ee6f09/exec-378cdbcf-baae-4edc-89e3-26aa7fd60572.png`

Exact prompt:

```text
Create an ORIGINAL editorial illustration for IV Outreach, a desktop app for discovering businesses and starting thoughtful conversations. Use the attached image ONLY as a visual style reference: its dark charcoal, coral-red and cream printmaking palette, intricate etched contours and subtle screen-print grain. Do not copy its composition or eye drawing.

Wide panoramic 16:9 illustration, no typography or text. Deep near-black charcoal #100c0e fills the background. An expressive engraved human eye occupies the RIGHT THIRD, surveying a constellation of small abstract business/contact cards and cream contact nodes around the outer edges. Flowing coral #f44859 directional ribbons travel between these nodes, with two very small envelope silhouettes integrated naturally into the lines. The eye and network are an original, sophisticated outreach/discovery motif. Fine warm-cream incised highlights, coral and dark burgundy contour bands, restrained stippling and tactile ink texture. Leave the center and left-center TWO THIRDS mostly dark and quiet for a large headline and search bar; concentrate detail at the upper right and lower outer edges. No readable marks, no lettering, no numbers, no logos, no film reels, cameras or cinematic imagery. Flat graphic illustration, extremely polished, energetic but purposeful, matching a premium dark desktop application. Fill the canvas, no border or mockup.
```

### outreach-discovery-v1.png

Workspace: `C:/Users/Matthew/Desktop/fitscout/src/renderer/src/assets/outreach-discovery-v1.png`

Generated original: `C:/Users/Matthew/.codex/generated_images/01a1d131-4ee9-7f60-901b-7b5b74ee6f09/exec-0f4e751c-3d4f-4445-b1e4-4ad142682596.png`

Exact prompt:

```text
Create an ORIGINAL square editorial illustration for the empty Leads page of IV Outreach, a business discovery app. Attached image is visual STYLE reference only: coral-red and cream engraving, flowing contour lines, ink grain, near-black charcoal. Make an entirely new composition, not a copy.

A single curious engraved eye looking across three floating business contact cards, each with a tiny abstract storefront or person silhouette and simple blank horizontal rules that are NOT text. A thin coral connection ribbon winds between the cards like a deliberate path of discovery, with three small cream nodes. Compact balanced centered composition, clear silhouette when displayed at 180 pixels. Deep charcoal #100c0e background, coral #f44859 primary ink, restrained warm cream etched highlights, burgundy secondary shadows. Hand-engraved fine linework and subtle tactile screenprint texture, elegant psychedelic editorial printmaking in a modern app. Leave some quiet dark padding around the composition. Square 1:1. No typography, no letters, no numbers, no logo, no film or camera imagery, no mockup, no border.
```

### outreach-approval-v1.png

Workspace: `C:/Users/Matthew/Desktop/fitscout/src/renderer/src/assets/outreach-approval-v1.png`

Generated original: `C:/Users/Matthew/.codex/generated_images/01a1d131-4ee9-7f60-901b-7b5b74ee6f09/exec-c50d6d2e-e127-4e18-b81d-dc71c8fb1f25.png`

Exact prompt:

```text
Create an ORIGINAL square editorial illustration for the message review page of IV Outreach, a business outreach desktop app. Use the attached image ONLY for style: near-black charcoal, coral and cream engraved contours, flowing ribbons and tactile ink grain. Create a new composition.

A calm engraved eye in the upper-left carefully reviewing ONE folded outgoing note or open envelope in the lower-right, with blank abstract rules on its paper, no readable text. A single coral ribbon arcs between eye and note; a small understated cream check mark sits beside the note, communicating thoughtful approval before sending. Compact centered balanced composition, generous dark breathing room, legible as a 180px app illustration. Deep charcoal #100c0e ground, coral #f44859 primary ink, warm cream incised highlights and burgundy shading. Sophisticated hand-etched printmaking, intricate but controlled lines, subtle stippling, surreal flowing contours. Square 1:1, no typography, no letters, no words, no numbers, no logo, no cameras or film imagery, no mockup, no frame.
```

### outreach-conversation-v1.png

Workspace: `C:/Users/Matthew/Desktop/fitscout/src/renderer/src/assets/outreach-conversation-v1.png`

Generated original: `C:/Users/Matthew/.codex/generated_images/01a1d131-4ee9-7f60-901b-7b5b74ee6f09/exec-620daf66-3508-45fb-82ff-433dd24f6e44.png`

Exact prompt:

```text
Create an ORIGINAL square editorial illustration for the conversations page of IV Outreach, a business outreach desktop application. Attached image is STYLE reference only: coral and cream engraved linework, near-black charcoal, surreal flowing contours and tactile ink grain. Do not reproduce its composition.

Two interlocking flowing conversation ribbons form a balanced dialogue loop: each ribbon widens into a subtle speech-bubble shape with one small expressive engraved eye inside, the eyes facing each other. The two ribbons exchange a small cream reply spark between them. Make the motif feel like listening and thoughtful human replies, not surveillance. Compact centered composition with quiet dark padding, strong readable silhouette at 180px. Deep charcoal #100c0e background, coral #f44859 primary ink, limited warm cream highlights, burgundy shaded contours, fine hand-etched hatching and understated stipple texture. Elegant contemporary printmaking, premium and purposeful, square 1:1. No typography, no letters, no words, no numbers, no logo, no movie or camera imagery, no mockup, no frame.
```

## Integration

- Hero art: dashboard background and subtle sidebar decoration.
- Discovery art: Leads empty state.
- Approval art: Approve empty state.
- Conversation art: Social empty state.
- Infinite Variance brand mark and licensed local fonts remain shared with IV Studio; the illustrations above provide IV Outreach's distinct visual identity.

## Validation

- `npm.cmd run build` passed and includes all four generated PNG assets.
- `node scripts/ui-empty.mjs docs/verification/iv-outreach-original-art` passed with zero renderer errors (the local Electron test required launching outside the filesystem sandbox).
- The dashboard screenshot `docs/verification/iv-outreach-original-art/0-welcome.png` was visually inspected: the new hero, eye detail, copy and search remain readable at 1440 x 900 with chat open.
- All four full-resolution generated images were visually inspected directly in the built-in tool output.

