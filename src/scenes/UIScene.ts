import Phaser from 'phaser';

const BAR_W = 140;
const BAR_H = 10;
const PAD = 12;

export class UIScene extends Phaser.Scene {
  private healthFill!: Phaser.GameObjects.Rectangle;
  private healthBg!: Phaser.GameObjects.Rectangle;
  private missileBar!: Phaser.GameObjects.Rectangle;
  private missileBg!: Phaser.GameObjects.Rectangle;
  private missileLabel!: Phaser.GameObjects.Text;
  private healthLabel!: Phaser.GameObjects.Text;
  private jetpackBar!: Phaser.GameObjects.Rectangle;
  private waveText!: Phaser.GameObjects.Text;
  private waveCounter!: Phaser.GameObjects.Text;
  private scoreText!: Phaser.GameObjects.Text;
  private turretBar!: Phaser.GameObjects.Rectangle;
  private turretLabel!: Phaser.GameObjects.Text;

  // Pause elements
  private pauseBg!: Phaser.GameObjects.Rectangle;
  private pauseText!: Phaser.GameObjects.Text;
  private paused = false;

  // Game-over state
  private gameOverActive = false;
  private currentWave = 0;
  private currentScore = 0;

  constructor() {
    super({ key: 'UI', active: false });
  }

  create(): void {
    this.gameOverActive = false;
    this.paused = false;
    this.currentWave = 0;
    this.currentScore = 0;

    // ── Health bar (top-left) ──────────────────────────────────────
    const hx = PAD;
    const hy = PAD;

    this.healthLabel = this.add.text(hx, hy, 'HP', {
      fontFamily: 'monospace', fontSize: '10px', color: '#ff4444',
    });
    this.healthBg   = this.add.rectangle(hx + BAR_W / 2 + 22, hy + 4, BAR_W, BAR_H, 0x330000).setOrigin(0.5, 0.5);
    this.healthFill = this.add.rectangle(hx + 22, hy, BAR_W, BAR_H, 0xff2222).setOrigin(0, 0);
    // border
    this.add.rectangle(hx + BAR_W / 2 + 22, hy + 4, BAR_W + 2, BAR_H + 2, 0x660000).setOrigin(0.5, 0.5).setDepth(-1);

    // ── Jetpack fuel (small bar below health) ─────────────────────
    const jy = hy + 18;
    this.add.text(hx, jy, 'JP', {
      fontFamily: 'monospace', fontSize: '10px', color: '#44aaff',
    });
    this.add.rectangle(hx + BAR_W / 2 + 22, jy + 4, BAR_W, 6, 0x001133).setOrigin(0.5, 0.5);
    this.jetpackBar = this.add.rectangle(hx + 22, jy, BAR_W, 6, 0x2299ff).setOrigin(0, 0);

    // ── Missile cooldown bar (top-right) ──────────────────────────
    const mx = 800 - BAR_W - PAD - 22;
    const my = PAD;

    this.missileLabel = this.add.text(800 - PAD, my, 'MSL', {
      fontFamily: 'monospace', fontSize: '10px', color: '#ffff44',
      align: 'right',
    }).setOrigin(1, 0);

    this.missileBg   = this.add.rectangle(mx + BAR_W / 2, my + 4, BAR_W, BAR_H, 0x333300).setOrigin(0.5, 0.5);
    this.missileBar  = this.add.rectangle(mx, my, BAR_W, BAR_H, 0xffff00).setOrigin(0, 0);
    this.add.rectangle(mx + BAR_W / 2, my + 4, BAR_W + 2, BAR_H + 2, 0x665500).setOrigin(0.5, 0.5).setDepth(-1);

    // ── Turret cooldown bar (below missile) ───────────────────────
    const ty = my + 18;
    this.turretLabel = this.add.text(800 - PAD, ty, 'TRT', {
      fontFamily: 'monospace', fontSize: '10px', color: '#ff8844',
      align: 'right',
    }).setOrigin(1, 0);
    this.add.rectangle(mx + BAR_W / 2, ty + 4, BAR_W, 6, 0x331100).setOrigin(0.5, 0.5);
    this.turretBar = this.add.rectangle(mx, ty, BAR_W, 6, 0xff6600).setOrigin(0, 0);

    // ── Score (top-center) ────────────────────────────────────────
    this.scoreText = this.add.text(400, PAD, '0', {
      fontFamily: 'monospace', fontSize: '16px', color: '#ffffff',
      align: 'center',
    }).setOrigin(0.5, 0);

    // ── Persistent wave counter (below score) ─────────────────────
    this.waveCounter = this.add.text(400, PAD + 20, '', {
      fontFamily: 'monospace', fontSize: '9px', color: '#666688',
      align: 'center',
    }).setOrigin(0.5, 0);

    // ── Controls hint (bottom-left) ───────────────────────────────
    this.add.text(PAD, 450 - PAD, 'A/D move  SPACE jump/jetpack  LMB turret  RMB rapid  SHIFT missile  ESC pause', {
      fontFamily: 'monospace', fontSize: '9px', color: '#334455',
    }).setOrigin(0, 1);

    // ── Wave announcement (big, fades out) ────────────────────────
    this.waveText = this.add.text(400, 200, '', {
      fontFamily: 'monospace', fontSize: '28px', color: '#ff6666',
      align: 'center',
    }).setOrigin(0.5, 0.5).setAlpha(0).setDepth(30);

    // ── Pause overlay ─────────────────────────────────────────────
    this.pauseBg = this.add.rectangle(400, 225, 800, 450, 0x000000, 0.6)
      .setDepth(50).setVisible(false);
    this.pauseText = this.add.text(400, 225, 'PAUSED\n\nESC to resume', {
      fontFamily: 'monospace', fontSize: '20px', color: '#8888cc',
      align: 'center',
    }).setOrigin(0.5, 0.5).setDepth(51).setVisible(false);

    // ── Listen for events from GameScene ──────────────────────────
    const game = this.scene.get('Game');

    game.events.on('healthChange', (hp: number, maxHp: number) => {
      this.healthFill.setDisplaySize(BAR_W * (hp / maxHp), BAR_H);
      const t = hp / maxHp;
      this.healthFill.setFillStyle(t > 0.5 ? 0xff2222 : t > 0.25 ? 0xff8800 : 0xff0000);
    });

    game.events.on('missileCooldown', (progress: number) => {
      this.missileBar.setDisplaySize(BAR_W * progress, BAR_H);
      if (progress >= 1) {
        this.missileBar.setFillStyle(0x00ffff);
        this.missileLabel.setColor('#00ffff');
      } else {
        this.missileBar.setFillStyle(0xffff00);
        this.missileLabel.setColor('#888844');
      }
    });

    game.events.on('turretCooldown', (progress: number) => {
      this.turretBar.setDisplaySize(BAR_W * progress, 6);
      if (progress >= 1) {
        this.turretBar.setFillStyle(0xff8844);
        this.turretLabel.setColor('#ff8844');
      } else {
        this.turretBar.setFillStyle(0x663311);
        this.turretLabel.setColor('#664422');
      }
    });

    game.events.on('jetpackFuel', (fuel: number, max: number) => {
      this.jetpackBar.setDisplaySize(BAR_W * (fuel / max), 6);
    });

    game.events.on('scoreChange', (score: number) => {
      this.currentScore = score;
      this.scoreText.setText(`${score}`);
    });

    game.events.on('waveStart', (wave: number) => {
      this.currentWave = wave;
      this.waveCounter.setText(`WAVE ${wave}`);

      // Big announcement
      this.waveText.setText(`WAVE ${wave}`).setAlpha(1);
      this.tweens.add({
        targets: this.waveText,
        alpha: 0,
        duration: 2000,
        delay: 1500,
        ease: 'Power2',
      });
    });

    game.events.on('gameOver', () => {
      this.showGameOver();
    });

    // ── Keyboard handlers ─────────────────────────────────────────
    this.input.keyboard!.on('keydown-ESC', () => {
      if (this.gameOverActive) return;
      this.togglePause();
    });

    this.input.keyboard!.on('keydown-R', () => {
      if (!this.gameOverActive) return;
      const gameScene = this.scene.get('Game');
      gameScene.scene.restart();
      this.scene.restart();
    });
  }

  private togglePause(): void {
    this.paused = !this.paused;
    if (this.paused) {
      this.scene.pause('Game');
      this.pauseBg.setVisible(true);
      this.pauseText.setVisible(true);
    } else {
      this.scene.resume('Game');
      this.pauseBg.setVisible(false);
      this.pauseText.setVisible(false);
    }
  }

  private showGameOver(): void {
    this.gameOverActive = true;

    // Save high score
    const prev = parseInt(localStorage.getItem('moonsec-highscore') || '0', 10);
    const isNew = this.currentScore > prev;
    if (isNew) {
      localStorage.setItem('moonsec-highscore', String(this.currentScore));
    }
    const highScore = Math.max(prev, this.currentScore);

    // Dark overlay
    this.add.rectangle(400, 225, 800, 450, 0x000000, 0.7).setDepth(60);

    // Game over text
    this.add.text(400, 150, 'GAME OVER', {
      fontFamily: 'monospace', fontSize: '32px', color: '#ff2222',
      align: 'center',
    }).setOrigin(0.5, 0.5).setDepth(61);

    // Score
    this.add.text(400, 200, `SCORE: ${this.currentScore}`, {
      fontFamily: 'monospace', fontSize: '16px', color: '#ffffff',
      align: 'center',
    }).setOrigin(0.5, 0.5).setDepth(61);

    // Wave reached
    this.add.text(400, 225, `WAVE: ${this.currentWave}`, {
      fontFamily: 'monospace', fontSize: '12px', color: '#8888aa',
      align: 'center',
    }).setOrigin(0.5, 0.5).setDepth(61);

    // High score
    const hsColor = isNew ? '#ffff00' : '#666688';
    const hsPrefix = isNew ? 'NEW HIGH SCORE: ' : 'HIGH SCORE: ';
    this.add.text(400, 255, `${hsPrefix}${highScore}`, {
      fontFamily: 'monospace', fontSize: '12px', color: hsColor,
      align: 'center',
    }).setOrigin(0.5, 0.5).setDepth(61);

    // Restart prompt
    const restartText = this.add.text(400, 310, 'PRESS R TO RESTART', {
      fontFamily: 'monospace', fontSize: '14px', color: '#4488ff',
      align: 'center',
    }).setOrigin(0.5, 0.5).setDepth(61);

    // Pulse the restart prompt
    this.tweens.add({
      targets: restartText,
      alpha: 0.3,
      duration: 800,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }
}
