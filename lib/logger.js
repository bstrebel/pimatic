/*
 * decaffeinate suggestions:
 * DS101: Remove unnecessary use of Array.from
 * DS102: Remove unnecessary code created because of implicit returns
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
/*
Logger
======


*/
let base;
const winston = require('winston');
const _ = require('lodash');
const events = require("events");
const util = require("util");
const moment = require("moment");
const colors = require("colors");

const TaggedConsoleTarget = function(options) {
  options = options || {};
  this.name = "taggedConsoleLogger";
  this.level = options.level || "info";
  this.target = options.target || process.stdout;
  this.colorize = options.colorize;
  this.prevTimestamp = new Date();
  let timeString = moment(this.prevTimestamp).format("HH:mm:ss.SSS YYYY-MM-DD dddd");
  if (this.colorize) { timeString = timeString.grey; }
  return this.target.write(timeString + "\n");
};

util.inherits(TaggedConsoleTarget, winston.Transport);
TaggedConsoleTarget.prototype.log = function(level, msg, meta, callback) {
  let header, timeString;
  const spec = {
    info: {},
    warn: {
      color: "yellow"
    },
    error: {
      color: "red"
    },
    debug: {
      color: "blue"
    }
  };
  const { color } = spec[level];
  meta = meta || {};
  let tags = meta.tags || [];
  const timestamp = meta.timestamp || new Date();
  if (moment(timestamp).format("YYYY-MM-DD") !== moment(this.prevTimestamp).format("YYYY-MM-DD")) {
    this.prevTimestamp = timestamp;
    timeString = moment(this.prevTimestamp).format("HH:mm:ss.SSS YYYY-MM-DD dddd");
    if (this.colorize) { timeString = timeString.grey; }
  }
  timeString = moment(timestamp).format("HH:mm:ss.SSS");
  tags = ` [${tags.join(", ")}]`;
  if (this.colorize) {
    timeString = timeString.grey;
    tags = tags.green;
    header = timeString + tags;
  } else {
    header = `${timeString}${tags} ${level}:`;
  }
  const { target } = this;

  msg.split("\n").forEach((line, index) => {
    let coloredLine = undefined;
    if (color && this.colorize) {
      coloredLine = line[color];
    } else {
      coloredLine = line;
    }
    let separator = [" ", ">"][(index === 0 ? 0 : 1)];
    if (this.colorize) { separator = separator.grey; }
    return target.write(header + separator + coloredLine + "\n");
  });

  return callback(null, true);
};

const TaggedLogger = function(target, tags, debug) {
  this.target = target;
  this.tags = tags || [];
  this.logDebug = debug;
  return this;
};

TaggedLogger.prototype.log = function(level, ...args) {
  const msg = util.format.apply(null, args);
  return this.target.log(level, msg, {timestamp: new Date(), tags: this.tags});
};

TaggedLogger.prototype.debug = function(...args) {
  const { level } = this.target;
  if (this.logDebug) { this.target.transports.taggedConsoleLogger.level = "debug"; }
  if ((args.length === 1) && (args[0] != null ? args[0].stack : undefined)) {
    this.log("debug", args[0].stack);
  } else {
    this.log("debug", ...Array.from(args));
  }
  return this.target.transports.taggedConsoleLogger.level = level;
};
TaggedLogger.prototype.info = function(...args) { return this.log("info", ...Array.from(args)); };
TaggedLogger.prototype.warn = function(...args) { return this.log("warn", ...Array.from(args)); };
TaggedLogger.prototype.error = function(...args) { return this.log("error", ...Array.from(args)); };

TaggedLogger.prototype.createSublogger = function(tags, debug) { 
  if (debug == null) { debug = false; }
  if (!Array.isArray(tags)) {
    tags = [tags];
  }
  const newTags = _.uniq(this.tags.concat(tags));
  return new TaggedLogger(this.target, newTags, debug);
};


const winstonLogger = new (winston.Logger)({
  transports: [
    new TaggedConsoleTarget({
      level: 'debug',
      colorize: (process.env['PIMATIC_DAEMONIZED'] == null)
      //timestamp: -> new Date().format 'YYYY-MM-DD hh:mm:ss'
    })
  ]
});

TaggedLogger.prototype.base = (base = new TaggedLogger(winstonLogger));
const logger = base.createSublogger("pimatic");
logger.winston = winstonLogger;
module.exports = logger;