// The widths blocks of a note need (databases: the sum of their columns), by block: the note's
// page provides it and goes full width while one is wider than the text.
import type { InjectionKey } from 'vue'

export const BLOCK_WIDTHS: InjectionKey<Map<symbol, number>> = Symbol('block widths')
