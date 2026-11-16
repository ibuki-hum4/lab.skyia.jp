// アイコン画像を、ブラウザで正方形に切り抜いて 256px にする。
// サーバーに送る前に小さくするので、元の写真が大きくても通る(サーバーは 256KB まで)。

export const AVATAR_SIZE = 256;
export const AVATAR_MAX_BYTES = 256 * 1024;

/** 切り抜きの位置。zoom は 1 で「短い辺がちょうど枠に入る」大きさ。x と y は枠の中心からのずれ(枠の px) */
export type Crop = { zoom: number; x: number; y: number };

/** 枠(view px 四方)に、画像(w×h)をどの大きさで置くか */
export function drawSize(w: number, h: number, view: number, zoom: number) {
    const scale = (view / Math.min(w, h)) * zoom;
    return { width: w * scale, height: h * scale };
}

/** 枠の外に空きが出ないように、ずれを抑える */
export function clampCrop(w: number, h: number, view: number, crop: Crop): Crop {
    const zoom = Math.min(Math.max(crop.zoom, 1), 4);
    const { width, height } = drawSize(w, h, view, zoom);
    const maxX = (width - view) / 2;
    const maxY = (height - view) / 2;
    return { zoom, x: Math.min(Math.max(crop.x, -maxX), maxX), y: Math.min(Math.max(crop.y, -maxY), maxY) };
}

/** 枠の中身を、canvas(size px 四方)に描く */
export function drawCrop(ctx: CanvasRenderingContext2D, img: CanvasImageSource & { width: number; height: number }, view: number, crop: Crop, size: number) {
    const { width, height } = drawSize(img.width, img.height, view, crop.zoom);
    const k = size / view;
    ctx.imageSmoothingQuality = "high";
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, size, size);
    ctx.drawImage(img, ((view - width) / 2 + crop.x) * k, ((view - height) / 2 + crop.y) * k, width * k, height * k);
}

const toBlob = (canvas: HTMLCanvasElement, type: string, quality?: number) =>
    new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));

/**
 * 256px の画像にする。WebP を作れないブラウザ(toBlob が PNG を返す)では PNG、
 * それでも大きければ JPEG にする。サーバーはこの 3 つを受ける
 */
export async function renderAvatar(img: CanvasImageSource & { width: number; height: number }, view: number, crop: Crop): Promise<Blob> {
    const canvas = document.createElement("canvas");
    canvas.width = AVATAR_SIZE;
    canvas.height = AVATAR_SIZE;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas が使えません");
    drawCrop(ctx, img, view, crop, AVATAR_SIZE);
    for (const [type, quality] of [
        ["image/webp", 0.86],
        ["image/png", undefined],
        ["image/jpeg", 0.86],
    ] as const) {
        const blob = await toBlob(canvas, type, quality);
        if (blob && blob.size <= AVATAR_MAX_BYTES) return blob;
    }
    throw new Error("画像を小さくできませんでした");
}
