import { describe, expect, it, vi } from 'vitest';

vi.mock('phaser', () => {
  class Controller {
    active = true;
    constructor(public camera: unknown, public renderNode: string) {}
  }
  class BaseFilterShader {
    programManager = { setUniform: vi.fn() };
    constructor(..._args: unknown[]) {}
  }
  return {
    default: {
      WEBGL: 2, CANVAS: 1,
      Filters: { Controller },
      Renderer: { WebGL: { RenderNodes: { BaseFilterShader } } },
    },
  };
});

const { installPipeline } = await import('../render/RenderPipeline');
const { DEFAULT_GRAPHICS, toggleView, nextPreset } = await import('../render/GraphicsSettings');

function fakeScene(rendererType: number) {
  const added: unknown[] = [];
  const camera = { filters: { external: { add: (c: unknown) => { added.push(c); return c; } } } };
  const scene = { sys: { game: { renderer: { type: rendererType } } } };
  return { scene, camera, added };
}

describe('installPipeline', () => {
  it('adds one retro filter to the camera on WebGL', () => {
    const { scene, camera, added } = fakeScene(2);
    const p = installPipeline(scene as never, camera as never, 'world');
    expect(added).toHaveLength(1);
    expect(p.retro).toBe(added[0]);
    expect(p.retro).toMatchObject({ renderNode: 'FilterRetro', block: 2, quantize: true, spread: 1, hardAlpha: false });
  });

  it('adds nothing on the Canvas renderer', () => {
    const { scene, camera, added } = fakeScene(1);
    const p = installPipeline(scene as never, camera as never, 'world');
    expect(added).toHaveLength(0);
    expect(p.retro).toBeUndefined();
    expect(() => p.apply(DEFAULT_GRAPHICS)).not.toThrow();
  });

  it('keeps UI crisp: no dither, no grid, hard alpha', () => {
    const { scene, camera } = fakeScene(2);
    const p = installPipeline(scene as never, camera as never, 'ui');
    expect(p.retro).toMatchObject({ block: 1, spread: 0, hardAlpha: true, quantize: true });
  });

  it('follows settings changes', () => {
    const { scene, camera } = fakeScene(2);
    const p = installPipeline(scene as never, camera as never, 'world');
    p.apply(toggleView(DEFAULT_GRAPHICS));
    expect(p.retro!.block).toBe(3);
    p.apply(nextPreset(DEFAULT_GRAPHICS)); // clean
    expect(p.retro!.active).toBe(false);
  });
});
