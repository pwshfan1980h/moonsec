import type Phaser from 'phaser';
import type { GameScene } from '../scenes/GameScene';

/** Opt-in local QA controls. Vite removes the import from production builds. */
export function mountPlaytest(game: Phaser.Game): void {
  const panel = document.createElement('aside');
  panel.setAttribute('aria-label', 'Development playtest');
  panel.style.cssText = 'position:fixed;top:8px;left:8px;right:8px;z-index:5;background:#0b1e2a;color:#bfeeff;padding:10px;font:12px monospace;display:flex;gap:8px;flex-wrap:wrap';
  const readout = document.createElement('output');
  readout.style.cssText = 'width:100%;white-space:pre-wrap';
  const hold = (key: string, code: string, keyCode: number, duration = 160) => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key, code, keyCode, which: keyCode, bubbles: true }));
    window.setTimeout(() => window.dispatchEvent(new KeyboardEvent('keyup', { key, code, keyCode, which: keyCode, bubbles: true })), duration);
  };
  const button = (label: string, action: () => void) => {
    const el = document.createElement('button');
    el.textContent = label;
    el.style.cssText = 'padding:6px 10px;background:#183949;color:#dbf5ff;border:1px solid #4b8193;cursor:pointer';
    el.onclick = action; panel.append(el);
  };
  button('East 2s', () => hold('d', 'KeyD', 68, 2000));
  button('West 2s', () => hold('a', 'KeyA', 65, 2000));
  button('Jump / fly', () => hold(' ', 'Space', 32, 700));
  button('Dash', () => hold('Shift', 'ShiftLeft', 16));
  button('Aim / fire 8s', () => {
    const firing = window.setInterval(() => {
      const scene = game.scene.getScene('Game') as GameScene;
      if (!scene.sys.isActive() || scene.player.hp <= 0) return;
      const targets = scene.drones.getChildren().filter(o => o.active) as Phaser.Physics.Arcade.Sprite[];
      targets.sort((a, b) => Math.abs(a.x - scene.player.x) - Math.abs(b.x - scene.player.x));
      const target = targets[0];
      if (!target) return;
      const camera = scene.cameras.main;
      scene.input.emit('pointerdown', { leftButtonDown: () => true,
        x: (target.x - camera.worldView.x) * camera.zoom,
        y: (target.y - camera.worldView.y) * camera.zoom,
      });
    }, 700);
    window.setTimeout(() => {
      window.clearInterval(firing);
      const scene = game.scene.getScene('Game') as GameScene;
      if (scene.sys.isActive() && scene.player.hp > 0) hold('Escape', 'Escape', 27);
    }, 8000);
  });
  button('Missile', () => hold('e', 'KeyE', 69));
  button('Repair', () => hold('q', 'KeyQ', 81));
  button('Hold F', () => hold('f', 'KeyF', 70, 2200));
  button('Restart', () => hold('r', 'KeyR', 82));
  button('Pause', () => hold('Escape', 'Escape', 27));
  button('Snapshot', () => {
    const scene = game.scene.getScene('Game') as GameScene;
    const p = scene.player;
    readout.textContent = JSON.stringify({ phase: scene.surfaceMission?.phase, encounter: scene.surfaceMission?.encounter,
      x: Math.round(p.x), y: Math.round(p.y), hp: p.hp, units: scene.drones.getChildren().filter(x => x.active).map(o => { const u = o as Phaser.Physics.Arcade.Sprite & { hp?: number; phase?: string; getState?: () => string }; return {x: Math.round(u.x), y: Math.round(u.y), hp:u.hp, phase:u.phase, state:u.getState?.(), clear:scene.flightNavigation?.isOpen(u, 35, 28)}; }),
      objective: scene.surfaceMission?.objective.title,
      errors: (window as unknown as { __moonsecErrors?: string[] }).__moonsecErrors,
    });
  });
  panel.append(readout);
  document.body.append(panel);
}
