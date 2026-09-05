import { describe, expect, it, vi } from 'vitest';
import * as motion from '../lib/motion';

describe('lib/motion', () => {
  it('exports spring transitions', () => {
    expect(motion.spring.snappy).toBeDefined();
    expect(motion.spring.smooth).toBeDefined();
    expect(motion.spring.bouncy).toBeDefined();
    expect(motion.spring.slow).toBeDefined();
  });

  it('spring.snappy has correct config', () => {
    expect(motion.spring.snappy.type).toBe('spring');
    expect(motion.spring.snappy.stiffness).toBe(500);
    expect(motion.spring.snappy.damping).toBe(35);
    expect(motion.spring.snappy.mass).toBe(0.8);
  });

  it('spring.smooth has correct config', () => {
    expect(motion.spring.smooth.type).toBe('spring');
    expect(motion.spring.smooth.stiffness).toBe(300);
    expect(motion.spring.smooth.damping).toBe(30);
    expect(motion.spring.smooth.mass).toBe(1.0);
  });

  it('spring.bouncy has correct config', () => {
    expect(motion.spring.bouncy.type).toBe('spring');
    expect(motion.spring.bouncy.stiffness).toBe(400);
    expect(motion.spring.bouncy.damping).toBe(20);
  });

  it('spring.slow has correct config', () => {
    expect(motion.spring.slow.type).toBe('spring');
    expect(motion.spring.slow.stiffness).toBe(200);
    expect(motion.spring.slow.damping).toBe(40);
  });

  it('exports tween transitions', () => {
    expect(motion.tween.fast).toBeDefined();
    expect(motion.tween.normal).toBeDefined();
    expect(motion.tween.slow).toBeDefined();
  });

  it('tween.fast has correct config', () => {
    expect(motion.tween.fast.type).toBe('tween');
    expect(motion.tween.fast.duration).toBe(0.1);
    expect(motion.tween.fast.ease).toBe('easeOut');
  });

  it('tween.normal has correct config', () => {
    expect(motion.tween.normal.type).toBe('tween');
    expect(motion.tween.normal.duration).toBe(0.18);
  });

  it('tween.slow has correct config', () => {
    expect(motion.tween.slow.type).toBe('tween');
    expect(motion.tween.slow.duration).toBe(0.3);
  });

  it('exports fadeIn variants', () => {
    expect(motion.fadeIn.hidden).toEqual({ opacity: 0 });
    expect(motion.fadeIn.visible.opacity).toBe(1);
    expect(motion.fadeIn.exit.opacity).toBe(0);
  });

  it('exports fadeUp variants', () => {
    expect(motion.fadeUp.hidden).toEqual({ opacity: 0, y: 8 });
    expect(motion.fadeUp.visible.opacity).toBe(1);
    expect(motion.fadeUp.visible.y).toBe(0);
  });

  it('exports slideInRight variants', () => {
    expect(motion.slideInRight.hidden).toEqual({ opacity: 0, x: 16 });
    expect(motion.slideInRight.visible.x).toBe(0);
  });

  it('exports scaleIn variants', () => {
    expect(motion.scaleIn.hidden.scale).toBe(0.93);
    expect(motion.scaleIn.visible.scale).toBe(1);
  });

  it('exports staggerContainer variants', () => {
    expect(motion.staggerContainer.hidden).toEqual({});
    expect(motion.staggerContainer.visible.transition.staggerChildren).toBe(0.04);
    expect(motion.staggerContainer.visible.transition.delayChildren).toBe(0.04);
  });

  it('exports staggerItem variants', () => {
    expect(motion.staggerItem.hidden).toEqual({ opacity: 0, y: 6 });
    expect(motion.staggerItem.visible.y).toBe(0);
  });

  it('exports messageIn variants', () => {
    expect(motion.messageIn.hidden).toEqual({ opacity: 0, y: 12, scale: 0.97 });
    expect(motion.messageIn.visible.scale).toBe(1);
  });

  it('exports panelIn variants', () => {
    expect(motion.panelIn.hidden.scale).toBe(0.96);
    expect(motion.panelIn.visible.scale).toBe(1);
    expect(motion.panelIn.exit.scale).toBe(0.97);
  });

  it('exports sidebarExpand variants', () => {
    expect(motion.sidebarExpand.collapsed.width).toBe('3.5rem');
    expect(motion.sidebarExpand.expanded.width).toBe('13rem');
  });

  it('exports agentPulse variants', () => {
    expect(motion.agentPulse.idle.scale).toBe(1);
    expect(motion.agentPulse.active.scale).toEqual([1, 1.8, 1]);
    expect(motion.agentPulse.active.transition.repeat).toBe(Infinity);
  });
});
