import { describe, it, expect } from 'vitest';
import { clampBody } from './sanitize.js';

describe('clampBody', () => {
  it('caps string length', () => {
    expect(clampBody('x'.repeat(600))).toHaveLength(500);
  });
  it('caps array length', () => {
    expect(clampBody(new Array(50).fill(1))).toHaveLength(20);
  });
  it('caps object width', () => {
    const wide = Object.fromEntries(Array.from({ length: 60 }, (_, i) => [`k${i}`, i]));
    expect(Object.keys(clampBody(wide))).toHaveLength(40);
  });
  it('truncates excessive nesting depth to null', () => {
    const deep = { a: { b: { c: { d: { e: { f: { g: 1 } } } } } } };
    expect(clampBody(deep).a.b.c.d.e.f).toBeNull();
  });
  it('passes primitives through', () => {
    expect(clampBody(42)).toBe(42);
    expect(clampBody(true)).toBe(true);
    expect(clampBody(null)).toBeNull();
  });
  it('preserves numbers inside objects while clamping strings', () => {
    expect(clampBody({ n: 5, s: 'y'.repeat(600) })).toEqual({ n: 5, s: 'y'.repeat(500) });
  });
});
