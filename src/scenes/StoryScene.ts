import Phaser from 'phaser';
import { GAME_W, GAME_H } from '../constants';

const STORY_LINES = [
  'YEAR 2187',
  '',
  'LUNAR BASE MOONSEC — humanity\'s first permanent installation',
  'on the moon\'s dark side. Built to house the AEGIS defense grid',
  'and the NEXUS collective: a self-improving AI network trusted',
  'with the base\'s security.',
  '',
  'Three months ago: all contact lost.',
  '',
  'Recon images show the surface overrun by automated drones',
  'running NEXUS-class targeting protocols. Something inside',
  'activated full defense lockdown — and turned the guns inward.',
  '',
  'You are UNIT-7, last of the Ironclad Division.',
  'Your orders:',
  '',
  '  SURFACE OPS  —  Breach the perimeter. Clear the drones.',
  '  DARK SIDE    —  Find the core. End this.',
  '',
  'Reclaim what is ours.',
];

export class StoryScene extends Phaser.Scene {
  private inputLocked = false;

  constructor() {
    super({ key: 'Story' });
  }

  create(): void {
    // Fade out title music if it carried through the transition
    for (const m of this.sound.getAll('music-title') as Phaser.Sound.WebAudioSound[]) {
      if (m.isPlaying) {
        this.tweens.add({ targets: m, volume: 0, duration: 800, ease: 'Linear',
          onComplete: () => m.stop() });
      }
    }

    const W = GAME_W, H = GAME_H;
    this.input.keyboard!.removeAllListeners();
    this.inputLocked = false;

    // Background — slightly darker than title for gravitas
    this.add.rectangle(W/2, H/2, W, H, 0x010108).setDepth(0);

    // Reuse star textures if already created by TitleScene
    if (this.textures.exists('title-stars-far')) {
      this.add.image(W/2, H/2, 'title-stars-far').setDepth(1).setAlpha(0.4);
    }

    // Story text block — centered column, top-anchored
    const startY = 90;
    const lineH  = 42;

    STORY_LINES.forEach((line, i) => {
      const isHeader = i === 0;
      const isOrder  = line.startsWith('  SURFACE OPS') || line.startsWith('  DARK SIDE');

      const color = isHeader ? '#00ccff' : isOrder ? '#aaffcc' : '#8899aa';
      const size  = isHeader ? '32px' : '22px';

      if (line !== '') {
        this.add.text(W/2, startY + i * lineH, line, {
          fontFamily: 'monospace',
          fontSize: size,
          color,
        }).setOrigin(0.5, 0).setDepth(10);
      }
    });

    // Continue prompt — pulsing at bottom
    const prompt = this.add.text(W/2, H - 80, '[ ENTER / SPACE  —  CONTINUE ]', {
      fontFamily: 'monospace',
      fontSize: '20px',
      color: '#4488ff',
    }).setOrigin(0.5).setDepth(10);

    this.tweens.add({
      targets: prompt,
      alpha: 0.3,
      duration: 900,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    // ESC hint
    this.add.text(16, H - 16, 'ESC — BACK', {
      fontFamily: 'monospace',
      fontSize: '13px',
      color: '#334455',
    }).setOrigin(0, 1).setDepth(10);

    // Input
    this.input.keyboard!.on('keydown-ENTER', () => this.proceed());
    this.input.keyboard!.on('keydown-SPACE', () => this.proceed());
    this.input.keyboard!.on('keydown-ESC',   () => this.back());

    // Fade in
    this.cameras.main.setAlpha(0);
    this.tweens.add({
      targets: this.cameras.main,
      alpha: 1,
      duration: 500,
      ease: 'Power2',
    });
  }

  private proceed(): void {
    if (this.inputLocked) return;
    this.inputLocked = true;
    this.cameras.main.fadeOut(400, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.scene.start('Game', { mechType: 'mech4', level: 1 });
      this.scene.launch('UI');
    });
  }

  private back(): void {
    if (this.inputLocked) return;
    this.inputLocked = true;
    this.cameras.main.fadeOut(300, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.scene.start('Title');
    });
  }
}
