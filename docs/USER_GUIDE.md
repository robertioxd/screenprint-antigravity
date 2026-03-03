# 📖 ScreenPrint Pro — User Guide
**Version**: 3.0  
**Last Updated**: March 2026  
**Audience**: Designers and pre-press operators working with textile screen printing color separation.

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Quick Start Workflow](#2-quick-start-workflow)
3. [Image Upload & Output Size](#3-image-upload--output-size)
4. [Ink Palette Management](#4-ink-palette-management)
5. [Separation Engines](#5-separation-engines)
   - [5.1 Vector (Solid)](#51-vector-solid)
   - [5.2 Raster / Simulated Process (WebGL)](#52-raster--simulated-process-webgl)
6. [Selective Underbase System](#6-selective-underbase-system)
   - [6.1 What is an Underbase?](#61-what-is-an-underbase)
   - [6.2 Selecting Underbase Colors](#62-selecting-underbase-colors)
   - [6.3 Underbase Choke (Erosion)](#63-underbase-choke-erosion)
   - [6.4 Underbase Preview Color](#64-underbase-preview-color)
   - [6.5 How the Underbase is Calculated](#65-how-the-underbase-is-calculated)
7. [Color Distance Methods](#7-color-distance-methods)
8. [Pre-Processing (Denoise)](#8-pre-processing-denoise)
9. [Cleanup & Refinement](#9-cleanup--refinement)
10. [Substrate Knockout](#10-substrate-knockout)
11. [Halftone (Bitmap)](#11-halftone-bitmap)
12. [AI Auto-Config](#12-ai-auto-config)
13. [Train IA (Machine Learning)](#13-train-ia-machine-learning)
14. [Export Options](#14-export-options)
15. [Loadouts (Presets)](#15-loadouts-presets)
16. [Layer Operations (Pro-Shop)](#16-layer-operations-pro-shop)
17. [Keyboard Shortcuts & Tips](#17-keyboard-shortcuts--tips)
18. [Parameter Reference Table](#18-parameter-reference-table)
19. [Glossary](#19-glossary)

---

## 1. System Overview

ScreenPrint Pro is a browser-based color separation tool built specifically for **textile screen printing (serigraphy)**. It features a **dual-engine architecture**: a **Python/Pyodide** engine for precise spot-color vector separations, and a **WebGL GPU-accelerated** engine for real-time simulated process (gradient) separations.

### How It Works (High Level)

```
┌─────────────┐    ┌──────────────┐    ┌───────────────┐    ┌──────────────┐
│ Upload Image │───▶│ Detect Colors│───▶│ Run Separation│───▶│ Apply Bitmap │
│  (PNG/JPG)   │    │  (K-Means)   │    │ (Vector/Rast) │    │  (Halftone)  │
└─────────────┘    └──────────────┘    └───────────────┘    └──────────────┘
                                                                    │
                                              ┌────────────────────┘
                                              ▼
                                       ┌──────────────┐
                                       │ Export (ZIP/  │
                                       │ Composite/PSD)│
                                       └──────────────┘
```

### Technology Stack

| Component | Technology | Purpose |
|:---|:---|:---|
| **Color Science** | scikit-image (CIEDE2000) | Perceptually accurate color distance |
| **Image Processing** | OpenCV + NumPy | Fast pixel manipulation and morphology |
| **Palette Detection** | K-Means (CIELAB space) | Automatic ink color extraction |
| **GPU Separation** | WebGL 2.0 (GLSL ES 3.0) | Real-time simulated process on GPU |
| **Halftoning** | Custom AM / PIL Floyd-Steinberg | Print-ready dot patterns |
| **AI Analysis** | Google Gemini 2.5 Flash | Automatic configuration suggestions |

---

## 2. Quick Start Workflow

1. **Upload** your design image (PNG, JPG, or PDF)
2. Set **Max Colors** (e.g., 6) and click **Auto** to detect dominant colors
3. Choose your **Separation Engine**: Vector (solid) or Simulated Process (gradient)
4. Optionally select colors that need an **Underbase** by clicking the 🔲 layers icon on each color
5. Click **Run Separation** in the **top header bar** to generate color channels
6. Optionally click **Apply Bitmaps** to convert to halftone dots
6. **Export** as ZIP (individual channels) or composite preview

---

## 3. Image Upload & Output Size

### Upload Zone
Accepts PNG, JPG, and PDF files. PDFs are converted to raster using PDF.js. Drag & drop or click to browse.

### Output Size Panel
Controls the final resolution of the processed image. **This is critical for print quality.**

| Parameter | Range | Default | Description |
|:---|:---|:---|:---|
| **DPI** | 72–600 | 300 | Dots Per Inch. Use **300** for standard screen printing. Higher values increase processing time significantly. |
| **Size (inches)** | 1–30 | 3 | The physical size of the output in inches. |
| **Measurement** | Width / Height | Width | Whether the size value refers to width or height of the output. The other dimension is calculated proportionally. |

> [!TIP]
> A 13" × 17" design at 300 DPI = 3900 × 5100 pixels. This is very large and will take 30+ seconds to process. For previewing, use a smaller size (3–5 inches) and only increase for the final export.

---

## 4. Ink Palette Management

The palette defines **which ink colors** will be used for separation. Each color in the palette becomes one separation channel (one screen in printing).

### Auto Detection
- Set the **Max** dropdown to the desired number of colors (2–12)
- Click **Auto** to run **K-Means clustering** in **CIELAB** color space
- The algorithm samples pixels from the image and groups them into the specified number of clusters
- The `sampleSize` parameter (default: 25,000) controls how many pixels are sampled

### Manual Ink Addition
- Use the color picker or type a hex code (e.g., `#FF0000`)
- Click **+** to add the color to the palette
- Manual colors are automatically **locked** (won't be overwritten by Auto)

### Color Editing
- Click on any hex code in the palette to edit it directly
- Colors can be removed with the trash icon
- **Drag and drop** colors to change their order (affects layer stacking)

### Underbase Toggle (All Modes)
Each color now has a **Layers icon** (🔲) button. Clicking it toggles that color as an **Underbase Contributor**. You can select **multiple** colors — the system will generate a composite underbase from all selected colors. See [Section 6](#6-selective-underbase-system) for full details.

### Pantone Matching
Each palette color shows its closest **Pantone Solid Coated** match with an accuracy indicator:
- **Exacta** (ΔE ≤ 2.0): Visually identical
- **Buena** (ΔE 2.0–5.0): Acceptable match
- **Aprox.** (ΔE > 5.0): Approximate, may need manual adjustment

---

## 5. Separation Engines

### 5.1 Vector (Solid)

**What it does:** Assigns each pixel to exactly ONE color — the closest match in the palette. The result is a flat, solid separation with no gradients. Powered by the **Pyodide/Python** engine.

**Best for:**
- Spot color printing (Pantone inks)
- Designs with flat, distinct areas of color
- Text and logos
- When you need clean, sharp edges

**How it works internally:**
1. For each pixel, the algorithm calculates the CIEDE2000 distance to every palette color
2. The pixel is assigned to the **nearest** palette color
3. That channel gets a 255 alpha (fully opaque) at that position
4. All other channels get 0 alpha (transparent)

**Sub-parameters:**

| Parameter | Range | Default | Description |
|:---|:---|:---|:---|
| **Anti-Aliasing** | On/Off | On | Applies a Gaussian blur + threshold to smooth jagged edges |
| **AA Radius (Sigma)** | 0.1–5.0 | 1.0 | How wide the smoothing area is. Higher = smoother but softer |
| **AA Threshold (Cutoff)** | 1–254 | 127 | The brightness threshold for the binary cutoff after blur |

---

### 5.2 Raster / Simulated Process (WebGL)

**What it does:** Runs entirely on the **GPU via WebGL 2.0**. It assigns each pixel a **variable opacity** using a multi-tier blending hierarchy: Singles, Pairs, Triplets, and Quads/IDW (Inverse Distance Weighting). This creates smooth, photographic-quality gradients.

**Best for:**
- Photographic or photorealistic designs
- Simulated process separations (CMYK-style on custom palettes)
- Designs with blends, shadows, or color transitions
- When you need smooth tonal reproduction with fast processing

**How it works internally (GPU Shader):**
1. The shader evaluates every pixel against the full palette in RGB color space
2. It tests increasingly complex blending tiers:
   - **Singles**: Closest single palette color
   - **Pairs**: Best 2-color interpolation (linear projection)
   - **Triplets**: Best 3-color barycentric interpolation
   - **Quads+ / IDW**: Inverse distance weighting using all colors
3. A **Spot Hardness** contrast curve sharpens or softens the weight distribution
4. **Alpha Edge** masking applies transparency-aware blending
5. Channel-specific **Output Levels** (Black/White/Mid points) fine-tune density
6. **Underbase** is computed natively in the shader via Linear Burn compositing

**Sub-parameters:**

| Parameter | Range | Default | Description |
|:---|:---|:---|:---|
| **Spot Hardness** | 0.0–1.0 | 0.50 | Controls weight contrast. **0** = photographic/smooth. **1** = hard/vector-like edges. |
| **Blend Levels** | 4 toggleable tiers | Singles+Pairs+Triplets ON | Enable/disable each blending tier independently. Each tier also has a **tolerance** slider controlling how aggressively it overrides the previous tier. |
| **Fuerza Alpha Edge** | 0.0–1.0 | 1.00 | Strength of the source alpha channel influence. **0** = ignore transparency. **1** = fully respect transparency. |
| **Umbral Alpha** | 0.0–0.10 | 0.05 | Minimum alpha threshold below which pixels are considered fully transparent. |
| **UB Fuerza** | 0.0–2.0 | 1.00 | Multiplier for the underbase intensity. Higher values = denser white base. |
| **UB Gamma** | 0.1–3.0 | 1.50 | Gamma curve for the underbase. Values > 1 suppress light areas of the base. |

#### Pair Matrix (Colinearity Prevention)

When in **Simulated Process** mode with 2+ colors, a **Pair Matrix** appears below the engine selector. This is a triangular grid showing every possible pair of palette colors.

- **Click a cell** to toggle a pair as **blocked** (red X) or **allowed** (green check)
- **Blocked pairs** will never be blended together in the shader's Pairs tier
- Use this to prevent unwanted color mixing (e.g., block Red+Green to avoid muddy brown transitions)
- The system also **auto-detects** colinear pairs (colors on the same RGB line) and blocks them by default

> [!TIP]
> If two colors are producing a muddy or undesirable transition, block their pair in the matrix. The shader will then treat them as separate zones instead of blending them.

---

## 6. Selective Underbase System

The Selective Underbase is a powerful feature for **dark garment printing**. Instead of generating a blanket white base under the entire design, you can choose exactly which colors contribute to the underbase.

### 6.1 What is an Underbase?

An underbase is a layer of ink (usually white) printed **first** on a dark garment. It provides a neutral foundation so that the top colors appear vibrant and opaque. Without it, inks printed directly on a dark shirt will appear dull and transparent.

```
┌─────────────────────────────┐
│      Dark Garment           │  ← Substrate (e.g., black t-shirt)
│  ┌───────────────────────┐  │
│  │  UNDERBASE (White)    │  │  ← Printed FIRST
│  │  ┌─────────────────┐  │  │
│  │  │  COLOR INKS     │  │  │  ← Printed ON TOP of underbase
│  │  └─────────────────┘  │  │
│  └───────────────────────┘  │
└─────────────────────────────┘
```

### 6.2 Selecting Underbase Colors

In the **Palette Manager**, each color has a **Layers icon** (🔲) button. Click it to toggle that color as an underbase contributor.

- You can select **multiple** colors — they are no longer mutually exclusive
- The underbase mask is generated by **OR-ing** (merging) the alpha channels of only the selected colors
- Colors that are **not** selected (e.g., black, background colors) will NOT contribute to the underbase

**Example:** In a 5-color palette (Red, Yellow, Blue, White, Black), you might select Red, Yellow, and Blue as underbase contributors. The generated underbase will cover only the areas where those three colors have ink, leaving the black areas without a white base.

### 6.3 Underbase Choke (Erosion)

Found in **Advanced Settings → Section 4: Underbase (Base Blanca)**.

| Parameter | Range | Default | Description |
|:---|:---|:---|:---|
| **Choke (Erosión interior)** | 0–5 px | 1 px | Shrinks the underbase mask inward by N pixels. Prevents white edges from peeking out due to registration errors. |

- **0 px**: No choke. The underbase exactly matches the ink coverage.
- **1–2 px**: Recommended. Slightly smaller base prevents white halos.
- **3–5 px**: Aggressive choke. Use for designs with thick outlines where registration is loose.

The choke uses **morphological erosion** — iterating a box structuring element to shrink the mask uniformly from all edges.

### 6.4 Underbase Preview Color

Also in **Advanced Settings → Section 4**, next to the Choke slider.

| Parameter | Type | Default | Description |
|:---|:---|:---|:---|
| **Color de Previsualización** | Color Picker | #FFFFFF | The color used to render the underbase layer in the preview and export. |

- Default is **white** (#FFFFFF) for standard white underbases
- Change to **grey** (#AAAAAA) for discharge or water-based underbases
- Change to a **custom color** for specialty base inks

### 6.5 How the Underbase is Calculated

The calculation depends on which engine is active:

**Vector Engine (JS):**
1. Filter all separated layers to only those marked as `isUnderbase`
2. OR all their alpha channels into a single union mask
3. Apply the choke erosion for N iterations
4. Fill the result with the chosen underbase color
5. Insert as Layer 0 (first layer in the stack)

**Raster Engine (WebGL):**
1. The shader marks channels with `u_channelUnderbase[i] == 1`
2. For each pixel, it computes a **Linear Burn** composite of those channels' weights
3. Applies UB Strength, Gamma, and threshold processing
4. The resulting alpha mask is extracted, colored with the chosen hex, and inserted as Layer 0

> [!IMPORTANT]
> The underbase is always **Layer 0** — it prints first. All other color layers print on top of it.

---

## 7. Color Distance Methods

The color distance method determines how "similarity" between colors is calculated.

### CIEDE2000 (Recommended)
- **Perceptually uniform**: A difference of 10 between two blues "looks" the same as a difference of 10 between two reds
- Uses the **CIELAB** color space with corrections for human vision
- Configurable via three weights:
  - **kL** (Lightness): Default 1.0. Increase to make the algorithm more sensitive to brightness differences
  - **kC** (Chroma): Default 1.0. Increase to make it more sensitive to saturation differences
  - **kH** (Hue): Default 1.0. Increase to make it more sensitive to hue shifts
- **Slower** but more accurate

### Euclidean (RGB)
- Simple geometric distance in RGB space: `√((R₁-R₂)² + (G₁-G₂)² + (B₁-B₂)²)`
- **Not** perceptually uniform (blues and greens are treated differently from reds)
- **Faster** processing
- Good for designs with very distinct, well-separated colors

> [!NOTE]
> For most screen printing work, **CIEDE2000** is recommended because it matches how the human eye perceives color differences, resulting in more natural separations.

---

## 8. Pre-Processing (Denoise)

Applied **before** separation to reduce image noise. Uses a **Bilateral Filter** which smooths noise while preserving sharp edges.

| Parameter | Range | Default | Description |
|:---|:---|:---|:---|
| **Intensidad Color (SigmaColor)** | 0–100 | 10 | How aggressively similar colors are blended together. **Low (0–15):** Minimal smoothing, preserves detail. **High (50–100):** Cartoon-like effect, large flat areas. |
| **Espacio (SigmaSpace)** | 0–20 | 5 | How far (in pixels) the filter reaches. **Low (0–5):** Only immediately adjacent pixels. **High (10–20):** Blends over larger areas. |

### When to Use:
- **Photographed artwork**: Set to 15/7 to remove camera noise
- **Clean vector art**: Set to 0/0 (no denoising needed)
- **Textured designs**: Be careful — too much denoising destroys intentional texture

### When NOT to Use:
- If your design already has clean, solid color areas
- If you need to preserve fine detail like fabric texture

---

## 9. Cleanup & Refinement

Applied **after** separation to clean up the generated channels.

| Parameter | Range | Default | Description |
|:---|:---|:---|:---|
| **Limpieza Inteligente** | 0–10 | 1 | Removes small isolated spots and fills small holes using **morphological operations** (Opening + Closing). Scale-aware: adjusts kernel size based on image resolution. **0:** No cleanup. **1–3:** Light cleanup, removes specks. **5–7:** Moderate, removes small artifacts. **8–10:** Aggressive, may affect small details. |
| **Suavizado Bordes** | 0–5 | 0 | Applies a **Gaussian blur** to channel edges to smooth pixelation. **0:** No smoothing. **1–2:** Light anti-aliasing. **3–5:** Noticeably soft edges (may cause ink bleed in printing). |
| **Cobertura Mínima** | 0–5% | 0.2% | Automatically **discards** any channel that covers less than this percentage of the total image area. **0.0%:** Keep all channels. **0.2%:** Remove channels with negligible content. **1–5%:** Aggressively cull channels with little content. |

> [!WARNING]
> Setting **Limpieza Inteligente** above 5 can remove intentional small details like text serifs, thin lines, or stipple patterns. Always preview the result before exporting.

---

## 10. Substrate Knockout

**Purpose:** Removes ink from areas that match the color of the printing surface (e.g., a white t-shirt or colored paper).

**When to use:** When printing on colored substrates where you don't want to print ink that matches the substrate color.

| Parameter | Range | Default | Description |
|:---|:---|:---|:---|
| **Knockout Toggle** | On/Off | Off | Enables/disables substrate knockout |
| **Color Sustrato** | Hex color | #FFFFFF | The color of the garment or paper. Click to pick from a color wheel or type a hex value. |
| **Intensidad** | 10–120 | 50 | How aggressively the knockout removes similar colors. **Low (10–30):** Only removes near-exact matches. **High (80–120):** Removes a wide range of colors similar to the substrate. |

### How It Works:
For each pixel, the system calculates the distance between the pixel color and the substrate color. If the pixel is close to the substrate color, the ink opacity is reduced proportionally.

```
substrate_mask = clamp(1.0 - (pixel_to_substrate_distance / threshold), 0, 1)
final_ink = ink_opacity × (1.0 - substrate_mask)
```

### Example:
- Printing on a **white t-shirt** (`#FFFFFF`)
- All white areas of the design will have their ink removed
- With `Intensidad = 50`, light grays (e.g., `#E0E0E0`) will also be partially knocked out

---

## 11. Halftone (Bitmap)

Converts continuous-tone channels into **print-ready dot patterns**. This is essential for screen printing because screens can only pass ink or block it — there are no "half" amounts.

### AM (Amplitude Modulation) — Dot Pattern
Traditional halftone with **regularly spaced dots** that vary in **size**.

| Parameter | Range | Default | Description |
|:---|:---|:---|:---|
| **LPI (Lines/Inch)** | 15–150 | 45 | The dot frequency. **15–25 LPI:** Very coarse, chunky dots (poster look). **35–55 LPI:** Standard for textile screen printing. **65–85 LPI:** Fine detail (requires high mesh count screens, 230+ mesh). **90–150 LPI:** Photo-quality (requires very fine screens and precise registration). |
| **Ángulo (Degrees)** | 0–90° | 22.5° | The angle of the dot pattern. Using different angles per channel helps avoid **moiré** (interference patterns). Common angles: 0°, 22.5°, 45°, 67.5°. |

### FM (Frequency Modulation) — Stochastic Dithering
Uses **randomly placed same-size dots** (Floyd-Steinberg error diffusion).

- No LPI or angle settings needed
- **Pros:** No moiré patterns, excellent for photographic detail
- **Cons:** Can look "noisy" at low resolutions, harder to print consistently

> [!TIP]
> **For beginners:** Start with AM at 45 LPI, 22.5° angle. This is the most forgiving setting for standard mesh screens (110–156 mesh).

---

## 12. AI Auto-Config

Uses **Google Gemini 2.5 Flash** to analyze your uploaded image and suggest optimal configuration.

### How to Use:
1. Upload an image
2. Open **Configuración Avanzada**
3. Click **✨ AI Auto-Config**
4. A prompt modal appears — you can add specific instructions (e.g., "I'm printing on a dark garment") or leave empty
5. The AI analyzes the image and returns recommended settings

### What the AI Can Suggest:
- Separation type (Vector vs Raster)
- Denoise intensity
- Cleanup strength
- Gamma value
- Halftone LPI and angle
- Substrate knockout settings
- Its reasoning (displayed after analysis)

> [!NOTE]
> The AI uses **RAG (Retrieval-Augmented Generation)** — it references previously saved successful configurations from the `ai_memory` table. The more you train it, the better it gets.

---

## 13. Train IA (Machine Learning)

After completing a successful separation that produces good results, you can save the configuration to train the AI.

### How to Use:
1. Complete a separation that you're satisfied with
2. Click **🧠 Train IA** (appears below "Apply Bitmaps")
3. The current configuration, palette, and image metadata are saved to Supabase

### What Gets Saved:
- All `AdvancedConfig` parameters (including engine-specific ones like blend levels, spot hardness, underbase choke)
- Separation type (vector/raster)
- Blocked pairs count and underbase status
- Image metadata (width, height, number of colors, palette hex values)
- Timestamp

> [!IMPORTANT]
> Only train the AI with **good** results. The AI uses these saved configurations as reference examples for future suggestions. Bad data leads to bad suggestions.

---

## 14. Export Options

Click **Export Results** to see available options:

| Option | Description |
|:---|:---|
| **Save Composite** | Downloads a single PNG showing all channels composited together (print simulation) |
| **Download Channels (ZIP)** | Downloads a ZIP file containing individual PNG files for each separation channel. Each file is named `{index}_{hex_color}.png` |
| **Download PSD** | Downloads a Photoshop file with each channel as a separate layer |
| **Generate PDF Report** | Creates a PDF document with technical specifications and channel previews |

---

## 15. Loadouts (Presets)

Save and load complete configuration presets for different scenarios.

### How to Use:
- **Save**: Enter a name and click save. All current `AdvancedConfig` settings are stored
- **Load**: Select a previously saved loadout to restore all settings
- Requires login (Supabase auth) for cloud-synced loadouts

### Suggested Presets:
| Preset Name | Type | Denoise | Cleanup | LPI | Use Case |
|:---|:---|:---|:---|:---|:---|
| Clean Vector Art | Vector | 0/0 | 2 | — | Logos, text, flat designs |
| Photo Raster | Raster | 15/7 | 1 | 45 | Photographs, gradients |
| Fine Detail | Raster | 5/3 | 0 | 65 | Detailed illustrations |
| Poster Print | Vector | 10/5 | 3 | 25 | Large format, coarse screens |

---

## 16. Layer Operations (Pro-Shop)

After separation, you can manipulate individual channels:

| Operation | Description |
|:---|:---|
| **Visibility Toggle** | Show/hide individual channels in the composite preview |
| **Edit Color** | Change the assigned ink color of a channel |
| **Merge Layers** | Combine two or more channels into one |
| **Chop** | Re-separate a single channel into sub-channels |
| **Delete** | Remove a channel entirely |
| **Reorder (Drag)** | Drag and drop to change the layer stacking order |
| **Undo/Redo** | Full history support for layer operations |

### Layer View Modes:
- **Tinted**: Shows the channel in its ink color
- **Grayscale**: Shows the ink density as black-to-white
- **Film Positive**: Black ink on white background (what the screen film looks like)

---

## 17. Keyboard Shortcuts & Tips

| Shortcut | Action |
|:---|:---|
| **Ctrl+Z** | Undo (layer operations) |
| **Ctrl+Shift+Z** | Redo |
| **F5** | Reload page (after config changes) |

### Pro Tips:
- **Always preview before export.** Toggle layer visibility to inspect individual channels.
- **Use denoise sparingly.** Over-denoising creates a "posterized" look that separates poorly.
- **Match your LPI to your mesh count.** A good rule: LPI ≤ mesh count / 4.
- **Substrate knockout is your friend** when printing on colored garments — it removes unnecessary ink deposits.
- **Use the Pair Matrix** to prevent muddy blends in Simulated Process mode.
- **Run Separation is now in the top bar**, so you can trigger it without scrolling the sidebar.
- **Select multiple underbase colors** for precise control over dark garment printing.

---

## 18. Parameter Reference Table

| Parameter | Location | Type | Range | Default | Mode |
|:---|:---|:---|:---|:---|:---|
| `sampleSize` | Internal | Integer | 1,000–100,000 | 25,000 | Both |
| `inkOpacity` | Visual Opacity | Float | 0–1 | 0.90 | Both |
| `kL` | Internal | Float | 0.1–2.0 | 1.0 | Both |
| `kC` | Internal | Float | 0.1–2.0 | 1.0 | Both |
| `kH` | Internal | Float | 0.1–2.0 | 1.0 | Both |
| `separationMethod` | Engine | Enum | ciede2000 / euclidean | ciede2000 | Both |
| `separationType` | Engine | Enum | vector / raster | vector | Both |
| `outputDpi` | Output Size | Integer | 72–600 | 300 | Both |
| `outputSizeInches` | Output Size | Float | 1–30 | 3 | Both |
| `outputMeasurement` | Output Size | Enum | width / height | width | Both |
| `denoiseStrength` | Pre-Process | Integer | 0–100 | 10 | Both |
| `denoiseSpatial` | Pre-Process | Integer | 0–20 | 5 | Both |
| `useVectorAntiAliasing` | Engine | Boolean | — | true | Vector |
| `vectorAASigma` | Engine | Float | 0.1–5.0 | 1.0 | Vector |
| `vectorAAThreshold` | Engine | Integer | 1–254 | 127 | Vector |
| `spotHardness` | Engine | Float | 0–1 | 0.50 | Raster |
| `blendEnabled` | Engine | Boolean[4] | — | [T,T,T,F] | Raster |
| `blendTolerances` | Engine | Float[4] | 0–0.5 | [0.05,0.03,0.02,0.02] | Raster |
| `alphaStrength` | Engine | Float | 0–1 | 1.00 | Raster |
| `alphaThreshold` | Engine | Float | 0–0.1 | 0.05 | Raster |
| `ubStrength` | Underbase | Float | 0–2 | 1.00 | Raster |
| `ubGamma` | Underbase | Float | 0.1–3.0 | 1.50 | Raster |
| `underbaseChoke` | Underbase | Integer | 0–5 px | 1 | Both |
| `underbaseColorHex` | Underbase | Hex | — | #FFFFFF | Both |
| `useSubstrateKnockout` | Substrate | Boolean | — | false | Both |
| `substrateColorHex` | Substrate | Hex | — | #FFFFFF | Both |
| `substrateThreshold` | Substrate | Integer | 10–120 | 50 | Both |
| `cleanupStrength` | Cleanup | Integer | 0–30 | 1 | Both |
| `smoothEdges` | Cleanup | Integer | 0–15 | 0 | Both |
| `minCoverage` | Cleanup | Float | 0–5% | 0.2% | Both |
| `halftoneType` | Halftone | Enum | am / fm | am | Both |
| `halftoneLpi` | Halftone | Integer | 15–150 | 45 | AM only |
| `halftoneAngle` | Halftone | Float | 0–90° | 22.5° | AM only |
| `gamma` | Engine | Float | 0.1–3.0 | 1.25 | Both |

---

## 19. Glossary

| Term | Definition |
|:---|:---|
| **AM Halftone** | Amplitude Modulation. Dots of varying **size** at fixed spacing. |
| **Choke** | Morphological erosion that shrinks a mask inward to prevent white edges from peeking out. |
| **CIEDE2000** | The most advanced color difference formula, designed to match human perception. |
| **CIELAB** | A color space that represents colors as Lightness (L), green-red axis (a), and blue-yellow axis (b). |
| **Colinearity** | When palette colors lie on the same RGB line, which can cause blending artifacts. Blocked via the Pair Matrix. |
| **Delta E (ΔE)** | The numerical value of color difference. ΔE < 1 is imperceptible. ΔE > 10 is obviously different. |
| **FM Halftone** | Frequency Modulation. Dots of fixed size at varying **spacing** (stochastic). |
| **IDW** | Inverse Distance Weighting. A blending fallback that weighs all colors by their inverse distance. |
| **K-Means** | A clustering algorithm that groups pixels into a specified number of color clusters. |
| **Linear Burn** | A blending mode used to composite underbase values: `result = max(0, 1 - ink_weight)`. |
| **LPI** | Lines Per Inch. The density of halftone dots. Higher = finer. |
| **Moiré** | An undesired interference pattern caused by overlapping dot screens at conflicting angles. |
| **Morphology** | Image processing operations (opening, closing, erosion) that modify shape edges. |
| **Pair Matrix** | A UI grid in Raster mode to block specific color pairs from blending. |
| **RAG** | Retrieval-Augmented Generation. The AI retrieves past data to improve its suggestions. |
| **RIP** | Raster Image Processor. Software that converts artwork to halftone-ready film output. |
| **Selective Underbase** | A system where the user chooses which specific colors contribute to the underbase layer. |
| **Separation** | The process of splitting an image into individual ink channels for screen printing. |
| **Spot Color** | A pre-mixed ink color applied as a single, solid layer. |
| **Spot Hardness** | A contrast curve applied to blending weights. Higher = sharper, more vector-like edges. |
| **Substrate** | The material being printed on (t-shirt, paper, plastic). |
| **Trapping** | Slight overlap of adjacent colors to prevent gaps caused by registration errors. |
| **Underbase** | A layer of ink (usually white) printed first on dark garments so that top colors appear vibrant. |
| **WebGL** | A JavaScript API for GPU-accelerated rendering in the browser. Used by the Raster engine. |

---

*ScreenPrint Pro — Precision Pre-press Suite*  
*Powered by Pyodide, OpenCV, scikit-image, WebGL 2.0, and Google Gemini*
