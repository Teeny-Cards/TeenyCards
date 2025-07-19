import { inject } from 'vue'
import type { ModalController } from '@/plugins/modal-plugin'

export function useModal(): ModalController {
  const modal = inject<ModalController>('modal')
  if (!modal) throw new Error('Modal plugin not provided')
  return modal
}
