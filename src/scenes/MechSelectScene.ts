import Phaser from 'phaser';

export class MechSelectScene extends Phaser.Scene {
  constructor() {
    super({ key: 'MechSelect' });
  }

  create(): void {
    this.add.text(400, 225, 'LOADING MECH SELECT...', {
      fontFamily: 'monospace', fontSize: '14px', color: '#4488ff',
    }).setOrigin(0.5);
  }
}
