import type { Transition, Variants } from 'framer-motion';

export const spring = {
  snappy:  { type: 'spring', stiffness: 500, damping: 35, mass: 0.8 } as Transition,
  smooth:  { type: 'spring', stiffness: 300, damping: 30, mass: 1.0 } as Transition,
  bouncy:  { type: 'spring', stiffness: 400, damping: 20, mass: 0.9 } as Transition,
  slow:    { type: 'spring', stiffness: 200, damping: 40, mass: 1.2 } as Transition,
};

export const tween = {
  fast:   { type: 'tween', duration: 0.1, ease: 'easeOut' } as Transition,
  normal: { type: 'tween', duration: 0.18, ease: 'easeOut' } as Transition,
  slow:   { type: 'tween', duration: 0.3, ease: 'easeOut' } as Transition,
};

export const fadeIn: Variants = {
  hidden:  { opacity: 0 },
  visible: { opacity: 1, transition: tween.normal },
  exit:    { opacity: 0, transition: tween.fast },
};

export const fadeUp: Variants = {
  hidden:  { opacity: 0, y: 8 },
  visible: { opacity: 1, y: 0, transition: spring.smooth },
  exit:    { opacity: 0, y: -4, transition: tween.fast },
};

export const slideInRight: Variants = {
  hidden:  { opacity: 0, x: 16 },
  visible: { opacity: 1, x: 0, transition: spring.smooth },
  exit:    { opacity: 0, x: 8, transition: tween.fast },
};

export const scaleIn: Variants = {
  hidden:  { opacity: 0, scale: 0.93 },
  visible: { opacity: 1, scale: 1, transition: spring.snappy },
  exit:    { opacity: 0, scale: 0.96, transition: tween.fast },
};

export const staggerContainer: Variants = {
  hidden:  {},
  visible: { transition: { staggerChildren: 0.04, delayChildren: 0.04 } },
};

export const staggerItem: Variants = {
  hidden:  { opacity: 0, y: 6 },
  visible: { opacity: 1, y: 0, transition: spring.snappy },
};

export const messageIn: Variants = {
  hidden:  { opacity: 0, y: 12, scale: 0.97 },
  visible: { opacity: 1, y: 0, scale: 1, transition: spring.snappy },
};

export const panelIn: Variants = {
  hidden:  { opacity: 0, scale: 0.96, y: 8 },
  visible: { opacity: 1, scale: 1, y: 0, transition: spring.smooth },
  exit:    { opacity: 0, scale: 0.97, y: 4, transition: tween.fast },
};

export const sidebarExpand: Variants = {
  collapsed: { width: '3.5rem' },
  expanded:  { width: '13rem', transition: spring.smooth },
};

export const agentPulse: Variants = {
  idle:   { scale: 1, opacity: 0.7 },
  active: {
    scale: [1, 1.8, 1],
    opacity: [0.7, 0, 0.7],
    transition: { duration: 1.6, repeat: Infinity, ease: 'easeInOut' },
  },
};
