/*!{id:msgpack.js,ver:1.05,license:"MIT",author:"uupaa.js@gmail.com"}*/

// === msgpack ===
// MessagePack -> http://msgpack.sourceforge.net/

this.msgpack || (function(globalScope) {
'use strict';

var msgpack = {
    pack:       msgpackpack,    // msgpack.pack(data:Mix):ArrayBuffer
    unpack:     msgpackunpack,  // msgpack.unpack(data:ArrayBuffer):Mix
    MAX_DEPTH:  512,
};
globalScope.msgpack = msgpack;

var idx        = 0;  // decode buffer[index]

// for WebWorkers Code Block
self.importScripts && (onmessage = function(event) {
    var rv;
    try {
        rv = (event.data.method === "pack") ? msgpackpack(event.data.data)
                                            : msgpackunpack(event.data.data);
        postMessage(rv);
        // TODO transferrable support
    } catch (e) {
        postMessage(e);
    }
});

// msgpack.pack
function msgpackpack(data) {     // @param Mix:
                                 // @return ArrayBuffer:
    return new Uint8Array( encode([], data, 0) ).buffer;
}

// msgpack.unpack
function msgpackunpack(data) { // @param ArrayBuffer:
                               // @return Mix:
    idx = -1;
    return decode(new Uint8Array(data)); // mix or undefined
}

// inner - encoder
function encode(rv,      // @param ByteArray: result
                mix,     // @param Mix: source data
                depth) { // @param Number: depth
    var size, i, iz, c, pos,        // for UTF8.encode, Array.encode, Hash.encode
        high, low, sign, exp, frac, // for IEEE754
        bs = 16384;                 // for .push.apply

    if (mix === null) { // null -> 0xc0 ( nil )
        rv.push(0xc0);
    } else if (mix === undefined) { // undefined -> 0xc1 ( reserved )
        rv.push(0xc1);
    } else if (mix === false) { // false -> 0xc2 ( false )
        rv.push(0xc2);
    } else if (mix === true) {  // true  -> 0xc3 ( true  )
        rv.push(0xc3);
    } else {
        switch (typeof mix) {
        case "number":
            if (isNaN(mix)) { // NaN
                rv.push(0xca, 0x7f, 0xc0, 0x00, 0x00);
            } else if (!isFinite(mix)) { // ±Infinity
                rv.push(0xca, mix > 0 ? 0x7f : 0xff, 0x80, 0x00, 0x00);
            } else if (mix % 1 || mix > 0x1fffffffffffff || mix < -0x1fffffffffffff) { // double
                // THX!! @edvakf
                // http://javascript.g.hatena.ne.jp/edvakf/20101128/1291000731
                sign = mix < 0;
                sign && (mix *= -1);

                // add offset 1023 to ensure positive
                // 0.6931471805599453 = Math.LN2;
                exp  = ((Math.log(mix) / 0.6931471805599453) + 1023) | 0;

                // shift 52 - (exp - 1023) bits to make integer part exactly 53 bits,
                // then throw away trash less than decimal point
                frac = mix * Math.pow(2, 52 + 1023 - exp);

                //  S+-Exp(11)--++-----------------Fraction(52bits)-----------------------+
                //  ||          ||                                                        |
                //  v+----------++--------------------------------------------------------+
                //  00000000|00000000|00000000|00000000|00000000|00000000|00000000|00000000
                //  6      5    55  4        4        3        2        1        8        0
                //  3      6    21  8        0        2        4        6
                //
                //  +----------high(32bits)-----------+ +----------low(32bits)------------+
                //  |                                 | |                                 |
                //  +---------------------------------+ +---------------------------------+
                //  3      2    21  1        8        0
                //  1      4    09  6
                low  = frac & 0xffffffff;
                sign && (exp |= 0x800);
                high = ((frac / 0x100000000) & 0xfffff) | (exp << 20);

                rv.push(0xcb, (high >> 24) & 0xff, (high >> 16) & 0xff,
                              (high >>  8) & 0xff,  high        & 0xff,
                              (low  >> 24) & 0xff, (low  >> 16) & 0xff,
                              (low  >>  8) & 0xff,  low         & 0xff);
            } else { // int or uint
                if (mix >= 0x100000000 || mix < -0x80000000) { // int64
                    high = Math.floor(mix / 0x100000000);
                    low  = mix | 0;
                    rv.push(0xd3, (high >> 24) & 0xff, (high >> 16) & 0xff,
                                  (high >>  8) & 0xff,         high & 0xff,
                                  (low  >> 24) & 0xff, (low  >> 16) & 0xff,
                                  (low  >>  8) & 0xff,          low & 0xff);
                } else if (mix < 0) { // int
                    if (mix >= -32) { // negative fixnum
                        rv.push(0xe0 | (mix & 0x1f));
                    } else if (mix >= -0x80) { // int8
                        rv.push(0xd0, mix & 0xff);
                    } else if (mix >= -0x8000) { // int16
                        rv.push(0xd1, (mix >> 8) & 0xff, mix & 0xff);
                    } else { // int32
                        rv.push(0xd2, (mix >> 24) & 0xff,
                                      (mix >> 16) & 0xff,
                                      (mix >>  8) & 0xff, mix & 0xff);
                    }
                } else { // uint
                    if (mix < 0x80) {
                        rv.push(mix); // positive fixnum
                    } else if (mix < 0x100) { // uint 8
                        rv.push(0xcc, mix);
                    } else if (mix < 0x10000) { // uint 16
                        rv.push(0xcd, mix >> 8, mix & 0xff);
                    } else { // uint 32
                        rv.push(0xce, mix >> 24, (mix >> 16) & 0xff,
                                                 (mix >>  8) & 0xff, mix & 0xff);
                    }
                }
            }
            break;
        case "string":
            // http://d.hatena.ne.jp/uupaa/20101128
            iz = mix.length;
            pos = rv.length; // keep rewrite position
            rv.push(0); // placeholder
            for (i = 0; i < iz; ++i) { // utf8 encode
                c = mix.charCodeAt(i);
                if ( 0xd800 <= c && c < 0xde00 ) {
                    if ( ++i >= iz ) throw new Error( "Malformed string, low surrogate expected at position " + i );
                    c = ( (c ^ 0xd800) << 10 ) | 0x10000 | ( mix.charCodeAt(i) ^ 0xdc00 );
                }
                if (c < 0x80) {
                    rv.push(c & 0x7f);
                } else if (c < 0x0800) {
                    rv.push(((c >>>  6) & 0x1f) | 0xc0, (c & 0x3f) | 0x80);
                } else if (c < 0x10000) {
                    rv.push(((c >>> 12) & 0x0f) | 0xe0,
                            ((c >>>  6) & 0x3f) | 0x80, (c & 0x3f) | 0x80);
                } else {
                    rv.push( (c >>> 18)         | 0xf0,
                            ((c >>> 12) & 0x3f) | 0x80,
                            ((c >>>  6) & 0x3f) | 0x80, (c & 0x3f) | 0x80);
                }
            }
            size = rv.length - pos - 1;

            if (size < 32) {
                rv[pos] = 0xa0 + size; // rewrite
            } else if (size < 0x100) { // 8
                rv.splice(pos, 1, 0xd9, size);
            } else if (size < 0x10000) { // 16
                rv.splice(pos, 1, 0xda, size >> 8, size & 0xff);
            } else if (size < 0x100000000) { // 32
                rv.splice(pos, 1, 0xdb,
                          size >>> 24, (size >> 16) & 0xff,
                                       (size >>  8) & 0xff, size & 0xff);
            }
            break;
        default: // array, hash, or ArrayBuffer
            if (mix instanceof ArrayBuffer) {
                mix = new Uint8Array(mix);
                size = mix.byteLength;
                if (size < 0x100) { // 8
                    rv.push(0xc4, size);
                } else if (size < 0x10000) { // 16
                    rv.push(0xc5, size >> 8, size & 0xff);
                } else if (size < 0x100000000) { // 32
                    rv.push(0xc6, size >>> 24, (size >> 16) & 0xff,
                            (size >>  8) & 0xff, size & 0xff);
                }
                for (i = 0; i < size; i += bs) {
                    rv.push.apply( rv, mix.slice(i, i+bs < size ? i+bs : size) );
                }
                break;
            }
            if (++depth >= msgpack.MAX_DEPTH) {
                throw new Error("Maximum recursion depth is reached");
            }
            if (mix instanceof Array) {
                size = mix.length;
                if (size < 16) {
                    rv.push(0x90 + size);
                } else if (size < 0x10000) { // 16
                    rv.push(0xdc, size >> 8, size & 0xff);
                } else if (size < 0x100000000) { // 32
                    rv.push(0xdd, size >>> 24, (size >> 16) & 0xff,
                                               (size >>  8) & 0xff, size & 0xff);
                }
                for (i = 0; i < size; ++i) {
                    encode(rv, mix[i], depth);
                }
            } else { // hash
                // http://d.hatena.ne.jp/uupaa/20101129
                pos = rv.length; // keep rewrite position
                rv.push(0); // placeholder
                size = 0;
                for (i in mix) {
                    ++size;
                    encode(rv, i,      depth);
                    encode(rv, mix[i], depth);
                }
                if (size < 16) {
                    rv[pos] = 0x80 + size; // rewrite
                } else if (size < 0x10000) { // 16
                    rv.splice(pos, 1, 0xde, size >> 8, size & 0xff);
                } else if (size < 0x100000000) { // 32
                    rv.splice(pos, 1, 0xdf,
                              size >>> 24, (size >> 16) & 0xff,
                                           (size >>  8) & 0xff, size & 0xff);
                }
            }
        }
    }
    return rv;
}

// inner - decoder
function decode(buf) { // @return Mix:
    var size, i, iz, c, num = 0, str = '', bs = 16384,
        sign, exp, frac, ary, hash,
        type = buf[++idx];

    if (type >= 0xe0) {             // Negative FixNum (111x xxxx) (-32 ~ -1)
        return type - 0x100;
    }
    if (type < 0xc0) {
        if (type < 0x80) {          // Positive FixNum (0xxx xxxx) (0 ~ 127)
            return type;
        }
        if (type < 0x90) {          // FixMap (1000 xxxx)
            num  = type - 0x80;
            type = 0x80;
        } else if (type < 0xa0) {   // FixArray (1001 xxxx)
            num  = type - 0x90;
            type = 0x90;
        } else { // if (type < 0xc0) {   // FixRaw (101x xxxx)
            num  = type - 0xa0;
            type = 0xa0;
        }
    }
    switch (type) {
    case 0xc0:  return null;
    case 0xc1:  return undefined;
    case 0xc2:  return false;
    case 0xc3:  return true;
    case 0xca:  // float
                num = buf[++idx] * 0x1000000 + (buf[++idx] << 16) +
                                                (buf[++idx] <<  8) + buf[++idx];
                sign =  num & 0x80000000;    //  1bit
                exp  = (num >> 23) & 0xff;   //  8bits
                frac =  num & 0x7fffff;      // 23bits
                if (!num || num === 0x80000000) { // 0.0 or -0.0
                    return 0;
                }
                if (exp === 0xff) { // NaN or Infinity
                    return frac ? NaN : Infinity;
                }
                return (sign ? -1 : 1) *
                            (frac | 0x800000) * Math.pow(2, exp - 127 - 23); // 127: bias
    case 0xcb:  // double
                num = buf[++idx] * 0x1000000 + (buf[++idx] << 16) +
                                                (buf[++idx] <<  8) + buf[++idx];
                sign =  num & 0x80000000;    //  1bit
                exp  = (num >> 20) & 0x7ff;  // 11bits
                frac =  num & 0xfffff;       // 52bits - 32bits (high word)
                if (!num || num === 0x80000000) { // 0.0 or -0.0
                    idx += 4;
                    return 0;
                }
                if (exp === 0x7ff) { // NaN or Infinity
                    idx += 4;
                    return frac ? NaN : Infinity;
                }
                num = buf[++idx] * 0x1000000 + (buf[++idx] << 16) +
                                                (buf[++idx] <<  8) + buf[++idx];
                return (sign ? -1 : 1) *
                            ((frac | 0x100000) * Math.pow(2, exp - 1023 - 20) // 1023: bias
                             + num * Math.pow(2, exp - 1023 - 52));
    // 0xcf: uint64, 0xce: uint32, 0xcd: uint16
    case 0xcf:  num =  buf[++idx] * 0x1000000 + (buf[++idx] << 16) +
                                                 (buf[++idx] <<  8) + buf[++idx];
                return num * 0x100000000 +
                       buf[++idx] * 0x1000000 + (buf[++idx] << 16) +
                                                 (buf[++idx] <<  8) + buf[++idx];
    case 0xce:  num += buf[++idx] * 0x1000000 + (buf[++idx] << 16);
    case 0xcd:  num += buf[++idx] << 8;
    case 0xcc:  return num + buf[++idx];
    // 0xd3: int64, 0xd2: int32, 0xd1: int16, 0xd0: int8
    case 0xd3:  num = buf[++idx];
                if (num & 0x80) { // sign -> avoid overflow
                    return ((num        ^ 0xff) * 0x100000000000000 +
                            (buf[++idx] ^ 0xff) *   0x1000000000000 +
                            (buf[++idx] ^ 0xff) *     0x10000000000 +
                            (buf[++idx] ^ 0xff) *       0x100000000 +
                            (buf[++idx] ^ 0xff) *         0x1000000 +
                            (buf[++idx] ^ 0xff) *           0x10000 +
                            (buf[++idx] ^ 0xff) *             0x100 +
                            (buf[++idx] ^ 0xff) + 1) * -1;
                }
                return num        * 0x100000000000000 +
                       buf[++idx] *   0x1000000000000 +
                       buf[++idx] *     0x10000000000 +
                       buf[++idx] *       0x100000000 +
                       buf[++idx] *         0x1000000 +
                       buf[++idx] *           0x10000 +
                       buf[++idx] *             0x100 +
                       buf[++idx];
    case 0xd2:  num  =  buf[++idx] * 0x1000000 + (buf[++idx] << 16) +
                       (buf[++idx] << 8) + buf[++idx];
                return num < 0x80000000 ? num : num - 0x100000000; // 0x80000000 * 2
    case 0xd1:  num  = (buf[++idx] << 8) + buf[++idx];
                return num < 0x8000 ? num : num - 0x10000; // 0x8000 * 2
    case 0xd0:  num  =  buf[++idx];
                return num < 0x80 ? num : num - 0x100; // 0x80 * 2
    // 0xdb: str32, 0xda: str16, 0xd9: str8, 0xa0: fixstr
    case 0xdb:  num += buf[++idx] * 0x1000000 + (buf[++idx] << 16);
    case 0xda:  num += buf[++idx] << 8;
    case 0xd9:  num += buf[++idx];
    case 0xa0:  for (ary = [], i = idx, iz = i + num; i < iz; ) { // utf8 decode
                    c = buf[++i]; // lead byte
                    if (c < 0x80) { // ASCII
                        ary.push(c);
                    } else if (c >= 0xc0 && c < 0xe0 && i < iz) { // 2-byte sequence
                        ary.push((c & 0x1f) << 6 | (buf[++i] & 0x3f));
                    } else if (c >= 0xe0 && c < 0xf0 && i+1 < iz) { // 3-byte sequence
                        ary.push((c & 0xf) << 12 | (buf[++i] & 0x3f) << 6
                                                 | (buf[++i] & 0x3f));
                    } else if (c >= 0xf0 && c < 0xf8 && i+2 < iz) { // 4-byte sequence
                        c =        (c & 7) << 18 | (buf[++i] & 0x3f) << 12
                                                 | (buf[++i] & 0x3f) << 6
                                                 | (buf[++i] & 0x3f);
                        if (c < 0x10000) { // ordinary codepoint
                            ary.push(c);
                        } else { // surrogate pair
                            c ^= 0x10000;
                            ary.push((c >>>  10) | 0xd800,
                                     (c & 0x3ff) | 0xdc00);
                        }
                    } else {
                        throw new Error("Malformed UTF8 character at position " + i);
                    }
                }
                idx = i;
                for (str = '', i = 0, iz = ary.length; i < iz; i += bs) {
                    str += String.fromCharCode.apply( null, ary.slice(i, i+bs < iz ? i+bs : iz) );
                }
                return str;
    // 0xc6: bin32, 0xc5: bin16, 0xc4: bin8
    case 0xc6:  num += buf[++idx] * 0x1000000 + (buf[++idx] << 16);
    case 0xc5:  num += buf[++idx] << 8;
    case 0xc4:  num += buf[++idx];
                var end = ++idx + num
                var ret = buf.slice(idx, end);
                idx += num;
                return ret.buffer;
    // 0xdf: map32, 0xde: map16, 0x80: map
    case 0xdf:  num +=  buf[++idx] * 0x1000000 + (buf[++idx] << 16);
    case 0xde:  num += (buf[++idx] << 8)       +  buf[++idx];
    case 0x80:  hash = {};
                while (num--) {
                    hash[decode(buf)] = decode(buf);
                }
                return hash;
    // 0xdd: array32, 0xdc: array16, 0x90: array
    case 0xdd:  num +=  buf[++idx] * 0x1000000 + (buf[++idx] << 16);
    case 0xdc:  num += (buf[++idx] << 8)       +  buf[++idx];
    case 0x90:  ary = [];
                while (num--) {
                    ary.push(decode(buf));
                }
                return ary;
    }
    return;
}

})(this);
