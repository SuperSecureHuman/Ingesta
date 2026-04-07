'use client';

import React, { useState } from 'react';

interface StarRatingProps {
  rating: number;           // 0–5; 0 = no rating
  onChange?: (rating: number) => void;  // if undefined, read-only
  size?: 'sm' | 'md';      // default 'sm' (w-3.5 h-3.5)
}

const STAR_PATH = 'M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01z';

export default function StarRating({ rating, onChange, size = 'sm' }: StarRatingProps) {
  const [hovered, setHovered] = useState(0);
  const isReadOnly = !onChange;
  const sizeClass = size === 'sm' ? 'w-3.5 h-3.5' : 'w-5 h-5';
  const displayRating = (!isReadOnly && hovered > 0) ? hovered : rating;

  return (
    <div
      className={`flex items-center gap-0.5 mt-1.5 ${isReadOnly ? 'cursor-default' : 'cursor-pointer'}`}
      onMouseLeave={() => !isReadOnly && setHovered(0)}
    >
      {[1, 2, 3, 4, 5].map(n => (
        <svg
          key={n}
          className={`${sizeClass} transition-colors ${n <= displayRating ? 'text-amber-400' : 'text-zinc-600'} ${!isReadOnly ? 'hover:text-amber-300' : ''}`}
          viewBox="0 0 24 24"
          fill="currentColor"
          onMouseEnter={() => !isReadOnly && setHovered(n)}
          onClick={() => !isReadOnly && onChange?.(n === rating ? 0 : n)}
          aria-label={isReadOnly ? `${rating} stars` : `Rate ${n} stars`}
        >
          <path d={STAR_PATH} />
        </svg>
      ))}
    </div>
  );
}
