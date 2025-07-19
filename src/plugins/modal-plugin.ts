// plugins/modalPlugin.ts
import { type App, ref, markRaw } from 'vue'

export type ModalEntry = {
  backdrop?: boolean
  closeOnBackdropClick?: boolean
  component: any
  componentProps?: Record<string, any>
  resolve: (result: boolean) => void
  id: symbol
}

export type OpenArgs = {
  component: any
  props?: Record<string, any>
  backdrop?: boolean
  closeOnBackdropClick?: boolean
}

const modalStack = ref<ModalEntry[]>([])

function openModal(args: OpenArgs) {
  let resolveFn!: (result: boolean) => void

  const id = Symbol('modal')
  const result = new Promise<boolean>((resolve) => {
    resolveFn = resolve
  })

  const close = (resultValue: boolean = false) => {
    const index = modalStack.value.findIndex((m) => m.id === id)
    if (index !== -1) {
      modalStack.value[index].resolve(resultValue)
      modalStack.value.splice(index, 1)
    }
  }

  const entry: ModalEntry = {
    backdrop: args.backdrop ?? false,
    closeOnBackdropClick: args.closeOnBackdropClick ?? true,
    id,
    component: markRaw(args.component),
    componentProps: {
      ...args.props,
      close
    },
    resolve: resolveFn
  }

  modalStack.value.push(entry)

  return {
    id,
    close,
    result
  }
}

function closeModal(id: symbol, result: boolean = false) {
  const index = modalStack.value.findIndex((m) => m.id === id)
  if (index !== -1) {
    const modal = modalStack.value[index]
    modal.resolve(result)
    modalStack.value.splice(index, 1)
  }
}

export default {
  install(app: App) {
    app.provide('modal', { openModal, closeModal, modalStack })
  }
}

export type ModalController = {
  openModal: typeof openModal
  closeModal: typeof closeModal
  modalStack: typeof modalStack
}
