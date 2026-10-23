// How each color of a database choice looks: a tag in cells and menus, a dot in the choices
// editor. Classes are written out in full so that Tailwind generates them.
import type { ChoiceColor } from '@tandem/shared'

export const CHOICE_COLOR_STYLES: Record<ChoiceColor, { label: string; tag: string; dot: string }> =
  {
    gray: {
      label: 'Gray',
      dot: 'bg-neutral-400',
      tag: 'bg-neutral-200 text-neutral-800 dark:bg-neutral-700 dark:text-neutral-100',
    },
    brown: {
      label: 'Brown',
      dot: 'bg-[#9a6a4f]',
      tag: 'bg-[#eee0da] text-[#5c3b23] dark:bg-[#4a3328] dark:text-[#f0d9cc]',
    },
    orange: {
      label: 'Orange',
      dot: 'bg-orange-500',
      tag: 'bg-orange-100 text-orange-800 dark:bg-orange-900/70 dark:text-orange-100',
    },
    yellow: {
      label: 'Yellow',
      dot: 'bg-yellow-400',
      tag: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/70 dark:text-yellow-100',
    },
    green: {
      label: 'Green',
      dot: 'bg-green-500',
      tag: 'bg-green-100 text-green-800 dark:bg-green-900/70 dark:text-green-100',
    },
    blue: {
      label: 'Blue',
      dot: 'bg-blue-500',
      tag: 'bg-blue-100 text-blue-800 dark:bg-blue-900/70 dark:text-blue-100',
    },
    purple: {
      label: 'Purple',
      dot: 'bg-purple-500',
      tag: 'bg-purple-100 text-purple-800 dark:bg-purple-900/70 dark:text-purple-100',
    },
    pink: {
      label: 'Pink',
      dot: 'bg-pink-500',
      tag: 'bg-pink-100 text-pink-800 dark:bg-pink-900/70 dark:text-pink-100',
    },
    red: {
      label: 'Red',
      dot: 'bg-red-500',
      tag: 'bg-red-100 text-red-800 dark:bg-red-900/70 dark:text-red-100',
    },
  }

/** The classes of a choice's tag: its color's, or none for a choice without one. */
export function choiceTagClass(color: ChoiceColor | undefined): string {
  return color ? `rounded px-1.5 ${CHOICE_COLOR_STYLES[color].tag}` : ''
}
