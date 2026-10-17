import ConfirmDialog from '~/components/ConfirmDialog.vue'

type ConfirmOptions = InstanceType<typeof ConfirmDialog>['$props']

/** `await confirm({ title, … })` resolves to true when the user confirms. */
export function useConfirm() {
  const overlay = useOverlay()
  const dialog = overlay.create(ConfirmDialog)
  return async (options: ConfirmOptions): Promise<boolean> => {
    const instance = dialog.open(options)
    return Boolean(await instance.result)
  }
}
