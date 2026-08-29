export interface AverageColor {
    red: number;
    green: number;
    blue: number;
}

export function averagePixelColor(pixels: Uint8ClampedArray): AverageColor | null {
    let red = 0;
    let green = 0;
    let blue = 0;
    let alphaTotal = 0;

    for (let index = 0; index + 3 < pixels.length; index += 4) {
        const alpha = pixels[index + 3] / 255;
        red += pixels[index] * alpha;
        green += pixels[index + 1] * alpha;
        blue += pixels[index + 2] * alpha;
        alphaTotal += alpha;
    }

    if (alphaTotal === 0) {
        return null;
    }
    return {
        red: Math.round(red / alphaTotal),
        green: Math.round(green / alphaTotal),
        blue: Math.round(blue / alphaTotal)
    };
}

export function toCssColor(color: AverageColor): string {
    return `rgb(${color.red}, ${color.green}, ${color.blue})`;
}
