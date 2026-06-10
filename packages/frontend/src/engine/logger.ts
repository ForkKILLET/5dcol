import { Disposable, Empty } from '@/utils'

export interface GameMessage {
  type: 'info' | 'warn' | 'error'
  text: string
}

const CONSOLE_LOG_PREFIX = '[5dcol] '

export class Logger extends Disposable(Empty) {
  constructor(public messages: GameMessage[] = []) {
    super()
  }

  info(text: string) {
    console.info(CONSOLE_LOG_PREFIX + text)
    this.messages.unshift({ type: 'info', text })
  }

  warn(text: string) {
    console.warn(CONSOLE_LOG_PREFIX + text)
    this.messages.unshift({ type: 'warn', text })
  }

  error(text: string) {
    console.error(CONSOLE_LOG_PREFIX + text)
    this.messages.unshift({ type: 'error', text })
  }
}

