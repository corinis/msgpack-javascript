[MessagePack](http://msgpack.org/) with key extension
=====================================================

Space-efficient binary serialization format.

This includes an extension to remove xtra space for duplicate keys:

<table>
  <tr><th>format name</th><th>first byte (in binary)</th><th>first byte (in hex)</th></th></tr>
  <tr><td>fixext 1</td><td>11010100</td><td>0xd4</td></tr>
  <tr><td>fixext 2</td><td>11010101</td><td>0xd5</td></tr>
</table>

where:

    Y: 1-512 unit id of a map space
    key: the string to save in that map space
    +--------+--------+========+
    |  0xd4  |YYYYYYYY|  key  |
    +--------+--------+========+
    
    Z: lookup the previously assigned key
    +--------+--------+
    |  0xd5  |ZZZZZZZZ|
    +--------+--------+

this allows reused keys (i.e. for object serialization) to use up much less space. 

I.e. if you have a list of objects like {id:1,name:"test"} you will save 4 bytes per iteration (one from id, and 3 from name)


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

