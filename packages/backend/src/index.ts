import { createBackendServer } from './server.ts'

const port = Number(process.env.PORT ?? 5161)
const host = process.env.HOST

const server = createBackendServer({
  port,
  host,
})

const SIGNALS: NodeJS.Signals[] = ['SIGINT', 'SIGTERM']

const exit = () => {
  server.close()
  process.exit(0)
}

const start = () => {
  server.listen()
  SIGNALS.forEach(signal => process.on(signal, exit))
}

const stop = () => {
  server.close()
  SIGNALS.forEach(signal => process.off(signal, exit))
}

if (import.meta.hot) {
  import.meta.hot.accept()
  import.meta.hot.dispose(stop)
}

start()
