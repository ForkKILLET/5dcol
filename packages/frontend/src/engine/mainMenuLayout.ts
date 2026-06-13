import { Sizes } from './constant'

export interface MainMenuLayout {
  areaLeft: number
  areaTop: number
  areaWidth: number
  areaHeight: number
  scale: number
  centerX: number
  titleLeft: number
  titleTop: number
  titlePrimarySize: number
  titleSecondarySize: number
  titlePrimaryShadowX: number
  titlePrimaryShadowY: number
  titleSecondaryShadowX: number
  titleSecondaryShadowY: number
  titleTertiaryShadowX: number
  titleTertiaryShadowY: number
  buttonWidth: number
  buttonHeight: number
  buttonFontSize: number
  buttonGap: number
  buttonsTop: number
  disclaimerLeft: number
  disclaimerTop: number
  disclaimerWidth: number
  disclaimerFontSize: number
  arrowWidth: number
  arrowHeight: number
  arrowBorderWidth: number
}

const MAIN_MENU_BASE_WIDTH = 1536
const MAIN_MENU_BASE_HEIGHT = 960

const MAIN_MENU_BASE_LAYOUT: MainMenuLayout = {
  areaLeft: 0,
  areaTop: 0,
  areaWidth: MAIN_MENU_BASE_WIDTH,
  areaHeight: MAIN_MENU_BASE_HEIGHT,
  scale: 1,
  centerX: 210,
  titleLeft: 42,
  titleTop: 34,
  titlePrimarySize: 200,
  titleSecondarySize: 80,
  titlePrimaryShadowX: 4,
  titlePrimaryShadowY: 4,
  titleSecondaryShadowX: 2,
  titleSecondaryShadowY: 2,
  titleTertiaryShadowX: 1,
  titleTertiaryShadowY: 1,
  buttonWidth: 220,
  buttonHeight: Sizes.ButtonHeight,
  buttonFontSize: Sizes.ButtonFontSize,
  buttonGap: Sizes.ButtonContentGap * 1.5,
  buttonsTop: 430,
  disclaimerLeft: 430,
  disclaimerTop: 885,
  disclaimerWidth: 980,
  disclaimerFontSize: 24,
  arrowWidth: 300,
  arrowHeight: 945,
  arrowBorderWidth: 4,
}

export function getMainMenuLayout(width: number, height: number): MainMenuLayout {
  const scale = Math.min(
    1,
    width / MAIN_MENU_BASE_WIDTH,
    height / MAIN_MENU_BASE_HEIGHT,
  )
  return scaleMainMenuLayout(MAIN_MENU_BASE_LAYOUT, scale)
}

function scaleMainMenuLayout(
  layout: MainMenuLayout,
  scale: number,
): MainMenuLayout {
  return {
    areaLeft: 0,
    areaTop: 0,
    areaWidth: layout.areaWidth * scale,
    areaHeight: layout.areaHeight * scale,
    scale,
    centerX: layout.centerX * scale,
    titleLeft: layout.titleLeft * scale,
    titleTop: layout.titleTop * scale,
    titlePrimarySize: layout.titlePrimarySize * scale,
    titleSecondarySize: layout.titleSecondarySize * scale,
    titlePrimaryShadowX: layout.titlePrimaryShadowX * scale,
    titlePrimaryShadowY: layout.titlePrimaryShadowY * scale,
    titleSecondaryShadowX: layout.titleSecondaryShadowX * scale,
    titleSecondaryShadowY: layout.titleSecondaryShadowY * scale,
    titleTertiaryShadowX: layout.titleTertiaryShadowX * scale,
    titleTertiaryShadowY: layout.titleTertiaryShadowY * scale,
    buttonWidth: layout.buttonWidth * scale,
    buttonHeight: layout.buttonHeight * scale,
    buttonFontSize: layout.buttonFontSize * scale,
    buttonGap: layout.buttonGap * scale,
    buttonsTop: layout.buttonsTop * scale,
    disclaimerLeft: layout.disclaimerLeft * scale,
    disclaimerTop: layout.disclaimerTop * scale,
    disclaimerWidth: layout.disclaimerWidth * scale,
    disclaimerFontSize: layout.disclaimerFontSize * scale,
    arrowWidth: layout.arrowWidth * scale,
    arrowHeight: layout.arrowHeight * scale,
    arrowBorderWidth: layout.arrowBorderWidth * scale,
  }
}

export function getMainArrowPoints(
  outerWidth: number,
  outerHeight: number,
  borderWidth: number,
): Array<[number, number]> {
  const inset = borderWidth / 2
  const width = Math.max(0, outerWidth - inset * 2)
  const height = Math.max(0, outerHeight - inset * 2)
  const center = inset + width / 2
  const top = - inset
  const bottom = inset + height
  const headHeight = Math.min(width * 0.45, height)
  const headTop = bottom - headHeight
  const shaftHalfWidth = width * 0.22
  const headHalfWidth = headHeight
  const points: Array<[number, number]> = [
    [center - shaftHalfWidth, top],
    [center + shaftHalfWidth, top],
    [center + shaftHalfWidth, headTop],
    [center + headHalfWidth, headTop],
    [center, bottom],
    [center - headHalfWidth, headTop],
    [center - shaftHalfWidth, headTop],
  ]
  return points
}
