import Phaser from 'phaser';

const OPTIONS = ['START GAME', 'STORY', 'UPGRADES'] as const;

export class TitleScene extends Phaser.Scene {
  private selectedIndex = 0;
  private optionTexts: Phaser.GameObjects.Text[] = [];
  private pulseTween?: Phaser.Tweens.Tween;
  private inputLocked = false;

  constructor() {
    super({ key: 'Title' });
  }

  create(): void {
    this.input.keyboard!.removeAllListeners();
    this.inputLocked = false;
    this.selectedIndex = 0;
    this.optionTexts = [];

    // Background
    this.add.rectangle(640, 360, 1280, 720, 0x030318).setDepth(0);

    // Star field (static — no scrolling needed on title screen)
    const makeStar = (count: number, size: number, alpha: number, key: string) => {
      if (this.textures.exists(key)) return; // already created on prior visit
      const gfx = this.add.graphics();
      gfx.fillStyle(0xffffff, alpha);
      for (let i = 0; i < count; i++) {
        gfx.fillRect(
          Phaser.Math.Between(0, 1280),
          Phaser.Math.Between(0, 720),
          size, size,
        );
      }
      gfx.generateTexture(key, 1280, 720);
      gfx.destroy();
    };
    makeStar(180, 1, 0.35, 'title-stars-far');
    makeStar(70,  2, 0.65, 'title-stars-near');

    this.add.image(640, 360, 'title-stars-far').setDepth(1);
    this.add.image(640, 360, 'title-stars-near').setDepth(2);

    // Logo
    const logoImage = this.add.image(640, 150, 'logo').setDepth(10);
    
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
    OPTIONS.forEach((label, i) => {
      const t = this.add.text(640, 430 + i * 54, label, {
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

    this.updateSelection();

    // Navigation hint
    this.add.text(640, 694, '↑ ↓  NAVIGATE      ENTER / SPACE  SELECT', {
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

    // Fade in
    this.cameras.main.setAlpha(0);
    this.tweens.add({
      targets: this.cameras.main,
      alpha: 1,
      duration: 600,
      ease: 'Power2',
    });
  }

  private navigate(dir: number): void {
    if (this.inputLocked) return;
    this.selectedIndex = Phaser.Math.Wrap(this.selectedIndex + dir, 0, OPTIONS.length);
    this.updateSelection();
    this.sound.play('ui-nav', { volume: 0.25 });
  }

  private updateSelection(): void {
    this.pulseTween?.stop();

    this.optionTexts.forEach((t, i) => {
      if (i === this.selectedIndex) {
        t.setText('▶  ' + OPTIONS[i] + '  ◀');
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
        t.setText(OPTIONS[i]);
        t.setStyle({ color: '#335566', fontSize: '18px' });
        t.setAlpha(0.8);
      }
    });
  }

  private confirmSelection(): void {
    if (this.inputLocked) return;
    this.inputLocked = true;
    this.sound.play('ui-confirm', { volume: 0.40 });
    this.pulseTween?.stop();

    this.cameras.main.fadeOut(300, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      switch (this.selectedIndex) {
        case 0: // START GAME
          this.scene.start('MechSelect');
          break;
        case 1: // STORY
          this.scene.start('Story');
          break;
        case 2: // UPGRADES
          this.scene.start('UpgradeTree');
          break;
      }
    });
  }
}
