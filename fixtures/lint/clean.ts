import type { Clock } from '@stb/core';
export const later = (clock: Clock): number => clock.now() + 1;
