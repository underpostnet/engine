const s4 = () => (((1 + Math.random()) * 0x10000) | 0).toString(16).substring(1);

const range = (start, end) => {
  return Array.apply(0, Array(end - start + 1)).map((element, index) => index + start);
};

const getId = (arr, suffix = '', keyId = 'id') => {
  if (!Array.isArray(arr) && typeof arr === 'object')
    arr = Object.keys(arr).map((id) => {
      const idElement = {};
      idElement[keyId] = id;
      return idElement;
    });
  let _id;
  while (arr.find((element) => element[keyId] === _id) || !_id)
    _id = suffix + (s4() + s4() + s4() + s4() + s4()).slice(1);
  return _id;
};

const random = (min, max) => Math.floor(Math.random() * (max - min + 1) + min); // The maximum is inclusive and the minimum is inclusive

const randomHexColor = () => '#' + ((Math.random() * 0xffffff) << 0).toString(16).padStart(6, '0');

const getRawCsvFromArray = (array) =>
  array[0]
    ? Object.keys(array[0]).join(';') +
      '\r\n' +
      array
        .map((x) => {
          return (
            Object.keys(x)
              .map((attr) => x[attr])
              .join(';') + '\r\n'
          );
        })
        .join('')
    : '';

const newInstance = (obj) => JSON.parse(JSON.stringify(obj));

const cap = (str) =>
  str
    .toLowerCase()
    .split(' ')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');

const capFirst = (str) => str.charAt(0).toUpperCase() + str.slice(1);

const uniqueArray = (arr) => arr.filter((item, pos) => arr.indexOf(item) == pos);

const orderArrayFromAttrInt = (arr, attr, type) =>
  // type -> true asc
  // type -> false desc
  type === 'asc' ? arr.sort((a, b) => a[attr] - b[attr]) : arr.sort((a, b) => b[attr] - a[attr]);

const getRandomPoint = (suffix, pointsArray) => {
  const point = pointsArray[random(0, pointsArray.length - 1)];
  const returnPoint = {};
  returnPoint['x' + suffix] = point[0];
  returnPoint['y' + suffix] = point[1];
  return returnPoint;
};

const getYouTubeID = (url) => {
  const p =
    /^(?:https?:\/\/)?(?:m\.|www\.)?(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))((\w|-){11})(?:\S+)?$/;
  if (url.match(p)) return url.match(p)[1];
  return false;
};

const timer = (ms) => new Promise((res) => setTimeout(res, ms));

const reOrderIntArray = (array) => {
  /* shuffle */
  let currentIndex = array.length,
    randomIndex;

  // While there remain elements to shuffle.
  while (currentIndex != 0) {
    // Pick a remaining element.
    randomIndex = Math.floor(Math.random() * currentIndex);
    currentIndex--;

    // And swap it with the current element.
    [array[currentIndex], array[randomIndex]] = [array[randomIndex], array[currentIndex]];
  }

  return array;
};

const orderAbc = (arr, attr) =>
  arr.sort((a, b) => {
    if (attr) {
      if (a[attr] < b[attr]) {
        return -1;
      }
      if (a[attr] > b[attr]) {
        return 1;
      }
    } else {
      if (a < b) {
        return -1;
      }
      if (a > b) {
        return 1;
      }
    }
    return 0;
  });

const JSONmatrix = (matrix) => {
  if (Array.isArray(matrix))
    return `[\r\n${matrix
      .map((x, i) => `   ` + JSON.stringify(x) + (i === matrix.length - 1 ? '' : ',') + '\r\n')
      .join('')}]`;
  else
    return `[\r\n${Object.keys(matrix)
      .map((x, i) => `   ` + JSON.stringify(Object.values(matrix[x])) + (i === matrix.length - 1 ? '' : ',') + '\r\n')
      .join('')}]`;
};

const getDistance = (x1, y1, x2, y2) => {
  const disX = Math.abs(x2 - x1);
  const disY = Math.abs(y2 - y1);
  return Math.sqrt(disX * disX + disY * disY);
};

/**
 * Decimal setting of a number.
 *
 * @param {String} type The type of setting.
 * @param {Number} value The number.
 * @param {Integer} exp The exponent (the log 10 of the base fit).
 * @returns {Number} The adjusted value.
 */
const decimalAdjust = (type, value, exp) => {
  if (typeof exp === 'undefined' || +exp === 0) {
    return Math[type](value);
  }
  value = +value;
  exp = +exp;

  if (isNaN(value) || !(typeof exp === 'number' && exp % 1 === 0)) {
    return NaN;
  }
  // Shift
  value = value.toString().split('e');
  value = Math[type](+(value[0] + 'e' + (value[1] ? +value[1] - exp : -exp)));
  // Shift back
  value = value.toString().split('e');
  return +(value[0] + 'e' + (value[1] ? +value[1] + exp : exp));

  // https://developer.mozilla.org/es/docs/Web/JavaScript/Reference/Global_Objects/Math/round
};

const floatFixed = (v, d) => parseFloat(v).toFixed(d);

// Decimal round

const round10 = (value, exp) => {
  return decimalAdjust('round', value, exp);
};

// Decimal floor

const floor10 = (value, exp) => {
  return decimalAdjust('floor', value, exp);
};

// Decimal ceil

const ceil10 = (value, exp) => {
  return decimalAdjust('ceil', value, exp);
};

// // Round
// round10(55.55, -1);   // 55.6
// round10(55.549, -1);  // 55.5
// round10(55, 1);       // 60
// round10(54.9, 1);     // 50
// round10(-55.55, -1);  // -55.5
// round10(-55.551, -1); // -55.6
// round10(-55, 1);      // -50
// round10(-55.1, 1);    // -60
// round10(1.005, -2);   // 1.01 -- compare this with round(1.005*100)/100 above
// // Floor
// floor10(55.59, -1);   // 55.5
// floor10(59, 1);       // 50
// floor10(-55.51, -1);  // -55.6
// floor10(-51, 1);      // -60
// // Ceil
// ceil10(55.51, -1);    // 55.6
// ceil10(51, 1);        // 60
// ceil10(-55.59, -1);   // -55.5
// ceil10(-59, 1);       // -50

function objectEquals(x, y) {
  // TODO:
  // https://www.npmjs.com/package/deep-equal
  // https://www.npmjs.com/package/fast-deep-equal
  const ok = Object.keys,
    tx = typeof x,
    ty = typeof y;
  return x && y && tx === 'object' && tx === ty
    ? ok(x).length === ok(y).length && ok(x).every((key) => objectEquals(x[key], y[key]))
    : x === y;
}

function insertTransitionCoordinates(coordinates, transitionFactor) {
  // Create a new array to store the resulting coordinates
  const coordinatesWithTransition = [];

  // Iterate over the coordinates array
  for (let i = 0; i < coordinates.length - 1; i++) {
    const [x1, y1] = coordinates[i];
    const [x2, y2] = coordinates[i + 1];

    // Add the initial integer coordinate to the new array
    coordinatesWithTransition.push([x1, y1]);

    // Calculate the increments for each coordinate
    const incrementX = (x2 - x1) / transitionFactor;
    const incrementY = (y2 - y1) / transitionFactor;

    // Add the intermediate coordinates
    for (let j = 1; j <= transitionFactor - 1; j++) {
      const xIntermediate = x1 + incrementX * j;
      const yIntermediate = y1 + incrementY * j;
      coordinatesWithTransition.push([xIntermediate, yIntermediate]);
    }
  }

  // Add the last integer coordinate to the new array
  coordinatesWithTransition.push(coordinates[coordinates.length - 1]);

  // Now, coordinatesWithTransition contains the coordinates with transition
  return coordinatesWithTransition;
}

const getIsoDate = (date) => date.toISOString().slice(0, -5).replace('T', ' ');

const clearTerminalStringColor = (str) => str.replace(/\x1b\[[0-9;]*m/g, '');

const getIdModule = (meta) => meta.url.split(`/`).pop();

function getValueFromJoinString(obj, path, join = '.') {
  // Split the path string into an array of attribute names
  const attributes = path.split(join);

  // Iterate through the attributes to access the desired value
  let value = obj;
  for (let i = 0; i < attributes.length; i++) {
    value = value[attributes[i]];

    // Check if the value is null or undefined at each step
    if (value === null || value === undefined) {
      // If the value is null or undefined, stop the iteration
      break;
    }
  }

  return value;
}

const endpointFactory = (meta) => {
  const data = meta.url.split('/');
  let path = `/${data[data.length - 2]}`;
  // try {
  //   if (location) {
  //     path = location.pathname.split('/');
  //     path.pop();
  //     path = path.pop();
  //   }
  // } catch (error) {}
  if (path === '/') path = '';
  return path;
};

function getDirection(x1, y1, x2, y2) {
  // Calculate the angle in radians
  const angle = Math.atan2(y2 - y1, x2 - x1);

  // Convert the angle to degrees
  let degrees = angle * (180 / Math.PI);

  // Adjust the angle to be positive
  if (degrees < 0) {
    degrees += 360;
  }

  // Map the angle to one of the eight directions
  let direction;
  if (degrees >= 337.5 || degrees < 22.5) {
    // direction = 'right';
    // direction = 'East';
    direction = 'e';
  } else if (degrees >= 22.5 && degrees < 67.5) {
    // direction = 'up-right';
    // direction = 'South East';
    direction = 'se';
  } else if (degrees >= 67.5 && degrees < 112.5) {
    // direction = 'up';
    // direction = 'South';
    direction = 's';
  } else if (degrees >= 112.5 && degrees < 157.5) {
    // direction = 'up-left';
    // direction = 'South West';
    direction = 'sw';
  } else if (degrees >= 157.5 && degrees < 202.5) {
    // direction = 'left';
    // direction = 'West';
    direction = 'w';
  } else if (degrees >= 202.5 && degrees < 247.5) {
    // direction = 'down-left';
    // direction = 'North West';
    direction = 'nw';
  } else if (degrees >= 247.5 && degrees < 292.5) {
    // direction = 'down';
    // direction = 'North';
    direction = 'n';
  } else if (degrees >= 292.5 && degrees < 337.5) {
    // direction = 'down-right';
    // direction = 'North East';
    direction = 'ne';
  }

  return direction;
}

// Function to amplify a matrix in horizontal and vertical directions
const amplifyMatrix = (matrix, factor) => {
  // Get the original dimensions of the matrix
  const rows = matrix.length;
  const cols = matrix[0].length;

  // Create a new amplified matrix filled with zeros
  const amplifiedMatrix = Array.from({ length: rows * factor }, () => Array(cols * factor).fill(0));

  // Iterate over the original matrix
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      // Get the current value in the original matrix
      const originalValue = matrix[i][j];

      // Amplify in horizontal and vertical directions
      for (let x = 0; x < factor; x++) {
        for (let y = 0; y < factor; y++) {
          // Assign the amplified value to the new matrix
          amplifiedMatrix[i * factor + x][j * factor + y] = originalValue;
        }
      }
    }
  }

  return amplifiedMatrix;
};

const mergeMatrices = (input) => {
  const rows = Object.keys(input).reduce((acc, key) => {
    const rowData = Object.keys(input[key]).reduce((rowAcc, subKey) => {
      const subArray = input[key][subKey];
      const rowIndex = parseInt(key, 10) * subArray.length;
      subArray.forEach((subRow, subRowIndex) => {
        const fullRowIndex = rowIndex + subRowIndex;
        if (!rowAcc[fullRowIndex]) {
          rowAcc[fullRowIndex] = [];
        }
        rowAcc[fullRowIndex] = rowAcc[fullRowIndex].concat(subRow);
      });
      return rowAcc;
    }, []);
    acc = acc.concat(rowData);
    return acc;
  }, []);

  // Remove empty rows
  const nonEmptyRows = rows.filter((row) => row.some((cell) => cell !== undefined));

  // Remove empty columns
  const transpose = nonEmptyRows[0].map((col, i) => nonEmptyRows.map((row) => row[i]));
  const nonEmptyColumns = transpose.filter((col) => col.some((cell) => cell !== undefined));

  // Transpose back to rows
  const result = nonEmptyColumns[0].map((row, i) => nonEmptyColumns.map((col) => col[i]));

  return result;
};

const validationRules = {
  emptyField: (value) => !!value.trim(),
  validEmail: (value) => /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/.test(value),
  passwordMismatch: (value, password) => !(value !== password),
  validPhoneNumber: (value) => /^\d{10}$/.test(value),
  validDate: (value) => /^\d{4}-\d{2}-\d{2}$/.test(value),
  customValidator: (value) => false,
};

export {
  s4,
  range,
  random,
  newInstance,
  cap,
  uniqueArray,
  orderArrayFromAttrInt,
  getYouTubeID,
  timer,
  getRawCsvFromArray,
  reOrderIntArray,
  capFirst,
  orderAbc,
  getDistance,
  decimalAdjust,
  round10,
  floor10,
  ceil10,
  JSONmatrix,
  getRandomPoint,
  objectEquals,
  floatFixed,
  getId,
  insertTransitionCoordinates,
  randomHexColor,
  getIdModule,
  clearTerminalStringColor,
  getIsoDate,
  getValueFromJoinString,
  endpointFactory,
  getDirection,
  amplifyMatrix,
  mergeMatrices,
  validationRules,
};
