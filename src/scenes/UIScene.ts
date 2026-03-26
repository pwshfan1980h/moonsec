import Phaser from 'phaser';
import { MinimapRenderer } from '../ui/MinimapRenderer';
import type { GameScene } from './GameScene';
import type { ProgressionSystem } from '../systems/ProgressionSystem';
import { PILOT_JETPACK_MAX_FUEL, GAME_W, GAME_H } from '../constants';

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
  private turretBg!: Phaser.GameObjects.Rectangle;
  private suitLabel!: Phaser.GameObjects.Text;
  private suitBg!: Phaser.GameObjects.Rectangle;
  private suitBar!: Phaser.GameObjects.Rectangle;
  private pilotPip!: Phaser.GameObjects.Rectangle;
  private pilotPipLabel!: Phaser.GameObjects.Text;
  private naniteBar!:   Phaser.GameObjects.Rectangle;
  private naniteBg!:    Phaser.GameObjects.Rectangle;
  private naniteLabel!: Phaser.GameObjects.Text;
  private naniteActive = false;
  private levelCompleteActive = false;
  private nanitePulseTween: Phaser.Tweens.Tween | null = null;

  private dronesRemainingText!: Phaser.GameObjects.Text;
  private minimap!: MinimapRenderer;

  // Pause elements
  private pauseBg!: Phaser.GameObjects.Rectangle;
  private pauseText!: Phaser.GameObjects.Text;
  private paused = false;

  // Game-over state
  private gameOverActive = false;
  private currentWave = 0;
  private currentScore = 0;
  private lastHp = 0;

  constructor() {
    super({ key: 'UI', active: false });
  }

  create(): void {
    const W = GAME_W, H = GAME_H;
    this.gameOverActive = false;
    this.levelCompleteActive = false;
    this.paused = false;
    this.naniteActive = false;
    this.currentWave = 0;
    this.currentScore = 0;
    this.lastHp = 0;

    // ── Health bar (top-left) ──────────────────────────────────────
    const hx = PAD;
    const hy = PAD;

    this.healthLabel = this.add.text(hx, hy, 'HP', {
      fontFamily: 'monospace', fontSize: '10px', color: '#ff4444',
    });
    this.healthBg   = this.add.rectangle(hx + BAR_W / 2 + 22, hy + 4, BAR_W, BAR_H, 0x330000).setOrigin(0.5, 0.5);
    this.healthFill = this.add.rectangle(hx + 22, hy, BAR_W, BAR_H, 0xff2222).setOrigin(0, 0);
    // border
    this.add.image(hx + 22 - 20, hy - 4, 'hud-bracket').setOrigin(0, 0).setDepth(1);

    // ── Jetpack fuel (small bar below health) ─────────────────────
    const jy = hy + 18;
    this.add.text(hx, jy, 'JP', {
      fontFamily: 'monospace', fontSize: '10px', color: '#44aaff',
    });
    this.add.rectangle(hx + BAR_W / 2 + 22, jy + 4, BAR_W, 6, 0x001133).setOrigin(0.5, 0.5);
    this.jetpackBar = this.add.rectangle(hx + 22, jy, BAR_W, 6, 0x2299ff).setOrigin(0, 0);

    // ── SUIT jetpack bar (pilot; hidden until ejected) ────────────
    const sy = jy + 14;
    this.suitLabel = this.add.text(hx, sy, 'SUIT', {
      fontFamily: 'monospace', fontSize: '10px', color: '#aaffaa',
    }).setVisible(false);
    this.suitBg = this.add.rectangle(hx + BAR_W / 2 + 22, sy + 4, BAR_W, 6, 0x001100)
      .setOrigin(0.5, 0.5).setVisible(false);
    this.suitBar = this.add.rectangle(hx + 22, sy, BAR_W, 6, 0x44ff44)
      .setOrigin(0, 0).setVisible(false);

    // ── Pilot pip (hidden until ejected) ──────────────────────────
    this.pilotPip = this.add.rectangle(hx, sy + 12, 6, 6, 0xff4444)
      .setOrigin(0, 0).setVisible(false);
    this.pilotPipLabel = this.add.text(hx + 10, sy + 10, 'PILOT', {
      fontFamily: 'monospace', fontSize: '9px', color: '#ff4444',
    }).setVisible(false);

    // ── Nanite (NNT) bar ──────────────────────────────────────────
    // Sits below the pilot pip block (sy + 12 for pip + 6 pip height + 8 gap = sy + 26)
    const nx = PAD;
    const ny = sy + 26;
    this.naniteLabel = this.add.text(nx, ny, 'NNT', {
      fontFamily: 'monospace', fontSize: '10px', color: '#00cc66',
    });
    this.naniteBg  = this.add.rectangle(nx + BAR_W / 2 + 22, ny + 4, BAR_W, 6, 0x001a0d).setOrigin(0.5, 0.5);
    this.naniteBar = this.add.rectangle(nx + 22, ny, BAR_W, 6, 0x00ff88).setOrigin(0, 0);

    // ── Missile cooldown bar (top-right) ──────────────────────────
    const mx = W - BAR_W - PAD - 22;
    const my = PAD;

    this.missileLabel = this.add.text(W - PAD, my, 'MSL', {
      fontFamily: 'monospace', fontSize: '10px', color: '#ffff44',
      align: 'right',
    }).setOrigin(1, 0);

    this.missileBg   = this.add.rectangle(mx + BAR_W / 2, my + 4, BAR_W, BAR_H, 0x333300).setOrigin(0.5, 0.5);
    this.missileBar  = this.add.rectangle(mx, my, BAR_W, BAR_H, 0xffff00).setOrigin(0, 0);
    this.add.image(mx - 20, my - 4, 'hud-bracket').setOrigin(0, 0).setDepth(1);

    // ── Turret cooldown bar (below missile) ───────────────────────
    const ty = my + 18;
    this.turretLabel = this.add.text(W - PAD, ty, 'TRT', {
      fontFamily: 'monospace', fontSize: '10px', color: '#ff8844',
      align: 'right',
    }).setOrigin(1, 0);
    this.turretBg = this.add.rectangle(mx + BAR_W / 2, ty + 4, BAR_W, 6, 0x331100).setOrigin(0.5, 0.5);
    this.turretBar = this.add.rectangle(mx, ty, BAR_W, 6, 0xff6600).setOrigin(0, 0);
    this.add.image(mx - 20, ty - 6, 'hud-bracket').setOrigin(0, 0).setDepth(1).setAlpha(0.6);

    // ── Score (top-center) ────────────────────────────────────────
    this.scoreText = this.add.text(W / 2, PAD, '0', {
      fontFamily: 'monospace', fontSize: '16px', color: '#ffffff',
      align: 'center',
    }).setOrigin(0.5, 0);

    // ── Persistent wave counter (below score) ─────────────────────
    this.waveCounter = this.add.text(W / 2, PAD + 20, '', {
      fontFamily: 'monospace', fontSize: '9px', color: '#666688',
      align: 'center',
    }).setOrigin(0.5, 0);

    // ── Drones remaining counter (below wave counter) ──────────────
    this.dronesRemainingText = this.add.text(W / 2, PAD + 32, '', {
      fontFamily: 'monospace', fontSize: '10px', color: '#ff4444',
      align: 'center',
    }).setOrigin(0.5, 0).setAlpha(0);

    // ── Controls hint (bottom-left) ───────────────────────────────
    this.add.text(PAD, H - PAD, 'A/D move  SPACE jump/jetpack  LMB turret  RMB rapid  SHIFT missile  ESC pause', {
      fontFamily: 'monospace', fontSize: '9px', color: '#334455',
    }).setOrigin(0, 1);

    // ── Wave announcement (big, fades out) ────────────────────────
    this.waveText = this.add.text(W / 2, H / 2 - 40, '', {
      fontFamily: 'monospace', fontSize: '28px', color: '#ff6666',
      align: 'center',
    }).setOrigin(0.5, 0.5).setAlpha(0).setDepth(30);

    // ── Pause overlay ─────────────────────────────────────────────
    this.pauseBg = this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.6)
      .setDepth(50).setVisible(false);
    this.pauseText = this.add.text(W / 2, H / 2, 'PAUSED\n\nESC to resume', {
      fontFamily: 'monospace', fontSize: '20px', color: '#8888cc',
      align: 'center',
    }).setOrigin(0.5, 0.5).setDepth(51).setVisible(false);

    // ── Listen for events from GameScene ──────────────────────────
    const game = this.scene.get('Game');

    game.events.on('healthChange', (hp: number, maxHp: number) => {
      this.healthFill.setDisplaySize(BAR_W * (hp / maxHp), BAR_H);
      if (!this.naniteActive) {
        const t = hp / maxHp;
        this.healthFill.setFillStyle(t > 0.5 ? 0xff2222 : t > 0.25 ? 0xff8800 : 0xff0000);
      }
      // Screen-edge flash on damage
      if (hp < this.lastHp) {
        this.cameras.main.flash(200, 220, 30, 30, false);
      }
      this.lastHp = hp;
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

    game.events.on('naniteChange', (state: string, progress: number) => {
      this.onNaniteChange(state, progress);
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

      // Show level name on wave 1 only
      if (wave === 1) {
        const gameScene = this.scene.get('Game') as GameScene;
        const levelNum  = gameScene.currentLevel;
        const levelName = levelNum === 2 ? 'SUBSURFACE' : 'SURFACE OPS';
        const t = this.add.text(W / 2, 80, levelName, {
          fontFamily: 'monospace', fontSize: '22px',
          color: levelNum === 2 ? '#00ff66' : '#6699ff',
          stroke: '#000000', strokeThickness: 3,
        }).setOrigin(0.5).setDepth(50).setAlpha(0);
        this.tweens.add({
          targets: t, alpha: 1, duration: 400, yoyo: true, hold: 1200,
          onComplete: () => t.destroy(),
        });
      }
    });

    game.events.on('dronesRemaining', (count: number) => {
      if (count > 0) {
        this.dronesRemainingText.setText(`▼ ${count}`).setAlpha(1);
      } else {
        this.dronesRemainingText.setAlpha(0);
      }
    });

    game.events.on('killStreak', (count: number, bonus: number) => {
      const t = this.add.text(W / 2, H / 2, `${count} KILLSTREAK!\n+${bonus}`, {
        fontFamily: 'monospace', fontSize: '20px', color: '#ffff00',
        align: 'center',
      }).setOrigin(0.5, 0.5).setDepth(30);
      this.tweens.add({
        targets: t, y: H / 2 - 50, alpha: 0, duration: 1500, ease: 'Power2',
        onComplete: () => t.destroy(),
      });
    });

    game.events.on('gameOver', () => {
      this.showGameOver();
    });

    game.events.on('bossKilled', () => {
      if (this.levelCompleteActive) return;
      this.levelCompleteActive = true;
      this.showLevelComplete();
    });

    // ── Keyboard handlers ─────────────────────────────────────────
    this.input.keyboard!.on('keydown-ESC', () => {
      if (this.gameOverActive) return;
      this.togglePause();
    });

    this.input.keyboard!.on('keydown-R', () => {
      if (!this.gameOverActive) return;
      const gameScene = this.scene.get('Game');
      this.registry.set('isNewGame', true);
      gameScene.scene.restart();
      this.scene.restart();
    });

    // ── Radar minimap ─────────────────────────────────────────────
    this.minimap = new MinimapRenderer(this);
  }

  update(time: number, _delta: number): void {
    if (this.gameOverActive) return;
    // Re-fetch every frame — restart creates a new GameScene instance
    const game = this.scene.get('Game') as GameScene;
    if (!game || !game.sys.isActive()) return;
    this.minimap.draw(time, game);

    // Pilot HUD — show/hide based on whether pilot is active
    const pilotActive = !!game.pilot?.active;

    this.suitLabel.setVisible(pilotActive);
    this.suitBg.setVisible(pilotActive);
    this.pilotPip.setVisible(pilotActive);
    this.pilotPipLabel.setVisible(pilotActive);

    if (pilotActive) {
      this.suitBar.setVisible(true);
      this.suitBar.setDisplaySize(BAR_W * (game.pilot!.jetpackFuel / PILOT_JETPACK_MAX_FUEL), 6);
    } else {
      this.suitBar.setVisible(false);
    }

    // Dim mech weapon bars while ejected
    const weaponAlpha = pilotActive ? 0.3 : 1.0;
    this.missileBar.setAlpha(weaponAlpha);
    this.missileBg.setAlpha(weaponAlpha);
    this.missileLabel.setAlpha(weaponAlpha);
    this.turretBar.setAlpha(weaponAlpha);
    this.turretBg.setAlpha(weaponAlpha);
    this.turretLabel.setAlpha(weaponAlpha);
  }

  shutdown(): void {
    if (this.nanitePulseTween) {
      this.nanitePulseTween.stop();
      this.nanitePulseTween = null;
    }
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

  private onNaniteChange(state: string, progress: number): void {
    if (state === 'active') {
      this.naniteActive = true;
      this.healthFill.setFillStyle(0x00ff88);
      this.naniteBar.setDisplaySize(BAR_W, 6);
      this.naniteBar.setFillStyle(0x00ff88);
      if (!this.nanitePulseTween) {
        this.nanitePulseTween = this.tweens.add({
          targets: this.naniteBar,
          alpha: { from: 0.5, to: 1 },
          duration: 400,
          yoyo: true,
          repeat: -1,
        });
      }
    } else if (state === 'cooldown') {
      this.naniteActive = false;
      // Revert health bar color based on current HP ratio
      const game = this.scene.get('Game') as GameScene;
      if (game?.player) {
        const t = game.player.hp / game.player.maxHp;
        this.healthFill.setFillStyle(t > 0.5 ? 0xff2222 : t > 0.25 ? 0xff8800 : 0xff0000);
      }
      // Stop pulse
      if (this.nanitePulseTween) {
        this.nanitePulseTween.stop();
        this.nanitePulseTween = null;
      }
      this.naniteBar.setAlpha(1);
      this.naniteBar.setDisplaySize(BAR_W * progress, 6);
      this.naniteBar.setFillStyle(0x003311);
    } else if (state === 'ready') {
      this.naniteActive = false;
      if (this.nanitePulseTween) {
        this.nanitePulseTween.stop();
        this.nanitePulseTween = null;
      }
      this.naniteBar.setAlpha(1);
      this.naniteBar.setDisplaySize(BAR_W, 6);
      this.naniteBar.setFillStyle(0x00ff88);
    }
  }

  private showLevelComplete(): void {
    const gameScene = this.scene.get('Game') as GameScene;
    const mechType  = gameScene.registry.get('mechType') as string;
    const score     = gameScene.score;
    const level     = gameScene.currentLevel;

    // Overlay
    const W = GAME_W, H = GAME_H;
    this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.75).setDepth(60);
    this.add.text(W / 2, H / 2 - 80, 'LEVEL COMPLETE', {
      fontFamily: 'monospace', fontSize: '32px', color: '#00ff88',
    }).setOrigin(0.5).setDepth(61);

    const nextName = level === 1 ? 'DESCENDING TO SUBSURFACE…' : 'ALL CLEAR';
    this.add.text(W / 2, H / 2 - 20, nextName, {
      fontFamily: 'monospace', fontSize: '16px', color: '#aaffcc',
    }).setOrigin(0.5).setDepth(61);

    // Level complete stinger — low triumphant boom
    const gameSceneForAudio = this.scene.get('Game') as GameScene;
    gameSceneForAudio?.audio?.play('level-complete');

    // Transition after 2000ms
    this.time.delayedCall(2000, () => {
      this.cameras.main.fade(500, 0, 0, 0, false, (_cam: unknown, progress: number) => {
        if (progress === 1) {
          if (level === 1) {
            gameScene.scene.start('Game', {
              level: 2,
              mechType,
              totalScore: score,
            });
            this.scene.restart();
          } else {
            // Victory — return to Level 1
            gameScene.scene.start('Game', { mechType });
            this.scene.restart();
          }
        }
      });
    });
  }

  private showGameOver(): void {
    this.gameOverActive = true;

    // Save high score via ProgressionSystem
    const prog = this.registry.get('progression') as ProgressionSystem | undefined;
    const prevHighScore = prog ? prog.highScore : 0;
    if (prog) {
      prog.addScore(this.currentScore);
      prog.updateHighScore(this.currentScore);
    }
    const highScore = prog ? prog.highScore : this.currentScore;
    const isNew = this.currentScore > prevHighScore;

    // Dark overlay
    const W = GAME_W, H = GAME_H;
    this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.7).setDepth(60);

    // Game over text
    this.add.text(W / 2, H / 2 - 120, 'GAME OVER', {
      fontFamily: 'monospace', fontSize: '32px', color: '#ff2222',
      align: 'center',
    }).setOrigin(0.5, 0.5).setDepth(61);

    // Score
    this.add.text(W / 2, H / 2 - 40, `SCORE: ${this.currentScore}`, {
      fontFamily: 'monospace', fontSize: '16px', color: '#ffffff',
      align: 'center',
    }).setOrigin(0.5, 0.5).setDepth(61);

    // Wave reached
    this.add.text(W / 2, H / 2, `WAVE: ${this.currentWave}`, {
      fontFamily: 'monospace', fontSize: '12px', color: '#8888aa',
      align: 'center',
    }).setOrigin(0.5, 0.5).setDepth(61);

    // High score
    const hsColor = isNew ? '#ffff00' : '#666688';
    const hsPrefix = isNew ? 'NEW HIGH SCORE: ' : 'HIGH SCORE: ';
    this.add.text(W / 2, H / 2 + 48, `${hsPrefix}${highScore}`, {
      fontFamily: 'monospace', fontSize: '12px', color: hsColor,
      align: 'center',
    }).setOrigin(0.5, 0.5).setDepth(61);

    // Restart prompt
    const restartText = this.add.text(W / 2, H / 2 + 136, 'PRESS R TO RESTART', {
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
