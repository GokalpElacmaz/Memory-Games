import React from 'react';
import Svg, { Circle, Polygon, Rect } from 'react-native-svg';

export type ShapeKind = 'circle' | 'square' | 'diamond' | 'triangle' | 'hexagon' | 'star';

export const shapeKinds: ShapeKind[] = [
  'circle',
  'diamond',
  'star',
  'square',
  'hexagon',
  'triangle',
];

/** Regular polygon points inside a 100×100 box, first vertex straight up. */
function regular(sides: number, radius: number, rotationDeg = -90): string {
  return Array.from({ length: sides }, (_, i) => {
    const angle = ((360 / sides) * i + rotationDeg) * (Math.PI / 180);
    return `${(50 + radius * Math.cos(angle)).toFixed(2)},${(50 + radius * Math.sin(angle)).toFixed(2)}`;
  }).join(' ');
}

/** Alternating outer/inner vertices — the burst-style star. */
function star(points: number, outer: number, inner: number): string {
  return Array.from({ length: points * 2 }, (_, i) => {
    const radius = i % 2 === 0 ? outer : inner;
    const angle = ((180 / points) * i - 90) * (Math.PI / 180);
    return `${(50 + radius * Math.cos(angle)).toFixed(2)},${(50 + radius * Math.sin(angle)).toFixed(2)}`;
  }).join(' ');
}

const POLYGONS: Partial<Record<ShapeKind, string>> = {
  diamond: '50,2 98,50 50,98 2,50',
  triangle: '50,6 95,90 5,90',
  // Flat-top hexagon: a vertex at each side, so it reads clearly at small sizes.
  hexagon: regular(6, 48, 0),
  star: star(8, 49, 33),
};

/** A flat coloured shape sized to `size`, used by the odd-one-out games. */
export function Shape({ kind, size, color }: { kind: ShapeKind; size: number; color: string }) {
  const points = POLYGONS[kind];
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      {kind === 'circle' && <Circle cx={50} cy={50} r={48} fill={color} />}
      {kind === 'square' && <Rect x={4} y={4} width={92} height={92} rx={4} fill={color} />}
      {points && <Polygon points={points} fill={color} />}
    </Svg>
  );
}
