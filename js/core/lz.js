// LZ 압축(UTF-16 문자열용) — lz-string 알고리즘을 간결하게 옮긴 것 (MIT, pieroxy)
// 세이브 JSON을 3~6배 줄여서 브라우저 저장 공간을 아껴요
const f = String.fromCharCode;

function _compress(uncompressed, bitsPerChar, getCharFromInt) {
  if (uncompressed == null) return '';
  let i, value;
  const dict = new Map();
  const dictToCreate = new Set();
  let c = '', wc = '', w = '';
  let enlargeIn = 2, dictSize = 3, numBits = 2;
  const data = [];
  let dataVal = 0, dataPos = 0;
  const writeBit = (bit) => {
    dataVal = (dataVal << 1) | bit;
    if (dataPos === bitsPerChar - 1) { dataPos = 0; data.push(getCharFromInt(dataVal)); dataVal = 0; } else dataPos++;
  };
  const writeBits = (n, v) => { for (let k = 0; k < n; k++) { writeBit(v & 1); v >>= 1; } };
  const emitW = () => {
    if (dictToCreate.has(w)) {
      const code = w.charCodeAt(0);
      if (code < 256) { writeBits(numBits, 0); writeBits(8, code); } else { writeBits(numBits, 1); writeBits(16, code); }
      enlargeIn--;
      if (enlargeIn === 0) { enlargeIn = 2 ** numBits; numBits++; }
      dictToCreate.delete(w);
    } else {
      writeBits(numBits, dict.get(w));
    }
    enlargeIn--;
    if (enlargeIn === 0) { enlargeIn = 2 ** numBits; numBits++; }
  };
  for (let ii = 0; ii < uncompressed.length; ii++) {
    c = uncompressed.charAt(ii);
    if (!dict.has(c)) { dict.set(c, dictSize++); dictToCreate.add(c); }
    wc = w + c;
    if (dict.has(wc)) w = wc;
    else {
      emitW();
      dict.set(wc, dictSize++);
      w = String(c);
    }
  }
  if (w !== '') emitW();
  // 끝 표시
  writeBits(numBits, 2);
  while (true) {
    dataVal <<= 1;
    if (dataPos === bitsPerChar - 1) { data.push(getCharFromInt(dataVal)); break; } else dataPos++;
  }
  return data.join('');
}

function _decompress(length, resetValue, getNextValue) {
  const dictionary = [0, 1, 2];
  let enlargeIn = 4, dictSize = 4, numBits = 3;
  let entry = '', w, c;
  const result = [];
  const data = { val: getNextValue(0), position: resetValue, index: 1 };
  const readBits = (n) => {
    let bits = 0, maxpower = 2 ** n, power = 1;
    while (power !== maxpower) {
      const resb = data.val & data.position;
      data.position >>= 1;
      if (data.position === 0) { data.position = resetValue; data.val = getNextValue(data.index++); }
      bits |= (resb > 0 ? 1 : 0) * power;
      power <<= 1;
    }
    return bits;
  };
  const next = readBits(2);
  switch (next) {
    case 0: c = f(readBits(8)); break;
    case 1: c = f(readBits(16)); break;
    case 2: return '';
    default: return null;
  }
  dictionary[3] = c;
  w = c;
  result.push(c);
  while (true) {
    if (data.index > length) return '';
    let cc = readBits(numBits);
    switch (cc) {
      case 0: dictionary[dictSize++] = f(readBits(8)); cc = dictSize - 1; enlargeIn--; break;
      case 1: dictionary[dictSize++] = f(readBits(16)); cc = dictSize - 1; enlargeIn--; break;
      case 2: return result.join('');
      default: break;
    }
    if (enlargeIn === 0) { enlargeIn = 2 ** numBits; numBits++; }
    if (dictionary[cc]) entry = dictionary[cc];
    else if (cc === dictSize) entry = w + w.charAt(0);
    else return null;
    result.push(entry);
    dictionary[dictSize++] = w + entry.charAt(0);
    enlargeIn--;
    w = entry;
    if (enlargeIn === 0) { enlargeIn = 2 ** numBits; numBits++; }
  }
}

export function compressToUTF16(input) {
  if (input == null) return '';
  return _compress(input, 15, (a) => f(a + 32)) + ' ';
}
export function decompressFromUTF16(compressed) {
  if (compressed == null) return '';
  if (compressed === '') return null;
  return _decompress(compressed.length, 16384, (index) => compressed.charCodeAt(index) - 32);
}
