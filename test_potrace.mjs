import { potrace, init } from './node_modules/esm-potrace-wasm/dist/index.js';

async function test() {
    await init();
    // Simulate a 10x10 ImageData with R=G=B=0 and Alpha matching Ink
    // A 4x4 square of ink in the middle
    const width = 10;
    const height = 10;
    const data = new Uint8ClampedArray(width * height * 4);

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const i = (y * width + x) * 4;
            const isInk = (x >= 3 && x <= 6 && y >= 3 && y <= 6);

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

    const svgString = await potrace({ data, width, height }, {
        turdSize: 2,
        alphaMax: 1,
        optCurve: true,
        optTolerance: 0.2,
        blackOnWhite: true
    });

    console.log(svgString);
}

test().catch(console.error);
