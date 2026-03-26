import { TREE_NODES } from '../data/upgradeTree';

const SAVE_KEY = 'moonsec-progression';
const LEGACY_KEY = 'moonsec-highscore';

interface SaveData {
  scoreBank: number;
  ownedNodes: string[];
  highScore: number;
}

export class ProgressionSystem {
  private data: SaveData;

  constructor() {
    this.data = this.load();
  }

  private load(): SaveData {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) {
      try {
        return JSON.parse(raw) as SaveData;
      } catch {
        // corrupt save — reset
      }
    }
    const legacy = localStorage.getItem(LEGACY_KEY);
    return {
      scoreBank: 0,
      ownedNodes: [],
      highScore: legacy ? parseInt(legacy, 10) : 0,
    };
  }

  private save(): void {
    localStorage.setItem(SAVE_KEY, JSON.stringify(this.data));
  }

  get scoreBank(): number { return this.data.scoreBank; }
  get ownedNodes(): string[] { return [...this.data.ownedNodes]; }
  get highScore(): number { return this.data.highScore; }

  addScore(n: number): void {
    this.data.scoreBank += n;
    this.save();
  }

  updateHighScore(score: number): void {
    if (score > this.data.highScore) {
      this.data.highScore = score;
      this.save();
    }
  }

  resetData(): void {
    this.data = { scoreBank: 0, ownedNodes: [], highScore: 0 };
    localStorage.removeItem(SAVE_KEY);
    localStorage.removeItem(LEGACY_KEY);
  }

  buyNode(id: string): boolean {
    const node = TREE_NODES.find(n => n.id === id);
    if (!node) return false;
    if (this.data.ownedNodes.includes(id)) return false;
    if (this.data.scoreBank < node.cost) return false;
    if (node.tier > 0) {
      const prereq = TREE_NODES.find(n => n.col === node.col && n.tier === node.tier - 1);
      if (prereq && !this.data.ownedNodes.includes(prereq.id)) return false;
    }
    this.data.scoreBank -= node.cost;
    this.data.ownedNodes.push(id);
    this.save();
    return true;
  }
}
