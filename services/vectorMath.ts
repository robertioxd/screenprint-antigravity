export class VectorMath {
    static colorDistance3D(a: { r: number, g: number, b: number }, b: { r: number, g: number, b: number }): number {
        const dr = a.r - b.r;
        const dg = a.g - b.g;
        const db = a.b - b.b;
        return Math.sqrt(dr * dr + dg * dg + db * db);
    }

    static distanceToLineSegment(point: { r: number, g: number, b: number }, a: { r: number, g: number, b: number }, b: { r: number, g: number, b: number }): number {
        const ab = { r: b.r - a.r, g: b.g - a.g, b: b.b - a.b };
        const ap = { r: point.r - a.r, g: point.g - a.g, b: point.b - a.b };

        const ab2 = ab.r * ab.r + ab.g * ab.g + ab.b * ab.b;
        if (ab2 === 0) return this.colorDistance3D(point, a);

        let t = (ap.r * ab.r + ap.g * ab.g + ap.b * ab.b) / ab2;
        t = Math.max(0, Math.min(1, t));

        const proj = {
            r: a.r + t * ab.r,
            g: a.g + t * ab.g,
            b: a.b + t * ab.b
        };

        return this.colorDistance3D(point, proj);
    }

    static distanceToTriangle(point: { r: number, g: number, b: number }, a: { r: number, g: number, b: number }, b: { r: number, g: number, b: number }, c: { r: number, g: number, b: number }): number {
        const ab = { r: b.r - a.r, g: b.g - a.g, b: b.b - a.b };
        const ac = { r: c.r - a.r, g: c.g - a.g, b: c.b - a.b };
        const ap = { r: point.r - a.r, g: point.g - a.g, b: point.b - a.b };

        const d00 = ab.r * ab.r + ab.g * ab.g + ab.b * ab.b;
        const d01 = ab.r * ac.r + ab.g * ac.g + ab.b * ac.b;
        const d11 = ac.r * ac.r + ac.g * ac.g + ac.b * ac.b;
        const d20 = ap.r * ab.r + ap.g * ab.g + ap.b * ab.b;
        const d21 = ap.r * ac.r + ap.g * ac.g + ap.b * ac.b;

        const denom = d00 * d11 - d01 * d01;
        if (Math.abs(denom) < 0.000001) {
            return Math.min(
                this.distanceToLineSegment(point, a, b),
                this.distanceToLineSegment(point, b, c),
                this.distanceToLineSegment(point, a, c)
            );
        }

        let v = (d11 * d20 - d01 * d21) / denom;
        let w = (d00 * d21 - d01 * d20) / denom;
        let u = 1.0 - v - w;

        if (u >= 0 && v >= 0 && w >= 0) {
            const proj = {
                r: a.r * u + b.r * v + c.r * w,
                g: a.g * u + b.g * v + c.g * w,
                b: a.b * u + b.b * v + c.b * w
            };
            return this.colorDistance3D(point, proj);
        }

        return Math.min(
            this.distanceToLineSegment(point, a, b),
            this.distanceToLineSegment(point, b, c),
            this.distanceToLineSegment(point, a, c)
        );
    }

    static distanceToConvexHull(point: { r: number, g: number, b: number }, vertices: { r: number, g: number, b: number }[]): number {
        if (vertices.length === 0) return 999;
        if (vertices.length === 1) return this.colorDistance3D(point, vertices[0]);
        if (vertices.length === 2) return this.distanceToLineSegment(point, vertices[0], vertices[1]);
        if (vertices.length === 3) return this.distanceToTriangle(point, vertices[0], vertices[1], vertices[2]);

        let minDist = 999999;
        for (let i = 0; i < vertices.length; i++) {
            for (let j = i + 1; j < vertices.length; j++) {
                for (let k = j + 1; k < vertices.length; k++) {
                    const dist = this.distanceToTriangle(point, vertices[i], vertices[j], vertices[k]);
                    if (dist < minDist) minDist = dist;
                }
            }
        }
        return minDist;
    }
}
