const LENGTH_UNIT = /(em|ex|ch|rem|vw|vh|vmin|vmax|cm|mm|q|in|pt|pc|px|dpi|dpcm|dppx|%|auto)$/i
const CALC = /^(calc\()/i
const VAR = /^(var\()/i
const BORDER_STYLE = /^(dashed|dotted|double|groove|hidden|inset|none|outset|ridge|solid)$/i
const BORDER_WIDTH = /^(thick|medium|think)$/i
const PURE_NUMBER = /^\d+$/

function splitShorthand(value) {
  let values = ['']
  let openParensCount = 0

  const trimmedValue = value.trim()

  for (let index = 0; index < trimmedValue.length; index += 1) {
    if (trimmedValue.charAt(index) === ' ' && openParensCount === 0) {
      // Add new value
      values.push('')
    } else {
      // Add the current character to the current value
      values[values.length - 1] =
        values[values.length - 1] + trimmedValue.charAt(index)
    }

    // Keep track of the number of parentheses that are yet to be closed.
    // This is done to avoid splitting at whitespaces within CSS functions.
    // E.g.: `calc(1px + 1em)`
    if (trimmedValue.charAt(index) === '(') {
      openParensCount++
    } else if (trimmedValue.charAt(index) === ')') {
      openParensCount--
    }
  }

  return values
}

function parseBorder(value, resolve) {
  const values = splitShorthand(value)
  const longhands = {}

  values.forEach(val => {
    if (val.match(BORDER_STYLE) !== null) {
      longhands[resolve('Style')] = val
    } else if (
      val.match(BORDER_WIDTH) !== null ||
      val.match(LENGTH_UNIT) !== null ||
      val.match(CALC) !== null ||
      val === '0'
    ) {
      longhands[resolve('Width')] = val
    } else {
      longhands[resolve('Color')] = val
    }
  })

  return longhands
}

function parseCircular(value, resolve) {
  const [Top, Right = Top, Bottom = Top, Left = Right] = splitShorthand(value)

  return {
    [resolve('Top')]: Top,
    [resolve('Right')]: Right,
    [resolve('Bottom')]: Bottom,
    [resolve('Left')]: Left,
  }
}

function groupBy(values, divider) {
  const groups = [[]];

  values.forEach(val => {
    if (val === divider) {
      groups.push([]);
    } else {
      groups[groups.length - 1].push(val);
    }
  });

  return groups;
}

function parseBorderRadius(value) {
  const [first = [], second = []] = groupBy(splitShorthand(value), '/')
  const [Top, Right = Top, Bottom = Top, Left = Right] = first
  const [Top2, Right2 = Top2, Bottom2 = Top2, Left2 = Right2] = second

  return {
    borderTopLeftRadius: [Top, Top2].filter(Boolean).join(' '),
    borderTopRightRadius: [Right, Right2].filter(Boolean).join(' '),
    borderBottomRightRadius: [Bottom, Bottom2].filter(Boolean).join(' '),
    borderBottomLeftRadius: [Left, Left2].filter(Boolean).join(' '),
  }
}

function parseTextDecoration(value) {
  // https://www.w3.org/TR/css-text-decor-3/#text-decoration-property
  const values = splitShorthand(value)

  if (values.length === 1) {
    // A text-decoration declaration that omits both the text-decoration-color and text-decoration-style
    // values is backwards-compatible with CSS Levels 1 and 2.

    if (values[0] === 'initial') {
      return {
        textDecorationLine: 'none'
      }
    }
    return {
      textDecorationLine: values[0]
    }
  }

  // There is more than 1 value specfied, which indicates it is CSS Level 3.
  const longhands = {};

  longhands.textDecorationLine = values[0];
  longhands.textDecorationStyle = values[1] || 'solid';
  longhands.textDecorationColor = values[2] || 'currentColor';

  return longhands
}

var circularExpand = {
  borderWidth: key => 'border' + key + 'Width',
  borderColor: key => 'border' + key + 'Color',
  borderStyle: key => 'border' + key + 'Style',
  padding: key => 'padding' + key,
  margin: key => 'margin' + key,
}

var borderExpand = {
  borderLeft: key => 'borderLeft' + key,
  borderTop: key => 'borderTop' + key,
  borderRight: key => 'borderRight' + key,
  borderBottom: key => 'borderBottom' + key,
  outline: key => 'outline' + key,
}

function parseFlex(value) {
  let values = [''];

  // https://developer.mozilla.org/en-US/docs/Web/CSS/flex#values
  switch (value.trim()) {
    case 'initial':
      // "flex: initial" is equivalent to "flex: 0 1 auto"
      values = splitShorthand('0 1 auto');
      break;

    case 'auto':
      // "flex: auto" is equivalent to "flex: 1 1 auto"
      values = splitShorthand('1 1 auto');
      break;

    case 'none':
      // "flex: none" is equivalent to "flex: 0 0 auto"
      values = splitShorthand('0 0 auto');
      break;

    default:
      values = splitShorthand(value);
      break;
  }

  // https://developer.mozilla.org/en-US/docs/Web/CSS/flex#syntax
  // https://www.w3.org/TR/css-flexbox-1/

  // Expand one-value syntax to three-value syntax
  if (values.length === 1) {
    // One-value syntax
    const val = values[0]
    if (
      val.match(PURE_NUMBER) !== null
    ) {
      values = splitShorthand(val + ' 1 0');
    } else {
      // It is a width value
      values = splitShorthand('1 1 ' + val);
    }
  }

  const longhands = {}

  if (values.length === 2) {
    // Two-value syntax
    longhands.flexGrow = values[0];

    if (
      values[1].match(PURE_NUMBER) !== null
    ) {
      // The second value appears to be a shrink factor
      longhands.flexShrink = values[1];
    } else {
      // The second value appears to be width
      longhands.flexBasis = values[1];
    }
  } else {
    // Three-value syntax
    longhands.flexGrow = values[0];
    longhands.flexShrink = values[1];
    longhands.flexBasis = values[2];
  }

  // According to the spec: Authors are encouraged to control flexibility using the flex shorthand rather than with its longhand
  // properties directly, as the shorthand correctly resets any unspecified components to accommodate common uses.
  //
  // Thus in order to maintain the correct behavior, we have to reset any unspecified longhand properties to their default values.

  // Add default value, initialized value is "0 1 auto"
  if (typeof longhands.flexGrow === 'undefined') {
    longhands.flexGrow = '0';
  }
  if (typeof longhands.flexShrink === 'undefined') {
    longhands.flexShrink = '1';
  }
  if (typeof longhands.flexBasis === 'undefined') {
    longhands.flexBasis = 'auto';
  }

  return longhands
}

function parseOverflow(value) {
  // https://www.w3.org/TR/css-overflow-3/#overflow-properties
  const values = splitShorthand(value)

  // The overflow property is a shorthand property that sets the specified values of overflow-x
  // and overflow-y in that order. If the second value is omitted, it is copied from the first.
  if (values.length === 1) {
    return { overflowX: values[0], overflowY: values[0] }
  }

  return { overflowX: values[0], overflowY: values[1] }
}

function parseGap(value) {
  // https://w3c.github.io/csswg-drafts/css-align/#gap-shorthand
  const [rowGap, columnGap = rowGap] = splitShorthand(value)
  // This property is a shorthand that sets row-gap and column-gap in one declaration. If <'column-gap'> is omitted, it’s set to the same value as <'row-gap'>.
  return {
    rowGap,
    columnGap
  }
}

function expandProperty(property, value) {
  // special expansion for the border property as its 2 levels deep
  if (property === 'border') {
    const longhands = parseBorder(value.toString(), key => 'border' + key)

    var result = {}
    for (let property in longhands) {
      Object.assign(result, expandProperty(property, longhands[property]))
    }

    return result
  }

  if (property === 'flex') {
    return parseFlex(value.toString())
  }

  if (property === 'borderRadius') {
    return parseBorderRadius(value.toString())
  }


  if (property === 'textDecoration') {
    return parseTextDecoration(value.toString())
  }
  
  if (property === 'overflow') {
    return parseOverflow(value.toString())
  }

  if (property === 'gap') {
    return parseGap(value.toString())
  }

  if (circularExpand[property]) {
    return parseCircular(value.toString(), circularExpand[property])
  }

  if (borderExpand[property]) {
    return parseBorder(value.toString(), borderExpand[property])
  }
}

export default function preExpand(property, value) {
  if (Array.isArray(value)) {
    const result = {}

    value.forEach(item => {
      const itemResult = expandProperty(property, item)

      if (itemResult) {
        Object.keys(itemResult).forEach(itemProperty => {
          result[itemProperty] = result[itemProperty] || []
          result[itemProperty].push(itemResult[itemProperty])
        })
      }
    })

    if (Object.keys(result).length) {
      return result
    }

    return null
  }

  return expandProperty(property, value)
}
