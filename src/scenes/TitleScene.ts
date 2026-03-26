import Phaser from 'phaser';
import { GAME_W, GAME_H } from '../constants';
import { ProgressionSystem } from '../systems/ProgressionSystem';

const MAIN_OPTIONS    = ['START GAME', 'SELECT LEVEL', 'STORY', 'UPGRADES', 'RESET DATA'];
const LEVEL_OPTIONS   = ['L1: SURFACE OPS', 'L2: DARK SIDE', '[ BACK ]'];
const CONFIRM_OPTIONS = ['CONFIRM RESET', 'CANCEL'];

export class TitleScene extends Phaser.Scene {
  private selectedIndex = 0;
  private optionTexts: Phaser.GameObjects.Text[] = [];
  private pulseTween?: Phaser.Tweens.Tween;
  private inputLocked = false;
  private menuState: 'main' | 'levelSelect' | 'resetConfirm' = 'main';
  private currentOptions: string[] = [];

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
      fontSize: '10px',
      color: '#334455',
    }).setOrigin(0.5).setDepth(10);

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
  }

  private renderOptions(): void {
    // Destroy existing option texts
    this.optionTexts.forEach(t => t.destroy());
    this.optionTexts = [];

    const W = GAME_W, H = GAME_H;
    this.currentOptions.forEach((label, i) => {
      const t = this.add.text(W / 2, H * 0.58 + i * 54, label, {
        fontFamily: 'monospace',
        fontSize: '22px',
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
        t.setStyle({ color: '#00ccff', fontSize: '22px' });
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
        t.setStyle({ color: '#335566', fontSize: '18px' });
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
          this.registry.set('currentLevel', 1);
          this.cameras.main.fadeOut(300, 0, 0, 0);
          this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('MechSelect'));
          break;
        case 1: // L2: DARK SIDE
          this.inputLocked = true;
          this.registry.set('currentLevel', 2);
          this.cameras.main.fadeOut(300, 0, 0, 0);
          this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('MechSelect'));
          break;
        case 2: // [ BACK ]
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
            fontFamily: 'monospace', fontSize: '14px', color: '#ff4444',
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
        this.registry.set('currentLevel', 1);
        this.cameras.main.fadeOut(300, 0, 0, 0);
        this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('MechSelect'));
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
