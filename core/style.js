import {
  startProcess, endProcess, capitalize,
  rgbToHex, hexToRgb, mixColors, accumulateColors,
  getColorsStandardVariance, imageDataToDataUrl
} from '../utils/index.js'
import {numberRegExp, symbolRegExp} from '../utils/reg-exp.js'
import ColorCounter from '../utils/color-counter.js'
import {TYPE_STRUCTURE} from './structure.js'
import {findText} from './recognize.js'

export const TYPE_INLINE_BLOCK = {
  IMAGE: 'image',
  TEXT: 'text'
}
const PIXEL_SINGLE_LINE = 56
const STANDARD_VARIANCE_BORDER_COLOR = 10
const STANDARD_VARIANCE_BORDER_RADIUS_COLOR = 20
const STANDARD_VARIANCE_SAME_BORDER_COLOR = 2
const STANDARD_VARIANCE_SURROUNDING_COLOR = 2
const STANDARD_VARIANCE_FONT_COLOR = 15
const RATIO_SINGLE_LINE_SIZE = 1.5
const RATIO_SIMILAR_COLOR = 1.2
const RATIO_ONLY_NUMBERS_SYMBOLS = 1.2
const ERROR_PIXEL = 2

let g_detailedStuff

export function addStylesToStructure (structure, detailedStuff) {
  g_detailedStuff = detailedStuff
  enhanceStructure(structure)
  addStyles(structure)
  processStyles(structure)
  return structure
}

function enhanceStructure (structure) {
  startProcess('enhanceStructure', _ => console.info(_))
  recursivelyEnhanceStructure(structure)
  endProcess('enhanceStructure', _ => console.info(_))
}

function recursivelyEnhanceStructure (structure, parent) {
  structure.forEach(structureItem => {
    const {
      type, children, width, height,
      top, bottom, left, right
    } = structureItem
    const styles = {}
    if (type === TYPE_STRUCTURE.ROW && children.length) {
      styles.display = 'flex'
    }

    /* Padding or size */
    if (children.length) {
      const childrenTop = Math.min(...children.map(child => child.top))
      const childrenLeft = Math.min(...children.map(child => child.left))
      const childrenRight = Math.max(...children.map(child => child.right))
      const childrenBottom = Math.max(...children.map(child => child.bottom))
      const paddingTop = childrenTop - top
      const paddingLeft = childrenLeft - left
      const paddingRight = right - childrenRight
      const paddingBottom = bottom - childrenBottom
      if (beyondError(paddingTop)) styles.paddingTop = paddingTop
      if (beyondError(paddingLeft)) styles.paddingLeft = paddingLeft
      if (beyondError(paddingRight)) styles.paddingRight = paddingRight
      if (beyondError(paddingBottom)) styles.paddingBottom = paddingBottom
    } else {
      styles.width = width
      styles.height = height
    }

    /* Margin */
    if (parent && structure.length > 1) {
      let tempBottom = Math.min(...structure.map(item => item.top))
      const structureAbove = structure.filter(item => item.bottom < top)
      if (structureAbove.length) {
        structureAbove.forEach(item => {
          if (item.bottom > tempBottom) tempBottom = item.bottom
        })
      }
      const marginTop = top - tempBottom
      if (beyondError(marginTop)) styles.marginTop = marginTop

      let tempRight = Math.min(...structure.map(item => item.left))
      const leftSideStructure = structure.filter(item => item.right < left)
      if (leftSideStructure.length) {
        leftSideStructure.forEach(item => {
          if (item.right > tempRight) tempRight = item.right
        })
      }
      const marginLeft = left - tempRight - 1
      if (beyondError(marginLeft)) styles.marginLeft = marginLeft
    }

    structureItem.styles = styles
    if (children && children.length) {
      recursivelyEnhanceStructure(children, structureItem)
    } else {
      addSubStructure(structureItem)
    }
  })
}

function addSubStructure (structure) {
  const {
    top: structureTop,
    bottom: structureBottom,
    left: structureLeft,
    right: structureRight
  } = structure
  const htmlObjectGroup = []
  const sortedDetailedStuff = getSortedDetailedStuff(
    structure.detailedStuffIds
  )
  sortedDetailedStuff.forEach(detailedStuff => {
    const {
      left, top, width, height, id
    } = detailedStuff
    const imageData = window.ctx.getImageData(
      left, top, width, height
    )
    const dataUrl = imageDataToDataUrl(imageData)
    const options = {detailedStuffId: id}
    const text = findText(dataUrl, options)
    if (text === null) {
      const type = TYPE_INLINE_BLOCK.IMAGE
      const src = dataUrl
      htmlObjectGroup.push({type, src})
    } else {
      const type = TYPE_INLINE_BLOCK.TEXT
      const content = text
      const contentLength = content.length
      const sizeRatio = width / height
      const probablyContainImage = Boolean(
        height < PIXEL_SINGLE_LINE &&
        sizeRatio / contentLength > RATIO_SINGLE_LINE_SIZE
      )
      htmlObjectGroup.push({
        type, content, probablyContainImage
      })
    }
  })

  function _getPosition (startIndex, endIndex) {
    if (!endIndex) endIndex = startIndex
    const {top, left} = sortedDetailedStuff[startIndex]
    const {right, bottom} = sortedDetailedStuff[endIndex]
    const width = right - left + 1
    const height = bottom - top + 1
    const position = {
      top, left, right, bottom, width, height
    }
    return position
  }

  function _getStyles (index) {
    const styles = {}
    const {top, left} = sortedDetailedStuff[index]
    if (index) {
      const {
        bottom: prevBottom,
        right: prevRight
      } = sortedDetailedStuff[index - 1]
      const marginTop = top - prevBottom
      const marginLeft = left - prevRight
      if (beyondPositiveError(marginTop)) {
        styles.marginTop = marginTop
      } else if (beyondPositiveError(marginLeft)) {
        styles.marginLeft = marginLeft
      }
    }
    if (!styles.marginTop) {
      const marginTop = top - structureTop
      if (beyondPositiveError(marginTop)) {
        styles.marginTop = marginTop
      }
    }
    if (!styles.marginLeft) {
      const marginLeft = left - structureLeft
      if (beyondPositiveError(marginLeft)) {
        styles.marginLeft = marginLeft
      }
    }
    return styles
  }

  let subStructureGroup = []
  let tempCurrentIndex = 0
  htmlObjectGroup.forEach((htmlObject, index) => {
    if (index < tempCurrentIndex) return
    const {
      type, content, src, probablyContainImage
    } = htmlObject
    switch (type) {
      case TYPE_INLINE_BLOCK.TEXT: {
        let text = ''
        let tempContainImage = probablyContainImage
        for (let i = index; i < htmlObjectGroup.length; i++) {
          const tempHtmlObject = htmlObjectGroup[i]
          const {
            content, type, probablyContainImage
          } = tempHtmlObject
          tempContainImage |= probablyContainImage
          if (type === TYPE_INLINE_BLOCK.TEXT) {
            text += content
            if (i === htmlObjectGroup.length - 1) {
              const position = _getPosition(index, i)
              const styles = _getStyles(index)
              subStructureGroup.push({
                type, text, styles,
                probablyContainImage: tempContainImage,
                ...position
              })
              tempCurrentIndex = htmlObjectGroup.length
            }
          } else {
            const position = _getPosition(index, i)
            const styles = _getStyles(index)
            subStructureGroup.push({
              type: TYPE_INLINE_BLOCK.TEXT,
              probablyContainImage: tempContainImage,
              text, styles, ...position
            })
            tempCurrentIndex = i - 1
            break
          }
        }
        break
      }
      case TYPE_INLINE_BLOCK.IMAGE: {
        const position = _getPosition(index)
        const styles = _getStyles(index)
        subStructureGroup.push({
          type, src, styles, ...position
        })
        tempCurrentIndex = index
        break
      }
    }
  })
  structure.subStructure = subStructureGroup
}

function getSortedDetailedStuff (detailedStuffIds) {
  let sortedDetailedStuff = []
  ;(_ => {
    const detailedStuff = detailedStuffIds.map(id => {
      const stuff = g_detailedStuff.find(tempStuff => {
        return tempStuff.id === id
      })
      return stuff
    })
    if (detailedStuffIds.length > 1) {
      const [stuff1, stuff2] = detailedStuff
      let direction
      if (
        stuff1.top > stuff2.bottom ||
        stuff2.top > stuff1.bottom
      ) direction = 'vertical'
      else if (
        stuff1.left > stuff2.right ||
        stuff2.left > stuff1.right
      ) direction = 'horizontal'
      if (!direction) {
        console.warn('Direction empty in getSortedDetailedStuff.')
        return
      }
      const directionPropMap = {
        vertical: 'top',
        horizontal: 'left'
      }
      const prop = directionPropMap[direction]
      sortedDetailedStuff = detailedStuff
        .sort((stuff1, stuff2) => stuff1[prop] - stuff2[prop])
    } else {
      sortedDetailedStuff = [...detailedStuff]
    }
  })()
  return sortedDetailedStuff
}

function beyondError (number) {
  return Math.abs(number) > ERROR_PIXEL
}

function beyondPositiveError (number) {
  return number > ERROR_PIXEL
}

function addStyles (structure) {
  startProcess('addStyles', _ => console.info(_))
  recursivelyAddStyles(structure)
  endProcess('addStyles', _ => console.info(_))
}

function recursivelyAddStyles (structure) {
  structure.forEach(structureItem => {
    const {
      type, text, width, height,
      top, bottom, left, right,
      children, subStructure
    } = structureItem
    const hasChildrenOrSubStructure = (
      (children && children.length) ||
      (subStructure && subStructure.length)
    )
    let styles = {}
    let preStyles = {}

    /* Background */
    if (hasChildrenOrSubStructure) {
      const backgroundColor = getBackgroundColor(structureItem)
      if (backgroundColor) {
        styles.backgroundColor = `#${backgroundColor}`
        preStyles.backgroundColor = backgroundColor
      }
    }

    /* Border */
    if (hasChildrenOrSubStructure) {
      const {backgroundColor} = preStyles
      if (backgroundColor) {
        const borderProperties = detectBorder(
          structureItem, backgroundColor
        )
        Object.keys(borderProperties.hasBorder).forEach(name => {
          if (borderProperties.hasBorder[name]) {
            const width = borderProperties.borderWidth[name]
            const color = borderProperties.borderColor[name]
            styles[`border${capitalize(name)}`] = `${width}px solid #${color}`
          }
        })
        if (borderProperties.borderRadius) {
          styles.borderRadius = `${borderProperties.borderRadius}px`
        }
      }
    }

    /* Font */
    if (type === TYPE_INLINE_BLOCK.TEXT) {
      const fontStyles = inspectFontStyles(structureItem, text)
      styles = {...styles, ...fontStyles}
    }

    structureItem.styles = {...structureItem.styles, ...styles}
    structureItem.preStyles = preStyles
    if (children && children.length) {
      recursivelyAddStyles(children)
    } else if (subStructure && subStructure.length) {
      recursivelyAddStyles(subStructure)
    }
  })
}

function getBackgroundColor (structure) {
  const {
    left, top, width, height,
    children, subStructure
  } = structure
  const childrenAreaGroup = []
  let childrenOrSubStructure
  if (children && children.length) {
    childrenOrSubStructure = children
  } else if (subStructure && subStructure.length) {
    childrenOrSubStructure = subStructure
  }
  if (childrenOrSubStructure && childrenOrSubStructure.length) {
    childrenOrSubStructure.forEach(child => {
      const {
        top: childTop,
        left: childLeft,
        width: childWidth,
        height: childHeight
      } = child
      const loopStart = childTop - top
      const loopEnd = loopStart + childHeight
      for (let i = loopStart; i <= loopEnd; i += 1) {
        const rangeStart = i * width + (childLeft - left)
        const rangeEnd = rangeStart + childWidth
        const area = [rangeStart, rangeEnd]
        childrenAreaGroup.push(area)
      }
    })
  }

  function _inChildrenArea (index) {
    return childrenAreaGroup.some(area => {
      const [start, end] = area
      return index >= start && index <= end
    })
  }

  const colorData = new ColorCounter()
  const imageData = window.ctx.getImageData(
    left, top, width, height
  )
  const {data} = imageData
  for (let i = 0; i < data.length; i += 4) {
    const index = i / 4
    if (!_inChildrenArea(index)) {
      const r = data[i]
      const g = data[i + 1]
      const b = data[i + 2]
      const hex = rgbToHex(r, g, b)
      colorData.addValue(hex)
    }
  }
  const backgroundColor = (
    colorData.totalCount ?
    colorData.getFirstValueByCount() :
    null
  )
  return backgroundColor
}

function detectBorder (structure, backgroundColor) {
  const {
    top, left, right, bottom, width, height,
    children, subStructure
  } = structure
  const imageData = window.ctx.getImageData(
    left, top, width, height
  )
  const {data} = imageData
  let childrenOrSubStructure
  if (children && children.length) {
    childrenOrSubStructure = children
  } else if (subStructure && subStructure.length) {
    childrenOrSubStructure = subStructure
  }

  const overlap = {
    top: false,
    bottom: false,
    left: false,
    right: false
  }
  if (
    childrenOrSubStructure &&
    childrenOrSubStructure.length
  ) {
    for (let name in overlap) {
      const overlapExisted = childrenOrSubStructure
        .some(child => child[name] === structure[name])
      if (overlapExisted) {
        overlap[name] = true
      }
    }
  }

  const result = {
    hasBorder: {},
    borderWidth: {},
    borderColor: {},
    borderRadius: 0
  }

  function _setDefaultBorderProperties (name) {
    result.hasBorder[name] = false
    result.borderWidth[name] = 0
    result.borderColor[name] = null
  }

  function _processBorderProperties (
    name,
    start1, stopFun1, step1,
    start2, stopFun2, step2,
    indexFun
  ) {
    if (overlap[name]) {
      return _setDefaultBorderProperties(name)
    }
    const borderColorGroup = []
    let hasBorder = false
    let borderWidth = 0
    let borderColor = null
    let loopCount = 0
    for (let i = start1; stopFun1(i); i += step1) {
      const colorData = new ColorCounter()
      for (let j = start2; stopFun2(j); j += step2) {
        const index = indexFun(i, j) * 4
        const r = data[index]
        const g = data[index + 1]
        const b = data[index + 2]
        const hex = rgbToHex(r, g, b)
        colorData.addValue(hex)
      }
      const possibleBorderColor = colorData.getFirstValueByCount()
      const colorsStandardVariance = getColorsStandardVariance(
        possibleBorderColor, backgroundColor
      )
      if (colorsStandardVariance > STANDARD_VARIANCE_BORDER_COLOR) {
        hasBorder = true
        borderColorGroup.push(possibleBorderColor)
      } else {
        if (loopCount) break
      }
      loopCount++
    }
    switch (borderColorGroup.length) {
      case 0:
        break
      case 1:
        borderWidth = 1
        borderColor = borderColorGroup[0]
        break
      case 2: {
        const [color1, color2] = borderColorGroup
        const colorsStandardVariance = getColorsStandardVariance(
          color1, color2
        )
        if (colorsStandardVariance > STANDARD_VARIANCE_SAME_BORDER_COLOR) {
          borderWidth = 1
          borderColor = accumulateColors(color1, color2)
        } else {
          borderWidth = 2
          borderColor = mixColors(color1, color2)
        }
        break
      }
      default: {
        const [color1, color2] = borderColorGroup
        const colorsStandardVariance = getColorsStandardVariance(
          color1, color2
        )
        borderWidth = (
          colorsStandardVariance > STANDARD_VARIANCE_SAME_BORDER_COLOR ?
          borderColorGroup.length - 1 :
          borderColorGroup.length
        )
        borderColor = color2
      }
    }
    result.hasBorder[name] = hasBorder
    result.borderWidth[name] = borderWidth
    result.borderColor[name] = borderColor
  }

  _processBorderProperties(
    'top',
    0, i => i < height, 1,
    0, j => j < width, 1,
    (i, j) => i * width + j
  )
  _processBorderProperties(
    'bottom',
    height - 1, i => i >= 0, -1,
    0, j => j < width, 1,
    (i, j) => i * width + j
  )
  _processBorderProperties(
    'left',
    0, i => i < width, 1,
    0, j => j < height, 1,
    (i, j) => j * width + i
  )
  _processBorderProperties(
    'right',
    width - 1, i => i >= 0, -1,
    0, j => j < height, 1,
    (i, j) => j * width + i
  )

  const distinguishColor = (
    result.hasBorder.top ?
    result.borderColor.top :
    backgroundColor
  )
  for (let i = 0; i < width; i++) {
    const index = i * 4
    const r = data[index]
    const g = data[index + 1]
    const b = data[index + 2]
    const hex = rgbToHex(r, g, b)
    const colorsStandardVariance = getColorsStandardVariance(
      hex, distinguishColor
    )
    if (colorsStandardVariance < STANDARD_VARIANCE_BORDER_RADIUS_COLOR) {
      result.borderRadius = i
      break
    }
  }

  return result
}

function inspectFontStyles (structure, text) {
  const fontStyles = {}
  const {
    left, top, width, height, probablyContainImage
  } = structure
  const imageData = window.ctx.getImageData(left, top, width, height)
  const {data} = imageData
  const surroundingColor = getSurroundingColor(width, height, data)
  const blankRowsIndex = getBlankRowsIndex(
    width, height, data, surroundingColor
  )
  if (blankRowsIndex.length) {
    // Waiting for more cases
  } else {
    const onlyNumbersAndSymbolsRegExp = new RegExp(
      `^[${numberRegExp}${symbolRegExp}]+$`
    )
    const isOnlyNumbersAndSymbols = onlyNumbersAndSymbolsRegExp.test(text)
    let size = height
    if (isOnlyNumbersAndSymbols && !probablyContainImage) {
      size = Math.floor(size * RATIO_ONLY_NUMBERS_SYMBOLS)
    }
    fontStyles.fontSize =
    fontStyles.lineHeight = `${size}px`
  }
  const fontColors = getFontColors(data, surroundingColor)
  if (fontColors.length) {
    fontStyles.color = `#${fontColors[0]}`
  }
  return fontStyles
}

function getSurroundingColor (width, height, data) {
  const surroundingColorData = new ColorCounter()

  function _collectSurroundingColor (index) {
    index *= 4
    const r = data[index]
    const g = data[index + 1]
    const b = data[index + 2]
    const hex = rgbToHex(r, g, b)
    surroundingColorData.addValue(hex)
  }

  for (let i = 0; i < width - 1; i++) {
    const index = i
    _collectSurroundingColor(index)
  }
  for (let i = 0; i < height - 1; i++) {
    const index = (i + 1) * width - 1
    _collectSurroundingColor(index)
  }
  for (let i = 1; i < height; i++) {
    const index = i * width
    _collectSurroundingColor(index)
  }
  for (let i = 1; i < width; i++) {
    const index = (height - 1) * width + i
    _collectSurroundingColor(index)
  }
  const surroundingColor = surroundingColorData.getFirstValueByCount()
  return surroundingColor
}

function getBlankRowsIndex (width, height, data, surroundingColor) {
  const blankRowsIndex = []
  for (let i = 0; i < height; i++) {
    let colorAberrationExisted = false
    for (let j = 0; j < width; j++) {
      const index = (i * width + j) * 4
      const r = data[index]
      const g = data[index + 1]
      const b = data[index + 2]
      const hex = rgbToHex(r, g, b)
      const colorsStandardVariance = getColorsStandardVariance(
        hex, surroundingColor
      )
      if (colorsStandardVariance > STANDARD_VARIANCE_SURROUNDING_COLOR) {
        colorAberrationExisted = true
        break
      }
    }
    if (!colorAberrationExisted) {
      blankRowsIndex.push(i)
    }
  }
  return blankRowsIndex
}

function getFontColors (data, surroundingColor) {
  const fontColors = []

  function _isSimilarColor (color1, color2) {
    const {r: r1, g: g1, b: b1} = hexToRgb(color1)
    const {r: r2, g: g2, b: b2} = hexToRgb(color2)
    const ratioR = r1 / r2
    const ratioG = g1 / g2
    const ratioB = b1 / b2
    let result = false
    if (
      ratioR / ratioG < RATIO_SIMILAR_COLOR &&
      ratioR / ratioG > 1 / RATIO_SIMILAR_COLOR &&
      ratioR / ratioB < RATIO_SIMILAR_COLOR &&
      ratioR / ratioB > 1 / RATIO_SIMILAR_COLOR &&
      ratioG / ratioB < RATIO_SIMILAR_COLOR &&
      ratioG / ratioB > 1 / RATIO_SIMILAR_COLOR
    ) result = true
    return result
  }

  function _getStrongestContrastColor (...colors) {
    const {r: R} = hexToRgb(surroundingColor)
    let tempRange = 0
    let tempColor = null
    colors.forEach(color => {
      const {r} = hexToRgb(color)
      const range = Math.abs(r - R)
      if (range > tempRange) {
        tempRange = range
        tempColor = color
      }
    })
    return tempColor
  }

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i]
    const g = data[i + 1]
    const b = data[i + 2]
    const hex = rgbToHex(r, g, b)
    const colorsStandardVariance = getColorsStandardVariance(
      hex, surroundingColor
    )
    if (
      colorsStandardVariance < STANDARD_VARIANCE_FONT_COLOR
    ) continue
    if (fontColors.length) {
      let matchingColors = []
      fontColors.forEach(fontColor => {
        if (_isSimilarColor(fontColor, hex)) {
          matchingColors.push(fontColor)
        }
      })
      matchingColors.forEach(fontColor => {
        const strongestContrastColor = _getStrongestContrastColor(
          fontColor, hex
        )
        if (hex === strongestContrastColor) {
          const index = fontColors.findIndex(tempColor => {
            return tempColor === fontColor
          })
          fontColors.splice(index, 1, hex)
        }
      })
    } else {
      fontColors.push(hex)
    }
  }
  return fontColors
}

function processStyles (structure) {
  startProcess('processStyles', _ => console.info(_))
  recursivelyProcessStyles(structure)
  endProcess('processStyles', _ => console.info(_))
}

function recursivelyProcessStyles (structure) {
  structure.forEach(structureItem => {
    const {
      styles, preStyles, children, subStructure
    } = structureItem
    let childrenOrSubStructure
    if (children && children.length) {
      childrenOrSubStructure = children
    } else if (subStructure && subStructure.length) {
      childrenOrSubStructure = subStructure
    }
    const {backgroundColor} = preStyles

    /* Background */
    if (backgroundColor) {
      const backgroundColorGroup = [backgroundColor]
      childrenOrSubStructure.forEach(child => {
        const {preStyles: childPreStyles} = child
        const {backgroundColor: childBackgroundColor} = childPreStyles
        if (
          childBackgroundColor &&
          !backgroundColorGroup.includes(childBackgroundColor)
        ) {
          backgroundColorGroup.push(childBackgroundColor)
        }
      })
      if (backgroundColorGroup.length <= 1) {
        childrenOrSubStructure.forEach(child => {
          const {styles: childStyles} = child
          const {backgroundColor: childBackgroundColor} = childStyles
          if (childBackgroundColor) {
            delete childStyles.backgroundColor
          }
        })
      }
    }

    if (childrenOrSubStructure && childrenOrSubStructure.length) {
      recursivelyProcessStyles(childrenOrSubStructure)
    }
  })
}
