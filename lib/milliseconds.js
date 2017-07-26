/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
/*
Milliseconds Helper
===================

Helpers for time to milliseconds parsing. 
*/

/*
From visionmedia / mocha converted to coffee-script
Orginal file: https://github.com/visionmedia/mocha/blob/master/lib/ms.js

License for this file:

(The MIT License)

Copyright (c) 2011-2013 TJ Holowaychuk <tj@vision-media.ca>

Permission is hereby granted, free of charge, to any person obtaining
a copy of this software and associated documentation files (the
'Software'), to deal in the Software without restriction, including
without limitation the rights to use, copy, modify, merge, publish,
distribute, sublicense, and/or sell copies of the Software, and to
permit persons to whom the Software is furnished to do so, subject to
the following conditions:

The above copyright notice and this permission notice shall be
included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED 'AS IS', WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT,
TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
*/

const s = 1000;
const m = s * 60;
const h = m * 60;
const d = h * 24;
const y = d * 365.25;

//Parse or format the given `val`.
const parse = function(str) {
  const match = /^((?:\d+)?\.?\d+) *(ms|seconds?|s|minutes?|m|hours?|h|days?|d|years?|y)?$/i.exec(str);
  if (!match) { return; }
  const n = parseFloat(match[1]);
  const type = (match[2] || "ms").toLowerCase();
  switch (type) {
    case "years": case "year": case "y":
      return n * y;
    case "days": case "day": case "d":
      return n * d;
    case "hours": case "hour": case "h":
      return n * h;
    case "minutes": case "minute": case "m":
      return n * m;
    case "seconds": case "second": case "s":
      return n * s;
    case "ms":
      return n;
  }
};


// Short format for `ms`.
const shortFormat = function(ms) {
  if (ms >= d) { return Math.round(ms / d) + "d"; }  
  if (ms >= h) { return Math.round(ms / h) + "h"; }  
  if (ms >= m) { return Math.round(ms / m) + "m"; }  
  if (ms >= s) { return Math.round(ms / s) + "s"; }  
  return ms + "ms";
};


// Long format for `ms`.
const longFormat = ms =>
  plural(ms, d, "day") || 
  plural(ms, h, "hour") || 
  plural(ms, m, "minute") || 
  plural(ms, s, "second") || 
  (ms + " ms")
;

// Pluralization helper.
var plural = function(ms, n, name) {
  if (ms < n) { return; }  
  if (ms < (n * 1.5)) { return Math.floor(ms / n) + " " + name; }  
  return Math.ceil(ms / n) + " " + name + "s";
};

module.exports.parse = parse;
module.exports.shortFormat = shortFormat;
module.exports.longFormat = longFormat;