import * as THREE from 'three';

/** Hand-lettered canvas art (chalkboards, price tags, signs) in the bundled handwriting font. */
const HAND = '"Gaegu", "Gowun Dodum", cursive';

export class CanvasArt {
  readonly textures: THREE.CanvasTexture[] = [];
  private readonly painters: Array<() => void> = [];

  chalkboard(title: string, lines: string[], w = 512, h = 640): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    const paint = () => {
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = '#2d3a33';
      ctx.fillRect(0, 0, w, h);
      // Chalk smudge haze.
      for (let i = 0; i < 40; i++) {
        ctx.fillStyle = `rgba(255,255,255,${0.012 + Math.random() * 0.02})`;
        ctx.beginPath();
        ctx.ellipse(Math.random() * w, Math.random() * h, 40 + Math.random() * 90, 20 + Math.random() * 40, Math.random() * 3, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = '#f6efe0';
      ctx.textAlign = 'center';
      ctx.font = `700 ${Math.round(w * 0.13)}px ${HAND}`;
      ctx.fillText(title, w / 2, h * 0.16);
      wheat(ctx, w * 0.5, h * 0.24, w * 0.32, '#e9c46a');
      ctx.font = `400 ${Math.round(w * 0.085)}px ${HAND}`;
      ctx.textAlign = 'left';
      lines.forEach((line, i) => {
        const y = h * 0.38 + i * h * 0.105;
        ctx.fillStyle = i % 2 ? '#f2c9a0' : '#f6efe0';
        const [name, price] = line.split('|');
        ctx.fillText(name, w * 0.1, y);
        if (price) {
          ctx.textAlign = 'right';
          ctx.fillText(price, w * 0.9, y);
          ctx.textAlign = 'left';
          ctx.setLineDash([3, 9]);
          ctx.strokeStyle = 'rgba(246,239,224,0.45)';
          ctx.beginPath();
          ctx.moveTo(w * 0.1 + ctx.measureText(name).width + 10, y - 8);
          ctx.lineTo(w * 0.9 - ctx.measureText(price).width - 10, y - 8);
          ctx.stroke();
          ctx.setLineDash([]);
        }
      });
      // Little doodled bun.
      ctx.strokeStyle = '#f6efe0';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.ellipse(w * 0.78, h * 0.9, 36, 22, 0, Math.PI, 0);
      ctx.lineTo(w * 0.78 + 36, h * 0.9 + 6);
      ctx.lineTo(w * 0.78 - 36, h * 0.9 + 6);
      ctx.closePath();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(w * 0.78 - 12, h * 0.9 - 14);
      ctx.lineTo(w * 0.78 + 12, h * 0.9 - 4);
      ctx.moveTo(w * 0.78 + 12, h * 0.9 - 14);
      ctx.lineTo(w * 0.78 - 12, h * 0.9 - 4);
      ctx.stroke();
      tex.needsUpdate = true;
    };
    paint();
    this.painters.push(paint);
    this.textures.push(tex);
    return tex;
  }

  priceTag(name: string, price: string): THREE.CanvasTexture {
    const w = 256;
    const h = 160;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    const paint = () => {
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = '#fbf3e1';
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = '#c9a26c';
      ctx.lineWidth = 6;
      ctx.strokeRect(6, 6, w - 12, h - 12);
      ctx.fillStyle = '#4a2e22';
      ctx.textAlign = 'center';
      ctx.font = `700 46px ${HAND}`;
      ctx.fillText(name, w / 2, 70);
      ctx.fillStyle = '#b5553a';
      ctx.font = `700 52px ${HAND}`;
      ctx.fillText(price, w / 2, 130);
      tex.needsUpdate = true;
    };
    paint();
    this.painters.push(paint);
    this.textures.push(tex);
    return tex;
  }

  /** Repaint everything once web fonts finish loading. */
  async refreshWhenFontsReady(): Promise<void> {
    try {
      await Promise.all([document.fonts.load('700 40px "Gaegu"'), document.fonts.load('400 40px "Gaegu"')]);
    } catch {
      // Fonts unavailable: canvas keeps the fallback face.
    }
    for (const p of this.painters) p();
  }
}

function wheat(ctx: CanvasRenderingContext2D, x: number, y: number, len: number, color: string): void {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(x - len / 2, y);
  ctx.lineTo(x + len / 2, y);
  ctx.stroke();
  for (let i = 0; i < 7; i++) {
    const px = x - len / 2 + 20 + i * (len / 8);
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(px, y + s * 7, 9, 4, s * 0.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}
