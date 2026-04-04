import Phaser from 'phaser';
import { GAME_W, GAME_H } from '../constants';
import { ProgressionSystem } from '../systems/ProgressionSystem';

const MAIN_OPTIONS    = ['START GAME', 'SELECT LEVEL', 'STORY', 'UPGRADES', 'RESET DATA'];
const LEVEL_OPTIONS   = ['L1: SURFACE OPS', 'L2: DARK SIDE', 'L3: ICE CAVERNS', '[ BACK ]'];
const CONFIRM_OPTIONS = ['CONFIRM RESET', 'CANCEL'];

export class TitleScene extends Phaser.Scene {
  private selectedIndex = 0;
  private optionTexts: Phaser.GameObjects.Text[] = [];
  private pulseTween?: Phaser.Tweens.Tween;
  private inputLocked = false;
  private menuState: 'main' | 'levelSelect' | 'resetConfirm' = 'main';
  private currentOptions: string[] = [];
  private titleMusic: Phaser.Sound.WebAudioSound | null = null;

  constructor() {
    super({ key: 'Title' });
  }

  create(): void {
    const W = GAME_W, H = GAME_H;
    this.input.keyboard!.removeAllListeners();
    this.inputLocked = false;
    this.selectedIndex = 0;
    this.optionTexts = [];
    this.menuState = 'main';

    // Background
    this.add.rectangle(W/2, H/2, W, H, 0x030318).setDepth(0);

    // Star field (static — no scrolling needed on title screen)
    const makeStar = (count: number, size: number, alpha: number, key: string) => {
      if (this.textures.exists(key)) return; // already created on prior visit
      const gfx = this.add.graphics();
      gfx.fillStyle(0xffffff, alpha);
      for (let i = 0; i < count; i++) {
        gfx.fillRect(
          Phaser.Math.Between(0, W),
          Phaser.Math.Between(0, H),
          size, size,
        );
      }
      gfx.generateTexture(key, W, H);
      gfx.destroy();
    };
    makeStar(180, 1, 0.35, 'title-stars-far');
    makeStar(70,  2, 0.65, 'title-stars-near');

    this.add.image(W/2, H/2, 'title-stars-far').setDepth(1);
    this.add.image(W/2, H/2, 'title-stars-near').setDepth(2);

    // Mech4 silhouette watermark — procedural rectangles, depth 1.5
    {
      const cx = W / 2;
      const s  = H * 0.42;   // scale: ~226px tall for H=540
      const gy = H * 0.75;   // feet Y position

      const wm = this.add.graphics().setDepth(1.5);
      wm.fillStyle(0xff3311, 0.05);

      // Head
      wm.fillRect(cx - s * 0.11, gy - s * 0.96, s * 0.22, s * 0.16);
      // Body (wide shoulders)
      wm.fillRect(cx - s * 0.22, gy - s * 0.78, s * 0.44, s * 0.32);
      // Left arm
      wm.fillRect(cx - s * 0.38, gy - s * 0.76, s * 0.16, s * 0.24);
      // Right arm
      wm.fillRect(cx + s * 0.22, gy - s * 0.76, s * 0.16, s * 0.24);
      // Left leg
      wm.fillRect(cx - s * 0.19, gy - s * 0.44, s * 0.15, s * 0.44);
      // Right leg
      wm.fillRect(cx + s * 0.04, gy - s * 0.44, s * 0.15, s * 0.44);
    }

    // Logo
    const logoImage = this.add.image(W/2, 150, 'logo').setDepth(10);

    // Add floating animation to the logo
    this.tweens.add({
      targets: logoImage,
      y: 160,
      duration: 2000,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    // Menu options
    this.currentOptions = [...MAIN_OPTIONS];
    this.renderOptions();

    // Navigation hint
    this.add.text(W/2, H - 26, '↑ ↓  NAVIGATE      ENTER / SPACE  SELECT', {
      fontFamily: 'monospace',
      fontSize: '14px',
      color: '#334455',
    }).setOrigin(0.5).setDepth(10);

    // Version watermark
    this.add.text(W - 16, H - 16, `ALPHA v${__APP_VERSION__}`, {
      fontFamily: 'monospace',
      fontSize: '12px',
      color: '#334455',
    }).setOrigin(1, 1).setDepth(10);

    // Input
    this.input.keyboard!.on('keydown-UP',    () => this.navigate(-1));
    this.input.keyboard!.on('keydown-DOWN',  () => this.navigate(1));
    this.input.keyboard!.on('keydown-W',     () => this.navigate(-1));
    this.input.keyboard!.on('keydown-S',     () => this.navigate(1));
    this.input.keyboard!.on('keydown-ENTER', () => this.confirmSelection());
    this.input.keyboard!.on('keydown-SPACE', () => this.confirmSelection());

    // ESC — back to main menu from sub-menus
    this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.ESC).on('down', () => {
      if (this.inputLocked) return;
      if (this.menuState === 'levelSelect' || this.menuState === 'resetConfirm') {
        this.menuState = 'main';
        this.currentOptions = [...MAIN_OPTIONS];
        this.renderOptions();
      }
    });

    // Fade in
    this.cameras.main.setAlpha(0);
    this.tweens.add({
      targets: this.cameras.main,
      alpha: 1,
      duration: 600,
      ease: 'Power2',
    });

    // Title music — guard against restart when returning from sub-scenes
    const existing = this.sound.getAll('music-title') as Phaser.Sound.WebAudioSound[];
    if (!existing.some(s => s.isPlaying)) {
      this.titleMusic = this.sound.add('music-title', { loop: true, volume: 0 }) as Phaser.Sound.WebAudioSound;
      this.titleMusic.play();
      this.tweens.add({
        targets: this.titleMusic,
        volume: 0.6,
        duration: 1500,
        ease: 'Linear',
      });
    } else {
      this.titleMusic = existing[0];
    }
  }

  private renderOptions(): void {
    // Destroy existing option texts
    this.optionTexts.forEach(t => t.destroy());
    this.optionTexts = [];

    const W = GAME_W, H = GAME_H;
    this.currentOptions.forEach((label, i) => {
      const t = this.add.text(W / 2, H * 0.58 + i * 54, label, {
        fontFamily: 'monospace',
        fontSize: '26px',
        color: '#335566',
      }).setOrigin(0.5).setDepth(10)
        .setInteractive({ useHandCursor: true })
        .on('pointerdown', () => {
          this.selectedIndex = i;
          this.updateSelection();
          this.confirmSelection();
        })
        .on('pointerover', () => {
          if (this.selectedIndex !== i) {
            this.selectedIndex = i;
            this.updateSelection();
          }
        });
      this.optionTexts.push(t);
    });

    this.selectedIndex = 0;
    this.updateSelection();
  }

  private navigate(dir: number): void {
    if (this.inputLocked) return;
    this.selectedIndex = Phaser.Math.Wrap(this.selectedIndex + dir, 0, this.currentOptions.length);
    this.updateSelection();
    this.sound.play('ui-nav', { volume: 0.25 });
  }

  private updateSelection(): void {
    this.pulseTween?.stop();

    this.optionTexts.forEach((t, i) => {
      if (i === this.selectedIndex) {
        t.setText('▶  ' + this.currentOptions[i] + '  ◀');
        t.setStyle({ color: '#ff3311', fontSize: '26px' });
        t.setAlpha(1);
        this.pulseTween = this.tweens.add({
          targets: t,
          alpha: { from: 0.75, to: 1 },
          duration: 700,
          yoyo: true,
          repeat: -1,
          ease: 'Sine.easeInOut',
        });
      } else {
        t.setText(this.currentOptions[i]);
        t.setStyle({ color: '#335566', fontSize: '22px' });
        t.setAlpha(0.8);
      }
    });
  }

  private confirmSelection(): void {
    if (this.inputLocked) return;
    this.sound.play('ui-confirm', { volume: 0.40 });
    this.pulseTween?.stop();

    if (this.menuState === 'levelSelect') {
      switch (this.selectedIndex) {
        case 0: // L1: SURFACE OPS
          this.inputLocked = true;
          this.cameras.main.fadeOut(300, 0, 0, 0);
          this.cameras.main.once('camerafadeoutcomplete', () => {
            this.scene.start('Game', { mechType: 'mech4', level: 1 });
            this.scene.launch('UI');
          });
          break;
        case 1: // L2: DARK SIDE
          this.inputLocked = true;
          this.cameras.main.fadeOut(300, 0, 0, 0);
          this.cameras.main.once('camerafadeoutcomplete', () => {
            this.scene.start('Game', { mechType: 'mech4', level: 2 });
            this.scene.launch('UI');
          });
          break;
        case 2: // L3: ICE CAVERNS
          this.inputLocked = true;
          this.cameras.main.fadeOut(300, 0, 0, 0);
          this.cameras.main.once('camerafadeoutcomplete', () => {
            this.scene.start('Game', { mechType: 'mech4', level: 3 });
            this.scene.launch('UI');
          });
          break;
        case 3: // [ BACK ]
          this.menuState = 'main';
          this.currentOptions = [...MAIN_OPTIONS];
          this.renderOptions();
          break;
      }
      return;
    }

    if (this.menuState === 'resetConfirm') {
      switch (this.selectedIndex) {
        case 0: { // CONFIRM RESET
          // Reset via registry instance if already created, else direct localStorage clear
          const prog = this.registry.get('progression') as ProgressionSystem | undefined;
          if (prog) {
            prog.resetData();
          } else {
            localStorage.removeItem('moonsec-progression');
            localStorage.removeItem('moonsec-highscore');
          }
          this.menuState = 'main';
          this.currentOptions = [...MAIN_OPTIONS];
          this.renderOptions();
          // Brief flash to confirm
          const flash = this.add.text(GAME_W / 2, GAME_H * 0.85, 'DATA RESET', {
            fontFamily: 'monospace', fontSize: '18px', color: '#ff4444',
          }).setOrigin(0.5).setDepth(20).setAlpha(0);
          this.tweens.add({
            targets: flash, alpha: { from: 1, to: 0 },
            duration: 1200, ease: 'Power2',
            onComplete: () => flash.destroy(),
          });
          break;
        }
        case 1: // CANCEL
          this.menuState = 'main';
          this.currentOptions = [...MAIN_OPTIONS];
          this.renderOptions();
          break;
      }
      return;
    }

    // menuState === 'main'
    switch (this.selectedIndex) {
      case 0: // START GAME
        this.inputLocked = true;
        this.cameras.main.fadeOut(300, 0, 0, 0);
        this.cameras.main.once('camerafadeoutcomplete', () => {
          this.scene.start('Game', { mechType: 'mech4', level: 1 });
          this.scene.launch('UI');
        });
        break;
      case 1: // SELECT LEVEL
        this.menuState = 'levelSelect';
        this.currentOptions = [...LEVEL_OPTIONS];
        this.renderOptions();
        break;
      case 2: // STORY
        this.inputLocked = true;
        this.cameras.main.fadeOut(300, 0, 0, 0);
        this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('Story'));
        break;
      case 3: // UPGRADES
        this.inputLocked = true;
        this.cameras.main.fadeOut(300, 0, 0, 0);
        this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('UpgradeTree'));
        break;
      case 4: // RESET DATA
        this.menuState = 'resetConfirm';
        this.currentOptions = [...CONFIRM_OPTIONS];
        this.renderOptions();
        break;
    }
  }
}
