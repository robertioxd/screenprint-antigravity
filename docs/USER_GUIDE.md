# 📖 ScreenPrint Pro — User Guide
**Version**: 2.0  
**Last Updated**: February 2026  
**Audience**: Designers and pre-press operators working with textile screen printing color separation.

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Quick Start Workflow](#2-quick-start-workflow)
3. [Image Upload & Output Size](#3-image-upload--output-size)
4. [Ink Palette Management](#4-ink-palette-management)
5. [Separation Engines](#5-separation-engines)
   - [5.1 Vector (Solid)](#51-vector-solid)
   - [5.2 Raster (Soft / Gradient)](#52-raster-soft--gradient)
6. [Understanding the Gradient System (Raster)](#6-understanding-the-gradient-system-raster)
   - [6.1 How Color Distance Works](#61-how-color-distance-works)
   - [6.2 The Gradient Formula](#62-the-gradient-formula)
   - [6.3 Per-Channel Gradient Overrides](#63-per-channel-gradient-overrides)
   - [6.4 Practical Scenario: Gradient Between Only 2 of 5 Colors](#64-practical-scenario-gradient-between-only-2-of-5-colors)
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

ScreenPrint Pro is a browser-based color separation tool built specifically for **textile screen printing (serigraphy)**. It runs entirely in your browser using a **Python scientific computing engine** (Pyodide) for professional-grade image processing.

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
| **Halftoning** | Custom AM / PIL Floyd-Steinberg | Print-ready dot patterns |
| **AI Analysis** | Google Gemini 2.5 Flash | Automatic configuration suggestions |

---

## 2. Quick Start Workflow

1. **Upload** your design image (PNG, JPG, or PDF)
2. Set **Max Colors** (e.g., 6) and click **Auto** to detect dominant colors
3. Choose your **Separation Engine**: Vector (solid) or Raster (gradient)
4. Click **Run Separation** to generate color channels
5. Optionally click **Apply Bitmaps** to convert to halftone dots
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

### Per-Channel Gradient Controls (Raster Mode Only)
When in **Raster** mode, each color shows a slider icon (⚙). Clicking it reveals three controls per color:

| Control | Range | Default | Description |
|:---|:---|:---|:---|
| **Solidez (Min)** | 0–100 | Auto (0) | The color distance below which ink is **100% solid**. Higher values = larger solid core. |
| **Alcance (Max)** | 5–200 | Auto (60) | The color distance at which ink fades to **0%**. Higher values = wider gradient reach. |
| **Gamma** | 0.1–3.0 | Auto (1.25) | Curve adjustment for the gradient falloff. Values < 1 = more ink in transitions. Values > 1 = less ink, sharper cutoff. |

> [!IMPORTANT]
> These per-channel overrides are the **most powerful tool** for controlling gradients. See [Section 6](#6-understanding-the-gradient-system-raster) for a full explanation.

---

## 5. Separation Engines

### 5.1 Vector (Solid)

**What it does:** Assigns each pixel to exactly ONE color — the closest match in the palette. The result is a flat, solid separation with no gradients.

**Best for:**
- Spot color printing (Pantone inks)
- Designs with flat, distinct areas of color
- Text and logos
- When you need clean, sharp edges

**How it works internally:**
1. For each pixel, the algorithm calculates the distance to every palette color
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

### 5.2 Raster (Soft / Gradient)

**What it does:** Assigns each pixel a **variable opacity** based on its color proximity to each palette color. This creates smooth gradients and soft transitions between colors.

**Best for:**
- Photographic or photorealistic designs
- Simulated process separations
- Designs with blends, shadows, or color transitions
- When you need smooth tonal reproduction

**How it works internally:**
1. For each pixel, the distance to every palette color is calculated
2. The opacity (alpha) of each channel at that pixel is computed using a **proximity × exclusivity** formula
3. Multiple channels can have non-zero alpha at the same pixel, creating overlapping ink zones
4. A gamma curve is applied to control the ink density falloff

**Sub-parameters:**

| Parameter | Range | Default | Description |
|:---|:---|:---|:---|
| **Adaptive Threshold** | On/Off | On | Uses the maximum distance in each chunk as the reference, rather than a fixed global value. Results in better contrast. |
| **Gamma** | 0.1–3.0 | 1.25 | Global gamma for all channels. Controls the overall gradient falloff curve. |

---

## 6. Understanding the Gradient System (Raster)

This is the **heart** of the raster engine and the key to mastering color separation for photographic prints. This section explains exactly how the system decides how much ink to place at each pixel.

### 6.1 How Color Distance Works

Every pixel in your image has an RGB color value. Each color in your palette also has an RGB value. The system measures "how different" a pixel is from each palette color using a **color distance** metric.

```
Pixel Color: (R=120, G=80, B=200)  ← A purple pixel

Palette:
  Color A (Red):    #FF0000  → distance = 210
  Color B (Blue):   #0000FF  → distance = 150
  Color C (Purple): #7733CC  → distance = 25   ← Closest!
  Color D (White):  #FFFFFF  → distance = 220
  Color E (Black):  #000000  → distance = 180
```

The system calculates this distance for **every pixel** against **every palette color**, generating a distance matrix.

### 6.2 The Gradient Formula

For each pixel, the ink opacity of channel `i` is calculated as:

```
alpha = proximity × exclusivity × source_alpha
```

Where:

#### Proximity (How close is this pixel to this color?)
```
proximity = clamp(1.0 - (distance - ch_min) / ch_range, 0, 1)
```
- `distance`: How far this pixel is from palette color `i`
- `ch_min`: The "solidez" value — distances below this are 100% solid
- `ch_range`: `ch_max - ch_min` — the gradient window width
- Result: **1.0** when the pixel is very close (solid ink), **0.0** when far away (no ink)

#### Exclusivity (Is this the dominant color here?)
```
exclusivity = clamp(1.0 - (distance - min_distance) / slope, 0, 1)
```
- `min_distance`: The distance to the **closest** palette color at this pixel
- If this IS the closest color: `distance - min_distance = 0` → exclusivity = 1.0
- If another color is closer: exclusivity drops, reducing ink
- This prevents colors from "bleeding" where they're not dominant

#### Gamma (Curve Adjustment)
```
final_alpha = alpha ^ gamma
```
- `gamma = 1.0`: Linear falloff (no change)
- `gamma > 1.0`: Reduces midtones, sharper transitions, less ink
- `gamma < 1.0`: Boosts midtones, softer transitions, more ink

### Visual Representation

```
Ink Density
100% ███████████
      ██████████ ·
       █████████ · ·
        ████████ · · ·     ← gamma < 1.0 (more ink in transitions)
         ███████ · · · ·
          ██████ · · · · ·
           █████ · · · · · ·
            ████ · · · · · · ·
             ███ · · · · · · · ·
  0%          ██ · · · · · · · · ·
     ──────────────────────────────
     Solid Zone │  Gradient Zone    │ No ink
     (ch_min)   │                   │ (ch_max)
                ├── ch_range ──────┤
```

### 6.3 Per-Channel Gradient Overrides

Each palette color can have its own **Solidez (Min)**, **Alcance (Max)**, and **Gamma** values. This lets you control the gradient behavior of each ink independently.

#### Solidez (Min) — "Solid Zone Width"
- **Low value (0–10):** Only pixels very close to this exact color get solid ink
- **High value (50–100):** A wider range of similar colors get solid ink
- **Use case:** Increase this for colors that need a strong, opaque core (like white underbase)

#### Alcance (Max) — "Gradient Reach"
- **Low value (5–30):** Ink cuts off quickly. Sharp transitions.
- **High value (100–200):** Ink gradually fades over a longer distance. Soft, wide gradients.
- **Use case:** Set high for colors that need to blend into other colors (like skin tones)

#### Gamma — "Curve Shape"
- **0.1–0.9:** Boosts midtones → more ink in transition zones, softer blends
- **1.0:** Linear (no adjustment)
- **1.1–3.0:** Suppresses midtones → less ink in transitions, crisper edges

---

### 6.4 Practical Scenario: Gradient Between Only 2 of 5 Colors

**Problem:** You have a design with 5 colors: Red, Blue, Purple, White, Black. You want a smooth gradient between Red and Blue (through Purple), but you want White and Black to remain **completely solid** with **no gradient**.

**Solution:** Use per-channel gradient overrides to restrict the gradient range.

#### Step-by-Step:

1. **Select Raster mode** in the Separation Engine section

2. **For Red (#FF0000):** Click the slider icon (⚙)
   - Solidez (Min): **10** — Small solid core
   - Alcance (Max): **120** — Wide gradient reach (allows blending with blue)
   - Gamma: **0.80** — Slightly boosted midtones for a smoother gradient

3. **For Blue (#0000FF):** Click the slider icon (⚙)
   - Solidez (Min): **10** — Small solid core
   - Alcance (Max): **120** — Wide gradient reach (allows blending with red)
   - Gamma: **0.80** — Match red's curve

4. **For Purple (#7733CC):** Leave at **Auto**
   - The purple zone naturally lives in the gradient between red and blue. Auto handles this well.

5. **For White (#FFFFFF):** Click the slider icon (⚙)
   - Solidez (Min): **80** — Very wide solid zone
   - Alcance (Max): **5** — Almost no gradient→ hard cutoff
   - Gamma: **2.5** — Aggressively suppress any remaining transitions

6. **For Black (#000000):** Click the slider icon (⚙)
   - Solidez (Min): **80** — Very wide solid zone
   - Alcance (Max): **5** — Almost no gradient → hard cutoff
   - Gamma: **2.5** — Aggressively suppress any remaining transitions

#### What Happens:

```
          Red Zone              Blue Zone
         (gradient)            (gradient)
    ████████▓▓▒▒░░  Purple  ░░▒▒▓▓████████
                    (blend)

    White Zone                  Black Zone
    █████████████               █████████████
    (solid, no                  (solid, no
     gradient)                   gradient)
```

- Red and Blue have wide Alcance values, so their ink fades gradually into each other
- White and Black have very narrow Alcance values and high Gamma, creating sharp solid areas
- Purple, being equidistant from Red and Blue, naturally receives gradient ink from both

> [!TIP]
> If you want to **completely remove** the gradient from a color, set `Solidez (Min) = 100` and `Alcance (Max) = 5`. This essentially makes it behave like Vector mode for that specific color, while keeping the rest in Raster mode.

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
- All `AdvancedConfig` parameters
- Separation type (vector/raster)
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
| `useRasterAdaptive` | Engine | Boolean | — | true | Raster |
| `useSubstrateKnockout` | Substrate | Boolean | — | false | Both |
| `substrateColorHex` | Substrate | Hex | — | #FFFFFF | Both |
| `substrateThreshold` | Substrate | Integer | 10–120 | 50 | Both |
| `cleanupStrength` | Cleanup | Integer | 0–10 | 1 | Both |
| `smoothEdges` | Cleanup | Integer | 0–5 | 0 | Both |
| `minCoverage` | Cleanup | Float | 0–5% | 0.2% | Both |
| `halftoneType` | Halftone | Enum | am / fm | am | Both |
| `halftoneLpi` | Halftone | Integer | 15–150 | 45 | AM only |
| `halftoneAngle` | Halftone | Float | 0–90° | 22.5° | AM only |
| `gamma` | Engine | Float | 0.1–3.0 | 1.25 | Raster |
| `gradientMin` | Per-Channel | Integer | 0–100 | Auto (0) | Raster |
| `gradientMax` | Per-Channel | Integer | 5–200 | Auto (60) | Raster |
| `gamma` (per-ch.) | Per-Channel | Float | 0.1–3.0 | Auto (1.25) | Raster |

---

## 19. Glossary

| Term | Definition |
|:---|:---|
| **AM Halftone** | Amplitude Modulation. Dots of varying **size** at fixed spacing. |
| **FM Halftone** | Frequency Modulation. Dots of fixed size at varying **spacing** (stochastic). |
| **CIEDE2000** | The most advanced color difference formula, designed to match human perception. |
| **CIELAB** | A color space that represents colors as Lightness (L), green-red axis (a), and blue-yellow axis (b). |
| **Delta E (ΔE)** | The numerical value of color difference. ΔE < 1 is imperceptible. ΔE > 10 is obviously different. |
| **K-Means** | A clustering algorithm that groups pixels into a specified number of color clusters. |
| **LPI** | Lines Per Inch. The density of halftone dots. Higher = finer. |
| **Moiré** | An undesired interference pattern caused by overlapping dot screens at conflicting angles. |
| **Morphology** | Image processing operations (opening, closing) that remove noise or fill gaps based on structural elements. |
| **RAG** | Retrieval-Augmented Generation. The AI retrieves past data to improve its suggestions. |
| **RIP** | Raster Image Processor. Software that converts artwork to halftone-ready film output. |
| **Separation** | The process of splitting an image into individual ink channels for screen printing. |
| **Spot Color** | A pre-mixed ink color applied as a single, solid layer. |
| **Substrate** | The material being printed on (t-shirt, paper, plastic). |
| **Trapping** | Slight overlap of adjacent colors to prevent gaps caused by registration errors. |
| **Underbase** | A layer of white ink printed first on dark garments so that top colors appear vibrant. |

---

*ScreenPrint Pro — Precision Pre-press Suite*  
*Powered by Pyodide, OpenCV, scikit-image, and Google Gemini*
