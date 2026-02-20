# Adobe Export Standards for Screen Printing

This document outlines the technical specifications required to generate color separation files that are fully editable and professional-grade for Adobe Photoshop (Raster) and Adobe Illustrator (Vector).

## 1. Adobe Photoshop (Raster Separations)

**Target Goal:** A file where each ink color is on its own **Spot Channel**, not a CMYK/RGB layer. This allows the printer to output films directly and adjust ink opacity/solidity.

### Minimum File Requirements
| Feature | Requirement | Reason |
| :--- | :--- | :--- |
| **Resolution** | **300 DPI** (min) at actual print size | Prevents pixelation on films. Ideal is 600 DPI or matching the RIP LPI multiplier (e.g., 45 LPI * 10 = 450 DPI). |
| **Color Mode** | **Multichannel** (preferred) or RGB with Spot Channels | Multichannel mode is the industry standard for separations. RGB files with Spot Channels are acceptable but heavier. |
| **Channels** | **Spot Channels** (not Alpha) | Each channel must be defined as a "Spot Color" with a specific Pantone name (e.g., "PANTONE 186 C") and solidity value. |
| **Underbase** | Explicit **White Underbase** channel | Required for dark adjustments. Must be the bottom-most channel in print order. |
| **Format** | **.PSD** or **.DCS 2.0 (.EPS)** | PSD is standard. DCS 2.0 is legacy but robust for RIPs. **TIFF** also supports channels but is less "editable" for layers. |

### Technical Challenges (Client-Side)
- **Library Limitations:** The primary browser library, `ag-psd`, **does not support writing Spot Channels** or Multichannel mode. It only supports RGB/RGBA.
- **Workaround:** We can export a ZIP file containing individual Grayscale PNGs for each channel. The user must manually combine them in Photoshop (`Merge Channels`).
- **Professional Solution:** Requires **Server-Side Generation** (Python `psd-tools` or `Pillow`) to create a true `.psd` with spot channels.

---

## 2. Adobe Illustrator (Vector Separations)

**Target Goal:** A vector file where each color is grouped or layered separately, using global Swatches or Spot Colors.

### Minimum File Requirements
| Feature | Requirement | Reason |
| :--- | :--- | :--- |
| **Format** | **.AI**, **.PDF**, or **.SVG** | SVG is web-native but Illustrator import behavior is inconsistent. PDF/AI is preferred for print. |
| **Color Definition** | **Spot Colors** | Objects must use a color definition that the RIP recognizes as a separate plate (not CMYK breakdown). |
| **Structure** | **Layers** (Explicit) | Each ink color generally needs its own Layer (e.g., "Layer 1 - White Base", "Layer 2 - Red"). |
| **Objects** | **Clean Paths** | No unexpanded strokes or non-native filters. Compound paths for cutouts. |

### Technical Challenges (Client-Side)
- **SVG Import:** Illustrator imports SVG generic `<g>` groups as sub-groups, not Top-Level Layers. User must perform "Release to Layers" manually.
- **Spot Colors in SVG:** SVG spec does not natively support "Spot Colors" in a way Illustrator automatically recognizes as Swatches without custom metadata hacking.
- **PDF Generation:** Client-side `jspdf` does not support **Layers (OCG)** or Spot Colors natively.

---

## 3. Recommended Implementation Strategy

Given the limitations of browser-based JavaScript, generating "One-Click Editable" files requires a hybrid or server-side approach.

### Strategy A: The "Pro Package" (Recommended)
Use a **Supabase Edge Function** (Python/Node) to generate the binary files.
1.  **Frontend:** Sends separation data (RLE or Base64 masks) + Color Config to Edge Function.
2.  **Backend (Python):** 
    - Uses `psd-tools` to write a true Multichannel PSD with Spot Channels.
    - Uses `reportlab` or specific PDF libs to write a Layered PDF.
3.  **Result:** Returns a download URL for a `.psd` or `.pdf` that works perfectly instantly.

### Strategy B: The "Manual Kit" (Client-Side Fallback)
If server-side is too complex/costly initially:
1.  **Raster:** Download a `.zip` containing:
    - `01_Underbase.png`
    - `02_Red.png`
    - `03_Blue.png`
    - `instructions_photoshop.txt` (Explaining how to merge).
2.  **Vector:** Download an `.svg` optimized with named groups.
    - User opens in Illustrator -> "Object > Ungroup" -> Select by Name -> Move to Layer.

## 4. Next Steps
1.  **Prototype Strategy A**: Create a proof-of-concept Python script to write a PSD with 1 Spot Channel.
2.  **Verify Compatibility**: Open generated file in Photoshop to confirm Spot Channel behavior.
