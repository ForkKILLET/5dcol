import { type Logger } from '@engine/logger'
import type { AssetLoadProgressCallback } from '@engine/assets'

export const SOUND_NAME_LIST = [
  'ambience.ogg',
  'animation_activate.ogg',
  'bell.ogg',
  'cym_whoosh.ogg',
  'fanfare.ogg',
  'guiro_long.ogg',
  'guiro_short.ogg',
  'lightswitch.ogg',
  'paper_shuffle.ogg',
  'timpani_hit_a2.ogg',
  'timpani_hit_c3.ogg',
  'timpani_hit_e3.ogg',
  'timpani_hit_e3_delayed.ogg',
  'timpani_hit_f3.ogg',
  'timpani_hit_g2.ogg',
  'timpani_roll_f3.ogg',
  'vibraslap_long.ogg',
  'vibraslap_short.ogg',
  'violin_tremolo_as3.ogg',
  'violin_tremolo_cs3.ogg',
  'wind.ogg',
  'wind_half_second.ogg',
] as const

export type SoundName = typeof SOUND_NAME_LIST[number]

const SOUND_PATH = './assets/sounds'

export interface SoundPlayOptions {
  when?: number
}

export interface SoundSequenceItem {
  name: SoundName
  nextAfter?: number
}

export interface LoopingSound {
  stop: () => void
}

export class SoundManager {
  private constructor(
    private readonly buffers: Map<SoundName, AudioBuffer>,
  ) {}

  private context: AudioContext | null = null

  static async create(logger: Logger, onProgress?: AssetLoadProgressCallback): Promise<SoundManager> {
    logger.info('Loading sounds...')
    const decodeContext = new OfflineAudioContext(1, 1, 44100)
    let completed = 0
    onProgress?.({ completed, total: SOUND_NAME_LIST.length })
    const entries = await Promise.all(SOUND_NAME_LIST.map(async name => {
      const buffer = await fetchSound(decodeContext, name)
      completed += 1
      onProgress?.({ completed, total: SOUND_NAME_LIST.length })
      return [name, buffer] as const
    }))

    return new SoundManager(new Map(entries))
  }

  get(name: SoundName): AudioBuffer {
    const buffer = this.buffers.get(name)
    if (! buffer) throw Error(`Sound [${name}] not loaded`)
    return buffer
  }

  play(name: SoundName, options: SoundPlayOptions = {}): AudioBufferSourceNode {
    const source = this.createSource(name)
    const startTime = this.getStartTime(options.when ?? 0)
    source.start(startTime)
    void this.resume().catch(() => {})
    return source
  }

  playSequence(items: Array<SoundName | SoundSequenceItem>): void {
    let offset = 0
    for (const item of items) {
      const name = typeof item === 'string' ? item : item.name
      const nextAfter = typeof item === 'string' ? undefined : item.nextAfter
      this.play(name, { when: offset })
      offset += this.getNextOffset(name, nextAfter)
    }
  }

  playLoop(name: SoundName): LoopingSound {
    const source = this.createSource(name)
    source.loop = true
    source.start()
    void this.resume().catch(() => {})
    return {
      stop: () => {
        try {
          source.stop()
        }
        catch {} // The source may already have been stopped by cleanup.
      },
    }
  }

  dispose() {
    void this.context?.close()
    this.context = null
  }

  private createSource(name: SoundName): AudioBufferSourceNode {
    const context = this.getContext()
    const source = context.createBufferSource()
    source.buffer = this.get(name)
    source.connect(context.destination)
    return source
  }

  private getStartTime(offsetSeconds: number): number {
    return this.getContext().currentTime + Math.max(0, offsetSeconds)
  }

  private getNextOffset(name: SoundName, nextAfter: number | undefined): number {
    const bufferDuration = this.get(name).duration
    return nextAfter === undefined
      ? bufferDuration
      : Math.max(0, nextAfter)
  }

  private async resume() {
    const context = this.getContext()
    if (context.state !== 'running') await context.resume()
  }

  private getContext(): AudioContext {
    this.context ??= new AudioContext()
    return this.context
  }
}

const fetchSound = async (context: BaseAudioContext, name: SoundName): Promise<AudioBuffer> => {
  try {
    const res = await fetch(`${SOUND_PATH}/${name}`)
    if (! res.ok) throw Error(`${res.status} ${res.statusText}`)

    return await context.decodeAudioData(await res.arrayBuffer())
  }
  catch (error) {
    throw Error(`Failed to load sound [${name}]: ${error}`)
  }
}
