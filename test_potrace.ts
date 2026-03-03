import { potrace, init } from 'esm-potrace-wasm';

async function test() {
    await init();
    // Simulate a 10x10 ImageData
    const width = 100;
    const height = 100;
    const data = new Uint8ClampedArray(width * height * 4);

    // Fill with black=0 or white=255
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const i = (y * width + x) * 4;
            const isInk = (x >= 25 && x <= 75 && y >= 25 && y <= 75);

            // Try Black ink on White background
            if (isInk) {
                data[i] = 0;
                data[i + 1] = 0;
                data[i + 2] = 0;
                data[i + 3] = 255;
            } else {
                data[i] = 255;
                data[i + 1] = 255;
                data[i + 2] = 255;
                data[i + 3] = 255;
            }
        }
    }

    console.log("TEST 1: Inky pixels = 0 (Black), Background = 255 (White), options default");
    try {
        const svg1 = await potrace({ data, width, height } as any, {
            turdSize: 2,
            alphaMax: 1,
            optCurve: true,
            optTolerance: 0.2,
            blackOnWhite: true
        });
        console.log(svg1.substring(0, 200) + "...\n");
    } catch (e) { console.error(e); }

    // Test 2: Invert
    const data2 = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const i = (y * width + x) * 4;
            const isInk = (x >= 25 && x <= 75 && y >= 25 && y <= 75);
            if (isInk) {
                data2[i] = 255;
                data2[i + 1] = 255;
                data2[i + 2] = 255;
                data2[i + 3] = 255;
            } else {
                data2[i] = 0;
                data2[i + 1] = 0;
                data2[i + 2] = 0;
                data2[i + 3] = 255;
            }
        }
    }
    console.log("TEST 2: Inky pixels = 255 (White), Background = 0 (Black), options default");
    try {
        const svg2 = await potrace({ data: data2, width, height } as any, {
            turdSize: 2,
            alphaMax: 1,
            optCurve: true,
            optTolerance: 0.2,
            blackOnWhite: true
        });
        console.log(svg2.substring(0, 200) + "...\n");
    } catch (e) { console.error(e); }
}

test();
