import { Action, Board, STANDARD_BOARD_SIZE, Player, Players as CorePlayers, Coord, GameState as CoreGameState, Line, Move, Multiverse, Piece, Pieces, type BoardSize, type CheckmateStatus, type CoordSpacelike } from '@5dcol/core'
import * as FiveDPGN from '@5dcol/core/fiveDPGN'
import type { StudyCommand, StudyDocument, StudyPatch, StudyPosition } from '@5dcol/shared/protocol'
import { Disposable, Effect, Empty } from '@/utils'
import { Color4, CubicBezier, Mat3, Rect, Scalar, Vec2, type Camera } from '@engine/basic'
import { getBoardRenderLayers } from '@engine/board'
import { ButtonColors, type ButtonColorPreset, CameraControl, Colors, LabelVisibility, RenderLayer, Sizes, Animations } from '@engine/constant'
import { Easing } from '@engine/easing'
import { isModifierKeyEvent, isSameLocatedSquare, isTextInputEvent } from '@engine/gameInput'
import { GAME_STORAGE_KEY, getLocalStorage, isStoredGameState, type GameAxisViewMode, type GameAxisViewState, type GameBoardFocus, type GameWorkspaceState, type PendingMove, type StoredGameState } from '@engine/gameState'
import { GameLayout, type ViewportInsets } from '@engine/layout'
import { LinePainter } from '@engine/painters/linePainter'
import { type Logger } from '@engine/logger'
import { getMoveArrowMaskFill, getMoveArrowPolygon, getStraightMoveArrowPolygon } from '@engine/moveArrow'
import { PresentPainter } from '@engine/painters/presentPainter'
import { getRecordGlyphColor4, normalizeRecordGlyphText } from '@engine/recordGlyph'
import { buildGameRecordRows, type GameRecordCursor, type GameRecordMoveSegment, type GameRecordRow } from '@engine/record'
import {
  DEFAULT_RECORD_MARKER_AUTHOR_ID,
  getRecordMarkerAuthorColor,
  getSpacelikeKey,
  parseRecordMarkerColor,
  type SquareMarkerDisplayMode,
} from '@engine/recordMarker'
import { isActionPrefix, RecordDocument, type RecordAnnotation, type RecordArrowMarkerAnnotation, type RecordCursorTarget, type RecordSquareMarkerAnnotation } from '@engine/recordTree'
import { type Renderer, RenderItemType } from '@engine/renderer'
import { PIECE_TO_TEXTURE_ID } from '@engine/texture'
import { TimelineTilesPainter } from '@engine/painters/timelineTilesPainter'
import { getMoveTravelTargetScale, getScaleToContainRects } from '@engine/viewport'
import { type LoopingSound, type SoundManager } from '@engine/sound'
import {
  getPlayerButtonColor,
  getUndoMoveButtonColor,
  isPrimaryGameToolbarButton,
  toToolbarButtonView,
  type ButtonConfig,
  type GameToolbarButton,
} from '@engine/toolbar'

export type { GameToolbarButton } from '@engine/toolbar'
export type { GameRecordAction, GameRecordCursor, GameRecordMoveSegment, GameRecordRow } from '@engine/record'

export interface GameContext {
  debug: boolean
  inputElement?: HTMLElement
  logger: Logger
  renderer: Renderer
  soundManager: SoundManager
  initialMultiverse?: Multiverse
  initialActions?: Action[]
  storageKey?: string | null
  localPlayer?: Player | null
  viewPlayer?: Player
  autoSwitchViewPlayer?: boolean
  showMoveTravelAnimation?: boolean
  fiveDPGNOptions?: FiveDPGN.ExportOptions
  squareMarkerDisplayMode?: SquareMarkerDisplayMode
  initialWorkspace?: GameWorkspaceState | null
  toolbarMode?: 'game' | 'study'
  getFiveDPGNExportMetadata?: () => Pick<FiveDPGN.ExportOptions, 'headers' | 'result'>
  getFiveDPGNGlyphTemplates?: () => FiveDPGN.StudyGlyphTemplate[]
  getUISoundVolume?: () => number
  getBellSoundVolume?: () => number
  getPointerDragThreshold?: () => number
  getRecordAuthorId?: () => string
  getRecordAuthorColor?: (authorId: string) => string
  getRecordGlyphColor?: (glyph: string) => Color4
  canControlOnlineGame?: () => boolean
  canForfeitGame?: () => boolean
  canFinishGame?: () => boolean
  isExternallyFinished?: () => boolean
  onStudyCommandRequest?: (command: StudyCommand) => boolean
  onToolbarChange?: (buttons: GameToolbarButton[]) => void
  onRecordChange?: (request: GameExportRequest) => void
  onStatusChange?: (status: GameStatusView) => void
  onImportRequest?: () => void
  onExportRequest?: (request: GameExportRequest) => void
  onReturnToMainMenuRequest?: (request?: GameReturnToMainMenuRequest) => void
  onStudyActionSubmitRequest?: (action: Action, position: StudyPosition) => boolean
  onActionSubmitted?: (action: Action, actions: Action[]) => void
  onPendingActionChange?: (action: Action | null) => void
  onViewPlayerChange?: (player: Player) => void
  onWorkspaceChange?: (workspace: GameWorkspaceState) => void
  onRecordMoveFocusRequest?: (target: GameRecordMoveFocusTarget) => void
}

export interface GameRecordMoveFocusTarget {
  recordLineId: number
  recordActionIndex: number
  moveIndex: number
  segmentIndex: number
}

export interface GameReturnToMainMenuRequest {
  forfeit?: boolean
}

export type GameExportFormat = 'pgn' | 'fen'
export type GameExportMode = 'linear' | 'tree'

export interface GameExportRequest {
  text: string
  format: GameExportFormat
  mode: GameExportMode
  hasPendingMoves: boolean
  currentActionIndex: number
  currentCursor: {
    recordLineId: number
    recordActionIndex: number
  }
  actions: GameRecordRow[]
}

export interface GameStatusView {
  kind: 'turn' | 'checkmate' | 'stalemate'
  player: Player | null
  color: string
  shadowColor: string
  ended: boolean
}

export interface GameMinimapBoard {
  active: boolean
  focused: boolean
  l: number
  m: number
  mandatory: boolean
  player: Player
  rect: Rect
}

export interface GameMinimapGridCell {
  l: number
  t: number
  white: boolean
  rect: Rect
}

export interface GameMinimapSnapshot {
  boards: GameMinimapBoard[]
  bounds: Rect | null
  fullViewport: Rect
  gridCells: GameMinimapGridCell[]
  viewport: Rect
}

export type { GameAxisViewMode } from '@engine/gameState'

export interface GameAxisViewFocusTarget {
  coord: number
  type: 'file' | 'rank'
}

export interface GameAxisViewBoardColumn {
  active: boolean
  focused: boolean
  label: string
  l: number
  m: number
  player: Player
}

export interface GameAxisViewPieceCell {
  columnIndex: number
  l: number
  m: number
  piece: Piece
  player: Player | null
  rowIndex: number
}

export interface GameAxisViewTargetCell {
  columnIndex: number
  rowIndex: number
}

export interface GameAxisViewSnapshot {
  boardSize: BoardSize
  columns: GameAxisViewBoardColumn[]
  focusTarget: GameAxisViewFocusTarget
  fixedCoord: number
  l: number
  maxFixedCoord: number
  mode: GameAxisViewMode
  pieces: GameAxisViewPieceCell[]
  rowCoords: number[]
  rowLabels: string[]
  targetCells: GameAxisViewTargetCell[]
  viewPlayer: Player
}

interface PointerState {
  screen: Vec2
  activePointerId: number | null
  dragStartScreen: Vec2 | null
  dragLastScreen: Vec2 | null
  dragExceeded: boolean
  touchPointers: Map<number, Vec2>
  pinchLastDistance: number | null
  pinchLastScreen: Vec2 | null
  clickButton: number | null
  clickRecordFocus: boolean
  clickCtrlKey: boolean
  clickDeselectPiece: boolean
}

interface BoardFrame {
  pos: Vec2
  size: Vec2
  radius: number
}
interface BoardRenderMetrics {
  boardSize: BoardSize
  contentOffset: Vec2
  contentSize: Vec2
  squareScale: number
  squareSize: number
  squareSizeVec: Vec2
}
interface CameraMotion {
  id: number
  targetCenter: Vec2
  targetScale: number
  anchorScreen: Vec2
  viewportWorldCenter?: Vec2
  viewport?: Rect | null
}
interface ViewportMoveOptions {
  smooth?: boolean
  viewport?: Rect | null
  anchorScreen?: Vec2
  cancelMotion?: boolean
}
interface ViewportFocusOptions {
  axisFocus?: GameAxisViewFocusTarget
  smooth?: boolean
}
interface PieceSelection {
  l: number
  m: number
  player: Player
  from: Coord
  targets: Coord[]
  piece: Piece
}
interface SquareHover {
  l: number
  m: number
  coord: CoordSpacelike
}
interface BoardSquareHit {
  l: number
  m: number
  board: Board
  coord: CoordSpacelike
}
interface RecordMarkerSquare {
  l: number
  m: number
  player: Player
  coord: Coord
}
interface MoveAnimation {
  startedAt: number
  cameraCenter: Vec2
  cameraScale: number
  viewportFollowDisabled: boolean
  travelLoop: LoopingSound | null
  travelHitPlayed: boolean
}
interface BoardFocusPulse {
  axisFocus?: GameAxisViewFocusTarget
  l: number
  m: number
  startedAt: number
  motionId: number | null
  heldForMotion: boolean
  releaseStartedAt: number | null
}
interface BoardActivationAnimation {
  boardKeys: Set<string>
  startedAt: number
}
interface BoardRenderOptions {
  activeProgress?: number
  temporaryProgress?: number
  temporaryPreset?: ButtonColorPreset
  alpha?: number
  pos?: Vec2
  animatedLayer?: boolean
  basePlayer?: Player
}
interface MoveArrowGeometry {
  from: Vec2
  control1: Vec2
  control2: Vec2
  to: Vec2
  straight?: boolean
}
interface PendingCheck {
  move: Move
  attackingPlayer: Player
  fromBoard: { l: number, m: number }
  toBoard: { l: number, m: number }
}
interface GameEndBackgroundAnimation {
  from: number
  to: number
  startedAt: number
}
interface ViewFlipTransition {
  from: Player
  to: Player
  startedAt: number
  applied: boolean
}
const DEFAULT_POINTER_DRAG_THRESHOLD = 8
const PIECE_GHOST_ALPHA = 0.45
export class Game extends Disposable(Empty) {
  constructor(public readonly ctx: GameContext) {
    super()
    this.logger = ctx.logger
    this.renderer = ctx.renderer
    this.soundManager = ctx.soundManager
    this.layout = new GameLayout(ctx.renderer)
    this.presentPainter = new PresentPainter(ctx.renderer, this.layout)
    this.timelineTilesPainter = new TimelineTilesPainter(ctx.renderer, this.layout)
    this.linePainter = new LinePainter(ctx.renderer, this.layout)
    this.initialMultiverse = ctx.initialMultiverse ?? this.initialMultiverse
    this.multiverseCommitted = this.initialMultiverse
    this.multiverse = this.multiverseCommitted
    this.viewPlayer = ctx.viewPlayer ?? Player.W
    this.autoSwitchViewPlayer = ctx.autoSwitchViewPlayer ?? true
    this.showMoveTravelAnimation = ctx.showMoveTravelAnimation ?? true
    this.fiveDPGNOptions = ctx.fiveDPGNOptions ?? {}
    this.squareMarkerDisplayMode = ctx.squareMarkerDisplayMode ?? 'highlight'
    this.layout.setViewPlayer(this.viewPlayer)
    this.syncLayoutMultiverse()
  }

  public readonly logger: Logger
  public readonly renderer: Renderer
  public readonly soundManager: SoundManager
  public readonly layout: GameLayout
  public readonly presentPainter: PresentPainter
  public readonly timelineTilesPainter: TimelineTilesPainter
  public readonly linePainter: LinePainter

  private initialMultiverse = Multiverse.createInitial()
  private multiverseCommitted = this.initialMultiverse
  private multiverse = this.multiverseCommitted
  private player: Player = Player.W
  private viewPlayer: Player = Player.W
  private actionIndex = 0
  private actions: Action[] = []
  private recordDocument = RecordDocument.create([])
  private readonly pointer: PointerState = {
    screen: [0, 0],
    activePointerId: null,
    dragStartScreen: null,
    dragLastScreen: null,
    dragExceeded: false,
    touchPointers: new Map(),
    pinchLastDistance: null,
    pinchLastScreen: null,
    clickButton: null,
    clickRecordFocus: false,
    clickCtrlKey: false,
    clickDeselectPiece: false,
  }
  private cameraMotion: CameraMotion | null = null
  private selectedPiece: PieceSelection | null = null
  private hoverSquare: SquareHover | null = null
  private hoverPiece: PieceSelection | null = null
  private hoverCheckWarning: { l: number, m: number } | null = null
  private hoverAxisViewBoard: GameBoardFocus | null = null
  private axisViewVisible = false
  private pendingArrowMarkerStart: RecordMarkerSquare | null = null
  private dragArrowMarkerStart: RecordMarkerSquare | null = null
  private pendingMove: PendingMove | null = null
  private pendingMoves: PendingMove[] = []
  private checkWarningBoards: Array<{ l: number, m: number }> = []
  private checkWarningBoardKeys = new Set<string>()
  private pendingChecks: PendingCheck[] = []
  private pendingCheckBoardKeys = new Set<string>()
  private moveAnimation: MoveAnimation | null = null
  private remoteActionQueue: Action[] = []
  private remoteActionMoves: Move[] | null = null
  private remoteActionTargetSignature = ''
  private boardFocusPulse: BoardFocusPulse | null = null
  private boardActivationAnimation: BoardActivationAnimation | null = null
  private gameEndStatus: Exclude<CheckmateStatus, 'not-checkmate'> | null = null
  private gameEndTrial = false
  private gameEndTrialStatus: Exclude<CheckmateStatus, 'not-checkmate'> | null = null
  private gameEndBackgroundTarget = false
  private gameEndBackgroundStatus: Exclude<CheckmateStatus, 'not-checkmate'> = 'checkmate'
  private gameEndBackgroundAnimation: GameEndBackgroundAnimation | null = null
  private viewFlipTransition: ViewFlipTransition | null = null
  private submitRequestedDuringMoveAnimation = false
  private toolbarSignature = ''
  private recordSignature = ''
  private recordRowsSignature = ''
  private recordRowsCache: GameRecordRow[] = []
  private recordHeaderTextSignature = ''
  private recordHeaderTextCache = ''
  private statusSignature = ''
  private recordRecoveryMode = false
  private gameInputDisabled = false
  private pointerInsideInput = false
  private cameraMotionId = 0
  private autoSwitchViewPlayer = true
  private showMoveTravelAnimation = true
  private fiveDPGNOptions: FiveDPGN.ExportOptions = {}
  private squareMarkerDisplayMode: SquareMarkerDisplayMode = 'highlight'
  private focusedBoard: GameBoardFocus | null = null
  private axisViewState: GameAxisViewState = createDefaultAxisViewState()
  private restoredWorkspace: GameWorkspaceState | null = null

  private animationFrame: number | null = null
  private resizeDirty = false
  private gameDisposed = false
  private canvasCursor = ''

  private syncLayoutMultiverse(multiverse: Multiverse = this.multiverse) {
    this.layout.setMultiverse(multiverse)
  }

  public start() {
    const restored = this.ctx.initialActions
      ? this.restoreInitialActions(this.ctx.initialActions)
      : this.restoreGameState()
    this.syncLayoutMultiverse()
    this.renderer.start()
    const workspace = this.ctx.initialWorkspace ?? this.restoredWorkspace
    if (restored) {
      if (! this.applyWorkspaceState(workspace, { smooth: false })) {
        this.focusCurrentPresent({ smooth: false })
      }
    }
    else this.focusInitialTurn({ smooth: false })
    this.bindEvents()
    this.updateGameEndState()
    this.syncAutomaticViewPlayer()
    this.syncCheckState()
    this.syncToolbarButtons()
    this.syncRecord()
    this.syncStatus()
    this.animationFrame = requestAnimationFrame(this.loop)
    this.collect(() => {
      if (this.animationFrame !== null) cancelAnimationFrame(this.animationFrame)
    })
    this.logger.info('Game started')
  }

  public dispose() {
    this.gameDisposed = true
    this.clearMoveAnimation()
    this.setCanvasCursor('')
    super.dispose()
  }

  public setGameInputDisabled(disabled: boolean) {
    if (this.gameInputDisabled === disabled) return

    this.gameInputDisabled = disabled
    if (! disabled) return

    this.hoverSquare = null
    this.hoverPiece = null
    this.hoverCheckWarning = null
    this.finishPointerGesture()
    this.syncCanvasCursor()
  }

  private clearHoverState() {
    if (! this.hoverSquare && ! this.hoverPiece && ! this.hoverCheckWarning) return
    this.hoverSquare = null
    this.hoverPiece = null
    this.hoverCheckWarning = null
    this.syncCanvasCursor()
    this.syncToolbarButtons()
  }

  public setViewPlayer(
    player: Player,
    { playSound = false, transition = true }: { playSound?: boolean, transition?: boolean } = {},
  ) {
    if (this.viewPlayer === player) {
      if (this.viewFlipTransition?.to !== player) this.viewFlipTransition = null
      return
    }

    if (playSound) this.playUISound()

    if (! transition) {
      this.applyViewPlayer(player)
      this.viewFlipTransition = null
      return
    }

    this.viewFlipTransition = {
      from: this.viewPlayer,
      to: player,
      startedAt: performance.now(),
      applied: false,
    }
    if (this.viewFlipTransition.from === player) {
      this.viewFlipTransition = null
    }
  }

  public toggleViewPlayer() {
    this.setViewPlayer(CorePlayers.opponent(this.viewPlayer), { playSound: true })
  }

  public setAutoSwitchViewPlayer(enabled: boolean) {
    this.autoSwitchViewPlayer = enabled
    this.syncAutomaticViewPlayer()
  }

  public setShowMoveTravelAnimation(enabled: boolean) {
    this.showMoveTravelAnimation = enabled
    if (! enabled && this.moveAnimation) this.stopMoveTravelLoop(this.moveAnimation)
  }

  public setFiveDPGNOptions(options: FiveDPGN.ExportOptions) {
    if (JSON.stringify(options) === JSON.stringify(this.fiveDPGNOptions)) return

    this.fiveDPGNOptions = { ...options }
    this.recordSignature = ''
    this.syncRecord()
  }

  public setSquareMarkerDisplayMode(mode: SquareMarkerDisplayMode) {
    this.squareMarkerDisplayMode = mode
  }

  public deleteRecordFutureAtCursor(cursor: GameRecordCursor): boolean {
    if (this.isOnlineGame()) return false
    if (this.isMoveAnimating() || this.pendingMoves.length > 0) return false
    const target = this.recordDocument.resolveCursorTarget(cursor)
    if (! target) return false
    const studyPosition = this.recordDocument.toStudyPosition(target)

    const nextTarget = this.recordDocument.deleteFutureAndResolveCursorTarget(
      target.recordLineId,
      target.recordActionIndex,
    )
    if (! nextTarget) return false
    if (studyPosition) {
      this.sendStudyCommand({
        type: 'remove-future',
        position: studyPosition,
      })
    }

    const actions = this.recordDocument.getLineFullActions(nextTarget.recordLineId)
    const targetActionIndex = this.recordDocument.getLinePrefixActions(nextTarget.recordLineId).length
      + nextTarget.recordActionIndex
    this.recordDocument.setActiveLine(nextTarget.recordLineId)
    this.applyRecordActionPath(actions, targetActionIndex)
    return true
  }

  public rollbackToRecordCursor(cursor: GameRecordCursor): boolean {
    const target = this.recordDocument.resolveCursorTarget(cursor)
    if (! target) return false

    return this.rollbackToRecordCursorTarget(target)
  }

  public cycleRecordCursorVariation(): boolean {
    if (this.isOnlineGame()) return false
    if (this.pendingMoves.length > 0) return false

    const target = this.recordDocument.getNextVariationCursorTarget(this.actionIndex)
    if (! target) return false

    return this.rollbackToRecordCursorTarget(target)
  }

  public replaceRecordActionComments({
    recordLineId,
    recordActionIndex,
    position,
    texts,
  }: {
    recordLineId: number
    recordActionIndex: number
    position: 'before' | 'after'
    texts: readonly string[]
  }): boolean {
    if (this.isOnlineGame()) return false
    const annotationsBefore = this.recordDocument.getAnnotations()
    const changed = this.recordDocument.replaceActionComments(
      recordLineId,
      recordActionIndex,
      position,
      texts,
      { authorId: this.ctx.getRecordAuthorId?.() },
    )
    if (! changed) return false

    this.sendStudyAnnotationChanges(annotationsBefore, this.recordDocument.getAnnotations())
    this.persistGameState()
    return true
  }

  public replaceRecordMoveGlyphs({
    recordLineId,
    recordActionIndex,
    moveIndex,
    glyphs,
  }: {
    recordLineId: number
    recordActionIndex: number
    moveIndex: number
    glyphs: readonly string[]
  }): boolean {
    if (this.isOnlineGame()) return false
    const annotationsBefore = this.recordDocument.getAnnotations()
    const changed = this.recordDocument.replaceMoveGlyphs(
      recordLineId,
      recordActionIndex,
      moveIndex,
      glyphs,
      { authorId: this.ctx.getRecordAuthorId?.() },
    )
    if (! changed) return false

    this.sendStudyAnnotationChanges(annotationsBefore, this.recordDocument.getAnnotations())
    this.persistGameState()
    return true
  }

  private rollbackToRecordCursorTarget(
    target: RecordCursorTarget,
    {
      focus = true,
    }: {
      focus?: boolean
    } = {},
  ): boolean {
    this.recordDocument.deleteActiveEmptyLineIfLeaving(target.recordLineId)

    const actions = this.recordDocument.getLineFullActions(target.recordLineId)
    const targetActionIndex = this.recordDocument.getLinePrefixActions(target.recordLineId).length
      + target.recordActionIndex
    this.recordDocument.setActiveLine(target.recordLineId)
    this.applyRecordActionPath(actions, targetActionIndex, { focus })
    return true
  }

  public setRemotePendingMoves(moves: Move[], { animate = true }: { animate?: boolean } = {}) {
    if (this.canControlTurn()) return
    if (Move.isSameList(moves, this.getPendingMoves())) return

    if (
      animate
      && moves.length === this.pendingMoves.length + 1
      && Move.isSameList(moves.slice(0, -1), this.getPendingMoves())
    ) {
      this.createAnimatedPendingMove(moves.at(-1)!, { playSound: true, persist: false, notify: false })
      return
    }

    const { pendingMoves, multiverse } = this.createPendingMoves(moves)
    this.pendingMoves = pendingMoves
    this.pendingMove = pendingMoves.at(-1) ?? null
    this.multiverse = multiverse
    this.gameEndStatus = null
    this.clearMoveAnimation()
    this.submitRequestedDuringMoveAnimation = false
    this.deselectPiece()
    this.syncCheckState()
    this.syncToolbarButtons()
  }

  public isCurrentPendingActionCommitted(actions: Action[]): boolean {
    if (actions.length !== this.actions.length + 1) return false
    const pendingMoves = this.getPendingMoves()
    if (pendingMoves.length === 0) return false
    return Move.isSameList(actions.at(-1)?.moves ?? [], pendingMoves)
  }

  public hasActionPrefix(actions: Action[]): boolean {
    return isActionPrefix(actions, this.actions)
  }

  public clearRemotePendingMoves() {
    if (this.canControlTurn()) return
    if (this.pendingMoves.length === 0) return
    this.pendingMoves = []
    this.pendingMove = null
    this.multiverse = this.multiverseCommitted
    this.clearMoveAnimation()
    this.submitRequestedDuringMoveAnimation = false
    this.deselectPiece()
    this.syncCheckState()
    this.syncToolbarButtons()
  }

  private applyViewPlayer(player: Player) {
    this.syncLayoutMultiverse()
    if (this.viewPlayer === player) return

    const shouldMirrorCameraY = this.layout.getDisplayLine(1) !== (
      player === Player.W ? 1 : -1
    )
    if (shouldMirrorCameraY) {
      const camera = this.renderer.getCamera()
      this.renderer.setCamera({
        center: [camera.center[0], -camera.center[1]],
      })
    }
    this.viewPlayer = player
    this.layout.setViewPlayer(player)
    this.syncLayoutMultiverse()
    this.ctx.onViewPlayerChange?.(player)
    this.cameraMotion = null
    this.updateCameraBounds()
  }

  public setViewportInsets(insets: Partial<ViewportInsets>) {
    const camera = this.renderer.getCamera()
    const viewportWorldCenter = this.layout.getViewportWorldCenter(camera.center, camera.scale)
    this.layout.setViewportInsets(insets)
    this.moveViewportTo({
      targetCenter: this.layout.getCameraCenterForViewportWorldCenter(viewportWorldCenter, camera.scale),
    }, {
      anchorScreen: this.getViewportCenterScreen(),
    })
  }

  public loadActions(
    actions: Action[],
    { focus = true, force = false, animate = false }: { focus?: boolean, force?: boolean, animate?: boolean } = {},
  ) {
    if (! force && this.pendingMoves.length > 0 && actions.length <= this.actions.length) return
    if (JSON.stringify(actions) === JSON.stringify(this.actions)) {
      this.syncToolbarButtons()
      this.syncStatus()
      return
    }
    if (animate && ! force && this.tryStartRemoteActionPlayback(actions)) return

    const previousPlayer = this.player
    const previousActionIndex = this.actionIndex
    this.loadCoreGameState(CoreGameState.create(actions, [], this.initialMultiverse), { focus })
    this.playLocalTurnStartSoundAfterLoadedAction(previousPlayer, previousActionIndex)
    this.syncToolbarButtons()
    this.syncRecord()
    this.syncStatus()
  }

  public loadStudyDocument(
    studyDocument: StudyDocument,
    {
      focus = true,
      workspace = this.ctx.initialWorkspace ?? null,
    }: {
      focus?: boolean
      workspace?: GameWorkspaceState | null
    } = {},
  ): boolean {
    const recordDocument = RecordDocument.fromStudyDocument(studyDocument)
    if (! recordDocument) return false

    const actions = recordDocument.getLineFullActions(0)
    try {
      this.loadCoreGameState(CoreGameState.create(actions, [], studyDocument.initialMultiverse), {
        focus: false,
        recordDocument,
      })
    }
    catch (error) {
      this.logger.error(error instanceof Error ? error.message : String(error))
      this.loadCoreGameState(CoreGameState.create([], [], studyDocument.initialMultiverse), {
        focus: false,
        recordDocument,
      })
      this.recordRecoveryMode = true
    }
    if (! this.applyWorkspaceState(workspace, { smooth: false }, { focusCamera: focus }) && focus) {
      this.focusCurrentPresent({ smooth: false })
    }
    this.syncToolbarButtons()
    this.syncRecord()
    this.syncStatus()
    return true
  }

  public applyStudyPatch(
    patch: StudyPatch,
    {
      followPatch = false,
    }: {
      followPatch?: boolean
    } = {},
  ): boolean {
    const currentTarget = this.recordDocument.resolveCursorTarget({
      recordLineId: this.recordDocument.activeRecordLineId,
      recordActionIndex: this.recordDocument.getActiveLineLocalActionIndex(this.actionIndex),
    })

    if (! this.recordDocument.applyStudyPatch(patch)) return false

    const followTarget = followPatch ? this.getStudyPatchCursorTarget(patch) : null
    const nextTarget = followTarget ?? (currentTarget
      ? this.recordDocument.resolveCursorTarget(currentTarget)
      : null)
    const fallbackLine = this.recordDocument.getLine(0)
    const target = nextTarget ?? {
      recordLineId: 0,
      recordActionIndex: fallbackLine?.actions.length ?? 0,
    }
    const actions = this.recordDocument.getLineFullActions(target.recordLineId)
    const targetActionIndex = this.recordDocument.getLinePrefixActions(target.recordLineId).length
      + target.recordActionIndex
    this.recordDocument.setActiveLine(target.recordLineId)
    this.applyRecordActionPath(actions, targetActionIndex)
    return true
  }

  private getStudyPatchCursorTarget(patch: StudyPatch): RecordCursorTarget | null {
    switch (patch.type) {
      case 'append-action':
        return this.recordDocument.fromStudyPosition({
          type: 'after',
          actionId: patch.action.id,
        })
      case 'create-branch': {
        const actionId = patch.branch.actionIds.at(-1)
        if (actionId) {
          return this.recordDocument.fromStudyPosition({
            type: 'after',
            actionId,
          })
        }
        return patch.branch.parent
          ? this.recordDocument.fromStudyPosition(patch.branch.parent)
          : null
      }
      case 'remove-future':
        return this.recordDocument.fromStudyPosition(patch.position)
      case 'upsert-annotation':
      case 'delete-annotation':
      case 'update-title':
      case 'update-private':
        return null
    }
  }

  private sendStudyCommand(command: StudyCommand): boolean {
    return this.ctx.onStudyCommandRequest?.(command) ?? false
  }

  private sendStudyAnnotationChanges(
    before: readonly RecordAnnotation[],
    after: readonly RecordAnnotation[],
  ) {
    if (! this.ctx.onStudyCommandRequest) return

    const beforeIds = new Set(before.map(annotation => annotation.id))
    const afterIds = new Set(after.map(annotation => annotation.id))
    before
      .filter(annotation => ! afterIds.has(annotation.id))
      .forEach((annotation) => {
        this.sendStudyCommand({
          type: 'delete-annotation',
          annotationId: annotation.id,
        })
      })
    after
      .filter(annotation => ! beforeIds.has(annotation.id))
      .forEach((annotation) => {
        this.sendStudyCommand({
          type: 'upsert-annotation',
          annotation,
        })
      })
  }

  public getStudyDocument({ id, title }: { id: string, title: string }): StudyDocument {
    return this.recordDocument.toStudyDocument({
      id,
      title,
      initialMultiverse: this.initialMultiverse,
    })
  }

  public getStudyPositionForRecordCursor(cursor: RecordCursorTarget): StudyPosition | null {
    return this.recordDocument.toStudyPosition(cursor)
  }

  public getRecordCursorFromStudyPosition(position: StudyPosition): RecordCursorTarget | null {
    return this.recordDocument.fromStudyPosition(position)
  }

  private restoreInitialActions(actions: Action[]): boolean {
    this.loadCoreGameState(CoreGameState.create(actions), { focus: false })
    return actions.length > 0
  }

  private restoreGameState(): boolean {
    const storageKey = this.getStorageKey()
    if (! storageKey) return false

    const storage = getLocalStorage()
    if (! storage) return false

    try {
      const raw = storage.getItem(storageKey)
      if (! raw) return false

      const state = JSON.parse(raw) as Partial<StoredGameState>
      if (! isStoredGameState(state)) {
        this.clearStoredGameState()
        return false
      }

      const actions = state.actions ?? CoreGameState.extractActions(state.multiverseCommitted)
      const initialMultiverse = state.initialMultiverse
        ?? (actions.length === 0 ? state.multiverseCommitted : Multiverse.createInitial())
      const actionIndex = Scalar.clamp(Math.floor(state.actionIndex), 0, actions.length)
      const pendingMoveMoves = state.pendingMoves
        .filter(pendingMove => ! pendingMove.isPass)
        .map(pendingMove => pendingMove.move)
      const coreState = CoreGameState.create(actions.slice(0, actionIndex), pendingMoveMoves, initialMultiverse)

      this.initialMultiverse = coreState.initialMultiverse
      this.multiverseCommitted = coreState.multiverseCommitted
      this.player = coreState.player
      this.actionIndex = coreState.actionIndex
      this.actions = actions
      if (! this.restoreRecordTree(state, actions)) this.resetRecordTree(actions)
      this.fillMissingMoveOrders(this.multiverseCommitted, this.getCommittedMoveOrderBase())
      const preview = this.createPendingMoves(pendingMoveMoves)
      this.pendingMoves = preview.pendingMoves
      this.multiverse = preview.multiverse
      this.pendingMove = this.pendingMoves.at(-1) ?? null
      this.restoredWorkspace = state.workspace ?? null
      this.clearMoveAnimation()
      this.submitRequestedDuringMoveAnimation = false
      this.deselectPiece()
      this.syncAutomaticViewPlayer()
      this.syncCheckState()
      return true
    }
    catch {
      this.clearStoredGameState()
      return false
    }
  }

  private persistGameState() {
    if (this.isOnlineGame()) {
      this.syncRecord()
      this.syncStatus()
      return
    }

    const storageKey = this.getStorageKey()
    const storage = getLocalStorage()

    const state: StoredGameState = {
      version: 1,
      initialMultiverse: this.initialMultiverse,
      actions: this.actions,
      recordLines: this.recordDocument.serializeLines(),
      recordAnnotations: this.recordDocument.serializeAnnotations(),
      activeRecordLineId: this.recordDocument.activeRecordLineId,
      nextRecordLineId: this.recordDocument.nextRecordLineId,
      multiverseCommitted: this.multiverseCommitted,
      multiverse: this.multiverse,
      player: this.player,
      actionIndex: this.actionIndex,
      pendingMoves: this.pendingMoves.filter(pendingMove => ! pendingMove.isPass),
      workspace: this.getWorkspaceState(),
    }

    if (storage && storageKey) {
      try {
        storage.setItem(storageKey, JSON.stringify(state))
      }
      catch {
        this.logger.error('Failed to save game state')
      }
    }
    this.syncRecord()
    this.syncStatus()
  }

  private resetRecordTree(actions: Action[]) {
    this.recordDocument = RecordDocument.create(actions)
  }

  private restoreRecordTree(state: Partial<StoredGameState>, fallbackActions: Action[]): boolean {
    const nextDocument = RecordDocument.create(fallbackActions)
    const restored = nextDocument.restore(state, fallbackActions)
    this.recordDocument = nextDocument
    return restored
  }

  private appendActionToActiveRecordLine(action: Action) {
    this.actions = this.recordDocument.appendActionToActiveLine(action, this.actionIndex)
  }

  private applyRecordActionPath(
    actions: Action[],
    actionIndex: number,
    {
      persist = true,
      focus = true,
    }: {
      persist?: boolean
      focus?: boolean
    } = {},
  ) {
    const targetActionIndex = Scalar.clamp(Math.floor(actionIndex), 0, actions.length)
    const state = CoreGameState.create(actions.slice(0, targetActionIndex), [], this.initialMultiverse)
    this.initialMultiverse = state.initialMultiverse
    this.multiverseCommitted = state.multiverseCommitted
    this.multiverse = state.multiverse
    this.player = state.player
    this.actionIndex = state.actionIndex
    this.actions = actions
    this.syncAutomaticViewPlayer()
    this.selectedPiece = null
    this.hoverSquare = null
    this.hoverPiece = null
    this.pendingMove = null
    this.pendingMoves = []
    this.clearMoveAnimation()
    this.submitRequestedDuringMoveAnimation = false
    this.gameEndTrial = false
    this.gameEndTrialStatus = null
    this.cameraMotion = null
    this.clearPointerDrag()
    this.updateGameEndState()
    this.syncCheckState()
    if (persist) this.persistGameState()
    else {
      this.syncRecord()
      this.syncStatus()
    }
    if (focus) this.focusCurrentPresent()
    this.syncToolbarButtons()
  }

  private isOnlineGame(): boolean {
    return this.ctx.localPlayer !== undefined
  }

  private canControlTurn(): boolean {
    if (this.isExternallyFinished()) return true

    return (this.ctx.canControlOnlineGame?.() ?? true)
      && (
        this.ctx.localPlayer === undefined
        || this.ctx.localPlayer === null
        || this.ctx.localPlayer === this.player
      )
  }

  private clearStoredGameState() {
    const storageKey = this.getStorageKey()
    if (! storageKey) return

    const storage = getLocalStorage()
    if (! storage) return

    try {
      storage.removeItem(storageKey)
    }
    catch {} // Ignore storage cleanup failures; gameplay state should still reset in memory.
  }

  private getStorageKey(): string | null {
    return this.ctx.storageKey === undefined ? GAME_STORAGE_KEY : this.ctx.storageKey
  }

  private bindEvents() {
    this.collect(Effect.useListener(window, 'resize', () => {
      this.resizeDirty = true
    }))
    const visualViewport = window.visualViewport
    if (visualViewport) {
      const handleVisualViewportResize = () => {
        this.resizeDirty = true
      }
      visualViewport.addEventListener('resize', handleVisualViewportResize)
      this.collect(() => visualViewport.removeEventListener('resize', handleVisualViewportResize))
    }

    this.collect(Effect.useListener(window, 'pointermove', e => {
      this.handlePointerMove(e)
    }, { passive: false, capture: true }))

    this.collect(Effect.useListener(window, 'pointerdown', e => {
      this.handlePointerDown(e)
    }, { passive: false }))

    this.collect(Effect.useListener(window, 'pointerup', e => {
      this.handlePointerUp(e)
    }, { passive: false, capture: true }))

    this.collect(Effect.useListener(window, 'pointercancel', e => {
      this.handlePointerCancel(e)
    }, { capture: true }))

    this.collect(Effect.useListener(window, 'mouseleave', () => {
      this.finishPointerGesture()
    }))

    this.collect(Effect.useListener(window, 'blur', () => {
      this.finishPointerGesture()
    }))

    this.collect(Effect.useListener(window, 'contextmenu', e => {
      if (this.gameInputDisabled) return
      e.preventDefault()
    }))

    this.collect(Effect.useListener(window, 'auxclick', e => {
      if (this.gameInputDisabled) return
      if (e.button === 1) e.preventDefault()
    }))

    this.collect(Effect.useListener(window, 'keydown', e => {
      this.handleKeyDown(e)
    }))

    this.collect(Effect.useListener(window, 'wheel', e => {
      if (this.gameInputDisabled) return
      if (! this.isInputEvent(e)) return
      e.preventDefault()
      this.zoomCameraByStep(- Math.sign(e.deltaY) * CameraControl.WheelZoomStep)
    }, { passive: false }))
  }

  private getPointerScreen(e: PointerEvent): Vec2 {
    return [e.clientX, e.clientY]
  }

  private isInputEvent(e: Event): boolean {
    const inputElement = this.ctx.inputElement
    if (! inputElement) return e.target instanceof HTMLCanvasElement
    return e.composedPath().includes(inputElement)
  }

  private handlePointerDown(e: PointerEvent) {
    if (this.gameInputDisabled) return
    if (! this.isInputEvent(e)) return
    this.pointerInsideInput = true
    if (! e.isPrimary && e.pointerType !== 'touch') return
    if (e.pointerType === 'mouse' && e.button !== 0 && e.button !== 1 && e.button !== 2) return
    const recordFocusClick = e.pointerType === 'mouse' && (e.button === 1 || (e.button === 0 && e.ctrlKey))
    if (recordFocusClick || e.button === 2) e.preventDefault()

    const screen = this.getPointerScreen(e)
    this.pointer.screen = screen

    if (e.pointerType === 'touch') {
      e.preventDefault()
      this.pointer.touchPointers.set(e.pointerId, screen)
      if (this.pointer.touchPointers.size >= 2) {
        this.startPinchGesture()
        return
      }
    }
    else if (this.pointer.activePointerId !== null) {
      return
    }

    this.pointer.activePointerId = e.pointerId
    this.pointer.dragStartScreen = screen
    this.pointer.dragLastScreen = screen
    this.pointer.dragExceeded = false
    this.pointer.clickButton = e.pointerType === 'mouse' ? e.button : 0
    this.pointer.clickRecordFocus = recordFocusClick
    this.pointer.clickCtrlKey = e.ctrlKey
    this.pointer.clickDeselectPiece = this.pointer.clickButton === 2 && ! this.pointer.clickCtrlKey && this.selectedPiece !== null
    if (this.pointer.clickDeselectPiece) {
      this.pendingArrowMarkerStart = null
      this.dragArrowMarkerStart = null
      this.cancelPieceSelection()
      return
    }
    if (this.pointer.clickButton === 2 && ! this.pointer.clickDeselectPiece) {
      this.dragArrowMarkerStart = this.getRecordMarkerSquareAtScreen(screen)
    }
  }

  private handlePointerMove(e: PointerEvent) {
    if (this.gameInputDisabled) return
    const isInputEvent = this.isInputEvent(e)
    this.pointerInsideInput = isInputEvent
    const hasActivePointer = this.pointer.activePointerId === e.pointerId
      || (e.pointerType === 'touch' && this.pointer.touchPointers.has(e.pointerId))
      || this.pointer.pinchLastDistance !== null
    if (! hasActivePointer && ! isInputEvent) {
      this.clearHoverState()
      return
    }

    const screen = this.getPointerScreen(e)
    this.pointer.screen = screen

    if (e.pointerType === 'touch') {
      e.preventDefault()
      if (! this.pointer.touchPointers.has(e.pointerId)) return
      this.pointer.touchPointers.set(e.pointerId, screen)
      if (this.pointer.touchPointers.size >= 2) {
        this.updatePinchGesture()
        return
      }
    }

    if (this.pointer.activePointerId !== null && this.pointer.activePointerId !== e.pointerId) return
    const dragExceeded = this.updatePointerDragExceeded(screen)
    if (this.pointer.clickButton === 0 && ! this.pointer.clickRecordFocus && dragExceeded) {
      this.panByPointerDrag(screen)
    }
  }

  private handlePointerUp(e: PointerEvent) {
    if (this.gameInputDisabled) {
      this.finishPointerGesture()
      return
    }

    if (e.pointerType === 'touch') {
      e.preventDefault()
      this.pointer.touchPointers.delete(e.pointerId)
      if (this.pointer.pinchLastDistance !== null) {
        this.restartDragAfterPinch()
        return
      }
    }

    if (this.pointer.activePointerId !== e.pointerId) return
    const screen = this.getPointerScreen(e)
    this.pointer.screen = screen
    this.updatePointerDragExceeded(screen)
    if (e.pointerType === 'mouse' && (this.pointer.clickRecordFocus || this.pointer.clickButton === 2)) e.preventDefault()
    if (this.pointer.clickDeselectPiece) {
      this.cancelPieceSelection()
      this.finishPointerGesture()
      return
    }
    if (! this.pointer.dragExceeded) {
      if (this.pointer.clickButton === 2) this.handleRecordMarkerClick(screen)
      else if (this.pointer.clickRecordFocus) this.handleBoardRecordFocusClick(screen)
      else this.handleBoardClick(screen)
    }
    else if (this.pointer.clickButton === 2) {
      this.handleRecordMarkerDrag(screen)
    }
    this.finishPointerGesture()
  }

  private handlePointerCancel(e: PointerEvent) {
    if (e.pointerType === 'touch') this.pointer.touchPointers.delete(e.pointerId)
    if (this.pointer.activePointerId === e.pointerId || this.pointer.pinchLastDistance !== null) {
      this.finishPointerGesture()
    }
  }

  private startPinchGesture() {
    const points = [...this.pointer.touchPointers.values()]
    if (points.length < 2) return

    this.pointer.pinchLastDistance = Math.max(1, Vec2.length(Vec2.sub(points[0]!, points[1]!)))
    this.pointer.pinchLastScreen = Vec2.scale(Vec2.add(points[0]!, points[1]!), 0.5)
    this.pointer.dragStartScreen = null
    this.pointer.dragLastScreen = null
    this.pointer.dragExceeded = true
    this.cameraMotion = null
  }

  private updatePinchGesture() {
    const points = [...this.pointer.touchPointers.values()]
    if (points.length < 2 || this.pointer.pinchLastDistance === null || ! this.pointer.pinchLastScreen) return

    const distance = Math.max(1, Vec2.length(Vec2.sub(points[0]!, points[1]!)))
    const screen = Vec2.scale(Vec2.add(points[0]!, points[1]!), 0.5)
    this.pointer.screen = screen
    this.panViewportByScreenDelta(this.pointer.pinchLastScreen, screen)

    const camera = this.renderer.getCamera()
    this.setCameraScaleAt(screen, Scalar.clamp(
      camera.scale * (distance / this.pointer.pinchLastDistance),
      CameraControl.ZoomMin,
      CameraControl.ZoomMax,
    ))

    this.pointer.pinchLastDistance = distance
    this.pointer.pinchLastScreen = screen
    this.syncCameraMotion()
  }

  private restartDragAfterPinch() {
    this.pointer.pinchLastDistance = null
    this.pointer.pinchLastScreen = null
    const remaining = [...this.pointer.touchPointers.entries()][0]
    if (! remaining) {
      this.finishPointerGesture()
      return
    }

    const [pointerId, screen] = remaining
    this.pointer.activePointerId = pointerId
    this.pointer.dragStartScreen = screen
    this.pointer.dragLastScreen = screen
    this.pointer.dragExceeded = true
  }

  private panByPointerDrag(screen: Vec2) {
    const lastScreen = this.pointer.dragLastScreen
    if (! lastScreen) return

    this.panViewportByScreenDelta(lastScreen, screen)
    this.pointer.dragLastScreen = screen
  }

  private panViewportByScreenDelta(lastScreen: Vec2, screen: Vec2) {
    this.disableMoveAnimationViewportFollow()
    const worldLast = this.renderer.screenToWorld(lastScreen)
    const worldCurrent = this.renderer.screenToWorld(screen)
    const delta = Vec2.sub(worldCurrent, worldLast)
    const camera = this.renderer.getCamera()

    this.setViewportImmediate({
      center: Vec2.sub(camera.center, delta),
    }, {
      viewport: null,
      cancelMotion: true,
    })
  }

  private updatePointerDragExceeded(screen: Vec2): boolean {
    if (this.pointer.dragExceeded) return true

    const start = this.pointer.dragStartScreen
    if (! start) return false
    if (Vec2.length(Vec2.sub(screen, start)) > this.getPointerDragThreshold()) {
      this.pointer.dragExceeded = true
      this.pointer.dragLastScreen = screen
    }
    return this.pointer.dragExceeded
  }

  private getPointerDragThreshold() {
    return Scalar.clamp(
      this.ctx.getPointerDragThreshold?.() ?? DEFAULT_POINTER_DRAG_THRESHOLD,
      0,
      64,
    )
  }

  private clearPointerDrag() {
    this.pointer.activePointerId = null
    this.pointer.dragStartScreen = null
    this.pointer.dragLastScreen = null
    this.pointer.dragExceeded = false
    this.pointer.touchPointers.clear()
    this.pointer.pinchLastDistance = null
    this.pointer.pinchLastScreen = null
    this.pointer.clickButton = null
    this.pointer.clickRecordFocus = false
    this.pointer.clickCtrlKey = false
    this.pointer.clickDeselectPiece = false
    this.dragArrowMarkerStart = null
  }

  private finishPointerGesture() {
    this.clearPointerDrag()
    this.updateCameraBounds()
  }

  private handleKeyDown(e: KeyboardEvent) {
    if (this.gameInputDisabled || e.repeat || isModifierKeyEvent(e) || isTextInputEvent(e)) return

    switch (e.key) {
      case 'z':
      case 'Backspace':
        e.preventDefault()
        this.undoMove()
        break
      case 'f':
      case 'Enter':
        e.preventDefault()
        this.submitMoves()
        break
      case 'w':
      case 'ArrowUp':
        e.preventDefault()
        this.panCameraByKeyboard([0, -1])
        break
      case 'a':
      case 'ArrowLeft':
        e.preventDefault()
        this.panCameraByKeyboard([-1, 0])
        break
      case 's':
      case 'ArrowDown':
        e.preventDefault()
        this.panCameraByKeyboard([0, 1])
        break
      case 'd':
      case 'ArrowRight':
        e.preventDefault()
        this.panCameraByKeyboard([1, 0])
        break
      case 'q':
        e.preventDefault()
        this.zoomCameraByStep(- CameraControl.KeyboardZoomStep)
        break
      case 'e':
        e.preventDefault()
        this.zoomCameraByStep(CameraControl.KeyboardZoomStep)
        break
      case 'u':
      case 'U':
        e.preventDefault()
        this.toggleViewPlayer()
        break
    }
  }

  private panCameraByKeyboard(direction: Vec2) {
    this.disableMoveAnimationViewportFollow()
    const camera = this.renderer.getCamera()
    const step = CameraControl.KeyboardPanStep / camera.scale
    const targetCenter = this.cameraMotion?.targetCenter ?? camera.center
    this.moveViewportTo({
      targetCenter: this.clampCameraCenterToValidViewportIfAvailable(
        Vec2.add(targetCenter, Vec2.scale(direction, step)),
      ),
    })
  }

  private zoomCameraByStep(step: number) {
    this.disableMoveAnimationViewportFollow()
    const camera = this.renderer.getCamera()
    const targetCenter = this.cameraMotion?.targetCenter ?? camera.center
    const targetScale = this.cameraMotion?.targetScale ?? camera.scale
    const nextScale = Scalar.clamp(
      targetScale + step,
      CameraControl.ZoomMin,
      CameraControl.ZoomMax,
    )
    const viewportWorldCenter = this.layout.getViewportWorldCenter(targetCenter, targetScale)
    this.moveViewportTo({
      targetCenter: this.layout.getCameraCenterForViewportWorldCenter(viewportWorldCenter, nextScale),
      targetScale: nextScale,
      viewportWorldCenter,
    }, {
      anchorScreen: this.getViewportCenterScreen(),
    })
  }

  private setCameraMotion(motion: Partial<CameraMotion>, options: ViewportMoveOptions = {}): CameraMotion {
    const camera = this.renderer.getCamera()
    this.cameraMotion = {
      id: ++ this.cameraMotionId,
      targetCenter: motion.targetCenter ?? this.cameraMotion?.targetCenter ?? camera.center,
      targetScale: motion.targetScale ?? this.cameraMotion?.targetScale ?? camera.scale,
      anchorScreen: options.anchorScreen ?? motion.anchorScreen ?? this.cameraMotion?.anchorScreen ?? this.getViewportCenterScreen(),
      viewportWorldCenter: motion.viewportWorldCenter,
      viewport: options.viewport,
    }
    return this.cameraMotion
  }

  private moveViewportTo(motion: Partial<CameraMotion>, options: ViewportMoveOptions = {}): CameraMotion | null {
    if (options.smooth === false) {
      this.setViewportImmediate({
        center: motion.targetCenter,
        scale: motion.targetScale,
      }, { ...options, cancelMotion: true })
      return null
    }

    return this.setCameraMotion(motion, options)
  }

  private setViewportImmediate(camera: Partial<Camera>, options: ViewportMoveOptions = {}) {
    this.syncLayoutMultiverse()
    if (options.cancelMotion) this.cameraMotion = null

    if (camera.scale !== undefined) {
      this.renderer.setCamera({
        scale: Scalar.clamp(camera.scale, CameraControl.ZoomMin, CameraControl.ZoomMax),
      })
    }

    const viewport = options.viewport === undefined
      ? this.layout.getValidViewportRect(this.multiverse)
      : options.viewport
    const targetCenter = camera.center ?? this.renderer.getCamera().center
    this.renderer.setCamera({
      center: viewport ? this.layout.clampCameraCenterToViewport(targetCenter, viewport) : targetCenter,
    })
    this.syncCameraMotion()
  }

  private disableMoveAnimationViewportFollow() {
    if (this.moveAnimation && this.isMoveAnimating()) {
      this.moveAnimation.viewportFollowDisabled = true
    }
  }

  public focusTurn(l: number, m: number, options: ViewportFocusOptions = {}) {
    this.syncLayoutMultiverse()
    this.focusRect(this.layout.getTurnRect(l, m), options)
  }

  public focusBoard(l: number, m: number, options: ViewportFocusOptions = {}) {
    this.syncLayoutMultiverse()
    const motion = this.focusRect(this.layout.getBoardRect(l, m), options)
    this.focusedBoard = { l, m }
    this.axisViewState = {
      ...this.axisViewState,
      l,
    }
    this.boardFocusPulse = {
      ...(options.axisFocus ? { axisFocus: options.axisFocus } : {}),
      l,
      m,
      startedAt: performance.now(),
      motionId: motion?.id ?? null,
      heldForMotion: false,
      releaseStartedAt: null,
    }
    this.persistWorkspaceState(this.syncWorkspace())
  }

  public getAxisViewState(): GameAxisViewState {
    return { ...this.axisViewState }
  }

  public setAxisViewState(state: Partial<GameAxisViewState>) {
    const next = normalizeAxisViewState({
      ...this.axisViewState,
      ...state,
    })
    if (
      next.fixedCoord === this.axisViewState.fixedCoord
      && next.l === this.axisViewState.l
      && next.mode === this.axisViewState.mode
    ) return

    this.axisViewState = next
    this.persistWorkspaceState(this.syncWorkspace())
  }

  public setAxisViewVisible(visible: boolean) {
    if (this.axisViewVisible === visible) return

    this.axisViewVisible = visible
    if (! visible) this.hoverAxisViewBoard = null
  }

  public setAxisViewHoverBoard(board: GameBoardFocus | null) {
    if (
      (board === null && this.hoverAxisViewBoard === null)
      || (
        board !== null
        && this.hoverAxisViewBoard !== null
        && board.l === this.hoverAxisViewBoard.l
        && board.m === this.hoverAxisViewBoard.m
      )
    ) return

    this.hoverAxisViewBoard = board ? { ...board } : null
  }

  public getMinimapSnapshot(): GameMinimapSnapshot {
    this.syncLayoutMultiverse()
    const status = Multiverse.getTimelineStatus(this.multiverse, this.player)
    const mandatoryLines = new Set(status.mandatory)
    const activeLines = new Set([...status.mandatory, ...status.optional])
    const focusedBoard = this.getValidFocusedBoard()
    const boards: GameMinimapBoard[] = []
    const timelineLines: number[] = []
    let minTurn = Number.POSITIVE_INFINITY
    let maxTurn = Number.NEGATIVE_INFINITY

    for (const [l, line] of Multiverse.getLineEntries(this.multiverse)) {
      if (! line) continue
      const latestM = Line.getLatestBoardIndex(line)
      let hasBoard = false

      for (const [m, board] of Line.getBoardEntries(line)) {
        if (! board) continue
        hasBoard = true
        const turn = Math.floor(m / 2)
        minTurn = Math.min(minTurn, turn)
        maxTurn = Math.max(maxTurn, turn)
        const active = latestM === m && activeLines.has(l)
        boards.push({
          active,
          focused: focusedBoard?.l === l && focusedBoard.m === m,
          l,
          m,
          mandatory: active && mandatoryLines.has(l),
          player: this.getBoardPlayer(m),
          rect: this.layout.getBoardRect(l, m),
        })
      }

      if (hasBoard) timelineLines.push(l)
    }

    const gridCells: GameMinimapGridCell[] = []
    if (Number.isFinite(minTurn) && Number.isFinite(maxTurn)) {
      for (const l of timelineLines) {
        for (let t = minTurn; t <= maxTurn; t++) {
          gridCells.push({
            l,
            t,
            white: (t + this.layout.getDisplayLine(l)) % 2 === 0,
            rect: this.layout.getTurnRect(l, t),
          })
        }
      }
    }

    return {
      boards,
      bounds: Rect.bounds([...gridCells.map(cell => cell.rect), ...boards.map(board => board.rect)]),
      fullViewport: this.getFullViewportWorldRect(),
      gridCells,
      viewport: this.getViewportWorldRect(),
    }
  }

  public getAxisViewSnapshot(
    mode: GameAxisViewMode,
    fixedCoord: number,
    hoveredPieceKey: string | null = null,
  ): GameAxisViewSnapshot | null {
    const focusedBoard = this.getValidFocusedBoard()
    const lineEntry = this.getAxisViewLineEntry(this.axisViewState.l ?? focusedBoard?.l)
    if (! lineEntry) return null

    const [l, line] = lineEntry
    const latestM = Line.getLatestBoardIndex(line)
    const status = Multiverse.getTimelineStatus(this.multiverse, this.player)
    const activeLines = new Set([...status.mandatory, ...status.optional])
    const boardSize = getLineBoardSize(line)
    const maxFixedCoord = getAxisViewFixedCoordMax(mode, boardSize)
    const axis = clampBoardAxisCoord(fixedCoord, maxFixedCoord)
    const fixedBoardCoord = getAxisViewFixedBoardCoord(mode, axis, boardSize, this.viewPlayer)
    const rowCoords = getAxisViewRowCoords(mode, boardSize, this.viewPlayer)
    const columns: GameAxisViewBoardColumn[] = []
    const pieces: GameAxisViewPieceCell[] = []
    let hoveredAxisPieceTargets: { player: Player, targets: Coord[] } | null = null

    for (const [m, board] of Line.getBoardEntries(line)) {
      if (! board) continue

      const columnIndex = columns.length
      const boardPlayer = this.getBoardPlayer(m)
      columns.push({
        active: latestM === m && activeLines.has(l),
        focused: focusedBoard?.l === l && focusedBoard.m === m,
        label: getAxisViewColumnLabel(m, boardPlayer),
        l,
        m,
        player: boardPlayer,
      })

      for (let rowIndex = 0; rowIndex < rowCoords.length; rowIndex++) {
        const coord = getAxisViewSpacelikeCoord(mode, fixedBoardCoord, rowCoords[rowIndex]!)
        const piece = Board.getPiece(coord, board)
        if (piece === Piece.E) continue
        const player = Pieces.getPlayer(piece)
        const from = player === null
          ? null
          : {
              ...coord,
              l,
              t: Coord.turn(m, player),
            }

        const pieceCell = {
          columnIndex,
          l,
          m,
          piece,
          player,
          rowIndex,
        }
        pieces.push(pieceCell)

        if (from && player !== null && hoveredPieceKey === getAxisViewPieceCellKey(pieceCell)) {
          hoveredAxisPieceTargets = {
            player,
            targets: Multiverse.getMoveTargets(this.multiverse, from, player),
          }
        }
      }
    }

    if (columns.length === 0) return null
    const selectedTargetCells = this.getAxisViewSelectedTargetCells(mode, l, fixedBoardCoord, rowCoords, columns)
    const hoveredTargetCells = hoveredAxisPieceTargets
      ? getAxisViewTargetCellsForTargets(
          mode,
          l,
          fixedBoardCoord,
          rowCoords,
          columns,
          hoveredAxisPieceTargets.player,
          hoveredAxisPieceTargets.targets,
        )
      : []

    return {
      boardSize,
      columns,
      focusTarget: {
        coord: fixedBoardCoord,
        type: mode === 'yt' ? 'file' : 'rank',
      },
      fixedCoord: axis,
      l,
      maxFixedCoord,
      mode,
      pieces,
      rowCoords,
      rowLabels: getAxisViewRowLabels(mode, rowCoords, boardSize, this.viewPlayer),
      targetCells: [...selectedTargetCells, ...hoveredTargetCells],
      viewPlayer: this.viewPlayer,
    }
  }

  private getAxisViewSelectedTargetCells(
    mode: GameAxisViewMode,
    l: number,
    fixedBoardCoord: number,
    rowCoords: number[],
    columns: GameAxisViewBoardColumn[],
  ): GameAxisViewTargetCell[] {
    const selection = this.selectedPiece ?? this.hoverPiece
    if (! selection) return []

    return getAxisViewTargetCellsForTargets(mode, l, fixedBoardCoord, rowCoords, columns, selection.player, selection.targets)
  }

  private getViewportWorldRect(): Rect {
    const [[x, y], [w, h]] = this.layout.getViewportScreenRect()
    const topLeft = this.renderer.screenToWorld([x, y])
    const bottomRight = this.renderer.screenToWorld([x + w, y + h])
    return rectFromWorldCorners(topLeft, bottomRight)
  }

  private getFullViewportWorldRect(): Rect {
    const { widthCss, heightCss } = this.renderer.getScreen()
    const topLeft = this.renderer.screenToWorld([0, 0])
    const bottomRight = this.renderer.screenToWorld([widthCss, heightCss])
    return rectFromWorldCorners(topLeft, bottomRight)
  }

  private getAxisViewLineEntry(preferredL: number | null | undefined): readonly [number, Line] | null {
    if (preferredL !== null && preferredL !== undefined) {
      const line = Multiverse.getLine(this.multiverse, preferredL)
      if (line && Line.getLatestBoardIndex(line) !== null) return [preferredL, line] as const
    }

    for (const [l, line] of Multiverse.getLineEntries(this.multiverse)) {
      if (! line || Line.getLatestBoardIndex(line) === null) continue
      return [l, line] as const
    }
    return null
  }

  private applyWorkspaceState(
    workspace: GameWorkspaceState | null | undefined,
    options: ViewportFocusOptions = {},
    { focusCamera = true }: { focusCamera?: boolean } = {},
  ): boolean {
    if (! workspace) return false

    let restored = false
    if (workspace.axisView) {
      this.axisViewState = normalizeAxisViewState(workspace.axisView)
      restored = true
    }

    if (workspace.recordCursor) {
      const target = this.recordDocument.resolveCursorTarget(workspace.recordCursor)
      if (target) {
        const actions = this.recordDocument.getLineFullActions(target.recordLineId)
        const targetActionIndex = this.recordDocument.getLinePrefixActions(target.recordLineId).length
          + target.recordActionIndex
        this.recordDocument.setActiveLine(target.recordLineId)
        this.applyRecordActionPath(actions, targetActionIndex, {
          persist: false,
          focus: false,
        })
        restored = true
      }
    }

    if (workspace.focusedBoard && this.hasBoardAt(workspace.focusedBoard)) {
      if (focusCamera) this.focusBoard(workspace.focusedBoard.l, workspace.focusedBoard.m, options)
      else {
        this.focusedBoard = { ...workspace.focusedBoard }
        this.axisViewState = {
          ...this.axisViewState,
          l: workspace.focusedBoard.l,
        }
      }
      return true
    }

    this.focusedBoard = null
    if (restored && focusCamera) this.focusCurrentPresent(options)
    return restored
  }

  private syncWorkspace(): GameWorkspaceState {
    const workspace = this.getWorkspaceState()
    this.ctx.onWorkspaceChange?.(workspace)
    return workspace
  }

  private getWorkspaceState(): GameWorkspaceState {
    return {
      axisView: this.getValidAxisViewState(),
      recordCursor: this.getCurrentRecordCursorTarget(),
      focusedBoard: this.getValidFocusedBoard(),
    }
  }

  private persistWorkspaceState(workspace: GameWorkspaceState = this.getWorkspaceState()) {
    if (this.isOnlineGame()) return

    const storageKey = this.getStorageKey()
    const storage = getLocalStorage()
    if (! storage || ! storageKey) return

    try {
      const rawState = storage.getItem(storageKey)
      if (! rawState) return

      const parsedState = JSON.parse(rawState) as Partial<StoredGameState>
      if (! isStoredGameState(parsedState)) return

      storage.setItem(storageKey, JSON.stringify({
        ...parsedState,
        workspace,
      }))
    }
    catch {
      this.logger.error('Failed to save workspace state')
    }
  }

  public focusRecordMoveSegment(
    segment: GameRecordMoveSegment,
    {
      moveCursor = true,
    }: {
      moveCursor?: boolean
    } = {},
  ): boolean {
    const board = segment.focusBoard ?? { l: segment.l, m: segment.m }
    if (moveCursor) {
      const target = this.getRecordMoveSegmentCursorTarget(segment)
      if (! target) return false
      if (
        this.pendingMoves.length > 0
        && target.recordLineId !== this.recordDocument.activeRecordLineId
      ) return false
      if (! this.rollbackToRecordCursorTarget(target, { focus: false })) return false
    }
    this.focusBoard(board.l, board.m)
    return true
  }

  private getRecordMoveSegmentCursorTarget(segment: GameRecordMoveSegment): RecordCursorTarget | null {
    if (
      segment.recordLineId === undefined
      || segment.recordActionIndex === undefined
    ) return null

    const isSourceSegment = (segment.segmentIndex ?? 0) === 0 && (segment.segmentCount ?? 1) > 1
    return {
      recordLineId: segment.recordLineId,
      recordActionIndex: segment.recordActionIndex + (isSourceSegment ? 0 : 1),
    }
  }

  private getValidFocusedBoard(): GameBoardFocus | null {
    if (! this.focusedBoard) return null
    if (this.hasBoardAt(this.focusedBoard)) return { ...this.focusedBoard }

    this.focusedBoard = null
    return null
  }

  private getValidAxisViewState(): GameAxisViewState {
    const state = this.getAxisViewState()
    if (state.l !== null && ! Multiverse.getLine(this.multiverse, state.l)) {
      state.l = null
      this.axisViewState = state
    }
    return state
  }

  private hasBoardAt({ l, m }: GameBoardFocus): boolean {
    const line = Multiverse.getLine(this.multiverse, l)
    return line?.boards[m] !== undefined
  }

  private focusInitialTurn(options: ViewportFocusOptions = {}) {
    for (const [l, line] of Multiverse.getLineEntries(this.multiverse)) {
      if (! line) continue
      this.focusTurn(l, line.mStart, options)
      return
    }
  }

  private focusCurrentPresent(options: ViewportFocusOptions = {}) {
    const present = Multiverse.getPresent(this.multiverse, this.player)
    if (present) {
      const rects = present.lines.flatMap((l): Rect[] => {
        const line = Multiverse.getLine(this.multiverse, l)
        if (! line) return []

        const m = Line.getLatestBoardIndex(line)
        return m === null ? [] : [this.layout.getBoardRect(l, m)]
      })
      if (rects.length > 0) {
        this.focusRects(rects, Sizes.BoardWidth / 2, options)
        return
      }
    }

    this.focusInitialTurn(options)
  }

  private focusRect(rect: Rect, options: ViewportFocusOptions = {}): CameraMotion | null {
    const camera = this.renderer.getCamera()
    return this.moveViewportTo({
      targetCenter: this.layout.getCameraCenterForViewportWorldCenter(Rect.center(rect), camera.scale),
    }, {
      smooth: options.smooth,
    })
  }

  private focusRects(rects: Rect[], padding = 0, options: ViewportFocusOptions = {}) {
    this.syncLayoutMultiverse()
    const bounds = Rect.bounds(rects)
    if (! bounds) return

    const camera = this.renderer.getCamera()
    const targetScale = Math.min(
      camera.scale,
      getScaleToContainRects(rects, this.layout.getViewportScreenSize(), camera.scale, padding),
    )
    this.moveViewportTo({
      targetCenter: this.layout.getCameraCenterForViewportWorldCenter(Rect.center(bounds), targetScale),
      targetScale,
      viewportWorldCenter: Rect.center(bounds),
    }, {
      smooth: options.smooth,
    })
  }

  private loop = () => {
    this.syncLayoutMultiverse()
    this.updateScreen()
    this.updateCameraMotion()
    this.updateCameraBounds()
    this.updateMoveTravelSound()
    this.updateViewFlipTransition()
    this.updateBoardActivationAnimation()
    this.render()
    this.renderer.flush()
    this.finalizeSubmittedMoveAfterAnimation()
    this.continueRemoteActionPlaybackAfterAnimation()
    this.animationFrame = requestAnimationFrame(this.loop)
  }

  private updateScreen() {
    if (! this.resizeDirty) return
    this.renderer.resize()
    this.resizeDirty = false
  }

  private render() {
    this.updateInteraction()
    this.renderMultiverse()
    this.renderViewFlipOverlay()
  }

  private updateViewFlipTransition() {
    const transition = this.viewFlipTransition
    if (! transition) return

    const progress = this.getViewFlipTransitionProgress(transition)
    if (! transition.applied && progress >= 0.5) {
      transition.applied = true
      this.applyViewPlayer(transition.to)
    }
    if (progress >= 1) {
      if (! transition.applied) this.applyViewPlayer(transition.to)
      this.viewFlipTransition = null
    }
  }

  private updateBoardActivationAnimation() {
    const animation = this.boardActivationAnimation
    if (! animation) return

    if (this.getBoardActivationAnimationProgress(animation) >= 1) {
      this.boardActivationAnimation = null
    }
  }

  private renderViewFlipOverlay() {
    const transition = this.viewFlipTransition
    if (! transition) return

    const progress = this.getViewFlipTransitionProgress(transition)
    const alpha = progress < 0.5
      ? Easing.easeInOut(progress * 2)
      : 1 - Easing.easeInOut((progress - 0.5) * 2)
    if (alpha <= 0) return

    const { widthCss, heightCss } = this.renderer.getScreen()
    this.renderer.submit({
      type: RenderItemType.Quad,
      layer: RenderLayer.UI,
      order: 100000,
      space: 'screen',
      mat: Mat3.transform([0, 0], [widthCss, heightCss]),
      color: Color4.fromRgba(0, 0, 0, alpha),
    })
  }

  private getViewFlipTransitionProgress(transition: ViewFlipTransition): number {
    return Scalar.clamp(
      (performance.now() - transition.startedAt) / Animations.ViewFlipTransitionDuration,
      0,
      1,
    )
  }

  private updateInteraction() {
    if (this.isMoveAnimating()) {
      this.hoverSquare = null
      this.hoverPiece = null
      this.hoverCheckWarning = null
      this.syncCanvasCursor()
      this.syncToolbarButtons()
      return
    }
    if (! this.pointerInsideInput) {
      this.clearHoverState()
      return
    }

    const canControlTurn = this.canControlTurn()
    const canInspectMoveRange = ! this.gameInputDisabled
    this.hoverCheckWarning = this.gameInputDisabled || ! canControlTurn
      ? null
      : this.getCheckWarningBadgeAtScreen(this.pointer.screen)
    const hit = this.getBoardSquareAtScreen(this.pointer.screen)
    this.hoverSquare = hit ? { l: hit.l, m: hit.m, coord: hit.coord } : null
    this.hoverPiece = this.selectedPiece || ! canInspectMoveRange
      ? null
      : this.getPieceSelectionAtScreen(this.pointer.screen)
    this.syncCanvasCursor()
    this.syncToolbarButtons()
  }

  private syncCanvasCursor() {
    this.setCanvasCursor(this.shouldUsePointerCursor() ? 'pointer' : '')
  }

  private setCanvasCursor(cursor: string) {
    if (this.canvasCursor === cursor) return
    this.canvasCursor = cursor
    this.renderer.setCursor(cursor)
  }

  private shouldUsePointerCursor(): boolean {
    if (this.gameInputDisabled || this.isMoveAnimating()) return false
    if (this.pointer.dragExceeded || this.pointer.pinchLastDistance !== null) return false
    const canControlTurn = this.canControlTurn()
    if (canControlTurn && this.hoverCheckWarning) return true
    if (this.hoverSquare && this.canEditRecordMarkers()) return true

    if (canControlTurn && this.selectedPiece?.player === this.player && this.hoverSquare) {
      const { l, m, coord } = this.hoverSquare
      const { player, targets } = this.selectedPiece
      if (targets.some(target => (
        this.isTargetAt(target, l, m, coord, player)
      ))) return true
    }

    if (this.hoverPiece) return true

    const selection = this.getInspectablePieceSelectionAtScreen(this.pointer.screen)
    if (selection !== null) return true

    return this.getRecordBoardTargetAtScreen(this.pointer.screen) !== null
  }

  private getToolbarButtons(): ButtonConfig[] {
    const studyToolbar = this.ctx.toolbarMode === 'study'
    const finishGameButton = ! studyToolbar && this.shouldShowFinishGameButton()
      ? {
          id: 'submit-moves',
          disabled: this.ctx.canFinishGame?.() === false,
          colorPreset: this.getGameStatusButtonColor(),
          turnPlayer: this.getGameStatusPlayer(),
          labelKey: 'button.finishGame',
          piece: null,
          onClick: () => {
            this.playUISound()
            this.ctx.onReturnToMainMenuRequest?.({ forfeit: false })
          },
        } satisfies ButtonConfig
      : null
    const leftButton: ButtonConfig = this.selectedPiece
      ? {
          id: 'deselect-piece',
          disabled: this.isMoveAnimating(),
          colorPreset: ButtonColors.Board,
          turnPlayer: this.player,
          labelKey: 'button.deselect',
          piece: this.selectedPiece.piece,
          onClick: () => {
            this.cancelPieceSelection()
          },
        }
      : {
          id: 'undo-move',
          disabled: ! this.canControlTurn()
            || this.pendingMoves.length === 0
            || this.submitRequestedDuringMoveAnimation,
          colorPreset: this.hasPendingChecks()
            ? ButtonColors.Red
            : getUndoMoveButtonColor(this.pendingMoves.at(-1)?.is5D ?? false),
          turnPlayer: this.player,
          labelKey: 'button.undoMove',
          piece: null,
          onClick: () => {
            this.undoMove()
          },
        }

    return [
      leftButton,
      finishGameButton ?? {
        id: 'submit-moves',
        disabled: ! this.canControlTurn()
          || ! this.canSubmitMoves()
          || this.submitRequestedDuringMoveAnimation,
        colorPreset: getPlayerButtonColor(this.player),
        turnPlayer: this.player,
        labelKey: this.ctx.localPlayer === null ? 'button.deduceMoves' : 'button.submitMoves',
        piece: null,
        effect: 'pulse',
        onClick: () => {
          this.submitMoves()
        },
      },
      ...(studyToolbar ? [] : [{
        id: 'forfeit-game',
        disabled: this.ctx.canForfeitGame?.() === false,
        colorPreset: getPlayerButtonColor(this.player),
        turnPlayer: this.player,
        labelKey: 'button.forfeit',
        piece: null,
        onClick: () => {
          this.playForfeitSound()
          this.ctx.onReturnToMainMenuRequest?.({ forfeit: true })
        },
      } satisfies ButtonConfig]),
      {
        id: 'export-5dpgn',
        disabled: false,
        colorPreset: getPlayerButtonColor(this.player),
        turnPlayer: this.player,
        labelKey: 'button.export',
        piece: null,
        onClick: () => {
          this.requestExportFiveDPGN()
        },
      },
    ]
  }

  public clickToolbarButton(id: string): boolean {
    const button = this.getToolbarButtons().find(button => button.id === id)
    if (! button) return false
    if (this.gameInputDisabled && isPrimaryGameToolbarButton(id)) return true
    if (button.disabled) return true
    button.onClick()
    if (this.gameDisposed) return true
    this.syncToolbarButtons()
    return true
  }

  public getToolbarButtonViews(): GameToolbarButton[] {
    return this.getToolbarButtons().map(button => toToolbarButtonView(button))
  }

  private syncToolbarButtons() {
    if (! this.ctx.onToolbarChange) return

    const buttons = this.getToolbarButtonViews()
    const signature = JSON.stringify(buttons)
    if (signature === this.toolbarSignature) return

    this.toolbarSignature = signature
    this.ctx.onToolbarChange(buttons)
  }

  private syncRecord() {
    if (! this.ctx.onRecordChange) return

    const rowsSignature = this.getRecordRowsSignature()
    const headerTextSignature = this.getRecordHeaderTextSignature()
    const signature = JSON.stringify({
      rowsSignature,
      headerTextSignature,
      currentCursor: this.getCurrentRecordCursorTarget(),
      currentActionIndex: this.actionIndex,
      hasPendingMoves: this.pendingMoves.length > 0,
    })
    if (signature === this.recordSignature) return

    const request = this.buildRecordView({ headerTextSignature, rowsSignature })
    this.recordSignature = signature
    this.ctx.onRecordChange(request)
  }

  private syncStatus() {
    if (! this.ctx.onStatusChange) return

    const status = this.getStatusView()
    const signature = JSON.stringify(status)
    if (signature === this.statusSignature) return

    this.statusSignature = signature
    this.ctx.onStatusChange(status)
  }

  private updateGameEndState() {
    this.gameEndTrial = false
    this.gameEndTrialStatus = null
    if (this.pendingMoves.length > 0) {
      this.gameEndStatus = null
      return
    }

    const status = CoreGameState.getCheckmateResult({
      multiverse: this.multiverse,
      player: this.player,
    }).status
    this.gameEndStatus = status === 'not-checkmate' ? null : status
  }

  private getStatusView(): GameStatusView {
    if (this.gameEndStatus === 'checkmate') {
      const winner = CorePlayers.opponent(this.player)
      const colors = this.getStatusTextColors(winner)
      return {
        kind: 'checkmate',
        player: winner,
        ...colors,
        ended: true,
      }
    }

    if (this.gameEndStatus === 'stalemate') {
      const colors = this.getStatusTextColors(Player.W)
      return {
        kind: 'stalemate',
        player: null,
        ...colors,
        ended: true,
      }
    }

    const colors = this.getStatusTextColors(this.player)
    return {
      kind: 'turn',
      player: this.player,
      ...colors,
      ended: this.gameEndTrial,
    }
  }

  private getStatusTextColors(player: Player): Pick<GameStatusView, 'color' | 'shadowColor'> {
    const color = player === Player.W ? Colors.BoardBorderWhite : Colors.BoardBorderBlack
    const shadowColor = player === Player.W ? Colors.BoardBorderBlack : Colors.BoardBorderWhite
    return {
      color: Color4.toRgbaString(color),
      shadowColor: Color4.toRgbaString(shadowColor),
    }
  }

  private getGameStatusButtonColor(): ButtonColorPreset {
    if (this.gameEndStatus === 'stalemate') return ButtonColors.White
    return getPlayerButtonColor(this.getGameStatusPlayer())
  }

  private getGameStatusPlayer(): Player {
    if (this.gameEndStatus === 'stalemate') return Player.W
    return this.gameEndStatus === 'checkmate' ? CorePlayers.opponent(this.player) : this.player
  }

  private isGameEnded(): boolean {
    return this.gameEndStatus !== null
  }

  private isExternallyFinished(): boolean {
    return this.ctx.isExternallyFinished?.() ?? false
  }

  private shouldShowFinishGameButton(): boolean {
    return this.isGameEnded() || this.isExternallyFinished()
  }

  private handleBoardClick(screen: Vec2) {
    if (this.isMoveAnimating()) return
    if (this.gameInputDisabled) return
    if (this.canControlTurn()) {
      if (this.tryCreatePassAt(screen)) return
      if (this.tryCreateMoveAt(screen)) return
    }
    if (this.selectPieceAt(screen)) return
  }

  private handleBoardRecordFocusClick(screen: Vec2) {
    if (this.gameInputDisabled) return

    const hit = this.getBoardSquareAtScreen(screen)
    if (! hit) return

    const target = this.getRecordBoardTargetAtScreen(screen)
    this.focusBoard(hit.l, hit.m)
    if (target) this.ctx.onRecordMoveFocusRequest?.(target)
    this.playUISound()
  }

  private selectPieceAt(screen: Vec2): boolean {
    const selection = this.getInspectablePieceSelectionAtScreen(screen)
    if (! selection) return false
    this.selectedPiece = selection
    this.playUISound()
    return true
  }

  private handleRecordMarkerClick(screen: Vec2): boolean {
    if (this.selectedPiece && ! this.pointer.clickCtrlKey) {
      this.cancelPieceSelection()
      return true
    }
    if (! this.canEditRecordMarkers()) return false
    const square = this.getRecordMarkerSquareAtScreen(screen)
    if (! square) return false

    if (this.pointer.clickCtrlKey) {
      this.pendingArrowMarkerStart = square
      this.deselectPiece()
      this.playUISound()
      return true
    }

    const pendingStart = this.pendingArrowMarkerStart
    if (pendingStart) {
      this.pendingArrowMarkerStart = null
      if (! this.isSameRecordMarkerSquare(pendingStart, square)) {
        return this.toggleArrowMarker(pendingStart, square)
      }
    }

    return this.toggleSquareMarker(square)
  }

  private handleRecordMarkerDrag(screen: Vec2): boolean {
    if (! this.canEditRecordMarkers()) return false
    const from = this.dragArrowMarkerStart
    const to = this.getRecordMarkerSquareAtScreen(screen)
    if (! from || ! to) return false
    if (this.isSameRecordMarkerSquare(from, to)) return this.toggleSquareMarker(to)
    this.pendingArrowMarkerStart = null
    return this.toggleArrowMarker(from, to)
  }

  private getRecordMarkerSquareAtScreen(screen: Vec2): RecordMarkerSquare | null {
    const hit = this.getBoardSquareAtScreen(screen)
    if (! hit) return null

    const boardPlayer = this.getBoardPlayer(hit.m)
    return {
      l: hit.l,
      m: hit.m,
      player: boardPlayer,
      coord: {
        l: hit.l,
        t: Coord.turn(hit.m, boardPlayer),
        x: hit.coord.x,
        y: hit.coord.y,
      },
    }
  }

  private toggleSquareMarker(square: RecordMarkerSquare): boolean {
    const target = this.getCurrentRecordCursorTarget()
    const annotationsBefore = this.recordDocument.getAnnotations()
    const changed = this.recordDocument.toggleSquareMarker(
      target.recordLineId,
      target.recordActionIndex,
      square.m,
      square.coord,
      this.getRecordMarkerAuthor(),
    )
    if (! changed) return false

    this.sendStudyAnnotationChanges(annotationsBefore, this.recordDocument.getAnnotations())
    this.deselectPiece()
    this.playUISound()
    this.persistGameState()
    this.syncRecord()
    return true
  }

  private toggleArrowMarker(from: RecordMarkerSquare, to: RecordMarkerSquare): boolean {
    const target = this.getCurrentRecordCursorTarget()
    const annotationsBefore = this.recordDocument.getAnnotations()
    const changed = this.recordDocument.toggleArrowMarker(
      target.recordLineId,
      target.recordActionIndex,
      from.coord,
      from.player,
      to.coord,
      to.player,
      this.getRecordMarkerAuthor(),
    )
    if (! changed) return false

    this.sendStudyAnnotationChanges(annotationsBefore, this.recordDocument.getAnnotations())
    this.deselectPiece()
    this.playUISound()
    this.persistGameState()
    this.syncRecord()
    return true
  }

  private getRecordMarkerAuthor(): { authorId: string, color: string } {
    const authorId = this.ctx.getRecordAuthorId?.() ?? DEFAULT_RECORD_MARKER_AUTHOR_ID
    return {
      authorId,
      color: this.getRecordMarkerColor(authorId),
    }
  }

  private getRecordMarkerColor(authorId: string, explicitColor?: string): string {
    return this.ctx.getRecordAuthorColor?.(authorId)
      ?? explicitColor
      ?? getRecordMarkerAuthorColor(authorId)
  }

  private isSameRecordMarkerSquare(a: RecordMarkerSquare, b: RecordMarkerSquare): boolean {
    return a.l === b.l
      && a.m === b.m
      && a.coord.x === b.coord.x
      && a.coord.y === b.coord.y
  }

  private canEditRecordMarkers(): boolean {
    return ! this.isOnlineGame()
      && ! this.isMoveAnimating()
      && this.pendingMoves.length === 0
  }

  private getRecordBoardTargetAtScreen(screen: Vec2): GameRecordMoveFocusTarget | null {
    const hit = this.getBoardSquareAtScreen(screen)
    if (! hit) return null
    if (! hit.board.createdBy) return null
    if (hit.board.createdByOrder === null) return null

    const fullActionIndex = Math.floor(hit.board.createdByOrder / CoreGameState.MOVE_ORDER_STRIDE)
    const actionTarget = this.recordDocument.getLineFullActionTarget(
      this.recordDocument.activeRecordLineId,
      fullActionIndex,
    )
    if (! actionTarget) return null
    return {
      ...actionTarget,
      moveIndex: hit.board.createdByOrder % CoreGameState.MOVE_ORDER_STRIDE,
      segmentIndex: hit.board.createdByRole === 'target' ? 1 : 0,
    }
  }

  private tryCreatePassAt(screen: Vec2): boolean {
    const warning = this.getCheckWarningBadgeAtScreen(screen)
    if (! warning) return false
    const wasGameEndStatus = this.gameEndStatus
    const wasGameEnded = wasGameEndStatus !== null

    const t = Coord.turn(warning.m, this.player)
    const move: Move = {
      from: { x: 0, y: 0, l: warning.l, t },
      to: { x: 0, y: 0, l: warning.l, t },
    }
    const multiverseBefore = this.multiverse
    const order = this.getMoveOrder(this.pendingMoves.length)
    const pendingMove: PendingMove = {
      move,
      isPass: true,
      order,
      multiverseBefore,
      is5D: false,
      from: warning,
      created: {
        l: warning.l,
        m: warning.m + 1,
      },
    }

    this.multiverse = Multiverse.createPass(multiverseBefore, this.player, [warning.l])
    this.pendingMoves.push(pendingMove)
    this.pendingMove = pendingMove
    this.gameEndTrial ||= wasGameEnded
    if (wasGameEndStatus) this.gameEndTrialStatus = wasGameEndStatus
    this.gameEndStatus = null
    this.syncCheckState()
    this.boardActivationAnimation = null
    this.moveAnimation = {
      startedAt: performance.now(),
      cameraCenter: [...this.renderer.getCamera().center],
      cameraScale: this.renderer.getCamera().scale,
      viewportFollowDisabled: false,
      travelLoop: null,
      travelHitPlayed: false,
    }
    this.submitRequestedDuringMoveAnimation = false
    this.deselectPiece()
    this.playUISound()
    this.persistGameState()
    this.notifyPendingActionChange()
    return true
  }

  private tryCreateMoveAt(screen: Vec2): boolean {
    if (! this.selectedPiece) return false
    if (this.selectedPiece.player !== this.player) return false
    const wasGameEndStatus = this.gameEndStatus
    const wasGameEnded = wasGameEndStatus !== null

    const hit = this.getBoardSquareAtScreen(screen)
    if (! hit) return false
    const target = this.selectedPiece.targets.find(target => (
      target.l === hit.l
      && Coord.boardIndex(target, this.selectedPiece!.player) === hit.m
      && Coord.isSameSpace(target, hit.coord)
    ))
    if (! target) return false

    const move: Move = {
      from: this.selectedPiece.from,
      to: target,
    }
    this.createAnimatedPendingMove(move, { playSound: true, persist: true, notify: true })
    this.gameEndTrial ||= wasGameEnded
    if (wasGameEndStatus) this.gameEndTrialStatus = wasGameEndStatus
    this.selectedPiece = null
    return true
  }

  private createAnimatedPendingMove(
    move: Move,
    { playSound, persist, notify = false }: { playSound: boolean, persist: boolean, notify?: boolean },
  ): PendingMove {
    const multiverseBefore = this.multiverse
    const order = this.getMoveOrder(this.pendingMoves.length)
    const pendingMove: PendingMove = {
      move,
      order,
      multiverseBefore,
      is5D: ! Coord.isSameBoard(move.from, move.to),
      from: {
        l: move.from.l,
        m: Coord.boardIndex(move.from, this.player),
      },
      created: Multiverse.getMoveArrivalBoardIndex(move, this.player, multiverseBefore),
    }
    this.multiverse = Multiverse.applyMove(move, this.player, multiverseBefore, order)
    this.pendingMoves.push(pendingMove)
    this.pendingMove = pendingMove
    this.gameEndStatus = null
    this.syncCheckState()
    this.boardActivationAnimation = null
    this.moveAnimation = {
      startedAt: performance.now(),
      cameraCenter: [...this.renderer.getCamera().center],
      cameraScale: this.renderer.getCamera().scale,
      viewportFollowDisabled: false,
      travelLoop: null,
      travelHitPlayed: false,
    }
    this.submitRequestedDuringMoveAnimation = false
    if (playSound) this.playUISound()
    if (persist) this.persistGameState()
    if (notify) this.notifyPendingActionChange()
    return pendingMove
  }

  private undoMove() {
    if (! this.canControlTurn()) return
    if (this.submitRequestedDuringMoveAnimation) return
    if (this.pendingMoves.length === 0) return
    const undoneMove = this.pendingMoves.at(-1)!
    this.playUndoSound()
    this.pendingMoves.pop()
    this.multiverse = this.replayPendingMoves()
    this.pendingMove = this.pendingMoves.at(-1) ?? null
    if (this.pendingMoves.length === 0) {
      this.gameEndTrial = false
      this.gameEndTrialStatus = null
      this.updateGameEndState()
    }
    else {
      this.gameEndStatus = null
    }
    this.syncCheckState()
    this.clearMoveAnimation()
    this.startBoardActivationAnimation(undoneMove)
    this.submitRequestedDuringMoveAnimation = false
    this.deselectPiece()
    this.persistGameState()
    this.notifyPendingActionChange()
  }

  private startBoardActivationAnimation(pendingMove: PendingMove) {
    const boardKeys = new Set<string>()
    const candidates = [
      pendingMove.from,
      ...(pendingMove.is5D
        ? [{
            l: pendingMove.move.to.l,
            m: Coord.boardIndex(pendingMove.move.to, this.player),
          }]
        : []),
    ]

    for (const candidate of candidates) {
      if (this.isTerminalBoard(Multiverse.getLine(this.multiverse, candidate.l), candidate.m)) {
        boardKeys.add(this.getBoardKey(candidate.l, candidate.m))
      }
    }

    this.boardActivationAnimation = boardKeys.size === 0
      ? null
      : {
          boardKeys,
          startedAt: performance.now(),
        }
  }

  private submitMoves() {
    if (! this.canControlTurn()) return
    if (! this.canSubmitMoves()) return
    this.playUISound()

    if (this.isMoveAnimating()) {
      this.submitRequestedDuringMoveAnimation = true
      this.deselectPiece()
      return
    }

    this.finalizeSubmitMoves()
  }

  private finalizeSubmittedMoveAfterAnimation() {
    if (! this.submitRequestedDuringMoveAnimation) return
    if (this.isMoveAnimating()) return
    this.finalizeSubmitMoves()
  }

  private continueRemoteActionPlaybackAfterAnimation() {
    if (! this.remoteActionMoves) return
    if (this.isMoveAnimating()) return

    if (this.remoteActionMoves.length > 0) {
      this.startNextRemoteMove()
      return
    }

    this.finalizeRemoteAction()
    this.remoteActionMoves = null
    this.startNextRemoteAction()
  }

  private finalizeSubmitMoves() {
    if (! this.canSubmitMoves()) {
      this.submitRequestedDuringMoveAnimation = false
      this.syncToolbarButtons()
      return
    }

    const action: Action = {
      moves: this.pendingMoves
        .filter(pendingMove => ! pendingMove.isPass)
        .map(pendingMove => pendingMove.move),
    }
    const studyPosition = this.recordDocument.toStudyPosition({
      recordLineId: this.recordDocument.activeRecordLineId,
      recordActionIndex: this.recordDocument.getActiveLineLocalActionIndex(this.actionIndex),
    })
    if (studyPosition && this.ctx.onStudyActionSubmitRequest?.(action, studyPosition)) {
      this.submitRequestedDuringMoveAnimation = false
      this.deselectPiece()
      this.syncToolbarButtons()
      return
    }

    this.appendActionToActiveRecordLine(action)
    this.multiverseCommitted = this.multiverse
    this.pendingMove = null
    this.pendingMoves = []
    this.clearMoveAnimation()
    this.submitRequestedDuringMoveAnimation = false
    this.deselectPiece()
    this.player = CorePlayers.opponent(this.player)
    this.actionIndex += 1
    this.syncAutomaticViewPlayer()
    this.gameEndTrial = false
    this.gameEndTrialStatus = null
    this.updateGameEndState()
    if (this.isGameEnded()) this.playGameEndSound()
    else this.playTurnStartSound()
    this.syncCheckState()
    this.persistGameState()
    this.ctx.onActionSubmitted?.(action, this.actions)
  }

  private tryStartRemoteActionPlayback(actions: Action[]): boolean {
    const signature = JSON.stringify(actions)
    if (signature === this.remoteActionTargetSignature) return true
    if (! this.isOnlineGame()) return false
    if (! isActionPrefix(this.actions, actions)) return false

    const nextActions = actions.slice(this.actions.length)
    if (nextActions.length === 0) return false

    this.remoteActionTargetSignature = signature
    this.remoteActionQueue = nextActions
    this.remoteActionMoves = null
    this.startNextRemoteAction()
    return true
  }

  private startNextRemoteAction() {
    if (this.isMoveAnimating() || this.pendingMoves.length > 0) return

    const action = this.remoteActionQueue.shift()
    if (! action) {
      this.remoteActionTargetSignature = ''
      return
    }

    this.remoteActionMoves = [...action.moves]
    if (this.remoteActionMoves.length === 0) {
      this.finalizeRemoteAction()
      this.remoteActionMoves = null
      this.startNextRemoteAction()
      return
    }

    this.startNextRemoteMove()
  }

  private startNextRemoteMove() {
    const move = this.remoteActionMoves?.shift()
    if (! move) return

    this.createAnimatedPendingMove(move, { playSound: true, persist: false })
  }

  private finalizeRemoteAction() {
    const action: Action = {
      moves: this.pendingMoves
        .filter(pendingMove => ! pendingMove.isPass)
        .map(pendingMove => pendingMove.move),
    }
    this.appendActionToActiveRecordLine(action)
    this.multiverseCommitted = this.multiverse
    this.pendingMove = null
    this.pendingMoves = []
    this.clearMoveAnimation()
    this.submitRequestedDuringMoveAnimation = false
    this.deselectPiece()
    this.player = CorePlayers.opponent(this.player)
    this.actionIndex += 1
    this.syncAutomaticViewPlayer()
    this.gameEndTrial = false
    this.gameEndTrialStatus = null
    this.updateGameEndState()
    if (this.isGameEnded()) this.playGameEndSound()
    else this.playTurnStartSound()
    this.syncCheckState()
    this.persistGameState()
  }

  public importFiveDPGNText(input: string): string | null {
    try {
      this.loadCoreGameState(FiveDPGN.importGameState(input), {
        recordDocument: RecordDocument.fromFiveDPGN(input),
      })
      this.syncToolbarButtons()
      return null
    }
    catch (error) {
      return error instanceof Error ? error.message : 'Failed to import game record'
    }
  }

  public getFiveDPGNExport(
    mode: GameExportMode = 'tree',
    format: GameExportFormat = 'pgn',
  ): GameExportRequest {
    const options: FiveDPGN.ExportOptions = {
      ...this.getFiveDPGNExportOptions(),
      initialMultiverse: this.initialMultiverse,
      studyAnnotations: this.recordDocument.serializeFiveDPGNAnnotations(),
    }
    const text = this.getFiveDPGNExportText(mode, format, options)
    const actions = this.getRecordRowsForDisplay()
    return {
      text,
      format,
      mode,
      hasPendingMoves: format === 'pgn' && this.pendingMoves.length > 0,
      currentActionIndex: this.actionIndex,
      currentCursor: this.getCurrentRecordCursorTarget(),
      actions,
    }
  }

  public getRecordView(): GameExportRequest {
    return this.buildRecordView()
  }

  private buildRecordView(signatures: {
    headerTextSignature?: string
    rowsSignature?: string
  } = {}): GameExportRequest {
    return {
      text: this.getRecordHeaderText(signatures.headerTextSignature),
      format: 'pgn',
      mode: 'tree',
      hasPendingMoves: this.pendingMoves.length > 0,
      currentActionIndex: this.actionIndex,
      currentCursor: this.getCurrentRecordCursorTarget(),
      actions: this.getRecordRowsForDisplay(signatures.rowsSignature),
    }
  }

  private getRecordHeaderText(signature = this.getRecordHeaderTextSignature()): string {
    if (signature === this.recordHeaderTextSignature) return this.recordHeaderTextCache

    const options: FiveDPGN.ExportOptions = {
      ...this.getFiveDPGNExportOptions(),
      initialMultiverse: this.initialMultiverse,
    }
    try {
      this.recordHeaderTextCache = FiveDPGN.exportActionTree({ variations: [] }, options)
    }
    catch (error) {
      this.logger.error(error instanceof Error ? error.message : String(error))
      this.recordHeaderTextCache = ''
    }
    this.recordHeaderTextSignature = signature
    return this.recordHeaderTextCache
  }

  private getRecordHeaderTextSignature(): string {
    return JSON.stringify({
      options: this.getFiveDPGNExportOptions(),
      initialMultiverse: this.initialMultiverse,
    })
  }

  private getRecordRowsForDisplay(signature = this.getRecordRowsSignature()): GameRecordRow[] {
    if (signature === this.recordRowsSignature) return this.recordRowsCache

    this.recordRowsCache = this.tryBuildRecordActionsForDisplay()
    this.recordRowsSignature = signature
    return this.recordRowsCache
  }

  private getRecordRowsSignature(): string {
    return JSON.stringify({
      actionIndex: this.actionIndex,
      pendingMoves: this.getPendingMoves(),
      initialMultiverse: this.initialMultiverse,
      lines: this.recordDocument.serializeLines(),
      annotations: this.recordDocument.serializeAnnotations(),
      activeRecordLineId: this.recordDocument.activeRecordLineId,
      nextRecordLineId: this.recordDocument.nextRecordLineId,
      options: this.fiveDPGNOptions,
      recoveryMode: this.recordRecoveryMode,
    })
  }

  private getFiveDPGNExportText(
    mode: GameExportMode,
    format: GameExportFormat,
    options: FiveDPGN.ExportOptions,
  ): string {
    if (format === 'pgn' && this.recordRecoveryMode) {
      return this.exportRawRecordTreeForRecovery(options)
    }
    try {
      return format === 'fen'
        ? FiveDPGN.exportFEN(this.multiverse)
        : mode === 'tree'
          ? FiveDPGN.exportActionTree(this.recordDocument.buildActionTree(), options)
          : FiveDPGN.exportGameState({
              actions: this.actions.slice(0, Scalar.clamp(this.actionIndex, 0, this.actions.length)),
            }, options)
    }
    catch (error) {
      this.logger.error(error instanceof Error ? error.message : String(error))
      if (format === 'fen') return ''
      return this.exportRawRecordTreeForRecovery(options)
    }
  }

  private tryBuildRecordActionsForDisplay(): GameRecordRow[] {
    try {
      return this.buildRecordActionsForDisplay()
    }
    catch (error) {
      this.logger.error(error instanceof Error ? error.message : String(error))
      return []
    }
  }

  private exportRawRecordTreeForRecovery(options: FiveDPGN.ExportOptions): string {
    const tree = this.recordDocument.buildActionTree()
    const body = this.formatRawActionTreeForRecovery(
      tree,
      getMultiverseBoardSize(options.initialMultiverse ?? this.initialMultiverse),
    )
    try {
      const emptyExport = FiveDPGN.exportActionTree({ variations: [] }, options).trimEnd()
      const lines = emptyExport.split('\n')
      const result = lines.pop() ?? options.result ?? '*'
      return [
        ...lines,
        '{ Recovery export: moves are raw source/target coordinates because the normal formatter failed. }',
        ...(body.trim() ? [body] : []),
        result,
      ].join('\n') + '\n'
    }
    catch (error) {
      this.logger.error(error instanceof Error ? error.message : String(error))
      return `${body}\n`
    }
  }

  private formatRawActionTreeForRecovery(
    tree: FiveDPGN.ActionTree,
    boardSize: BoardSize,
    actionIndex = 0,
  ): string {
    const parts: string[] = []
    for (let index = 0; index < tree.variations.length; index += 1) {
      const variation = tree.variations[index]!
      const actionLine = [
        ...formatRecoveryComments(variation.commentsBefore),
        `${formatRecoveryTurnSerial(actionIndex)} ${variation.action.moves.map((move, moveIndex) => (
          `${formatRecoveryMove(move, boardSize)}${formatRecoveryGlyphs(variation.moveGlyphs?.[moveIndex])}`
        )).join(' ')}${formatRecoveryComments(variation.commentsAfter).map(comment => ` ${comment}`).join('')}`,
      ].join('\n')
      const subtreeText = variation.subtree?.variations.length
        ? this.formatRawActionTreeForRecovery(variation.subtree, boardSize, actionIndex + 1)
        : ''
      const variationText = subtreeText ? `${actionLine}\n${subtreeText}` : actionLine
      const shouldParenthesize = tree.variations.length > 1 && index < tree.variations.length - 1
      parts.push(shouldParenthesize ? `(${variationText})` : variationText)
    }
    return parts.join('\n')
  }

  private getFiveDPGNExportOptions(): FiveDPGN.ExportOptions {
    return {
      ...this.fiveDPGNOptions,
      ...this.ctx.getFiveDPGNExportMetadata?.(),
      studyGlyphTemplates: this.ctx.getFiveDPGNGlyphTemplates?.() ?? [],
    }
  }

  private buildRecordActionsForDisplay(): GameRecordRow[] {
    return buildGameRecordRows({
      document: this.recordDocument,
      actionIndex: this.actionIndex,
      pendingMoves: this.getPendingMoves(),
      initialMultiverse: this.initialMultiverse,
      fiveDPGNOptions: this.fiveDPGNOptions,
    })
  }

  public rollbackToActionEnd(actionIndex: number): boolean {
    if (this.isMoveAnimating()) return false

    const targetActionIndex = Scalar.clamp(Math.floor(actionIndex), 0, this.actions.length)
    const state = CoreGameState.create(this.actions.slice(0, targetActionIndex), [], this.initialMultiverse)
    this.initialMultiverse = state.initialMultiverse
    this.multiverseCommitted = state.multiverseCommitted
    this.multiverse = state.multiverse
    this.player = state.player
    this.actionIndex = state.actionIndex
    this.syncAutomaticViewPlayer()
    this.selectedPiece = null
    this.hoverSquare = null
    this.hoverPiece = null
    this.pendingMove = null
    this.pendingMoves = []
    this.clearMoveAnimation()
    this.submitRequestedDuringMoveAnimation = false
    this.gameEndTrial = false
    this.gameEndTrialStatus = null
    this.cameraMotion = null
    this.clearPointerDrag()
    this.updateGameEndState()
    this.syncCheckState()
    this.persistGameState()
    this.focusCurrentPresent()
    this.syncToolbarButtons()
    return true
  }

  private requestExportFiveDPGN() {
    this.ctx.onExportRequest?.(this.getFiveDPGNExport())
  }

  private loadCoreGameState(
    state: CoreGameState,
    {
      focus = true,
      recordDocument,
    }: {
      focus?: boolean
      recordDocument?: RecordDocument
    } = {},
  ) {
    this.initialMultiverse = state.initialMultiverse
    this.actions = state.actions
    this.recordDocument = recordDocument ?? RecordDocument.create(state.actions)
    this.recordRecoveryMode = false
    this.multiverseCommitted = state.multiverseCommitted
    this.multiverse = state.multiverse
    this.player = state.player
    this.actionIndex = state.actionIndex
    this.syncAutomaticViewPlayer()
    this.selectedPiece = null
    this.hoverSquare = null
    this.hoverPiece = null
    this.pendingMove = null
    this.pendingMoves = []
    this.clearMoveAnimation()
    this.submitRequestedDuringMoveAnimation = false
    this.gameEndTrial = false
    this.gameEndTrialStatus = null
    this.cameraMotion = null
    this.clearPointerDrag()
    this.updateGameEndState()
    this.syncCheckState()
    this.persistGameState()
    if (focus) this.focusCurrentPresent()
  }

  private deselectPiece() {
    this.selectedPiece = null
  }

  private cancelPieceSelection() {
    if (! this.selectedPiece) return
    this.selectedPiece = null
    this.playUISound()
  }

  private playUISound() {
    this.soundManager.play('lightswitch.ogg', { volume: this.getUISoundVolume() })
  }

  private playUndoSound() {
    this.soundManager.play('guiro_long.ogg', { volume: this.getUISoundVolume() })
  }

  private playForfeitSound() {
    this.soundManager.play('timpani_hit_a2.ogg', { volume: this.getUISoundVolume() })
  }

  private playTurnStartSound() {
    if (this.isOnlineGame()) return

    if (this.ctx.localPlayer === this.player) {
      this.soundManager.play('bell.ogg', { volume: this.getBellSoundVolume() })
      return
    }

    this.soundManager.playSequence([
      { name: 'timpani_hit_c3.ogg', nextAfter: 0.5 },
      'timpani_hit_e3.ogg',
    ], { volume: this.getBellSoundVolume() })
  }

  private playLocalTurnStartSoundAfterLoadedAction(previousPlayer: Player, previousActionIndex: number) {
    if (! this.isOnlineGame()) return
    if (this.isGameEnded()) return
    if (this.ctx.localPlayer !== this.player) return
    if (previousPlayer === this.player) return
    if (this.actionIndex <= previousActionIndex) return

    this.playTurnStartSound()
  }

  private playGameEndSound() {
    this.soundManager.playSequence([
      { name: 'timpani_hit_c3.ogg', nextAfter: 0.5 },
      'fanfare.ogg',
    ], { volume: this.getBellSoundVolume() })
  }

  private getUISoundVolume(): number {
    return this.ctx.getUISoundVolume?.() ?? 1
  }

  private getBellSoundVolume(): number {
    return this.ctx.getBellSoundVolume?.() ?? 1
  }

  private syncAutomaticViewPlayer() {
    if (! this.autoSwitchViewPlayer) return
    this.setViewPlayer(this.player)
  }

  private canSubmitMoves(): boolean {
    return ! this.isGameEnded()
      && ! this.gameEndTrial
      && this.pendingMoves.length > 0
      && ! this.pendingMoves.some(pendingMove => pendingMove.isPass)
      && this.hasSubmittedPresentMoves()
      && ! this.hasPendingChecks()
      && ! this.hasCheckWarning()
  }

  private syncCheckState() {
    this.syncCheckWarnings()
    this.syncPendingChecks()
  }

  private syncCheckWarnings() {
    const checkWarningBoardKeys = new Set<string>()
    const checkWarningBoards = CoreGameState.findPassCheckWarnings({
      multiverse: this.multiverse,
      player: this.player,
      includePhantom: this.isGameEnded(),
    })
    for (const { l, m } of checkWarningBoards) {
      checkWarningBoardKeys.add(this.getBoardKey(l, m))
    }

    this.checkWarningBoards = checkWarningBoards
    this.checkWarningBoardKeys = checkWarningBoardKeys
  }

  private syncPendingChecks() {
    const pendingCheckBoardKeys = new Set<string>()
    const redCandidateBoardKeys = this.getPendingCheckRedCandidateBoardKeys()
    const attackingPlayer = CorePlayers.opponent(this.player)
    const checks = this.pendingMoves.length === 0
      ? []
      : Multiverse.findChecks(this.multiverse, attackingPlayer)

    this.pendingChecks = checks.map((move) => {
      const fromBoard = {
        l: move.from.l,
        m: Coord.boardIndex(move.from, attackingPlayer),
      }
      const toBoard = {
        l: move.to.l,
        m: Coord.boardIndex(move.to, attackingPlayer),
      }
      this.addPendingCheckRedBoardKey(pendingCheckBoardKeys, redCandidateBoardKeys, fromBoard)
      this.addPendingCheckRedBoardKey(pendingCheckBoardKeys, redCandidateBoardKeys, toBoard)
      return {
        move,
        attackingPlayer,
        fromBoard,
        toBoard,
      }
    })
    this.pendingCheckBoardKeys = pendingCheckBoardKeys
  }

  private getPendingCheckRedCandidateBoardKeys(): ReadonlySet<string> {
    const boardKeys = new Set<string>()
    for (const pendingMove of this.pendingMoves) {
      const mandatoryLines = new Set(
        Multiverse.getTimelineStatus(pendingMove.multiverseBefore, this.player).mandatory,
      )

      this.addNewBoardOfMandatoryBoardKey(
        boardKeys,
        pendingMove.multiverseBefore,
        pendingMove.from,
        this.getPendingMoveSourceCreatedBoard(pendingMove),
        mandatoryLines,
      )

      if (pendingMove.is5D) {
        this.addNewBoardOfMandatoryBoardKey(
          boardKeys,
          pendingMove.multiverseBefore,
          {
            l: pendingMove.move.to.l,
            m: Coord.boardIndex(pendingMove.move.to, this.player),
          },
          pendingMove.created,
          mandatoryLines,
        )
      }
    }
    return boardKeys
  }

  private addNewBoardOfMandatoryBoardKey(
    boardKeys: Set<string>,
    multiverse: Multiverse,
    board: { l: number, m: number },
    newBoard: { l: number, m: number },
    mandatoryLines: ReadonlySet<number>,
  ) {
    if (this.isMandatoryActiveBoard(multiverse, board.l, board.m, mandatoryLines)) {
      boardKeys.add(this.getBoardKey(newBoard.l, newBoard.m))
    }
  }

  private addPendingCheckRedBoardKey(
    pendingCheckBoardKeys: Set<string>,
    redCandidateBoardKeys: ReadonlySet<string>,
    board: { l: number, m: number },
  ) {
    const boardKey = this.getBoardKey(board.l, board.m)
    if (redCandidateBoardKeys.has(boardKey)) pendingCheckBoardKeys.add(boardKey)
  }

  private hasPendingChecks(): boolean {
    return this.pendingChecks.length > 0
  }

  private hasCheckWarning(): boolean {
    return this.checkWarningBoardKeys.size > 0
  }

  private isCheckWarningBoard(l: number, m: number): boolean {
    return this.checkWarningBoardKeys.has(this.getBoardKey(l, m))
  }

  private isPendingCheckBoard(l: number, m: number): boolean {
    return this.pendingCheckBoardKeys.has(this.getBoardKey(l, m))
  }

  private isMandatoryActiveBoard(
    multiverse: Multiverse,
    l: number,
    m: number,
    mandatoryLines: ReadonlySet<number> = new Set(Multiverse.getTimelineStatus(multiverse, this.player).mandatory),
  ): boolean {
    if (! mandatoryLines.has(l)) return false

    const line = Multiverse.getLine(multiverse, l)
    return Line.getLatestBoardIndex(line) === m
  }

  private isTerminalBoard(line: Line | null, m: number): boolean {
    if (! line) return false
    return Line.getLatestBoardIndex(line) === m
  }

  private getBoardKey(l: number, m: number): string {
    return `${l}:${m}`
  }

  private getMoveOrder(pendingMoveIndex: number): number {
    return this.actionIndex * CoreGameState.MOVE_ORDER_STRIDE + pendingMoveIndex
  }

  private getCommittedMoveOrderBase(): number {
    return Math.max(0, this.actionIndex - 1) * CoreGameState.MOVE_ORDER_STRIDE
  }

  private replayPendingMoves(): Multiverse {
    return this.pendingMoves.reduce(
      (multiverse, pendingMove) => pendingMove.isPass
        ? Multiverse.createPass(multiverse, this.player, [pendingMove.from.l])
        : Multiverse.applyMove(
          pendingMove.move,
          this.player,
          multiverse,
          pendingMove.order,
        ),
      this.multiverseCommitted,
    )
  }

  private getPendingMoves(): Move[] {
    return this.pendingMoves
      .filter(pendingMove => ! pendingMove.isPass)
      .map(pendingMove => pendingMove.move)
  }

  private notifyPendingActionChange() {
    const moves = this.getPendingMoves()
    this.ctx.onPendingActionChange?.(moves.length > 0 ? { moves } : null)
  }

  private createPendingMoves(moves: Move[]): { pendingMoves: PendingMove[], multiverse: Multiverse } {
    let multiverse = this.multiverseCommitted
    const pendingMoves = moves.map((move, index): PendingMove => {
      const order = this.getMoveOrder(index)
      const pendingMove: PendingMove = {
        move,
        order,
        multiverseBefore: multiverse,
        is5D: ! Coord.isSameBoard(move.from, move.to),
        from: {
          l: move.from.l,
          m: Coord.boardIndex(move.from, this.player),
        },
        created: Multiverse.getMoveArrivalBoardIndex(move, this.player, multiverse),
      }
      multiverse = Multiverse.applyMove(move, this.player, multiverse, order)
      return pendingMove
    })

    return { pendingMoves, multiverse }
  }

  private fillMissingMoveOrders(multiverse: Multiverse, baseOrder: number) {
    let fallbackIndex = 0
    for (const [, line] of Multiverse.getLineEntries(multiverse)) {
      if (! line) continue

      for (const [, board] of Line.getBoardEntries(line)) {
        if (! board?.createdBy) continue
        board.createdByOrder ??= baseOrder + fallbackIndex
        fallbackIndex += 1
      }
    }
  }

  private isMoveAnimating(): boolean {
    return this.getMoveAnimationProgress() < 1
  }

  private getMoveAnimationProgress(): number {
    if (! this.moveAnimation) return 1
    return Scalar.clamp(
      this.getMoveAnimationElapsed() / this.getMoveAnimationDuration(),
      0,
      1,
    )
  }

  private getMoveAnimationElapsed(): number {
    if (! this.moveAnimation) return Infinity
    return performance.now() - this.moveAnimation.startedAt
  }

  private getBoardActivationAnimationProgress(animation: BoardActivationAnimation): number {
    return Scalar.clamp(
      (performance.now() - animation.startedAt) / Animations.MoveAnimationDuration,
      0,
      1,
    )
  }

  private getBoardActivationProgress(l: number, m: number, isActive: boolean): number | null {
    const animation = this.boardActivationAnimation
    if (! animation || ! isActive) return null
    if (! animation.boardKeys.has(this.getBoardKey(l, m))) return null
    return Easing.easeInOut(this.getBoardActivationAnimationProgress(animation))
  }

  private getMoveAnimationDuration(): number {
    if (! this.pendingMove?.is5D) return Animations.MoveAnimationDuration
    return Animations.MoveAnimationDuration
      + (this.showMoveTravelAnimation ? this.getMoveTravelDuration(this.pendingMove) : 0)
      + Animations.MoveAnimationDuration
  }

  private getMoveAnimationEase(): number {
    return Easing.easeInOut(this.getMoveBoardAnimationProgress())
  }

  private getMoveBoardAnimationProgress(): number {
    const elapsed = this.getMoveAnimationElapsed()
    if (! this.pendingMove?.is5D) {
      return Scalar.clamp(elapsed / Animations.MoveAnimationDuration, 0, 1)
    }
    const travelDuration = this.getMoveTravelDuration(this.pendingMove)
    return Scalar.clamp(
      (elapsed - Animations.MoveAnimationDuration - travelDuration)
        / Animations.MoveAnimationDuration,
      0,
      1,
    )
  }

  private getMoveSourceBoardAnimationProgress(): number {
    return Scalar.clamp(this.getMoveAnimationElapsed() / Animations.MoveAnimationDuration, 0, 1)
  }

  private getMoveTravelViewportProgress(): number {
    return Scalar.clamp(
      this.getMoveAnimationElapsed() / Animations.MoveTravelViewportDuration,
      0,
      1,
    )
  }

  private getMoveTravelAnimationProgress(): number {
    if (! this.showMoveTravelAnimation) return 1
    return Scalar.clamp(
      (this.getMoveAnimationElapsed() - Animations.MoveAnimationDuration)
        / this.getMoveTravelDuration(this.pendingMove),
      0,
      1,
    )
  }

  private getMoveTravelDuration(pendingMove: PendingMove | null): number {
    if (! this.showMoveTravelAnimation) return 0
    if (! pendingMove?.is5D) return Animations.MoveTravelDuration

    const geometry = this.getMoveArrowGeometry(pendingMove.move, this.player)
    if (! geometry) return Animations.MoveTravelDuration

    const length = CubicBezier.length(
      geometry.from,
      geometry.control1,
      geometry.control2,
      geometry.to,
      Sizes.MoveArrowCurveSamples,
    )
    return Math.max(1, length / Animations.MoveTravelSpeed)
  }

  private updateMoveTravelSound() {
    const animation = this.moveAnimation
    const pendingMove = this.pendingMove
    if (! this.showMoveTravelAnimation) {
      if (animation) this.stopMoveTravelLoop(animation)
      return
    }
    if (! animation || ! pendingMove?.is5D) return

    const sourceProgress = this.getMoveSourceBoardAnimationProgress()
    const travelProgress = this.getMoveTravelAnimationProgress()
    const inTravel = sourceProgress >= 1 && travelProgress < 1

    if (inTravel && ! animation.travelLoop) {
      animation.travelLoop = this.soundManager.playLoop('timpani_roll_f3.ogg', { volume: this.getBellSoundVolume() })
    }

    if (travelProgress < 1) return

    this.stopMoveTravelLoop(animation)
    if (! animation.travelHitPlayed && sourceProgress >= 1) {
      this.soundManager.play('timpani_hit_f3.ogg', { volume: this.getBellSoundVolume() })
      animation.travelHitPlayed = true
    }
  }

  private clearMoveAnimation() {
    if (this.moveAnimation) this.stopMoveTravelLoop(this.moveAnimation)
    this.moveAnimation = null
  }

  private stopMoveTravelLoop(animation: MoveAnimation) {
    animation.travelLoop?.stop()
    animation.travelLoop = null
  }

  private hasSubmittedPresentMoves(): boolean {
    return CoreGameState.hasSubmittedPresentMoves(this.multiverse, this.player)
  }

  private getPieceSelectionAtScreen(screen: Vec2): PieceSelection | null {
    const hit = this.getActiveBoardSquareAtScreen(screen)
    if (! hit) return null
    return this.getPieceSelectionFromHit(hit, this.getBoardPlayer(hit.m))
  }

  private getInspectablePieceSelectionAtScreen(screen: Vec2): PieceSelection | null {
    return this.getPieceSelectionAtScreen(screen)
  }

  private getPieceSelectionFromHit(hit: BoardSquareHit, player: Player): PieceSelection | null {
    const piece = Board.getPiece(hit.coord, hit.board)
    if (Pieces.getPlayer(piece) !== player) return null

    const from: Coord = {
      ...hit.coord,
      l: hit.l,
      t: Coord.turn(hit.m, player),
    }

    return {
      l: hit.l,
      m: hit.m,
      player,
      from,
      targets: Multiverse.getMoveTargets(this.multiverse, from, player),
      piece,
    }
  }

  private getBoardPlayer(m: number): Player {
    return m % 2 === Player.W ? Player.W : Player.B
  }

  private getBoardAt(l: number, m: number): Board | null {
    return Multiverse.getLine(this.multiverse, l)?.boards[m] ?? null
  }

  private getActiveBoardSquareAtScreen(screen: Vec2): BoardSquareHit | null {
    const hit = this.getBoardSquareAtScreen(screen)
    if (! hit) return null
    const player = this.getBoardPlayer(hit.m)
    if (! Multiverse.isPlayableBoard(this.multiverse, player, {
      l: hit.l,
      t: Coord.turn(hit.m, player),
    })) return null
    return hit
  }

  private getBoardSquareAtScreen(screen: Vec2): BoardSquareHit | null {
    const world = this.renderer.screenToWorld(screen)

    for (const [l, line] of Multiverse.getLineEntries(this.multiverse)) {
      if (! line) continue

      for (const [m, board] of Line.getBoardEntries(line)) {
        if (! board) continue

        const [[borderX, borderY]] = this.layout.getBoardRect(l, m)
        const metrics = this.getBoardRenderMetrics(Board.getSize(board))
        const x0 = borderX + Sizes.BoardBorder + metrics.contentOffset[0]
        const y0 = borderY + Sizes.BoardBorder + metrics.contentOffset[1]
        const displayCoord = {
          x: Math.floor((world[0] - x0) / metrics.squareSize),
          y: Math.floor((world[1] - y0) / metrics.squareSize),
        }
        if (! Board.isInBoard(displayCoord, board)) continue

        const coord = this.toBoardCoord(displayCoord, metrics.boardSize)

        return { l, m, board, coord }
      }
    }

    return null
  }

  private getCheckWarningBadgeAtScreen(screen: Vec2): { l: number, m: number } | null {
    const world = this.renderer.screenToWorld(screen)
    for (const warning of this.checkWarningBoards) {
      const center = this.getCheckBadgeCenter(warning.l, warning.m)
      if (Vec2.length(Vec2.sub(world, center)) <= Sizes.CheckBadgeRadius) return warning
    }
    return null
  }

  private updateCameraMotion() {
    if (! this.cameraMotion) return

    const viewport = this.getCameraMotionViewport(this.cameraMotion, this.cameraMotion.targetScale)
    if (viewport) {
      const targetCenter = this.getCameraMotionTargetCenterAtScale(this.cameraMotion, this.cameraMotion.targetScale)
      const clampedTargetCenter = this.layout.clampCameraCenterToViewport(
        targetCenter,
        viewport,
        this.cameraMotion.targetScale,
      )
      this.cameraMotion.targetCenter = clampedTargetCenter
      if (this.cameraMotion.viewportWorldCenter) {
        this.cameraMotion.viewportWorldCenter = this.layout.getViewportWorldCenter(
          clampedTargetCenter,
          this.cameraMotion.targetScale,
        )
      }
    }

    const camera = this.renderer.getCamera()
    const scaleDelta = this.cameraMotion.targetScale - camera.scale
    const scaleNext = Math.abs(scaleDelta) <= CameraControl.ZoomSnapEpsilon
      ? this.cameraMotion.targetScale
      : camera.scale + scaleDelta * CameraControl.ZoomSmoothing
    const targetCenterAtScale = this.getCameraMotionTargetCenterAtScale(this.cameraMotion, scaleNext)

    this.setCameraScaleAt(this.cameraMotion.anchorScreen, scaleNext)

    const cameraAfterScale = this.renderer.getCamera()
    const centerDelta = Vec2.sub(targetCenterAtScale, cameraAfterScale.center)
    const centerNext = Vec2.length(centerDelta) <= CameraControl.BounceBackSnapEpsilon
      ? targetCenterAtScale
      : Vec2.add(cameraAfterScale.center, Vec2.scale(centerDelta, CameraControl.BounceBackSmoothing))
    this.renderer.setCamera({ center: centerNext })

    this.smoothCameraToViewport(
      this.getCameraMotionViewport(this.cameraMotion, scaleNext),
      CameraControl.BounceBackSmoothing,
    )

    const cameraAfterBounds = this.renderer.getCamera()
    const targetCenterAfterBounds = this.getCameraMotionTargetCenterAtScale(this.cameraMotion, scaleNext)

    if (
      scaleNext === this.cameraMotion.targetScale
      && Vec2.length(Vec2.sub(cameraAfterBounds.center, targetCenterAfterBounds)) <= CameraControl.BounceBackSnapEpsilon
    ) {
      this.renderer.setCamera({ center: targetCenterAfterBounds })
      this.cameraMotion = null
    }
  }

  private getCameraMotionTargetCenterAtScale(motion: CameraMotion, scale: number): Vec2 {
    return motion.viewportWorldCenter
      ? this.layout.getCameraCenterForViewportWorldCenter(motion.viewportWorldCenter, scale)
      : motion.targetCenter
  }

  private setCameraScaleAt(anchorScreen: Vec2, scale: number) {
    const worldBefore = this.renderer.screenToWorld(anchorScreen)
    this.renderer.setCamera({ scale })
    const worldAfter = this.renderer.screenToWorld(anchorScreen)
    const camera = this.renderer.getCamera()
    this.renderer.setCamera({
      center: Vec2.add(camera.center, Vec2.sub(worldBefore, worldAfter)),
    })
  }

  private syncCameraMotion() {
    if (! this.cameraMotion) return
    this.cameraMotion.targetCenter = this.renderer.getCamera().center
    this.cameraMotion.targetScale = this.renderer.getCamera().scale
    this.cameraMotion.viewportWorldCenter = undefined
  }

  private getViewportCenterScreen(): Vec2 {
    return this.layout.getViewportCenterScreen()
  }

  private getCameraMotionViewport(motion: CameraMotion, scale = motion.targetScale): Rect | null {
    return motion.viewport === undefined
      ? this.layout.getValidViewportRect(this.multiverse, [], scale)
      : motion.viewport
  }

  private updateCameraBounds() {
    if (this.cameraMotion) return
    if (this.pointer.dragLastScreen) return

    const validViewport = this.layout.getValidViewportRect(this.multiverse)
    if (! validViewport) return

    const camera = this.renderer.getCamera()
    const targetCenter = this.layout.clampCameraCenterToViewport(camera.center, validViewport)
    const delta = Vec2.sub(targetCenter, camera.center)

    if (Vec2.length(delta) <= CameraControl.BounceBackSnapEpsilon) {
      this.renderer.setCamera({ center: targetCenter })
      return
    }

    this.renderer.setCamera({
      center: Vec2.add(camera.center, Vec2.scale(delta, CameraControl.BounceBackSmoothing)),
    })
  }

  private smoothCameraToViewport(viewport: Rect | null, smoothing: number) {
    if (! viewport) return

    const camera = this.renderer.getCamera()
    const targetCenter = this.layout.clampCameraCenterToViewport(camera.center, viewport)
    const delta = Vec2.sub(targetCenter, camera.center)
    if (Vec2.length(delta) <= CameraControl.BounceBackSnapEpsilon) {
      this.renderer.setCamera({ center: targetCenter })
      return
    }

    this.renderer.setCamera({
      center: Vec2.add(camera.center, Vec2.scale(delta, smoothing)),
    })
  }

  private clampCameraCenterToValidViewportIfAvailable(center: Vec2): Vec2 {
    const validViewport = this.layout.getValidViewportRect(this.multiverse)
    if (! validViewport) return center
    return this.layout.clampCameraCenterToViewport(center, validViewport)
  }

  private getMoveAnimationViewportRect(pendingMove: PendingMove): Rect | null {
    return this.layout.getValidViewportRect(
      pendingMove.multiverseBefore,
      [
        this.layout.getBoardRect(pendingMove.from.l, pendingMove.from.m + 1),
        this.layout.getBoardRect(pendingMove.created.l, pendingMove.created.m),
      ],
    )
  }

  private renderMultiverse() {
    this.syncLayoutMultiverse()
    this.timelineTilesPainter.render(this.multiverse, {
      endedProgress: this.getGameEndBackgroundProgress(),
      endedStatus: this.gameEndBackgroundStatus,
    })
    if (this.pendingMove && this.isMoveAnimating()) {
      if (this.pendingMove.is5D && this.getMoveBoardAnimationProgress() === 0) {
        this.renderMultiverseTravelAnimation(this.pendingMove)
        return
      }
      this.renderMultiversePendingAnimation(this.pendingMove, this.getMoveAnimationEase())
      return
    }

    this.presentPainter.render({
      multiverse: this.multiverse,
      multiverseCommitted: this.multiverseCommitted,
      player: this.player,
    })
    this.renderMultiverseStatic(this.multiverse)
    this.renderPendingCheckArrows()
    this.renderRecordArrowMarkers()
  }

  private getGameEndBackgroundProgress(): number {
    const now = performance.now()
    const targetStatus = this.getGameEndBackgroundTargetStatus()
    const target = targetStatus !== null
    const targetProgress = target ? 1 : 0
    const currentProgress = this.resolveGameEndBackgroundProgress(now)

    if (targetStatus) this.gameEndBackgroundStatus = targetStatus

    if (target !== this.gameEndBackgroundTarget) {
      this.gameEndBackgroundTarget = target
      this.gameEndBackgroundAnimation = {
        from: currentProgress,
        to: targetProgress,
        startedAt: now,
      }
      return currentProgress
    }

    return currentProgress
  }

  private getGameEndBackgroundTargetStatus(): Exclude<CheckmateStatus, 'not-checkmate'> | null {
    if (this.gameEndStatus) return this.gameEndStatus
    if (this.gameEndTrial) return this.gameEndTrialStatus ?? 'checkmate'
    return null
  }

  private resolveGameEndBackgroundProgress(now: number): number {
    if (! this.gameEndBackgroundAnimation) return this.gameEndBackgroundTarget ? 1 : 0

    const progress = Scalar.clamp(
      (now - this.gameEndBackgroundAnimation.startedAt) / Animations.GameEndBackgroundDuration,
      0,
      1,
    )
    const eased = Easing.easeInOut(progress)
    const value = Scalar.lerp(
      this.gameEndBackgroundAnimation.from,
      this.gameEndBackgroundAnimation.to,
      eased,
    )

    if (progress >= 1) {
      this.gameEndBackgroundAnimation = null
      return this.gameEndBackgroundTarget ? 1 : 0
    }

    return value
  }

  private renderMultiverseStatic(multiverse: Multiverse) {
    for (const [l, line] of Multiverse.getLineEntries(multiverse)) {
      if (! line) continue
      this.linePainter.render(line, l, 1, multiverse)

      for (const [m, board] of Line.getBoardEntries(line)) {
        if (! board) continue
        this.renderBoard(board, l, m, this.isTerminalBoard(line, m), this.isTemporaryBoard(l, m), {
          temporaryPreset: this.getTemporaryBoardPreset(l, m),
        })
      }
    }
  }

  private renderMultiverseTravelAnimation(pendingMove: PendingMove) {
    const viewportProgress = this.getMoveTravelViewportProgress()
    const sourceProgress = this.getMoveSourceBoardAnimationProgress()
    const sourceEase = Easing.easeInOut(sourceProgress)
    const travelProgress = this.getMoveTravelAnimationProgress()
    const pieceProgress = this.getMoveTravelPathProgress(pendingMove, travelProgress)

    this.followTravelAnimationViewport(pendingMove, Easing.easeInOut(viewportProgress))
    this.presentPainter.render({
      multiverse: pendingMove.multiverseBefore,
      multiverseCommitted: this.multiverseCommitted,
      player: this.player,
    })
    this.renderMultiverseSourceAnimation(pendingMove, sourceEase)
    this.renderMoveArrow(pendingMove.move, this.player, 1, pendingMove.order)
    if (sourceProgress >= 1) {
      this.renderTravelPiece(pendingMove, pieceProgress, 1)
    }
    this.renderPendingCheckArrows(this.getMoveAnimationBoardPositions(pendingMove, sourceEase, 0))
  }

  private renderMultiversePendingAnimation(pendingMove: PendingMove, progress: number) {
    if (pendingMove.is5D) {
      this.renderMultiverseTargetAnimation(pendingMove, progress)
      return
    }

    this.followPendingBoardAnimation(pendingMove, progress)
    this.presentPainter.renderAnimated({
      multiverse: this.multiverse,
      multiverseCommitted: this.multiverseCommitted,
      player: this.player,
      pendingMove,
      progress,
    })
    let renderedCreatedBoard = false
    const targetBoardIndex = Coord.boardIndex(pendingMove.move.to, this.player)

    for (const [l, lineCommitted] of Multiverse.getLineEntries(pendingMove.multiverseBefore)) {
      if (! lineCommitted) continue

      const linePreview = Multiverse.getLine(this.multiverse, l)
      const isPendingLine = l === pendingMove.from.l
      const isTargetLine = l === pendingMove.move.to.l

      if (isPendingLine && Line.getLatestBoardIndex(lineCommitted) !== null) {
        this.linePainter.renderDuringMoveAnimation(lineCommitted, l, progress, pendingMove.multiverseBefore)
      }
      else {
        this.linePainter.render(linePreview ?? lineCommitted, l, 1, linePreview ? this.multiverse : pendingMove.multiverseBefore)
      }

      for (const [m, board] of Line.getBoardEntries(lineCommitted)) {
        if (! board) continue
        if (isPendingLine && m === pendingMove.from.m) {
          this.renderBoard(board, l, m, true, false, {
            activeProgress: this.isTerminalBoard(lineCommitted, m) ? 1 - progress : 0,
          })
          continue
        }
        if (isTargetLine && m === targetBoardIndex) {
          this.renderBoard(board, l, m, true, false, {
            activeProgress: this.isTerminalBoard(lineCommitted, m) ? 1 - progress : 0,
          })
          continue
        }
        this.renderBoard(board, l, m, this.isTerminalBoard(lineCommitted, m), false)
      }

      if (l === pendingMove.created.l) {
        renderedCreatedBoard = this.renderPendingCreatedBoard(pendingMove, progress) || renderedCreatedBoard
      }
    }

    if (! renderedCreatedBoard) {
      const createdLine = Multiverse.getLine(this.multiverse, pendingMove.created.l)
      if (createdLine) this.linePainter.render(createdLine, pendingMove.created.l, progress, this.multiverse)
      this.renderPendingCreatedBoard(pendingMove, progress)
    }
    this.renderPendingCheckArrows(this.getMoveAnimationBoardPositions(pendingMove, progress, progress))
  }

  private renderMultiverseSourceAnimation(pendingMove: PendingMove, progress: number) {
    for (const [l, lineCommitted] of Multiverse.getLineEntries(pendingMove.multiverseBefore)) {
      if (! lineCommitted) continue

      const isSourceLine = l === pendingMove.from.l

      if (isSourceLine && Line.getLatestBoardIndex(lineCommitted) !== null) {
        this.linePainter.renderDuringMoveAnimation(lineCommitted, l, progress, pendingMove.multiverseBefore)
      }
      else {
        this.linePainter.render(lineCommitted, l, 1, pendingMove.multiverseBefore)
      }

      for (const [m, board] of Line.getBoardEntries(lineCommitted)) {
        if (! board) continue
        if (isSourceLine && m === pendingMove.from.m) {
          this.renderBoard(board, l, m, true, false, {
            activeProgress: this.isTerminalBoard(lineCommitted, m) ? 1 - progress : 0,
          })
          continue
        }
        this.renderBoard(board, l, m, this.isTerminalBoard(lineCommitted, m), false)
      }

      if (isSourceLine) this.renderSourceCreatedBoard(pendingMove, progress)
    }
  }

  private renderMultiverseTargetAnimation(pendingMove: PendingMove, progress: number) {
    this.presentPainter.renderAnimated({
      multiverse: this.multiverse,
      multiverseCommitted: this.multiverseCommitted,
      player: this.player,
      pendingMove,
      progress,
    })
    let renderedCreatedBoard = false
    const targetBoardIndex = Coord.boardIndex(pendingMove.move.to, this.player)

    for (const [l, lineCommitted] of Multiverse.getLineEntries(pendingMove.multiverseBefore)) {
      if (! lineCommitted) continue

      const linePreview = Multiverse.getLine(this.multiverse, l)
      const isSourceLine = l === pendingMove.from.l
      const isTargetLine = l === pendingMove.move.to.l
      const activeCommitted = Line.getLatestBoardIndex(lineCommitted)

      if (isSourceLine && activeCommitted !== null) {
        this.linePainter.renderDuringMoveAnimation(lineCommitted, l, 1, pendingMove.multiverseBefore)
      }
      else if (isTargetLine && activeCommitted !== null) {
        this.linePainter.renderDuringMoveAnimation(lineCommitted, l, progress, pendingMove.multiverseBefore)
      }
      else {
        this.linePainter.render(linePreview ?? lineCommitted, l, 1, linePreview ? this.multiverse : pendingMove.multiverseBefore)
      }

      for (const [m, board] of Line.getBoardEntries(lineCommitted)) {
        if (! board) continue
        if (isSourceLine && m === pendingMove.from.m) {
          this.renderBoard(board, l, m, true, false, {
            activeProgress: 0,
          })
          continue
        }
        if (isTargetLine && m === targetBoardIndex) {
          this.renderBoard(board, l, m, true, false, {
            activeProgress: this.isTerminalBoard(lineCommitted, m) ? 1 - progress : 0,
          })
          continue
        }
        this.renderBoard(board, l, m, this.isTerminalBoard(lineCommitted, m), false)
      }

      if (isSourceLine) this.renderSourceCreatedBoard(pendingMove, 1)
      if (l === pendingMove.created.l) {
        renderedCreatedBoard = this.renderPendingCreatedBoard(pendingMove, progress) || renderedCreatedBoard
      }
    }

    if (! renderedCreatedBoard) {
      const createdLine = Multiverse.getLine(this.multiverse, pendingMove.created.l)
      if (createdLine) this.linePainter.render(createdLine, pendingMove.created.l, progress, this.multiverse)
      this.renderPendingCreatedBoard(pendingMove, progress)
    }
    this.renderPendingCheckArrows(this.getMoveAnimationBoardPositions(pendingMove, 1, progress))
  }

  private getMoveAnimationBoardPositions(
    pendingMove: PendingMove,
    sourceProgress: number,
    targetProgress: number,
  ): ReadonlyMap<string, Vec2> {
    const positions = new Map<string, Vec2>()
    const [fromPos] = this.layout.getBoardRect(pendingMove.from.l, pendingMove.from.m)
    const [targetPos] = this.layout.getBoardRect(pendingMove.created.l, pendingMove.created.m)

    if (! pendingMove.is5D) {
      positions.set(
        this.getBoardKey(pendingMove.created.l, pendingMove.created.m),
        Vec2.mix(fromPos, targetPos, targetProgress),
      )
      return positions
    }

    const sourceCreatedM = this.getSourceCreatedBoardIndex(pendingMove)
    const [sourceCreatedPos] = this.layout.getBoardRect(pendingMove.from.l, sourceCreatedM)
    const [targetStartPos] = this.layout.getBoardRect(pendingMove.created.l, pendingMove.created.m - 1)
    positions.set(
      this.getBoardKey(pendingMove.from.l, sourceCreatedM),
      Vec2.mix(fromPos, sourceCreatedPos, sourceProgress),
    )
    positions.set(
      this.getBoardKey(pendingMove.created.l, pendingMove.created.m),
      Vec2.mix(targetStartPos, targetPos, targetProgress),
    )

    return positions
  }

  private renderSourceCreatedBoard(pendingMove: PendingMove, progress: number): boolean {
    const sourceCreatedM = this.getSourceCreatedBoardIndex(pendingMove)
    const linePreview = Multiverse.getLine(this.multiverse, pendingMove.from.l)
    const createdBoard = linePreview?.boards[sourceCreatedM]
    if (! createdBoard) return false

    const [fromPos] = this.layout.getBoardRect(pendingMove.from.l, pendingMove.from.m)
    const [toPos] = this.layout.getBoardRect(pendingMove.from.l, sourceCreatedM)
    this.renderBoard(createdBoard, pendingMove.from.l, sourceCreatedM, true, true, {
      activeProgress: 1,
      temporaryProgress: progress,
      temporaryPreset: ButtonColors.FiveD,
      pos: Vec2.mix(fromPos, toPos, progress),
      animatedLayer: true,
      basePlayer: pendingMove.from.m % 2,
    })
    return true
  }

  private renderPendingCreatedBoard(pendingMove: PendingMove, progress: number): boolean {
    const linePreview = Multiverse.getLine(this.multiverse, pendingMove.created.l)
    const createdBoard = linePreview?.boards[pendingMove.created.m]
    if (! createdBoard) return false

    const [fromPos] = this.layout.getBoardRect(pendingMove.from.l, pendingMove.from.m)
    const [toPos] = this.layout.getBoardRect(pendingMove.created.l, pendingMove.created.m)
    const [startPos] = pendingMove.is5D
      ? this.layout.getBoardRect(pendingMove.created.l, pendingMove.created.m - 1)
      : [fromPos]
    this.renderBoard(createdBoard, pendingMove.created.l, pendingMove.created.m, true, true, {
      activeProgress: 1,
      temporaryProgress: pendingMove.is5D ? 1 : progress,
      temporaryPreset: pendingMove.is5D ? ButtonColors.FiveD : ButtonColors.Yellow,
      alpha: pendingMove.is5D ? progress : 1,
      pos: Vec2.mix(startPos, toPos, progress),
      animatedLayer: true,
      basePlayer: pendingMove.from.m % 2,
    })
    return true
  }

  private getSourceCreatedBoardIndex(pendingMove: PendingMove): number {
    return pendingMove.from.m + 1
  }

  private getPendingMoveSourceCreatedBoard(pendingMove: PendingMove): { l: number, m: number } {
    return pendingMove.is5D
      ? {
          l: pendingMove.from.l,
          m: this.getSourceCreatedBoardIndex(pendingMove),
        }
      : pendingMove.created
  }

  private followPendingBoardAnimation(pendingMove: PendingMove, progress: number) {
    if (! this.moveAnimation) return
    if (this.moveAnimation.viewportFollowDisabled) return
    if (pendingMove.isPass) return

    const [fromPos, fromSize] = this.layout.getBoardRect(pendingMove.from.l, pendingMove.from.m)
    const [toPos] = this.layout.getBoardRect(pendingMove.created.l, pendingMove.created.m)
    const [startPos] = pendingMove.is5D
      ? this.layout.getBoardRect(pendingMove.created.l, pendingMove.created.m - 1)
      : [fromPos]
    const followCenter = Vec2.add(Vec2.mix(startPos, toPos, progress), Vec2.scale(fromSize, 0.5))
    const startViewportCenter = this.layout.getViewportWorldCenter(
      this.moveAnimation.cameraCenter,
      this.moveAnimation.cameraScale,
    )
    const viewportCenter = Vec2.mix(startViewportCenter, followCenter, progress)
    const center = this.layout.getCameraCenterForViewportWorldCenter(
      viewportCenter,
      this.moveAnimation.cameraScale,
    )
    this.setViewportImmediate({
      center,
    }, {
      viewport: this.getMoveAnimationViewportRect(pendingMove),
    })
  }

  private followTravelAnimationViewport(pendingMove: PendingMove, progress: number) {
    if (! this.moveAnimation) return
    if (this.moveAnimation.viewportFollowDisabled) return
    if (! this.showMoveTravelAnimation) return

    const sourceOldRect = this.layout.getBoardRect(pendingMove.from.l, pendingMove.from.m)
    const targetOldRect = this.layout.getBoardRect(
      pendingMove.move.to.l,
      Coord.boardIndex(pendingMove.move.to, this.player),
    )
    const sourceNewRect = this.layout.getBoardRect(pendingMove.from.l, pendingMove.from.m + 1)
    const targetNewRect = this.layout.getBoardRect(pendingMove.created.l, pendingMove.created.m)
    const sourceOldCenter = Rect.center(sourceOldRect)
    const targetOldCenter = Rect.center(targetOldRect)
    const sourceNewCenter = Rect.center(sourceNewRect)
    const targetNewCenter = Rect.center(targetNewRect)
    const { widthCss, heightCss } = this.renderer.getScreen()
    const targetScale = getMoveTravelTargetScale(this.moveAnimation.cameraScale, [
      sourceOldRect,
      targetOldRect,
    ], [widthCss, heightCss], Sizes.BoardWidth / 2)
    const scale = Scalar.lerp(this.moveAnimation.cameraScale, targetScale, progress)
    const center: Vec2 = [
      Scalar.lerp(
        this.moveAnimation.cameraCenter[0],
        (sourceOldCenter[0] + targetOldCenter[0]) / 2,
        progress,
      ),
      Scalar.lerp(
        this.moveAnimation.cameraCenter[1],
        (sourceNewCenter[1] + targetNewCenter[1]) / 2,
        progress,
      ),
    ]

    this.setViewportImmediate({
      scale,
      center,
    }, {
      viewport: this.getMoveAnimationViewportRect(pendingMove),
    })
  }

  private getMoveTravelPathProgress(pendingMove: PendingMove, progress: number): number {
    const geometry = this.getMoveArrowGeometry(pendingMove.move, this.player)
    if (! geometry) return progress
    return CubicBezier.tAtDistanceProgress(
      geometry.from,
      geometry.control1,
      geometry.control2,
      geometry.to,
      progress,
      Sizes.MoveArrowCurveSamples,
    )
  }

  private renderTravelPiece(pendingMove: PendingMove, progress: number, alpha: number) {
    if (alpha <= 0) return
    if (! this.showMoveTravelAnimation) return

    const sourceBoard = Multiverse.getBoard(
      pendingMove.multiverseBefore,
      pendingMove.move.from,
      this.player,
    )
    if (! sourceBoard) return

    const squareSize = this.getBoardRenderMetrics(Board.getSize(sourceBoard)).squareSize
    const piece = Board.getPiece(pendingMove.move.from, sourceBoard)
    if (piece === Piece.E) return

    const geometry = this.getMoveArrowGeometry(pendingMove.move, this.player)
    if (! geometry) return

    const center = CubicBezier.point(
      geometry.from,
      geometry.control1,
      geometry.control2,
      geometry.to,
      progress,
    )
    this.renderPiece(
      piece,
      Vec2.sub(center, Vec2.splat(squareSize / 2)),
      RenderLayer.AnimatedPiece,
      alpha,
      Vec2.splat(squareSize),
    )
  }

  private isTemporaryBoard(l: number, m: number): boolean {
    return this.pendingMoves.some(pendingMove => this.isTemporaryBoardOfPendingMove(pendingMove, l, m))
  }

  private getTemporaryBoardPreset(l: number, m: number): ButtonColorPreset | undefined {
    const pendingMove = this.pendingMoves.find(pendingMove => (
      this.isTemporaryBoardOfPendingMove(pendingMove, l, m)
    ))
    if (! pendingMove) return undefined
    return pendingMove.is5D ? ButtonColors.FiveD : ButtonColors.Yellow
  }

  private isTemporaryBoardOfPendingMove(pendingMove: PendingMove, l: number, m: number): boolean {
    if (pendingMove.created.l === l && pendingMove.created.m === m) return true
    return pendingMove.is5D
      && pendingMove.from.l === l
      && this.getSourceCreatedBoardIndex(pendingMove) === m
  }

  private getBoardFocusPulseProgress(l: number, m: number): number {
    if (! this.boardFocusPulse) return 0
    if (this.boardFocusPulse.l !== l || this.boardFocusPulse.m !== m) return 0

    const now = performance.now()
    const elapsed = now - this.boardFocusPulse.startedAt
    const attackDuration = Animations.BoardFocusPulseDuration / 2
    const boundMotion = (
      this.boardFocusPulse.motionId !== null
      && this.cameraMotion?.id === this.boardFocusPulse.motionId
    )
      ? this.cameraMotion
      : null
    const shouldHoldForMotion = (
      boundMotion !== null
      && ! this.isCameraMotionVisuallySettled(boundMotion)
    )

    if (elapsed < attackDuration) {
      return Easing.easeInOut(elapsed / attackDuration)
    }
    if (shouldHoldForMotion) {
      this.boardFocusPulse.heldForMotion = true
      return 1
    }
    if (this.boardFocusPulse.heldForMotion) {
      this.boardFocusPulse.releaseStartedAt ??= now
      const releaseProgress = (now - this.boardFocusPulse.releaseStartedAt)
        / Animations.BoardFocusPulseReleaseDuration
      if (releaseProgress >= 1) {
        this.boardFocusPulse = null
        return 0
      }
      return 1 - Easing.easeInOut(releaseProgress)
    }

    const releaseProgress = (elapsed - attackDuration)
      / (Animations.BoardFocusPulseDuration - attackDuration)
    if (releaseProgress >= 1) {
      this.boardFocusPulse = null
      return 0
    }
    return 1 - Easing.easeInOut(releaseProgress)
  }

  private isCameraMotionVisuallySettled(motion: CameraMotion): boolean {
    const camera = this.renderer.getCamera()
    return Vec2.length(Vec2.sub(camera.center, motion.targetCenter)) <= Animations.BoardFocusPulseSettleDistance
      && Math.abs(camera.scale - motion.targetScale) <= Animations.BoardFocusPulseSettleScale
  }

  private renderBoard(
    board: Board,
    l: number,
    m: number,
    isActive: boolean,
    isTemporary: boolean,
    options: BoardRenderOptions = {},
  ) {
    const boardPlayer = options.basePlayer ?? m % 2
    const [[boardRectX, boardRectY]] = this.layout.getBoardRect(l, m)
    const [borderX, borderY] = options.pos ?? [boardRectX, boardRectY]
    const metrics = this.getBoardRenderMetrics(Board.getSize(board))
    const x0 = borderX + Sizes.BoardBorder + metrics.contentOffset[0]
    const y0 = borderY + Sizes.BoardBorder + metrics.contentOffset[1]
    const baseBorderColor = boardPlayer === Player.B ? Colors.BoardBorderBlack : Colors.BoardBorderWhite
    const baseActiveBorderFill = boardPlayer === Player.B ? Colors.BoardBorderBlackDim : Colors.BoardBorderWhiteDim
    const temporaryProgress = options.temporaryProgress ?? (isTemporary ? 1 : 0)
    const temporaryPreset = options.temporaryPreset ?? ButtonColors.Yellow
    const alpha = options.alpha ?? 1
    const pendingCheckPreset = this.isPendingCheckBoard(l, m) ? ButtonColors.Red : null
    const borderColorBase = pendingCheckPreset?.border
      ?? Color4.mix(baseBorderColor, temporaryPreset.border, temporaryProgress)
    const activeBorderFillBase = pendingCheckPreset?.fill
      ?? Color4.mix(baseActiveBorderFill, temporaryPreset.fill, temporaryProgress)
    const borderColor = Color4.withAlpha(borderColorBase, alpha)
    const activeBorderFill = Color4.withAlpha(activeBorderFillBase, alpha)
    const explicitActiveProgress = options.activeProgress
    const boardActivationProgress = explicitActiveProgress === undefined
      ? this.getBoardActivationProgress(l, m, isActive)
      : null
    const activeProgress = pendingCheckPreset
      ? 1
      : (boardActivationProgress ?? explicitActiveProgress ?? (isActive ? 1 : 0))
    const activeBorder = Sizes.ActiveBoardBorder * activeProgress
    const outerBorder = Sizes.BoardBorder + activeBorder
    const outerBorderPos: Vec2 = [x0 - outerBorder, y0 - outerBorder]
    const outerBorderSize: Vec2 = [
      metrics.contentSize[0] + outerBorder * 2,
      metrics.contentSize[1] + outerBorder * 2,
    ]
    const innerBorderRadius = Scalar.lerp(Sizes.BoardBorderRadius, Sizes.ActiveBoardBorderRadius, activeProgress)
    const outerBorderRadius = innerBorderRadius + Sizes.BoardBorder * activeProgress
    const boardFrame: BoardFrame = {
      pos: outerBorderPos,
      size: outerBorderSize,
      radius: outerBorderRadius,
    }
    const squareMarkers = this.getVisibleSquareMarkersForBoard(l, m)

    const layers = getBoardRenderLayers(options.animatedLayer === true)

    this.renderBoardShadow(boardFrame, layers, alpha)

    this.renderer.submit({
      type: RenderItemType.RoundRect,
      layer: layers.border,
      pos: outerBorderPos,
      size: outerBorderSize,
      radius: outerBorderRadius,
      fill: borderColor,
      stroke: null,
    })

    if (activeProgress > 0) {
      this.renderer.submit({
        type: RenderItemType.RoundRect,
        layer: layers.border,
        pos: [
          x0 - activeBorder,
          y0 - activeBorder,
        ],
        size: [
          metrics.contentSize[0] + activeBorder * 2,
          metrics.contentSize[1] + activeBorder * 2,
        ],
        radius: innerBorderRadius,
        fill: Color4.withAlpha(activeBorderFill, activeProgress),
        stroke: null,
      })
    }

    for (const [x, y] of Board.spacelikes(board)) {
      const coord = { x, y }
      const pos = this.getSquarePos(x0, y0, coord, metrics)
      const isWhiteSquare = (x + y) % 2 === 0
      const moveHighlightColor = this.getMoveFormationHighlightColor(board, coord, isWhiteSquare)
      const baseColor = this.isHighlightedBoardSquare(l, m, coord)
        ? (isWhiteSquare ? Colors.BoardHighlightWhite : Colors.BoardHighlightBlack)
        : moveHighlightColor
          ? moveHighlightColor
        : (isWhiteSquare ? Colors.BoardWhite : Colors.BoardBlack)
      const color = Color4.withAlpha(baseColor, alpha)

      this.renderer.submit({
        type: RenderItemType.Quad,
        layer: layers.board,
        mat: Mat3.transform(pos, metrics.squareSizeVec),
        color,
      })
      this.renderSquareMarkers(
        squareMarkers.get(getSpacelikeKey(coord)) ?? [],
        pos,
        metrics,
        layers.board,
        layers.piece,
        alpha,
        isWhiteSquare,
      )

      const piece = Board.getPiece(coord, board)
      if (piece !== Piece.E) this.renderPiece(piece, pos, layers.piece, alpha, metrics.squareSizeVec)
      this.renderSquareGlyphBadge(this.getMoveFormationGlyphs(board, coord), pos, alpha, metrics.squareSize)
      if (this.shouldRenderPieceGhost(l, m, coord)) this.renderPieceGhost(this.selectedPiece!.piece, pos, metrics.squareSizeVec)
    }

    this.renderSpacelikeLabels(board, x0, y0, layers.board, alpha, metrics)
    this.renderBoardFocusMask(l, m, [x0, y0], alpha, metrics)
    this.renderMoveFormationArrow(board, alpha)
    this.renderCheckBadge(l, m, [x0, y0], alpha, metrics.contentSize)
  }

  private renderSpacelikeLabels(board: Board, x0: number, y0: number, layer: RenderLayer, alpha: number, metrics: BoardRenderMetrics) {
    const labelAlpha = this.getSpacelikeLabelAlpha() * alpha
    if (labelAlpha <= 0) return

    for (let displayX = 0; displayX < board.width; displayX ++) {
      const displayCoord = { x: displayX, y: board.height - 1 }
      const boardCoord = this.toBoardCoord(displayCoord, metrics.boardSize)
      const isWhiteSquare = (boardCoord.x + boardCoord.y) % 2 === 0
      this.renderer.submit({
        type: RenderItemType.Text,
        layer,
        order: 1,
        pos: [
          x0 + displayCoord.x * metrics.squareSize + Sizes.SpacelikeLabelInset * metrics.squareScale,
          y0 + (displayCoord.y + 1) * metrics.squareSize - Sizes.SpacelikeLabelInset * metrics.squareScale,
        ],
        angle: 0,
        text: this.getFileLabel(boardCoord.x),
        fontSize: Sizes.SpacelikeLabelFontSize * metrics.squareScale,
        color: Color4.withAlpha(
          isWhiteSquare ? Colors.BoardBlack : Colors.BoardWhite,
          labelAlpha,
        ),
        align: 'left',
        baseline: 'bottom',
      })
    }

    for (let displayY = 0; displayY < board.height; displayY ++) {
      const displayCoord = { x: board.width - 1, y: displayY }
      const boardCoord = this.toBoardCoord(displayCoord, metrics.boardSize)
      const isWhiteSquare = (boardCoord.x + boardCoord.y) % 2 === 0
      this.renderer.submit({
        type: RenderItemType.Text,
        layer,
        order: 1,
        pos: [
          x0 + (displayCoord.x + 1) * metrics.squareSize - Sizes.SpacelikeLabelInset * metrics.squareScale,
          y0 + displayCoord.y * metrics.squareSize + Sizes.SpacelikeLabelInset * metrics.squareScale,
        ],
        angle: 0,
        text: String(board.height - boardCoord.y),
        fontSize: Sizes.SpacelikeLabelFontSize * metrics.squareScale,
        color: Color4.withAlpha(
          isWhiteSquare ? Colors.BoardBlack : Colors.BoardWhite,
          labelAlpha,
        ),
        align: 'right',
        baseline: 'top',
      })
    }
  }

  private getSpacelikeLabelAlpha(): number {
    const scale = this.renderer.getCamera().scale
    const progress = Scalar.clamp(
      (scale - LabelVisibility.SpacelikeScaleStart)
      / (LabelVisibility.SpacelikeScaleEnd - LabelVisibility.SpacelikeScaleStart),
      0,
      1,
    )
    return Easing.easeInOut(progress)
  }

  private getSquarePos(x0: number, y0: number, coord: CoordSpacelike, metrics: BoardRenderMetrics): Vec2 {
    const displayCoord = this.toDisplayCoord(coord, metrics.boardSize)
    return [
      x0 + displayCoord.x * metrics.squareSize,
      y0 + displayCoord.y * metrics.squareSize,
    ]
  }

  private getVisibleSquareMarkersForBoard(
    l: number,
    m: number,
  ): Map<string, RecordSquareMarkerAnnotation[]> {
    const cursor = this.getCurrentRecordCursorTarget()
    const markers = this.recordDocument
      .getSquareMarkersAt(cursor.recordLineId, cursor.recordActionIndex)
      .filter(marker => (
        marker.target.coord.l === l
          && marker.target.m === m
      ))

    const bySquare = new Map<string, RecordSquareMarkerAnnotation[]>()
    for (const marker of markers) {
      const key = getSpacelikeKey(marker.target.coord)
      const squareMarkers = bySquare.get(key) ?? []
      squareMarkers.push(marker)
      bySquare.set(key, squareMarkers)
    }
    return bySquare
  }

  private getCurrentRecordCursorTarget(): RecordCursorTarget {
    return {
      recordLineId: this.recordDocument.activeRecordLineId,
      recordActionIndex: this.recordDocument.getActiveLineLocalActionIndex(this.actionIndex),
    }
  }

  private renderSquareMarkers(
    markers: RecordSquareMarkerAnnotation[],
    pos: Vec2,
    metrics: BoardRenderMetrics,
    boardLayer: RenderLayer,
    pieceLayer: RenderLayer,
    alpha: number,
    isWhiteSquare: boolean,
  ) {
    if (markers.length === 0) return

    const marker = markers[markers.length - 1]!
    if (this.squareMarkerDisplayMode === 'circle') {
      const color = this.getSquareMarkerBaseColor(marker)
      this.renderer.submit({
        type: RenderItemType.Circle,
        layer: pieceLayer,
        order: 1,
        center: Vec2.add(pos, Vec2.splat(metrics.squareSize / 2)),
        radius: Sizes.SquareMarkerCircleRadius * metrics.squareScale,
        fill: null,
        stroke: Color4.withAlpha(color, alpha),
        strokeWidth: Sizes.SquareMarkerCircleStrokeWidth * metrics.squareScale,
      })
      return
    }

    const color = this.getSquareMarkerHighlightColor(marker, isWhiteSquare)
    this.renderer.submit({
      type: RenderItemType.Quad,
      layer: boardLayer,
      order: 0.5,
      mat: Mat3.transform(pos, metrics.squareSizeVec),
      color: Color4.withAlpha(color, alpha),
    })
  }

  private getSquareMarkerHighlightColor(marker: RecordSquareMarkerAnnotation, isWhiteSquare: boolean): Color4 {
    const markerColor = this.getSquareMarkerBaseColor(marker)
    const baseColor = isWhiteSquare ? Colors.BoardWhite : Colors.BoardBlack
    return Color4.mix(baseColor, markerColor, 0.48)
  }

  private getSquareMarkerBaseColor(marker: RecordSquareMarkerAnnotation): Color4 {
    return parseRecordMarkerColor(this.getRecordMarkerColor(marker.authorId, marker.color))
  }

  private renderRecordArrowMarkers() {
    const cursor = this.getCurrentRecordCursorTarget()
    const markers = this.recordDocument.getArrowMarkersAt(cursor.recordLineId, cursor.recordActionIndex)
    markers.forEach((marker, index) => this.renderRecordArrowMarker(marker, index))
  }

  private renderRecordArrowMarker(marker: RecordArrowMarkerAnnotation, order: number) {
    const fromPlayer = marker.target.fromPlayer ?? Player.W
    const toPlayer = marker.target.toPlayer ?? Player.W
    const fromM = Coord.boardIndex(marker.target.from, fromPlayer)
    const toM = Coord.boardIndex(marker.target.to, toPlayer)
    if (! this.hasBoardAt({ l: marker.target.from.l, m: fromM })) return
    if (! this.hasBoardAt({ l: marker.target.to.l, m: toM })) return

    const from = this.getVisibleSquareCenter(marker.target.from.l, fromM, marker.target.from)
    const to = this.getVisibleSquareCenter(marker.target.to.l, toM, marker.target.to)
    const geometry = marker.target.from.l === marker.target.to.l && fromM === toM
      ? this.getStraightArrowGeometry(from, to)
      : this.getCurvedArrowGeometry(from, to, fromPlayer)
    if (! geometry) return

    const color = parseRecordMarkerColor(this.getRecordMarkerColor(marker.authorId, marker.color))
    this.renderRecordMarkerArrowPolygon(geometry, color, order)
  }

  private renderRecordMarkerArrowPolygon(geometry: MoveArrowGeometry, color: Color4, order: number) {
    const points = geometry.straight === true
      ? getStraightMoveArrowPolygon(geometry.from, geometry.to)
      : getMoveArrowPolygon(
        geometry.from,
        geometry.control1,
        geometry.control2,
        geometry.to,
      )
    if (points.length === 0) return

    this.renderer.submit({
      type: RenderItemType.Polygon,
      layer: RenderLayer.MoveHighlight,
      order: 8000 + order,
      points,
      fill: Color4.withAlpha(color, 0.7),
      stroke: null,
    })
  }

  private getMoveFormationGlyphs(
    board: Board,
    coord: CoordSpacelike,
  ): string[] {
    const target = this.getMoveFormationRecordTarget(board, coord)
    if (! target) return []
    return this.recordDocument.getMoveGlyphs(target.recordLineId, target.recordActionIndex, target.moveIndex)
  }

  private getMoveFormationRecordTarget(
    board: Board,
    coord: CoordSpacelike,
  ): (RecordCursorTarget & { moveIndex: number }) | null {
    const move = board.createdBy
    const order = board.createdByOrder
    if (! move || order == null || ! board.createdByRole) return null
    if (board.createdByRole !== 'target' && board.createdByRole !== 'both') return null
    if (! Coord.isSameSpace(move.to, coord)) return null

    const actionIndex = Math.floor(order / CoreGameState.MOVE_ORDER_STRIDE)
    const moveIndex = order % CoreGameState.MOVE_ORDER_STRIDE
    const line = this.recordDocument.getActiveLine()
    const target = this.recordDocument.getLineFullActionTarget(line.id, actionIndex)
    return target ? { ...target, moveIndex } : null
  }

  private renderSquareGlyphBadge(glyphs: string[], pos: Vec2, alpha: number, squareSize: number) {
    const normalizedGlyphs = glyphs
      .map(glyph => normalizeRecordGlyphText(glyph))
      .filter(Boolean)
    if (normalizedGlyphs.length === 0) return

    const scale = squareSize / Sizes.PieceWidth
    const radius = Sizes.SquareGlyphBadgeRadius * scale
    const overlap = Sizes.SquareGlyphBadgeOverlap * scale
    const gap = radius * 2 - overlap
    const center = this.getSquareGlyphBadgeCenter(pos, squareSize)
    normalizedGlyphs.forEach((glyph, index) => {
      const itemCenter: Vec2 = [
        center[0] - index * gap,
        center[1],
      ]
      const baseOrder = 200 + (normalizedGlyphs.length - index) * 3
      this.renderer.submit({
        type: RenderItemType.Circle,
        layer: RenderLayer.MoveHighlight,
        order: baseOrder - 1,
        center: Vec2.add(itemCenter, Sizes.AnnotationBadgeShadowOffset),
        radius,
        fill: Color4.withAlpha(Colors.Shadow, alpha),
        stroke: null,
      })
      this.renderer.submit({
        type: RenderItemType.Circle,
        layer: RenderLayer.MoveHighlight,
        order: baseOrder,
        center: itemCenter,
        radius,
        fill: Color4.withAlpha(this.ctx.getRecordGlyphColor?.(glyph) ?? getRecordGlyphColor4(glyph), alpha),
        stroke: null,
      })
      this.renderer.submit({
        type: RenderItemType.Text,
        layer: RenderLayer.MoveHighlight,
        order: baseOrder + 1,
        pos: [itemCenter[0], itemCenter[1] + 0.4],
        angle: 0,
        text: glyph.slice(0, 2),
        fontSize: Sizes.SquareGlyphBadgeFontSize * scale,
        color: Color4.withAlpha(Colors.ButtonTextInverted, alpha),
        align: 'center',
        baseline: 'middle',
      })
    })
  }

  private getSquareGlyphBadgeCenter(pos: Vec2, squareSize: number): Vec2 {
    const scale = squareSize / Sizes.PieceWidth
    return [
      pos[0] + squareSize + Sizes.SquareGlyphBadgeOffset * scale,
      pos[1] - Sizes.SquareGlyphBadgeOffset * scale,
    ]
  }

  private getFileLabel(file: number): string {
    return String.fromCharCode('a'.charCodeAt(0) + file)
  }

  private getBoardRenderMetrics(boardSize: BoardSize): BoardRenderMetrics {
    const squareSize = Sizes.BoardWidth / Math.max(boardSize.width, boardSize.height)
    const contentSize: Vec2 = [boardSize.width * squareSize, boardSize.height * squareSize]
    return {
      boardSize,
      contentOffset: [
        (Sizes.BoardWidth - contentSize[0]) / 2,
        (Sizes.BoardWidth - contentSize[1]) / 2,
      ],
      contentSize,
      squareScale: squareSize / Sizes.PieceWidth,
      squareSize,
      squareSizeVec: [squareSize, squareSize],
    }
  }

  private toDisplayCoord(coord: CoordSpacelike, boardSize: BoardSize = STANDARD_BOARD_SIZE): CoordSpacelike {
    return this.viewPlayer === Player.W
      ? coord
      : {
          x: boardSize.width - 1 - coord.x,
          y: boardSize.height - 1 - coord.y,
        }
  }

  private toBoardCoord(displayCoord: CoordSpacelike, boardSize: BoardSize = STANDARD_BOARD_SIZE): CoordSpacelike {
    return this.toDisplayCoord(displayCoord, boardSize)
  }

  private renderBoardFocusMask(l: number, m: number, pos: Vec2, alpha: number, metrics: BoardRenderMetrics) {
    const focusPulse = this.getBoardFocusPulseProgress(l, m)

    if (focusPulse > 0) {
      this.renderer.submit({
        type: RenderItemType.Quad,
        layer: RenderLayer.MoveHighlight,
        order: -1,
        mat: Mat3.transform(pos, metrics.contentSize),
        color: Color4.withAlpha(
          Colors.FocusGreen,
          alpha * focusPulse * Animations.BoardFocusMaskAlpha,
        ),
      })
    }

    const axisFocusRect = this.getBoardAxisFocusRect(l, m, pos, metrics)
    if (! axisFocusRect) return

    this.renderer.submit({
      type: RenderItemType.Rect,
      layer: RenderLayer.MoveHighlight,
      order: 0,
      pos: axisFocusRect.pos,
      size: axisFocusRect.size,
      fill: null,
      stroke: Color4.withAlpha(Colors.FocusGreen, alpha * 0.88),
      strokeWidth: 1.5,
    })
  }

  private getBoardAxisFocusRect(l: number, m: number, pos: Vec2, metrics: BoardRenderMetrics): { persistent: boolean, pos: Vec2, size: Vec2 } | null {
    const axisFocus = this.getBoardAxisFocusTarget(l, m, metrics.boardSize)
    if (! axisFocus) return null

    if (axisFocus.type === 'file') {
      const squarePos = this.getSquarePos(pos[0], pos[1], { x: axisFocus.coord, y: 0 }, metrics)
      return {
        persistent: axisFocus.persistent,
        pos: [squarePos[0], pos[1]],
        size: [metrics.squareSize, metrics.contentSize[1]],
      }
    }

    const squarePos = this.getSquarePos(pos[0], pos[1], { x: 0, y: axisFocus.coord }, metrics)
    return {
      persistent: axisFocus.persistent,
      pos: [pos[0], squarePos[1]],
      size: [metrics.contentSize[0], metrics.squareSize],
    }
  }

  private getBoardAxisFocusTarget(
    l: number,
    m: number,
    boardSize: BoardSize,
  ): (GameAxisViewFocusTarget & { persistent: boolean }) | null {
    if (! this.axisViewVisible) return null

    if (this.hoverAxisViewBoard?.l === l && this.hoverAxisViewBoard.m === m) {
      return {
        ...this.getAxisViewFocusTarget(boardSize),
        persistent: true,
      }
    }

    if (this.focusedBoard?.l === l && this.focusedBoard.m === m && this.axisViewState.l === l) {
      return {
        ...this.getAxisViewFocusTarget(boardSize),
        persistent: true,
      }
    }

    if (this.boardFocusPulse?.l === l && this.boardFocusPulse.m === m && this.boardFocusPulse.axisFocus) {
      return {
        ...this.boardFocusPulse.axisFocus,
        persistent: false,
      }
    }

    return null
  }

  private getAxisViewFocusTarget(boardSize: BoardSize): GameAxisViewFocusTarget {
    const maxFixedCoord = getAxisViewFixedCoordMax(this.axisViewState.mode, boardSize)
    const axis = clampBoardAxisCoord(this.axisViewState.fixedCoord, maxFixedCoord)
    return {
      coord: getAxisViewFixedBoardCoord(this.axisViewState.mode, axis, boardSize, this.viewPlayer),
      type: this.axisViewState.mode === 'yt' ? 'file' : 'rank',
    }
  }

  private renderCheckBadge(l: number, m: number, boardPos: Vec2, alpha: number, boardContentSize?: Vec2) {
    if (! this.isCheckWarningBoard(l, m)) return

    const center = this.getCheckBadgeCenter(l, m, boardPos, boardContentSize)
    const hovered = this.hoverCheckWarning?.l === l && this.hoverCheckWarning.m === m
    const fill = hovered ? Colors.CheckBadgeHover : Colors.CheckBadgeFill
    const stroke = hovered ? Colors.CheckBadgeHover : Colors.CheckBadgeBorder

    this.renderer.submit({
      type: RenderItemType.Circle,
      layer: RenderLayer.UIShadow,
      order: 0,
      center: Vec2.add(center, Sizes.CheckBadgeShadowOffset),
      radius: Sizes.CheckBadgeRadius,
      fill: Color4.withAlpha(Colors.Shadow, alpha),
      stroke: null,
    })
    this.renderer.submit({
      type: RenderItemType.Circle,
      layer: RenderLayer.UI,
      order: 1,
      center,
      radius: Sizes.CheckBadgeRadius,
      fill: Color4.withAlpha(fill, alpha),
      stroke: Color4.withAlpha(stroke, alpha),
      strokeWidth: 2,
    })
    this.renderer.submit({
      type: RenderItemType.Text,
      layer: RenderLayer.UI,
      order: 2,
      pos: [center[0], center[1] + 0.5],
      angle: 0,
      text: '!',
      fontSize: Sizes.CheckBadgeFontSize,
      color: Color4.withAlpha(Colors.CheckBadgeText, alpha),
      align: 'center',
      baseline: 'middle',
    })
  }

  private getCheckBadgeCenter(l: number, m: number, boardContentPos?: Vec2, boardContentSize?: Vec2): Vec2 {
    const board = this.getBoardAt(l, m)
    const metrics = this.getBoardRenderMetrics(board ? Board.getSize(board) : STANDARD_BOARD_SIZE)
    const contentPos = boardContentPos ?? Vec2.add(this.layout.getBoardRect(l, m)[0], [
      Sizes.BoardBorder + metrics.contentOffset[0],
      Sizes.BoardBorder + metrics.contentOffset[1],
    ])
    const contentSize = boardContentSize ?? metrics.contentSize
    return [
      contentPos[0] + contentSize[0] + Sizes.CheckBadgeOffset,
      contentPos[1] - Sizes.CheckBadgeOffset,
    ]
  }

  private getMoveFormationHighlightColor(
    board: Board,
    coord: CoordSpacelike,
    isWhiteSquare: boolean,
  ): Color4 | null {
    const move = board.createdBy
    if (! move || ! board.createdByRole) return null

    const is5DMove = ! Coord.isSameBoard(move.from, move.to)
    const highlightsSource = (
      (board.createdByRole === 'source' || board.createdByRole === 'both')
      && Coord.isSameSpace(move.from, coord)
    )
    const highlightsTarget = (
      (board.createdByRole === 'target' || board.createdByRole === 'both')
      && Coord.isSameSpace(move.to, coord)
    )
    if (! highlightsSource && ! highlightsTarget) return null

    if (is5DMove) return isWhiteSquare ? Colors.MoveHighlight5DWhite : Colors.MoveHighlight5DBlack
    return isWhiteSquare ? Colors.MoveHighlight2DWhite : Colors.MoveHighlight2DBlack
  }

  private renderMoveFormationArrow(board: Board, alpha = 1) {
    if (this.selectedPiece) return

    const move = board.createdBy
    const player = board.createdByPlayer
    if (! move || player === null || board.createdByRole !== 'target') return
    if (Coord.isSameBoard(move.from, move.to)) return

    this.renderMoveArrow(move, player, alpha, board.createdByOrder ?? 0)
  }

  private renderMoveArrow(move: Move, player: Player, alpha = 1, order = 0) {
    const geometry = this.getMoveArrowGeometry(move, player)
    if (! geometry) return

    const stroke = player === Player.W ? Colors.BoardBorderWhite : Colors.BoardBorderBlack
    this.renderArrowPolygon(
      geometry,
      Colors.MoveArrowFill,
      stroke,
      alpha,
      order,
    )
  }

  private renderPendingCheckArrows(boardPositions?: ReadonlyMap<string, Vec2>) {
    for (let i = 0; i < this.pendingChecks.length; i += 1) {
      const check = this.pendingChecks[i]
      const geometry = this.getCheckArrowGeometry(check, boardPositions)
      if (! geometry) continue

      const stroke = check.attackingPlayer === Player.W
        ? Colors.BoardBorderWhite
        : Colors.BoardBorderBlack
      const isInsideBoard = check.fromBoard.l === check.toBoard.l
        && check.fromBoard.m === check.toBoard.m
      this.renderArrowPolygon(
        geometry,
        Colors.CheckArrowFill,
        stroke,
        1,
        (isInsideBoard ? 11000 : 10000) + i,
        RenderLayer.CheckArrow,
      )
    }
  }

  private renderArrowPolygon(
    geometry: MoveArrowGeometry,
    fill: Color4,
    stroke: Color4,
    alpha: number,
    order: number,
    layer = RenderLayer.MoveHighlight,
  ) {
    const points = geometry.straight === true
      ? getStraightMoveArrowPolygon(geometry.from, geometry.to)
      : getMoveArrowPolygon(
        geometry.from,
        geometry.control1,
        geometry.control2,
        geometry.to,
      )
    if (points.length === 0) return

    this.renderer.submit({
      type: RenderItemType.Polygon,
      layer,
      order,
      points,
      fill: getMoveArrowMaskFill(
        Color4.withAlpha(fill, alpha),
        geometry.from,
        geometry.control1,
      ),
      stroke: getMoveArrowMaskFill(
        Color4.withAlpha(stroke, alpha),
        geometry.from,
        geometry.control1,
      ),
      strokeWidth: Sizes.MoveArrowStrokeWidth,
    })
  }

  private getMoveArrowGeometry(move: Move, player: Player): MoveArrowGeometry | null {
    if (Coord.isSameBoard(move.from, move.to)) return null

    const fromM = Coord.boardIndex(move.from, player)
    const toM = Coord.boardIndex(move.to, player)
    const from = this.getVisibleSquareCenter(move.from.l, fromM, move.from)
    const to = this.getVisibleSquareCenter(move.to.l, toM, move.to)
    return this.getCurvedArrowGeometry(from, to, player)
  }

  private getCheckArrowGeometry(
    check: PendingCheck,
    boardPositions?: ReadonlyMap<string, Vec2>,
  ): MoveArrowGeometry | null {
    const from = this.getCheckArrowSquareCenter(
      check.fromBoard.l,
      check.fromBoard.m,
      check.move.from,
      boardPositions,
    )
    const to = this.getCheckArrowSquareCenter(
      check.toBoard.l,
      check.toBoard.m,
      check.move.to,
      boardPositions,
    )

    if (check.fromBoard.l === check.toBoard.l && check.fromBoard.m === check.toBoard.m) {
      const direction = Vec2.sub(to, from)
      return {
        from,
        control1: Vec2.add(from, Vec2.scale(direction, 0.35)),
        control2: Vec2.add(from, Vec2.scale(direction, 0.65)),
        to,
        straight: true,
      }
    }

    return this.getCurvedArrowGeometry(from, to, check.attackingPlayer)
  }

  private getCheckArrowSquareCenter(
    l: number,
    m: number,
    coord: CoordSpacelike,
    boardPositions?: ReadonlyMap<string, Vec2>,
  ): Vec2 {
    const boardPos = boardPositions?.get(this.getBoardKey(l, m))
    if (! boardPos) return this.getVisibleSquareCenter(l, m, coord)

    const board = this.getBoardAt(l, m)
    return this.getVisibleSquareCenterAtBoardPos(
      boardPos,
      coord,
      board ? Board.getSize(board) : STANDARD_BOARD_SIZE,
    )
  }

  private getVisibleSquareCenter(l: number, m: number, coord: CoordSpacelike): Vec2 {
    const [boardPos] = this.layout.getBoardRect(l, m)
    const board = this.getBoardAt(l, m)
    return this.getVisibleSquareCenterAtBoardPos(
      boardPos,
      coord,
      board ? Board.getSize(board) : STANDARD_BOARD_SIZE,
    )
  }

  private getVisibleSquareCenterAtBoardPos(
    boardPos: Vec2,
    coord: CoordSpacelike,
    boardSize: BoardSize = STANDARD_BOARD_SIZE,
  ): Vec2 {
    const metrics = this.getBoardRenderMetrics(boardSize)
    const displayCoord = this.toDisplayCoord(coord, boardSize)
    return Vec2.add(boardPos, [
      Sizes.BoardBorder + metrics.contentOffset[0] + (displayCoord.x + 0.5) * metrics.squareSize,
      Sizes.BoardBorder + metrics.contentOffset[1] + (displayCoord.y + 0.5) * metrics.squareSize,
    ])
  }

  private getCurvedArrowGeometry(from: Vec2, to: Vec2, player: Player): MoveArrowGeometry | null {
    const horizontal = Math.abs(to[0] - from[0]) >= Math.abs(to[1] - from[1])
    const direction = Vec2.sub(to, from)
    if (Vec2.length(direction) === 0) return null

    const playerBendDirection = player === Player.W ? 1 : -1
    const bend = Vec2.scale(
      horizontal
        ? [0, direction[0] >= 0 ? -1 : 1]
        : [direction[1] >= 0 ? 1 : -1, 0],
      Sizes.MoveArrowCurveOffset * playerBendDirection,
    )
    const control1 = Vec2.add(Vec2.add(from, Vec2.scale(direction, 0.35)), bend)
    const control2 = Vec2.add(Vec2.add(from, Vec2.scale(direction, 0.65)), bend)

    return { from, control1, control2, to }
  }

  private getStraightArrowGeometry(from: Vec2, to: Vec2): MoveArrowGeometry | null {
    if (Vec2.length(Vec2.sub(to, from)) === 0) return null
    return {
      from,
      control1: from,
      control2: to,
      to,
      straight: true,
    }
  }

  private isHighlightedBoardSquare(l: number, m: number, coord: CoordSpacelike): boolean {
    if (this.hoverSquare && isSameLocatedSquare(this.hoverSquare, l, m, coord)) return true

    const selection = this.selectedPiece ?? this.hoverPiece
    if (! selection) return false
    if (selection.l === l && selection.m === m && Coord.isSameSpace(selection.from, coord)) return true
    return selection.targets.some(target => this.isTargetAt(target, l, m, coord, selection.player))
  }

  private shouldRenderPieceGhost(l: number, m: number, coord: CoordSpacelike): boolean {
    if (! this.selectedPiece || ! this.hoverSquare) return false
    if (! this.canControlTurn() || this.selectedPiece.player !== this.player) return false
    if (! isSameLocatedSquare(this.hoverSquare, l, m, coord)) return false
    return this.selectedPiece.targets.some(target => (
      this.isTargetAt(target, l, m, coord, this.selectedPiece!.player)
    ))
  }

  private isTargetAt(target: Coord, l: number, m: number, coord: CoordSpacelike, player: Player): boolean {
    return target.l === l
      && Coord.boardIndex(target, player) === m
      && Coord.isSameSpace(target, coord)
  }

  private renderBoardShadow(
    frame: BoardFrame,
    layers = getBoardRenderLayers(false),
    alpha = 1,
  ) {
    const pos = Vec2.add(frame.pos, Sizes.BoardShadowOffset)
    const size = frame.size
    this.renderBoardShadowRect([pos, size], frame.radius, layers.shadowBase, alpha)

    this.renderBoardShadowRect(
      [
        Vec2.add(pos, [Sizes.ShadowShrink, 0]),
        Vec2.add(size, [-Sizes.ShadowShrink, -Sizes.ShadowShrink]),
      ],
      frame.radius,
      layers.shadowHigh,
      alpha,
    )
  }

  private renderBoardShadowRect([pos, size]: Rect, radius: number, layer: RenderLayer, alpha = 1) {
    if (size[0] <= 0 || size[1] <= 0) return

    this.renderer.submit({
      type: RenderItemType.RoundRect,
      layer,
      pos,
      size,
      radius,
      fill: Color4.withAlpha(Colors.Shadow, alpha),
      stroke: null,
    })
  }

  private renderPiece(
    piece: Piece,
    pos: Vec2,
    layer: RenderLayer = RenderLayer.Piece,
    alpha = 1,
    size: Vec2 = Sizes.PieceSize,
  ) {
    this.renderer.submit({
      type: RenderItemType.Texture,
      layer,
      mat: Mat3.transform(pos, size),
      textureId: PIECE_TO_TEXTURE_ID.get(piece)!,
      alpha,
    })
  }

  private renderPieceGhost(piece: Piece, pos: Vec2, size: Vec2 = Sizes.PieceSize) {
    this.renderer.submit({
      type: RenderItemType.Texture,
      layer: RenderLayer.PieceGhost,
      mat: Mat3.transform(pos, size),
      textureId: PIECE_TO_TEXTURE_ID.get(piece)!,
      alpha: PIECE_GHOST_ALPHA,
    })
  }
}

const AXIS_VIEW_FILE_LABELS = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] as const
const RECOVERY_FILE_LABELS = 'abcdefghijklmnopqrstuvwxyz'

function clampBoardAxisCoord(value: number, max: number): number {
  if (! Number.isFinite(value)) return 0
  return Math.max(0, Math.min(max, Math.round(value)))
}

function rectFromWorldCorners(a: Vec2, b: Vec2): Rect {
  const x0 = Math.min(a[0], b[0])
  const y0 = Math.min(a[1], b[1])
  const x1 = Math.max(a[0], b[0])
  const y1 = Math.max(a[1], b[1])
  return [[x0, y0], [x1 - x0, y1 - y0]]
}

function getLineBoardSize(line: Line): BoardSize {
  for (const [, board] of Line.getBoardEntries(line)) {
    if (board) return Board.getSize(board)
  }
  return STANDARD_BOARD_SIZE
}

function getMultiverseBoardSize(multiverse: Multiverse): BoardSize {
  for (const [, line] of Multiverse.getLineEntries(multiverse)) {
    if (! line) continue
    return getLineBoardSize(line)
  }
  return STANDARD_BOARD_SIZE
}

function formatRecoveryTurnSerial(actionIndex: number): string {
  const turn = Math.floor(actionIndex / 2) + 1
  const player = actionIndex % 2 === 0 ? 'w' : 'b'
  return `${turn}${player}.`
}

function formatRecoveryMove({ from, to }: Move, boardSize: BoardSize): string {
  return `${formatRecoveryCoord(from, boardSize)}${formatRecoveryCoord(to, boardSize)}`
}

function formatRecoveryCoord({ l, t, x, y }: Coord, { height }: BoardSize): string {
  const file = RECOVERY_FILE_LABELS[x] ?? `x${x}`
  return `(${l}T${t})${file}${height - y}`
}

function formatRecoveryComments(comments: readonly string[] | undefined): string[] {
  return comments?.map(comment => `{${comment}}`) ?? []
}

function formatRecoveryGlyphs(glyphs: readonly string[] | undefined): string {
  return glyphs?.join('') ?? ''
}

function createDefaultAxisViewState(): GameAxisViewState {
  return {
    fixedCoord: 0,
    l: null,
    mode: 'yt',
  }
}

function normalizeAxisViewState(state: GameAxisViewState): GameAxisViewState {
  return {
    fixedCoord: Math.max(0, Math.floor(state.fixedCoord)),
    l: Number.isInteger(state.l) ? state.l : null,
    mode: state.mode === 'xt' ? 'xt' : 'yt',
  }
}

function getAxisViewFixedCoordMax(mode: GameAxisViewMode, { width, height }: BoardSize): number {
  return Math.max(0, (mode === 'yt' ? width : height) - 1)
}

function getAxisViewFixedBoardCoord(
  mode: GameAxisViewMode,
  displayCoord: number,
  { width, height }: BoardSize,
  viewPlayer: Player,
): number {
  if (mode === 'yt') return viewPlayer === Player.W ? displayCoord : width - displayCoord - 1
  return viewPlayer === Player.W ? height - displayCoord - 1 : displayCoord
}

function getAxisViewRowCoords(
  mode: GameAxisViewMode,
  { width, height }: BoardSize,
  viewPlayer: Player,
): number[] {
  const count = mode === 'yt' ? height : width
  return Array.from({ length: count }, (_, index) => (
    viewPlayer === Player.W ? index : count - index - 1
  ))
}

function getAxisViewRowLabels(
  mode: GameAxisViewMode,
  rowCoords: number[],
  { height }: BoardSize,
  viewPlayer: Player,
): string[] {
  return rowCoords.map(coord => (
    mode === 'yt'
      ? `${viewPlayer === Player.W ? height - coord : coord + 1}`
      : AXIS_VIEW_FILE_LABELS[coord] ?? `${coord + 1}`
  ))
}

function getAxisViewSpacelikeCoord(
  mode: GameAxisViewMode,
  fixedCoord: number,
  rowCoord: number,
): CoordSpacelike {
  return mode === 'yt'
    ? { x: fixedCoord, y: rowCoord }
    : { x: rowCoord, y: fixedCoord }
}

function getAxisViewTargetCellsForTargets(
  mode: GameAxisViewMode,
  l: number,
  fixedBoardCoord: number,
  rowCoords: number[],
  columns: GameAxisViewBoardColumn[],
  player: Player,
  targets: Coord[],
): GameAxisViewTargetCell[] {
  const columnIndexByM = new Map(columns.map((column, index) => [column.m, index]))
  const rowIndexByCoord = new Map(rowCoords.map((coord, index) => [coord, index]))
  const targetCells: GameAxisViewTargetCell[] = []
  const seen = new Set<string>()

  for (const target of targets) {
    if (target.l !== l) continue
    if (! isAxisViewTargetInSlice(mode, target, fixedBoardCoord)) continue

    const columnIndex = columnIndexByM.get(Coord.boardIndex(target, player))
    if (columnIndex === undefined) continue

    const rowIndex = rowIndexByCoord.get(getAxisViewTargetRowCoord(mode, target))
    if (rowIndex === undefined) continue

    const key = `${columnIndex}:${rowIndex}`
    if (seen.has(key)) continue
    seen.add(key)
    targetCells.push({ columnIndex, rowIndex })
  }

  return targetCells
}

function isAxisViewTargetInSlice(mode: GameAxisViewMode, target: CoordSpacelike, fixedCoord: number): boolean {
  return mode === 'yt'
    ? target.x === fixedCoord
    : target.y === fixedCoord
}

function getAxisViewTargetRowCoord(mode: GameAxisViewMode, target: CoordSpacelike): number {
  return mode === 'yt' ? target.y : target.x
}

function getAxisViewPieceCellKey({ columnIndex, rowIndex }: Pick<GameAxisViewPieceCell, 'columnIndex' | 'rowIndex'>): string {
  return `${columnIndex}:${rowIndex}`
}

function getAxisViewColumnLabel(m: number, player: Player): string {
  const playerLabel = player === Player.W ? 'w' : 'b'
  return `T${Coord.turn(m, player)}${playerLabel}`
}
