import { Disposable, Empty } from '@/utils'

export interface GameMessage {
  type: 'info' | 'error'
  text: string
}

export class Logger extends Disposable(Empty) {
  constructor(public messages: GameMessage[] = []) {
    super()
  }

  info(text: string) {
    this.messages.unshift({ type: 'info', text })
  }

  error(text: string) {
    this.messages.unshift({ type: 'error', text })
  }
}

