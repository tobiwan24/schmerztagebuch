import type { z } from 'zod';
import { slider } from './slider.js';
import { checkbox } from './checkbox.js';
import { multiselect } from './multiselect.js';
import { text } from './text.js';
import { textarea } from './textarea.js';
import { date } from './date.js';
import { bodymap } from './bodymap.js';
import type { BlockModule } from './common.js';

export const blockModules = { slider, checkbox, multiselect, text, textarea, date, bodymap } as const;

export type BlockType = keyof typeof blockModules;
export const BLOCK_TYPES = Object.keys(blockModules) as BlockType[];

type ModuleOf<K extends BlockType> = (typeof blockModules)[K];
export type BlockConfigOf<K extends BlockType> = ModuleOf<K> extends BlockModule<infer C, unknown> ? C : never;
export type BlockValueOf<K extends BlockType> = ModuleOf<K> extends BlockModule<BlockConfigOf<K>, infer V> ? V : never;

const moduleFor = <K extends BlockType>(type: K): BlockModule<BlockConfigOf<K>, BlockValueOf<K>> =>
  blockModules[type] as unknown as BlockModule<BlockConfigOf<K>, BlockValueOf<K>>;

/** Validiert und normalisiert eine Blockkonfiguration (Standardwerte werden ergänzt). Wirft bei Fehlern. */
export function parseBlockConfig<K extends BlockType>(type: K, raw: unknown): BlockConfigOf<K> {
  return moduleFor(type).config.parse(raw);
}

/** Validiert einen Blockwert gegen die (bereits validierte) Konfiguration. */
export function parseBlockValue<K extends BlockType>(
  type: K,
  config: BlockConfigOf<K>,
  raw: unknown,
): z.ZodSafeParseResult<BlockValueOf<K>> {
  return moduleFor(type).value(config).safeParse(raw);
}

export type { BlockModule } from './common.js';
export { idSchema, isoDateTime } from './common.js';
export type { SliderConfig } from './slider.js';
export type { CheckboxConfig, CheckboxValue } from './checkbox.js';
export type { MultiselectConfig, MultiselectValue } from './multiselect.js';
export type { TextConfig } from './text.js';
export type { TextareaConfig, TextareaValue } from './textarea.js';
export type { DateConfig, DateValue } from './date.js';
export type { BodymapConfig, BodymapValue } from './bodymap.js';
