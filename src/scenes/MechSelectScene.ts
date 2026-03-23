import Phaser from 'phaser';
import type { MechType } from '../entities/Player';

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
    const mechs: MechConfig[] = [
      { key: 'mech',  name: 'STRIDER', desc: 'BATTLE MECH', animKey: 'idle' },
      { key: 'mech4', name: 'SCOUT',   desc: 'LIGHT MECH',  animKey: 'mech4-idle' },
    ];

    // Dark background
    this.add.rectangle(400, 225, 800, 450, 0x080818);

    // Title
    this.add.text(400, 48, 'SELECT MECH', {
      fontFamily: 'monospace',
      fontSize: '28px',
      color: '#00ccff',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    const boxW = 180;
    const boxH = 200;
    const centerY = 220;
    const centerXs = [255, 545];

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
      const spriteY = centerY - 30;
      const sprite = this.add.sprite(cx, spriteY, mech.key);
      sprite.setOrigin(0.5, 0.75);
      if (mech.key === 'mech') {
        sprite.setScale(0.75);
      } else {
        sprite.setScale(1.4);
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

    // Instruction text at bottom
    this.add.text(400, 410, 'A/D — SELECT    ENTER — CONFIRM', {
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
    });
    keyD.on('down', () => {
      this.selectedIndex = 1;
      this.updateSelection();
    });
    keyLeft.on('down', () => {
      this.selectedIndex = 0;
      this.updateSelection();
    });
    keyRight.on('down', () => {
      this.selectedIndex = 1;
      this.updateSelection();
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
    const mechType = mechs[this.selectedIndex].key;
    this.scene.start('Game', { mechType });
    this.scene.launch('UI');
  }
}
