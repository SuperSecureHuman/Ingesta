import type { Variants } from 'framer-motion';

export const gridContainer: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.04 } },
};

export const gridItem: Variants = {
  hidden: { opacity: 0, y: 16, scale: 0.97 },
  show: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: 0.22, ease: [0.25, 0.1, 0.25, 1] },
  },
};
