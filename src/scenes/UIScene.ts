import Phaser from 'phaser';
import { MinimapRenderer } from '../ui/MinimapRenderer';
import type { GameScene } from './GameScene';
import { GAME_W, GAME_H } from '../constants';

const BAR_W   = 200;   // bar width (was 140)
const BAR_H   = 14;    // primary bar height: HP, MSL (was 10)
const BAR_H2  = 10;    // secondary bar height: JP, Nanoheal, TRT (was 6)
const PAD     = 12;
const PP      = 10;    // panel internal padding
const LABEL_H = 16;    // vertical space reserved for a label text row
const ROW_GAP = 8;     // gap between bar bottom and next label

export class UIScene extends Phaser.Scene {
  private healthFill!: Phaser.GameObjects.Rectangle;
  private healthBg!: Phaser.GameObjects.Rectangle;
  private missileBar!: Phaser.GameObjects.Rectangle;
  private missileBg!: Phaser.GameObjects.Rectangle;
  private missileLabel!: Phaser.GameObjects.Text;
  private missileStateLabel!: Phaser.GameObjects.Text;
  private healthLabel!: Phaser.GameObjects.Text;
  private jetpackBar!: Phaser.GameObjects.Rectangle;
  private waveText!: Phaser.GameObjects.Text;
  private waveCounter!: Phaser.GameObjects.Text;
  private scoreText!: Phaser.GameObjects.Text;
  private turretBar!: Phaser.GameObjects.Rectangle;
  private turretLabel!: Phaser.GameObjects.Text;
  private turretBg!: Phaser.GameObjects.Rectangle;
  private naniteBar!:   Phaser.GameObjects.Rectangle;
  private naniteBg!:    Phaser.GameObjects.Rectangle;
  private naniteLabel!: Phaser.GameObjects.Text;
  private naniteActive = false;
  private healthValueText!: Phaser.GameObjects.Text;
  private levelCompleteActive = false;
  private titleActive = false;
  private nanitePulseTween: Phaser.Tweens.Tween | null = null;

  private dronesRemainingText!: Phaser.GameObjects.Text;
  private minimap!: MinimapRenderer;

  // Boss telegraph overlay
  private telegraphOverlay: Phaser.GameObjects.Rectangle | null = null;
  private telegraphLabel: Phaser.GameObjects.Text | null = null;
  private telegraphMoveLabel: Phaser.GameObjects.Text | null = null;
  private telegraphPulse: Phaser.Tweens.Tween | null = null;

  // Pause elements
  private pauseBg!: Phaser.GameObjects.Rectangle;
  private pauseText!: Phaser.GameObjects.Text;
  private paused = false;

  // Game-over state
  private gameOverActive = false;
  private currentWave = 0;
  private currentScore = 0;
  private lastHp = 0;
  private ra2LowHpFired = false;

  constructor() {
    super({ key: 'UI', active: false });
  }

  create(): void {
    const W = GAME_W, H = GAME_H;
    this.gameOverActive = false;
    this.levelCompleteActive = false;
    this.titleActive = false;
    this.paused = false;
    this.naniteActive = false;
    this.currentWave = 0;
    this.currentScore = 0;
    this.lastHp = 0;
    this.ra2LowHpFired = false;

    // ── LEFT STAT PANEL (top-left) ────────────────────────────────
    // Vertical rhythm — same offsets reused by the right panel
    const panelX = PAD;                               // 12
    const barX   = panelX + PP;                       // 22

    const r0LblY = PAD + PP;                          // 22  — row 0 label (HP / MSL)
    const r0BarY = r0LblY + LABEL_H;                  // 38  — row 0 bar
    const r1LblY = r0BarY + BAR_H + ROW_GAP;          // 60  — row 1 label (JP / TRT)
    const r1BarY = r1LblY + LABEL_H;                  // 76  — row 1 bar
    const r2LblY = r1BarY + BAR_H2 + ROW_GAP;         // 94  — row 2 label (Nanoheal)
    const r2BarY = r2LblY + LABEL_H;                  // 110 — row 2 bar

    const panelW = PP + BAR_W + PP;                   // 220
    const panelH = r2BarY + BAR_H2 + PP - PAD;        // 118

    const leftPanel = this.add.graphics();
    leftPanel.fillStyle(0x000812, 0.85);
    leftPanel.fillRect(panelX, PAD, panelW, panelH);
    leftPanel.lineStyle(1, 0x1a3d5a, 0.8);
    leftPanel.strokeRect(panelX, PAD, panelW, panelH);

    // HP row
    this.healthLabel = this.add.text(barX, r0LblY, 'HP', {
      fontFamily: 'monospace', fontSize: '13px', color: '#ff4444',
    });
    this.healthValueText = this.add.text(barX + BAR_W, r0LblY, '', {
      fontFamily: 'monospace', fontSize: '11px', color: '#ff4444',
    }).setOrigin(1, 0);
    this.healthBg   = this.add.rectangle(barX, r0BarY, BAR_W, BAR_H, 0x330000).setOrigin(0, 0);
    this.healthFill = this.add.rectangle(barX, r0BarY, BAR_W, BAR_H, 0xff2222).setOrigin(0, 0);

    // JP row
    this.add.text(barX, r1LblY, 'JETPACK', {
      fontFamily: 'monospace', fontSize: '13px', color: '#44aaff',
    });
    this.add.rectangle(barX, r1BarY, BAR_W, BAR_H2, 0x001133).setOrigin(0, 0);
    this.jetpackBar = this.add.rectangle(barX, r1BarY, BAR_W, BAR_H2, 0x2299ff).setOrigin(0, 0);

    // Nanoheal row
    this.naniteLabel = this.add.text(barX, r2LblY, 'NANOHEAL', {
      fontFamily: 'monospace', fontSize: '13px', color: '#00cc66',
    });
    this.naniteBg  = this.add.rectangle(barX, r2BarY, BAR_W, BAR_H2, 0x001a0d).setOrigin(0, 0);
    this.naniteBar = this.add.rectangle(barX, r2BarY, BAR_W, BAR_H2, 0x00ff88).setOrigin(0, 0);

    // ── RIGHT STAT PANEL (top-right) ──────────────────────────────
    // Reuses r0LblY, r0BarY, r1LblY, r1BarY from the left-panel block above
    const panelRX     = W - PAD - panelW;             // 1688
    const barRX       = panelRX + PP;                 // 1698
    const rightPanelH = r1BarY + BAR_H2 + PP - PAD;  // 84  (2 rows: MSL + TRT)

    const rightPanel = this.add.graphics();
    rightPanel.fillStyle(0x000812, 0.85);
    rightPanel.fillRect(panelRX, PAD, panelW, rightPanelH);
    rightPanel.lineStyle(1, 0x1a3d5a, 0.8);
    rightPanel.strokeRect(panelRX, PAD, panelW, rightPanelH);

    // MSL row
    this.missileLabel = this.add.text(barRX, r0LblY, 'MISSILE', {
      fontFamily: 'monospace', fontSize: '13px', color: '#ffff44',
    });
    this.missileStateLabel = this.add.text(barRX + BAR_W, r0LblY, 'READY', {
      fontFamily: 'monospace', fontSize: '11px', color: '#00ffff',
    }).setOrigin(1, 0);
    this.missileBg  = this.add.rectangle(barRX, r0BarY, BAR_W, BAR_H, 0x333300).setOrigin(0, 0);
    this.missileBar = this.add.rectangle(barRX, r0BarY, BAR_W, BAR_H, 0xffff00).setOrigin(0, 0);

    // TRT row
    this.turretLabel = this.add.text(barRX, r1LblY, 'TURRET', {
      fontFamily: 'monospace', fontSize: '13px', color: '#ff8844',
    });
    this.turretBg  = this.add.rectangle(barRX, r1BarY, BAR_W, BAR_H2, 0x331100).setOrigin(0, 0);
    this.turretBar = this.add.rectangle(barRX, r1BarY, BAR_W, BAR_H2, 0xff6600).setOrigin(0, 0);

    // ── Score (top-center) ────────────────────────────────────────
    this.scoreText = this.add.text(W / 2, PAD, '0', {
      fontFamily: 'monospace', fontSize: '28px', color: '#ffffff',
      align: 'center',
    }).setOrigin(0.5, 0);

    // ── Persistent wave counter (below score) ─────────────────────
    this.waveCounter = this.add.text(W / 2, PAD + 32, '', {
      fontFamily: 'monospace', fontSize: '12px', color: '#666688',
      align: 'center',
    }).setOrigin(0.5, 0);

    // ── Drones remaining counter (below wave counter) ──────────────
    this.dronesRemainingText = this.add.text(W / 2, PAD + 52, '', {
      fontFamily: 'monospace', fontSize: '13px', color: '#ff4444',
      align: 'center',
    }).setOrigin(0.5, 0).setAlpha(0);

    // ── Controls hint (bottom-left) ───────────────────────────────
    this.add.text(PAD, H - PAD, 'A/D move  SPACE jump/jetpack  LMB turret  RMB rapid  E missile  ESC pause', {
      fontFamily: 'monospace', fontSize: '18px', color: '#556677',
    }).setOrigin(0, 1);

    // ── Wave announcement (big, fades out) ────────────────────────
    this.waveText = this.add.text(W / 2, H / 2 - 40, '', {
      fontFamily: 'monospace', fontSize: '36px', color: '#ff6666',
      align: 'center',
    }).setOrigin(0.5, 0.5).setAlpha(0).setDepth(30);

    // ── Pause overlay ─────────────────────────────────────────────
    this.pauseBg = this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.6)
      .setDepth(50).setVisible(false);
    this.pauseText = this.add.text(W / 2, H / 2, 'PAUSED\n\nESC to resume', {
      fontFamily: 'monospace', fontSize: '26px', color: '#8888cc',
      align: 'center',
    }).setOrigin(0.5, 0.5).setDepth(51).setVisible(false);

    // ── Listen for events from GameScene ──────────────────────────
    const game = this.scene.get('Game');

    game.events.on('healthChange', (hp: number, maxHp: number) => {
      this.healthFill.setDisplaySize(BAR_W * (hp / maxHp), BAR_H);
      this.healthValueText.setText(`${hp} / ${maxHp}`);
      if (!this.naniteActive) {
        const t = hp / maxHp;
        this.healthFill.setFillStyle(t > 0.5 ? 0xff2222 : t > 0.25 ? 0xff8800 : 0xff0000);
      }
      if (hp < this.lastHp) {
        this.cameras.main.flash(200, 220, 30, 30, false);
        // RA2 low-HP warning — fires once per life when dropping to ≤25%
        if (!this.ra2LowHpFired && hp > 0 && hp / maxHp <= 0.25) {
          this.ra2LowHpFired = true;
          this.time.delayedCall(300, () => {
            const gs = this.scene.get('Game') as GameScene;
            gs?.audio?.play('ra2-lowhp');
          });
        }
      }
      this.lastHp = hp;
    });

    game.events.on('missileCooldown', (progress: number) => {
      this.missileBar.setDisplaySize(BAR_W * progress, BAR_H);
      if (progress >= 1) {
        this.missileBar.setFillStyle(0x00ffff);
        this.missileLabel.setColor('#00ffff');
        this.missileStateLabel.setText('READY').setColor('#00ffff');
      } else {
        this.missileBar.setFillStyle(0xffff00);
        this.missileLabel.setColor('#888844');
        this.missileStateLabel.setText('recharging').setColor('#554400');
      }
    });

    game.events.on('turretCooldown', (progress: number) => {
      this.turretBar.setDisplaySize(BAR_W * progress, BAR_H2);
      if (progress >= 1) {
        this.turretBar.setFillStyle(0xff8844);
        this.turretLabel.setColor('#ff8844');
      } else {
        this.turretBar.setFillStyle(0x663311);
        this.turretLabel.setColor('#664422');
      }
    });

    game.events.on('jetpackFuel', (fuel: number, max: number) => {
      this.jetpackBar.setDisplaySize(BAR_W * (fuel / max), BAR_H2);
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
        const t = this.add.text(W / 2, 80, 'SURFACE OPS', {
          fontFamily: 'monospace', fontSize: '28px',
          color: '#6699ff',
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
        fontFamily: 'monospace', fontSize: '26px', color: '#ffff00',
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
      this.clearTelegraph();
      // RA2 kill voice line — brief delay so it lands after explosion audio
      this.time.delayedCall(400, () => {
        const gs = this.scene.get('Game') as GameScene;
        const picks = ['ra2-kill-1', 'ra2-kill-2', 'ra2-kill-3'] as const;
        gs?.audio?.play(picks[Math.floor(Math.random() * picks.length)]);
      });
      this.showLevelComplete();
    });

    game.events.on('bossTelegraph', ({ side, duration }: { side: 'left' | 'right'; duration: number }) => {
      this.clearTelegraph();
      const halfX = side === 'left' ? 0 : W / 2;
      this.telegraphOverlay = this.add.rectangle(halfX + W / 4, H / 2, W / 2, H, 0xff0000, 0.28)
        .setDepth(55).setScrollFactor(0);
      this.telegraphLabel = this.add.text(halfX + W / 4, H / 2 - 20, 'INCOMING', {
        fontFamily: 'monospace', fontSize: '30px', color: '#ff4444',
        stroke: '#000000', strokeThickness: 3,
      }).setOrigin(0.5).setDepth(56).setScrollFactor(0);
      this.telegraphMoveLabel = this.add.text(halfX + W / 4, H / 2 + 20, 'MOVE!', {
        fontFamily: 'monospace', fontSize: '18px', color: '#ffaa44',
      }).setOrigin(0.5).setDepth(56).setScrollFactor(0);
      this.telegraphPulse = this.tweens.add({
        targets: this.telegraphOverlay,
        alpha: { from: 0.12, to: 0.38 },
        duration: 350, yoyo: true, repeat: -1,
      });
      this.time.delayedCall(duration, () => this.clearTelegraph());
    });

    game.events.on('bossTelegraphCancel', () => this.clearTelegraph());

    game.events.on('bossBlastFired', ({ side, camScrollX }: { side: 'left' | 'right'; camScrollX: number }) => {
      this.clearTelegraph();
      const halfX = side === 'left' ? 0 : W / 2;
      const flash = this.add.rectangle(halfX + W / 4, H / 2, W / 2, H, 0xff3300, 0.85)
        .setDepth(57).setScrollFactor(0);
      this.tweens.add({
        targets: flash, alpha: 0, duration: 700, ease: 'Power2',
        onComplete: () => flash.destroy(),
      });
      this.cameras.main.flash(250, 255, 50, 0, false);

      // Damage player if they're still on the targeted half
      const gameScene = this.scene.get('Game') as GameScene;
      if (gameScene) {
        const screenX = gameScene.player.x - camScrollX;
        const onTargetSide = side === 'left' ? screenX < W / 2 : screenX >= W / 2;
        if (onTargetSide) {
          gameScene.player.takeDamage(3);
        }
      }
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

    // ── Radar minimap ─────────────────────────────────────────────
    this.minimap = new MinimapRenderer(this);

    this.showTitleScreen();
  }

  update(time: number, _delta: number): void {
    if (this.gameOverActive) return;
    // Re-fetch every frame — restart creates a new GameScene instance
    const game = this.scene.get('Game') as GameScene;
    if (!game || !game.sys.isActive()) return;
    this.minimap.draw(time, game);
  }

  private clearTelegraph(): void {
    this.telegraphOverlay?.destroy();   this.telegraphOverlay   = null;
    this.telegraphLabel?.destroy();     this.telegraphLabel     = null;
    this.telegraphMoveLabel?.destroy(); this.telegraphMoveLabel = null;
    this.telegraphPulse?.stop();        this.telegraphPulse     = null;
  }

  shutdown(): void {
    this.clearTelegraph();
    const gs = this.scene.get('Game');
    if (gs) {
      for (const ev of ['healthChange', 'missileCooldown', 'turretCooldown', 'jetpackFuel',
                        'naniteChange', 'scoreChange', 'waveStart', 'dronesRemaining',
                        'killStreak', 'gameOver', 'bossKilled',
                        'bossTelegraph', 'bossTelegraphCancel', 'bossBlastFired']) {
        gs.events.removeAllListeners(ev);
      }
    }
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
      this.naniteBar.setDisplaySize(BAR_W, BAR_H2);
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
      this.naniteBar.setDisplaySize(BAR_W * progress, BAR_H2);
      this.naniteBar.setFillStyle(0x003311);
    } else if (state === 'ready') {
      this.naniteActive = false;
      if (this.nanitePulseTween) {
        this.nanitePulseTween.stop();
        this.nanitePulseTween = null;
      }
      this.naniteBar.setAlpha(1);
      this.naniteBar.setDisplaySize(BAR_W, BAR_H2);
      this.naniteBar.setFillStyle(0x00ff88);
    }
  }

  private showTitleScreen(): void {
    if (this.titleActive) return;
    this.titleActive = true;

    const W = GAME_W, H = GAME_H;
    const titleObjs: Phaser.GameObjects.GameObject[] = [];

    // Mech silhouette watermark
    const cx = W / 2;
    const s  = H * 0.42;
    const gy = H * 0.75;
    const wm = this.add.graphics().setDepth(49).setScrollFactor(0);
    wm.fillStyle(0xff3311, 0.05);
    wm.fillRect(cx - s * 0.11, gy - s * 0.96, s * 0.22, s * 0.16); // head
    wm.fillRect(cx - s * 0.22, gy - s * 0.78, s * 0.44, s * 0.32); // body
    wm.fillRect(cx - s * 0.38, gy - s * 0.76, s * 0.16, s * 0.24); // left arm
    wm.fillRect(cx + s * 0.22, gy - s * 0.76, s * 0.16, s * 0.24); // right arm
    wm.fillRect(cx - s * 0.19, gy - s * 0.44, s * 0.15, s * 0.44); // left leg
    wm.fillRect(cx + s * 0.04, gy - s * 0.44, s * 0.15, s * 0.44); // right leg
    titleObjs.push(wm);

    // Logo with floating tween
    const logo = this.add.image(W / 2, 150, 'logo').setDepth(50).setScrollFactor(0);
    this.tweens.add({ targets: logo, y: 160, duration: 2000, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    titleObjs.push(logo);

    // Start prompt
    const prompt = this.add.text(W / 2, H * 0.58, 'PRESS  ENTER / SPACE  TO START', {
      fontFamily: 'monospace', fontSize: '26px', color: '#ff3311',
    }).setOrigin(0.5).setDepth(51).setScrollFactor(0);
    this.tweens.add({ targets: prompt, alpha: { from: 0.75, to: 1 }, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    titleObjs.push(prompt);

    // Version watermark
    const ver = this.add.text(W - 16, H - 16, `ALPHA v${__APP_VERSION__}`, {
      fontFamily: 'monospace', fontSize: '12px', color: '#334455',
    }).setOrigin(1, 1).setDepth(50).setScrollFactor(0);
    titleObjs.push(ver);

    // Title music
    const titleMusic = this.sound.add('music-title', { loop: true, volume: 0 }) as Phaser.Sound.WebAudioSound;
    titleMusic.play();
    this.tweens.add({ targets: titleMusic, volume: 0.6, duration: 1500, ease: 'Linear' });

    // Dismiss on ENTER, SPACE, or click
    let dismissed = false;
    const dismiss = () => {
      if (dismissed) return;
      dismissed = true;
      this.titleActive = false;
      this.input.keyboard!.off('keydown-ENTER', dismiss);
      this.input.keyboard!.off('keydown-SPACE', dismiss);
      this.input.off('pointerdown', dismiss);

      this.tweens.add({ targets: titleMusic, volume: 0, duration: 600, ease: 'Linear',
        onComplete: () => titleMusic.stop() });

      this.tweens.add({ targets: titleObjs, alpha: 0, duration: 400, ease: 'Power2',
        onComplete: () => titleObjs.forEach(o => o.destroy()) });

      const game = this.scene.get('Game') as GameScene;
      game.events.emit('titleDismissed');
      this.showControlsModal();
    };

    this.input.keyboard!.on('keydown-ENTER', dismiss);
    this.input.keyboard!.on('keydown-SPACE', dismiss);
    this.input.on('pointerdown', dismiss);
  }

  private showControlsModal(): void {
    this.scene.pause('Game');

    const W = GAME_W, H = GAME_H;
    const objs: Phaser.GameObjects.GameObject[] = [];
    const push = <T extends Phaser.GameObjects.GameObject>(o: T): T => { objs.push(o); return o; };

    // ── Overlay ───────────────────────────────────────────────────────────────
    push(this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.92).setDepth(60).setScrollFactor(0));

    // ── Scanline overlay ──────────────────────────────────────────────────────
    const gfx = push(this.add.graphics()).setDepth(60).setScrollFactor(0) as Phaser.GameObjects.Graphics;
    gfx.fillStyle(0x000000, 0.10);
    for (let y = 0; y < H; y += 4) gfx.fillRect(0, y, W, 2);

    // ── Header ────────────────────────────────────────────────────────────────
    push(this.add.text(W / 2, H * 0.10, 'GLOBAL DEFENSE INITIATIVE // MECH-IV', {
      fontFamily: 'monospace', fontSize: '13px', color: '#004400',
    }).setOrigin(0.5).setDepth(61).setScrollFactor(0));

    push(this.add.text(W / 2, H * 0.165, '[ CONTROLS ]', {
      fontFamily: 'monospace', fontSize: '38px', color: '#00ff41',
      stroke: '#002200', strokeThickness: 2,
    }).setOrigin(0.5).setDepth(61).setScrollFactor(0));

    push(this.add.text(W / 2, H * 0.24, '════════════════════════════════', {
      fontFamily: 'monospace', fontSize: '16px', color: '#004400',
    }).setOrigin(0.5).setDepth(61).setScrollFactor(0));

    // ── Bindings ──────────────────────────────────────────────────────────────
    const cx      = W / 2;
    const prefX   = cx - 190;   // ">" prefix
    const keyX    = cx - 95;    // keys right-align here
    const sepX    = cx - 75;    // "──" left-aligns here
    const actX    = cx - 30;    // action text left-aligns here
    const startY  = H * 0.32;
    const rowH    = 60;

    const bindings: [string, string, boolean?][] = [
      ['A / D',  'LOCOMOTION'],
      ['SPACE',  'VERTICAL THRUST'],
      ['LMB',    'TURRET FIRE'],
      ['RMB',    'RAPID SUPPRESSION'],
      ['E',      'HOMING MISSILES',  true],
      ['Q',      'NANITE REPAIR'],
      ['ESC',    'PAUSE / MENU'],
    ];

    bindings.forEach(([key, action, highlight], i) => {
      const y = startY + i * rowH;
      const keyCol  = highlight ? '#ffff44' : '#00ff41';
      const actCol  = highlight ? '#ffff44' : '#00cc33';
      push(this.add.text(prefX, y, '>',      { fontFamily: 'monospace', fontSize: '18px', color: '#004400' }).setOrigin(0, 0.5).setDepth(61).setScrollFactor(0));
      push(this.add.text(keyX,  y, key,      { fontFamily: 'monospace', fontSize: '18px', color: keyCol   }).setOrigin(1, 0.5).setDepth(61).setScrollFactor(0));
      push(this.add.text(sepX,  y, '\u2500\u2500', { fontFamily: 'monospace', fontSize: '18px', color: '#007700' }).setOrigin(0, 0.5).setDepth(61).setScrollFactor(0));
      push(this.add.text(actX,  y, action,   { fontFamily: 'monospace', fontSize: '18px', color: actCol   }).setOrigin(0, 0.5).setDepth(61).setScrollFactor(0));
    });

    // ── Dismiss ───────────────────────────────────────────────────────────────
    const dismissPrompt = push(this.add.text(W / 2, H * 0.92, 'press any key to engage_', {
      fontFamily: 'monospace', fontSize: '16px', color: '#005500',
    }).setOrigin(0.5).setDepth(61).setScrollFactor(0));
    const blinkTween = this.tweens.add({ targets: dismissPrompt, alpha: 0.15, duration: 600, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

    let dismissed = false;
    const dismiss = () => {
      if (dismissed) return;
      dismissed = true;
      this.input.keyboard!.off('keydown', dismiss);
      this.input.off('pointerdown', dismiss);
      blinkTween.stop();
      objs.forEach(o => o.destroy());
      this.scene.resume('Game');
      // RA2 "reporting" voice line on game start
      this.time.delayedCall(200, () => {
        const gs = this.scene.get('Game') as GameScene;
        const picks = ['ra2-start-1', 'ra2-start-2', 'ra2-start-3'] as const;
        gs?.audio?.play(picks[Math.floor(Math.random() * picks.length)]);
      });
    };

    this.input.keyboard!.on('keydown', dismiss);
    this.input.on('pointerdown', dismiss);
  }

  private showLevelComplete(): void {
    const gameScene = this.scene.get('Game') as GameScene;

    // Overlay
    const W = GAME_W, H = GAME_H;
    this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.75).setDepth(60);
    this.add.text(W / 2, H / 2 - 80, 'LEVEL COMPLETE', {
      fontFamily: 'monospace', fontSize: '40px', color: '#00ff88',
    }).setOrigin(0.5).setDepth(61);
    this.add.text(W / 2, H / 2 - 20, 'ALL CLEAR', {
      fontFamily: 'monospace', fontSize: '20px', color: '#aaffcc',
    }).setOrigin(0.5).setDepth(61);

    // Level complete stinger — low triumphant boom
    gameScene?.audio?.play('level-complete');

    // Return to title after 2000ms
    this.time.delayedCall(2000, () => {
      this.cameras.main.fade(500, 0, 0, 0, false, (_cam: unknown, progress: number) => {
        if (progress === 1) {
          gameScene.scene.start('Game');
          this.scene.restart();
        }
      });
    });
  }

  private showGameOver(): void {
    this.gameOverActive = true;
    this.ra2LowHpFired = true; // suppress any pending low-HP bark

    const W = GAME_W, H = GAME_H;

    // Red camera atmosphere
    this.cameras.main.flash(1200, 200, 0, 0, false);
    this.add.rectangle(W / 2, H / 2, W, H, 0x440000, 0.45).setDepth(59);
    this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.45).setDepth(60);

    // Somber death ambient
    const gs = this.scene.get('Game') as GameScene;
    gs?.audio?.startDeathAmbient();

    // RA2 "leaving" voice line
    this.time.delayedCall(800, () => {
      const gs2 = this.scene.get('Game') as GameScene;
      const picks = ['ra2-over-1', 'ra2-over-2'] as const;
      gs2?.audio?.play(picks[Math.floor(Math.random() * picks.length)]);
    });

    this.add.text(W / 2, H / 2 - 120, 'GAME OVER', {
      fontFamily: 'monospace', fontSize: '96px', color: '#ff2222',
      align: 'center',
    }).setOrigin(0.5, 0.5).setDepth(61);

    this.add.text(W / 2, H / 2 - 40, `SCORE: ${this.currentScore}`, {
      fontFamily: 'monospace', fontSize: '22px', color: '#ffffff',
      align: 'center',
    }).setOrigin(0.5, 0.5).setDepth(61);

    this.add.text(W / 2, H / 2, `WAVE: ${this.currentWave}`, {
      fontFamily: 'monospace', fontSize: '16px', color: '#8888aa',
      align: 'center',
    }).setOrigin(0.5, 0.5).setDepth(61);

    const restartText = this.add.text(W / 2, H / 2 + 80, 'PRESS R TO RESTART', {
      fontFamily: 'monospace', fontSize: '20px', color: '#4488ff',
      align: 'center',
    }).setOrigin(0.5, 0.5).setDepth(61);

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
