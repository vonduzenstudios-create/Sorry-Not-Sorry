import * as THREE from 'three';

export type Expression = 'neutral' | 'happy' | 'sad' | 'surprised' | 'determined';

export type FaceStyle = 'human' | 'robot';

export interface FaceOptions {
  style: FaceStyle;
  /** Eye/iris color for humans, glow color for the robot screen. */
  eyeColor: string;
  lashes?: boolean;
  /** Robot screen background. */
  screen?: string;
}

const SIZE = 256;

/**
 * A face painted on a canvas texture. Expressions and blinks are redrawn on
 * demand, so faces need no image files and can react every frame.
 */
export class Face {
  readonly texture: THREE.CanvasTexture;
  private ctx: CanvasRenderingContext2D;
  private expression: Expression = 'neutral';
  private blinking = false;
  private blinkTimer = 2 + Math.random() * 2;

  constructor(private opts: FaceOptions) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = SIZE;
    this.ctx = canvas.getContext('2d')!;
    this.texture = new THREE.CanvasTexture(canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.draw();
  }

  set(expression: Expression): void {
    if (expression === this.expression) return;
    this.expression = expression;
    this.draw();
  }

  get current(): Expression {
    return this.expression;
  }

  update(dt: number): void {
    this.blinkTimer -= dt;
    if (!this.blinking && this.blinkTimer <= 0) {
      this.blinking = true;
      this.blinkTimer = 0.12;
      this.draw();
    } else if (this.blinking && this.blinkTimer <= 0) {
      this.blinking = false;
      this.blinkTimer = 2 + Math.random() * 3;
      this.draw();
    }
  }

  private draw(): void {
    const g = this.ctx;
    g.clearRect(0, 0, SIZE, SIZE);
    if (this.opts.style === 'robot') this.drawRobot(g);
    else this.drawHuman(g);
    this.texture.needsUpdate = true;
  }

  private drawHuman(g: CanvasRenderingContext2D): void {
    const ink = '#2b2440';
    const e = this.expression;
    const eyeY = 118;
    const eyeDx = 46;
    g.lineCap = 'round';
    g.lineJoin = 'round';

    for (const side of [-1, 1]) {
      const x = 128 + side * eyeDx;
      if (this.blinking || e === 'happy') {
        // Closed or smiling eyes are a single curved stroke.
        g.strokeStyle = ink;
        g.lineWidth = 9;
        g.beginPath();
        if (e === 'happy') g.arc(x, eyeY + 8, 17, Math.PI * 1.15, Math.PI * 1.85);
        else g.arc(x, eyeY - 4, 18, Math.PI * 0.15, Math.PI * 0.85);
        g.stroke();
      } else {
        const h = e === 'surprised' ? 30 : 25;
        g.fillStyle = '#ffffff';
        g.beginPath();
        g.ellipse(x, eyeY, 17, h, 0, 0, Math.PI * 2);
        g.fill();
        g.strokeStyle = ink;
        g.lineWidth = 5;
        g.stroke();
        g.fillStyle = this.opts.eyeColor;
        g.beginPath();
        g.ellipse(x + side * 1, eyeY + 4, 11, e === 'surprised' ? 13 : 16, 0, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = ink;
        g.beginPath();
        g.ellipse(x + side * 1, eyeY + 5, 6, 9, 0, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = '#ffffff';
        g.beginPath();
        g.arc(x - 4, eyeY - 4, 4, 0, Math.PI * 2);
        g.fill();
      }
      if (this.opts.lashes && !this.blinking) {
        g.strokeStyle = ink;
        g.lineWidth = 5;
        g.beginPath();
        g.moveTo(x + side * 14, eyeY - 18);
        g.lineTo(x + side * 24, eyeY - 26);
        g.stroke();
      }

      // Brows set the mood more than anything else.
      g.strokeStyle = ink;
      g.lineWidth = 8;
      g.beginPath();
      const by = eyeY - 40;
      if (e === 'sad') {
        g.moveTo(x - side * 16, by - 8);
        g.lineTo(x + side * 14, by + 4);
      } else if (e === 'determined') {
        g.moveTo(x - side * 16, by + 6);
        g.lineTo(x + side * 16, by - 6);
      } else if (e === 'surprised') {
        g.arc(x, by + 2, 16, Math.PI * 1.2, Math.PI * 1.8);
      } else {
        g.moveTo(x - 15, by);
        g.quadraticCurveTo(x, by - 7, x + 15, by);
      }
      g.stroke();
    }

    // Blush.
    g.fillStyle = 'rgba(255, 120, 140, 0.35)';
    for (const side of [-1, 1]) {
      g.beginPath();
      g.ellipse(128 + side * 70, 160, 16, 9, 0, 0, Math.PI * 2);
      g.fill();
    }

    // Mouth.
    g.strokeStyle = ink;
    g.fillStyle = '#7a2d3d';
    g.lineWidth = 7;
    g.beginPath();
    const my = 176;
    switch (e) {
      case 'happy':
        g.moveTo(104, my - 6);
        g.quadraticCurveTo(128, my + 34, 152, my - 6);
        g.closePath();
        g.fill();
        g.stroke();
        break;
      case 'sad':
        g.moveTo(110, my + 10);
        g.quadraticCurveTo(128, my - 6, 146, my + 10);
        g.stroke();
        break;
      case 'surprised':
        g.ellipse(128, my + 4, 11, 15, 0, 0, Math.PI * 2);
        g.fill();
        g.stroke();
        break;
      case 'determined':
        g.moveTo(112, my + 2);
        g.lineTo(144, my - 2);
        g.stroke();
        break;
      default:
        g.moveTo(112, my);
        g.quadraticCurveTo(128, my + 12, 144, my);
        g.stroke();
    }
  }

  private drawRobot(g: CanvasRenderingContext2D): void {
    const e = this.expression;
    g.fillStyle = this.opts.screen ?? '#2b2440';
    roundRect(g, 8, 28, 240, 200, 48);
    g.fill();

    g.fillStyle = this.opts.eyeColor;
    g.strokeStyle = this.opts.eyeColor;
    g.shadowColor = this.opts.eyeColor;
    g.shadowBlur = 18;
    g.lineCap = 'round';
    g.lineWidth = 14;
    for (const side of [-1, 1]) {
      const x = 128 + side * 52;
      const y = 112;
      g.beginPath();
      if (this.blinking) {
        g.moveTo(x - 20, y);
        g.lineTo(x + 20, y);
        g.stroke();
      } else if (e === 'happy') {
        g.arc(x, y + 10, 20, Math.PI * 1.1, Math.PI * 1.9);
        g.stroke();
      } else if (e === 'sad') {
        g.arc(x, y - 14, 20, Math.PI * 0.15, Math.PI * 0.85);
        g.stroke();
      } else if (e === 'determined') {
        g.moveTo(x - 20, y - side * 8 * -1 - 6);
        g.lineTo(x + 20, y + side * 8 * -1 - 6);
        g.stroke();
        g.fillRect(x - 10, y, 20, 18);
      } else {
        const r = e === 'surprised' ? 22 : 17;
        g.arc(x, y, r, 0, Math.PI * 2);
        g.fill();
      }
    }
    g.beginPath();
    g.lineWidth = 10;
    if (e === 'happy') {
      g.arc(128, 160, 26, Math.PI * 0.15, Math.PI * 0.85);
    } else if (e === 'sad') {
      g.arc(128, 190, 24, Math.PI * 1.2, Math.PI * 1.8);
    } else if (e === 'surprised') {
      g.arc(128, 172, 12, 0, Math.PI * 2);
    } else {
      // Little equalizer-bar mouth.
      for (let i = 0; i < 5; i++) {
        const h = e === 'determined' ? 6 : 6 + (i % 2) * 8;
        g.fillRect(100 + i * 12, 172 - h / 2, 7, h);
      }
    }
    g.stroke();
    g.shadowBlur = 0;
  }
}

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}
