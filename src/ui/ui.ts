/** Thin helper over the HTML overlay that sits on top of the canvas. */
export class Ui {
  constructor(readonly root: HTMLElement) {}

  clear(): void {
    this.root.replaceChildren();
  }

  add(className: string, html = ''): HTMLDivElement {
    const el = document.createElement('div');
    el.className = className;
    el.innerHTML = html;
    this.root.appendChild(el);
    return el;
  }
}
