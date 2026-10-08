import './menus.css';
import { t, won, setLang, type Lang } from './i18n';
import type { Settings, DayStats } from '../game/State';
import type { QualityLevel } from '../render/RenderPipeline';

type MenuHandlers = {
  onNew: () => void;
  onContinue: () => void;
  onResume: () => void;
  onToTitle: () => void;
  onQuit: () => void;
  onSettings: (s: Settings) => void;
  onNextDay: () => void;
  onSound: (id: string) => void;
};

function div(cls: string, parent: HTMLElement): HTMLDivElement {
  const d = document.createElement('div');
  d.className = cls;
  parent.appendChild(d);
  return d;
}

export class Menus {
  private readonly title: HTMLDivElement;
  private readonly pause: HTMLDivElement;
  private readonly settings: HTMLDivElement;
  private readonly ledger: HTMLDivElement;
  private readonly clickToPlay: HTMLDivElement;
  readonly fade: HTMLDivElement;
  private settingsReturn: 'title' | 'pause' = 'title';

  constructor(
    root: HTMLElement,
    private readonly h: MenuHandlers,
    private current: Settings,
    private hasSave: () => boolean,
  ) {
    this.title = div('screen title-screen', root);
    this.pause = div('screen dim', root);
    this.settings = div('screen dim', root);
    this.ledger = div('screen dim', root);
    this.clickToPlay = div('click-to-play paper', root);
    this.clickToPlay.style.display = 'none';
    this.fade = div('fade', root);
    this.render();
  }

  private button(label: string, onClick: () => void, parent: HTMLElement, cls = ''): HTMLButtonElement {
    const b = document.createElement('button');
    b.className = `btn ${cls}`;
    b.textContent = label;
    b.addEventListener('mouseenter', () => this.h.onSound('ui_hover'));
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      this.h.onSound('ui_click');
      onClick();
    });
    parent.appendChild(b);
    return b;
  }

  render(): void {
    // Title
    this.title.innerHTML = `<div class="logo"><h1>Hearth <span class="amp">&amp;</span> Crumb</h1><p>골목 끝 작은 빵집</p></div>`;
    const tm = div('menu', this.title);
    const cont = this.button(t('menu.continue'), () => this.h.onContinue(), tm);
    cont.disabled = !this.hasSave();
    this.button(t('menu.start'), () => this.h.onNew(), tm);
    this.button(t('menu.settings'), () => this.openSettings('title'), tm);
    this.button(t('menu.quit'), () => this.h.onQuit(), tm);

    // Pause
    this.pause.innerHTML = '';
    const pc = div('card paper', this.pause);
    pc.innerHTML = `<h2>${t('menu.paused')}</h2>`;
    const pm = div('menu', pc);
    this.button(t('menu.resume'), () => this.h.onResume(), pm, 'center');
    this.button(t('menu.settings'), () => this.openSettings('pause'), pm, 'center');
    this.button(t('menu.title'), () => this.h.onToTitle(), pm, 'center');
    const hint = document.createElement('p');
    hint.style.cssText = 'margin:14px 0 0;font-size:18px;text-align:center;opacity:.8';
    hint.textContent = t('controls.move');
    pc.appendChild(hint);

    this.renderSettings();
    this.clickToPlay.textContent = t('menu.clickToPlay');
  }

  private renderSettings(): void {
    const s = this.current;
    this.settings.innerHTML = '';
    const c = div('card paper', this.settings);
    c.innerHTML = `<h2>${t('menu.settings')}</h2>`;
    const seg = <T extends string>(label: string, options: Array<[T, string]>, value: T, onPick: (v: T) => void) => {
      const r = div('row', c);
      r.innerHTML = `<span>${label}</span>`;
      const sg = div('seg', r);
      for (const [v, name] of options) {
        const b = document.createElement('button');
        b.textContent = name;
        b.className = v === value ? 'on' : '';
        b.addEventListener('click', () => {
          onPick(v);
          this.h.onSound('ui_click');
        });
        sg.appendChild(b);
      }
    };
    const slider = (label: string, value: number, min: number, max: number, onInput: (v: number) => void) => {
      const r = div('row', c);
      r.innerHTML = `<span>${label}</span>`;
      const i = document.createElement('input');
      i.type = 'range';
      i.min = String(min);
      i.max = String(max);
      i.step = '0.01';
      i.value = String(value);
      i.addEventListener('input', () => onInput(Number(i.value)));
      r.appendChild(i);
    };
    seg<QualityLevel>(
      t('set.quality'),
      [
        ['low', t('q.low')],
        ['medium', t('q.medium')],
        ['high', t('q.high')],
        ['ultra', t('q.ultra')],
      ],
      s.quality,
      (v) => this.update({ quality: v }),
    );
    slider(t('set.sens'), s.sensitivity, 0.3, 2.5, (v) => this.update({ sensitivity: v }, false));
    slider(t('set.master'), s.master, 0, 1, (v) => this.update({ master: v }, false));
    slider(t('set.music'), s.music, 0, 1, (v) => this.update({ music: v }, false));
    slider(t('set.sfx'), s.sfx, 0, 1, (v) => this.update({ sfx: v }, false));
    seg<Lang>(
      t('set.lang'),
      [
        ['ko', '한국어'],
        ['en', 'English'],
      ],
      s.lang,
      (v) => {
        setLang(v);
        this.update({ lang: v });
        this.render();
        this.settings.classList.add('show');
      },
    );
    const fm = div('menu', c);
    fm.style.marginTop = '14px';
    this.button(t('set.fullscreen'), () => {
      const desk = (window as unknown as { hearth?: { setFullscreen?: (on: boolean) => void } }).hearth;
      const on = !document.fullscreenElement && !(window.innerHeight === screen.height);
      if (desk?.setFullscreen) desk.setFullscreen(on);
      else if (document.fullscreenElement) void document.exitFullscreen();
      else void document.documentElement.requestFullscreen?.();
    }, fm, 'center');
    this.button(t('set.close'), () => this.closeSettings(), fm, 'center');
  }

  private update(patch: Partial<Settings>, rerender = true): void {
    this.current = { ...this.current, ...patch };
    this.h.onSettings(this.current);
    if (rerender) this.renderSettings();
  }

  private openSettings(from: 'title' | 'pause'): void {
    this.settingsReturn = from;
    this.renderSettings();
    this.settings.classList.add('show');
    this.pause.classList.remove('show');
  }

  private closeSettings(): void {
    this.settings.classList.remove('show');
    if (this.settingsReturn === 'pause') this.pause.classList.add('show');
  }

  showTitle(v: boolean): void {
    if (v) this.render();
    this.title.classList.toggle('show', v);
  }

  showPause(v: boolean): void {
    this.pause.classList.toggle('show', v);
    if (!v) this.settings.classList.remove('show');
  }

  get pauseOpen(): boolean {
    return this.pause.classList.contains('show') || this.settings.classList.contains('show');
  }

  get anyOpen(): boolean {
    return this.pauseOpen || this.title.classList.contains('show') || this.ledger.classList.contains('show');
  }

  showClickToPlay(v: boolean): void {
    this.clickToPlay.style.display = v ? '' : 'none';
  }

  showLedger(day: number, stats: DayStats, reputation: number): void {
    const profit = stats.revenue + stats.tips - stats.costs;
    const full = Math.round(reputation * 2) / 2;
    const stars = '★'.repeat(Math.floor(full)) + (full % 1 ? '½' : '') + '☆'.repeat(5 - Math.ceil(full));
    this.ledger.innerHTML = '';
    const c = div('card paper ledger', this.ledger);
    c.innerHTML = `<h2>${t('hud.day', { n: day })} · ${t('ledger.title')}</h2>
      <table>
        <tr><td>${t('ledger.sold')}</td><td>${stats.sold}</td></tr>
        <tr><td>${t('ledger.revenue')}</td><td>₩${won(stats.revenue)}</td></tr>
        <tr><td>${t('ledger.tips')}</td><td>₩${won(stats.tips)}</td></tr>
        <tr><td>${t('ledger.costs')}</td><td>-₩${won(stats.costs)}</td></tr>
        <tr><td>${t('ledger.happy')}</td><td>${stats.happy} / ${stats.happy + stats.sad}</td></tr>
        <tr><td>${t('ledger.rating')}</td><td class="stars">${stars}</td></tr>
        <tr class="total"><td>${t('ledger.profit')}</td><td>${profit < 0 ? '-' : ''}₩${won(Math.abs(profit))}</td></tr>
      </table>`;
    const m = div('menu', c);
    m.style.marginTop = '16px';
    this.button(t('ledger.next'), () => {
      this.ledger.classList.remove('show');
      this.h.onNextDay();
    }, m, 'center');
    this.ledger.classList.add('show');
  }

  hideAll(): void {
    for (const s of [this.title, this.pause, this.settings, this.ledger]) s.classList.remove('show');
    this.showClickToPlay(false);
  }

  setSettings(s: Settings): void {
    this.current = s;
  }
}
