[MessagePack](http://msgpack.org/)
==================================

Space-efficient binary serialization format.

Quick start
===========

```js
// Got ArrayBuffer object
var packed = msgpack.pack( { the: { very: [ "long", true, "data" ], "structure" },
                             depth: "is", such: [ NaN, Inifinity ],
                             wow: new ArrayBuffer(100), is: 100 } );

// Got the original "such much" data structure
var data = msgpack.unpack(packed);
```

Options
=======

* `msgpack.MAX_DEPTH = 512` - adjust maximum allowable data depth

