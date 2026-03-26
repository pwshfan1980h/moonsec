import Phaser from 'phaser';
import type { MechType } from '../entities/Player';
import { MECH_STATS, GAME_W, GAME_H } from '../constants';

interface MechConfig {
  key: MechType;
  name: string;
  desc: string;
  animKey: string;
}

export class MechSelectScene extends Phaser.Scene {
  private selectedIndex = 0;

  private boxes: Phaser.GameObjects.Rectangle[] = [];
  private borders: Phaser.GameObjects.Rectangle[] = [];
  private nameTexts: Phaser.GameObjects.Text[] = [];
  private sprites: Phaser.GameObjects.Sprite[] = [];

  constructor() {
    super({ key: 'MechSelect' });
  }

  create(): void {
    const W = GAME_W, H = GAME_H;
    const mechs: MechConfig[] = [
      { key: 'mech',  name: 'STRIDER', desc: 'BATTLE MECH', animKey: 'idle' },
      { key: 'mech4', name: 'SCOUT',   desc: 'LIGHT MECH',  animKey: 'mech4-idle' },
    ];

    // Dark background
    this.add.rectangle(W/2, H/2, W, H, 0x080818);

    // Title
    this.add.text(W/2, 48, 'SELECT MECH', {
      fontFamily: 'monospace',
      fontSize: '28px',
      color: '#00ccff',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    const boxW = 300;
    const boxH = 440;
    const centerY = Math.round(H * 0.50);
    const centerXs = [Math.round(W * 0.32), Math.round(W * 0.68)];

    for (let i = 0; i < mechs.length; i++) {
      const mech = mechs[i];
      const cx = centerXs[i];

      // Box background
      const box = this.add.rectangle(cx, centerY, boxW, boxH, 0x0a0a1a, 0);
      this.boxes.push(box);

      // Border rectangle (no fill)
      const border = this.add.rectangle(cx, centerY, boxW, boxH);
      border.setFillStyle(0, 0); // fully transparent fill
      this.borders.push(border);

      // Mech sprite — positioned in upper portion of box
      const spriteY = centerY - 60;
      const sprite = this.add.sprite(cx, spriteY, mech.key);
      sprite.setOrigin(0.5, 0.75);
      if (mech.key === 'mech') {
        sprite.setScale(0.3);
      } else {
        sprite.setScale(0.7);
      }
      sprite.play({ key: mech.animKey, repeat: -1 });
      this.sprites.push(sprite);

      // Mech name text
      const nameText = this.add.text(cx, centerY + 70, mech.name, {
        fontFamily: 'monospace',
        fontSize: '16px',
        color: '#445566',
        fontStyle: 'bold',
      }).setOrigin(0.5);
      this.nameTexts.push(nameText);

      // Descriptor text
      this.add.text(cx, centerY + 92, mech.desc, {
        fontFamily: 'monospace',
        fontSize: '11px',
        color: '#334455',
      }).setOrigin(0.5);

      // Click to confirm selection
      box.setInteractive({ useHandCursor: true });
      box.on('pointerdown', () => {
        this.selectedIndex = i;
        this.updateSelection();
        this.confirmSelection(mechs);
      });
    }

    // Stat bars
    const BAR_W = 130;
    const BAR_H = 5;
    const barY0 = centerY + 128; // first stat bar row

    const addStatBar = (
      cx: number, y: number,
      label: string, fill: number, ratio: number,
      badge: string, badgeColor: string
    ) => {
      this.add.text(cx - BAR_W / 2, y - 13, label, {
        fontFamily: 'monospace', fontSize: '9px', color: '#5588aa',
      }).setOrigin(0, 0);
      // Track background
      this.add.rectangle(cx, y + BAR_H / 2, BAR_W, BAR_H, 0x0d1f2d).setOrigin(0.5, 0.5);
      // Fill bar (left-anchored)
      this.add.rectangle(cx - BAR_W / 2 + (BAR_W * ratio) / 2, y + BAR_H / 2, BAR_W * ratio, BAR_H, fill).setOrigin(0.5, 0.5);
      // Badge text
      this.add.text(cx + BAR_W / 2 + 6, y - 2, badge, {
        fontFamily: 'monospace', fontSize: '8px', color: badgeColor,
      }).setOrigin(0, 0);
    };

    const mechKeys = ['mech', 'mech4'] as const;
    mechKeys.forEach((key, i) => {
      const cx = centerXs[i];
      const stats = MECH_STATS[key];
      const isStrider = key === 'mech';

      // HP — ceiling is Scout max (5)
      addStatBar(cx, barY0,      'HP',        0xff3333, stats.maxHp / 5,
        isStrider ? '▼ –2' : '— 5',   isStrider ? '#ff5555' : '#5588aa');
      // Speed — ceiling is Strider max (440)
      addStatBar(cx, barY0 + 22, 'SPEED',     0xffcc00, stats.walkSpeed / 440,
        isStrider ? '▲ 2×' : '— base', isStrider ? '#00ff88' : '#5588aa');
      // Jetpack — ceiling is Strider max (4400)
      addStatBar(cx, barY0 + 44, 'JETPACK',   0x2299ff, stats.jetpackMaxFuel / 4400,
        isStrider ? '▲ 2×' : '— base', isStrider ? '#00ff88' : '#5588aa');
      // Nanite CD — same for both
      addStatBar(cx, barY0 + 66, 'NANITE CD', 0x00ff88, 0.65,
        '— 20s', '#5588aa');
    });

    // Instruction text at bottom
    this.add.text(W/2, H - 48, 'A/D — SELECT    ENTER — CONFIRM', {
      fontFamily: 'monospace',
      fontSize: '13px',
      color: '#446677',
    }).setOrigin(0.5);

    // Keyboard input
    const keyA     = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.A);
    const keyD     = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.D);
    const keyLeft  = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.LEFT);
    const keyRight = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.RIGHT);
    const keyEnter = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.ENTER);

    keyA.on('down', () => {
      this.selectedIndex = 0;
      this.updateSelection();
      this.sound.play('ui-nav', { volume: 0.25 });
    });
    keyD.on('down', () => {
      this.selectedIndex = 1;
      this.updateSelection();
      this.sound.play('ui-nav', { volume: 0.25 });
    });
    keyLeft.on('down', () => {
      this.selectedIndex = 0;
      this.updateSelection();
      this.sound.play('ui-nav', { volume: 0.25 });
    });
    keyRight.on('down', () => {
      this.selectedIndex = 1;
      this.updateSelection();
      this.sound.play('ui-nav', { volume: 0.25 });
    });
    keyEnter.on('down', () => {
      this.confirmSelection(mechs);
    });

    // Apply initial selection state
    this.updateSelection();
  }

  private updateSelection(): void {
    for (let i = 0; i < this.borders.length; i++) {
      if (i === this.selectedIndex) {
        this.borders[i].setStrokeStyle(2, 0x00ccff);
        this.nameTexts[i].setColor('#00ccff');
      } else {
        this.borders[i].setStrokeStyle(1, 0x334455);
        this.nameTexts[i].setColor('#445566');
      }
    }
  }

  private confirmSelection(mechs: MechConfig[]): void {
    this.sound.play('ui-confirm', { volume: 0.40 });
    const mechType = mechs[this.selectedIndex].key;
    this.scene.start('Game', { mechType });
    this.scene.launch('UI');
  }
}
